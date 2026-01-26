import {
  Communicator,
  PostRequest,
  PostResponse,
  PostCallback,
  PostTask,
  PostFailedCallback,
  ReturnCode,
  PublishOptions,
  Methods,
  MethodParams,
  MethodReturn,
  TypedPostResponse
} from './interface'
import { ChannelError, ErrorCode } from './errors'
import { TimeoutManager } from './timeout-manager'
import { SlidingWindowRateLimiter } from './rate-limiter'
import { ChannelEventEmitter } from './event-emitter'
import {
  validateMessage,
  ChannelMessage,
  estimateMessageSize,
  isResponseMessage,
  isReadyMessage
} from './validators'
import { registerChannel, unregisterChannel } from './debugger'

/**
 * Logger function signature.
 * @callback Log
 * @param args - Arguments to log
 */
export interface Log {
  (...args: unknown[]): void
}

/**
 * Console interface for logging.
 * @interface Console
 */
export interface Console {
  /** Optional info level logger */
  info?: Log
  /** Standard log level logger */
  log: Log
  /** Warning level logger */
  warn: Log
  /** Error level logger */
  error: Log
}

/**
 * Configuration options for channel initialization.
 * @interface ChannelOption
 */
export interface ChannelOption {
  /**
   * Request timeout in milliseconds.
   * @default 5000
   */
  timeout?: number
  /**
   * Custom console object for logging.
   * @default window.console
   */
  log?: Console
  /**
   * Pre-defined message subscriptions.
   * Map of command names to handler functions.
   */
  subscribeMap?: Record<string, PostCallback>
  /**
   * Maximum message size in bytes (after JSON serialization).
   * Messages exceeding this limit will throw an error.
   * @default 1048576 (1MB)
   */
  maxMessageSize?: number
  /**
   * Maximum messages per second (rate limiting).
   * Set to 0 to disable rate limiting.
   * @default 100
   */
  rateLimit?: number
  /**
   * Enable strict message validation.
   * When enabled, malformed messages will be rejected with an event.
   * @default true
   */
  strictValidation?: boolean
}

/**
 * Generates a unique ID for channel identification.
 * Uses crypto.getRandomValues when available for better randomness.
 * @param prefix - Prefix string for the ID (e.g., 'iframe_', 'sw_')
 * @returns A unique identifier string
 * @example
 * const id = generateUniqueId('iframe_')
 * // Returns something like: 'iframe_m1abc123xyz_'
 */
export function generateUniqueId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  let random: string
  
  // Use crypto for better randomness when available
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(2)
    crypto.getRandomValues(array)
    random = array[0].toString(36) + array[1].toString(36)
  } else {
    random = Math.floor(Math.random() * 1e10).toString(36)
  }
  
  return `${prefix}${timestamp}${random}_`
}

/**
 * Abstract base class providing common postMessage duplex communication logic.
 * Implements the Communicator interface and provides:
 * - Request-response pattern with Promise support
 * - Message queuing until channel is ready
 * - Efficient timeout handling using TimeoutManager
 * - Optimized rate limiting using sliding window algorithm
 * - Message validation for security
 * - Lifecycle events for monitoring
 * - Point-to-point communication validation
 * - Message tracing for debugging
 *
 * @abstract
 * @class BaseChannel
 * @extends ChannelEventEmitter
 * @implements {Communicator}
 * @template TMethods - Optional interface defining available remote methods for type-safe calls
 *
 * @example
 * // Subclass implementation
 * class MyChannel extends BaseChannel {
 *   protected readonly channelType = 'my-channel'
 *
 *   protected setupMessageListener(): void {
 *     window.addEventListener('message', this.bindOnMessage)
 *   }
 *
 *   protected removeMessageListener(): void {
 *     window.removeEventListener('message', this.bindOnMessage)
 *   }
 *
 *   protected sendRawMessage(data: Record<string, unknown>): void {
 *     targetWindow.postMessage(data, '*')
 *   }
 *
 *   protected isValidSource(event: MessageEvent): boolean {
 *     return event.source === expectedSource
 *   }
 * }
 * 
 * @example
 * // Using lifecycle events
 * const channel = new IframeChannel(iframe)
 * 
 * channel.on('ready', ({ peerKey }) => {
 *   console.log('Connected to:', peerKey)
 * })
 * 
 * channel.on('timeout', ({ cmdname, requestId }) => {
 *   console.log('Request timed out:', cmdname)
 * })
 * 
 * channel.on('error', ({ error }) => {
 *   reportError(error)
 * })
 */
