import { DebugContentFormat, DebugLogLevel, DebugLogRecord, DebugLogType } from "@flash-debug/types";
export declare const FLASH_DEBUG_SDK_VERSION: string;
export declare const FLASH_DEBUG_PROTOCOL_VERSION: 1;
export declare const FLASH_DEBUG_SDK_NAME = "@flash-debug/logger";
type FetchFunction = typeof globalThis.fetch;
export type FlashDebugLogLevel = DebugLogLevel;
export type FlashDebugLogType = DebugLogType;
export type FlashDebugContentFormat = DebugContentFormat;
export type FlashDebugLogRecord = DebugLogRecord;
export interface FlashDebugLogInput {
  level: FlashDebugLogLevel;
  message: string;
  type?: FlashDebugLogType;
  content?: string;
  contentFormat?: FlashDebugContentFormat;
  metadata?: Record<string, unknown>;
  tag?: string;
  attributes?: Record<string, unknown>;
  error?: unknown;
  stackTrace?: string;
}
export interface FlashDebugSdkInfo {
  name: string;
  version: string;
}
export interface FlashDebugLoggerOptions {
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
export interface FlashDebugLogger {
  log: (input: FlashDebugLogInput) => FlashDebugLogRecord;
  debug: (message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>) => FlashDebugLogRecord;
  info: (message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>) => FlashDebugLogRecord;
  warning: (message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>) => FlashDebugLogRecord;
  error: (message: string, options?: Omit<FlashDebugLogInput, 'level' | 'message'>) => FlashDebugLogRecord;
  flush: () => Promise<void>;
  close: () => Promise<void>;
  readonly queueLength: number;
}
export declare class FlashDebugUploadError extends Error {
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly responseBody?: string;
  constructor(message: string, options?: {
    statusCode?: number;
    retryable?: boolean;
    responseBody?: string;
  });
}
export declare function createLogger(options: FlashDebugLoggerOptions): FlashDebugLogger;
export {};