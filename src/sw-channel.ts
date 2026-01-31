import BaseChannel, { ChannelOption, generateUniqueId } from './base-channel'
import { Methods, ReturnCode, ClientMeta, HubOptions, PageChannelOptions, GlobalSubscribeHandler } from './interface'
import { cloneMessage } from './utils'
import { ServiceWorkerHub, HubChannel } from './sw-hub'

/**
 * Configuration options for ServiceWorkerChannel.
 * @interface ServiceWorkerChannelOption
 * @extends ChannelOption
 */
export interface ServiceWorkerChannelOption extends ChannelOption {
  /**
   * Indicates whether the channel runs in a Service Worker context.
   * - `true`: Running inside Service Worker, communicating with pages
   * - `false`: Running in a page, communicating with Service Worker (default)
   * @default false
   */
  isWorkerSide?: boolean
}

/**
 * Callback for handling messages from unknown clients (no channel exists).
 * Used for auto-creating channels when SW restarts.
 */
export type UnknownClientCallback = (
  clientId: string,
  event: ExtendableMessageEventType | MessageEvent
) => void

// Service Worker type declarations
interface ServiceWorkerGlobalScopeType {
  clients: {
    get(id: string): Promise<ClientType | undefined>
    matchAll(options?: { type?: string }): Promise<ClientType[]>
  }
  addEventListener(type: string, listener: (event: any) => void): void
  removeEventListener(type: string, listener: (event: any) => void): void
}

interface ClientType {
  id: string
  postMessage(message: any, transfer?: Transferable[]): void
  type?: string
  url?: string
}

/**
 * ExtendableMessageEvent type for Service Worker message events.
 * @interface ExtendableMessageEventType
 */
interface ExtendableMessageEventType {
  /** Message data */
  data: any
  /** Source client */
  source: ClientType | null
}

// Service Worker global scope declaration
declare const self: ServiceWorkerGlobalScopeType & typeof globalThis

/**
 * Service Worker postMessage duplex communication channel.
 *
 * Provides type-safe, Promise-based communication between pages
 * and their Service Worker using the postMessage API.
 *
 * @class ServiceWorkerChannel
 * @extends BaseChannel
 * @template TMethods - Optional interface defining available remote methods for type-safe calls
 *
 * @example
 * // Page side: Create channel with active Service Worker
 * const channel = new ServiceWorkerChannel(navigator.serviceWorker.controller)
 *
 * // Or use the async factory method
 * const channel = await ServiceWorkerChannel.createFromPage()
 *
 * // Send message to Service Worker
 * const response = await channel.publish('fetchData', { url: '/api/data' })
 * console.log(response.data)
 *
 * // Listen for messages from Service Worker
 * channel.subscribe('notification', ({ data }) => {
 *   showNotification(data.title, data.body)
 * })
 *
 * @example
 * // Service Worker side: Handle incoming messages
 * self.addEventListener('message', (event) => {
 *   // Create channel for this specific client
 *   const channel = ServiceWorkerChannel.createFromEvent(event)
 *
 *   // Handle requests
 *   channel.subscribe('fetchData', async ({ data }) => {
 *     const response = await fetch(data.url)
 *     return await response.json()
 *   })
 * })
 * 
 * @example
 * // Type-safe usage with generics
 * interface RemoteMethods {
 *   fetchData(params: { url: string }): { data: any }
 * }
 * const channel = new ServiceWorkerChannel<RemoteMethods>(worker)
 * const response = await channel.call('fetchData', { url: '/api/data' })
 * // response.data is typed as { data: any } | undefined
 */
export default class ServiceWorkerChannel<TMethods extends Methods = Methods> extends BaseChannel<TMethods> {
  /** @internal */
  protected readonly channelType = 'ServiceWorkerChannel'

  /** Whether this channel runs in Service Worker context */
  private readonly isWorkerSide: boolean

  /** Service Worker instance (page side only) */
  private worker?: ServiceWorker | null

  /** Client ID (Service Worker side only) */
  private readonly clientId?: string

  /** ServiceWorkerContainer reference (page side only) */
  private readonly swContainer?: ServiceWorkerContainer

  // ============================================================================
  // Static Global Message Router (for SW side)
  // ============================================================================
  
  /** Map of clientId -> channel for message routing */
  private static channelsByClientId = new Map<string, ServiceWorkerChannel<any>>()
  
