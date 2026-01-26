# TypeScript 支持

postmessage-duplex 完全使用 TypeScript 编写，提供完整的类型定义和泛型支持。

## 基础类型

### 导入类型

```typescript
import {
  // 类
  IframeChannel,
  ServiceWorkerChannel,
  BaseChannel,
  ChannelError,
  
  // 枚举
  ReturnCode,
  ErrorCode,
  
  // 类型
  PostResponse,
  PostRequest,
  PostCallback,
  ChannelOption,
  PublishOptions,
  Communicator,
  Methods,
} from 'postmessage-duplex'
```

### PostResponse 类型

```typescript
interface PostResponse {
  requestId?: string    // 请求 ID
  ret: ReturnCode       // 返回码
  data?: any            // 响应数据
  msg?: string          // 错误信息
  time?: number         // 时间戳
}
```

### ReturnCode 枚举

```typescript
enum ReturnCode {
  Success = 0,               // 成功
  ReceiverCallbackError = -1, // 接收方回调错误
  SendCallbackError = -2,    // 发送方回调错误
  NoSubscribe = -3,          // 未订阅该事件
  TimeOut = -99              // 请求超时
}
```

## 泛型支持

### 定义远程方法接口

```typescript
// 定义远程端支持的方法
interface RemoteMethods {
  // 方法名: (参数类型) => 返回类型
  getUserInfo(params: { userId: number }): { name: string; age: number }
  updateUser(params: { userId: number; data: Partial<User> }): void
  listUsers(params: { page: number; size: number }): User[]
}

interface User {
  id: number
  name: string
  age: number
}
```

### 类型安全的 publish

```typescript
const channel = new IframeChannel<RemoteMethods>(iframe)

// 使用 call 方法获得完整类型推断
const response = await channel.call('getUserInfo', { userId: 123 })

// response.data 类型为 { name: string; age: number } | undefined
if (response.ret === ReturnCode.Success && response.data) {
  console.log(response.data.name) // 类型安全
}
```

### TypedPostResponse

```typescript
import { TypedPostResponse } from 'postmessage-duplex'

// 泛型响应类型
type UserResponse = TypedPostResponse<{ name: string; age: number }>

const response: UserResponse = await channel.call('getUserInfo', { userId: 1 })
```

## 类型定义详解

### ChannelOption

```typescript
interface ChannelOption {
  /** 请求超时时间（毫秒），默认 5000 */
  timeout?: number
  
  /** 自定义日志对象 */
  log?: Console
  
  /** 预定义订阅映射 */
  subscribeMap?: Record<string, PostCallback>
  
  /** 最大消息大小（字节），默认 1MB */
  maxMessageSize?: number
  
  /** 速率限制（每秒消息数），默认 100 */
  rateLimit?: number
}
```

### PublishOptions

```typescript
interface PublishOptions {
  /** 此次请求的超时时间，覆盖默认值 */
  timeout?: number
  
  /** 可传输对象数组 */
  transferables?: Transferable[]
}
```

### PostCallback

```typescript
type PostCallback = (response: PostResponse) => void | any | Promise<any>
```

## 高级类型用法

### 条件类型推断

```typescript
// 辅助类型
type MethodParams<T> = T extends (params: infer P) => any ? P : never
type MethodReturn<T> = T extends (...args: any[]) => infer R ? R : never

// 使用
type GetUserParams = MethodParams<RemoteMethods['getUserInfo']>
// { userId: number }

type GetUserReturn = MethodReturn<RemoteMethods['getUserInfo']>
// { name: string; age: number }
```

### 扩展 Communicator 接口

```typescript
// 自定义扩展
interface MyChannel extends Communicator<RemoteMethods> {
  customMethod(): void
}

class ExtendedChannel extends IframeChannel<RemoteMethods> implements MyChannel {
  customMethod() {
    // 自定义实现
  }
}
```

### 类型守卫

```typescript
import { ChannelError, ErrorCode } from 'postmessage-duplex'

function isChannelError(error: unknown): error is ChannelError {
  return error instanceof ChannelError
}

try {
  await channel.publish('test')
} catch (error) {
  if (isChannelError(error)) {
    switch (error.code) {
      case ErrorCode.ConnectionDestroyed:
        console.log('通道已销毁')
        break
      case ErrorCode.MethodCallTimeout:
        console.log('请求超时')
        break
    }
  }
}
```

## Vue + TypeScript 示例

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { 
  IframeChannel, 
  ReturnCode,
  type PostResponse 
} from 'postmessage-duplex'

interface ChildMethods {
  getData(params: { id: number }): { name: string }
  notify(params: { message: string }): void
}

const iframeRef = ref<HTMLIFrameElement>()
let channel: IframeChannel<ChildMethods>

const userData = ref<{ name: string } | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function fetchData() {
  if (!channel) return
  
  loading.value = true
  error.value = null
  
  try {
    const response = await channel.call('getData', { id: 1 })
    
    if (response.ret === ReturnCode.Success && response.data) {
      userData.value = response.data
    } else {
      error.value = response.msg || '请求失败'
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (iframeRef.value) {
    channel = new IframeChannel<ChildMethods>(iframeRef.value)
  }
})

onUnmounted(() => {
  channel?.destroy()
})
</script>

<template>
  <iframe ref="iframeRef" src="./child.html" />
  <button @click="fetchData" :disabled="loading">
    {{ loading ? '加载中...' : '获取数据' }}
  </button>
  <div v-if="error" class="error">{{ error }}</div>
  <div v-if="userData">{{ userData.name }}</div>
</template>
```

## React + TypeScript 示例

```tsx
import { useEffect, useRef, useState } from 'react'
import { 
  IframeChannel, 
  ReturnCode,
  type Communicator 
} from 'postmessage-duplex'

interface ChildMethods {
  getData(params: { id: number }): { name: string }
}

function ParentComponent() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const channelRef = useRef<IframeChannel<ChildMethods>>()
  
  const [data, setData] = useState<{ name: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (iframeRef.current) {
      channelRef.current = new IframeChannel<ChildMethods>(iframeRef.current)
    }
    
    return () => {
      channelRef.current?.destroy()
    }
  }, [])
  
  const fetchData = async () => {
    const channel = channelRef.current
    if (!channel) return
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await channel.call('getData', { id: 1 })
      
      if (response.ret === ReturnCode.Success && response.data) {
        setData(response.data)
      } else {
        setError(response.msg || 'Request failed')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <>
      <iframe ref={iframeRef} src="./child.html" />
      <button onClick={fetchData} disabled={loading}>
        {loading ? 'Loading...' : 'Fetch Data'}
      </button>
      {error && <div className="error">{error}</div>}
      {data && <div>{data.name}</div>}
    </>
  )
}
```

## 下一步

- [调试技巧](./debugging.md)
- [API 参考](/api/)
- [示例代码](/examples/)
