# 错误处理

postmessage-duplex 提供了结构化的错误处理机制。

## ChannelError

自定义错误类，包含错误码和详细信息。

```typescript
class ChannelError extends Error {
  /** 错误码 */
  code: ErrorCode
  
  /** 详细信息 */
  details?: Record<string, any>
  
  constructor(
    message: string, 
    code: ErrorCode, 
    details?: Record<string, any>
  )
  
  /** 转换为 JSON 对象 */
  toJSON(): {
    name: string
    message: string
    code: ErrorCode
    details?: Record<string, any>
  }
}
```

### 示例

```typescript
import { ChannelError, ErrorCode } from 'postmessage-duplex'

try {
  await channel.publish('test')
} catch (error) {
  if (error instanceof ChannelError) {
    console.log('错误码:', error.code)
    console.log('错误信息:', error.message)
    console.log('详细信息:', error.details)
    console.log('JSON:', error.toJSON())
  }
}
```

## ErrorCode

错误码枚举。

```typescript
enum ErrorCode {
  /** 通道已销毁 */
  ConnectionDestroyed = 'CONNECTION_DESTROYED',
  
  /** 连接超时 */
  ConnectionTimeout = 'CONNECTION_TIMEOUT',
  
  /** 方法调用超时 */
  MethodCallTimeout = 'METHOD_CALL_TIMEOUT',
  
  /** 方法未找到 */
  MethodNotFound = 'METHOD_NOT_FOUND',
  
  /** 传输失败 */
  TransmissionFailed = 'TRANSMISSION_FAILED',
  
  /** 消息大小超限 */
  MessageSizeExceeded = 'MESSAGE_SIZE_EXCEEDED',
  
  /** 速率限制 */
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED',
  
  /** 处理器错误 */
  HandlerError = 'HANDLER_ERROR',
  
  /** 无效消息 */
  InvalidMessage = 'INVALID_MESSAGE',
  
  /** Origin 不匹配 */
  OriginMismatch = 'ORIGIN_MISMATCH'
}
```

### 错误码说明

| 错误码 | 描述 | 常见原因 |
|--------|------|----------|
| `ConnectionDestroyed` | 通道已被销毁 | 在调用 `destroy()` 后继续使用通道 |
| `ConnectionTimeout` | 连接建立超时 | iframe 加载失败或 Service Worker 未就绪 |
| `MethodCallTimeout` | 方法调用超时 | 远程处理时间过长或未响应 |
| `MethodNotFound` | 方法未找到 | 远程端未订阅该事件 |
| `TransmissionFailed` | 传输失败 | postMessage 调用失败 |
| `MessageSizeExceeded` | 消息大小超限 | 消息超过 `maxMessageSize` 设置 |
| `RateLimitExceeded` | 速率限制 | 消息发送频率超过 `rateLimit` 设置 |
| `HandlerError` | 处理器错误 | 远程回调函数抛出异常 |
| `InvalidMessage` | 无效消息 | 消息格式不正确 |
| `OriginMismatch` | Origin 不匹配 | 消息来源与预期 origin 不一致 |

## 工厂函数

### createConnectionDestroyedError

创建连接已销毁错误。

```typescript
function createConnectionDestroyedError(): ChannelError
```

**示例：**

```typescript
import { createConnectionDestroyedError } from 'postmessage-duplex'

if (channel.isDestroyed) {
  throw createConnectionDestroyedError()
}
```

### createTimeoutError

创建超时错误。

```typescript
function createTimeoutError(
  cmdname: string, 
  timeout: number
): ChannelError
```

**示例：**

```typescript
import { createTimeoutError } from 'postmessage-duplex'

throw createTimeoutError('getData', 5000)
// ChannelError: Method call 'getData' timed out after 5000ms
```

### createHandlerError

创建处理器错误。

```typescript
function createHandlerError(
  cmdname: string, 
  originalError: Error
): ChannelError
```

**示例：**

```typescript
import { createHandlerError } from 'postmessage-duplex'

try {
  await handler(data)
} catch (error) {
  throw createHandlerError('getData', error as Error)
}
```

## 错误处理最佳实践

### 基于返回码的处理

```typescript
import { ReturnCode } from 'postmessage-duplex'

const response = await channel.publish('getData', { id: 1 })

switch (response.ret) {
  case ReturnCode.Success:
    console.log('成功:', response.data)
    break
    
  case ReturnCode.TimeOut:
    console.error('请求超时，请稍后重试')
    break
    
  case ReturnCode.NoSubscribe:
    console.error('远程端未处理此请求')
    break
    
  case ReturnCode.ReceiverCallbackError:
    console.error('远程处理错误:', response.msg)
    break
    
  default:
    console.error('未知错误:', response)
}
```

### 基于异常的处理

```typescript
import { ChannelError, ErrorCode } from 'postmessage-duplex'

try {
  await channel.publish('getData', { id: 1 })
} catch (error) {
  if (error instanceof ChannelError) {
    switch (error.code) {
      case ErrorCode.ConnectionDestroyed:
        // 重新创建通道
        channel = new IframeChannel(iframe)
        break
        
      case ErrorCode.MethodCallTimeout:
        // 重试或提示用户
        showRetryDialog()
        break
        
      case ErrorCode.RateLimitExceeded:
        // 延迟重试
        await delay(1000)
        retry()
        break
        
      default:
        // 记录错误
        logError(error)
    }
  } else {
    // 非通道错误
    throw error
  }
}
```

### 类型守卫

```typescript
function isChannelError(error: unknown): error is ChannelError {
  return error instanceof ChannelError
}

function isTimeoutError(error: unknown): boolean {
  return isChannelError(error) && error.code === ErrorCode.MethodCallTimeout
}

// 使用
try {
  await channel.publish('test')
} catch (error) {
  if (isTimeoutError(error)) {
    // 处理超时
  }
}
```

### 统一错误处理

```typescript
class ChannelClient {
  private channel: IframeChannel
  
  async request<T>(cmdname: string, data?: any): Promise<T> {
    if (this.channel.isDestroyed) {
      throw createConnectionDestroyedError()
    }
    
    const response = await this.channel.publish(cmdname, data)
    
    if (response.ret === ReturnCode.Success) {
      return response.data as T
    }
    
    // 统一转换为 ChannelError
    throw this.createError(response)
  }
  
  private createError(response: PostResponse): ChannelError {
    switch (response.ret) {
      case ReturnCode.TimeOut:
        return new ChannelError(
          'Request timed out',
          ErrorCode.MethodCallTimeout
        )
        
      case ReturnCode.NoSubscribe:
        return new ChannelError(
          'Method not found',
          ErrorCode.MethodNotFound
        )
        
      case ReturnCode.ReceiverCallbackError:
        return new ChannelError(
          response.msg || 'Handler error',
          ErrorCode.HandlerError
        )
        
      default:
        return new ChannelError(
          response.msg || 'Unknown error',
          ErrorCode.TransmissionFailed
        )
    }
  }
}
```
