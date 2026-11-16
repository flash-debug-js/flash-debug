const FLASH_DEBUG_PROTOCOL_VERSION = 1;
const FLASH_DEBUG_SDK_NAME = "@flash-debug/logger";
const FLASH_DEBUG_SDK_VERSION = "0.1.0";
class FlashDebugUploadError extends Error {
  statusCode;
  retryable;
  responseBody;
  constructor(message, options = {}) {
    super(message);
    this.name = "FlashDebugUploadError";
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.responseBody = options.responseBody;
  }
}
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 250;
const DEFAULT_QUEUE_LIMIT = 1e3;
const DEFAULT_TIMEOUT_MS = 5e3;
const DEFAULT_CLOSE_TIMEOUT_MS = 5e3;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_RETRY_MAX_MS = 1e4;
const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|password|secret|token|appkey|accesskey|privatekey|set-cookie)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_TEXT_PATTERN = /(authorization|cookie|password|secret|token|appKey|accessKey)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi;
function createLogger(options) {
  return new FlashDebugLoggerImpl(options);
}
class FlashDebugLoggerImpl {
  endpoint;
  clientId;
  source;
  token;
  deviceId;
  sessionId;
  sdk;
  batchSize;
  flushIntervalMs;
  queueLimit;
  timeoutMs;
  closeTimeoutMs;
  maxRetries;
  retryBaseMs;
  retryMaxMs;
  request;
  onError;
  onDrop;
  customRedact;
  queue = [];
  flushTimer;
  flushPromise;
  closed = false;
  constructor(options) {
    const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("Flash Debug baseUrl is required");
    }
    if (!options.clientId.trim()) {
      throw new Error("Flash Debug clientId is required");
    }
    if (!options.source.trim()) {
      throw new Error("Flash Debug source is required");
    }
    this.endpoint = `${baseUrl}/api/v1/logs/batch`;
    this.clientId = options.clientId.trim();
    this.source = options.source.trim();
    this.token = options.token?.trim() || void 0;
    this.deviceId = options.deviceId?.trim() || void 0;
    this.sessionId = options.sessionId?.trim() || void 0;
    this.sdk = {
      name: options.sdk?.name?.trim() || FLASH_DEBUG_SDK_NAME,
      version: options.sdk?.version?.trim() || FLASH_DEBUG_SDK_VERSION
    };
    this.batchSize = positiveInteger(options.batchSize, DEFAULT_BATCH_SIZE);
    this.flushIntervalMs = nonNegativeInteger(options.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS);
    this.queueLimit = positiveInteger(options.queueLimit, DEFAULT_QUEUE_LIMIT);
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.closeTimeoutMs = positiveInteger(options.closeTimeoutMs, DEFAULT_CLOSE_TIMEOUT_MS);
    this.maxRetries = nonNegativeInteger(options.maxRetries, DEFAULT_MAX_RETRIES);
    this.retryBaseMs = positiveInteger(options.retryBaseMs, DEFAULT_RETRY_BASE_MS);
    this.retryMaxMs = positiveInteger(options.retryMaxMs, DEFAULT_RETRY_MAX_MS);
    this.request = options.fetch ?? globalThis.fetch;
    if (typeof this.request !== "function") {
      throw new Error("Flash Debug logger requires a fetch implementation");
    }
    this.onError = options.onError;
    this.onDrop = options.onDrop;
    this.customRedact = options.redact;
  }
  get queueLength() {
    return this.queue.length;
  }
  log(input) {
    if (this.closed) {
      throw new Error("Flash Debug logger is closed");
    }
    const record = this.redact({
      id: createEventId(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: input.level,
      type: input.type ?? "log",
      source: this.source,
      clientId: this.clientId,
      message: input.message,
      ...input.content !== void 0 ? { content: input.content } : {},
      ...input.contentFormat !== void 0 ? { contentFormat: input.contentFormat } : {},
      ...input.tag ? { tag: input.tag } : {},
      ...this.deviceId ? { deviceId: this.deviceId } : {},
      ...this.sessionId ? { sessionId: this.sessionId } : {},
      ...input.attributes ? { attributes: input.attributes } : {},
      ...normalizeError(input.error, input.stackTrace)
    });
    this.enqueue(record);
    return record;
  }
  debug(message, options = {}) {
    return this.log({ ...options, level: "debug", message });
  }
  info(message, options = {}) {
    return this.log({ ...options, level: "info", message });
  }
  warning(message, options = {}) {
    return this.log({ ...options, level: "warning", message });
  }
  error(message, options = {}) {
    return this.log({ ...options, level: "error", message });
  }
  flush() {
    if (this.flushPromise) {
      return this.flushPromise;
    }
    this.clearFlushTimer();
    const promise = this.flushQueue().finally(() => {
      this.flushPromise = void 0;
    });
    this.flushPromise = promise;
    return promise;
  }
  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.clearFlushTimer();
    try {
      await withTimeout(this.flush(), this.closeTimeoutMs);
    } catch (error) {
      this.onError?.(error);
    } finally {
      this.queue.length = 0;
    }
  }
  enqueue(record) {
    this.queue.push(record);
    while (this.queue.length > this.queueLimit) {
      const dropped = this.queue.shift();
      if (dropped) {
        const error = new Error(`Flash Debug logger queue limit exceeded (${this.queueLimit})`);
        this.onDrop?.([dropped], error);
      }
    }
    if (this.queue.length >= this.batchSize) {
      void this.flush().catch((error) => this.onError?.(error));
      return;
    }
    this.scheduleFlush();
  }
  async flushQueue() {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      try {
        await this.sendBatch(batch);
      } catch (error) {
        this.onDrop?.(batch, error);
        throw error;
      }
    }
  }
  async sendBatch(batch) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.sendRequest(batch);
        if (response.ok) {
          return;
        }
        const error = await createUploadError(response);
        if (!error.retryable || attempt >= this.maxRetries) {
          throw error;
        }
        await sleep(retryDelay(attempt, this.retryBaseMs, this.retryMaxMs, response));
      } catch (error) {
        if (error instanceof FlashDebugUploadError && !error.retryable) {
          throw error;
        }
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await sleep(retryDelay(attempt, this.retryBaseMs, this.retryMaxMs));
      }
    }
  }
  async sendRequest(batch) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = {
      "content-type": "application/json"
    };
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    const body = {
      protocolVersion: FLASH_DEBUG_PROTOCOL_VERSION,
      clientId: this.clientId,
      sdk: this.sdk,
      items: batch
    };
    try {
      return await this.request(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  redact(record) {
    const redacted = redactValue(record);
    if (!this.customRedact) {
      return redacted;
    }
    try {
      return this.customRedact(redacted);
    } catch (error) {
      this.onError?.(error);
      return redacted;
    }
  }
  scheduleFlush() {
    if (this.flushTimer || this.flushIntervalMs === 0) {
      if (this.flushIntervalMs === 0) {
        void this.flush().catch((error) => this.onError?.(error));
      }
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = void 0;
      void this.flush().catch((error) => this.onError?.(error));
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
  }
  clearFlushTimer() {
    if (!this.flushTimer) {
      return;
    }
    clearTimeout(this.flushTimer);
    this.flushTimer = void 0;
  }
}
async function createUploadError(response) {
  const responseBody = typeof response.text === "function" ? await response.text().catch(() => "") : "";
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  return new FlashDebugUploadError(
    `Flash Debug upload failed with HTTP ${response.status}`,
    {
      statusCode: response.status,
      retryable,
      responseBody: responseBody || void 0
    }
  );
}
function normalizeError(error, stackTrace) {
  if (error === void 0 && stackTrace === void 0) {
    return {};
  }
  if (error instanceof Error) {
    return {
      error: error.message,
      stackTrace: stackTrace ?? error.stack,
      errorInfo: {
        name: error.name,
        ...readErrorCode(error) ? { code: readErrorCode(error) } : {},
        message: error.message,
        ...error.stack ? { stack: error.stack } : {}
      }
    };
  }
  return {
    ...error !== void 0 ? { error: typeof error === "string" ? error : safeStringify(error) } : {},
    ...stackTrace !== void 0 ? { stackTrace } : {}
  };
}
function readErrorCode(error) {
  const code = error.code;
  return typeof code === "string" || typeof code === "number" ? String(code) : void 0;
}
function redactValue(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactValue(entry, seen);
  }
  return result;
}
function redactText(value) {
  return value.replace(BEARER_PATTERN, "Bearer [REDACTED]").replace(SENSITIVE_TEXT_PATTERN, "$1=[REDACTED]");
}
function safeStringify(value) {
  const redacted = redactValue(value);
  try {
    return JSON.stringify(redacted);
  } catch {
    return String(value);
  }
}
function createEventId() {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") {
    return randomUUID.call(globalThis.crypto);
  }
  return `fd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function positiveInteger(value, fallback) {
  return Number.isFinite(value) && value !== void 0 && value > 0 ? Math.floor(value) : fallback;
}
function nonNegativeInteger(value, fallback) {
  return Number.isFinite(value) && value !== void 0 && value >= 0 ? Math.floor(value) : fallback;
}
function retryDelay(attempt, baseMs, maxMs, response) {
  const retryAfter = response ? parseRetryAfter(response.headers.get("retry-after")) : void 0;
  if (retryAfter !== void 0) {
    return Math.min(maxMs, retryAfter);
  }
  const exponential = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(exponential * (0.5 + Math.random()));
}
function parseRetryAfter(value) {
  if (!value) {
    return void 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1e3);
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? void 0 : Math.max(0, timestamp - Date.now());
}
function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function withTimeout(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Flash Debug close timed out after ${milliseconds}ms`)), milliseconds);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export { FLASH_DEBUG_PROTOCOL_VERSION, FLASH_DEBUG_SDK_NAME, FLASH_DEBUG_SDK_VERSION, FlashDebugUploadError, createLogger };
