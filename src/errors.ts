/**
 * Error codes for channel operations.
 * Use these codes to programmatically handle specific error types.
 * @enum {string}
 */
export enum ErrorCode {
  /** Channel has been destroyed */
  ConnectionDestroyed = 'CONNECTION_DESTROYED',
  /** Connection timed out before establishing */
  ConnectionTimeout = 'CONNECTION_TIMEOUT',
  /** Individual method call timed out */
  MethodCallTimeout = 'METHOD_CALL_TIMEOUT',
  /** No handler registered for the method */
  MethodNotFound = 'METHOD_NOT_FOUND',
  /** Failed to send message */
  TransmissionFailed = 'TRANSMISSION_FAILED',
  /** Message size exceeded limit */
  MessageSizeExceeded = 'MESSAGE_SIZE_EXCEEDED',
  /** Rate limit exceeded */
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  /** Handler threw an error */
  HandlerError = 'HANDLER_ERROR',
  /** Invalid message format */
  InvalidMessage = 'INVALID_MESSAGE',
  /** Origin validation failed */
  OriginMismatch = 'ORIGIN_MISMATCH'
}

/**
 * Custom error class for channel-related errors.
 * Provides structured error information with error codes for programmatic handling.
 * 
 * @class ChannelError
 * @extends Error
 * 
 * @example
 * try {
 *   await channel.publish('getData')
 * } catch (e) {
 *   if (e instanceof ChannelError) {
 *     switch (e.code) {
 *       case ErrorCode.MethodCallTimeout:
 *         console.log('Request timed out')
 *         break
 *       case ErrorCode.ConnectionDestroyed:
 *         console.log('Channel was destroyed')
 *         break
 *     }
 *   }
 * }
 */
export class ChannelError extends Error {
  /** Error code for programmatic handling */
  readonly code: ErrorCode

  /** Optional additional data about the error */
  readonly details?: Record<string, any>

  /**
   * Creates a new ChannelError.
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param details - Optional additional error details
   */
  constructor(message: string, code: ErrorCode, details?: Record<string, any>) {
    super(message)
    this.name = 'ChannelError'
    this.code = code
    this.details = details

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ChannelError)
    }
  }

  /**
   * Creates a JSON representation of the error.
   * @returns Object containing error information
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack
    }
  }
}

/**
 * Creates a ChannelError for connection destroyed scenario.
 * @param requestId - Optional request ID that was pending
 * @returns ChannelError with CONNECTION_DESTROYED code
 */
export function createConnectionDestroyedError(requestId?: string): ChannelError {
  return new ChannelError(
    'Channel has been destroyed',
    ErrorCode.ConnectionDestroyed,
    requestId ? { requestId } : undefined
  )
}

/**
 * Creates a ChannelError for method call timeout.
 * @param cmdname - The command that timed out
 * @param timeout - The timeout duration in ms
 * @returns ChannelError with METHOD_CALL_TIMEOUT code
 */
export function createTimeoutError(cmdname: string, timeout: number): ChannelError {
  return new ChannelError(
    `Request "${cmdname}" timed out after ${timeout}ms`,
    ErrorCode.MethodCallTimeout,
    { cmdname, timeout }
  )
}

/**
 * Creates a ChannelError for handler errors.
 * @param cmdname - The command whose handler threw
 * @param originalError - The original error thrown by handler
 * @returns ChannelError with HANDLER_ERROR code
 */
export function createHandlerError(cmdname: string, originalError: Error): ChannelError {
  return new ChannelError(
    originalError.message || `Handler for "${cmdname}" threw an error`,
    ErrorCode.HandlerError,
    { cmdname, originalError: originalError.message, stack: originalError.stack }
  )
}
