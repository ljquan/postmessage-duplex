# 常见问题

## 基础问题

### Q: 子页面刷新后连接会断开吗？

**A:** 不会。通道会自动处理子页面的重新加载。父页面的通道实例会保持有效，当子页面重新加载并创建新的通道后，通讯会自动恢复。

### Q: 可以同时与多个 iframe 通讯吗？

**A:** 可以。为每个 iframe 创建独立的 `IframeChannel` 实例即可：

```typescript
const channel1 = new IframeChannel(iframe1)
const channel2 = new IframeChannel(iframe2)

// 各通道独立工作，消息不会混淆
await channel1.publish('getData', { from: 'channel1' })
await channel2.publish('getData', { from: 'channel2' })
```

### Q: 跨域 iframe 可以通讯吗？

**A:** 可以。子页面需要正确配置父页面的 origin：

```typescript
// 子页面
const channel = new IframeChannel('https://parent-domain.com')
```

需要注意：
1. Origin 必须完全匹配（协议 + 域名 + 端口）
2. 确保 iframe 没有被 CSP 阻止

### Q: Service Worker 端如何使用这个库？

**A:** Service Worker 环境不支持 ES modules，有几种方式：

1. **使用打包工具**：将库打包到 SW 代码中
2. **使用 UMD 版本**：
   ```javascript
   importScripts('/dist/index.umd.js')
   const { ServiceWorkerChannel } = self.PostMessageChannel
   ```
3. **简化实现**：对于简单场景，可以不使用库，直接处理消息

## 错误处理

### Q: 如何处理请求超时？

**A:**

```typescript
import { ReturnCode } from 'postmessage-duplex'

const response = await channel.publish('slowOperation', data)

if (response.ret === ReturnCode.TimeOut) {
  // 处理超时
  console.error('请求超时')
}

// 或者设置更长的超时时间
const response = await channel.publish('slowOperation', data, {
  timeout: 30000 // 30 秒
})
```

### Q: 消息发送后没有收到响应怎么办？

**A:** 检查以下几点：

1. **对方是否订阅了该事件？**
   ```typescript
   if (response.ret === ReturnCode.NoSubscribe) {
     console.error('对方未订阅此事件')
   }
   ```

2. **对方的回调是否返回了值？**
   ```typescript
   // 错误：没有返回值
   channel.subscribe('test', ({ data }) => {
     console.log(data)
   })
   
   // 正确：返回响应
   channel.subscribe('test', ({ data }) => {
     console.log(data)
     return { received: true }
   })
   ```

3. **是否有异常被吞掉？**
   ```typescript
   channel.subscribe('test', async ({ data }) => {
     try {
       return await someOperation()
     } catch (error) {
       // 必须处理错误
       throw error // 或 return { error: error.message }
     }
   })
   ```

### Q: 通道销毁后发生了什么？

**A:** 调用 `destroy()` 后：

1. 所有待处理的请求会被 reject
2. 消息监听器被移除
3. `isDestroyed` 变为 `true`
4. 后续的 `publish` 调用会抛出错误

```typescript
channel.destroy()

try {
  await channel.publish('test') // 会抛出错误
} catch (error) {
  if (error instanceof ChannelError) {
    console.log(error.code) // 'CONNECTION_DESTROYED'
  }
}
```

## 性能问题

### Q: 发送大数据时性能很差怎么办？

**A:** 使用 Transferable 对象：

```typescript
const buffer = new ArrayBuffer(1024 * 1024) // 1MB

// 不使用 transferable：数据会被复制
await channel.publish('upload', { buffer }) // 慢

// 使用 transferable：数据会被转移（零拷贝）
await channel.publish('upload', { buffer }, {
  transferables: [buffer]
}) // 快

// 注意：传输后原 buffer 会被清空
console.log(buffer.byteLength) // 0
```

### Q: 频繁发送消息导致卡顿怎么办？

**A:** 

1. **批量发送**：合并多个小请求
2. **节流/防抖**：限制发送频率
3. **使用 rate limit**：
   ```typescript
   const channel = new IframeChannel(iframe, {
     rateLimit: 50 // 每秒最多 50 条消息
   })
   ```

