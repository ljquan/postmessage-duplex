/**
 * Tests for ServiceWorkerHub
 * 
 * Note: Since ServiceWorkerHub is designed to run in Service Worker context,
 * we test the core functionality that doesn't require the full SW environment.
 */
import { ServiceWorkerHub, HubChannel } from '../src/sw-hub'
import { HubOptions } from '../src/interface'

describe('ServiceWorkerHub', () => {
  let hub: ServiceWorkerHub

  beforeEach(() => {
    jest.clearAllMocks()
    ServiceWorkerHub.resetInstance()
    hub = ServiceWorkerHub.getInstance()
  })

  afterEach(() => {
    try {
      hub.shutdown()
    } catch {
      // Ignore errors in cleanup
    }
    ServiceWorkerHub.resetInstance()
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ServiceWorkerHub.getInstance()
      const instance2 = ServiceWorkerHub.getInstance()
      
      expect(instance1).toBe(instance2)
    })
  })

  describe('isInitialized', () => {
    it('should return false initially', () => {
      expect(hub.isInitialized()).toBe(false)
    })
  })

  describe('getOptions', () => {
    it('should return empty options initially', () => {
      expect(hub.getOptions()).toEqual({})
    })
  })

  describe('channel management (without SW context)', () => {
    const createMockChannel = (): HubChannel => ({
      subscribe: jest.fn(),
      unSubscribe: jest.fn(),
      broadcast: jest.fn(),
      destroy: jest.fn(),
      handleMessage: jest.fn().mockResolvedValue(undefined)
    })

    it('should register a channel', () => {
      const mockChannel = createMockChannel()
      hub.registerChannel('client-1', mockChannel)
      
      expect(hub.hasChannel('client-1')).toBe(true)
      expect(hub.getChannelCount()).toBe(1)
    })

    it('should get a channel by ID', () => {
      const mockChannel = createMockChannel()
      hub.registerChannel('client-1', mockChannel)
      
      expect(hub.getChannel('client-1')).toBe(mockChannel)
    })

    it('should return undefined for non-existent channel', () => {
      expect(hub.getChannel('non-existent')).toBeUndefined()
    })

    it('should check if channel exists', () => {
      const mockChannel = createMockChannel()
      
      expect(hub.hasChannel('client-1')).toBe(false)
      hub.registerChannel('client-1', mockChannel)
      expect(hub.hasChannel('client-1')).toBe(true)
    })

    it('should unregister a channel', () => {
      const mockChannel = createMockChannel()
      hub.registerChannel('client-1', mockChannel)
      
      hub.unregisterChannel('client-1')
      
      expect(hub.hasChannel('client-1')).toBe(false)
      expect(hub.getChannelCount()).toBe(0)
    })

    it('should get channel count', () => {
      const mockChannel1 = createMockChannel()
      const mockChannel2 = createMockChannel()
      
      expect(hub.getChannelCount()).toBe(0)
      
      hub.registerChannel('client-1', mockChannel1)
      expect(hub.getChannelCount()).toBe(1)
      
      hub.registerChannel('client-2', mockChannel2)
      expect(hub.getChannelCount()).toBe(2)
    })
  })

  describe('client metadata', () => {
    it('should register client metadata', () => {
      const meta = hub.registerClientMeta('client-1', {
        appType: 'cart',
        appName: 'Shopping Cart'
      })
      
      expect(meta.clientId).toBe('client-1')
      expect(meta.appType).toBe('cart')
      expect(meta.appName).toBe('Shopping Cart')
      expect(meta.connectedAt).toBeDefined()
    })

    it('should get client metadata', () => {
      hub.registerClientMeta('client-1', { appType: 'cart' })
      
      const meta = hub.getClientMeta('client-1')
      
      expect(meta?.appType).toBe('cart')
    })

    it('should return undefined for non-existent client', () => {
      expect(hub.getClientMeta('non-existent')).toBeUndefined()
    })

    it('should get all client metadata', () => {
      hub.registerClientMeta('client-1', { appType: 'cart' })
      hub.registerClientMeta('client-2', { appType: 'user' })
      
      const allMeta = hub.getAllClientMeta()
      
      expect(allMeta.size).toBe(2)
      expect(allMeta.get('client-1')?.appType).toBe('cart')
      expect(allMeta.get('client-2')?.appType).toBe('user')
    })

    it('should get clients by type', () => {
      hub.registerClientMeta('client-1', { appType: 'cart' })
      hub.registerClientMeta('client-2', { appType: 'user' })
      hub.registerClientMeta('client-3', { appType: 'cart' })
      
      const cartClients = hub.getClientsByType('cart')
      
      expect(cartClients.length).toBe(2)
      expect(cartClients.every(c => c.appType === 'cart')).toBe(true)
    })

    it('should return empty array for non-existent type', () => {
      hub.registerClientMeta('client-1', { appType: 'cart' })
      
      const result = hub.getClientsByType('non-existent')
      
      expect(result).toEqual([])
    })
  })

  describe('global subscribe handlers', () => {
    const createMockChannel = (): HubChannel => ({
      subscribe: jest.fn(),
      unSubscribe: jest.fn(),
      broadcast: jest.fn(),
      destroy: jest.fn(),
      handleMessage: jest.fn().mockResolvedValue(undefined)
    })

    it('should apply global handlers to new channels', () => {
      const handler = jest.fn()
      hub.subscribeGlobal('test', handler)
      
      const mockChannel = createMockChannel()
      hub.registerChannel('client-1', mockChannel)
      
      expect(mockChannel.subscribe).toHaveBeenCalledWith('test', expect.any(Function))
    })

    it('should warn for reserved handler names', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation()
      
      hub.subscribeGlobal('__reserved__', jest.fn())
      
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('reserved prefix')
      )
      consoleWarn.mockRestore()
    })

    it('should unsubscribe global handler from all channels', () => {
      const mockChannel1 = createMockChannel()
      const mockChannel2 = createMockChannel()
      
      hub.subscribeGlobal('test', jest.fn())
      hub.registerChannel('client-1', mockChannel1)
      hub.registerChannel('client-2', mockChannel2)
      
      hub.unsubscribeGlobal('test')
      
      expect(mockChannel1.unSubscribe).toHaveBeenCalledWith('test')
      expect(mockChannel2.unSubscribe).toHaveBeenCalledWith('test')
    })

    it('should apply handlers to existing channels when subscribing', () => {
      const mockChannel = createMockChannel()
      hub.registerChannel('client-1', mockChannel)
      
      hub.subscribeGlobal('newHandler', jest.fn())
      
      expect(mockChannel.subscribe).toHaveBeenCalledWith('newHandler', expect.any(Function))
    })
  })

  describe('global routing state', () => {
    it('should start with global routing disabled', () => {
      expect(hub.isGlobalRoutingEnabled()).toBe(false)
    })
  })

  describe('shutdown', () => {
    const createMockChannel = (): HubChannel => ({
      subscribe: jest.fn(),
      unSubscribe: jest.fn(),
      broadcast: jest.fn(),
      destroy: jest.fn(),
      handleMessage: jest.fn().mockResolvedValue(undefined)
    })

    it('should destroy all channels', () => {
      const mockChannel1 = createMockChannel()
      const mockChannel2 = createMockChannel()
      
      hub.registerChannel('client-1', mockChannel1)
      hub.registerChannel('client-2', mockChannel2)
      
      hub.shutdown()
      
      expect(mockChannel1.destroy).toHaveBeenCalled()
      expect(mockChannel2.destroy).toHaveBeenCalled()
    })

    it('should clear all state', () => {
      const mockChannel = createMockChannel()
      hub.registerChannel('client-1', mockChannel)
      hub.registerClientMeta('client-1', { appType: 'cart' })
      
      hub.shutdown()
      
      expect(hub.getChannelCount()).toBe(0)
      expect(hub.getAllClientMeta().size).toBe(0)
    })

    it('should handle errors during channel destruction', () => {
      const mockChannel: HubChannel = {
        subscribe: jest.fn(),
        unSubscribe: jest.fn(),
        broadcast: jest.fn(),
        destroy: jest.fn().mockImplementation(() => { throw new Error('Destroy error') }),
        handleMessage: jest.fn().mockResolvedValue(undefined)
      }
      
      hub.registerChannel('client-1', mockChannel)
      
      // Should not throw
      expect(() => hub.shutdown()).not.toThrow()
    })
  })
})
