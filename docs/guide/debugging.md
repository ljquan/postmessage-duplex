# 调试技巧

本章介绍如何调试 postmessage-duplex 通讯问题。

## 内置调试器

postmessage-duplex 内置了功能强大的调试器，帮助开发者快速定位问题。

### 启用调试器

```typescript
import { enableDebugger } from 'postmessage-duplex'

// 只在开发环境启用
if (process.env.NODE_ENV === 'development') {
  enableDebugger()
}
```

### 使用调试器

启用后，在浏览器控制台执行：

```javascript
// 显示帮助信息
__POSTMESSAGE_DUPLEX__.debug.help()

// 查看所有活跃通道
__POSTMESSAGE_DUPLEX__.debug.getChannels()

// 查看消息历史
__POSTMESSAGE_DUPLEX__.debug.getHistory()

// 开启实时日志
__POSTMESSAGE_DUPLEX__.debug.enableLiveLog(true)

// 查看待处理请求
__POSTMESSAGE_DUPLEX__.debug.getPending()

// 查看统计信息
__POSTMESSAGE_DUPLEX__.debug.getStats()

// 导出调试报告
__POSTMESSAGE_DUPLEX__.debug.exportReport()

// 清除历史和统计
__POSTMESSAGE_DUPLEX__.debug.clear()
```

### 调试器功能

| 命令 | 说明 |
|------|------|
| `help()` | 显示帮助信息 |
| `getChannels()` | 列出所有活跃通道及状态 |
| `getHistory(opts?)` | 查看消息历史，支持过滤和限制 |
| `enableLiveLog(bool)` | 开启/关闭实时日志 |
| `getPending()` | 列出待处理的请求 |
| `getStats()` | 显示统计信息 |
| `exportReport()` | 导出完整调试报告为 JSON |
| `clear()` | 清除历史和统计数据 |

## 自定义日志

```typescript
const channel = new IframeChannel(iframe, {
  log: {
    log: (...args) => {
      console.log('[Channel]', ...args)
      // 发送到日志服务
      sendToLogService('log', args)
    },
    warn: (...args) => {
      console.warn('[Channel]', ...args)
      sendToLogService('warn', args)
    },
    error: (...args) => {
      console.error('[Channel]', ...args)
      sendToLogService('error', args)
    }
  }
})
```

## 常见问题排查

### 1. 消息没有收到

**检查列表：**

1. **Origin 是否正确？**
   ```typescript
   // 子页面必须传入正确的父页面 origin
   const channel = new IframeChannel('https://parent.com')
   // 不是 'parent.com'，而是完整的 origin
   ```

2. **iframe 是否加载完成？**
   ```typescript
   // 等待 iframe 加载
   iframe.onload = () => {
     const channel = new IframeChannel(iframe)
   }
   ```

3. **对方是否订阅了该事件？**
   ```typescript
   // 发送方
   const response = await channel.publish('getData', { id: 1 })
   if (response.ret === ReturnCode.NoSubscribe) {
     console.error('对方未订阅 getData 事件')
   }
   ```

4. **是否有 Content-Security-Policy 限制？**
   ```html
   <!-- 检查是否有 frame-ancestors 或 script-src 限制 -->
   <meta http-equiv="Content-Security-Policy" content="frame-ancestors 'self'">
   ```

### 2. 请求超时

**可能原因：**

1. **处理时间过长**
   ```typescript
   // 增加超时时间
   const response = await channel.publish('slowOperation', data, {
     timeout: 30000 // 30 秒
   })
   ```

2. **处理器抛出异常但未正确返回**
   ```typescript
   // 错误做法
   channel.subscribe('test', async ({ data }) => {
     await someAsyncOperation() // 如果失败，Promise 会一直 pending
   })
   
   // 正确做法
   channel.subscribe('test', async ({ data }) => {
     try {
       return await someAsyncOperation()
     } catch (error) {
       throw error // 明确抛出错误
     }
   })
   ```

3. **消息被浏览器安全策略阻止**

### 3. 通道未就绪

```typescript
// 检查就绪状态
console.log('isReady:', channel.isReady)

// 监听就绪状态变化
// 发送的消息会自动缓存，等待就绪后发送
channel.publish('init', {}) // 即使未就绪也可以发送
```

### 4. 跨域问题

```typescript
// 检查目标 origin
console.log('目标 origin:', channel.getTargetOrigin())

// 检查 referrer
console.log('referrer:', document.referrer)

// 确保子页面的 origin 参数与实际父页面匹配
const channel = new IframeChannel(new URL(document.referrer).origin)
```

## 调试工具

### Chrome DevTools

1. **Network 面板**：检查 iframe 加载状态
2. **Console 面板**：查看消息日志
3. **Application 面板**：检查 Service Worker 状态

### 浏览器控制台命令

```javascript
// 启用调试器后使用
__POSTMESSAGE_DUPLEX__.debug.getChannels()
__POSTMESSAGE_DUPLEX__.debug.getHistory()
__POSTMESSAGE_DUPLEX__.debug.enableLiveLog(true)

// 检查通道状态（在正确的 context 中）
channel.isReady
channel.isSon
channel.getTargetOrigin()
```

## 测试技巧

### 单元测试

```typescript
// Jest 测试示例
describe('IframeChannel', () => {
  let channel: IframeChannel
  
  beforeEach(() => {
    // 模拟 postMessage
    const mockTarget = {
      contentWindow: {
        postMessage: jest.fn()
      }
    } as unknown as HTMLIFrameElement
    
    channel = new IframeChannel(mockTarget)
  })
  
  afterEach(() => {
    channel.destroy()
    jest.clearAllMocks()
  })
  
  it('should send message', async () => {
    const publishPromise = channel.publish('test', { data: 1 })
    
    // 模拟响应
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        cmdname: 'test',
        requestId: /* 从调试器获取 */,
        ret: 0,
        data: { result: true }
      },
      origin: window.location.origin
    }))
    
    const response = await publishPromise
    expect(response.ret).toBe(0)
  })
})
```

### 使用调试演示页面

项目包含调试演示页面：

```bash
# 启动开发服务器
npm run dev

# 访问调试页面
open http://localhost:7100/demo/debugger/
```

调试页面功能：

- 实时查看发送和接收的消息
- 手动发送测试消息
- 查看通道状态
- 模拟各种场景

## 生产环境日志

```typescript
const isDev = process.env.NODE_ENV === 'development'

const channel = new IframeChannel(iframe, {
  log: isDev ? console : {
    log: () => {},
    warn: (...args) => {
      // 生产环境只记录警告
      sendToMonitoring('warn', args)
    },
    error: (...args) => {
      // 生产环境记录错误
      sendToMonitoring('error', args)
    }
  }
})
```

## 性能监控

```typescript
// 监控请求延迟
const start = performance.now()
const response = await channel.publish('getData', { id: 1 })
const duration = performance.now() - start

if (duration > 1000) {
  console.warn(`请求 getData 耗时 ${duration}ms`)
}

// 监控消息大小
const messageSize = JSON.stringify({ cmdname: 'getData', data }).length
if (messageSize > 100000) {
  console.warn(`消息大小 ${messageSize} 字节，考虑使用 Transferable`)
}
```

## 下一步

- [API 参考](/api/)
- [示例代码](/examples/)
- [FAQ](/faq/)