### Q: 如何监控消息性能？

**A:**

```typescript
// 使用内置调试器
import { enableDebugger } from 'postmessage-duplex'

enableDebugger()
// 然后在控制台使用: __POSTMESSAGE_DUPLEX__.debug.getStats()

// 自定义监控
const start = performance.now()
const response = await channel.publish('getData', { id: 1 })
const duration = performance.now() - start

if (duration > 1000) {
  console.warn(`请求耗时 ${duration}ms，考虑优化`)
}
```

## 安全问题

### Q: 如何防止消息被篡改？

**A:** postmessage-duplex 内置了多层验证：

1. **Origin 验证**：只接受预期来源的消息
2. **Source 验证**：验证消息来源窗口
3. **PeerKey 验证**：验证通道配对

对于更高安全需求，可以：

```typescript
// 添加消息签名
channel.subscribe('sensitiveData', ({ data }) => {
  const { payload, signature } = data
  
  if (!verifySignature(payload, signature)) {
    throw new Error('Invalid signature')
  }
  
  return processSensitiveData(payload)
})
```

### Q: 如何防止 XSS 攻击？

**A:**

1. **验证消息来源**：始终检查 origin
2. **验证消息内容**：不要直接执行收到的代码
3. **使用 CSP**：限制可加载的内容

```typescript
// 不要这样做
channel.subscribe('execute', ({ data }) => {
  eval(data.code) // 危险！
})

// 应该这样做
channel.subscribe('execute', ({ data }) => {
  if (allowedActions.includes(data.action)) {
    return executeAction(data.action, data.params)
  }
  throw new Error('Action not allowed')
})
```

## 调试问题

### Q: 如何查看发送和接收的消息？

**A:**

```javascript
// 启用调试器
import { enableDebugger } from 'postmessage-duplex'
enableDebugger()

// 浏览器控制台
__POSTMESSAGE_DUPLEX__.debug.getHistory()

// 开启实时日志
__POSTMESSAGE_DUPLEX__.debug.enableLiveLog(true)
```

### Q: 消息追踪记录太多怎么办？

**A:** 追踪记录会自动限制数量。如需自定义：

```typescript
// 使用自定义日志过滤
const channel = new IframeChannel(iframe, {
  log: {
    log: (...args) => {
      if (shouldLog(args)) {
        console.log('[Channel]', ...args)
      }
    },
    warn: console.warn,
    error: console.error
  }
})
```

### Q: 如何在生产环境关闭日志？

**A:**

```typescript
const channel = new IframeChannel(iframe, {
  log: process.env.NODE_ENV === 'production' ? {
    log: () => {},
    warn: () => {},
    error: (args) => reportError(args)
  } : console
})
```

## 兼容性问题

### Q: IE 浏览器支持吗？

**A:** IframeChannel 支持 IE 8+，但 Service Worker 不支持 IE。

对于 IE，需要：
1. 使用 UMD 版本
2. 可能需要 Promise polyfill

```html
<script src="https://cdn.jsdelivr.net/npm/promise-polyfill@8/dist/polyfill.min.js"></script>
<script src="postmessage-duplex.umd.js"></script>
```

### Q: 在 Web Worker 中可以使用吗？

**A:** 目前库主要针对 iframe 和 Service Worker。对于普通 Web Worker，可以使用类似的模式，但需要自行适配。

## 其他问题

### Q: 可以用于 React Native WebView 吗？

**A:** 原理上可行，但需要适配。React Native WebView 的 postMessage API 略有不同。

### Q: 支持双向流式通讯吗？

**A:** 当前版本主要支持请求-响应模式。对于流式通讯，可以：

1. 使用多次 publish 模拟
2. 结合 WebSocket 使用
3. 使用事件订阅模式

```typescript
// 使用事件模式模拟流
channel.subscribe('streamData', ({ data }) => {
  handleChunk(data)
  // 不返回值，表示还有更多数据
})

channel.subscribe('streamEnd', () => {
  handleStreamEnd()
  return { complete: true }
})
```

---

还有问题？欢迎在 [GitHub Issues](https://github.com/ljquan/postmessage-duplex/issues) 提问！
