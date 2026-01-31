/**
 * Tests for message validators
 */
import {
  validateMessage,
  validateRequest,
  validateResponse,
  isResponseMessage,
  isReadyMessage,
  isBroadcastMessage,
  sanitizeForLogging,
  estimateMessageSize,
  ChannelMessage
} from '../src/validators'
import { ReturnCode } from '../src/interface'

describe('validators', () => {
  describe('validateMessage', () => {
    it('should reject non-object values', () => {
      expect(validateMessage(null).valid).toBe(false)
      expect(validateMessage(undefined).valid).toBe(false)
      expect(validateMessage('string').valid).toBe(false)
      expect(validateMessage(123).valid).toBe(false)
      expect(validateMessage([]).valid).toBe(false)
    })

    it('should require requestId, cmdname, or msg field', () => {
      const result = validateMessage({})
      expect(result.valid).toBe(false)
      expect(result.error).toContain('requestId')
    })

    it('should accept message with requestId', () => {
      const result = validateMessage({ requestId: 'test-123' })
      expect(result.valid).toBe(true)
    })

    it('should accept message with cmdname', () => {
      const result = validateMessage({ cmdname: 'test' })
      expect(result.valid).toBe(true)
    })

    it('should accept message with msg', () => {
      const result = validateMessage({ msg: 'ready' })
      expect(result.valid).toBe(true)
    })

    it('should validate requestId type', () => {
      const result = validateMessage({ requestId: 123 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('requestId must be a string')
    })

    it('should validate cmdname type', () => {
      const result = validateMessage({ cmdname: 123 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('cmdname must be a string')
    })

    it('should validate msg type', () => {
      const result = validateMessage({ msg: 123 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('msg must be a string')
    })

    it('should validate ret as valid ReturnCode', () => {
      expect(validateMessage({ requestId: 'test', ret: 0 }).valid).toBe(true)
      expect(validateMessage({ requestId: 'test', ret: -99 }).valid).toBe(true)
      expect(validateMessage({ requestId: 'test', ret: 'invalid' }).valid).toBe(false)
    })

    it('should validate data as object', () => {
      expect(validateMessage({ requestId: 'test', data: {} }).valid).toBe(true)
      expect(validateMessage({ requestId: 'test', data: { foo: 'bar' } }).valid).toBe(true)
      expect(validateMessage({ requestId: 'test', data: 'string' }).valid).toBe(false)
      expect(validateMessage({ requestId: 'test', data: [] }).valid).toBe(false)
    })

    it('should validate _senderKey type', () => {
      expect(validateMessage({ requestId: 'test', _senderKey: 'key' }).valid).toBe(true)
      expect(validateMessage({ requestId: 'test', _senderKey: 123 }).valid).toBe(false)
    })

    it('should validate time as finite number', () => {
      expect(validateMessage({ requestId: 'test', time: 123456789 }).valid).toBe(true)
      expect(validateMessage({ requestId: 'test', time: 'string' }).valid).toBe(false)
      expect(validateMessage({ requestId: 'test', time: Infinity }).valid).toBe(false)
      expect(validateMessage({ requestId: 'test', time: NaN }).valid).toBe(false)
    })

    it('should return the validated message on success', () => {
      const message = { requestId: 'test', cmdname: 'ping', data: { value: 1 } }
      const result = validateMessage(message)
      
      expect(result.valid).toBe(true)
      expect(result.message).toEqual(message)
    })
  })

  describe('validateRequest', () => {
    it('should require non-empty requestId', () => {
      expect(validateRequest({ requestId: '' }).valid).toBe(false)
      expect(validateRequest({ requestId: 'test' }).valid).toBe(false) // also needs cmdname
    })

    it('should require non-empty cmdname', () => {
      expect(validateRequest({ requestId: 'test', cmdname: '' }).valid).toBe(false)
    })

    it('should accept valid request', () => {
      const result = validateRequest({ requestId: 'test-123', cmdname: 'ping' })
      expect(result.valid).toBe(true)
    })
  })

  describe('validateResponse', () => {
    it('should require ret field', () => {
      const result = validateResponse({ requestId: 'test' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('ret field')
    })

    it('should accept valid response', () => {
      const result = validateResponse({ requestId: 'test', ret: ReturnCode.Success })
      expect(result.valid).toBe(true)
    })

    it('should accept response with data', () => {
      const result = validateResponse({ 
        requestId: 'test', 
        ret: ReturnCode.Success,
        data: { result: 'value' }
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('isResponseMessage', () => {
    it('should return true for messages with ret', () => {
      expect(isResponseMessage({ ret: 0 })).toBe(true)
      expect(isResponseMessage({ ret: -1, data: {} })).toBe(true)
      expect(isResponseMessage({ requestId: 'test', ret: 0 })).toBe(true)
    })

    it('should return false for messages without ret', () => {
      expect(isResponseMessage({ cmdname: 'test' })).toBe(false)
      expect(isResponseMessage({ msg: 'ready' })).toBe(false)
      expect(isResponseMessage({ requestId: 'test' })).toBe(false)
    })

    it('should return false for non-number ret', () => {
      expect(isResponseMessage({ ret: 'string' as any })).toBe(false)
    })
  })

  describe('isReadyMessage', () => {
    it('should return true for ready messages', () => {
      expect(isReadyMessage({ msg: 'ready' })).toBe(true)
      expect(isReadyMessage({ msg: 'ready', _senderKey: 'key' })).toBe(true)
    })

    it('should return false for non-ready messages', () => {
      expect(isReadyMessage({ msg: 'other' })).toBe(false)
      expect(isReadyMessage({ cmdname: 'test' })).toBe(false)
      expect(isReadyMessage({})).toBe(false)
    })
  })

  describe('isBroadcastMessage', () => {
    it('should return true for broadcast messages', () => {
      expect(isBroadcastMessage({ _broadcast: true, cmdname: 'event' })).toBe(true)
      expect(isBroadcastMessage({ _broadcast: true, cmdname: 'notify', data: {} })).toBe(true)
    })

    it('should return false without _broadcast flag', () => {
      expect(isBroadcastMessage({ cmdname: 'event' })).toBe(false)
    })

    it('should return false without cmdname', () => {
      expect(isBroadcastMessage({ _broadcast: true })).toBe(false)
    })

    it('should return false for non-boolean _broadcast', () => {
      expect(isBroadcastMessage({ _broadcast: 1 as any, cmdname: 'event' })).toBe(false)
      expect(isBroadcastMessage({ _broadcast: 'true' as any, cmdname: 'event' })).toBe(false)
    })
  })

  describe('sanitizeForLogging', () => {
    it('should include standard fields', () => {
      const message: ChannelMessage = {
        requestId: 'test-123',
        cmdname: 'ping',
        ret: 0,
        msg: 'ready',
        time: 12345,
        _senderKey: 'key'
      }
      
      const sanitized = sanitizeForLogging(message)
      
      expect(sanitized.requestId).toBe('test-123')
      expect(sanitized.cmdname).toBe('ping')
      expect(sanitized.ret).toBe(0)
      expect(sanitized.msg).toBe('ready')
      expect(sanitized.time).toBe(12345)
      expect(sanitized._senderKey).toBe('key')
    })

    it('should serialize data safely', () => {
      const message: ChannelMessage = {
        requestId: 'test',
        data: { nested: { value: 123 } }
      }
      
      const sanitized = sanitizeForLogging(message)
      
      expect(sanitized.data).toEqual({ nested: { value: 123 } })
    })

    it('should handle non-serializable data', () => {
      const circular: any = { a: 1 }
      circular.self = circular
      
      const message: ChannelMessage = {
        requestId: 'test',
        data: circular
      }
      
      const sanitized = sanitizeForLogging(message)
      
      expect(sanitized.data).toBe('[Unserializable]')
    })

    it('should exclude undefined fields', () => {
      const message: ChannelMessage = {
        requestId: 'test'
      }
      
      const sanitized = sanitizeForLogging(message)
      
      expect(sanitized).toEqual({ requestId: 'test' })
      expect('cmdname' in sanitized).toBe(false)
      expect('ret' in sanitized).toBe(false)
    })
  })

  describe('estimateMessageSize', () => {
    it('should return size for simple objects', () => {
      const data = { foo: 'bar' }
      const size = estimateMessageSize(data)
      
      // Size should be roughly the JSON length * 2 (for UTF-16) or actual Blob size
      expect(size).toBeGreaterThan(0)
      expect(size).toBeLessThan(1000)
    })

    it('should return larger size for larger objects', () => {
      const small = { a: 1 }
      const large = { data: 'x'.repeat(1000) }
      
      const smallSize = estimateMessageSize(small)
      const largeSize = estimateMessageSize(large)
      
      expect(largeSize).toBeGreaterThan(smallSize)
    })

    it('should return Infinity for non-serializable objects', () => {
      const circular: any = {}
      circular.self = circular
      
      const size = estimateMessageSize(circular)
      
      expect(size).toBe(Infinity)
    })

    it('should handle null and undefined', () => {
      // null serializes to "null" (4 chars)
      expect(estimateMessageSize(null)).toBeGreaterThan(0)
      // undefined serializes to undefined (the value), which becomes "undefined" when stringified
      // JSON.stringify(undefined) returns undefined (not a string), so it handles gracefully
      const undefinedSize = estimateMessageSize(undefined)
      expect(undefinedSize).toBeGreaterThanOrEqual(0)
    })
  })
})
