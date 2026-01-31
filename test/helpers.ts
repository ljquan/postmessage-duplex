/**
 * Test helper utilities for postmessage-duplex tests.
 * Provides common setup, mocking, and cleanup utilities.
 * @module test/helpers
 */

import { IframeChannel, ServiceWorkerChannel, ChannelOption } from '../src/index'

/**
 * Mock console for suppressing logs during tests.
 */
export const mockConsole = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
}

/**
 * Resets all mock console calls.
 */
export function resetMockConsole(): void {
  mockConsole.log.mockClear()
  mockConsole.warn.mockClear()
  mockConsole.error.mockClear()
  mockConsole.info.mockClear()
}

/**
 * Creates a custom mock console with jest functions.
 */
export function createMockConsole() {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}

/**
 * PostTask interface representing a queued message task.
 */
export interface PostTask {
  data: {
    requestId: string
    cmdname: string
    data?: Record<string, unknown>
  }
  prm: Promise<unknown>
}

/**
 * Sets up the DOM with an iframe element for testing.
 * @param src - The source URL for the iframe (default: 'http://localhost/')
 * @returns The created iframe element
 */
export function setupIframeDOM(src = 'http://localhost/'): HTMLIFrameElement {
  document.body.innerHTML = `<iframe id="iframe" src="${src}"/>`
  return document.querySelector('#iframe') as HTMLIFrameElement
}

/**
 * Sets up document.referrer for child iframe testing.
 * @param referrer - The referrer URL to set
 */
export function setupReferrer(referrer: string): void {
  Object.defineProperty(document, 'referrer', {
    value: referrer,
    configurable: true
  })
}

/**
 * Creates an IframeChannel for the parent page.
 * @param options - Additional channel options
 * @returns The created IframeChannel instance
 */
export function createParentChannel(options?: Partial<ChannelOption>): IframeChannel {
  const iframe = document.querySelector('#iframe') as HTMLIFrameElement
  return new IframeChannel(iframe, { log: mockConsole, ...options })
}

/**
 * Creates an IframeChannel for a child page.
 * @param parentOrigin - The parent page origin (default: 'http://localhost/')
 * @param options - Additional channel options
 * @returns The created IframeChannel instance
 */
export function createChildChannel(parentOrigin = 'http://localhost/', options?: Partial<ChannelOption>): IframeChannel {
  return new IframeChannel(parentOrigin, { log: mockConsole, ...options })
}

/**
 * Creates a mock MessageEvent for testing.
 * @param data - The message data
 * @param origin - The origin of the message (default: 'http://localhost')
 * @param source - The source window (default: window)
 * @returns The created MessageEvent
 */
export function createMessageEvent(
  data: unknown,
  origin = 'http://localhost',
  source: WindowProxy | null = window
): MessageEvent {
  return new MessageEvent('message', {
    data,
    origin,
    source
  })
}

/**
 * Creates a mock MessageEvent for iframe child messages.
 * @param data - The message data
 * @param origin - The origin of the message
 * @returns The created MessageEvent
 */
export function createChildMessageEvent(data: unknown, origin = 'http://localhost'): MessageEvent {
  const iframe = document.querySelector('#iframe') as HTMLIFrameElement
  return new MessageEvent('message', {
    data,
    origin,
    source: iframe?.contentWindow
  })
}

/**
 * Creates a mock ExtendableMessageEvent for Service Worker testing.
 * @param data - The message data
 * @param clientId - The client ID
 * @returns The mock event object
 */
export function createSWMessageEvent(data: unknown, clientId: string) {
  return {
    data,
    source: {
      id: clientId,
      postMessage: jest.fn()
    },
    waitUntil: jest.fn()
  }
}

/**
 * Triggers the onMessage handler of a channel.
 * @param channel - The channel instance
 * @param event - The MessageEvent to dispatch
 */
