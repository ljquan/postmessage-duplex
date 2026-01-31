# 快速开始

本指南将帮助你在 5 分钟内上手 postmessage-duplex。

::: tip 在线体验
不想安装？试试 [🎮 在线 Playground](/playground/) - 直接在浏览器中体验所有功能！
:::

## 安装

::: code-tabs

@tab npm

```bash
npm install postmessage-duplex
```

@tab yarn

```bash
yarn add postmessage-duplex
```

@tab pnpm

```bash
pnpm add postmessage-duplex
```

:::

### CDN 使用

```html
<script src="https://unpkg.com/postmessage-duplex/dist/index.umd.js"></script>
<script>
  const { IframeChannel, ServiceWorkerChannel } = window.PostMessageChannel
</script>
```

## 基础用法

### Iframe 通讯

假设你有一个父页面需要和嵌入的 iframe 通讯。

**父页面 (parent.html)**

```html
<!DOCTYPE html>
<html>
<head>
  <title>父页面</title>
</head>
<body>
  <iframe id="child" src="./child.html"></iframe>
  
  <script type="module">
    import { IframeChannel } from 'postmessage-duplex'
    
    const iframe = document.getElementById('child')
    const channel = new IframeChannel(iframe)
    
    // 发送请求到子页面
    async function getData() {
      const response = await channel.publish('getData', { id: 1 })
      console.log('收到响应:', response.data)
    }
    
    // 监听子页面的消息
    channel.subscribe('childReady', () => {
      console.log('子页面已就绪')
      return { acknowledged: true }
    })
    
    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
      channel.destroy()
    })
  </script>
</body>
</html>
```

**子页面 (child.html)**

```html
<!DOCTYPE html>
<html>
<head>
  <title>子页面</title>
</head>
<body>
  <script type="module">
    import { IframeChannel } from 'postmessage-duplex'
    
    // 传入父页面的 origin
    const channel = new IframeChannel(window.location.origin)
    
    // 监听父页面的请求
    channel.subscribe('getData', ({ data }) => {
      console.log('收到请求:', data)
      // 返回数据给父页面
      return { name: 'test', id: data.id }
    })
    
    // 通知父页面子页面已就绪
    channel.publish('childReady', { time: Date.now() })
  </script>
</body>
</html>
```

### Service Worker 通讯

**页面端**

```typescript
import { ServiceWorkerChannel } from 'postmessage-duplex'

async function initSW() {
  // 一键初始化：自动注册 SW、建立连接、处理重连
  const channel = await ServiceWorkerChannel.createFromPage({
    swUrl: './sw.js',     // 自动注册 SW
    appType: 'myApp',     // 应用类型（用于按类型广播）
    appName: 'My App'     // 应用名称
  })
  
  // 发送请求
  const response = await channel.publish('fetchData', { url: '/api/data' })
  console.log('数据:', response.data)
  
  // 接收广播
  channel.onBroadcast('notification', ({ data }) => {
    console.log('收到通知:', data)
  })
}

initSW()
```

**Service Worker 端 (sw.js)**

```javascript
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 一行代码初始化 Hub
ServiceWorkerChannel.setupHub({ version: '1.0.0' })

// 注册处理器（所有客户端共享）
ServiceWorkerChannel.subscribeGlobal('fetchData', async ({ data }) => {
  const response = await fetch(data.url)
  return await response.json()
})

// 广播通知给所有客户端
ServiceWorkerChannel.subscribeGlobal('notifyAll', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToAll('notification', data, clientId)
  return { sentCount: count }
})
```

## 配置选项

```typescript
const channel = new IframeChannel(iframe, {
  // 请求超时时间（毫秒），默认 5000
  timeout: 10000,
  
  // 自定义日志
  log: {
    log: console.log,
    warn: console.warn,
    error: console.error
  },
  
  // 预定义订阅
  subscribeMap: {
    'ping': () => ({ pong: true }),
    'getVersion': () => ({ version: '1.0.0' })
  }
})
```

## 错误处理

```typescript
import { ReturnCode } from 'postmessage-duplex'

const response = await channel.publish('getData', { id: 1 })

switch (response.ret) {
  case ReturnCode.Success:
    console.log('成功:', response.data)
    break
  case ReturnCode.TimeOut:
    console.error('请求超时')
    break
  case ReturnCode.NoSubscribe:
    console.error('对方未订阅此事件')
    break
  case ReturnCode.ReceiverCallbackError:
    console.error('处理器错误:', response.msg)
    break
}
```

## 销毁通道

在组件卸载或页面关闭时，记得销毁通道：

```typescript
// 销毁会：
// 1. 移除消息监听器
// 2. 清空订阅
// 3. 拒绝所有待处理的请求
channel.destroy()
```

## 下一步

- [Iframe 通讯详解](./iframe-communication.md)
- [Service Worker 通讯](./service-worker.md)
- [TypeScript 支持](./typescript.md)
- [调试技巧](./debugging.md)
