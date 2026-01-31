---
name: ServiceWorkerChannel Hub 扩展
overview: 扩展 ServiceWorkerChannel 的静态方法，提供全自动的多客户端管理、广播、自动重连等功能，简化 Service Worker 多页面通讯的开发。
todos:
  - id: interface-types
    content: 在 interface.ts 中添加 ClientMeta、HubOptions、PageChannelOptions 类型定义
    status: completed
  - id: hub-static-props
    content: 在 sw-channel.ts 中添加 Hub 相关静态属性（clientMeta、globalSubscribeMap 等）
    status: completed
  - id: setup-hub
    content: 实现 setupHub() 静态方法，处理 SW 生命周期和内置处理器注册
    status: completed
  - id: broadcast-methods
    content: 实现 broadcastToAll() 和 broadcastToType() 静态方法
    status: completed
  - id: query-methods
    content: 实现 getClientInfo()、getAllClients()、getClientsByType() 查询方法
    status: completed
  - id: subscribe-global
    content: 实现 subscribeGlobal() 全局处理器注册方法
    status: completed
  - id: page-options
    content: 扩展 createFromPage() 支持 appType、appName、autoReconnect 选项
    status: completed
  - id: update-demo
    content: 更新 sw-multi.js 和应用页面使用新 API
    status: completed
  - id: rebuild-umd
    content: 重新构建 UMD 文件并更新 playground
    status: completed
isProject: false
---

# ServiceWorkerChannel Hub 功能扩展

## 目标

将 `sw-multi.js` 中的通用逻辑收敛到库中，使用方只需几行代码即可实现完整的多客户端管理和广播功能。

## 新增 API 设计

### SW 端 API（静态方法）

```typescript
// 1. 初始化 Hub（自动处理 install/activate/message 事件）
ServiceWorkerChannel.setupHub({
  version?: string,              // SW 版本号
  onClientConnect?: (clientId, info) => void,    // 客户端连接回调
  onClientDisconnect?: (clientId) => void,       // 客户端断开回调
  cleanupInterval?: number       // 清理间隔（默认 30s）
})

// 2. 广播方法
ServiceWorkerChannel.broadcastToAll(eventName: string, data: any): Promise<number>
ServiceWorkerChannel.broadcastToType(type: string, eventName: string, data: any): Promise<number>

// 3. 客户端查询
ServiceWorkerChannel.getClientInfo(clientId: string): ClientMeta | undefined
ServiceWorkerChannel.getAllClients(): Map<string, ClientMeta>
ServiceWorkerChannel.getClientsByType(type: string): ClientMeta[]

// 4. 订阅全局处理器（所有客户端共享）
ServiceWorkerChannel.subscribeGlobal(cmdname: string, handler: Function)
```

### 页面端 API（createFromPage 选项扩展）

```typescript
const channel = await ServiceWorkerChannel.createFromPage({
  // 现有选项
  timeout?: number,
  
  // 新增选项
  appType?: string,        // 应用类型（用于按类型广播）
  appName?: string,        // 应用名称
  autoReconnect?: boolean  // SW 更新时自动重连（默认 true）
})
```

## 实现方案

### 文件修改

**[src/sw-channel.ts](src/sw-channel.ts)** - 主要修改

1. 新增静态属性：

   - `clientMeta: Map<string, ClientMeta>` - 存储客户端元数据
   - `globalSubscribeMap: Map<string, Function>` - 全局订阅处理器
   - `hubInitialized: boolean` - Hub 初始化标志
   - `hubOptions: HubOptions` - Hub 配置

2. 新增静态方法：

   - `setupHub()` - 初始化 Hub，注册 SW 生命周期事件
   - `broadcastToAll()` - 广播给所有客户端
   - `broadcastToType()` - 按类型广播
   - `getClientInfo()` / `getAllClients()` / `getClientsByType()` - 查询方法
   - `subscribeGlobal()` - 注册全局处理器
   - `notifyAllClients()` - 内部方法，SW 激活时通知客户端

3. 修改 `createFromPage()`:

   - 增加 `appType`, `appName`, `autoReconnect` 选项
   - 自动发送 `__register__` 消息
   - 自动监听 `__sw-activated__` 广播并重连

4. 内置处理器（setupHub 时自动注册）：

   - `__register__` - 接收客户端注册信息
   - `__ping__` - 心跳检测

**[src/interface.ts](src/interface.ts)** - 类型定义

```typescript
interface ClientMeta {
  clientId: string
  appType?: string
  appName?: string
  connectedAt: string
}

interface HubOptions {
  version?: string
  onClientConnect?: (clientId: string, meta: ClientMeta) => void
  onClientDisconnect?: (clientId: string) => void
  cleanupInterval?: number
}

interface PageChannelOptions extends ChannelOption {
  appType?: string
  appName?: string
  autoReconnect?: boolean
}
```

## 使用示例

### SW 端（简化后）

```javascript
// sw.js - 只需几行代码
importScripts('./postmessage-duplex.umd.js')
const { ServiceWorkerChannel } = PostMessageChannel

ServiceWorkerChannel.setupHub({ version: '1.0.0' })

// 注册业务处理器
ServiceWorkerChannel.subscribeGlobal('echo', ({ data }) => ({
  echoed: data.message
}))

ServiceWorkerChannel.subscribeGlobal('getCart', async ({ data }) => {
  // 业务逻辑
  return { items: [...], total: 100 }
})
```

### 页面端（简化后）

```javascript
// 自动注册、自动重连
const channel = await ServiceWorkerChannel.createFromPage({
  appType: 'cart',
  appName: '购物车'
})

// 收发消息
channel.onBroadcast('notification', ({ data }) => { ... })
await channel.publish('echo', { message: 'hello' })
```

## 向后兼容性

- 所有现有 API 保持不变
- `setupHub()` 是可选的，不调用则使用原有的手动模式
- 新增选项都有默认值

## 内部消息命名规范

使用 `__` 前缀标识库内部消息，避免与用户业务消息冲突：

- `__register__` - 客户端注册
- `__sw-activated__` - SW 激活通知
- `__ping__` - 心跳