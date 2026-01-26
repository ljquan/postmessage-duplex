/**
 * Message validation utilities for ensuring type safety and security.
 * Validates incoming messages before processing to prevent injection attacks
 * and ensure data integrity.
 *
 * @module validators
 */

import { PostRequest, PostResponse, ReturnCode } from './interface'

/**
 * Internal channel message structure.
 * Extends PostRequest with sender identification.
 */
export interface ChannelMessage extends Partial<PostRequest>, Partial<PostResponse> {
  /** Sender's baseKey for point-to-point verification */
  _senderKey?: string
  /** Ready handshake message */
  msg?: string
  /** Timestamp */
  time?: number
}

/**
 * Result of message validation.
 */
export interface ValidationResult {
  /** Whether the message is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
  /** Validated and typed message (if valid) */
  message?: ChannelMessage
}

/**
 * Checks if a value is a plain object.
 * @param value - The value to check
 * @returns true if the value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks if a value is a valid string (non-empty).
 * @param value - The value to check
 * @returns true if the value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Checks if a value is a valid ReturnCode.
 * @param value - The value to check
 * @returns true if the value is a valid ReturnCode
 */
function isValidReturnCode(value: unknown): value is ReturnCode {
  return typeof value === 'number' && Object.values(ReturnCode).includes(value)
}

/**
 * Validates an incoming message from postMessage.
 * Performs type checking and structure validation.
 *
 * @param data - The raw message data from MessageEvent
 * @returns Validation result with typed message if valid
 *
 * @example
 * const result = validateMessage(event.data)
 * if (result.valid) {
 *   processMessage(result.message)
 * } else {
 *   console.warn('Invalid message:', result.error)
 * }
 */
export function validateMessage(data: unknown): ValidationResult {
  // Must be an object
  if (!isPlainObject(data)) {
    return {
      valid: false,
      error: 'Message must be an object'
    }
  }

  const message = data as ChannelMessage

  // Check for at least one identifying field
  const hasRequestId = 'requestId' in message
  const hasCmdname = 'cmdname' in message
  const hasMsg = 'msg' in message
  const hasRet = 'ret' in message

  if (!hasRequestId && !hasCmdname && !hasMsg) {
    return {
      valid: false,
      error: 'Message must have requestId, cmdname, or msg field'
    }
  }

  // Validate requestId if present
  if (hasRequestId && typeof message.requestId !== 'string') {
    return {
      valid: false,
      error: 'requestId must be a string'
    }
  }

  // Validate cmdname if present
  if (hasCmdname && typeof message.cmdname !== 'string') {
    return {
      valid: false,
      error: 'cmdname must be a string'
    }
  }

  // Validate msg if present
  if (hasMsg && typeof message.msg !== 'string') {
    return {
      valid: false,
      error: 'msg must be a string'
    }
  }

  // Validate ret if present (response message)
  if (hasRet && !isValidReturnCode(message.ret)) {
    return {
      valid: false,
      error: 'ret must be a valid ReturnCode'
    }
  }

  // Validate data if present
  if ('data' in message && message.data !== undefined && !isPlainObject(message.data)) {
    return {
      valid: false,
      error: 'data must be an object'
    }
  }

  // Validate _senderKey if present
  if ('_senderKey' in message && message._senderKey !== undefined) {
    if (typeof message._senderKey !== 'string') {
      return {
        valid: false,
        error: '_senderKey must be a string'
      }
    }
  }

  // Validate time if present
  if ('time' in message && message.time !== undefined) {
    if (typeof message.time !== 'number' || !Number.isFinite(message.time)) {
      return {
        valid: false,
        error: 'time must be a finite number'
      }
    }
  }

  return {
    valid: true,
    message
  }
}

/**
 * Validates a request message structure.
 * More strict validation for outgoing requests.
 *
 * @param data - The request data to validate
 * @returns Validation result
 */
export function validateRequest(data: unknown): ValidationResult {
  const baseResult = validateMessage(data)
  if (!baseResult.valid) {
    return baseResult
  }

  const message = baseResult.message!

  // Request must have requestId and cmdname
  if (!isNonEmptyString(message.requestId)) {
    return {
      valid: false,
      error: 'Request must have a non-empty requestId'
    }
  }

  if (!isNonEmptyString(message.cmdname)) {
    return {
      valid: false,
      error: 'Request must have a non-empty cmdname'
    }
  }

  return baseResult
}

/**
 * Validates a response message structure.
 *
 * @param data - The response data to validate
 * @returns Validation result
 */
export function validateResponse(data: unknown): ValidationResult {
  const baseResult = validateMessage(data)
  if (!baseResult.valid) {
    return baseResult
  }

  const message = baseResult.message!

  // Response must have ret
  if (!('ret' in message)) {
    return {
      valid: false,
      error: 'Response must have a ret field'
    }
  }

  return baseResult
}

/**
 * Checks if a message is a response (has ret field).
 * @param message - The message to check
 * @returns true if the message is a response
 */
export function isResponseMessage(message: ChannelMessage): boolean {
  return 'ret' in message && typeof message.ret === 'number'
}

/**
 * Checks if a message is a ready handshake message.
 * @param message - The message to check
 * @returns true if the message is a ready message
 */
export function isReadyMessage(message: ChannelMessage): boolean {
  return message.msg === 'ready'
}

/**
 * Sanitizes message data by removing potentially dangerous fields.
 * Use this for logging or debugging to prevent prototype pollution.
 *
 * @param message - The message to sanitize
 * @returns A safe copy of the message
 */
export function sanitizeForLogging(message: ChannelMessage): Record<string, unknown> {
  const safe: Record<string, unknown> = {}

  // Only copy known safe fields
  const safeFields = ['requestId', 'cmdname', 'ret', 'msg', 'time', '_senderKey']

  for (const field of safeFields) {
    if (field in message) {
      safe[field] = (message as Record<string, unknown>)[field]
    }
  }

  // Stringify data to prevent object reference issues
  if ('data' in message && message.data !== undefined) {
    try {
      safe.data = JSON.parse(JSON.stringify(message.data))
    } catch {
      safe.data = '[Unserializable data]'
    }
  }

  return safe
}

/**
 * Estimates the byte size of a message after JSON serialization.
 * Uses a faster estimation than full serialization when possible.
 *
 * @param data - The data to estimate size for
 * @returns Estimated size in bytes
 */
export function estimateMessageSize(data: unknown): number {
  try {
    // Use Blob for accurate byte size (handles Unicode properly)
    const json = JSON.stringify(data)
    if (typeof Blob !== 'undefined') {
      return new Blob([json]).size
    }
    // Fallback for environments without Blob (approximate)
    return json.length * 2 // Rough estimate for UTF-16
  } catch {
    return Infinity // Can't serialize = too large
  }
}

export default {
  validateMessage,
  validateRequest,
  validateResponse,
  isResponseMessage,
  isReadyMessage,
  sanitizeForLogging,
  estimateMessageSize
}
