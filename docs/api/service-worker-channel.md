# ServiceWorkerChannel

用于页面与 Service Worker 双工通讯的类。

## 构造函数

```typescript
new ServiceWorkerChannel<TMethods extends Methods = Methods>(
  target: ServiceWorker | ClientType,
  options?: ChannelOption
)
```

### 参数

| 参数 | 类型 | 描述 |
|------|------|------|
| `target` | `ServiceWorker \| ClientType` | Service Worker 实例或客户端 |
| `options` | `ChannelOption` | 可选配置 |

::: tip 提示
通常不直接使用构造函数，而是使用静态工厂方法创建实例。
:::

## 静态方法

### createFromPage

从页面端创建通道（推荐）。

```typescript
static createFromPage<TMethods extends Methods = Methods>(
  options?: PageChannelOptions
): Promise<ServiceWorkerChannel<TMethods>>
```

**返回值：** `Promise<ServiceWorkerChannel<TMethods>>`

**PageChannelOptions 参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `timeout` | `number` | 请求超时时间（毫秒），默认 5000 |
| `appType` | `string` | 应用类型标识，用于 broadcastToType |
| `appName` | `string` | 应用名称（人类可读） |
| `autoReconnect` | `boolean` | SW 更新时是否自动重连，默认 true |
| `swUrl` | `string` | Service Worker 脚本 URL，提供则自动注册 SW |
| `swScope` | `string` | Service Worker 作用域，仅在 swUrl 提供时有效 |

**示例：**

```typescript
// 基本用法（需要先单独注册 SW）
const channel = await ServiceWorkerChannel.createFromPage()

// 带配置
const channel = await ServiceWorkerChannel.createFromPage({
  timeout: 10000
})

// 自动注册 SW（推荐简化方案）
const channel = await ServiceWorkerChannel.createFromPage({
  swUrl: '/sw.js',
  appType: 'cart',
  appName: '购物车模块'
})

// 带类型
interface SWMethods {
  fetchData(p: { url: string }): any
}
const channel = await ServiceWorkerChannel.createFromPage<SWMethods>()
```

### createFromEvent

从消息事件创建通道（Worker 端使用）。

```typescript
static createFromEvent<TMethods extends Methods = Methods>(
  event: MessageEvent,
  options?: ChannelOption
): ServiceWorkerChannel<TMethods>
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `event` | `MessageEvent` | 消息事件对象 |
| `options` | `ChannelOption` | 可选配置 |

**示例：**

```typescript
// sw.js
self.addEventListener('message', (event) => {
  const channel = ServiceWorkerChannel.createFromEvent(event)
  
  channel.subscribe('getData', async ({ data }) => {
    return await fetchData(data)
  })
})
```

### createFromWorker

从 clientId 创建通道（Worker 端使用）。

```typescript
static createFromWorker<TMethods extends Methods = Methods>(
  clientId: string,
  options?: ChannelOption
): ServiceWorkerChannel<TMethods>
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `clientId` | `string` | 客户端 ID |
| `options` | `ChannelOption` | 可选配置 |

**示例：**

```typescript
// sw.js
const channels = new Map()

self.addEventListener('message', (event) => {
  const clientId = event.source.id
  
  if (!channels.has(clientId)) {
    const channel = ServiceWorkerChannel.createFromWorker(clientId)
    setupChannel(channel)
    channels.set(clientId, channel)
  }
})
```

### setupHub

初始化 Service Worker Hub（推荐用于多客户端场景）。

```typescript
static setupHub(options?: HubOptions): void
```

**HubOptions 参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `version` | `string` | SW 版本号，用于 sw-activated 通知 |
| `onClientConnect` | `(clientId, meta) => void` | 客户端连接回调 |
| `onClientDisconnect` | `(clientId) => void` | 客户端断开回调 |
| `cleanupInterval` | `number` | 清理不活跃客户端的间隔（毫秒），默认 30000 |

::: tip Hub 模式的优势
1. **自动化管理**：自动处理客户端注册、SW 生命周期事件
2. **内置广播**：提供 broadcastToAll 和 broadcastToType 方法
3. **全局处理器**：使用 subscribeGlobal 统一管理消息处理
4. **自动重连**：页面端配合 autoReconnect 实现无缝重连
:::

**示例：**

