# 高级用法

## 类型安全的 RPC 封装

```typescript
// rpc-client.ts
import {
  IframeChannel,
  ReturnCode,
  ChannelError,
  ErrorCode,
  type Methods,
  type MethodParams,
  type MethodReturn
} from 'postmessage-duplex'

export class RPCClient<TMethods extends Methods> {
  private channel: IframeChannel<TMethods>
  
  constructor(iframe: HTMLIFrameElement, timeout = 5000) {
    this.channel = new IframeChannel<TMethods>(iframe, { timeout })
  }
  
  async call<K extends keyof TMethods>(
    method: K,
    params: MethodParams<TMethods[K]>
  ): Promise<MethodReturn<TMethods[K]>> {
    if (this.channel.isDestroyed) {
      throw new ChannelError(
        'Channel has been destroyed',
        ErrorCode.ConnectionDestroyed
      )
    }
    
    const response = await this.channel.call(method, params)
    
    if (response.ret !== ReturnCode.Success) {
      throw this.createError(response.ret, response.msg)
    }
    
    return response.data as MethodReturn<TMethods[K]>
  }
  
  private createError(code: ReturnCode, msg?: string): ChannelError {
    const errorMap: Record<number, ErrorCode> = {
      [-1]: ErrorCode.HandlerError,
      [-2]: ErrorCode.TransmissionFailed,
      [-3]: ErrorCode.MethodNotFound,
      [-99]: ErrorCode.MethodCallTimeout
    }
    
    return new ChannelError(
      msg || `Request failed with code ${code}`,
      errorMap[code] || ErrorCode.TransmissionFailed
    )
  }
  
  destroy() {
    this.channel.destroy()
  }
}

// 使用示例
interface UserAPI {
  getUser(params: { id: number }): { name: string; email: string }
  updateUser(params: { id: number; data: Partial<User> }): void
  deleteUser(params: { id: number }): boolean
}

interface User {
  name: string
  email: string
}

const client = new RPCClient<UserAPI>(iframe)

// 完全类型安全的调用
const user = await client.call('getUser', { id: 1 })
// user 类型: { name: string; email: string }
```

## 重试机制

```typescript
interface RetryOptions {
  maxRetries?: number
  retryDelay?: number
  shouldRetry?: (error: Error) => boolean
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    shouldRetry = () => true
  } = options
  
  let lastError: Error
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (attempt < maxRetries && shouldRetry(lastError)) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        console.log(`Retry attempt ${attempt + 1}/${maxRetries}`)
      }
    }
  }
  
  throw lastError!
}

// 使用
const data = await withRetry(
  () => channel.publish('getData', { id: 1 }),
  {
    maxRetries: 3,
    retryDelay: 1000,
    shouldRetry: (error) => {
      // 只重试超时错误
      return error instanceof ChannelError && 
             error.code === ErrorCode.MethodCallTimeout
    }
  }
)
```

## 请求队列

```typescript
class RequestQueue {
  private queue: Array<() => Promise<void>> = []
  private running = false
  private concurrency: number
  
  constructor(concurrency = 3) {
    this.concurrency = concurrency
  }
  
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      
      this.process()
    })
  }
  
  private async process() {
    if (this.running) return
    this.running = true
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.concurrency)
      await Promise.all(batch.map(fn => fn()))
    }
    
    this.running = false
  }
}

// 使用
const queue = new RequestQueue(3)

// 限制并发请求数
const results = await Promise.all(
  ids.map(id => 
    queue.add(() => channel.publish('getData', { id }))
  )
)
```

## 缓存层

```typescript
interface CacheOptions {
  ttl?: number // Time to live in milliseconds
}

class CachedChannel<TMethods extends Methods> {
  private channel: IframeChannel<TMethods>
  private cache = new Map<string, { data: any; expires: number }>()
  
  constructor(iframe: HTMLIFrameElement) {
    this.channel = new IframeChannel<TMethods>(iframe)
  }
  
  async call<K extends keyof TMethods>(
    method: K,
    params: MethodParams<TMethods[K]>,
    options: CacheOptions = {}
  ): Promise<MethodReturn<TMethods[K]>> {
    const cacheKey = this.getCacheKey(method, params)
    const cached = this.cache.get(cacheKey)
    
    // 检查缓存
    if (cached && cached.expires > Date.now()) {
      return cached.data
    }
    
    // 发起请求
    const response = await this.channel.call(method, params)
    
    if (response.ret === ReturnCode.Success && options.ttl) {
      this.cache.set(cacheKey, {
        data: response.data,
        expires: Date.now() + options.ttl
      })
    }
    
    return response.data as MethodReturn<TMethods[K]>
  }
  
  private getCacheKey(method: any, params: any): string {
    return `${String(method)}:${JSON.stringify(params)}`
  }
  
  invalidate(method?: string) {
    if (method) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${method}:`)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }
  
  destroy() {
    this.cache.clear()
    this.channel.destroy()
  }
}

// 使用
const cachedChannel = new CachedChannel<UserAPI>(iframe)

// 缓存 5 分钟
const user = await cachedChannel.call('getUser', { id: 1 }, { ttl: 300000 })
```

## Transferable 对象传输

```typescript
// 高效传输大数据
async function uploadLargeData(channel: IframeChannel, data: ArrayBuffer) {
  // 使用 Transferable 传输
  const response = await channel.publish('upload', { buffer: data }, {
    transferables: [data]
  })
  
  // 注意：传输后 data 会被清空（neutered）
  console.log(data.byteLength) // 0
  
  return response
}

