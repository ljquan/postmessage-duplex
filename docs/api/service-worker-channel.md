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
  options?: ChannelOption
): Promise<ServiceWorkerChannel<TMethods>>
```

**返回值：** `Promise<ServiceWorkerChannel<TMethods>>`

**示例：**

```typescript
// 基本用法
const channel = await ServiceWorkerChannel.createFromPage()

// 带配置
const channel = await ServiceWorkerChannel.createFromPage({
  timeout: 10000
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

### destroy

```typescript
destroy(): void
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

```typescript
// sw.js
const CACHE_NAME = 'app-cache-v1'
const clientChannels = new Map()

self.addEventListener('message', (event) => {
  const clientId = event.source.id
  
  if (!clientChannels.has(clientId)) {
    const channel = createChannelForClient(clientId)
    clientChannels.set(clientId, channel)
  }
})

function createChannelForClient(clientId) {
  const channel = ServiceWorkerChannel.createFromWorker(clientId)
  
  channel.subscribe('fetchWithCache', async ({ data }) => {
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
  
  channel.subscribe('clearCache', async () => {
    await caches.delete(CACHE_NAME)
    return { cleared: true }
  })
  
  channel.subscribe('getStatus', async () => {
    const cache = await caches.open(CACHE_NAME)
    const keys = await cache.keys()
    return {
      cacheSize: keys.length,
      version: CACHE_NAME
    }
  })
  
  return channel
}

// 广播消息给所有客户端
async function broadcast(eventName, data) {
  const clients = await self.clients.matchAll()
  
  for (const client of clients) {
    const channel = clientChannels.get(client.id)
    if (channel) {
      await channel.publish(eventName, data)
    }
  }
}

// 清理断开的客户端
self.addEventListener('activate', () => {
  // 定期清理无效通道
  setInterval(async () => {
    const clients = await self.clients.matchAll()
    const activeIds = new Set(clients.map(c => c.id))
    
    for (const [id] of clientChannels) {
      if (!activeIds.has(id)) {
        const channel = clientChannels.get(id)
        channel?.destroy()
        clientChannels.delete(id)
      }
    }
  }, 60000)
})
```
