# 介绍

postmessage-duplex 是一个基于 postMessage API 的轻量级双工通讯库，支持 iframe 和 Service Worker 两种通讯场景。

## 什么是双工通讯？

双工通讯意味着两端都可以主动发起请求，并等待对方响应。就像打电话一样，双方都可以说话和倾听。

```
┌─────────────────────────────────────────────────────────────┐
│  父页面                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  channel.publish('getData', {id: 1})  ──────────────│────│───┐
│  │  channel.subscribe('notify', handler) <─────────────│────│───│─┐
│  └─────────────────────────────────────────────────────┘    │   │ │
│                          ▲                                   │   │ │
│                          │ iframe                           │   │ │
│  ┌───────────────────────┴─────────────────────────────┐    │   │ │
│  │  子页面                                              │    │   │ │
│  │  channel.subscribe('getData', handler)  <───────────│────│───┘ │
│  │  channel.publish('notify', data)  ──────────────────│────│─────┘
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 核心特性

### 请求-响应模式

原生 postMessage 是"发后即忘"的模式，你需要手动关联请求和响应。postmessage-duplex 自动处理这一切：

```typescript
// 发送请求，返回 Promise
const response = await channel.publish('getUserInfo', { userId: 123 })

// 直接使用响应数据
console.log(response.data.name)
```

### 自动消息队列

在连接就绪之前发送的消息会自动缓存，连接成功后自动发送：

```typescript
const channel = new IframeChannel(iframe)

// 即使 iframe 还没加载完，消息也会被缓存
channel.publish('init', { config: {} })

// 连接就绪后自动发送
```

### 类型安全

完整的 TypeScript 支持，包括泛型：

```typescript
interface RemoteMethods {
  getData(params: { id: number }): { name: string }
}

const channel = new IframeChannel<RemoteMethods>(iframe)

// 自动类型推断
const response = await channel.call('getData', { id: 1 })
// response.data 类型为 { name: string } | undefined
```

## 支持的场景

### Iframe 通讯

父页面与 iframe 子页面之间的通讯，支持同域和跨域：

- 父页面 → 子页面
- 子页面 → 父页面
- 双向同时通讯

### Service Worker 通讯

页面与 Service Worker 之间的通讯：

- 页面 → Service Worker
- Service Worker → 页面
- 多页面共享同一个 Service Worker

## 浏览器兼容性

| 浏览器 | Iframe | Service Worker |
|--------|--------|----------------|
| Chrome | ✅ 4+ | ✅ 40+ |
| Firefox | ✅ 3+ | ✅ 44+ |
| Safari | ✅ 4+ | ✅ 11.1+ |
| Edge | ✅ 12+ | ✅ 17+ |
| IE | ✅ 8+ | ❌ |

## 与其他库的对比

| 特性 | Comlink | Penpal | post-robot | postmessage-duplex |
|------|---------|--------|------------|---------------------|
| 包大小 | 1.1KB | ~5KB | ~15KB | ~3KB |
| TypeScript 泛型 | ✅ | ✅ | ❌ | ✅ |
| 单次调用超时 | ❌ | ✅ | ✅ | ✅ |
| Service Worker | ✅ | ❌ | ❌ | ✅ |
| 调试日志 | ❌ | ✅ | ❌ | ✅ |

## 下一步

- [快速开始](./getting-started.md) - 5 分钟上手
- [Iframe 通讯](./iframe-communication.md) - 详细的 iframe 使用指南
- [Service Worker](./service-worker.md) - SW 通讯指南
