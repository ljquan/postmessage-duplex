# IframeChannel

用于 iframe 父子页面双工通讯的类。

## 构造函数

```typescript
new IframeChannel<TMethods extends Methods = Methods>(
  target: HTMLIFrameElement | string,
  options?: ChannelOption
)
```

### 参数

| 参数 | 类型 | 描述 |
|------|------|------|
| `target` | `HTMLIFrameElement \| string` | 父页面传入 iframe 元素，子页面传入父页面 origin |
| `options` | `ChannelOption` | 可选配置 |

### 泛型参数

| 参数 | 描述 |
|------|------|
| `TMethods` | 远程端支持的方法类型定义 |

### 示例

```typescript
// 父页面
const iframe = document.getElementById('child') as HTMLIFrameElement
const channel = new IframeChannel(iframe)

// 子页面
const channel = new IframeChannel('https://parent.com')

// 带配置
const channel = new IframeChannel(iframe, {
  timeout: 10000,
  log: console
})

// 带类型
interface RemoteMethods {
  getData(p: { id: number }): { name: string }
}
const channel = new IframeChannel<RemoteMethods>(iframe)
```

## 方法

### publish

发送消息并等待响应。

```typescript
publish(
  cmdname: string,
  data?: any,
  options?: PublishOptions
): Promise<PostResponse>
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `cmdname` | `string` | 命令/事件名称 |
| `data` | `any` | 要发送的数据 |
| `options` | `PublishOptions` | 发布选项 |

**返回值：** `Promise<PostResponse>`

**示例：**

```typescript
// 基本用法
const response = await channel.publish('getData', { id: 1 })

// 自定义超时
const response = await channel.publish('slowOp', data, { timeout: 30000 })

// 使用 Transferable
const buffer = new ArrayBuffer(1024)
const response = await channel.publish('upload', { buffer }, {
  transferables: [buffer]
})
```

### call

类型安全的远程方法调用。

```typescript
call<K extends keyof TMethods>(
  methodName: K,
  params: MethodParams<TMethods[K]>
): Promise<TypedPostResponse<MethodReturn<TMethods[K]>>>
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `methodName` | `K` | 方法名（泛型约束） |
| `params` | `MethodParams<TMethods[K]>` | 方法参数 |

**返回值：** `Promise<TypedPostResponse<MethodReturn<TMethods[K]>>>`

**示例：**

```typescript
interface Methods {
  getUser(p: { id: number }): { name: string; age: number }
}

const channel = new IframeChannel<Methods>(iframe)
const response = await channel.call('getUser', { id: 1 })

// response.data 类型为 { name: string; age: number } | undefined
if (response.data) {
  console.log(response.data.name) // 类型安全
}
```

### subscribe

订阅消息。

```typescript
subscribe(cmdname: string, callback: PostCallback): this
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `cmdname` | `string` | 命令/事件名称 |
| `callback` | `PostCallback` | 回调函数 |

**返回值：** `this`（支持链式调用）

**示例：**

```typescript
// 同步回调
channel.subscribe('ping', () => ({ pong: true }))

// 异步回调
channel.subscribe('fetchData', async ({ data }) => {
  const result = await fetch(`/api/${data.id}`)
  return await result.json()
})

// 链式调用
channel
  .subscribe('event1', handler1)
  .subscribe('event2', handler2)
```

### once

一次性订阅，执行后自动取消。

```typescript
once(cmdname: string, callback: PostCallback): this
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `cmdname` | `string` | 命令/事件名称 |
| `callback` | `PostCallback` | 回调函数 |

**返回值：** `this`（支持链式调用）

**示例：**

```typescript
channel.once('init', ({ data }) => {
  console.log('初始化数据:', data)
  return { received: true }
})
// 第一次收到 init 消息后自动取消订阅
```

### unSubscribe

取消订阅。

```typescript
unSubscribe(cmdname: string): this
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `cmdname` | `string` | 命令/事件名称 |

**返回值：** `this`（支持链式调用）

### broadcast

发送广播消息（单向，无响应）。

```typescript
broadcast(cmdname: string, data?: any, options?: BroadcastOptions): void
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `cmdname` | `string` | 命令/事件名称 |
| `data` | `any` | 要发送的数据 |
| `options` | `BroadcastOptions` | 广播选项 |

**返回值：** `void`（无返回值，fire-and-forget）

**示例：**

```typescript
// 发送通知
channel.broadcast('notification', { type: 'info', message: '操作成功' })

// 使用 Transferable
const buffer = new ArrayBuffer(1024)
channel.broadcast('bufferUpdate', { buffer }, {
  transferables: [buffer]
})
```

### onBroadcast

注册广播消息处理器。

```typescript
onBroadcast(cmdname: string, callback: (data: { cmdname: string; data?: any }) => void): this
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `cmdname` | `string` | 命令/事件名称 |
| `callback` | `function` | 回调函数（无需返回值） |

**返回值：** `this`（支持链式调用）

**示例：**

```typescript
channel.onBroadcast('notification', ({ data }) => {
  console.log('收到通知:', data.message)
  // 无需返回值 - 广播是单向的
})
```

### offBroadcast

移除广播消息处理器。

```typescript
offBroadcast(cmdname: string): this
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `cmdname` | `string` | 命令/事件名称 |

**返回值：** `this`（支持链式调用）

### destroy

销毁通道，释放资源。

```typescript
destroy(): void
```

**行为：**
- 移除消息监听器
- 清空订阅映射
- 拒绝所有待处理的请求
- 设置 `isDestroyed = true`

**示例：**

```typescript
// 在组件卸载时调用
window.addEventListener('beforeunload', () => {
  channel.destroy()
})
```

### getTargetOrigin

获取目标 origin。

```typescript
getTargetOrigin(): string
```

### getTargetUrl

获取目标完整 URL。

```typescript
getTargetUrl(): string
```

## 属性

### isReady

通道是否就绪。

```typescript
readonly isReady: boolean
```

### isSon

是否为子页面模式。

```typescript
readonly isSon: boolean
```

### isDestroyed

通道是否已销毁。

```typescript
readonly isDestroyed: boolean
```

## 完整示例

```typescript
import { IframeChannel, ReturnCode } from 'postmessage-duplex'

interface ChildMethods {
  getData(params: { id: number }): { name: string; value: number }
  updateData(params: { id: number; data: object }): void
}

class ParentController {
  private channel: IframeChannel<ChildMethods>
  
  constructor(iframe: HTMLIFrameElement) {
    this.channel = new IframeChannel<ChildMethods>(iframe, {
      timeout: 10000,
      subscribeMap: {
        'childReady': () => ({ acknowledged: true })
      }
    })
    
    this.setupListeners()
  }
  
  private setupListeners() {
    this.channel.subscribe('notification', ({ data }) => {
      console.log('通知:', data)
      return { received: true }
    })
  }
  
  async fetchData(id: number) {
    const response = await this.channel.call('getData', { id })
    
    if (response.ret === ReturnCode.Success && response.data) {
      return response.data
    }
    
    throw new Error(response.msg || 'Failed to fetch data')
  }
  
  async updateData(id: number, data: object) {
    const response = await this.channel.call('updateData', { id, data })
    
    if (response.ret !== ReturnCode.Success) {
      throw new Error(response.msg || 'Failed to update data')
    }
  }
  
  destroy() {
    this.channel.destroy()
  }
}
```