```typescript
// sw.js - 一站式初始化
ServiceWorkerChannel.setupHub({
  version: '1.0.0',
  onClientConnect: (clientId, meta) => {
    console.log('Client connected:', meta.appName, meta.appType)
  },
  onClientDisconnect: (clientId) => {
    console.log('Client disconnected:', clientId)
  }
})

// 注册全局处理器
ServiceWorkerChannel.subscribeGlobal('echo', ({ data, clientMeta }) => {
  console.log(`Echo from ${clientMeta?.appName}:`, data.message)
  return { echoed: data.message }
})
```

### subscribeGlobal

注册全局消息处理器（所有客户端共享）。

```typescript
static subscribeGlobal(cmdname: string, handler: GlobalSubscribeHandler): void
```

**GlobalSubscribeHandler 参数：**

```typescript
type GlobalSubscribeHandler = (context: {
  data: Record<string, any>    // 请求数据
  clientId: string             // 发送者客户端 ID
  clientMeta?: ClientMeta      // 客户端元数据（如已注册）
}) => any | Promise<any>
```

**示例：**

```typescript
// 同步处理器
ServiceWorkerChannel.subscribeGlobal('ping', ({ data, clientId }) => {
  return { pong: true, timestamp: Date.now() }
})

// 异步处理器
ServiceWorkerChannel.subscribeGlobal('fetchData', async ({ data }) => {
  const response = await fetch(data.url)
  return await response.json()
})
```

### unsubscribeGlobal

移除全局消息处理器。

```typescript
static unsubscribeGlobal(cmdname: string): void
```

### broadcastToAll

向所有客户端广播消息。

```typescript
static async broadcastToAll(
  eventName: string,
  data?: Record<string, any>,
  excludeClientId?: string
): Promise<number>
```

**返回值：** 成功发送的客户端数量

**示例：**

```typescript
// 广播给所有客户端
const count = await ServiceWorkerChannel.broadcastToAll('notification', {
  type: 'update',
  message: '有新数据'
})
console.log(`广播给 ${count} 个客户端`)

// 广播给所有客户端（排除发送者）
await ServiceWorkerChannel.broadcastToAll('userUpdated', data, senderClientId)
```

### broadcastToType

向指定类型的客户端广播消息。

```typescript
static async broadcastToType(
  targetType: string,
  eventName: string,
  data?: Record<string, any>,
  excludeClientId?: string
): Promise<number>
```

**示例：**

```typescript
// 只广播给购物车模块
await ServiceWorkerChannel.broadcastToType('cart', 'cartUpdated', {
  itemCount: 5,
  total: 199.99
})

// 只广播给用户中心模块
await ServiceWorkerChannel.broadcastToType('user', 'profileUpdated', {
  userId: '123',
  changes: ['avatar', 'nickname']
})
```

### enableGlobalRouting

启用全局消息路由（底层 API，通常使用 setupHub 即可）。

