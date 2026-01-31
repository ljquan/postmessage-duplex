/**
 * PostMessage Channel Debugger
 * 
 * 提供可观测性工具，帮助开发者调试 postMessage 通信问题。
 * 
 * 特性：
 * - 零性能开销：未启用时完全不执行任何代码
 * - 显式启用：需要调用 enableDebugger() 才能使用
 * - 实时日志：可开关的消息流监控
 * - 通道状态：查看所有活跃通道
 * - 消息历史：格式化的历史记录查看
 * 
 * @example
 * import { enableDebugger } from '@jt/postmessage-channel'
 * 
 * // 只在开发环境启用
 * if (process.env.NODE_ENV === 'development') {
 *   enableDebugger()
 * }
 * 
 * // 然后在 Console 中使用
 * // __POSTMESSAGE_DUPLEX__.debug.help()
 */

 

import type BaseChannel from './base-channel'
import { PKG_NAME, PKG_VERSION } from './trace'
import { getGlobalScope } from './utils'

// WeakRef polyfill type declaration for older environments
declare class WeakRef<T extends object> {
  constructor(target: T)
  deref(): T | undefined
}

// Get global scope (compatible with browser and Service Worker)
const globalScope = getGlobalScope() as any

/**
 * 通道信息接口
 */
export interface ChannelInfo {
  /** 通道类型 */
  type: string
  /** 通道状态 */
  isReady: boolean
  /** 是否已销毁 */
  isDestroyed: boolean
  /** 自身标识 */
  baseKey: string
  /** 对端标识 */
  peerKey: string
  /** 待处理请求数 */
  pendingCount: number
  /** 已订阅的命令 */
  subscriptions: string[]
  /** 目标地址（如有） */
  targetOrigin?: string
}

/**
 * 消息历史条目
 */
export interface HistoryEntry {
  /** 方向：send/receive */
  direction: 'send' | 'receive'
  /** 命令名 */
  cmdname: string
  /** 请求ID */
  requestId: string
  /** 状态 */
  status: 'ok' | 'timeout' | 'error' | 'pending'
  /** 耗时（毫秒） */
  duration?: number
  /** 时间戳 */
  timestamp: number
  /** 数据摘要 */
  dataSummary: string
}

/**
 * 统计信息
 */
export interface ChannelStats {
  /** 总发送数 */
  totalSent: number
  /** 总接收数 */
  totalReceived: number
  /** 超时数 */
  timeouts: number
  /** 错误数 */
  errors: number
  /** 活跃通道数 */
  activeChannels: number
}

// 使用 WeakRef 存储通道引用，不阻止 GC
const channelRefs: WeakRef<BaseChannel>[] = []

// 消息历史（环形缓冲区）
const messageHistory: HistoryEntry[] = []
const MAX_HISTORY = 200

// 统计数据
const stats: ChannelStats = {
  totalSent: 0,
  totalReceived: 0,
  timeouts: 0,
  errors: 0,
  activeChannels: 0
}

// 实时日志开关
let liveLogEnabled = false

// Trace 回调钩子
let traceCallback: ((entry: any) => void) | null = null

/**
 * 注册通道到调试器
 * 在 BaseChannel 构造函数中调用
 * @internal
 */
