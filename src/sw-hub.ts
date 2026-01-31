/**
 * Service Worker Hub - Multi-client management functionality.
 * 
 * Provides centralized management of multiple client connections in Service Worker:
 * - Client registration and metadata tracking
 * - Global message handlers
 * - Broadcast to all/specific clients
 * - SW lifecycle event handling
 * - Automatic cleanup of inactive clients
 * 
 * @module sw-hub
 */

import { ClientMeta, HubOptions, GlobalSubscribeHandler, ReturnCode } from './interface'

// Service Worker type declarations
interface ServiceWorkerGlobalScopeType {
  clients: {
    get(id: string): Promise<ClientType | undefined>
    matchAll(options?: { type?: string }): Promise<ClientType[]>
    claim(): Promise<void>
  }
  addEventListener(type: string, listener: (event: any) => void): void
  removeEventListener(type: string, listener: (event: any) => void): void
  skipWaiting(): void
}

interface ClientType {
  id: string
  postMessage(message: any, transfer?: Transferable[]): void
  type?: string
  url?: string
}

// Declare self as SW global scope
declare const self: ServiceWorkerGlobalScopeType & typeof globalThis

/**
 * Interface for channel-like object used by Hub.
 * Allows Hub to operate without circular dependency on ServiceWorkerChannel.
 */
export interface HubChannel {
  subscribe(cmdname: string, handler: (response: { data: any }) => any): void
  unSubscribe(cmdname: string): void
  broadcast(eventName: string, data?: Record<string, any>): void
  destroy(): void
  handleMessage(event: MessageEvent): Promise<void>
}

/**
 * Factory function type for creating channels.
 */
export type ChannelFactory = (clientId: string) => HubChannel

/**
 * ServiceWorkerHub - Centralized management of multi-client SW communication.
 * 
 * This class manages:
 * - Client metadata tracking
 * - Global subscribe handlers
 * - Broadcast functionality
 * - SW lifecycle events
 * - Client cleanup
 */
export class ServiceWorkerHub {
  /** Map of clientId -> client metadata */
  private clientMeta = new Map<string, ClientMeta>()

  /** Map of clientId -> channel */
  private channelsByClientId = new Map<string, HubChannel>()

  /** Global subscribe handlers shared by all channels */
  private globalSubscribeMap = new Map<string, GlobalSubscribeHandler>()

  /** Whether Hub has been initialized */
  private initialized = false

  /** Hub configuration options */
  private options: HubOptions = {}

  /** Cleanup interval timer ID */
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null

  /** Global message listener setup flag */
  private globalListenerSetup = false

  /** Callback for unknown client messages */
  private unknownClientCallback: ((clientId: string, event: MessageEvent) => void) | null = null

  /** Channel factory function */
  private channelFactory: ChannelFactory | null = null

  /** Singleton instance */
  private static instance: ServiceWorkerHub | null = null

  /**
   * Gets the singleton Hub instance.
   */
  static getInstance(): ServiceWorkerHub {
    if (!ServiceWorkerHub.instance) {
      ServiceWorkerHub.instance = new ServiceWorkerHub()
    }
    return ServiceWorkerHub.instance
  }

  /**
   * Resets the singleton instance (for testing).
   * @internal
   */
  static resetInstance(): void {
    if (ServiceWorkerHub.instance) {
      ServiceWorkerHub.instance.shutdown()
      ServiceWorkerHub.instance = null
    }
  }

  /**
   * Initializes the Hub for multi-client management.
   * 
   * @param options - Hub configuration options
   * @param channelFactory - Factory function to create channels for new clients
   */
  setup(options: HubOptions, channelFactory: ChannelFactory): void {
    if (this.initialized) {
      console.warn('[ServiceWorkerHub] Already initialized')
      return
    }

    this.options = options
    this.channelFactory = channelFactory
    this.initialized = true

    // Register built-in handlers
    this.registerBuiltInHandlers()

    // Setup SW lifecycle events
    this.setupLifecycleEvents()

    // Start cleanup interval
    const cleanupInterval = options.cleanupInterval ?? 30000
    if (cleanupInterval > 0) {
      this.cleanupIntervalId = setInterval(
        () => this.cleanupInactiveClients(),
        cleanupInterval
      )
    }

    console.log('[ServiceWorkerHub] Initialized', options.version ? `v${options.version}` : '')
  }

