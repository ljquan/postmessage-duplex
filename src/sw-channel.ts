import BaseChannel, { ChannelOption, generateUniqueId } from './base-channel'
import { Methods } from './interface'

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
  private readonly worker?: ServiceWorker | null

  /** Client ID (Service Worker side only) */
  private readonly clientId?: string

  /** ServiceWorkerContainer reference (page side only) */
  private readonly swContainer?: ServiceWorkerContainer

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
    this.init()
  }

  /** @internal */
  protected setupMessageListener(): void {
    if (this.isWorkerSide) {
      self.addEventListener('message', this.bindOnMessage)
    } else {
      this.swContainer?.addEventListener('message', this.bindOnMessage)
    }
  }

  /** @internal */
  protected removeMessageListener(): void {
    if (this.isWorkerSide) {
      self.removeEventListener('message', this.bindOnMessage)
    } else {
      this.swContainer?.removeEventListener('message', this.bindOnMessage)
    }
  }

  /** @internal */
  protected sendRawMessage(data: Record<string, unknown>, transferables?: Transferable[]): void {
    try {
      // JSON serialization ensures data is cloneable
      const messageData = JSON.parse(JSON.stringify(data))

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
   * Creates a ServiceWorkerChannel on the page side, waiting for
   * the Service Worker to be ready.
   *
   * @template T - Optional interface defining available remote methods
   * @param opt - Configuration options
   * @returns Promise that resolves to a ready ServiceWorkerChannel
   * @throws {Error} If Service Worker is not supported
   * @throws {Error} If no active Service Worker is found
   *
   * @example
   * const channel = await ServiceWorkerChannel.createFromPage()
   * await channel.publish('sync', { data: 'test' })
   * 
   * @example
   * // With type safety
   * interface SWMethods { sync(p: { data: string }): void }
   * const channel = await ServiceWorkerChannel.createFromPage<SWMethods>()
   * await channel.call('sync', { data: 'test' })
   */
  static async createFromPage<T extends Methods = Methods>(opt?: ServiceWorkerChannelOption): Promise<ServiceWorkerChannel<T>> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker is not supported in this browser')
    }

    const registration = await navigator.serviceWorker.ready
    const worker = registration.active || navigator.serviceWorker.controller

    if (!worker) {
      throw new Error('No active Service Worker found')
    }

    return new ServiceWorkerChannel<T>(worker, opt)
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