export function registerChannel(channel: BaseChannel): void {
  channelRefs.push(new WeakRef(channel))
  stats.activeChannels++
  
  // 监听通道事件用于统计
  channel.on('message:sent', ({ cmdname, requestId }) => {
    stats.totalSent++
    addHistoryEntry({
      direction: 'send',
      cmdname,
      requestId,
      status: 'pending',
      timestamp: Date.now(),
      dataSummary: ''
    })
    
    if (liveLogEnabled) {
      logMessage('send', cmdname, requestId)
    }
  })
  
  channel.on('message:received', ({ cmdname, requestId, isResponse }) => {
    stats.totalReceived++
    const cmd = cmdname || ''
    const reqId = requestId || ''
    
    if (isResponse) {
      // 更新对应请求的状态
      updateHistoryStatus(reqId, 'ok')
    } else {
      addHistoryEntry({
        direction: 'receive',
        cmdname: cmd,
        requestId: reqId,
        status: 'ok',
        timestamp: Date.now(),
        dataSummary: ''
      })
    }
    
    if (liveLogEnabled) {
      logMessage('receive', cmd, reqId, isResponse)
    }
  })
  
  channel.on('timeout', ({ cmdname, requestId }) => {
    stats.timeouts++
    updateHistoryStatus(requestId, 'timeout')
    
    if (liveLogEnabled) {
      logTimeout(cmdname, requestId)
    }
  })
  
  channel.on('error', ({ context }) => {
    stats.errors++
    
    if (liveLogEnabled) {
      logError(context || 'unknown')
    }
  })
  
  channel.on('destroy', () => {
    stats.activeChannels = Math.max(0, stats.activeChannels - 1)
  })
}

/**
 * 注销通道
 * @internal
 */
export function unregisterChannel(channel: BaseChannel): void {
  const index = channelRefs.findIndex(ref => ref.deref() === channel)
  if (index !== -1) {
    channelRefs.splice(index, 1)
  }
}

/**
 * 添加历史条目
 */
function addHistoryEntry(entry: HistoryEntry): void {
  if (messageHistory.length >= MAX_HISTORY) {
    messageHistory.shift()
  }
  messageHistory.push(entry)
}

/**
 * 更新历史条目状态
 */
function updateHistoryStatus(requestId: string, status: HistoryEntry['status']): void {
  for (let i = messageHistory.length - 1; i >= 0; i--) {
    if (messageHistory[i].requestId === requestId && messageHistory[i].status === 'pending') {
      messageHistory[i].status = status
      messageHistory[i].duration = Date.now() - messageHistory[i].timestamp
      break
    }
  }
}

/**
 * 格式化时间戳（HH:MM:SS.mmm）
 */