  /**
   * Shuts down the Hub and cleans up resources.
   */
  shutdown(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
    }

    if (this.globalListenerSetup) {
      self.removeEventListener('message', this.globalMessageHandler)
      this.globalListenerSetup = false
    }

    // Destroy all channels
    for (const channel of this.channelsByClientId.values()) {
      try {
        channel.destroy()
      } catch {
        // Ignore errors during cleanup
      }
    }

    this.channelsByClientId.clear()
    this.clientMeta.clear()
    this.globalSubscribeMap.clear()
    this.initialized = false
  }

  /**
   * Checks if the Hub is initialized.
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Gets the Hub options.
   */
  getOptions(): HubOptions {
    return this.options
  }

  // ============================================================================
  // Global Message Routing
  // ============================================================================

  /**
   * Enables global message routing.
   * @param callback - Optional callback for messages from unknown clients
   */
  enableGlobalRouting(callback?: (clientId: string, event: MessageEvent) => void): void {
    this.unknownClientCallback = callback ?? null
    
    if (!this.globalListenerSetup) {
      self.addEventListener('message', this.globalMessageHandler)
      this.globalListenerSetup = true
    }
  }

  /**
   * Disables global message routing.
   */
  disableGlobalRouting(): void {
    if (this.globalListenerSetup) {
      self.removeEventListener('message', this.globalMessageHandler)
      this.globalListenerSetup = false
    }
  }

  /**
   * Global message handler that routes messages to the correct channel.
   */
  private globalMessageHandler = (event: MessageEvent): void => {
    const source = event.source as unknown as { id?: string } | null
    const clientId = source?.id
    
    if (!clientId) return
    
    const channel = this.channelsByClientId.get(clientId)
    
    if (channel) {
      channel.handleMessage(event)
    } else if (this.unknownClientCallback) {
      this.unknownClientCallback(clientId, event)
    }
  }

  /**
   * Checks if global routing is enabled.
   */
  isGlobalRoutingEnabled(): boolean {
    return this.globalListenerSetup
  }

  // ============================================================================
  // Channel Management
  // ============================================================================

  /**
   * Registers a channel in the Hub.
   * @param clientId - The client ID
   * @param channel - The channel instance
   */
  registerChannel(clientId: string, channel: HubChannel): void {
    this.channelsByClientId.set(clientId, channel)
    this.applyGlobalHandlersToChannel(channel, clientId)
  }

  /**
   * Unregisters a channel from the Hub.
   * @param clientId - The client ID
   */
  unregisterChannel(clientId: string): void {
    this.channelsByClientId.delete(clientId)
    this.clientMeta.delete(clientId)
    this.options.onClientDisconnect?.(clientId)
  }

  /**
   * Gets a channel by client ID.
   * @param clientId - The client ID
   */
  getChannel(clientId: string): HubChannel | undefined {
    return this.channelsByClientId.get(clientId)
  }

  /**
   * Checks if a channel exists for a client.
   * @param clientId - The client ID
   */
  hasChannel(clientId: string): boolean {
    return this.channelsByClientId.has(clientId)
  }

  /**
   * Gets the number of active channels.
   */
  getChannelCount(): number {
    return this.channelsByClientId.size
  }

  /**
   * Creates a channel for a client using the factory.
   * @param clientId - The client ID
   */
  createChannelForClient(clientId: string): HubChannel | null {
    if (!this.channelFactory) {
      console.warn('[ServiceWorkerHub] No channel factory configured')
      return null
    }

    const channel = this.channelFactory(clientId)
    this.registerChannel(clientId, channel)
    return channel
  }

  // ============================================================================
  // Client Metadata
  // ============================================================================

  /**
   * Registers client metadata.
   * @param clientId - The client ID
   * @param meta - The client metadata (partial, will be merged)
   */
  registerClientMeta(clientId: string, meta: Partial<ClientMeta>): ClientMeta {
    const fullMeta: ClientMeta = {
      clientId,
      appType: meta.appType,
      appName: meta.appName,
      connectedAt: new Date().toISOString()
    }
    this.clientMeta.set(clientId, fullMeta)
    this.options.onClientConnect?.(clientId, fullMeta)
    return fullMeta
  }

  /**
   * Gets metadata for a client.
   * @param clientId - The client ID
   */
  getClientMeta(clientId: string): ClientMeta | undefined {
    return this.clientMeta.get(clientId)
  }

  /**
   * Gets all client metadata.
   */
  getAllClientMeta(): Map<string, ClientMeta> {
    return new Map(this.clientMeta)
  }

  /**
   * Gets clients by type.
   * @param type - The app type to filter by
   */
  getClientsByType(type: string): ClientMeta[] {
    const result: ClientMeta[] = []
    for (const meta of this.clientMeta.values()) {
      if (meta.appType === type) {
        result.push(meta)
      }
    }
    return result
  }

  // ============================================================================
  // Global Subscribe Handlers
  // ============================================================================

  /**
   * Registers a global handler for all channels.
   * @param cmdname - The command name
   * @param handler - The handler function
   */
  subscribeGlobal(cmdname: string, handler: GlobalSubscribeHandler): void {
    if (cmdname.startsWith('__')) {
      console.warn(`[ServiceWorkerHub] Handler name '${cmdname}' uses reserved prefix '__'.`)
    }

    this.globalSubscribeMap.set(cmdname, handler)

    // Apply to existing channels
    for (const [clientId, channel] of this.channelsByClientId) {
      this.applyHandlerToChannel(channel, clientId, cmdname, handler)
    }
  }

  /**
   * Unregisters a global handler.
   * @param cmdname - The command name
   */
  unsubscribeGlobal(cmdname: string): void {
    this.globalSubscribeMap.delete(cmdname)

    for (const channel of this.channelsByClientId.values()) {
      channel.unSubscribe(cmdname)
    }
  }

  /**
   * Applies all global handlers to a channel.
   */
  private applyGlobalHandlersToChannel(channel: HubChannel, clientId: string): void {
    for (const [cmdname, handler] of this.globalSubscribeMap) {
      this.applyHandlerToChannel(channel, clientId, cmdname, handler)
    }
  }

  /**
   * Applies a single handler to a channel.
   */
  private applyHandlerToChannel(
    channel: HubChannel,
    clientId: string,
    cmdname: string,
    handler: GlobalSubscribeHandler
  ): void {
    channel.subscribe(cmdname, async (response) => {
      const meta = this.clientMeta.get(clientId)
      return handler({
        data: response.data || {},
        clientId,
        clientMeta: meta
      })
    })
  }

  // ============================================================================
  // Built-in Handlers
  // ============================================================================

  /**
   * Registers built-in handlers.
   */
  private registerBuiltInHandlers(): void {
    // Client registration handler
    this.globalSubscribeMap.set('__register__', ({ data, clientId }) => {
      const meta = this.registerClientMeta(clientId, {
        appType: data.appType,
        appName: data.appName
      })
      
      console.log('[ServiceWorkerHub] Client registered:', clientId, meta.appName || meta.appType || '')
      
      return {
        success: true,
        clientId,
        totalClients: this.clientMeta.size
      }
    })

    // Ping handler
    this.globalSubscribeMap.set('__ping__', ({ clientId }) => {
      return {
        pong: true,
        timestamp: Date.now(),
        clientId,
        activeClients: this.channelsByClientId.size
      }
    })
  }

  // ============================================================================
  // Lifecycle Events
  // ============================================================================

  /**
   * Sets up SW lifecycle event handlers.
   */
  private setupLifecycleEvents(): void {
    self.addEventListener('install', ((event: any) => {
      console.log('[ServiceWorkerHub] Installing', this.options.version ? `v${this.options.version}` : '')
      if (typeof self.skipWaiting === 'function') {
        self.skipWaiting()
      }
    }) as EventListener)

    self.addEventListener('activate', ((event: any) => {
      console.log('[ServiceWorkerHub] Activating', this.options.version ? `v${this.options.version}` : '')
      
      const activatePromise = (async () => {
        if (typeof self.clients?.claim === 'function') {
          await self.clients.claim()
        }
        await this.notifyAllClientsSwActivated()
      })()

      if (typeof event.waitUntil === 'function') {
        event.waitUntil(activatePromise)
      }
    }) as EventListener)
  }

  /**
   * Notifies all clients of SW activation.
   */
  async notifyAllClientsSwActivated(): Promise<void> {
    try {
      const clients = await self.clients.matchAll()
      console.log('[ServiceWorkerHub] Notifying', clients.length, 'clients of SW activation')
      
      for (const client of clients) {
        client.postMessage({
          cmdname: '__sw-activated__',
          data: { version: this.options.version },
          _broadcast: true
        })
      }
    } catch (e) {
      console.error('[ServiceWorkerHub] Error notifying clients:', e)
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleans up inactive clients.
   */
  async cleanupInactiveClients(): Promise<void> {
    try {
      const activeClients = await self.clients.matchAll()
      const activeIds = new Set(activeClients.map(c => c.id))
      
      for (const [clientId, channel] of this.channelsByClientId) {
        if (!activeIds.has(clientId)) {
          channel.destroy()
          this.channelsByClientId.delete(clientId)
          this.clientMeta.delete(clientId)
          this.options.onClientDisconnect?.(clientId)
          
          console.log('[ServiceWorkerHub] Cleaned up inactive client:', clientId)
        }
      }
    } catch (e) {
      console.error('[ServiceWorkerHub] Cleanup error:', e)
    }
  }

  // ============================================================================
  // Broadcast
  // ============================================================================

  /**
   * Broadcasts a message to all connected clients.
   * @param eventName - The event name
   * @param data - The data to broadcast
   * @param excludeClientId - Optional client to exclude
   */
  async broadcastToAll(eventName: string, data?: Record<string, any>, excludeClientId?: string): Promise<number> {
    if (!this.initialized) {
      console.warn('[ServiceWorkerHub] Not initialized')
      return 0
    }

    try {
      const activeClients = await self.clients.matchAll()
      let sentCount = 0

      for (const client of activeClients) {
        if (excludeClientId && client.id === excludeClientId) continue

        const channel = this.channelsByClientId.get(client.id)
        if (channel) {
          try {
            channel.broadcast(eventName, {
              ...data,
              _fromHub: true,
              _timestamp: Date.now()
            })
            sentCount++
          } catch (e) {
            console.warn('[ServiceWorkerHub] Failed to broadcast to client:', client.id, e)
          }
        }
      }

      return sentCount
    } catch (e) {
      console.error('[ServiceWorkerHub] broadcastToAll error:', e)
      return 0
    }
  }

  /**
   * Broadcasts a message to clients of a specific type.
   * @param targetType - The app type to target
   * @param eventName - The event name
   * @param data - The data to broadcast
   * @param excludeClientId - Optional client to exclude
   */
  async broadcastToType(
    targetType: string,
    eventName: string,
    data?: Record<string, any>,
    excludeClientId?: string
  ): Promise<number> {
    if (!this.initialized) {
      console.warn('[ServiceWorkerHub] Not initialized')
      return 0
    }

    try {
      const activeClients = await self.clients.matchAll()
      let sentCount = 0

      for (const client of activeClients) {
        if (excludeClientId && client.id === excludeClientId) continue

        const meta = this.clientMeta.get(client.id)
        if (!meta || meta.appType !== targetType) continue

        const channel = this.channelsByClientId.get(client.id)
        if (channel) {
          try {
            channel.broadcast(eventName, {
              ...data,
              _fromHub: true,
              _targetType: targetType,
              _timestamp: Date.now()
            })
            sentCount++
          } catch (e) {
            console.warn('[ServiceWorkerHub] Failed to broadcast to client:', client.id, e)
          }
        }
      }

      return sentCount
    } catch (e) {
      console.error('[ServiceWorkerHub] broadcastToType error:', e)
      return 0
    }
  }
}

// Export singleton accessor for convenience
export const hub = ServiceWorkerHub.getInstance
