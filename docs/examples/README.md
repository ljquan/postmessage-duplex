# 示例

本节提供各种使用场景的完整代码示例。

::: tip 推荐
想要快速体验？试试 [🎮 在线 Playground](./playground/) - 无需安装，直接在浏览器中体验！
:::

## 示例列表

| 示例 | 描述 |
|------|------|
| [基础示例](./basic.md) | iframe 和 Service Worker 的基本使用 |
| [Vue 集成](./vue.md) | Vue 2/3 组件中的使用 |
| [React 集成](./react.md) | React 组件和 Hooks |
| [高级用法](./advanced.md) | 错误处理、类型安全、性能优化 |

## 在线演示

启动本地开发服务器查看演示：

```bash
# 克隆仓库
git clone https://github.com/ljquan/postmessage-duplex.git
cd postmessage-duplex

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问演示页面
open http://localhost:7100/demo/
```

## 演示页面

### Iframe 演示

- **基础通讯**: `/demo/iframe/index.html`
  - 父子页面双向通讯
  - 请求-响应模式演示
  - 超时处理演示

### Service Worker 演示

- **SW 通讯**: `/demo/service-worker/index.html`
  - 页面与 SW 双向通讯
  - 数据缓存演示

### 调试器

- **消息调试**: `/demo/debugger/index.html`
  - 实时查看消息
  - 手动发送测试消息
  - 通道状态监控

## 快速代码片段

### 最简 Iframe 通讯

```typescript
// 父页面
const channel = new IframeChannel(document.querySelector('iframe'))
const { data } = await channel.publish('getData', { id: 1 })

// 子页面
const channel = new IframeChannel(location.origin)
channel.subscribe('getData', ({ data }) => ({ result: data.id * 2 }))
```

### 最简 Service Worker 通讯

```typescript
// 页面
const channel = await ServiceWorkerChannel.createFromPage()
await channel.publish('cache', { url: '/api/data' })

// sw.js
self.addEventListener('message', (e) => {
  const channel = ServiceWorkerChannel.createFromEvent(e)
  channel.subscribe('cache', async ({ data }) => {
    await caches.open('v1').then(c => c.add(data.url))
    return { cached: true }
  })
})
```

### 类型安全调用

```typescript
interface Methods {
  getUser(p: { id: number }): { name: string }
}

const channel = new IframeChannel<Methods>(iframe)
const response = await channel.call('getUser', { id: 1 })
// response.data 类型: { name: string } | undefined
```

## 项目模板

### 创建新项目

```bash
# 使用 Vite 创建项目
npm create vite@latest my-app -- --template vanilla-ts

cd my-app
npm install postmessage-duplex
```

### 基础项目结构

```
my-app/
├── index.html          # 父页面
├── child.html          # 子页面 (iframe)
├── src/
│   ├── main.ts         # 父页面入口
│   ├── child.ts        # 子页面入口
│   └── channel.ts      # 通道封装
└── package.json
```

### channel.ts 封装示例

```typescript
// src/channel.ts
import { IframeChannel, ReturnCode, type PostResponse } from 'postmessage-duplex'

interface RemoteMethods {
  getData(params: { id: number }): { name: string }
  setData(params: { data: object }): void
}

export class ChannelClient {
  private channel: IframeChannel<RemoteMethods>
  
  constructor(iframe: HTMLIFrameElement) {
    this.channel = new IframeChannel(iframe)
  }
  
  async getData(id: number) {
    const response = await this.channel.call('getData', { id })
    this.checkResponse(response)
    return response.data!
  }
  
  async setData(data: object) {
    const response = await this.channel.call('setData', { data })
    this.checkResponse(response)
  }
  
  private checkResponse(response: PostResponse) {
    if (response.ret !== ReturnCode.Success) {
      throw new Error(response.msg || 'Request failed')
    }
  }
  
  destroy() {
    this.channel.destroy()
  }
}
```
