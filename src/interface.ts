/**
 * Return codes for postMessage communication responses.
 * @enum {number}
 */
export enum ReturnCode {
  /** Operation completed successfully */
  Success = 0,
  /** Error occurred in receiver's callback handler */
  ReceiverCallbackError = -1,
  /** Error occurred in sender's callback handler */
  SendCallbackError = -2,
  /** No subscriber registered for the command */
  NoSubscribe = -3,
  /** Request timed out waiting for response */
  TimeOut = -99
}

/**
 * Request message structure for postMessage communication.
 * @interface PostRequest
 */
export interface PostRequest {
  /** Unique identifier for request-response correlation */
  requestId: string
  /** Command name identifying the message type */
  cmdname: string
  /** Optional payload data */
  data?: Record<string, any>
  /** Optional message string */
  msg?: string
  /** Timestamp when message was created */
  time?: number
}

/**
 * Response message structure for postMessage communication.
 * @interface PostResponse
 */
export interface PostResponse {
  /** Response payload data */
  data?: Record<string, any>
  /** Request ID this response corresponds to */
  requestId?: string
  /** Return code indicating success or failure type */
  ret: ReturnCode
  /** Optional message, typically used for error descriptions */
  msg?: string
  /** Timestamp when response was created */
  time?: number
}

/**
 * Callback function type for handling responses.
 * @callback PostCallback
 * @param rsp - The response message
 * @returns void or a value that will be sent back as response data
 */
export type PostCallback = (rsp: PostResponse) => void

/**
 * Error structure for failed operations.
 * @interface PostError
 */
export interface PostError {
  /** Error return code */
  ret: ReturnCode
  /** Error message description */
  msg: string
}

/**
 * Callback function type for handling failures.
 * @callback PostFailedCallback
 * @param err - The error object
 */
export type PostFailedCallback = (err: PostError) => void

/**
 * Function type for distributing incoming messages.
 * @callback PostDistribute
 * @param data - The incoming request data
 */
export interface PostDistribute {
  (data: PostRequest): void
}

/**
 * Pending task structure for queued messages.
 * @interface PostTask
 */
export interface PostTask {
  /** The request data to be sent */
  data: PostRequest
  /** Promise that resolves when response is received */
  prm: Promise<PostResponse>
  /** Options for this specific publish call */
  options?: PublishOptions
}

/**
 * Options for a single publish call.
 * Allows overriding default channel settings per request.
 * @interface PublishOptions
 */
export interface PublishOptions {
  /**
   * Timeout for this specific request in milliseconds.
   * Overrides the channel's default timeout.
   */
  timeout?: number
  /**
   * Transferable objects to transfer ownership of.
   * Objects in this array will be transferred (not copied) to the receiver.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
   */
  transferables?: Transferable[]
}

/**
 * Generic response wrapper with typed data.
 * @interface TypedPostResponse
 * @template T - The type of the response data
 */
export interface TypedPostResponse<T = any> extends Omit<PostResponse, 'data'> {
  /** Typed response payload data */
  data?: T
}

/**
 * Type definition for remote methods.
 * Each key is a method name, and the value is a function type.
 * @example
 * interface MyMethods extends Methods {
 *   getData(params: { id: number }): { name: string; value: number }
 *   setData(params: { name: string }): void
 * }
 */
export type Methods = Record<string, (params?: any) => any>

/**
 * Helper type to extract the parameter type of a method.
 * @template T - The method type
 */
export type MethodParams<T> = T extends (params: infer P) => any ? P : never

/**
 * Helper type to extract the return type of a method.
 * @template T - The method type
 */
export type MethodReturn<T> = T extends (...args: any[]) => infer R ? R : never

/**
 * Core interface for duplex communication channels.
 * Implemented by IframeChannel and ServiceWorkerChannel.
 * 
 * @interface Communicator
 * @template TMethods - Optional interface defining available remote methods for type-safe calls
 * 
 * @example
 * // Basic usage without generics
 * const channel: Communicator = new IframeChannel(iframe)
 * const response = await channel.publish('getData', { id: 123 })
 * 
 * @example
 * // Type-safe usage with generics
 * interface RemoteMethods {
 *   getData(params: { id: number }): { name: string; value: number }
 *   setData(params: { name: string }): void
 * }
 * const channel: Communicator<RemoteMethods> = new IframeChannel(iframe)
 * const response = await channel.call('getData', { id: 123 })
 * // response.data is typed as { name: string; value: number }
 */
export interface Communicator<TMethods extends Methods = Methods> {
  /**
   * Indicates whether the channel is ready for communication.
   * Messages sent before ready will be queued and sent once ready.
   */
  isReady: boolean

  /**
   * Publishes a message and waits for a response.
   * @param cmdname - The command name to identify the message type
   * @param data - Optional payload data to send
   * @param options - Optional publish options (timeout, transferables)
   * @returns Promise that resolves with the response
   * @example
   * // Basic usage
   * const response = await channel.publish('getData', { id: 123 })
   * if (response.ret === ReturnCode.Success) {
   *   console.log(response.data)
   * }
   * 
   * // With custom timeout
   * const response = await channel.publish('slowOperation', { id: 123 }, { timeout: 30000 })
   * 
   * // With transferable objects
   * const buffer = new ArrayBuffer(1024)
   * const response = await channel.publish('sendBuffer', { buffer }, { transferables: [buffer] })
   */
  publish(cmdname: string, data?: Record<string, any>, options?: PublishOptions): Promise<PostResponse>

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
   * const channel: Communicator<RemoteMethods> = new IframeChannel(iframe)
   * const response = await channel.call('getData', { id: 123 })
   * // response.data is typed as { name: string; value: number } | undefined
   */
  call<K extends keyof TMethods>(
    method: K,
    params?: MethodParams<TMethods[K]>,
    options?: PublishOptions
  ): Promise<TypedPostResponse<MethodReturn<TMethods[K]>>>

  /**
   * Subscribes to messages with the specified command name.
   * @param cmdname - The command name to listen for
   * @param callback - Handler function called when message is received
   * @returns The communicator instance for chaining
   * @example
   * channel.subscribe('getData', async ({ data }) => {
   *   return { result: await fetchData(data.id) }
   * })
   */
  subscribe(cmdname: string, callback: PostCallback): Communicator<TMethods>

  /**
   * Unsubscribes from messages with the specified command name.
   * @param cmdname - The command name to stop listening for
   * @returns The communicator instance for chaining
   */
  unSubscribe(cmdname: string): Communicator<TMethods>

  /**
   * Subscribes to a one-time message with the specified command name.
   * The handler will be automatically unsubscribed after being called once.
   * @param cmdname - The command name to listen for
   * @param callback - Handler function called when message is received
   * @returns The communicator instance for chaining
   * @example
   * channel.subscribeOnce('init', async ({ data }) => {
   *   // This handler will only be called once
   *   return { initialized: true }
   * })
   */
  subscribeOnce(cmdname: string, callback: PostCallback): Communicator<TMethods>

  /**
   * Destroys the channel and cleans up all resources.
   * Removes message listeners, clears subscriptions, and pending tasks.
   */
  destroy(): void
}
