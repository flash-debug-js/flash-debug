declare const FLASH_DEBUG_PROTOCOL_VERSION: 1;
declare const FLASH_DEBUG_SDK_NAME = "@flash-debug/logger";
declare const FLASH_DEBUG_SDK_VERSION = "0.1.0";
type FetchFunction = typeof globalThis.fetch;
type FlashDebugLogLevel = 'debug' | 'info' | 'warning' | 'error';
type FlashDebugLogType = string;
type FlashDebugContentFormat = 'json' | 'jsonc' | 'jsonl' | 'yaml' | 'ansi' | 'text';
interface FlashDebugLogRecord {
    id: string;
    timestamp: string;
    level: FlashDebugLogLevel;
    type: FlashDebugLogType;
    message: string;
    content?: string;
    contentFormat?: FlashDebugContentFormat;
    source: string;
    clientId?: string;
    tag?: string;
    deviceId?: string;
    sessionId?: string;
    error?: string;
    stackTrace?: string;
    errorInfo?: {
        name?: string;
        code?: string;
        message?: string;
        stack?: string;
    };
    attributes?: Record<string, unknown>;
}
interface FlashDebugLogInput {
    level: FlashDebugLogLevel;
    message: string;
    type?: FlashDebugLogType;
    content?: string;
    contentFormat?: FlashDebugContentFormat;
    tag?: string;
    attributes?: Record<string, unknown>;
    error?: unknown;
    stackTrace?: string;
}
interface FlashDebugSdkInfo {
    name: string;
    version: string;
}
interface FlashDebugLoggerOptions {
    baseUrl: string;
    clientId: string;
    source: string;
    token?: string;
    deviceId?: string;
    sessionId?: string;
    sdk?: Partial<FlashDebugSdkInfo>;
    batchSize?: number;
    flushIntervalMs?: number;
    queueLimit?: number;
    timeoutMs?: number;
    closeTimeoutMs?: number;
    maxRetries?: number;
    retryBaseMs?: number;
    retryMaxMs?: number;
    fetch?: FetchFunction;
    onError?: (error: unknown) => void;
    onDrop?: (records: readonly FlashDebugLogRecord[], error: unknown) => void;
    redact?: (record: FlashDebugLogRecord) => FlashDebugLogRecord;
}
interface FlashDebugLogger {
    log(input: FlashDebugLogInput): FlashDebugLogRecord;
    debug(message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>): FlashDebugLogRecord;
    info(message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>): FlashDebugLogRecord;
    warning(message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>): FlashDebugLogRecord;
    error(message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>): FlashDebugLogRecord;
    flush(): Promise<void>;
    close(): Promise<void>;
    readonly queueLength: number;
}
declare class FlashDebugUploadError extends Error {
    readonly statusCode?: number;
    readonly retryable: boolean;
    readonly responseBody?: string;
    constructor(message: string, options?: {
        statusCode?: number;
        retryable?: boolean;
        responseBody?: string;
    });
}
declare function createLogger(options: FlashDebugLoggerOptions): FlashDebugLogger;

export { FLASH_DEBUG_PROTOCOL_VERSION, FLASH_DEBUG_SDK_NAME, FLASH_DEBUG_SDK_VERSION, FlashDebugUploadError, createLogger };
export type { FlashDebugContentFormat, FlashDebugLogInput, FlashDebugLogLevel, FlashDebugLogRecord, FlashDebugLogType, FlashDebugLogger, FlashDebugLoggerOptions, FlashDebugSdkInfo };