function formatTime(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

/**
 * 实时日志：消息
 */
function logMessage(direction: 'send' | 'receive', cmdname: string, requestId: string, isResponse = false): void {
  const time = formatTime()
  const icon = direction === 'send' ? '📤' : '📥'
  const arrow = direction === 'send' ? '→' : '←'
  const suffix = isResponse ? ' (response)' : ''
  
  console.log(
    `%c[${time}] ${icon} ${arrow} ${cmdname || requestId}${suffix}`,
    `color: ${direction === 'send' ? '#2196F3' : '#4CAF50'}; font-weight: bold`
  )
}

/**
 * 实时日志：超时
 */
function logTimeout(cmdname: string, requestId: string): void {
  const time = formatTime()
  console.log(
    `%c[${time}] ⏱ TIMEOUT: ${cmdname || requestId}`,
    'color: #FF9800; font-weight: bold'
  )
}

/**
 * 实时日志：错误
 */
function logError(context: string): void {
  const time = formatTime()
  console.log(
    `%c[${time}] ❌ ERROR: ${context}`,
    'color: #F44336; font-weight: bold'
  )
}

/**
 * 调试器类
 */
class ChannelDebugger {
  /**
   * 显示帮助信息
   */
  help(): void {
    console.log(`
%c╔══════════════════════════════════════════════════════════════╗
║           PostMessage Channel Debugger v${PKG_VERSION.padEnd(10)}          ║
╠══════════════════════════════════════════════════════════════╣
║  Available Commands:                                         ║
║                                                              ║
║  debug.help()              - Show this help message          ║
║  debug.getChannels()       - List all active channels        ║
║  debug.getHistory(opts?)   - View message history            ║
║  debug.enableLiveLog(bool) - Toggle real-time logging        ║
║  debug.getPending()        - List pending requests           ║
║  debug.getStats()          - Show statistics                 ║
║  debug.exportReport()      - Export debug report as JSON     ║
║  debug.clear()             - Clear history and stats         ║
╚══════════════════════════════════════════════════════════════╝`,
      'color: #2196F3; font-family: monospace'
    )
  }

  /**
   * 获取所有活跃通道
   */
  getChannels(): ChannelInfo[] {
    // 清理已被 GC 的引用
    const validChannels: ChannelInfo[] = []
    const validRefs: WeakRef<BaseChannel>[] = []
    
    for (const ref of channelRefs) {
      const channel = ref.deref()
      if (channel) {
        validRefs.push(ref)
        
        // 获取通道信息
        const info: ChannelInfo = {
          type: (channel as any).channelType || 'unknown',
          isReady: channel.isReady,
          isDestroyed: (channel as any).isDestroyed || false,
          baseKey: (channel as any).baseKey || '',
          peerKey: channel.getPeerKey(),
          pendingCount: channel.getPendingCount(),
          subscriptions: Array.from((channel as any).subscribeMap?.keys() || [])
        }
        
        // 尝试获取目标地址（IframeChannel 特有）
        if (typeof (channel as any).getTargetOrigin === 'function') {
          info.targetOrigin = (channel as any).getTargetOrigin()
        }
        
        validChannels.push(info)
      }
    }
    
    // 更新引用列表
    channelRefs.length = 0
    channelRefs.push(...validRefs)
    stats.activeChannels = validRefs.length
    
    // 格式化输出
    if (validChannels.length === 0) {
      console.log('%cNo active channels found.', 'color: #999')
    } else {
      validChannels.forEach((ch, i) => {
        const statusIcon = ch.isDestroyed ? '💀' : (ch.isReady ? '✓' : '⏳')
        const statusColor = ch.isDestroyed ? '#999' : (ch.isReady ? '#4CAF50' : '#FF9800')
        
        console.log(`
%cChannel #${i + 1} (${ch.type})
%c├─ Status: ${statusIcon} ${ch.isDestroyed ? 'Destroyed' : (ch.isReady ? 'Ready' : 'Connecting')}
├─ BaseKey: ${ch.baseKey}
├─ PeerKey: ${ch.peerKey || '(not paired)'}
├─ Pending: ${ch.pendingCount} requests
├─ Subscriptions: ${ch.subscriptions.join(', ') || '(none)'}
${ch.targetOrigin ? `└─ Target: ${ch.targetOrigin}` : '└─ (no target info)'}`,
          `color: #2196F3; font-weight: bold`,
          `color: ${statusColor}`
        )
      })
    }
    
    return validChannels
  }

  /**
   * 获取消息历史
   */
  getHistory(options?: { limit?: number; filter?: string }): HistoryEntry[] {
    let history = [...messageHistory]
    
    // 过滤
    if (options?.filter) {
      const filter = options.filter.toLowerCase()
      history = history.filter(
        h => h.cmdname.toLowerCase().includes(filter) || 
             h.requestId.toLowerCase().includes(filter)
      )
    }
    
    // 限制数量
    if (options?.limit && options.limit > 0) {
      history = history.slice(-options.limit)
    }
    
    // 格式化输出
    if (history.length === 0) {
      console.log('%cNo message history.', 'color: #999')
    } else {
      const tableData = history.map(h => ({
        Dir: h.direction === 'send' ? '→' : '←',
        Command: h.cmdname || h.requestId.slice(-8),
        Status: h.status === 'ok' ? '✓' : (h.status === 'timeout' ? '⏱' : (h.status === 'error' ? '✗' : '...')),
        Time: h.duration !== undefined ? `${h.duration}ms` : '-',
        Timestamp: new Date(h.timestamp).toLocaleTimeString('en-US', { hour12: false })
      }))
      
      console.table(tableData)
    }
    
    return history
  }

  /**
   * 开启/关闭实时日志
   */
  enableLiveLog(enabled: boolean): void {
    liveLogEnabled = enabled
    
    if (enabled) {
      console.log(
        '%c🔴 Live logging ENABLED. Messages will appear in real-time.',
        'color: #4CAF50; font-weight: bold'
      )
    } else {
      console.log(
        '%c⚪ Live logging DISABLED.',
        'color: #999'
      )
    }
  }

  /**
   * 获取待处理请求
   */
  getPending(): { channelIndex: number; requestId: string; cmdname: string }[] {
    const pending: { channelIndex: number; requestId: string; cmdname: string }[] = []
    
    channelRefs.forEach((ref, i) => {
      const channel = ref.deref()
      if (channel) {
        const requestCmdMap = (channel as any).requestCmdMap as Map<string, string>
        if (requestCmdMap) {
          for (const [requestId, cmdname] of requestCmdMap) {
            pending.push({ channelIndex: i, requestId, cmdname })
          }
        }
      }
    })
    
    if (pending.length === 0) {
      console.log('%cNo pending requests.', 'color: #999')
    } else {
      console.table(pending)
    }
    
    return pending
  }

  /**
   * 获取统计信息
   */
  getStats(): ChannelStats {
    console.log(`
%c╔══════════════════════════════════════╗
║     PostMessage Channel Statistics   ║
╠══════════════════════════════════════╣
║  📤 Total Sent:      ${String(stats.totalSent).padStart(10)}     ║
║  📥 Total Received:  ${String(stats.totalReceived).padStart(10)}     ║
║  ⏱  Timeouts:        ${String(stats.timeouts).padStart(10)}     ║
║  ❌ Errors:          ${String(stats.errors).padStart(10)}     ║
║  📡 Active Channels: ${String(stats.activeChannels).padStart(10)}     ║
╚══════════════════════════════════════╝`,
      'color: #2196F3; font-family: monospace'
    )
    
    return { ...stats }
  }

  /**
   * 导出调试报告
   */
  exportReport(): string {
    const report = {
      version: PKG_VERSION,
      name: PKG_NAME,
      timestamp: new Date().toISOString(),
      stats: { ...stats },
      channels: this.getChannels(),
      history: messageHistory.slice(-100),
      pending: this.getPending()
    }
    
    const json = JSON.stringify(report, null, 2)
    console.log('%cDebug report exported. Use copy() to copy to clipboard.', 'color: #4CAF50')
    
    return json
  }

  /**
   * 清空历史和统计
   */
  clear(): void {
    messageHistory.length = 0
    stats.totalSent = 0
    stats.totalReceived = 0
    stats.timeouts = 0
    stats.errors = 0
    
    console.log('%cHistory and stats cleared.', 'color: #999')
  }

  /**
   * 检查实时日志是否开启
   */
  isLiveLogEnabled(): boolean {
    return liveLogEnabled
  }
}

// 调试器实例（惰性创建）
let debugInstance: ChannelDebugger | null = null

/**
 * 启用调试功能
 * 
 * 调用此函数后，将在全局对象上挂载 __POSTMESSAGE_DUPLEX__.debug
 * 
 * @example
 * import { enableDebugger } from '@jt/postmessage-channel'
 * 
 * // 只在开发环境启用
 * if (process.env.NODE_ENV === 'development') {
 *   enableDebugger()
 * }
 * 
 * // 然后在 Console 中：
 * // __POSTMESSAGE_DUPLEX__.debug.help()
 */
export function enableDebugger(): ChannelDebugger {
  if (!debugInstance) {
    debugInstance = new ChannelDebugger()
  }
  
  // 挂载到全局对象
  if (!globalScope.__POSTMESSAGE_DUPLEX__) {
    globalScope.__POSTMESSAGE_DUPLEX__ = {}
  }
  
  Object.defineProperty(globalScope.__POSTMESSAGE_DUPLEX__, 'debug', {
    value: debugInstance,
    writable: false,
    configurable: true
  })
  
  console.log(
    `%c🔧 PostMessage Debugger enabled. Type __POSTMESSAGE_DUPLEX__.debug.help() for commands.`,
    'color: #4CAF50; font-weight: bold'
  )
  
  return debugInstance
}

/**
 * 检查调试器是否已启用
 */
export function isDebuggerEnabled(): boolean {
  return debugInstance !== null && globalScope.__POSTMESSAGE_DUPLEX__?.debug !== undefined
}

/**
 * 获取调试器实例（如果已启用）
 */
export function getDebugger(): ChannelDebugger | null {
  return debugInstance
}

// 导出类型
export { ChannelDebugger }
