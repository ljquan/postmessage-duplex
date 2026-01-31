/**
 * Type-safe event emitter for channel lifecycle events.
 * Provides a way to listen to channel state changes and message events.
 *
 * @example
 * const channel = new IframeChannel(iframe)
 *
 * // Listen to lifecycle events
 * channel.on('ready', ({ peerKey }) => {
 *   console.log('Channel connected to:', peerKey)
 * })
 *
 * channel.on('error', ({ error }) => {
 *   reportToMonitoring(error)
 * })
 *
 * channel.on('destroy', () => {
 *   cleanup()
 * })
 */

/**
 * Channel event types and their associated data.
 */
export interface ChannelEventMap {
  /**
   * Emitted when the channel becomes ready for communication.
   */
  ready: { peerKey: string }

  /**
   * Emitted when the channel is destroyed.
   */
  destroy: { reason?: string }

  /**
   * Emitted when an error occurs.
   */
  error: { error: Error; context?: string }

  /**
   * Emitted when a request times out.
   */
  timeout: { requestId: string; cmdname: string; timeoutMs: number }

  /**
   * Emitted when a message is sent.
   */
  'message:sent': { cmdname: string; requestId: string }

  /**
   * Emitted when a message is received.
   */
  'message:received': { cmdname?: string; requestId?: string; isResponse: boolean }

  /**
   * Emitted when rate limit is triggered.
   */
  'rate:limited': { currentCount: number; limit: number }

  /**
   * Emitted when Service Worker is activated (Hub API).
   * Only emitted on page side when autoReconnect is enabled.
   */
  'sw-activated': { version?: string }

  /**
   * Emitted when message validation fails.
   */
  'validation:failed': { reason: string; data?: unknown }

  /**
   * Emitted when a broadcast message is sent.
   */
  'broadcast:sent': { cmdname: string }

  /**
   * Emitted when a broadcast message is received.
   */
  'broadcast:received': { cmdname: string; data?: Record<string, any> }
}

/**
 * Event names that can be emitted.
 */
export type ChannelEventName = keyof ChannelEventMap

/**
 * Event handler function type.
 */
export type EventHandler<T> = (data: T) => void

/**
 * Type-safe event emitter class.
 *
 * @class ChannelEventEmitter
 * @example
 * class MyChannel extends ChannelEventEmitter {
 *   doSomething() {
 *     this.emit('ready', { peerKey: 'abc123' })
 *   }
 * }
 *
 * const channel = new MyChannel()
 * channel.on('ready', ({ peerKey }) => console.log(peerKey))
 */
export class ChannelEventEmitter {
  /** Map of event names to arrays of handlers */
  private eventHandlers = new Map<ChannelEventName, Set<EventHandler<any>>>()

  /** Whether event emission is enabled */
  private eventsEnabled = true

  /**
   * Registers an event handler.
   * @param event - The event name to listen for
   * @param handler - The handler function
   * @returns A function to unsubscribe the handler
   *
   * @example
   * const unsubscribe = channel.on('ready', ({ peerKey }) => {
   *   console.log('Connected:', peerKey)
   * })
   *
   * // Later, to stop listening:
   * unsubscribe()
   */
  on<E extends ChannelEventName>(
    event: E,
    handler: EventHandler<ChannelEventMap[E]>
  ): () => void {
    let handlers = this.eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(event, handlers)
    }
    handlers.add(handler)

    // Return unsubscribe function
    return () => {
      handlers?.delete(handler)
      if (handlers?.size === 0) {
        this.eventHandlers.delete(event)
      }
    }
  }

  /**
   * Registers a one-time event handler.
   * The handler will be automatically removed after being called once.
   * @param event - The event name to listen for
   * @param handler - The handler function
   * @returns A function to unsubscribe the handler before it's called
   *
   * @example
   * channel.once('ready', ({ peerKey }) => {
   *   console.log('Connected (will only log once):', peerKey)
   * })
   */
  once<E extends ChannelEventName>(
    event: E,
    handler: EventHandler<ChannelEventMap[E]>
  ): () => void {
    const wrappedHandler: EventHandler<ChannelEventMap[E]> = (data) => {
      this.off(event, wrappedHandler)
      handler(data)
    }
    return this.on(event, wrappedHandler)
  }

  /**
   * Removes an event handler.
   * @param event - The event name
   * @param handler - The handler to remove
   * @returns true if the handler was found and removed
   *
   * @example
   * const handler = ({ peerKey }) => console.log(peerKey)
   * channel.on('ready', handler)
   * // Later:
   * channel.off('ready', handler)
   */
  off<E extends ChannelEventName>(
    event: E,
    handler: EventHandler<ChannelEventMap[E]>
  ): boolean {
    const handlers = this.eventHandlers.get(event)
    if (!handlers) return false

    const deleted = handlers.delete(handler)
    if (handlers.size === 0) {
      this.eventHandlers.delete(event)
    }
    return deleted
  }

  /**
   * Removes all handlers for an event, or all handlers if no event specified.
   * @param event - Optional event name to clear handlers for
   *
   * @example
   * // Remove all 'ready' handlers
   * channel.offAll('ready')
   *
   * // Remove all handlers for all events
   * channel.offAll()
   */
  offAll(event?: ChannelEventName): void {
    if (event) {
      this.eventHandlers.delete(event)
    } else {
      this.eventHandlers.clear()
    }
  }

  /**
   * Emits an event to all registered handlers.
   * @param event - The event name
   * @param data - The event data
   * @protected
   *
   * @example
   * // Inside a channel implementation:
   * this.emit('ready', { peerKey: this.peerKey })
   */
  protected emit<E extends ChannelEventName>(
    event: E,
    data: ChannelEventMap[E]
  ): void {
    if (!this.eventsEnabled) return

    const handlers = this.eventHandlers.get(event)
    if (!handlers) return

    // Create a copy to allow handler removal during iteration
    for (const handler of [...handlers]) {
      try {
        handler(data)
      } catch (e) {
        // Log but don't throw to prevent breaking other handlers
        console.error(`[ChannelEventEmitter] Error in ${event} handler:`, e)
      }
    }
  }

  /**
   * Checks if there are any handlers for an event.
   * @param event - The event name
   * @returns true if there are registered handlers
   */
  hasListeners(event: ChannelEventName): boolean {
    const handlers = this.eventHandlers.get(event)
    return handlers !== undefined && handlers.size > 0
  }

  /**
   * Gets the count of handlers for an event.
   * @param event - The event name
   * @returns The number of registered handlers
   */
  listenerCount(event: ChannelEventName): number {
    return this.eventHandlers.get(event)?.size ?? 0
  }

  /**
   * Enables or disables event emission.
   * Useful for temporarily muting events during bulk operations.
   * @param enabled - Whether to enable events
   */
  setEventsEnabled(enabled: boolean): void {
    this.eventsEnabled = enabled
  }

  /**
   * Destroys the event emitter and removes all handlers.
   * @protected
   */
  protected destroyEventEmitter(): void {
    this.eventHandlers.clear()
    this.eventsEnabled = false
  }
}

export default ChannelEventEmitter
