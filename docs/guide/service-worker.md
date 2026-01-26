# Service Worker 通讯

本章介绍如何使用 postmessage-duplex 实现页面与 Service Worker 之间的双工通讯。

## 基本概念

Service Worker 通讯有两个端点：

- **页面端**：运行在浏览器标签页中的 JavaScript
- **Worker 端**：运行在 Service Worker 线程中的代码

## 页面端配置

### 方式一：自动创建（推荐）

```typescript
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 等待 Service Worker 就绪并创建通道
const channel = await ServiceWorkerChannel.createFromPage()

// 发送消息
const response = await channel.publish('fetchData', { url: '/api/data' })
```

### 方式二：手动创建

```typescript
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 先注册 Service Worker
await navigator.serviceWorker.register('./sw.js')

// 等待 controller 可用
const controller = navigator.serviceWorker.controller
if (controller) {
  const channel = new ServiceWorkerChannel(controller)
}
```

## Worker 端配置

### 方式一：从事件创建

```typescript
// sw.js
import { ServiceWorkerChannel } from 'postmessage-duplex'

self.addEventListener('message', (event) => {
  // 为每个消息来源创建通道
  const channel = ServiceWorkerChannel.createFromEvent(event)
  
  // 设置订阅
  channel.subscribe('fetchData', async ({ data }) => {
    const response = await fetch(data.url)
    return await response.json()
  })
})
```

### 方式二：从 clientId 创建

```typescript
// sw.js
const channels = new Map()

self.addEventListener('message', (event) => {
  const clientId = event.source.id
  
  // 复用已有通道
  if (!channels.has(clientId)) {
    const channel = ServiceWorkerChannel.createFromWorker(clientId)
    
    channel.subscribe('fetchData', async ({ data }) => {
      const response = await fetch(data.url)
      return await response.json()
    })
    
    channels.set(clientId, channel)
  }
})

// 清理已关闭的客户端
self.addEventListener('clientschange', () => {
  // 定期清理无效通道
})
```

## 类型安全的使用

```typescript
// 定义远程方法类型
interface SWMethods {
  fetchData(params: { url: string }): Promise<any>
  cacheData(params: { key: string; data: any }): void
  clearCache(): void
}

// 页面端
const channel = await ServiceWorkerChannel.createFromPage<SWMethods>()
const response = await channel.call('fetchData', { url: '/api/users' })
// response.data 类型自动推断

// Worker 端
const channel = ServiceWorkerChannel.createFromWorker<SWMethods>(clientId)
```

## 常见用例

### 1. 数据缓存

```typescript
// 页面端
const response = await channel.publish('getCachedData', { 
  key: 'user-profile',
  fallbackUrl: '/api/profile'
})

// Worker 端
channel.subscribe('getCachedData', async ({ data }) => {
  const cache = await caches.open('app-cache')
  const cached = await cache.match(data.key)
  
  if (cached) {
    return await cached.json()
  }
  
  const response = await fetch(data.fallbackUrl)
  const json = await response.json()
  
  // 缓存结果
  await cache.put(data.key, new Response(JSON.stringify(json)))
  
  return json
})
```

### 2. 后台同步

```typescript
// 页面端 - 提交数据进行后台同步
await channel.publish('queueSync', {
  type: 'form-submit',
  data: formData
})

// Worker 端
channel.subscribe('queueSync', async ({ data }) => {
  // 存储到 IndexedDB
  await saveToIndexedDB('sync-queue', data)
  
  // 注册后台同步
  await self.registration.sync.register('background-sync')
  
  return { queued: true }
})
```

### 3. 推送通知

```typescript
// Worker 端 - 主动推送到页面
self.addEventListener('push', async (event) => {
  const data = event.data.json()
  
  // 获取所有客户端
  const clients = await self.clients.matchAll()
  
  for (const client of clients) {
    const channel = ServiceWorkerChannel.createFromWorker(client.id)
    await channel.publish('pushNotification', data)
  }
})

// 页面端 - 接收推送
channel.subscribe('pushNotification', ({ data }) => {
  showNotification(data.title, data.body)
  return { displayed: true }
})
```

## 多页面场景

一个 Service Worker 可以服务多个页面：

```typescript
// Worker 端 - 管理多个客户端
const clientChannels = new Map()

self.addEventListener('message', (event) => {
  const clientId = event.source.id
  
  if (!clientChannels.has(clientId)) {
    const channel = ServiceWorkerChannel.createFromWorker(clientId)
    setupChannel(channel)
    clientChannels.set(clientId, channel)
  }
})

// 向所有客户端广播
async function broadcast(eventName, data) {
  const clients = await self.clients.matchAll()
  
  for (const client of clients) {
    const channel = clientChannels.get(client.id)
    if (channel) {
      await channel.publish(eventName, data)
    }
  }
}
```

## 错误处理

```typescript
// 检查 Service Worker 支持
if (!('serviceWorker' in navigator)) {
  console.error('Service Worker not supported')
  return
}

try {
  const channel = await ServiceWorkerChannel.createFromPage()
  
  const response = await channel.publish('getData', { id: 1 })
  
  if (response.ret !== ReturnCode.Success) {
    console.error('请求失败:', response.msg)
  }
} catch (error) {
  console.error('Service Worker 错误:', error)
}
```

## 注意事项

### 1. Worker 端不支持直接 import

Service Worker 环境与普通页面不同，可能需要打包工具处理：

```javascript
// sw.js - 使用 importScripts
importScripts('/dist/sw-channel.js')

// 或者使用模块化 Service Worker (需要浏览器支持)
// sw.js 使用 type: 'module' 注册
```

### 2. 生命周期管理

```typescript
// Worker 端 - 清理资源
self.addEventListener('activate', (event) => {
  // 清理旧的缓存和通道
  event.waitUntil(cleanup())
})

// 页面端 - 在页面卸载时清理
window.addEventListener('beforeunload', () => {
  channel.destroy()
})
```

### 3. 更新处理

```typescript
// 页面端 - 处理 Service Worker 更新
navigator.serviceWorker.addEventListener('controllerchange', () => {
  // 旧通道失效，需要重新创建
  channel.destroy()
  initChannel()
})
```

## 下一步

- [TypeScript 支持](./typescript.md)
- [调试技巧](./debugging.md)
- [API 参考](/api/service-worker-channel.md)