  /** Whether global listener is set up */
  private static globalListenerSetup = false
  
  /** Callback for messages from unknown clients */
  private static unknownClientCallback: UnknownClientCallback | null = null
  
  /** Whether to use global routing (enabled by default on SW side) */
  private static useGlobalRouting = true

  // ============================================================================
  // Static Hub Properties (for SW side multi-client management)
  // ============================================================================

  /** Map of clientId -> client metadata */
  private static clientMeta = new Map<string, ClientMeta>()

  /** Global subscribe handlers shared by all channels */
  private static globalSubscribeMap = new Map<string, GlobalSubscribeHandler>()

  /** Whether Hub has been initialized */
  private static hubInitialized = false

  /** Hub configuration options */
  private static hubOptions: HubOptions = {}

  /** Cleanup interval timer ID */
  private static cleanupIntervalId: ReturnType<typeof setInterval> | null = null

  /**
   * Enables global message routing for Service Worker side.
   * When enabled, all channels share a single global message listener,
   * and messages are routed to the correct channel by clientId.
   * 
   * Benefits:
   * - Single listener instead of N listeners for N clients
   * - Can handle messages for unknown clients (SW restart scenario)
   * - Better performance with many clients
   * 
   * @param callback - Optional callback for messages from unknown clients.
   *   When SW restarts, clients may send messages before their channel is recreated.
   *   This callback allows you to auto-create channels for such cases.
   * 
   * @example
   * // In Service Worker initialization
   * ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
   *   // Auto-create channel for this client
   *   const channel = ServiceWorkerChannel.createFromWorker(clientId, { subscribeMap })
   *   // Manually process the current message
   *   channel.handleMessage(event)
   * })
   */
  static enableGlobalRouting(callback?: UnknownClientCallback): void {
    ServiceWorkerChannel.useGlobalRouting = true
    ServiceWorkerChannel.unknownClientCallback = callback ?? null
    
    // Set up global listener if not already done
    if (!ServiceWorkerChannel.globalListenerSetup) {
      self.addEventListener('message', ServiceWorkerChannel.globalMessageHandler)
      ServiceWorkerChannel.globalListenerSetup = true
    }
  }

  /**
   * Disables global message routing.
   * Each channel will use its own message listener (original behavior).
   */
  static disableGlobalRouting(): void {
    ServiceWorkerChannel.useGlobalRouting = false
    
    if (ServiceWorkerChannel.globalListenerSetup) {
      self.removeEventListener('message', ServiceWorkerChannel.globalMessageHandler)
      ServiceWorkerChannel.globalListenerSetup = false
    }
  }

  // ============================================================================
  // Hub API - Multi-client Management for Service Worker
  // ============================================================================

