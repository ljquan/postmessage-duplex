# postmessage-duplex

[![npm version](https://img.shields.io/npm/v/postmessage-duplex.svg)](https://www.npmjs.com/package/postmessage-duplex)
[![license](https://img.shields.io/npm/l/postmessage-duplex.svg)](https://github.com/ljquan/postmessage-duplex/blob/master/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![gzip size](https://img.shields.io/bundlephobia/minzip/postmessage-duplex)](https://bundlephobia.com/package/postmessage-duplex)

A lightweight, type-safe duplex communication library based on postMessage API. Supports both **iframe** and **Service Worker** communication scenarios.

基于 postMessage API 的轻量级、类型安全的双工通讯库。支持 **iframe** 和 **Service Worker** 两种通讯场景。

📖 **[在线文档 / Documentation](https://ljquan.github.io/postmessage-duplex/)**

---

## Why postmessage-duplex? / 为什么选择它？

| Feature | Native postMessage | postmessage-duplex |
|---------|-------------------|---------------------|
| 请求-响应模式 | ❌ 需要手动实现 | ✅ 内置支持 |
| Promise 支持 | ❌ 回调模式 | ✅ async/await |
| 超时处理 | ❌ 需要手动实现 | ✅ 自动超时 |
| 消息队列 | ❌ 需要手动实现 | ✅ 自动队列 |
| 类型安全 | ❌ any 类型 | ✅ 完整类型定义 |
| Service Worker | ❌ API 不同 | ✅ 统一接口 |

## Features / 特性

- 🔄 **Duplex Communication** - 完整的双向消息传递，支持请求-响应模式
- 🎯 **Type Safe** - TypeScript 编写，完整类型定义
- 📦 **Lightweight** - 零依赖，gzip 后 ~3KB
- ⏱️ **Timeout Handling** - 内置请求超时机制，默认 5 秒
- 📋 **Message Queue** - 连接就绪前自动缓存消息
- 🔌 **Multiple Scenarios** - 统一的 iframe 和 Service Worker 通讯接口
- 🔍 **Debug Friendly** - 内置消息追踪，方便调试

## Installation / 安装

```bash
npm install postmessage-duplex
# or
yarn add postmessage-duplex
# or
pnpm add postmessage-duplex
```

**CDN:**

```html
<script src="https://unpkg.com/postmessage-duplex/dist/index.umd.js"></script>
<script>
  const { IframeChannel, ServiceWorkerChannel } = window.PostMessageChannel
</script>
```

## Quick Start / 快速开始

### Iframe Communication / Iframe 通讯

```
┌─────────────────────────────────────────────────────────────┐
│  Parent Page (父页面)                                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  const channel = new IframeChannel(iframe)          │    │
│  │  channel.publish('getData', {id: 1})  ──────────────│────│───┐
│  │  channel.subscribe('notify', handler) <─────────────│────│───│─┐
│  └─────────────────────────────────────────────────────┘    │   │ │
│                          ▲                                   │   │ │
│                          │ iframe                           │   │ │
│  ┌───────────────────────┴─────────────────────────────┐    │   │ │
│  │  Child Page (子页面)                                 │    │   │ │
│  │  const channel = new IframeChannel(parentOrigin)    │    │   │ │
│  │  channel.subscribe('getData', handler)  <───────────│────│───┘ │
│  │  channel.publish('notify', data)  ──────────────────│────│─────┘
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Parent Page / 父页面:**

```typescript
import { IframeChannel } from 'postmessage-duplex'

const iframe = document.getElementById('my-iframe') as HTMLIFrameElement
const channel = new IframeChannel(iframe)

// 发送消息并等待响应
const response = await channel.publish('getUserInfo', { userId: 123 })
console.log('User info:', response.data)

// 监听子页面消息
channel.subscribe('notification', ({ data }) => {
  console.log('Received:', data)
  return { received: true }  // 返回响应
})
```

**Child Page / 子页面:**

```typescript
import { IframeChannel } from 'postmessage-duplex'

// 传入父页面的 origin
const channel = new IframeChannel('https://parent-domain.com')

// 监听父页面消息
channel.subscribe('getUserInfo', async ({ data }) => {
  const user = await fetchUser(data.userId)
  return user  // 返回给父页面
})

// 向父页面发送消息
channel.publish('notification', { type: 'ready' })
```

### Service Worker Communication / Service Worker 通讯

**Page Side / 页面端:**

```typescript
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 等待 Service Worker 就绪
const channel = await ServiceWorkerChannel.createFromPage()

// 发送消息到 Service Worker
const response = await channel.publish('fetchData', { url: '/api/data' })
console.log('Data:', response.data)

// 监听 Service Worker 推送
channel.subscribe('push', ({ data }) => {
  showNotification(data)
})
```

**Service Worker Side:**

```typescript
// sw.js
const channels = new Map()

self.addEventListener('message', (event) => {
  const clientId = event.source.id
  
  if (!channels.has(clientId)) {
    // 为每个客户端创建通道
    const channel = createChannel(clientId)
    
    channel.subscribe('fetchData', async ({ data }) => {
      const response = await fetch(data.url)
      return await response.json()
    })
    
    channels.set(clientId, channel)
  }
})
```

## Framework Integration / 框架集成

### Vue 3

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { IframeChannel } from 'postmessage-duplex'

const iframeRef = ref<HTMLIFrameElement>()
let channel: IframeChannel

onMounted(() => {
  channel = new IframeChannel(iframeRef.value!)
  
  channel.subscribe('childEvent', ({ data }) => {
    console.log('From child:', data)
    return { ok: true }
  })
})

onUnmounted(() => {
  channel?.destroy()
})

const sendToChild = async () => {
  const res = await channel.publish('parentEvent', { msg: 'hello' })
  console.log('Response:', res)
}
</script>

<template>
  <iframe ref="iframeRef" src="./child.html" />
  <button @click="sendToChild">Send</button>
</template>
```

### React

```tsx
import { useEffect, useRef } from 'react'
import { IframeChannel } from 'postmessage-duplex'

function ParentComponent() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const channelRef = useRef<IframeChannel>()

  useEffect(() => {
    if (iframeRef.current) {
      channelRef.current = new IframeChannel(iframeRef.current)
      
      channelRef.current.subscribe('childEvent', ({ data }) => {
        console.log('From child:', data)
        return { ok: true }
      })
    }
    
    return () => channelRef.current?.destroy()
  }, [])

  const sendToChild = async () => {
    const res = await channelRef.current?.publish('parentEvent', { msg: 'hello' })
    console.log('Response:', res)
  }

  return (
    <>
      <iframe ref={iframeRef} src="./child.html" />
      <button onClick={sendToChild}>Send</button>
    </>
  )
}
```

## API Reference / API 文档

### IframeChannel

```typescript
// 创建通道
const channel = new IframeChannel(target, options?)

// target: 
//   - 父页面传入: HTMLIFrameElement
//   - 子页面传入: string (父页面 origin，如 'https://parent.com')

// options:
interface ChannelOption {
  timeout?: number                           // 超时时间，默认 5000ms
  log?: Console                              // 自定义日志
  subscribeMap?: Record<string, Function>    // 预定义订阅
}
```

| Method | Return | Description |
|--------|--------|-------------|
| `publish(cmdname, data?)` | `Promise<PostResponse>` | 发送消息并等待响应 |
| `subscribe(cmdname, callback)` | `this` | 订阅消息 |
| `unSubscribe(cmdname)` | `this` | 取消订阅 |
| `destroy()` | `void` | 销毁通道 |
| `getTargetOrigin()` | `string` | 获取目标 origin |
| `getTargetUrl()` | `string` | 获取目标 URL |

| Property | Type | Description |
|----------|------|-------------|
| `isReady` | `boolean` | 通道是否就绪 |
| `isSon` | `boolean` | 是否为子页面 |

### ServiceWorkerChannel

```typescript
// 页面端 - 推荐方式
const channel = await ServiceWorkerChannel.createFromPage(options?)

// 页面端 - 手动传入 ServiceWorker
const channel = new ServiceWorkerChannel(navigator.serviceWorker.controller, options?)

// Worker 端 - 从事件创建
const channel = ServiceWorkerChannel.createFromEvent(event, options?)

// Worker 端 - 从 clientId 创建
const channel = ServiceWorkerChannel.createFromWorker(clientId, options?)
```

### PostResponse

```typescript
interface PostResponse {
  requestId?: string      // 请求 ID
  ret: ReturnCode         // 返回码
  data?: any              // 响应数据
  msg?: string            // 错误信息
  time?: number           // 时间戳
}
```

### ReturnCode / 返回码

```typescript
import { ReturnCode } from 'postmessage-duplex'

ReturnCode.Success               // 0: 成功
ReturnCode.ReceiverCallbackError // -1: 接收方回调错误
ReturnCode.SendCallbackError     // -2: 发送方回调错误
ReturnCode.NoSubscribe           // -3: 未订阅该事件
ReturnCode.TimeOut               // -99: 请求超时
```

## Advanced Usage / 高级用法

### Error Handling / 错误处理

```typescript
const response = await channel.publish('getData', { id: 1 })

if (response.ret === ReturnCode.Success) {
  console.log('Success:', response.data)
} else if (response.ret === ReturnCode.TimeOut) {
  console.error('Request timeout')
} else if (response.ret === ReturnCode.NoSubscribe) {
  console.error('Event not subscribed on the other side')
} else {
  console.error('Error:', response.msg)
}
```

### Custom Timeout / 自定义超时

```typescript
const channel = new IframeChannel(iframe, {
  timeout: 10000  // 10 秒超时
})
```

### Custom Logger / 自定义日志

```typescript
const channel = new IframeChannel(iframe, {
  log: {
    log: (...args) => console.log('[Channel]', ...args),
    warn: (...args) => console.warn('[Channel]', ...args),
    error: (...args) => console.error('[Channel]', ...args)
  }
})
```

### Pre-defined Subscribers / 预定义订阅

```typescript
const channel = new IframeChannel(iframe, {
  subscribeMap: {
    'ping': () => ({ pong: true, time: Date.now() }),
    'getVersion': () => ({ version: '1.0.0' })
  }
})
```

### Debug Tools / 调试工具

```typescript
import { enableDebugger } from 'postmessage-duplex'

// 在开发环境启用调试器
if (process.env.NODE_ENV === 'development') {
  enableDebugger()
}

// 然后在浏览器控制台使用：
__POSTMESSAGE_DUPLEX__.debug.help()           // 显示帮助
__POSTMESSAGE_DUPLEX__.debug.getChannels()    // 查看所有通道
__POSTMESSAGE_DUPLEX__.debug.getHistory()     // 查看消息历史
__POSTMESSAGE_DUPLEX__.debug.enableLiveLog(true)  // 开启实时日志
__POSTMESSAGE_DUPLEX__.debug.getStats()       // 查看统计信息
__POSTMESSAGE_DUPLEX__.debug.exportReport()   // 导出调试报告
```

## Browser Compatibility / 浏览器兼容性

| Browser | Iframe | Service Worker |
|---------|--------|----------------|
| Chrome | ✅ 4+ | ✅ 40+ |
| Firefox | ✅ 3+ | ✅ 44+ |
| Safari | ✅ 4+ | ✅ 11.1+ |
| Edge | ✅ 12+ | ✅ 17+ |
| IE | ✅ 8+ | ❌ |

## FAQ / 常见问题

**Q: 子页面刷新后连接会断开吗？**  
A: 不会。通道会自动处理子页面的重新加载，父页面无需重新创建通道。

**Q: 可以同时与多个 iframe 通讯吗？**  
A: 可以。为每个 iframe 创建独立的 IframeChannel 实例即可。

**Q: 跨域 iframe 可以通讯吗？**  
A: 可以，但子页面需要正确配置父页面的 origin。

**Q: Service Worker 端如何使用这个库？**  
A: Service Worker 不支持直接 import，需要使用内联实现或打包工具。参考 demo 中的 sw.js 示例。

## Development / 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问演示页面
open http://localhost:7100/demo/
```

| Script | Description |
|--------|-------------|
| `npm run dev` | 构建并启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run build:watch` | 监听模式构建 |
| `npm test` | 运行测试 |
| `npm run test:coverage` | 测试覆盖率 |

### Project Structure / 项目结构

```
src/
├── index.ts           # 入口，统一导出
├── base-channel.ts    # 抽象基类
├── iframe-channel.ts  # Iframe 通道
├── sw-channel.ts      # Service Worker 通道
├── interface.ts       # 类型定义
└── trace.ts           # 消息追踪

demo/
├── iframe/            # Iframe 示例
├── service-worker/    # SW 示例
└── debugger/          # 调试工具
```

## Changelog / 更新日志

See [CHANGELOG.md](CHANGELOG.md)

## Contributing / 贡献

欢迎提交 Issue 和 Pull Request！

## License / 许可证

[MIT](LICENSE)

---

Made with ❤️ by [liquidliang](https://github.com/ljquan)
