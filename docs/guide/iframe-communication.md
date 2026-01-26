# Iframe 通讯

本章详细介绍如何使用 postmessage-duplex 实现 iframe 双工通讯。

## 基本概念

在 iframe 通讯中，存在两个角色：

- **父页面**：包含 iframe 的页面
- **子页面**：iframe 内部加载的页面

两者都可以主动发起请求，也都可以响应对方的请求。

## 父页面配置

```typescript
import { IframeChannel } from 'postmessage-duplex'

// 获取 iframe 元素
const iframe = document.getElementById('my-iframe') as HTMLIFrameElement

// 创建通道
const channel = new IframeChannel(iframe)

// 检查通道是否就绪
console.log('父页面模式:', !channel.isSon) // true
console.log('目标 origin:', channel.getTargetOrigin())
```

## 子页面配置

```typescript
import { IframeChannel } from 'postmessage-duplex'

// 传入父页面的 origin
const channel = new IframeChannel('https://parent-domain.com')

// 检查模式
console.log('子页面模式:', channel.isSon) // true
```

::: warning 注意
子页面必须传入正确的父页面 origin，否则会抛出错误。库会自动检查 `document.referrer` 是否匹配。
:::

## 发送消息

### publish - 请求-响应模式

```typescript
// 发送消息并等待响应
const response = await channel.publish('getUserInfo', { userId: 123 })

if (response.ret === ReturnCode.Success) {
  console.log('用户信息:', response.data)
}
```

### 带选项的发送

```typescript
// 自定义超时
const response = await channel.publish('slowOperation', { data: 'test' }, {
  timeout: 30000 // 30 秒超时
})

// 传输大数据（使用 Transferable）
const buffer = new ArrayBuffer(1024 * 1024)
const response = await channel.publish('uploadData', { buffer }, {
  transferables: [buffer]
})
// 注意：transfer 后原 buffer 会被清空
```

## 接收消息

### subscribe - 订阅消息

```typescript
// 同步处理器
channel.subscribe('ping', () => {
  return { pong: true }
})

// 异步处理器
channel.subscribe('fetchData', async ({ data }) => {
  const result = await fetch(`/api/${data.id}`)
  return await result.json()
})

// 处理器抛出错误会自动返回 ReceiverCallbackError
channel.subscribe('riskyOperation', ({ data }) => {
  if (!data.valid) {
    throw new Error('Invalid data')
  }
  return { ok: true }
})
```

### once - 一次性订阅

```typescript
// 只执行一次，执行后自动取消订阅
channel.once('init', ({ data }) => {
  console.log('初始化数据:', data)
  return { received: true }
})
```

### 取消订阅

```typescript
channel.unSubscribe('eventName')
```

## 跨域通讯

跨域 iframe 通讯需要注意以下几点：

### 1. 正确设置 origin

```typescript
// 子页面必须传入父页面的完整 origin
const channel = new IframeChannel('https://parent.example.com')
```

### 2. 安全验证

postmessage-duplex 自动进行双层验证：

1. **Origin 验证**：消息必须来自预期的 origin
2. **Source 验证**：消息必须来自配对的窗口
3. **PeerKey 验证**：消息必须来自配对的通道实例

```typescript
// 这些验证都是自动进行的，你不需要手动处理
// 来自其他 origin 或其他通道的消息会被自动忽略
```

## 多 iframe 场景

当页面中有多个 iframe 时，为每个 iframe 创建独立的通道：

```typescript
const iframe1 = document.getElementById('iframe-1')
const iframe2 = document.getElementById('iframe-2')

const channel1 = new IframeChannel(iframe1)
const channel2 = new IframeChannel(iframe2)

// 各通道独立工作，消息不会混淆
await channel1.publish('getData', { from: 'channel1' })
await channel2.publish('getData', { from: 'channel2' })
```

## 连接状态

```typescript
// 检查是否就绪
if (channel.isReady) {
  // 已连接
}

// 就绪前发送的消息会自动缓存
channel.publish('earlyMessage', { data: 'test' })
// 连接就绪后自动发送
```

## 销毁通道

```typescript
// 销毁通道
channel.destroy()

// 销毁后的行为：
// 1. 所有待处理的请求会被拒绝（reject）
// 2. 消息监听器被移除
// 3. 不能再发送消息
```

## 完整示例

### 父页面

```html
<!DOCTYPE html>
<html>
<head>
  <title>父页面</title>
</head>
<body>
  <h1>父页面</h1>
  <button id="sendBtn">发送消息</button>
  <div id="log"></div>
  
  <iframe id="child" src="./child.html" style="width:100%;height:300px;"></iframe>
  
  <script type="module">
    import { IframeChannel, ReturnCode } from 'postmessage-duplex'
    
    const iframe = document.getElementById('child')
    const channel = new IframeChannel(iframe)
    const log = document.getElementById('log')
    
    function addLog(msg) {
      log.innerHTML += `<p>${new Date().toLocaleTimeString()}: ${msg}</p>`
    }
    
    // 监听子页面消息
    channel.subscribe('childEvent', ({ data }) => {
      addLog(`收到子页面消息: ${JSON.stringify(data)}`)
      return { received: true }
    })
    
    // 发送按钮
    document.getElementById('sendBtn').addEventListener('click', async () => {
      const response = await channel.publish('parentEvent', { 
        time: Date.now() 
      })
      
      if (response.ret === ReturnCode.Success) {
        addLog(`收到响应: ${JSON.stringify(response.data)}`)
      } else {
        addLog(`错误: ${response.msg}`)
      }
    })
    
    // 清理
    window.addEventListener('beforeunload', () => channel.destroy())
  </script>
</body>
</html>
```

### 子页面

```html
<!DOCTYPE html>
<html>
<head>
  <title>子页面</title>
</head>
<body>
  <h2>子页面</h2>
  <button id="sendBtn">发送消息给父页面</button>
  <div id="log"></div>
  
  <script type="module">
    import { IframeChannel, ReturnCode } from 'postmessage-duplex'
    
    const channel = new IframeChannel(window.location.origin)
    const log = document.getElementById('log')
    
    function addLog(msg) {
      log.innerHTML += `<p>${new Date().toLocaleTimeString()}: ${msg}</p>`
    }
    
    // 监听父页面消息
    channel.subscribe('parentEvent', ({ data }) => {
      addLog(`收到父页面消息: ${JSON.stringify(data)}`)
      return { echo: data, processed: true }
    })
    
    // 发送按钮
    document.getElementById('sendBtn').addEventListener('click', async () => {
      const response = await channel.publish('childEvent', {
        message: 'Hello from child!'
      })
      
      if (response.ret === ReturnCode.Success) {
        addLog(`收到响应: ${JSON.stringify(response.data)}`)
      }
    })
  </script>
</body>
</html>
```

## 下一步

- [Service Worker 通讯](./service-worker.md)
- [TypeScript 支持](./typescript.md)
- [调试技巧](./debugging.md)