  /**
   * Initializes the Service Worker Hub for multi-client management.
   * This method sets up automatic handling of:
   * - SW lifecycle events (install, activate)
   * - Client registration and metadata tracking
   * - Periodic cleanup of inactive clients
   * - Automatic notification to clients when SW updates
   * 
   * @param options - Hub configuration options
   * 
   * @example
   * // In your Service Worker file
   * importScripts('./postmessage-duplex.umd.js')
   * const { ServiceWorkerChannel } = PostMessageChannel
   * 
   * ServiceWorkerChannel.setupHub({
   *   version: '1.0.0',
   *   onClientConnect: (clientId, meta) => {
   *     console.log('Client connected:', meta.appName)
   *   }
   * })
   * 
   * // Register your business handlers
   * ServiceWorkerChannel.subscribeGlobal('echo', ({ data }) => ({
   *   echoed: data.message
   * }))
   */
  static setupHub(options: HubOptions = {}): void {
    if (ServiceWorkerChannel.hubInitialized) {
      console.warn('[ServiceWorkerChannel] Hub already initialized')
      return
    }

    ServiceWorkerChannel.hubOptions = options
    ServiceWorkerChannel.hubInitialized = true

    // Initialize the Hub singleton with channel factory
    const hub = ServiceWorkerHub.getInstance()
    hub.setup(options, (clientId: string) => {
      const channel = ServiceWorkerChannel.createFromWorker(clientId)
      return channel as unknown as HubChannel
    })

    // Enable global routing with auto-channel creation
    ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
      // Auto-create channel for unknown client
      const channel = ServiceWorkerChannel.createFromWorker(clientId)
      ServiceWorkerChannel.setupChannelHandlers(channel, clientId)
      channel.handleMessage(event as MessageEvent)
    })

    // Register built-in handlers
    ServiceWorkerChannel.registerBuiltInHandlers()

    // Setup SW lifecycle events are now handled by Hub
    // ServiceWorkerChannel.setupLifecycleEvents() - delegated to Hub

    // Start cleanup interval
    const cleanupInterval = options.cleanupInterval ?? 30000
    if (cleanupInterval > 0) {
      ServiceWorkerChannel.cleanupIntervalId = setInterval(
        () => ServiceWorkerChannel.cleanupInactiveClients(),
        cleanupInterval
      )
    }

  }

  /**
   * Registers built-in handlers for internal messages.
   * @internal
   */
  private static registerBuiltInHandlers(): void {
    // Client registration handler
    ServiceWorkerChannel.globalSubscribeMap.set('__register__', ({ data, clientId }) => {
      const meta: ClientMeta = {
        clientId,
        appType: data.appType,
        appName: data.appName,
        connectedAt: new Date().toISOString()
      }
      ServiceWorkerChannel.clientMeta.set(clientId, meta)
      
      // Call user callback
      ServiceWorkerChannel.hubOptions.onClientConnect?.(clientId, meta)
      
      return {
        success: true,
        clientId,
        totalClients: ServiceWorkerChannel.clientMeta.size
      }
    })

    // Ping handler for heartbeat
    ServiceWorkerChannel.globalSubscribeMap.set('__ping__', ({ clientId }) => {
      return {
        pong: true,
        timestamp: Date.now(),
        clientId,
        activeClients: ServiceWorkerChannel.channelsByClientId.size
      }
    })
  }

  /**
   * Sets up handlers for a newly created channel.
   * @internal
   */
  private static setupChannelHandlers(channel: ServiceWorkerChannel<any>, clientId: string): void {
    // Subscribe to global handlers
    for (const [cmdname, handler] of ServiceWorkerChannel.globalSubscribeMap) {
      channel.subscribe(cmdname, async (response) => {
        const meta = ServiceWorkerChannel.clientMeta.get(clientId)
        return handler({
          data: response.data || {},
          clientId,
          clientMeta: meta
        })
      })
    }
  }

  /**
   * Sets up Service Worker lifecycle event handlers.
   * @internal
   */
  private static setupLifecycleEvents(): void {
    // Install event
    self.addEventListener('install', ((() => {
      // Skip waiting to activate immediately
      if (typeof (self as any).skipWaiting === 'function') {
        (self as any).skipWaiting()
      }
    }) as EventListener))

    // Activate event
    self.addEventListener('activate', ((event: any) => {
      
      // Claim all clients and notify them
      const activatePromise = (async () => {
        if (typeof (self as any).clients?.claim === 'function') {
          await (self as any).clients.claim()
        }
        
        // Notify all clients to re-register
        await ServiceWorkerChannel.notifyAllClientsSwActivated()
      })()

      if (typeof event.waitUntil === 'function') {
        event.waitUntil(activatePromise)
      }
    }) as EventListener)
  }

  /**
   * Notifies all clients that the Service Worker has been activated.
   * Clients should re-register their metadata.
   * @internal
   */
  private static async notifyAllClientsSwActivated(): Promise<void> {
    try {
      const clients = await self.clients.matchAll()
      
      for (const client of clients) {
        client.postMessage({
          cmdname: '__sw-activated__',
          data: { version: ServiceWorkerChannel.hubOptions.version },
          _broadcast: true
        })
      }
    } catch (e) {
      console.error('[ServiceWorkerChannel] Error notifying clients:', e)
    }
  }

  /**
   * Cleans up inactive clients (those no longer in the clients list).
   * @internal
   */
  private static async cleanupInactiveClients(): Promise<void> {
    try {
      const activeClients = await self.clients.matchAll()
      const activeIds = new Set(activeClients.map(c => c.id))
      
      for (const [clientId] of ServiceWorkerChannel.channelsByClientId) {
        if (!activeIds.has(clientId)) {
          // Get channel and destroy it
          const channel = ServiceWorkerChannel.channelsByClientId.get(clientId)
          if (channel) {
            channel.destroy()
          }
          
          // Remove from meta
          ServiceWorkerChannel.clientMeta.delete(clientId)
          
          // Call user callback
          ServiceWorkerChannel.hubOptions.onClientDisconnect?.(clientId)
        }
      }
    } catch (e) {
      console.error('[ServiceWorkerChannel] Cleanup error:', e)
    }
  }

  /**
   * Broadcasts a message to all connected clients.
   * This is a one-way message - clients receive it via onBroadcast().
   * 
   * @param eventName - The event name for the broadcast
   * @param data - Data to send with the broadcast
   * @param excludeClientId - Optional client ID to exclude from broadcast
   * @returns Promise that resolves to the number of clients the message was sent to
   * 
   * @example
   * // Broadcast to all clients
   * const count = await ServiceWorkerChannel.broadcastToAll('notification', {
   *   title: 'New Update',
   *   body: 'Version 2.0 is available'
   * })
   * console.log(`Sent to ${count} clients`)
   */
  static async broadcastToAll(eventName: string, data?: Record<string, any>, excludeClientId?: string): Promise<number> {
    if (!ServiceWorkerChannel.hubInitialized) {
      console.warn('[ServiceWorkerChannel] Hub not initialized. Call setupHub() first.')
      return 0
    }

    try {
      const activeClients = await self.clients.matchAll()
      let sentCount = 0

      for (const client of activeClients) {
        // Skip excluded client
        if (excludeClientId && client.id === excludeClientId) {
          continue
        }

        const channel = ServiceWorkerChannel.channelsByClientId.get(client.id)
        if (channel) {
          try {
            channel.broadcast(eventName, {
              ...data,
              _fromHub: true,
              _timestamp: Date.now()
            })
            sentCount++
          } catch (e) {
            console.warn('[ServiceWorkerChannel] Failed to broadcast to client:', client.id, e)
          }
        }
      }

      return sentCount
    } catch (e) {
      console.error('[ServiceWorkerChannel] broadcastToAll error:', e)
      return 0
    }
  }

  /**
   * Broadcasts a message to clients of a specific type.
   * Only clients that registered with matching appType will receive the message.
   * 
   * @param targetType - The appType to target
   * @param eventName - The event name for the broadcast
   * @param data - Data to send with the broadcast
   * @param excludeClientId - Optional client ID to exclude from broadcast
   * @returns Promise that resolves to the number of clients the message was sent to
   * 
   * @example
   * // Broadcast to all 'cart' type clients
   * const count = await ServiceWorkerChannel.broadcastToType('cart', 'priceUpdate', {
   *   productId: 123,
   *   newPrice: 99.99
   * })
   */
  static async broadcastToType(targetType: string, eventName: string, data?: Record<string, any>, excludeClientId?: string): Promise<number> {
    if (!ServiceWorkerChannel.hubInitialized) {
      console.warn('[ServiceWorkerChannel] Hub not initialized. Call setupHub() first.')
      return 0
    }

    try {
      const activeClients = await self.clients.matchAll()
      let sentCount = 0

      for (const client of activeClients) {
        // Skip excluded client
        if (excludeClientId && client.id === excludeClientId) {
          continue
        }

        // Check if client matches target type
        const meta = ServiceWorkerChannel.clientMeta.get(client.id)
        if (!meta || meta.appType !== targetType) {
          continue
        }

        const channel = ServiceWorkerChannel.channelsByClientId.get(client.id)
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
            console.warn('[ServiceWorkerChannel] Failed to broadcast to client:', client.id, e)
          }
        }
      }

      return sentCount
    } catch (e) {
      console.error('[ServiceWorkerChannel] broadcastToType error:', e)
      return 0
    }
  }

  /**
   * Gets metadata for a specific client.
   * 
   * @param clientId - The client ID to look up
   * @returns The client metadata, or undefined if not found
   * 
   * @example
   * const meta = ServiceWorkerChannel.getClientInfo('abc-123')
   * if (meta) {
   *   console.log('Client type:', meta.appType)
   * }
   */
  static getClientInfo(clientId: string): ClientMeta | undefined {
    return ServiceWorkerChannel.clientMeta.get(clientId)
  }

  /**
   * Gets metadata for all registered clients.
   * 
   * @returns A Map of clientId -> ClientMeta
   * 
   * @example
   * const allClients = ServiceWorkerChannel.getAllClients()
   * for (const [id, meta] of allClients) {
   *   console.log(`${meta.appName}: ${meta.appType}`)
   * }
   */
  static getAllClients(): Map<string, ClientMeta> {
    return new Map(ServiceWorkerChannel.clientMeta)
  }

  /**
   * Gets metadata for clients of a specific type.
   * 
   * @param type - The appType to filter by
   * @returns Array of ClientMeta for matching clients
   * 
   * @example
   * const cartClients = ServiceWorkerChannel.getClientsByType('cart')
   * console.log(`${cartClients.length} cart clients connected`)
   */
  static getClientsByType(type: string): ClientMeta[] {
    const result: ClientMeta[] = []
    for (const meta of ServiceWorkerChannel.clientMeta.values()) {
      if (meta.appType === type) {
        result.push(meta)
      }
    }
    return result
  }

  /**
   * Registers a global handler that will be applied to all client channels.
   * This is the recommended way to define message handlers in the Service Worker
   * when using setupHub().
   * 
   * @param cmdname - The command name to handle
   * @param handler - The handler function
   * 
   * @example
   * ServiceWorkerChannel.subscribeGlobal('echo', ({ data, clientId, clientMeta }) => {
   *   console.log(`Echo from ${clientMeta?.appName}:`, data.message)
   *   return { echoed: data.message }
   * })
   * 
   * @example
   * // Async handler
   * ServiceWorkerChannel.subscribeGlobal('fetchData', async ({ data }) => {
   *   const response = await fetch(data.url)
   *   return await response.json()
   * })
   */
  static subscribeGlobal(cmdname: string, handler: GlobalSubscribeHandler): void {
    if (cmdname.startsWith('__')) {
      console.warn(`[ServiceWorkerChannel] Handler name '${cmdname}' uses reserved prefix '__'. This may conflict with internal handlers.`)
    }

    ServiceWorkerChannel.globalSubscribeMap.set(cmdname, handler)

    // Apply to existing channels
    for (const [clientId, channel] of ServiceWorkerChannel.channelsByClientId) {
      channel.subscribe(cmdname, async (response) => {
        const meta = ServiceWorkerChannel.clientMeta.get(clientId)
        return handler({
          data: response.data || {},
          clientId,
          clientMeta: meta
        })
      })
    }
  }

  /**
   * Unregisters a global handler.
   * 
   * @param cmdname - The command name to unregister
   */
  static unsubscribeGlobal(cmdname: string): void {
    ServiceWorkerChannel.globalSubscribeMap.delete(cmdname)

    // Remove from existing channels
    for (const channel of ServiceWorkerChannel.channelsByClientId.values()) {
      channel.unSubscribe(cmdname)
    }
  }

  /**
   * Global message handler that routes messages to the correct channel.
   * @internal
   */
  private static globalMessageHandler = (event: MessageEvent): void => {
    const source = (event as unknown as ExtendableMessageEventType).source
    const clientId = source?.id
    
    if (!clientId) {
      // No client ID, can't route
      return
    }
    
    const channel = ServiceWorkerChannel.channelsByClientId.get(clientId)
    
    if (channel) {
      // Route to existing channel
      channel.handleMessage(event)
    } else if (ServiceWorkerChannel.unknownClientCallback) {
      // No channel for this client, but we have a callback to handle it
      ServiceWorkerChannel.unknownClientCallback(clientId, event)
    }
    // If no channel and no callback, message is silently ignored
  }

  /**
   * Registers a channel in the global routing map.
   * Called automatically when channel is created with global routing enabled.
   * @internal
   */
  private registerInGlobalRouter(): void {
    if (this.isWorkerSide && this.clientId && ServiceWorkerChannel.useGlobalRouting) {
      ServiceWorkerChannel.channelsByClientId.set(this.clientId, this)
    }
  }

  /**
   * Unregisters a channel from the global routing map.
   * Called automatically when channel is destroyed.
   * @internal
   */
  private unregisterFromGlobalRouter(): void {
    if (this.isWorkerSide && this.clientId) {
      ServiceWorkerChannel.channelsByClientId.delete(this.clientId)
    }
  }

  /**
   * Gets the channel for a specific client ID (SW side only).
   * @param clientId - The client ID to look up
   * @returns The channel for this client, or undefined if not found
   */
  static getChannelByClientId(clientId: string): ServiceWorkerChannel<any> | undefined {
    return ServiceWorkerChannel.channelsByClientId.get(clientId)
  }

  /**
   * Checks if a channel exists for a specific client ID.
   * @param clientId - The client ID to check
   * @returns true if a channel exists for this client
   */
  static hasChannel(clientId: string): boolean {
    return ServiceWorkerChannel.channelsByClientId.has(clientId)
  }

  /**
   * Gets the number of active channels.
   * @returns The number of active channels in the global router
   */
  static getChannelCount(): number {
    return ServiceWorkerChannel.channelsByClientId.size
  }

  /**
   * Manually handle a message event.
   * Useful when you need to process a message that arrived before the channel was created.
   * 
   * @param event - The message event to handle
   * @returns Promise that resolves when message is processed
   * 
   * @example
   * // In unknownClientCallback
   * ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
   *   const channel = ServiceWorkerChannel.createFromWorker(clientId, opts)
   *   channel.handleMessage(event) // Process the current message
   * })
   */
  handleMessage(event: MessageEvent): Promise<void> {
    return this.onMessage(event)
  }

  /**
   * Creates a new ServiceWorkerChannel instance.
   *
   * @param target - The communication target:
   *   - **ServiceWorker**: Service Worker instance (page side)
   *   - **string**: Client ID (Service Worker side)
   * @param opt - Configuration options
   *
   * @throws {Error} If page side doesn't receive a valid ServiceWorker instance
   * @throws {Error} If Service Worker side doesn't receive a clientId string
   *
   * @example
   * // Page side
   * const channel = new ServiceWorkerChannel(navigator.serviceWorker.controller)
   *
   * @example
   * // Service Worker side
   * const channel = new ServiceWorkerChannel(clientId, { isWorkerSide: true })
   */
  constructor(target: ServiceWorker | string | null, opt?: ServiceWorkerChannelOption) {
    super(opt)

    this.isWorkerSide = opt?.isWorkerSide ?? false

    if (this.isWorkerSide) {
      // Service Worker side
      if (typeof target !== 'string') {
        throw new Error('Service Worker 端必须传入 clientId 字符串')
      }
      this.clientId = target
      this.baseKey = generateUniqueId('sw_')
    } else {
      // Page side
      if (!target || typeof target === 'string') {
        throw new Error('页面端必须传入有效的 ServiceWorker 实例')
      }
      this.worker = target
      this.swContainer = navigator.serviceWorker
      this.baseKey = generateUniqueId('page_')
    }

    this.log('log', 'baseKey', this.baseKey, this.isWorkerSide ? 'worker' : 'page')
    
    // Register in global router before init
    this.registerInGlobalRouter()
    
    this.init()
  }

  /** @internal */
  protected setupMessageListener(): void {
    if (this.isWorkerSide) {
      // If global routing is enabled, don't add individual listener
      if (ServiceWorkerChannel.useGlobalRouting) {
        // Ensure global listener is set up
        if (!ServiceWorkerChannel.globalListenerSetup) {
          self.addEventListener('message', ServiceWorkerChannel.globalMessageHandler)
          ServiceWorkerChannel.globalListenerSetup = true
        }
        // Don't add individual listener
        return
      }
      self.addEventListener('message', this.bindOnMessage)
    } else {
      this.swContainer?.addEventListener('message', this.bindOnMessage)
    }
  }

  /** @internal */
  protected removeMessageListener(): void {
    // Unregister from global router
    this.unregisterFromGlobalRouter()
    
    if (this.isWorkerSide) {
      // If global routing is enabled, don't remove (we share the listener)
      if (ServiceWorkerChannel.useGlobalRouting) {
        return
      }
      self.removeEventListener('message', this.bindOnMessage)
    } else {
      this.swContainer?.removeEventListener('message', this.bindOnMessage)
    }
  }

  /** @internal */
  protected sendRawMessage(data: Record<string, unknown>, transferables?: Transferable[]): void {
    try {
      // Clone message to ensure data is safely transferable
      const messageData = cloneMessage(data)

      if (this.isWorkerSide) {
        this.sendToClient(messageData, transferables)
      } else {
        if (transferables && transferables.length > 0) {
          this.worker?.postMessage(messageData, transferables)
        } else {
          this.worker?.postMessage(messageData)
        }
      }
    } catch (e) {
      this.log('error', 'sendMessage error', e, data)
    }
  }

  /**
   * Sends a message to the specified client from Service Worker.
   * @param data - Message data to send
   * @param transferables - Optional transferable objects
   * @internal
   */
  private async sendToClient(data: Record<string, unknown>, transferables?: Transferable[]): Promise<void> {
    const clientId = this.clientId
    if (!clientId) {
      this.log('error', 'No clientId available')
      return
    }

    try {
      const client = await self.clients.get(clientId)
      if (client) {
        if (transferables && transferables.length > 0) {
          client.postMessage(data, transferables)
        } else {
          client.postMessage(data)
        }
      } else {
        this.log('warn', 'Client not found:', clientId)
      }
    } catch (e) {
      this.log('error', 'sendToClient error', e)
    }
  }

  /** @internal */
  protected isValidSource(event: MessageEvent): boolean {
    if (this.isWorkerSide) {
      // Service Worker side: verify message is from correct client
      const source = event.source as unknown as ClientType | null
      return source?.id === this.clientId
    }
    // Page side: trust messages from ServiceWorkerContainer
    return true
  }

  /** @internal */
  protected log(type: 'log' | 'warn' | 'error', ...args: unknown[]): void {
    const side = this.isWorkerSide ? 'worker' : 'page'
    this.console?.[type]?.(`[ServiceWorkerChannel](${side}): `, ...args)
  }

  /**
   * Gets the client ID (Service Worker side only).
   * @returns The client ID, or undefined on page side
   */
  getClientId(): string | undefined {
    return this.clientId
  }

  /**
   * Checks if the Service Worker is available and active.
   * @returns `true` if on Worker side or if page-side Worker is activated
   */
  isWorkerAvailable(): boolean {
    return this.isWorkerSide || this.worker?.state === 'activated'
  }

  /**
   * Refreshes the Service Worker reference (page side only).
   * Call this after Service Worker updates to ensure messages go to the new SW.
   * 
   * @returns Promise that resolves when the new worker is available
   * @throws {Error} If called on Service Worker side
   * 
   * @example
   * // After SW update notification
   * await channel.refreshWorker()
   * await channel.publish('register', { ... })
   */
  async refreshWorker(): Promise<void> {
    if (this.isWorkerSide) {
      throw new Error('refreshWorker() can only be called on page side')
    }
    
    const registration = await navigator.serviceWorker.ready
    const newWorker = registration.active || navigator.serviceWorker.controller
    
    if (newWorker) {
      this.worker = newWorker
      
      // Reset pairing state to re-establish connection with new SW
      this.peerKey = ''
      this.isReady = false
      
      // Re-send ready message to establish new pairing
      this.sendMessage({
        requestId: this.baseKey + this.reqTime,
        msg: 'ready',
        _senderKey: this.baseKey
      })
    } else {
      console.warn('[ServiceWorkerChannel] No active Service Worker found during refresh')
    }
  }

  /**
   * Creates a ServiceWorkerChannel on the page side, waiting for
   * the Service Worker to be ready.
   *
   * @template T - Optional interface defining available remote methods
   * @param opt - Configuration options including Hub-specific options
   * @returns Promise that resolves to a ready ServiceWorkerChannel
   * @throws {Error} If Service Worker is not supported
   * @throws {Error} If no active Service Worker is found
   * @throws {Error} If SW registration fails (when swUrl is provided)
   *
   * @example
   * // Basic usage (SW must be registered separately)
   * const channel = await ServiceWorkerChannel.createFromPage()
   * await channel.publish('sync', { data: 'test' })
   * 
   * @example
   * // Auto-register SW and connect (recommended for simple setup)
   * const channel = await ServiceWorkerChannel.createFromPage({
   *   swUrl: '/sw.js',       // Auto-register SW
   *   appType: 'cart',
   *   appName: 'Shopping Cart'
   * })
   * 
   * @example
   * // With Hub integration (auto-register and auto-reconnect)
   * const channel = await ServiceWorkerChannel.createFromPage({
   *   appType: 'cart',
   *   appName: 'Shopping Cart',
   *   autoReconnect: true  // default
   * })
   * 
   * @example
   * // With type safety
   * interface SWMethods { sync(p: { data: string }): void }
   * const channel = await ServiceWorkerChannel.createFromPage<SWMethods>()
   * await channel.call('sync', { data: 'test' })
   */
  static async createFromPage<T extends Methods = Methods>(opt?: PageChannelOptions): Promise<ServiceWorkerChannel<T>> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker is not supported in this browser')
    }

    // Auto-register SW if swUrl is provided
    if (opt?.swUrl) {
      try {
        const regOptions: RegistrationOptions = {}
        if (opt.swScope) {
          regOptions.scope = opt.swScope
        }
        await navigator.serviceWorker.register(opt.swUrl, regOptions)
      } catch (e) {
        console.error('[ServiceWorkerChannel] Failed to register Service Worker:', e)
        throw e
      }
    }

    const registration = await navigator.serviceWorker.ready
    const worker = registration.active || navigator.serviceWorker.controller

    if (!worker) {
      throw new Error('No active Service Worker found')
    }

    const channel = new ServiceWorkerChannel<T>(worker, opt)

    // Hub integration: auto-register if appType or appName provided
    const hasHubOptions = opt?.appType || opt?.appName
    let isRegistered = false
    let isRegistering = false

    const registerClient = async () => {
      // Prevent concurrent or duplicate registrations
      if (isRegistering) return
      isRegistering = true
      
      try {
        await channel.publish('__register__', {
          appType: opt?.appType,
          appName: opt?.appName
        })
        isRegistered = true
      } catch (e) {
        console.warn('[ServiceWorkerChannel] Auto-registration failed:', e)
      } finally {
        isRegistering = false
      }
    }

    if (hasHubOptions) {
      // Register after channel is ready
      if (channel.isReady) {
        registerClient()
      } else {
        channel.once('ready', registerClient)
      }
    }

    // Hub integration: listen for SW activation and emit event
    const autoReconnect = opt?.autoReconnect !== false  // default true
    if (autoReconnect) {
      channel.onBroadcast('__sw-activated__', async ({ data }) => {
        // Emit event for users to handle reconnection
        channel.emit('sw-activated', { version: data?.version })
        
        // Auto re-register if we have Hub options
        if (hasHubOptions) {
          // Refresh worker reference to point to new SW
          await channel.refreshWorker()
          
          // Reset registered flag for re-registration
          isRegistered = false
          await registerClient()
        }
      })
    }

    return channel
  }

  /**
   * Creates a ServiceWorkerChannel on the Service Worker side
   * for communicating with a specific client.
   *
   * @template T - Optional interface defining available remote methods
   * @param clientId - The client ID to communicate with
   * @param opt - Configuration options (isWorkerSide is automatically set)
   * @returns A new ServiceWorkerChannel configured for Worker side
   *
   * @example
   * self.addEventListener('message', (event) => {
   *   const channel = ServiceWorkerChannel.createFromWorker(event.source.id)
   *   channel.subscribe('ping', () => ({ pong: true }))
   * })
   */
  static createFromWorker<T extends Methods = Methods>(clientId: string, opt?: Omit<ServiceWorkerChannelOption, 'isWorkerSide'>): ServiceWorkerChannel<T> {
    return new ServiceWorkerChannel<T>(clientId, { ...opt, isWorkerSide: true })
  }

  /**
   * Creates a ServiceWorkerChannel from a message event in Service Worker.
   * Extracts the client ID from the event source automatically.
   *
   * @template T - Optional interface defining available remote methods
   * @param event - The message event received in Service Worker
   * @param opt - Configuration options (isWorkerSide is automatically set)
   * @returns A new ServiceWorkerChannel for the event source
   * @throws {Error} If the event has no valid client source
   *
   * @example
   * self.addEventListener('message', (event) => {
   *   const channel = ServiceWorkerChannel.createFromEvent(event)
   *   // Handle messages from this client
   * })
   */
  static createFromEvent<T extends Methods = Methods>(event: ExtendableMessageEventType | MessageEvent, opt?: Omit<ServiceWorkerChannelOption, 'isWorkerSide'>): ServiceWorkerChannel<T> {
    const source = (event as ExtendableMessageEventType).source as ClientType
    if (!source?.id) {
      throw new Error('Invalid message event: no client source')
    }
    return ServiceWorkerChannel.createFromWorker<T>(source.id, opt)
  }
}
