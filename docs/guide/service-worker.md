# Service Worker 通讯

本章介绍如何使用 postmessage-duplex 实现页面与 Service Worker 之间的双工通讯。

## 基本概念

Service Worker 通讯有两个端点：

- **页面端**：运行在浏览器标签页中的 JavaScript
- **Worker 端**：运行在 Service Worker 线程中的代码

## 页面端配置

### 方式一：一键初始化（推荐）

```typescript
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 自动注册 SW、建立连接、处理重连
const channel = await ServiceWorkerChannel.createFromPage({
  swUrl: '/sw.js',           // 自动注册 SW
  appType: 'cart',           // 应用类型（用于按类型广播）
  appName: '购物车模块',      // 应用名称
  autoReconnect: true        // SW 更新时自动重连（默认）
})

// 发送消息
const response = await channel.publish('fetchData', { url: '/api/data' })

// 接收广播
channel.onBroadcast('notification', ({ data }) => {
  console.log('收到广播:', data)
})
```

### 方式二：分步创建

```typescript
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 先单独注册 Service Worker
await navigator.serviceWorker.register('./sw.js')

// 然后创建通道
const channel = await ServiceWorkerChannel.createFromPage({
  timeout: 10000
})
```

### 方式三：手动创建

```typescript
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 完全手动控制
await navigator.serviceWorker.register('./sw.js')
const controller = navigator.serviceWorker.controller

if (controller) {
  const channel = new ServiceWorkerChannel(controller)
}
```

## Worker 端配置

### 方式一：使用 Hub 模式（推荐）

```typescript
// sw.js
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 一行代码初始化，自动处理：
// - 客户端连接管理
// - SW 生命周期事件
// - 消息路由
// - 不活跃客户端清理
ServiceWorkerChannel.setupHub({
  version: '1.0.0',
  onClientConnect: (clientId, meta) => {
    console.log('Client connected:', meta.appName)
  }
})

// 使用 subscribeGlobal 注册处理器（所有客户端共享）
ServiceWorkerChannel.subscribeGlobal('fetchData', async ({ data }) => {
  const response = await fetch(data.url)
  return await response.json()
})

// 广播给所有客户端
ServiceWorkerChannel.subscribeGlobal('notifyAll', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToAll(
    'notification', 
    data,
    clientId  // 排除发送者
  )
  return { sentCount: count }
})
```

### 方式二：从事件创建

```typescript
// sw.js
import { ServiceWorkerChannel } from 'postmessage-duplex'

self.addEventListener('message', (event) => {
  const channel = ServiceWorkerChannel.createFromEvent(event)
  
  channel.subscribe('fetchData', async ({ data }) => {
    const response = await fetch(data.url)
    return await response.json()
  })
})
```

### 方式三：从 clientId 创建

```typescript
// sw.js
const channels = new Map()

self.addEventListener('message', (event) => {
  const clientId = event.source.id
  
  if (!channels.has(clientId)) {
    const channel = ServiceWorkerChannel.createFromWorker(clientId)
    
    channel.subscribe('fetchData', async ({ data }) => {
      const response = await fetch(data.url)
      return await response.json()
    })
    
    channels.set(clientId, channel)
  }
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

一个 Service Worker 可以服务多个页面，这在微前端架构或模块化应用中非常常见。

<div style="margin: 16px 0;">
  <a href="/postmessage-duplex/playground/sw-multi-page.html" target="_blank" style="display: inline-block; padding: 10px 20px; background: #ff9800; color: white; border-radius: 6px; text-decoration: none; font-weight: 500;">
    📡 查看多页面通讯在线演示
  </a>
</div>

### Hub 模式（推荐）

::: tip 为什么推荐 Hub 模式？
1. **一行初始化**：`setupHub()` 自动处理所有复杂逻辑
2. **内置广播**：`broadcastToAll` 和 `broadcastToType` 开箱即用
3. **自动重连**：页面端使用 `autoReconnect: true` 实现无缝重连
4. **生命周期管理**：自动处理 SW 安装、激活、客户端清理
:::

```typescript
// Worker 端 - 使用 Hub 模式
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 一行代码初始化
ServiceWorkerChannel.setupHub({
  version: '1.0.0',
  onClientConnect: (clientId, meta) => {
    console.log(`${meta.appName} (${meta.appType}) connected`)
  }
})

// 注册全局处理器
ServiceWorkerChannel.subscribeGlobal('getData', async ({ data }) => {
  return await fetchData(data.id)
})

// 广播给所有客户端
ServiceWorkerChannel.subscribeGlobal('notifyAll', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToAll('notification', data, clientId)
  return { sentCount: count }
})

// 按类型广播（如只通知购物车模块）
ServiceWorkerChannel.subscribeGlobal('notifyCart', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToType('cart', 'cartUpdated', data, clientId)
  return { sentCount: count }
})
```

```typescript
// 页面端 - 配合 Hub 使用
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 创建通道（自动注册应用信息）
const channel = await ServiceWorkerChannel.createFromPage({
  swUrl: '/sw.js',
  appType: 'cart',           // 应用类型
  appName: '购物车',          // 应用名称
  autoReconnect: true        // SW 更新时自动重连
})