export function triggerOnMessage(channel: IframeChannel | ServiceWorkerChannel, event: MessageEvent): void {
  const handler = (channel as any).onMessage.bind(channel)
  handler(event)
}

/**
 * Gets private property value from a channel instance.
 * @param channel - The channel instance
 * @param property - The property name
 * @returns The property value
 */
export function getPrivate<T>(channel: IframeChannel | ServiceWorkerChannel, property: string): T {
  return (channel as any)[property]
}

/**
 * Sets private property value on a channel instance.
 * @param channel - The channel instance
 * @param property - The property name
 * @param value - The value to set
 */
export function setPrivate(channel: IframeChannel | ServiceWorkerChannel, property: string, value: unknown): void {
  (channel as any)[property] = value
}

/**
 * Gets the first value from a Map.
 * @param map - The Map to get value from
 * @returns The first value or undefined
 */
export function getFirstValue<T>(map: Map<string, T>): T | undefined {
  return map.values().next().value
}

/**
 * Converts a Map to an array of its values.
 * @param map - The Map to convert
 * @returns Array of values
 */
export function mapToArray<T>(map: Map<string, T>): T[] {
  return Array.from(map.values())
}

/**
 * Waits for a specified amount of time.
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Advances Jest timers and flushes promises.
 * @param ms - Milliseconds to advance
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms)
  await Promise.resolve()
}

/**
 * Creates a mock response message.
 * @param requestId - The request ID
 * @param ret - The return code (default: 0)
 * @param data - The response data
 * @returns The response message object
 */
export function createResponseMessage(requestId: string, ret = 0, data?: unknown) {
  return {
    requestId,
    ret,
    data,
    time: Date.now()
  }
}

/**
 * Creates a mock request message.
 * @param requestId - The request ID
 * @param cmdname - The command name
 * @param data - The request data
 * @returns The request message object
 */
export function createRequestMessage(requestId: string, cmdname: string, data?: unknown) {
  return {
    requestId,
    cmdname,
    data,
    time: Date.now()
  }
}

/**
 * Creates a mock ready message for channel pairing.
 * @param senderKey - The sender's baseKey
 * @returns The ready message object
 */
export function createReadyMessage(senderKey: string) {
  return {
    requestId: `${senderKey}0`,
    msg: 'ready',
    _senderKey: senderKey,
    time: Date.now()
  }
}

/**
 * Creates a mock broadcast message.
 * @param cmdname - The command name
 * @param data - The broadcast data
 * @returns The broadcast message object
 */
export function createBroadcastMessage(cmdname: string, data?: unknown) {
  return {
    cmdname,
    data,
    _broadcast: true,
    time: Date.now()
  }
}

/**
 * Collects all channels created during a test for cleanup.
 */
export class ChannelCollector {
  private channels: (IframeChannel | ServiceWorkerChannel)[] = []

  /**
   * Adds a channel to the collector.
   * @param channel - The channel to track
   * @returns The channel for chaining
   */
  add<T extends IframeChannel | ServiceWorkerChannel>(channel: T): T {
    this.channels.push(channel)
    return channel
  }

  /**
   * Destroys all tracked channels.
   */
  destroyAll(): void {
    for (const channel of this.channels) {
      try {
        channel.destroy()
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.channels = []
  }
}

/**
 * Common test utilities exported as a single object.
 */
export const testHelpers = {
  mockConsole,
  resetMockConsole,
  createMockConsole,
  setupIframeDOM,
  setupReferrer,
  createParentChannel,
  createChildChannel,
  createMessageEvent,
  createChildMessageEvent,
  createSWMessageEvent,
  triggerOnMessage,
  getPrivate,
  setPrivate,
  getFirstValue,
  mapToArray,
  delay,
  advanceTimersAndFlush,
  createResponseMessage,
  createRequestMessage,
  createReadyMessage,
  createBroadcastMessage,
  ChannelCollector
}

export default testHelpers
