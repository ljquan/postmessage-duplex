import * as urlUtil from './url'
import BaseChannel, { ChannelOption, generateUniqueId } from './base-channel'
import { Methods } from './interface'

/**
 * Configuration options for IframeChannel.
 * Extends base ChannelOption with iframe-specific settings.
 * @interface IframeChannelOption
 * @extends ChannelOption
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IframeChannelOption extends ChannelOption {
  // Extensible for iframe-specific options in the future
}

/**
 * Iframe postMessage duplex communication channel.
 *
 * Provides type-safe, Promise-based communication between parent pages
 * and their iframe children using the postMessage API.
 *
 * @class IframeChannel
 * @extends BaseChannel
 * @template TMethods - Optional interface defining available remote methods for type-safe calls
 *
 * @example
 * // Parent page: Create channel with iframe element
 * const iframe = document.getElementById('myIframe') as HTMLIFrameElement
 * const parentChannel = new IframeChannel(iframe)
 *
 * // Send message to child and wait for response
 * const response = await parentChannel.publish('getData', { id: 1 })
 * console.log(response.data)
 *
 * // Listen for messages from child
 * parentChannel.subscribe('childEvent', ({ data }) => {
 *   console.log('Received from child:', data)
 *   return { received: true }
 * })
 *
 * @example
 * // Child page: Create channel with parent URL
 * const childChannel = new IframeChannel('https://parent.example.com')
 *
 * // Listen for messages from parent
 * childChannel.subscribe('getData', async ({ data }) => {
 *   return await fetchData(data.id)
 * })
 *
 * // Send message to parent
 * childChannel.publish('notify', { message: 'Hello parent!' })
 * 
 * @example
 * // Type-safe usage with generics
 * interface RemoteMethods {
 *   getData(params: { id: number }): { name: string; value: number }
 *   setData(params: { name: string }): void
 * }
 * const channel = new IframeChannel<RemoteMethods>(iframe)
 * const response = await channel.call('getData', { id: 123 })
 * // response.data is typed as { name: string; value: number } | undefined
 */
export default class IframeChannel<TMethods extends Methods = Methods> extends BaseChannel<TMethods> {
  /** @internal */
  protected readonly channelType = 'IframeChannel'

  /**
   * Indicates whether this channel is running in a child iframe.
   * - `true`: This is a child page communicating with its parent
   * - `false`: This is a parent page communicating with an iframe
   */
  readonly isSon: boolean

  /** Cached URL parser element for efficient origin access */
  private readonly link: HTMLAnchorElement

  /** Target origin for postMessage security */
  private readonly targetOrigin: string

  /** Target URL */
  private readonly url: string

  /** Reference to the iframe element (parent page only) */
  private readonly iframe?: HTMLIFrameElement

  /**
   * Creates a new IframeChannel instance.
   *
   * @param target - The communication target:
   *   - **string**: Parent page URL (creates child mode channel)
   *   - **HTMLIFrameElement**: Iframe element (creates parent mode channel)
   * @param opt - Configuration options
   *
   * @throws {Error} If child page origin doesn't match the specified parent URL origin
   *
   * @example
   * // Parent page
   * const channel = new IframeChannel(document.querySelector('iframe'))
   *
   * @example
   * // Child page
   * const channel = new IframeChannel('https://parent-domain.com')
   */
  constructor(target: string | HTMLIFrameElement, opt?: IframeChannelOption) {
    super(opt)

    if (typeof target === 'string') {
      // Child page mode
      this.isSon = true
      this.url = target
      this.link = urlUtil.getLink(target)
      this.targetOrigin = this.link.origin
      
      // Validate that we're actually embedded in the expected parent
      const referrerOrigin = urlUtil.getLink(document.referrer).origin
      if (this.targetOrigin !== referrerOrigin) {
        throw new Error(`父页面 ${document.referrer} 非指定域名的页面 ${target} ！`)
      }
      
      this.baseKey = generateUniqueId('son_')
    } else {
      // Parent page mode
      this.isSon = false
      this.iframe = target
      this.url = target.src
      this.link = urlUtil.getLink(this.url)
      this.targetOrigin = this.link.origin
      this.baseKey = generateUniqueId('parent_')
    }

    this.log('log', 'baseKey', this.baseKey, this.isSon)
    this.init()
  }

  /** @internal */
  protected setupMessageListener(): void {
    window.addEventListener('message', this.bindOnMessage, true)
  }

  /** @internal */
  protected removeMessageListener(): void {
    window.removeEventListener('message', this.bindOnMessage, true)
  }

  /** @internal */
  protected sendRawMessage(data: Record<string, unknown>, transferables?: Transferable[]): void {
    try {
      if (this.isSon) {
        // JSON serialization prevents "could not be cloned" errors from functions
        const messageData = JSON.parse(JSON.stringify(data))
        if (transferables && transferables.length > 0) {
          parent.postMessage(messageData, this.targetOrigin, transferables)
        } else {
          parent.postMessage(messageData, this.targetOrigin)
        }
      } else {
        if (transferables && transferables.length > 0) {
          this.iframe!.contentWindow!.postMessage(data, this.targetOrigin, transferables)
        } else {
          this.iframe!.contentWindow!.postMessage(data, this.targetOrigin)
        }
      }
    } catch (e) {
      this.log('error', e, data, this.targetOrigin)
    }
  }

  /** @internal */
  protected isValidSource(event: MessageEvent): boolean {
    // Fast path: check origin first (string comparison is faster)
    if (event.origin !== this.targetOrigin) {
      this.log('log', '未处理', event.data, event, '非目标源:', this.targetOrigin)
      return false
    }
    // Parent page only processes messages from its own iframe
    if (!this.isSon && event.source !== this.iframe?.contentWindow) {
      return false
    }
    return true
  }

  /** @internal */
  protected log(type: 'log' | 'warn' | 'error', ...args: unknown[]): void {
    this.console?.[type]?.(`[${this.targetOrigin || 'IframeChannel'}](${this.isSon ? 'son' : 'parent'}): `, ...args)
  }

  /**
   * Gets the target origin (protocol + host) for this channel.
   * @returns The target origin string (e.g., 'https://example.com')
   */
  getTargetOrigin(): string {
    return this.targetOrigin
  }

  /**
   * Gets the target URL for this channel.
   * - For parent channels: the iframe's src URL
   * - For child channels: the parent page URL
   * @returns The target URL string
   */
  getTargetUrl(): string {
    return this.url
  }
}
