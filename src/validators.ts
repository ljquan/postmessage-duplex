/**
 * Message validation utilities for ensuring type safety and security.
 * Validates incoming messages before processing to prevent injection attacks
 * and ensure data integrity.
 *
 * @module validators
 */

import { PostRequest, PostResponse, ReturnCode } from './interface'
import { safeSerialize } from './utils'

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
  /** Indicates this is a broadcast message (no response expected) */
  _broadcast?: boolean
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

const fail = (e: string): ValidationResult => ({ valid: false, error: e })

export function validateMessage(data: unknown): ValidationResult {
  if (!isPlainObject(data)) return fail('Message must be an object')

  const m = data as ChannelMessage
  const hasReqId = 'requestId' in m, hasCmd = 'cmdname' in m, hasMsg = 'msg' in m, hasRet = 'ret' in m

  if (!hasReqId && !hasCmd && !hasMsg) return fail('Message must have requestId, cmdname, or msg field')
  if (hasReqId && typeof m.requestId !== 'string') return fail('requestId must be a string')
  if (hasCmd && typeof m.cmdname !== 'string') return fail('cmdname must be a string')
  if (hasMsg && typeof m.msg !== 'string') return fail('msg must be a string')
  if (hasRet && !isValidReturnCode(m.ret)) return fail('ret must be a valid ReturnCode')
  if ('data' in m && m.data !== undefined && !isPlainObject(m.data)) return fail('data must be an object')
  if ('_senderKey' in m && m._senderKey !== undefined && typeof m._senderKey !== 'string') return fail('_senderKey must be a string')
  if ('time' in m && m.time !== undefined && (typeof m.time !== 'number' || !Number.isFinite(m.time))) return fail('time must be a finite number')

  return { valid: true, message: m }
}

export function validateRequest(data: unknown): ValidationResult {
  const r = validateMessage(data)
  if (!r.valid) return r
  if (!isNonEmptyString(r.message!.requestId)) return fail('Request must have a non-empty requestId')
  if (!isNonEmptyString(r.message!.cmdname)) return fail('Request must have a non-empty cmdname')
  return r
}

export function validateResponse(data: unknown): ValidationResult {
  const r = validateMessage(data)
  if (!r.valid) return r
  if (!('ret' in r.message!)) return fail('Response must have a ret field')
  return r
}

export function isResponseMessage(m: ChannelMessage): boolean {
  return 'ret' in m && typeof m.ret === 'number'
}

export function isReadyMessage(m: ChannelMessage): boolean {
  return m.msg === 'ready'
}

export function isBroadcastMessage(m: ChannelMessage): boolean {
  return m._broadcast === true && typeof m.cmdname === 'string'
}

export function sanitizeForLogging(m: ChannelMessage): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  for (const f of ['requestId', 'cmdname', 'ret', 'msg', 'time', '_senderKey']) {
    if (f in m) safe[f] = (m as Record<string, unknown>)[f]
  }
  if ('data' in m && m.data !== undefined) {
    safe.data = safeSerialize(m.data)
  }
  return safe
}

export function estimateMessageSize(data: unknown): number {
  try {
    const json = JSON.stringify(data)
    return typeof Blob !== 'undefined' ? new Blob([json]).size : json.length * 2
  } catch { return Infinity }
}

export default {
  validateMessage,
  validateRequest,
  validateResponse,
  isResponseMessage,
  isReadyMessage,
  isBroadcastMessage,
  sanitizeForLogging,
  estimateMessageSize
}
