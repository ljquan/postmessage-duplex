---
name: PostMessage Library Enhancement
overview: 基于对 Comlink、Penpal、post-robot 等同类开源库的研究，从 API 设计、功能特性、TypeScript 支持、测试覆盖等方面全面优化 postmessage-duplex 项目。
todos:
  - id: add-once-method
    content: 添加 once() 一次性订阅方法到 Communicator 接口和 BaseChannel
    status: pending
  - id: add-publish-options
    content: 添加 PublishOptions 支持单次调用超时和 Transferable
    status: pending
  - id: add-channel-error
    content: 创建 ChannelError 类和 ErrorCode 枚举
    status: pending
  - id: fix-destroy-promises
    content: 修改 destroy() 方法，拒绝所有待处理的 Promise
    status: pending
  - id: add-lifecycle-tests
    content: 添加连接生命周期测试（超时、重复destroy、destroy后publish）
    status: pending
  - id: add-concurrent-tests
    content: 添加并发请求测试（多请求路由、混合消息）
    status: pending
  - id: add-security-tests
    content: 添加安全验证测试（origin、source、peerKey）
    status: pending
  - id: add-once-tests
    content: 添加 once() 方法测试
    status: pending
  - id: add-typescript-generics
    content: 为 Communicator 接口添加 TypeScript 泛型支持
    status: pending
  - id: add-connection-timeout
    content: 添加 connectionTimeout 配置选项
    status: pending
isProject: false
---

# PostMessage-Duplex 优化计划 - 对标业界最佳实践

## 同类库对比分析

| 特性 | Comlink (Google) | Penpal | post-robot (PayPal) | postmessage-duplex (当前) |

|------|------------------|--------|---------------------|--------------------------|

| 包大小 | 1.1KB | ~5KB | ~15KB | ~3KB |

| TypeScript 泛型 | 有 | 有 | 无 | 无 |

| 一次性监听 (once) | 无 | 无 | 有 | 无 |

| 可传输对象 | 有 | 有 | 无 | 无 |

| 单次调用超时 | 无 | 有 | 有 | 无 |

| 连接超时 | 无 | 有 | 无 | 无 |

| 错误码常量 | 无 | 有 | 无 | 有 |

| 函数序列化 | 有(proxy) | 无 | 有 | 无 |

| 资源清理钩子 | 有(finalizer) | 有(destroy) | 无 | 有(destroy) |

| 并行通道 | 无 | 有(channel) | 无 | 有(peerKey) |

| 调试日志导出 | 无 | 有(debug) | 无 | 内置 |

---

## 一、API 增强

### 1.1 添加 `once()` 一次性订阅方法

参考 post-robot 的 `once()` API，实现一次性监听器。

**修改 [src/interface.ts](src/interface.ts)**：

```typescript
export interface Communicator {
  // 现有方法...
  
  /**
   * 订阅一次性消息，收到后自动取消订阅
   */
  once(cmdname: string, callback: PostCallback): Communicator
}
```

**修改 [src/base-channel.ts](src/base-channel.ts)**：

```typescript
once(cmdname: string, callback: PostCallback): Communicator {
  const wrappedCallback: PostCallback = async (data) => {
    this.unSubscribe(cmdname)
    return callback(data)
  }
  return this.subscribe(cmdname, wrappedCallback)
}
```

### 1.2 添加单次调用超时支持

参考 Penpal 的 `CallOptions`，支持单次调用自定义超时。

```typescript
// 新增类型
export interface PublishOptions {
  timeout?: number        // 覆盖默认超时
  transferables?: Transferable[]  // 可传输对象
}

// 修改 publish 签名
publish(cmdname: string, data?: Record<string, any>, options?: PublishOptions): Promise<PostResponse>
```

### 1.3 添加 Transferable 对象支持

参考 Comlink 和 Penpal，支持高效传输大数据。

```typescript
// 发送时
channel.publish('sendBuffer', { buffer: arrayBuffer }, {
  transferables: [arrayBuffer]
})

// 响应时
export class Reply<T> {
  constructor(public data: T, public options?: { transferables?: Transferable[] })
}
```

---

## 二、TypeScript 增强

### 2.1 泛型支持

参考 Penpal，为 `publish` 和 `subscribe` 添加泛型。

```typescript
// 定义远程方法接口
interface RemoteMethods {
  getData(id: number): { name: string; value: number }
  setData(data: { name: string }): void
}

// 创建带类型的通道
const channel = new IframeChannel<RemoteMethods>(iframe)

// 自动类型推断
const result = await channel.publish('getData', { id: 1 })
// result.data 类型为 { name: string; value: number }
```

**修改 [src/interface.ts](src/interface.ts)**：

```typescript
export interface Communicator<TMethods extends Methods = Methods> {
  publish<K extends keyof TMethods>(
    cmdname: K,
    data?: Parameters<TMethods[K]>[0],
    options?: PublishOptions
  ): Promise<PostResponse<ReturnType<TMethods[K]>>>
}

export type Methods = Record<string, (...args: any[]) => any>
```

---