```typescript
static enableGlobalRouting(callback?: UnknownClientCallback): void
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `callback` | `UnknownClientCallback` | 可选，当收到来自未知客户端的消息时调用 |

::: tip 全局路由的优势
1. **单一监听器**：所有客户端共享一个全局消息监听器，而不是每个客户端一个
2. **更好的性能**：减少监听器数量，提升多客户端场景下的性能
3. **SW 重启恢复**：当 SW 重启后，可以自动处理来自已有客户端的消息
:::

**示例：**

```typescript
// sw.js - 手动管理（setupHub 已内置此功能）
ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
  console.log('Message from unknown client:', clientId)
  const channel = ServiceWorkerChannel.createFromWorker(clientId)
  channel.handleMessage(event)
})
```

### disableGlobalRouting

禁用全局消息路由，恢复每个 channel 独立监听的模式。

```typescript
static disableGlobalRouting(): void
```

### hasChannel

检查是否存在指定客户端的 channel。

```typescript
static hasChannel(clientId: string): boolean
```

**示例：**

```typescript
if (ServiceWorkerChannel.hasChannel(clientId)) {
  // channel 已存在
} else {
  // 需要创建新 channel
}
```

### getChannelByClientId

获取指定客户端的 channel 实例。

```typescript
static getChannelByClientId(clientId: string): ServiceWorkerChannel | undefined
```

**示例：**

```typescript
const channel = ServiceWorkerChannel.getChannelByClientId(clientId)
if (channel) {
  channel.broadcast('notification', { message: 'Hello' })
}
```

### getChannelCount

获取当前活跃的 channel 数量。

```typescript
static getChannelCount(): number
```

## 实例方法

ServiceWorkerChannel 继承自 BaseChannel，拥有与 IframeChannel 相同的实例方法：

### publish

```typescript
publish(
  cmdname: string,
  data?: any,
  options?: PublishOptions
): Promise<PostResponse>
```

### call

```typescript
call<K extends keyof TMethods>(
  methodName: K,
  params: MethodParams<TMethods[K]>
): Promise<TypedPostResponse<MethodReturn<TMethods[K]>>>
```

### subscribe

```typescript
subscribe(cmdname: string, callback: PostCallback): this
```

### once

```typescript
once(cmdname: string, callback: PostCallback): this
```

### unSubscribe

```typescript
unSubscribe(cmdname: string): this
```

### broadcast

发送广播消息（单向，无响应）。

```typescript
broadcast(cmdname: string, data?: any, options?: BroadcastOptions): void
```

**示例：**

```typescript
// Worker 端 - 向特定客户端发送广播
const channel = clientChannels.get(clientId)
channel.broadcast('notification', { type: 'update', message: '数据已更新' })
```

### onBroadcast

注册广播消息处理器。

```typescript
onBroadcast(cmdname: string, callback: (data: { cmdname: string; data?: any }) => void): this
```

**示例：**

```typescript
// 页面端 - 接收来自 Worker 的广播
channel.onBroadcast('notification', ({ data }) => {
  console.log('收到通知:', data.message)
})
```

### offBroadcast

移除广播消息处理器。

```typescript
offBroadcast(cmdname: string): this
```

### destroy

```typescript
destroy(): void
```

### handleMessage

手动处理消息事件。当使用全局路由时，可以在 `unknownClientCallback` 中调用此方法来处理当前消息。

```typescript
handleMessage(event: MessageEvent): Promise<void>
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `event` | `MessageEvent` | 要处理的消息事件 |

**示例：**

```typescript
// 在 unknownClientCallback 中使用
ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
  const channel = ServiceWorkerChannel.createFromWorker(clientId, opts)
  channel.handleMessage(event) // 处理当前消息
})
```

## 属性

### isReady

```typescript
readonly isReady: boolean
```

### isDestroyed

```typescript
readonly isDestroyed: boolean
```

## 页面端完整示例

```typescript
import { ServiceWorkerChannel, ReturnCode } from 'postmessage-duplex'

interface SWMethods {
  fetchWithCache(params: { url: string; maxAge?: number }): any
  clearCache(): void
  getStatus(): { cacheSize: number; version: string }
}

class SWClient {
  private channel: ServiceWorkerChannel<SWMethods> | null = null
  
  async init() {
    // 注册 Service Worker
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported')
    }
    
    await navigator.serviceWorker.register('./sw.js')
    
    // 创建通道
    this.channel = await ServiceWorkerChannel.createFromPage<SWMethods>({
      timeout: 30000
    })
    
    // 监听推送
    this.channel.subscribe('push', ({ data }) => {
      this.handlePush(data)
      return { handled: true }
    })
    
    console.log('Service Worker client initialized')
  }
  
  async fetchWithCache(url: string, maxAge?: number) {
    if (!this.channel) {
      throw new Error('Channel not initialized')
    }
    
    const response = await this.channel.call('fetchWithCache', { url, maxAge })
    
    if (response.ret === ReturnCode.Success) {
      return response.data
    }
    
    throw new Error(response.msg || 'Fetch failed')
  }
  
  async clearCache() {
    if (!this.channel) return
    await this.channel.call('clearCache', undefined as never)
  }
  
  async getStatus() {
    if (!this.channel) return null
    const response = await this.channel.call('getStatus', undefined as never)
    return response.data
  }
  
  private handlePush(data: any) {
    console.log('收到推送:', data)
    // 显示通知等
  }
  
  destroy() {
    this.channel?.destroy()
    this.channel = null
  }
}

// 使用
const client = new SWClient()
await client.init()

const data = await client.fetchWithCache('/api/users', 3600)
```

