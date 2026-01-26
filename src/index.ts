// 导出版本信息
export { PKG_NAME, PKG_VERSION } from './trace'

// 导出基类
export { default as BaseChannel } from './base-channel'
export type { ChannelOption, Console, Log } from './base-channel'

// 导出 Iframe 通道
export { default as IframeChannel } from './iframe-channel'
export type { IframeChannelOption } from './iframe-channel'

// 导出 Service Worker 通道
export { default as ServiceWorkerChannel } from './sw-channel'
export type { ServiceWorkerChannelOption } from './sw-channel'

// 导出错误类和错误码
export { ChannelError, ErrorCode, createConnectionDestroyedError, createTimeoutError, createHandlerError } from './errors'

// 导出接口定义
export * from './interface'

// 导出工具类 (P0/P1 优化)
export { TimeoutManager } from './timeout-manager'
export { SlidingWindowRateLimiter } from './rate-limiter'
export { ChannelEventEmitter } from './event-emitter'
export type { ChannelEventMap, ChannelEventName, EventHandler } from './event-emitter'
export {
  validateMessage,
  validateRequest,
  validateResponse,
  isResponseMessage,
  isReadyMessage,
  sanitizeForLogging,
  estimateMessageSize
} from './validators'
export type { ChannelMessage, ValidationResult } from './validators'

// 导出调试工具
export { enableDebugger, isDebuggerEnabled, getDebugger } from './debugger'
export type { ChannelDebugger, ChannelInfo, HistoryEntry, ChannelStats } from './debugger'
