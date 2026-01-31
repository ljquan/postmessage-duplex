/**
 * Tests for TimeoutManager
 */
import { TimeoutManager } from '../src/timeout-manager'

describe('TimeoutManager', () => {
  let manager: TimeoutManager

  beforeEach(() => {
    jest.useFakeTimers()
    manager = new TimeoutManager()
  })

  afterEach(() => {
    manager.destroy()
    jest.useRealTimers()
  })

  describe('add', () => {
    it('should add a timeout', () => {
      const callback = jest.fn()
      manager.add('test-1', 1000, callback)
      
      expect(manager.has('test-1')).toBe(true)
      expect(manager.size).toBe(1)
    })

    it('should execute callback after timeout', () => {
      const callback = jest.fn()
      manager.add('test-1', 1000, callback)
      
      jest.advanceTimersByTime(999)
      expect(callback).not.toHaveBeenCalled()
      
      jest.advanceTimersByTime(1)
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple timeouts', () => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      const callback3 = jest.fn()
      
      manager.add('test-1', 1000, callback1)
      manager.add('test-2', 2000, callback2)
      manager.add('test-3', 1500, callback3)
      
      expect(manager.size).toBe(3)
      
      jest.advanceTimersByTime(1000)
      expect(callback1).toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
      expect(callback3).not.toHaveBeenCalled()
      
      jest.advanceTimersByTime(500)
      expect(callback3).toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
      
      jest.advanceTimersByTime(500)
      expect(callback2).toHaveBeenCalled()
    })

    it('should not add after destroy', () => {
      manager.destroy()
      
      const callback = jest.fn()
      manager.add('test-1', 1000, callback)
      
      expect(manager.has('test-1')).toBe(false)
      expect(manager.size).toBe(0)
    })

    it('should reschedule when adding earlier timeout', () => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      
      manager.add('test-1', 2000, callback1)
      manager.add('test-2', 500, callback2) // Earlier timeout
      
      jest.advanceTimersByTime(500)
      expect(callback2).toHaveBeenCalled()
      expect(callback1).not.toHaveBeenCalled()
      
      jest.advanceTimersByTime(1500)
      expect(callback1).toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('should remove a pending timeout', () => {
      const callback = jest.fn()
      manager.add('test-1', 1000, callback)
      
      expect(manager.remove('test-1')).toBe(true)
      expect(manager.has('test-1')).toBe(false)
      
      jest.advanceTimersByTime(1000)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should return false for non-existent timeout', () => {
      expect(manager.remove('non-existent')).toBe(false)
    })

    it('should not affect other timeouts', () => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      
      manager.add('test-1', 1000, callback1)
      manager.add('test-2', 1000, callback2)
      
      manager.remove('test-1')
      
      jest.advanceTimersByTime(1000)
      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })
  })

  describe('has', () => {
    it('should return true for existing timeout', () => {
      manager.add('test-1', 1000, jest.fn())
      
      expect(manager.has('test-1')).toBe(true)
    })

    it('should return false for non-existent timeout', () => {
      expect(manager.has('non-existent')).toBe(false)
    })

    it('should return false after timeout executes', () => {
      manager.add('test-1', 1000, jest.fn())
      
      jest.advanceTimersByTime(1000)
      
      expect(manager.has('test-1')).toBe(false)
    })
  })

  describe('size', () => {
    it('should return 0 initially', () => {
      expect(manager.size).toBe(0)
    })

    it('should increase when adding', () => {
      manager.add('test-1', 1000, jest.fn())
      expect(manager.size).toBe(1)
      
      manager.add('test-2', 1000, jest.fn())
      expect(manager.size).toBe(2)
    })

    it('should decrease when removing', () => {
      manager.add('test-1', 1000, jest.fn())
      manager.add('test-2', 1000, jest.fn())
      
      manager.remove('test-1')
      expect(manager.size).toBe(1)
    })

    it('should decrease when timeout executes', () => {
      manager.add('test-1', 500, jest.fn())
      manager.add('test-2', 1000, jest.fn())
      
      jest.advanceTimersByTime(500)
      expect(manager.size).toBe(1)
    })
  })

  describe('destroy', () => {
    it('should clear all timeouts', () => {
      const callback = jest.fn()
      manager.add('test-1', 1000, callback)
      manager.add('test-2', 2000, callback)
      
      manager.destroy()
      
      expect(manager.size).toBe(0)
      
      jest.advanceTimersByTime(2000)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should prevent new timeouts from being added', () => {
      manager.destroy()
      
      manager.add('test-1', 1000, jest.fn())
      expect(manager.size).toBe(0)
    })

    it('should be idempotent', () => {
      manager.add('test-1', 1000, jest.fn())
      
      manager.destroy()
      manager.destroy() // Should not throw
      
      expect(manager.size).toBe(0)
    })
  })

  describe('clear', () => {
    it('should clear all timeouts without executing callbacks', () => {
      const callback = jest.fn()
      manager.add('test-1', 1000, callback)
      manager.add('test-2', 2000, callback)
      
      manager.clear()
      
      expect(manager.size).toBe(0)
      
      jest.advanceTimersByTime(2000)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should allow adding new timeouts after clear', () => {
      manager.add('test-1', 1000, jest.fn())
      manager.clear()
      
      const callback = jest.fn()
      manager.add('test-2', 1000, callback)
      
      expect(manager.size).toBe(1)
      
      jest.advanceTimersByTime(1000)
      expect(callback).toHaveBeenCalled()
    })
  })

  describe('callback error handling', () => {
    it('should continue processing other timeouts on callback error', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      
      const errorCallback = jest.fn(() => {
        throw new Error('Test error')
      })
      const normalCallback = jest.fn()
      
      manager.add('test-1', 1000, errorCallback)
      manager.add('test-2', 1000, normalCallback)
      
      jest.advanceTimersByTime(1000)
      
      expect(errorCallback).toHaveBeenCalled()
      expect(normalCallback).toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledWith(
        '[TimeoutManager] Callback error:',
        expect.any(Error)
      )
      
      consoleError.mockRestore()
    })
  })

  describe('edge cases', () => {
    it('should handle zero timeout', () => {
      const callback = jest.fn()
      manager.add('test-1', 0, callback)
      
      jest.advanceTimersByTime(0)
      expect(callback).toHaveBeenCalled()
    })

    it('should handle same ID replacement', () => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      
      manager.add('test-1', 1000, callback1)
      manager.add('test-1', 500, callback2) // Replaces the first one
      
      expect(manager.size).toBe(1)
      
      jest.advanceTimersByTime(500)
      expect(callback2).toHaveBeenCalled()
      expect(callback1).not.toHaveBeenCalled()
      
      jest.advanceTimersByTime(500)
      expect(callback1).not.toHaveBeenCalled() // Never called
    })

    it('should handle many timeouts efficiently', () => {
      const callbacks: jest.Mock[] = []
      
      for (let i = 0; i < 100; i++) {
        const callback = jest.fn()
        callbacks.push(callback)
        manager.add(`test-${i}`, 1000 + i * 10, callback)
      }
      
      expect(manager.size).toBe(100)
      
      // All should fire within 2 seconds
      jest.advanceTimersByTime(2000)
      
      callbacks.forEach(callback => {
        expect(callback).toHaveBeenCalledTimes(1)
      })
      
      expect(manager.size).toBe(0)
    })

    it('should handle timeout during callback execution', () => {
      const innerCallback = jest.fn()
      const outerCallback = jest.fn(() => {
        manager.add('inner', 100, innerCallback)
      })
      
      manager.add('outer', 1000, outerCallback)
      
      jest.advanceTimersByTime(1000)
      expect(outerCallback).toHaveBeenCalled()
      
      // Inner timeout was added during callback, need to advance more
      jest.advanceTimersByTime(100)
      expect(innerCallback).toHaveBeenCalled()
    })
  })
})
