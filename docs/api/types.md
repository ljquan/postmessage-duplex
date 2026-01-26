# 类型定义

本页列出 postmessage-duplex 的所有类型定义。

## Communicator

通讯器接口，定义了通道的核心方法。

```typescript
interface Communicator<TMethods extends Methods = Methods> {
  /** 通道是否就绪 */
  isReady: boolean
  
  /** 通道是否已销毁 */
  isDestroyed: boolean
  
  /** 发送消息并等待响应 */
  publish(
    cmdname: string, 
    data?: any, 
    options?: PublishOptions
  ): Promise<PostResponse>
  
  /** 类型安全的远程方法调用 */
  call<K extends keyof TMethods>(
    methodName: K, 
    params: MethodParams<TMethods[K]>
  ): Promise<TypedPostResponse<MethodReturn<TMethods[K]>>>
  
  /** 订阅消息 */
  subscribe(cmdname: string, callback: PostCallback): this
  
  /** 一次性订阅 */
  once(cmdname: string, callback: PostCallback): this
  
  /** 取消订阅 */
  unSubscribe(cmdname: string): this
  
  /** 销毁通道 */
  destroy(): void
}
```

## PostResponse

响应数据结构。

```typescript
interface PostResponse {
  /** 请求 ID，用于关联请求和响应 */
  requestId?: string
  
  /** 返回码 */
  ret: ReturnCode
  
  /** 响应数据 */
  data?: any
  
  /** 错误信息 */
  msg?: string
  
  /** 时间戳 */
  time?: number
}
```

## TypedPostResponse

类型安全的响应数据结构。

```typescript
interface TypedPostResponse<T> extends Omit<PostResponse, 'data'> {
  /** 强类型的响应数据 */
  data?: T
}
```

## PostRequest

请求数据结构。

```typescript
interface PostRequest {
  /** 请求 ID */
  requestId: string
  
  /** 命令/事件名称 */
  cmdname: string
  
  /** 请求数据 */
  data?: any
  
  /** 时间戳 */
  time: number
  
  /** 配对密钥 */
  peerKey?: string
}
```

## ChannelOption

通道配置选项。

```typescript
interface ChannelOption {
  /** 
   * 请求超时时间（毫秒）
   * @default 5000
   */
  timeout?: number
  
  /** 
   * 自定义日志对象
   * 需要实现 log, warn, error 方法
   */
  log?: Console
  
  /** 
   * 预定义订阅映射
   * 键为命令名，值为回调函数
   */
  subscribeMap?: Record<string, PostCallback>
  
  /** 
   * 最大消息大小（字节）
   * @default 1048576 (1MB)
   */
  maxMessageSize?: number
  
  /** 
   * 速率限制（每秒消息数）
   * @default 100
   */
  rateLimit?: number
}
```

## PublishOptions

发布消息的选项。

```typescript
interface PublishOptions {
  /** 
   * 此次请求的超时时间（毫秒）
   * 覆盖通道的默认超时设置
   */
  timeout?: number
  
  /** 
   * 可传输对象数组
   * 用于高效传输 ArrayBuffer 等大数据
   * 注意：传输后原对象会被清空
   */
  transferables?: Transferable[]
}
```

## PostCallback

消息回调函数类型。

```typescript
type PostCallback = (response: PostResponse) => void | any | Promise<any>
```

**说明：**
- 返回 `void`：不发送响应
- 返回其他值：作为响应数据发送
- 返回 `Promise`：等待 Promise 解析后发送响应

## ReturnCode

返回码枚举。

```typescript
enum ReturnCode {
  /** 成功 */
  Success = 0,
  
  /** 接收方回调执行错误 */
  ReceiverCallbackError = -1,
  
  /** 发送方回调执行错误 */
  SendCallbackError = -2,
  
  /** 未订阅该事件 */
  NoSubscribe = -3,
  
  /** 请求超时 */
  TimeOut = -99
}
```

## Methods

远程方法类型定义的基类型。

```typescript
type Methods = Record<string, (...args: any[]) => any>
```

**示例：**

```typescript
interface MyMethods extends Methods {
  getData(params: { id: number }): { name: string }
  setData(params: { id: number; name: string }): void
  ping(): { pong: boolean }
}
```

## MethodParams

提取方法参数类型的工具类型。

```typescript
type MethodParams<T> = T extends (params: infer P) => any ? P : never
```

**示例：**

```typescript
interface Methods {
  getData(params: { id: number }): { name: string }
}

type Params = MethodParams<Methods['getData']>
// { id: number }
```

## MethodReturn

提取方法返回类型的工具类型。

```typescript
type MethodReturn<T> = T extends (...args: any[]) => infer R ? R : never
```

**示例：**

```typescript
interface Methods {
  getData(params: { id: number }): { name: string }
}

type Return = MethodReturn<Methods['getData']>
// { name: string }
```

## 使用示例

```typescript
import { 
  IframeChannel,
  ReturnCode,
  type PostResponse,
  type ChannelOption,
  type Methods,
  type MethodParams,
  type MethodReturn
} from 'postmessage-duplex'

// 定义远程方法
interface RemoteMethods extends Methods {
  getUser(params: { id: number }): { name: string; email: string }
  updateUser(params: { id: number; data: Partial<User> }): void
}

interface User {
  name: string
  email: string
}

// 配置
const options: ChannelOption = {
  timeout: 10000,
  log: console,
  subscribeMap: {
    ping: () => ({ pong: true })
  }
}

// 创建通道
const channel = new IframeChannel<RemoteMethods>(iframe, options)

// 类型安全的调用
async function getUser(id: number) {
  const response = await channel.call('getUser', { id })
  
  if (response.ret === ReturnCode.Success && response.data) {
    // response.data 类型为 { name: string; email: string }
    return response.data
  }
  
  throw new Error(response.msg)
}

// 使用工具类型
type GetUserParams = MethodParams<RemoteMethods['getUser']>
// { id: number }

type GetUserReturn = MethodReturn<RemoteMethods['getUser']>
// { name: string; email: string }
```