## 三、新增功能

### 3.1 连接超时

参考 Penpal，区分连接超时和方法调用超时。

```typescript
export interface ChannelOption {
  timeout?: number           // 方法调用超时 (现有)
  connectionTimeout?: number // 连接超时 (新增)
}
```

### 3.2 onReady 事件

添加连接就绪回调，比轮询 `isReady` 更优雅。

```typescript
export interface ChannelOption {
  onReady?: () => void
  onError?: (error: Error) => void
  onDestroy?: () => void
}
```

### 3.3 重连机制

参考业界实践，支持断线重连。

```typescript
export interface ChannelOption {
  autoReconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
}
```

### 3.4 调试函数导出

参考 Penpal 的 `debug` 函数。

```typescript
// src/debug.ts
export function createDebugger(prefix: string): (...args: any[]) => void {
  return (...args) => console.log(`[${prefix}]`, ...args)
}

// 使用
import { createDebugger } from 'postmessage-duplex'
const channel = new IframeChannel(iframe, {
  log: { log: createDebugger('parent'), warn: console.warn, error: console.error }
})
```

---

## 四、测试覆盖增强

### 4.1 当前缺失的测试场景

基于 Penpal 和 post-robot 的测试用例，需要补充：

| 场景 | 当前状态 | 优先级 |

|------|----------|--------|

| 连接建立超时 | 未覆盖 | P0 |

| 方法调用超时 | 部分覆盖 | P1 |

| 并发请求正确路由 | 未覆盖 | P0 |

| destroy 期间待处理请求 | 未覆盖 | P1 |

| 消息顺序保证 | 未覆盖 | P2 |

| 大数据传输 | 未覆盖 | P1 |

| Transferable 对象 | 未覆盖 | P2 |

| 错误堆栈保留 | 未覆盖 | P2 |

| 内存泄漏 | 未覆盖 | P1 |

| 跨域安全验证 | 部分覆盖 | P0 |

### 4.2 新增测试用例

**文件 [test/index.test.ts](test/index.test.ts)** 新增：

```typescript
describe('连接生命周期', () => {
  it('连接超时应该抛出错误')
  it('重复 destroy 不应报错')
  it('destroy 后 publish 应该抛出错误')
  it('destroy 应该拒绝所有待处理的 Promise')
})

describe('并发请求', () => {
  it('多个并发请求应该正确路由到各自的回调')
  it('混合请求和响应不应干扰')
  it('请求顺序应该保持')
})

describe('错误处理', () => {
  it('远程错误应该保留错误信息')
  it('序列化错误应该被捕获')
  it('处理器抛出的错误应该包含堆栈')
})

describe('安全验证', () => {
  it('应该拒绝来自非预期 origin 的消息')
  it('应该验证 source 匹配')
  it('应该验证 peerKey 配对')
})

describe('once 一次性订阅', () => {
  it('once 回调只应执行一次')
  it('once 执行后应自动取消订阅')
})

describe('Transferable 支持', () => {
  it('ArrayBuffer 应该被正确传输')
  it('传输后原 buffer 应该被 detach')
})
```

---

## 五、代码质量优化

### 5.1 Promise 拒绝改进

参考 Penpal，在 destroy 时正确拒绝待处理的 Promise。

```typescript
destroy(): void {
  // 拒绝所有待处理的请求
  for (const [requestId, callback] of this.callbackMap) {
    callback.reject(new PenpalError('Channel destroyed', ErrorCode.ConnectionDestroyed))
  }
  // ...现有清理逻辑
}
```

### 5.2 错误类型增强

参考 Penpal 的 `PenpalError`：

```typescript
// src/errors.ts
export class ChannelError extends Error {
  constructor(message: string, public code: ErrorCode) {
    super(message)
    this.name = 'ChannelError'
  }
}

export enum ErrorCode {
  ConnectionDestroyed = 'CONNECTION_DESTROYED',
  ConnectionTimeout = 'CONNECTION_TIMEOUT',
  MethodCallTimeout = 'METHOD_CALL_TIMEOUT',
  MethodNotFound = 'METHOD_NOT_FOUND',
  TransmissionFailed = 'TRANSMISSION_FAILED'
}
```

---

## 六、实施优先级

### P0 - 必须实现

1. `once()` 一次性订阅方法
2. 单次调用超时 `PublishOptions.timeout`
3. 补充并发请求测试
4. 补充连接生命周期测试
5. destroy 时拒绝待处理 Promise

### P1 - 高优先级

1. 连接超时 `connectionTimeout`
2. TypeScript 泛型支持
3. Transferable 对象支持
4. 错误类 `ChannelError`
5. 内存泄漏测试

### P2 - 低优先级

1. onReady/onError/onDestroy 事件
2. 自动重连机制
3. 调试函数导出
4. 错误堆栈保留测试
5. 消息顺序保证测试

---

## 预期成果

- 测试用例从 95 个增加到 ~130 个
- 分支覆盖率从 68% 提升到 85%+
- API 更接近业界标准 (Penpal/Comlink)
- TypeScript 开发体验大幅提升