// 接收广播
channel.onBroadcast('notification', ({ data }) => {
  showNotification(data)
})

channel.onBroadcast('cartUpdated', ({ data }) => {
  updateCartUI(data)
})
```

### 手动管理模式

```typescript
// Worker 端 - 手动管理（用于需要完全控制的场景）
const clientChannels = new Map()

ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
  const channel = ServiceWorkerChannel.createFromWorker(clientId)
  channel.subscribe('getData', async ({ data }) => fetchData(data.id))
  clientChannels.set(clientId, channel)
  channel.handleMessage(event)
})
```

### 应用注册与识别

```typescript
// 页面端 - 注册应用信息
const channel = await ServiceWorkerChannel.createFromPage()

await channel.publish('register', {
  appName: '购物车模块',
  appType: 'cart'
})

// 监听来自其他应用的广播
channel.subscribe('broadcast', ({ data }) => {
  console.log(`收到来自 ${data.from} 的消息:`, data.message)
  return { received: true }
})
```

```typescript
// Worker 端 - 存储应用信息
subscribeMap['register'] = async ({ data }) => {
  clientInfo.set(clientId, {
    appName: data.appName,
    appType: data.appType,
    connectedAt: new Date().toISOString()
  })
  
  return {
    success: true,
    clientId: clientId,
    totalClients: clientChannels.size
  }
}
```

### 广播消息实现

postmessage-duplex 提供了专门的广播 API，用于单向消息传递（无需响应）：

```typescript
// 页面端 - 发送广播
channel.broadcast('notification', { 
  type: 'update',
  message: '数据已更新'
})

// 页面端 - 接收广播
channel.onBroadcast('notification', ({ data }) => {
  console.log('收到通知:', data.message)
  // 无需返回值 - 广播是单向的
})

// 移除广播处理器
channel.offBroadcast('notification')
```

**broadcast vs publish 的区别：**
- `broadcast()` 不返回 Promise（fire-and-forget）
- `onBroadcast()` 处理器不返回值
- 广播没有超时处理
- 适用于通知、事件和单向数据推送

**Worker 端 - 使用内置广播 API（Hub 模式）**

```typescript
// 广播给所有客户端
ServiceWorkerChannel.subscribeGlobal('broadcastToAll', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToAll(
    'notification',
    { message: data.message, from: data.from },
    clientId  // 排除发送者
  )
  return { success: true, sentCount: count }
})

// 按类型广播
ServiceWorkerChannel.subscribeGlobal('broadcastToCart', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToType(
    'cart',  // 目标类型
    'cartUpdated',
    data,
    clientId
  )
  return { success: true, sentCount: count }
})
```

### 按类型定向推送

```typescript
// Worker 端 - 向特定类型的应用推送
subscribeMap['broadcastToType'] = async ({ data }) => {
  const clients = await self.clients.matchAll()
  
  for (const client of clients) {
    const info = clientInfo.get(client.id)
    // 只推送给指定类型的应用
    if (info && info.appType === data.targetType) {
      const channel = clientChannels.get(client.id)
      if (channel) {
        await channel.sendMessage({
          cmdname: data.eventName,
          data: data.payload
        })
      }
    }
  }
}

// 页面端 - 向所有用户中心应用推送购物车更新
await channel.publish('broadcastToType', {
  targetType: 'user',
  eventName: 'cartUpdated',
  payload: { itemCount: 3, total: 299.99 }
})
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

### 4. Service Worker 重启

浏览器可能会在 SW 空闲时终止它以节省资源。当 SW 重启时，所有的 channel 和状态都会丢失。

::: warning SW 重启问题
当 SW 重启后，页面端的 channel 可能仍然认为自己是连接状态，但 SW 端的 channel 已经不存在了。这会导致消息无法被正确处理。
:::

**解决方案：使用 Hub 模式 + autoReconnect**

```typescript
// Worker 端 - setupHub 自动处理 SW 生命周期
ServiceWorkerChannel.setupHub({
  version: '1.0.0'  // 版本号会在 SW 激活时通知页面
})

// 页面端 - autoReconnect 自动处理重连
const channel = await ServiceWorkerChannel.createFromPage({
  swUrl: '/sw.js',
  autoReconnect: true,  // 默认开启
  appType: 'myApp',
  appName: 'My Application'
})

// Hub 会在 SW 激活时自动广播 __sw-activated__ 事件
// 页面端收到后会自动重新注册
```

**手动处理（高级用法）：**

```typescript
// Worker 端 - 使用全局路由手动恢复
ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
  const channel = ServiceWorkerChannel.createFromWorker(clientId)
  // 设置处理器...
  channel.handleMessage(event)
})

// 页面端 - 监听 SW 激活事件
channel.onBroadcast('__sw-activated__', ({ data }) => {
  console.log('SW activated:', data.version)
  // 可以在这里执行额外的重连逻辑
})
```

## 下一步

- [TypeScript 支持](./typescript.md)
- [调试技巧](./debugging.md)
- [API 参考](/api/service-worker-channel.md)
