/**
 * Tests for ChannelEventEmitter
 */
import { ChannelEventEmitter, ChannelEventMap } from '../src/event-emitter'

// Create a testable subclass that exposes protected methods
class TestableEventEmitter extends ChannelEventEmitter {
  public testEmit<E extends keyof ChannelEventMap>(event: E, data: ChannelEventMap[E]): void {
    this.emit(event, data)
  }

  public testDestroyEventEmitter(): void {
    this.destroyEventEmitter()
  }
}

describe('ChannelEventEmitter', () => {
  let emitter: TestableEventEmitter

  beforeEach(() => {
    emitter = new TestableEventEmitter()
  })

  describe('on', () => {
    it('should register an event handler', () => {
      const handler = jest.fn()
      emitter.on('ready', handler)
      
      expect(emitter.hasListeners('ready')).toBe(true)
      expect(emitter.listenerCount('ready')).toBe(1)
    })

    it('should call handler when event is emitted', () => {
      const handler = jest.fn()
      emitter.on('ready', handler)
      
      emitter.testEmit('ready', { peerKey: 'test-key' })
      
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ peerKey: 'test-key' })
    })

    it('should support multiple handlers for same event', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      
      emitter.on('ready', handler1)
      emitter.on('ready', handler2)
      
      emitter.testEmit('ready', { peerKey: 'test' })
      
      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('should return unsubscribe function', () => {
      const handler = jest.fn()
      const unsubscribe = emitter.on('ready', handler)
      
      emitter.testEmit('ready', { peerKey: 'test1' })
      expect(handler).toHaveBeenCalledTimes(1)
      
      unsubscribe()
      
      emitter.testEmit('ready', { peerKey: 'test2' })
      expect(handler).toHaveBeenCalledTimes(1) // Still 1, not called again
    })

    it('should handle different event types', () => {
      const readyHandler = jest.fn()
      const errorHandler = jest.fn()
      const timeoutHandler = jest.fn()
      
      emitter.on('ready', readyHandler)
      emitter.on('error', errorHandler)
      emitter.on('timeout', timeoutHandler)
      
      emitter.testEmit('ready', { peerKey: 'key' })
      emitter.testEmit('error', { error: new Error('test') })
      emitter.testEmit('timeout', { requestId: 'req1', cmdname: 'test', timeoutMs: 5000 })
      
      expect(readyHandler).toHaveBeenCalledTimes(1)
      expect(errorHandler).toHaveBeenCalledTimes(1)
      expect(timeoutHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe('once', () => {
    it('should call handler only once', () => {
      const handler = jest.fn()
      emitter.once('ready', handler)
      
      emitter.testEmit('ready', { peerKey: 'test1' })
      emitter.testEmit('ready', { peerKey: 'test2' })
      emitter.testEmit('ready', { peerKey: 'test3' })
      
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({ peerKey: 'test1' })
    })

    it('should remove handler after first call', () => {
      const handler = jest.fn()
      emitter.once('ready', handler)
      
      expect(emitter.listenerCount('ready')).toBe(1)
      
      emitter.testEmit('ready', { peerKey: 'test' })
      
      expect(emitter.listenerCount('ready')).toBe(0)
    })

    it('should return unsubscribe function', () => {
      const handler = jest.fn()
      const unsubscribe = emitter.once('ready', handler)
      
      unsubscribe()
      
      emitter.testEmit('ready', { peerKey: 'test' })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('off', () => {
    it('should remove a specific handler', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      
      emitter.on('ready', handler1)
      emitter.on('ready', handler2)
      
      emitter.off('ready', handler1)
      
      emitter.testEmit('ready', { peerKey: 'test' })
      
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should return true when handler is removed', () => {
      const handler = jest.fn()
      emitter.on('ready', handler)
      
      expect(emitter.off('ready', handler)).toBe(true)
    })

    it('should return false when handler not found', () => {
      const handler = jest.fn()
      
      expect(emitter.off('ready', handler)).toBe(false)
    })

    it('should clean up empty handler sets', () => {
      const handler = jest.fn()
      emitter.on('ready', handler)
      
      emitter.off('ready', handler)
      
      expect(emitter.hasListeners('ready')).toBe(false)
    })
  })

  describe('offAll', () => {
    it('should remove all handlers for specific event', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      const errorHandler = jest.fn()
      
      emitter.on('ready', handler1)
      emitter.on('ready', handler2)
      emitter.on('error', errorHandler)
      
      emitter.offAll('ready')
      
      expect(emitter.hasListeners('ready')).toBe(false)
      expect(emitter.hasListeners('error')).toBe(true)
    })

    it('should remove all handlers when no event specified', () => {
      const readyHandler = jest.fn()
      const errorHandler = jest.fn()
      
      emitter.on('ready', readyHandler)
      emitter.on('error', errorHandler)
      
      emitter.offAll()
      
      expect(emitter.hasListeners('ready')).toBe(false)
      expect(emitter.hasListeners('error')).toBe(false)
    })
  })

  describe('emit', () => {
    it('should call all handlers for an event', () => {
      const handlers = [jest.fn(), jest.fn(), jest.fn()]
      handlers.forEach(h => emitter.on('ready', h))
      
      emitter.testEmit('ready', { peerKey: 'test' })
      
      handlers.forEach(h => expect(h).toHaveBeenCalledTimes(1))
    })

    it('should not throw when no handlers exist', () => {
      expect(() => {
        emitter.testEmit('ready', { peerKey: 'test' })
      }).not.toThrow()
    })

    it('should continue calling handlers even if one throws', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      
      const handler1 = jest.fn()
      const errorHandler = jest.fn(() => { throw new Error('Handler error') })
      const handler2 = jest.fn()
      
      emitter.on('ready', handler1)
      emitter.on('ready', errorHandler)
      emitter.on('ready', handler2)
      
      emitter.testEmit('ready', { peerKey: 'test' })
      
      expect(handler1).toHaveBeenCalled()
      expect(errorHandler).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalled()
      
      consoleError.mockRestore()
    })

    it('should allow handler removal during emit', () => {
      const handler1 = jest.fn()
      let unsubscribe: () => void
      
      const removingHandler = jest.fn(() => {
        unsubscribe()
      })
      const handler2 = jest.fn()
      
      emitter.on('ready', handler1)
      unsubscribe = emitter.on('ready', removingHandler)
      emitter.on('ready', handler2)
      
      emitter.testEmit('ready', { peerKey: 'test' })
      
      expect(handler1).toHaveBeenCalled()
      expect(removingHandler).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })
  })

  describe('hasListeners', () => {
    it('should return true when handlers exist', () => {
      emitter.on('ready', jest.fn())
      
      expect(emitter.hasListeners('ready')).toBe(true)
    })

    it('should return false when no handlers exist', () => {
      expect(emitter.hasListeners('ready')).toBe(false)
    })

    it('should return false after all handlers removed', () => {
      const handler = jest.fn()
      emitter.on('ready', handler)
      emitter.off('ready', handler)
      
      expect(emitter.hasListeners('ready')).toBe(false)
    })
  })

  describe('listenerCount', () => {
    it('should return 0 when no handlers', () => {
      expect(emitter.listenerCount('ready')).toBe(0)
    })

    it('should return correct count', () => {
      emitter.on('ready', jest.fn())
      emitter.on('ready', jest.fn())
      emitter.on('ready', jest.fn())
      
      expect(emitter.listenerCount('ready')).toBe(3)
    })

    it('should decrease when handlers removed', () => {
      const handler = jest.fn()
      emitter.on('ready', jest.fn())
      emitter.on('ready', handler)
      emitter.on('ready', jest.fn())
      
      emitter.off('ready', handler)
      
      expect(emitter.listenerCount('ready')).toBe(2)
    })
  })

  describe('setEventsEnabled', () => {
    it('should prevent emit when disabled', () => {
      const handler = jest.fn()
      emitter.on('ready', handler)
      
      emitter.setEventsEnabled(false)
      emitter.testEmit('ready', { peerKey: 'test' })
      
      expect(handler).not.toHaveBeenCalled()
    })

    it('should allow emit when re-enabled', () => {
      const handler = jest.fn()
      emitter.on('ready', handler)
      
      emitter.setEventsEnabled(false)
      emitter.setEventsEnabled(true)
      emitter.testEmit('ready', { peerKey: 'test' })
      
      expect(handler).toHaveBeenCalled()
    })
  })

  describe('destroyEventEmitter', () => {
    it('should remove all handlers', () => {
      emitter.on('ready', jest.fn())
      emitter.on('error', jest.fn())
      
      emitter.testDestroyEventEmitter()
      
      expect(emitter.hasListeners('ready')).toBe(false)
      expect(emitter.hasListeners('error')).toBe(false)
    })

    it('should disable events', () => {
      const handler = jest.fn()
      emitter.on('ready', handler)
      
      emitter.testDestroyEventEmitter()
      
      // Re-add a handler after destroy
      emitter.on('ready', handler)
      emitter.testEmit('ready', { peerKey: 'test' })
      
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('event type safety', () => {
    it('should emit correct data types for each event', () => {
      // Ready event
      const readyHandler = jest.fn()
      emitter.on('ready', readyHandler)
      emitter.testEmit('ready', { peerKey: 'key123' })
      expect(readyHandler).toHaveBeenCalledWith({ peerKey: 'key123' })
      
      // Error event
      const errorHandler = jest.fn()
      emitter.on('error', errorHandler)
      emitter.testEmit('error', { error: new Error('test'), context: 'handler' })
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(Error),
        context: 'handler'
      }))
      
      // Timeout event
      const timeoutHandler = jest.fn()
      emitter.on('timeout', timeoutHandler)
      emitter.testEmit('timeout', { requestId: 'req1', cmdname: 'test', timeoutMs: 5000 })
      expect(timeoutHandler).toHaveBeenCalledWith({
        requestId: 'req1',
        cmdname: 'test',
        timeoutMs: 5000
      })
      
      // Message sent event
      const sentHandler = jest.fn()
      emitter.on('message:sent', sentHandler)
      emitter.testEmit('message:sent', { cmdname: 'ping', requestId: 'req2' })
      expect(sentHandler).toHaveBeenCalledWith({ cmdname: 'ping', requestId: 'req2' })
      
      // Message received event
      const receivedHandler = jest.fn()
      emitter.on('message:received', receivedHandler)
      emitter.testEmit('message:received', { cmdname: 'pong', requestId: 'req2', isResponse: true })
      expect(receivedHandler).toHaveBeenCalledWith({
        cmdname: 'pong',
        requestId: 'req2',
        isResponse: true
      })
    })
  })
})