export default abstract class BaseChannel<TMethods extends Methods = Methods>
  extends ChannelEventEmitter
  implements Communicator<TMethods> {
  /** Unique prefix for request IDs, used for response matching */
  protected baseKey = ''

  /** Remote peer's baseKey for point-to-point validation */
  protected peerKey = ''

  /** Counter for generating sequential request IDs */
  protected reqTime = 0

  /** Map of pending request callbacks indexed by requestId */
  protected callbackMap = new Map<string, { resolve: PostCallback; reject: PostFailedCallback }>()

  /** Map of subscribed message handlers indexed by command name */
  protected subscribeMap = new Map<string, PostCallback>()

  /** Request timeout duration in milliseconds */
  protected timeout: number

  /**
   * Indicates whether the channel is ready for communication.
   * Messages sent before ready are queued and sent automatically when ready.
   */
  isReady = false

  /**
   * Indicates whether the channel has been destroyed.
   * After destruction, no more messages can be sent.
   */
  protected isDestroyed = false

  /** Queue of pending tasks waiting for channel to be ready */
  protected postTasks = new Map<string, PostTask>()

  /** Bound onMessage handler for consistent listener reference */
  protected bindOnMessage: (event: MessageEvent) => void

  /** Console instance for logging */
  protected console: Console

  /** Maximum message size in bytes */
  protected maxMessageSize: number

  /** Efficient timeout manager using single timer */
  private timeoutManager: TimeoutManager

  /** Optimized rate limiter using sliding window */
  private rateLimiter: SlidingWindowRateLimiter

  /** Whether strict message validation is enabled */
  private strictValidation: boolean

  /** Map of requestId to cmdname for timeout events */
  private requestCmdMap = new Map<string, string>()

  /**
   * Channel type identifier for logging and debugging.
   * Must be implemented by subclasses.
   */
  protected abstract readonly channelType: string

  /**
   * Creates a new BaseChannel instance.
   * @param opt - Configuration options
   */
  constructor(opt?: ChannelOption) {
    super()
    this.timeout = opt?.timeout ?? 5000
    this.console = opt?.log ?? (typeof window !== 'undefined' ? window.console : console) as Console
    this.maxMessageSize = opt?.maxMessageSize ?? 1024 * 1024 // 1MB default
    this.strictValidation = opt?.strictValidation ?? true
    
    // Initialize efficient timeout manager
    this.timeoutManager = new TimeoutManager()
    
    // Initialize optimized rate limiter
    const rateLimit = opt?.rateLimit ?? 100
    this.rateLimiter = new SlidingWindowRateLimiter(rateLimit, 1000)
    
    // Initialize pre-defined subscriptions
    if (opt?.subscribeMap) {
      for (const key in opt.subscribeMap) {
        this.subscribeMap.set(key, opt.subscribeMap[key])
      }
    }
    
    this.bindOnMessage = this.onMessage.bind(this)
    
    // Register channel to debugger (zero overhead if debugger not enabled)
    registerChannel(this)
  }

  /**
   * Checks if sending is within rate limits.
   * Uses optimized sliding window algorithm for O(1) performance.
   * @returns true if message can be sent, false if rate limited
   * @protected
   */
  protected checkRateLimit(): boolean {
    if (!this.rateLimiter.isEnabled()) return true
    
    if (!this.rateLimiter.tryAcquire()) {
      const currentCount = this.rateLimiter.getCurrentCount()
      const limit = this.rateLimiter.getLimit()
      this.log('warn', 'Rate limit exceeded:', currentCount, '/', limit, 'messages per second')
      this.emit('rate:limited', { currentCount, limit })
      return false
    }
    
    return true
  }

  /**
   * Validates message size against the configured limit.
   * Uses efficient size estimation.
   * @param data - The message data to validate
   * @throws {ChannelError} If message exceeds size limit
   * @protected
   */
  protected validateMessageSize(data: Record<string, unknown>): void {
    if (this.maxMessageSize <= 0) return // Disabled
    
    const size = estimateMessageSize(data)
    if (size > this.maxMessageSize) {
      const error = new ChannelError(
        `Message size (${size} bytes) exceeds limit (${this.maxMessageSize} bytes)`,
        ErrorCode.MessageSizeExceeded,
        { size, limit: this.maxMessageSize }
      )
      this.emit('error', { error, context: 'validateMessageSize' })
      throw error
    }
  }

  /**
   * Initializes the channel by setting up listeners and sending ready message.
   * Must be called by subclass constructors after baseKey is set.
   * @protected
   */
  protected init(): void {
    this.setupMessageListener()
    // Send ready message with senderKey for point-to-point pairing
    this.sendMessage({
      requestId: this.baseKey + this.reqTime,
      msg: 'ready',
      _senderKey: this.baseKey
    })
  }

  /**
   * Logs a message with the specified level.
   * @param type - Log level ('log', 'warn', or 'error')
   * @param args - Arguments to log
   * @protected
   */
  protected log(type: 'log' | 'warn' | 'error', ...args: unknown[]): void {
    this.console?.[type]?.(`[${this.channelType}]: `, ...args)
  }

  /**
   * Sets up the message event listener.
   * Must be implemented by subclasses.
   * @abstract
   * @protected
   */
  protected abstract setupMessageListener(): void

  /**
   * Removes the message event listener.
   * Must be implemented by subclasses.
   * @abstract
   * @protected
   */
  protected abstract removeMessageListener(): void

  /**
   * Sends a raw message to the target.
   * Must be implemented by subclasses.
   * @param data - Message data to send
   * @param transferables - Optional transferable objects
   * @abstract
   * @protected
   */
  protected abstract sendRawMessage(data: Record<string, unknown>, transferables?: Transferable[]): void

  /**
   * Validates that a message event comes from the expected source.
   * This is layer 1 validation based on physical channel.
   * Must be implemented by subclasses.
   * @param event - The MessageEvent to validate
   * @returns true if the source is valid
   * @abstract
   * @protected
   */
  protected abstract isValidSource(event: MessageEvent): boolean

  /**
   * Validates that a message comes from the paired peer.
   * This is layer 2 validation for point-to-point communication.
   * @param data - The message data to validate
   * @returns true if message is from the paired peer
   * @protected
   */
  protected isFromPeer(data: ChannelMessage): boolean {
    // Allow ready messages when pairing not yet established
    if (!this.peerKey) {
      return true
    }
    // Verify senderKey matches peerKey
    if (data._senderKey && data._senderKey !== this.peerKey) {
      this.log('log', 'Message from non-paired channel, ignored', data._senderKey, 'expected:', this.peerKey)
      return false
    }
    // For response messages, verify requestId was sent by us
    if (isResponseMessage(data) && data.requestId && !data.requestId.startsWith(this.baseKey)) {
      return false
    }
    return true
  }

  /**
   * Sends a message with timestamp and sender key automatically added.
   * Validates message size and rate limits before sending.
   * @param data - Message data to send
   * @param transferables - Optional transferable objects
   * @throws {ChannelError} If message exceeds size limit
   * @protected
   */
  protected sendMessage(data: Record<string, unknown>, transferables?: Transferable[]): void {
    // Validate message size
    this.validateMessageSize(data)
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      this.log('warn', 'Message dropped due to rate limiting')
      return
    }
    
    data.time = Date.now()
    data._senderKey = this.baseKey
    this.sendRawMessage(data, transferables)
  }

  /**
   * Handles incoming messages.
   * Processes responses, executes subscribed handlers, and manages ready handshake.
   * @param event - The MessageEvent received
   * @protected
   */
  protected async onMessage(event: MessageEvent): Promise<void> {
    this.log('log', 'onMessage', event.data)

    // Layer 1: Physical channel validation
    if (!this.isValidSource(event)) {
      return
    }

    // Layer 2: Message structure validation (P0 security enhancement)
    if (this.strictValidation) {
      const validationResult = validateMessage(event.data)
      if (!validationResult.valid) {
        this.log('warn', 'Invalid message structure:', validationResult.error)
        this.emit('validation:failed', { reason: validationResult.error!, data: event.data })
        return
      }
    }

    const data = event.data as ChannelMessage
    if (!data) return

    // Layer 3: Point-to-point pairing validation
    if (!this.isFromPeer(data)) {
      return
    }

    // Emit message received event
    this.emit('message:received', {
      cmdname: data.cmdname || '',
      requestId: data.requestId || '',
      isResponse: isResponseMessage(data)
    })

    const { requestId, cmdname, msg, _senderKey } = data

    // Check for pending callback (this is a response to our request)
    const callback = requestId ? this.callbackMap.get(requestId) : undefined
    
    if (callback && requestId) {
      // Cancel the timeout for this request
      this.timeoutManager.remove(requestId)
      this.requestCmdMap.delete(requestId)
      
      callback.resolve(data as unknown as PostResponse)
      this.deleteCallback(requestId)
      return
    }
    
    // Check for subscribed handler
    if (cmdname) {
      const handler = this.subscribeMap.get(cmdname)
      if (handler) {
        try {
          const rsp = await handler(data as unknown as PostResponse)
          this.sendMessage({
            requestId,
            ret: ReturnCode.Success,
            data: rsp
          })
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e)
          this.sendMessage({
            req: data,
            requestId,
            ret: ReturnCode.ReceiverCallbackError,
            msg: errorMessage || 'unknown error'
          })
          this.emit('error', {
            error: e instanceof Error ? e : new Error(errorMessage),
            context: `handler:${cmdname}`
          })
        }
        return
      }
    }
    
    // Handle ready message for channel pairing
    if (isReadyMessage(data)) {
      if (_senderKey && !this.peerKey) {
        this.peerKey = _senderKey
        this.log('log', 'Point-to-point pairing established', 'self:', this.baseKey, 'peer:', this.peerKey)
      }
      this.isReady = true
      this.executePosts()
      
      // Emit ready event
      this.emit('ready', { peerKey: this.peerKey })
      
      if (!isResponseMessage(data)) {
        this.sendMessage({
          requestId,
          ret: ReturnCode.Success,
          msg: 'ready'
        })
      }
      return
    }
    
    // No handler registered
    if (requestId && !isResponseMessage(data)) {
      this.log('warn', 'No registered handler for:', cmdname || requestId)
      this.sendMessage({
        requestId,
        ret: ReturnCode.NoSubscribe
      })
    }
  }

  /**
   * Sends a message with error handling and tracing.
   * @param data - Message data to send
   * @param transferables - Optional transferable objects
   * @protected
   */
  protected postMessage(data: Record<string, unknown>, transferables?: Transferable[]): void {
    try {
      this.sendMessage(data, transferables)
      
      // Emit message sent event
      const request = data as Partial<PostRequest>
      this.emit('message:sent', {
        cmdname: request.cmdname || '',
        requestId: request.requestId || ''
      })
    } catch (e) {
      this.log('error', e, data)
      this.emit('error', {
        error: e instanceof Error ? e : new Error(String(e)),
        context: 'postMessage'
      })
    }
  }

  /**
   * Publishes a message to the remote channel and waits for response.
   * If the channel is not ready, the message is queued.
   * @param cmdname - The command name to identify the message type
   * @param data - Optional payload data to send
   * @param options - Optional publish options (timeout, transferables)
   * @returns Promise that resolves with the response
   * @example
   * // Basic usage
   * const response = await channel.publish('getData', { id: 123 })
   * if (response.ret === ReturnCode.Success) {
   *   console.log('Data:', response.data)
   * } else if (response.ret === ReturnCode.TimeOut) {
   *   console.error('Request timed out')
   * }
   * 
   * // With custom timeout
   * const response = await channel.publish('slowOp', { id: 123 }, { timeout: 30000 })
   * 
   * // With transferables
   * const buffer = new ArrayBuffer(1024)
   * const response = await channel.publish('sendBuffer', { buffer }, { transferables: [buffer] })
   */
  publish(cmdname: string, data?: Record<string, unknown>, options?: PublishOptions): Promise<PostResponse> {
    // Check if channel has been destroyed
    if (this.isDestroyed) {
      return Promise.reject(new ChannelError(
        'Cannot publish: channel has been destroyed',
        ErrorCode.ConnectionDestroyed,
        { cmdname }
      ))
    }
    
    const requestId = this.baseKey + (++this.reqTime)
    const requestData: PostRequest = { requestId, cmdname, data }
    
    // Store cmdname for timeout event
    this.requestCmdMap.set(requestId, cmdname)
    
    const prm = new Promise<PostResponse>((resolve: PostCallback, reject: PostFailedCallback) => {
      this.callbackMap.set(requestId, { resolve, reject })
    })
    
    this.log('log', 'publish', this.isReady, this.postTasks.size)
    
    if (this.isReady) {
      this.doPublish(requestData, options)
    } else {
      this.postTasks.set(requestId, { data: requestData, prm, options })
    }
    
    return prm
  }

  /**
   * Executes the publish operation with timeout handling.
   * Uses efficient TimeoutManager for better performance.
   * @param data - Request data to publish
   * @param options - Optional publish options
   * @private
   */
  private doPublish(data: PostRequest, options?: PublishOptions): void {
    const { requestId, cmdname } = data
    
    // Use per-request timeout if provided, otherwise use default
    const timeout = options?.timeout ?? this.timeout
    
    // Add timeout using efficient TimeoutManager (P0 optimization)
    this.timeoutManager.add(requestId, timeout, () => {
      const callback = this.callbackMap.get(requestId)
      if (callback) {
        const timeoutData: PostResponse = {
          req: data,
          requestId,
          ret: ReturnCode.TimeOut,
          time: Date.now(),
          msg: 'timeout'
        } as PostResponse & { req: PostRequest }
        this.log('error', 'postmessage timeout', timeoutData)
        
        // Emit timeout event (P1 lifecycle events)
        this.emit('timeout', { requestId, cmdname, timeoutMs: timeout })
        
        callback.resolve(timeoutData)
        this.deleteCallback(requestId)
        this.requestCmdMap.delete(requestId)
      }
    })
    
    this.postMessage(data as unknown as Record<string, unknown>, options?.transferables)
  }

  /**
   * Removes callback and pending task for a completed request.
   * @param requestId - The request ID to clean up
   * @private
   */
  private deleteCallback(requestId: string): void {
    this.callbackMap.delete(requestId)
    this.postTasks.delete(requestId)
    this.timeoutManager.remove(requestId)
  }

  /**
   * Sends all queued messages once channel becomes ready.
   * @private
   */
  private executePosts(): void {
    for (const task of this.postTasks.values()) {
      this.doPublish(task.data, task.options)
    }
  }

  /**
   * Type-safe method call with automatic type inference.
   * Use this method when you have defined TMethods for type-safe remote calls.
   * 
   * @template K - The method name (key of TMethods)
   * @param method - The method name to call
   * @param params - The parameters for the method (type-checked)
   * @param options - Optional publish options (timeout, transferables)
   * @returns Promise that resolves with a typed response
   * 
   * @example
   * interface RemoteMethods {
   *   getData(params: { id: number }): { name: string; value: number }
   * }
   * const channel: IframeChannel<RemoteMethods> = new IframeChannel(iframe)
   * const response = await channel.call('getData', { id: 123 })
   * // response.data is typed as { name: string; value: number } | undefined
   */
  call<K extends keyof TMethods>(
    method: K,
    params?: MethodParams<TMethods[K]>,
    options?: PublishOptions
  ): Promise<TypedPostResponse<MethodReturn<TMethods[K]>>> {
    return this.publish(method as string, params as Record<string, unknown>, options) as Promise<TypedPostResponse<MethodReturn<TMethods[K]>>>
  }

  /**
   * Subscribes to messages with the specified command name.
   * The handler function will be called when a matching message is received.
   * @param cmdname - The command name to listen for
   * @param callback - Handler function to process the message
   * @returns The channel instance for method chaining
   * @example
   * channel.subscribe('getData', async ({ data }) => {
   *   const result = await database.query(data.id)
   *   return { items: result }
   * })
   */
  subscribe(cmdname: string, callback: PostCallback): Communicator<TMethods> {
    if (this.subscribeMap.has(cmdname)) {
      this.log('warn', `${cmdname} has been subscribed`)
    }
    this.subscribeMap.set(cmdname, callback)
    return this
  }

  /**
   * Removes the subscription for the specified command name.
   * @param cmdname - The command name to unsubscribe from
   * @returns The channel instance for method chaining
   */
  unSubscribe(cmdname: string): Communicator<TMethods> {
    this.subscribeMap.delete(cmdname)
    return this
  }

  /**
   * Subscribes to a one-time message with the specified command name.
   * The handler will be automatically unsubscribed after being called once.
   * @param cmdname - The command name to listen for
   * @param callback - Handler function to process the message
   * @returns The channel instance for method chaining
   * @example
   * channel.subscribeOnce('init', async ({ data }) => {
   *   // This handler will only be called once
   *   return { initialized: true }
   * })
   */
  subscribeOnce(cmdname: string, callback: PostCallback): Communicator<TMethods> {
    const wrappedCallback: PostCallback = async (data) => {
      this.unSubscribe(cmdname)
      return callback(data)
    }
    return this.subscribe(cmdname, wrappedCallback)
  }

  /**
   * Gets the peer's baseKey for debugging or validation.
   * @returns The peer's baseKey, or empty string if not yet paired
   */
  getPeerKey(): string {
    return this.peerKey
  }

  /**
   * Gets the rate limiter's current statistics.
   * @returns Object with current count, limit, and remaining capacity
   */
  getRateLimitStats(): { current: number; limit: number; remaining: number } {
    return {
      current: this.rateLimiter.getCurrentCount(),
      limit: this.rateLimiter.getLimit(),
      remaining: this.rateLimiter.getRemainingCapacity()
    }
  }

  /**
   * Gets the number of pending requests.
   * @returns The number of requests waiting for responses
   */
  getPendingCount(): number {
    return this.callbackMap.size
  }

  /**
   * Destroys the channel and releases all resources.
   * All pending requests will be rejected with a ChannelError.
   * After calling destroy, the channel cannot be used.
   */
  destroy(): void {
    // Prevent double destruction
    if (this.isDestroyed) {
      return
    }
    this.isDestroyed = true
    
    // Emit destroy event before cleanup
    this.emit('destroy', { reason: 'explicit' })
    
    // Unregister from debugger
    unregisterChannel(this)
    
    // Reject all pending requests with ChannelError
    const destroyError = new ChannelError(
      'Channel has been destroyed',
      ErrorCode.ConnectionDestroyed
    )
    
    for (const [requestId, callback] of this.callbackMap) {
      try {
        callback.reject({
          ret: ReturnCode.SendCallbackError,
          msg: destroyError.message
        })
      } catch (e) {
        this.log('warn', 'Error rejecting pending request:', requestId, e)
      }
    }
    
    // Clean up resources
    this.removeMessageListener()
    this.subscribeMap.clear()
    this.postTasks.clear()
    this.callbackMap.clear()
    this.requestCmdMap.clear()
    
    // Destroy managers
    this.timeoutManager.destroy()
    this.rateLimiter.reset()
    
    // Destroy event emitter
    this.destroyEventEmitter()
    
    this.isReady = false
    this.peerKey = ''
  }
}
