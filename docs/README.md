---
home: true
heroImage: /logo.svg
heroText: postmessage-duplex
tagline: 轻量级、类型安全的 postMessage 双工通讯库
actions:
  - text: 快速开始 →
    link: /guide/getting-started.html
    type: primary
  - text: 🎮 在线体验
    link: /playground/
    type: secondary
features:
  - title: 🔄 双工通讯
    details: 完整的双向消息传递，支持请求-响应模式，自动处理消息路由
  - title: 🎯 类型安全
    details: 完全使用 TypeScript 编写，提供完整的类型定义和泛型支持
  - title: 📦 轻量零依赖
    details: gzip 压缩后约 8KB，零运行时依赖
  - title: ⏱️ 内置超时
    details: 自动处理请求超时，支持自定义超时时间
  - title: 🔌 多场景支持
    details: 统一的 API 支持 iframe 和 Service Worker 通讯
  - title: 🔍 调试友好
    details: 内置消息追踪功能，支持自定义日志
footer: MIT Licensed | Copyright © 2026- liquidliang
---

## 为什么选择 postmessage-duplex？

| 特性 | 原生 postMessage | postmessage-duplex |
|------|------------------|---------------------|
| 请求-响应模式 | ❌ 需要手动实现 | ✅ 内置支持 |
| Promise 支持 | ❌ 回调模式 | ✅ async/await |
| 超时处理 | ❌ 需要手动实现 | ✅ 自动超时 |
| 消息队列 | ❌ 需要手动实现 | ✅ 自动队列 |
| 类型安全 | ❌ any 类型 | ✅ 完整类型定义 |
| Service Worker | ❌ API 不同 | ✅ 统一接口 |

## 快速体验

```bash
npm install postmessage-duplex
```

```typescript
import { IframeChannel } from 'postmessage-duplex'

// 父页面
const channel = new IframeChannel(iframe)
const response = await channel.publish('getData', { id: 1 })
console.log(response.data)

// 子页面
const channel = new IframeChannel('https://parent.com')
channel.subscribe('getData', ({ data }) => {
  return { name: 'test', id: data.id }
})
```

<div style="text-align: center; margin-top: 2rem;">
  <a href="/postmessage-duplex/guide/getting-started.html" style="display: inline-block; padding: 0.8rem 1.6rem; background: #3eaf7c; color: white; border-radius: 4px; text-decoration: none; margin-right: 1rem;">开始使用</a>
  <a href="https://github.com/ljquan/postmessage-duplex" style="display: inline-block; padding: 0.8rem 1.6rem; background: #333; color: white; border-radius: 4px; text-decoration: none;">GitHub</a>
</div>