// 传输图片数据
async function sendImage(channel: IframeChannel, imageUrl: string) {
  const response = await fetch(imageUrl)
  const blob = await response.blob()
  const buffer = await blob.arrayBuffer()
  
  return channel.publish('processImage', { 
    buffer,
    type: blob.type 
  }, {
    transferables: [buffer]
  })
}

// 传输 Canvas 数据
async function sendCanvasData(channel: IframeChannel, canvas: HTMLCanvasElement) {
  const imageData = canvas.getContext('2d')!.getImageData(
    0, 0, canvas.width, canvas.height
  )
  
  return channel.publish('processCanvas', {
    data: imageData.data.buffer,
    width: canvas.width,
    height: canvas.height
  }, {
    transferables: [imageData.data.buffer]
  })
}
```

## 消息批处理

```typescript
class BatchChannel<TMethods extends Methods> {
  private channel: IframeChannel<TMethods>
  private batchQueue: Array<{
    method: string
    params: any
    resolve: (value: any) => void
    reject: (error: any) => void
  }> = []
  private batchTimer: ReturnType<typeof setTimeout> | null = null
  private batchDelay: number
  
  constructor(iframe: HTMLIFrameElement, batchDelay = 50) {
    this.channel = new IframeChannel<TMethods>(iframe)
    this.batchDelay = batchDelay
  }
  
  async call<K extends keyof TMethods>(
    method: K,
    params: MethodParams<TMethods[K]>
  ): Promise<MethodReturn<TMethods[K]>> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        method: method as string,
        params,
        resolve,
        reject
      })
      
      this.scheduleBatch()
    })
  }
  
  private scheduleBatch() {
    if (this.batchTimer) return
    
    this.batchTimer = setTimeout(() => {
      this.executeBatch()
      this.batchTimer = null
    }, this.batchDelay)
  }
  
  private async executeBatch() {
    const batch = this.batchQueue.splice(0)
    if (batch.length === 0) return
    
    try {
      const response = await this.channel.publish('batch', {
        requests: batch.map(b => ({ method: b.method, params: b.params }))
      })
      
      if (response.ret === ReturnCode.Success) {
        const results = response.data as any[]
        batch.forEach((b, i) => b.resolve(results[i]))
      } else {
        batch.forEach(b => b.reject(new Error(response.msg)))
      }
    } catch (error) {
      batch.forEach(b => b.reject(error))
    }
  }
  
  destroy() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
    }
    this.channel.destroy()
  }
}
```

## 健康检查

```typescript
class ChannelHealthCheck {
  private channel: IframeChannel
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private lastPong: number = Date.now()
  private healthyThreshold: number
  
  onHealthChange?: (healthy: boolean) => void
  
  constructor(channel: IframeChannel, healthyThreshold = 10000) {
    this.channel = channel
    this.healthyThreshold = healthyThreshold
  }
  
  start(interval = 5000) {
    this.stop()
    
    // 远程端需要订阅 __ping__
    this.pingInterval = setInterval(() => this.ping(), interval)
    this.ping()
  }
  
  stop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }
  
  private async ping() {
    try {
      const response = await this.channel.publish('__ping__', {
        time: Date.now()
      }, { timeout: 2000 })
      
      if (response.ret === ReturnCode.Success) {
        this.lastPong = Date.now()
        this.onHealthChange?.(true)
      }
    } catch {
      if (Date.now() - this.lastPong > this.healthyThreshold) {
        this.onHealthChange?.(false)
      }
    }
  }
  
  isHealthy(): boolean {
    return Date.now() - this.lastPong < this.healthyThreshold
  }
}

// 使用
const healthCheck = new ChannelHealthCheck(channel)
healthCheck.onHealthChange = (healthy) => {
  console.log(healthy ? 'Channel is healthy' : 'Channel is unhealthy')
}
healthCheck.start(5000)
```

## 错误边界

```typescript
class ChannelErrorBoundary {
  private errorHandlers: Map<ErrorCode, (error: ChannelError) => void> = new Map()
  private defaultHandler?: (error: ChannelError) => void
  
  on(code: ErrorCode, handler: (error: ChannelError) => void) {
    this.errorHandlers.set(code, handler)
    return this
  }
  
  onDefault(handler: (error: ChannelError) => void) {
    this.defaultHandler = handler
    return this
  }
  
  handle(error: unknown): boolean {
    if (!(error instanceof ChannelError)) {
      return false
    }
    
    const handler = this.errorHandlers.get(error.code) || this.defaultHandler
    if (handler) {
      handler(error)
      return true
    }
    
    return false
  }
  
  async wrap<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn()
    } catch (error) {
      if (!this.handle(error)) {
        throw error
      }
      return null
    }
  }
}

// 使用
const errorBoundary = new ChannelErrorBoundary()
  .on(ErrorCode.ConnectionDestroyed, () => {
    reconnect()
  })
  .on(ErrorCode.MethodCallTimeout, (error) => {
    showToast('请求超时，请重试')
  })
  .onDefault((error) => {
    console.error('Channel error:', error)
    reportError(error)
  })

const result = await errorBoundary.wrap(() => 
  channel.publish('getData', { id: 1 })
)
```

## 下一步

- [API 参考](/api/)
- [FAQ](/faq/)
