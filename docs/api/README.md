# API 参考

本节提供 postmessage-duplex 的完整 API 文档。

## 核心类

| 类 | 描述 |
|---|------|
| [IframeChannel](./iframe-channel.md) | 用于 iframe 双工通讯 |
| [ServiceWorkerChannel](./service-worker-channel.md) | 用于 Service Worker 双工通讯 |
| [ChannelError](./errors.md) | 自定义错误类 |

## 类型定义

| 类型 | 描述 |
|------|------|
| [Communicator](./types.md#communicator) | 通讯器接口 |
| [PostResponse](./types.md#postresponse) | 响应数据结构 |
| [PostRequest](./types.md#postrequest) | 请求数据结构 |
| [ChannelOption](./types.md#channeloption) | 配置选项 |
| [PublishOptions](./types.md#publishoptions) | 发布选项 |

## 枚举

| 枚举 | 描述 |
|------|------|
| [ReturnCode](./types.md#returncode) | 返回码枚举 |
| [ErrorCode](./errors.md#errorcode) | 错误码枚举 |

## 快速参考

### IframeChannel

```typescript
import { IframeChannel } from 'postmessage-duplex'

// 父页面
const channel = new IframeChannel(iframe, options?)

// 子页面
const channel = new IframeChannel(parentOrigin, options?)

// 方法
await channel.publish(cmdname, data?, options?)  // 发送并等待响应
await channel.call(methodName, params)           // 类型安全的远程调用
channel.subscribe(cmdname, callback)             // 订阅消息
channel.once(cmdname, callback)                  // 一次性订阅
channel.unSubscribe(cmdname)                     // 取消订阅
channel.destroy()                                // 销毁通道

// 属性
channel.isReady      // boolean - 是否就绪
channel.isSon        // boolean - 是否为子页面
channel.isDestroyed  // boolean - 是否已销毁
```

### ServiceWorkerChannel

```typescript
import { ServiceWorkerChannel } from 'postmessage-duplex'

// 页面端
const channel = await ServiceWorkerChannel.createFromPage(options?)

// Worker 端
const channel = ServiceWorkerChannel.createFromEvent(event, options?)
const channel = ServiceWorkerChannel.createFromWorker(clientId, options?)

// 方法与 IframeChannel 相同
```

### 配置选项

```typescript
interface ChannelOption {
  timeout?: number                // 默认 5000ms
  log?: Console                   // 自定义日志
  subscribeMap?: Record<string, Function>  // 预定义订阅
  maxMessageSize?: number         // 最大消息大小
  rateLimit?: number              // 速率限制
}
```

### 发布选项

```typescript
interface PublishOptions {
  timeout?: number               // 覆盖默认超时
  transferables?: Transferable[] // 可传输对象
}
```

### 返回码

```typescript
enum ReturnCode {
  Success = 0,                    // 成功
  ReceiverCallbackError = -1,     // 接收方回调错误
  SendCallbackError = -2,         // 发送方回调错误
  NoSubscribe = -3,               // 未订阅
  TimeOut = -99                   // 超时
}
```

## 导入

```typescript
// 命名导入
import { 
  IframeChannel,
  ServiceWorkerChannel,
  ChannelError,
  ReturnCode,
  ErrorCode,
  createConnectionDestroyedError,
  createTimeoutError,
  createHandlerError
} from 'postmessage-duplex'

// 类型导入
import type {
  PostResponse,
  PostRequest,
  PostCallback,
  ChannelOption,
  PublishOptions,
  Communicator,
  Methods,
  MethodParams,
  MethodReturn,
  TypedPostResponse
} from 'postmessage-duplex'
```