## Worker 端完整示例

### 使用 Hub 模式（推荐）

::: tip 推荐用于多客户端场景
Hub 模式特别适合以下场景：
- 多个页面（tab）同时与 Service Worker 通信
- 需要按类型广播消息给特定应用
- Service Worker 可能被浏览器终止并重启
- 需要更简单的代码和更好的性能
:::

```typescript
// sw.js - 使用 Hub 模式（最简洁）
import { ServiceWorkerChannel } from 'postmessage-duplex'

const CACHE_NAME = 'app-cache-v1'

// 一行代码初始化 Hub
ServiceWorkerChannel.setupHub({
  version: '1.0.0',
  onClientConnect: (clientId, meta) => {
    console.log('Client connected:', meta.appName, meta.appType)
  },
  onClientDisconnect: (clientId) => {
    console.log('Client disconnected:', clientId)
  }
})

// 使用 subscribeGlobal 注册处理器（所有客户端共享）
ServiceWorkerChannel.subscribeGlobal('fetchWithCache', async ({ data }) => {
  const { url, maxAge = 3600 } = data
  const cache = await caches.open(CACHE_NAME)
  
  // 检查缓存
  const cached = await cache.match(url)
  if (cached) {
    const cachedTime = cached.headers.get('x-cached-time')
    if (cachedTime && Date.now() - parseInt(cachedTime) < maxAge * 1000) {
      return await cached.json()
    }
  }
  
  // 请求并缓存
  const response = await fetch(url)
  const json = await response.json()
  
  const headers = new Headers({ 'x-cached-time': Date.now().toString() })
  await cache.put(url, new Response(JSON.stringify(json), { headers }))
  
  return json
})

ServiceWorkerChannel.subscribeGlobal('clearCache', async () => {
  await caches.delete(CACHE_NAME)
  return { cleared: true }
})

ServiceWorkerChannel.subscribeGlobal('getStatus', async () => {
  const cache = await caches.open(CACHE_NAME)
  const keys = await cache.keys()
  return {
    cacheSize: keys.length,
    version: CACHE_NAME
  }
})

// 处理广播请求
ServiceWorkerChannel.subscribeGlobal('broadcastToAll', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToAll(
    data.eventName, 
    data.payload,
    clientId  // 排除发送者
  )
  return { success: true, sentCount: count }
})

// 按类型广播
ServiceWorkerChannel.subscribeGlobal('broadcastToType', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToType(
    data.targetType,
    data.eventName,
    data.payload,
    clientId  // 排除发送者
  )
  return { success: true, sentCount: count }
})
```

### 使用全局路由（手动管理）

```typescript
// sw.js - 手动管理模式
import { ServiceWorkerChannel } from 'postmessage-duplex'

const CACHE_NAME = 'app-cache-v1'
const clientChannels = new Map()

const subscribeMap = {
  fetchWithCache: async ({ data }) => {
    // ... 同上
  },
  clearCache: async () => {
    await caches.delete(CACHE_NAME)
    return { cleared: true }
  }
}

// 启用全局路由
ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
  console.log('Auto-creating channel for:', clientId)
  const channel = ServiceWorkerChannel.createFromWorker(clientId, { subscribeMap })
  clientChannels.set(clientId, channel)
  channel.handleMessage(event)
})

// 处理连接请求
self.addEventListener('message', (event) => {
  const clientId = event.source?.id
  if (!clientId) return
  
  if (event.data?.type === 'CHANNEL_CONNECT') {
    if (!clientChannels.has(clientId)) {
      const channel = ServiceWorkerChannel.createFromWorker(clientId, { subscribeMap })
      clientChannels.set(clientId, channel)
    }
    event.source.postMessage({ type: 'CHANNEL_READY' })
  }
})
```

### 传统模式（每个 channel 独立监听）

```typescript
// sw.js - 传统模式（不推荐用于多客户端）
const clientChannels = new Map()

self.addEventListener('message', (event) => {
  const clientId = event.source.id
  
  if (!clientChannels.has(clientId)) {
    const channel = ServiceWorkerChannel.createFromWorker(clientId)
    
    channel.subscribe('getData', async ({ data }) => {
      return await fetchData(data.id)
    })
    
    clientChannels.set(clientId, channel)
  }
})
```
