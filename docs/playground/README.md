# 在线演示

在这里您可以直观地体验 postmessage-duplex 的功能，无需安装任何依赖。

## 交互式 Playground

<div style="margin: 20px 0;">
  <a href="/postmessage-duplex/playground/parent.html" target="_blank" style="display: inline-block; padding: 12px 24px; background: #3eaf7c; color: white; border-radius: 6px; text-decoration: none; font-weight: 500;">
    🚀 打开 Playground
  </a>
</div>

在 Playground 中，您可以：

- ✅ **发送消息** - 从父页面向子页面发送消息
- ✅ **请求数据** - 体验请求-响应模式
- ✅ **测试超时** - 观察超时处理机制
- ✅ **查看日志** - 实时查看通讯过程
- ✅ **双向通讯** - 子页面也可以向父页面发送消息

## 快速体验

### 场景 1：简单消息传递

**父页面发送消息：**

```typescript
// 创建通道
const channel = new IframeChannel(iframe)

// 发送消息并等待响应
const response = await channel.publish('greeting', { 
  message: 'Hello!' 
})

console.log(response.data)
// { reply: 'Hello from child!', originalMessage: 'Hello!' }
```

**子页面接收并响应：**

```typescript
// 创建通道
const channel = new IframeChannel(parentOrigin)

// 监听消息
channel.subscribe('greeting', ({ data }) => {
  console.log('收到:', data.message)
  
  // 返回响应
  return { 
    reply: 'Hello from child!',
    originalMessage: data.message 
  }
})
```

### 场景 2：请求数据

**父页面请求数据：**

```typescript
// 请求用户信息
const response = await channel.publish('getUserInfo', { 
  userId: 123 
})

if (response.ret === ReturnCode.Success) {
  console.log('用户信息:', response.data)
  // { id: 123, name: 'John', email: 'john@example.com' }
}
```

**子页面处理请求：**

```typescript
channel.subscribe('getUserInfo', async ({ data }) => {
  // 从数据库获取用户
  const user = await fetchUser(data.userId)
  
  // 返回用户信息
  return user
})
```

### 场景 3：双向通讯

```typescript
// 父页面监听子页面通知
channel.subscribe('notification', ({ data }) => {
  showToast(data.message)
  return { received: true }
})

// 子页面主动发送通知
channel.publish('notification', { 
  type: 'success',
  message: '操作完成！' 
})
```

## 在本地运行 Demo

```bash
# 克隆仓库
git clone https://github.com/ljquan/postmessage-duplex.git
cd postmessage-duplex

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 Demo
open http://localhost:7100/demo/
```

## Demo 目录结构

```
demo/
├── iframe/              # iframe 通讯示例
│   ├── index.html       # 父页面
│   └── child.html       # 子页面
├── service-worker/      # Service Worker 示例
│   ├── index.html       # 主页面
│   └── sw.js            # Service Worker
└── debugger/            # 调试工具
    ├── index.html       # 调试器主页
    └── child.html       # 被调试页面
```

## 代码示例

### 完整的父页面代码

```html
<!DOCTYPE html>
<html>
<head>
  <title>父页面</title>
</head>
<body>
  <iframe id="child" src="./child.html"></iframe>
  <button id="sendBtn">发送消息</button>
  
  <script type="module">
    import { IframeChannel, ReturnCode } from 'postmessage-duplex'
    
    const iframe = document.getElementById('child')
    const channel = new IframeChannel(iframe)
    
    // 监听子页面消息
    channel.subscribe('notification', ({ data }) => {
      console.log('收到通知:', data)
      return { acknowledged: true }
    })
    
    // 发送消息
    document.getElementById('sendBtn').onclick = async () => {
      const response = await channel.publish('getData', { id: 1 })
      
      if (response.ret === ReturnCode.Success) {
        console.log('数据:', response.data)
      } else {
        console.error('错误:', response.msg)
      }
    }
    
    // 清理
    window.onbeforeunload = () => channel.destroy()
  </script>
</body>
</html>
```

### 完整的子页面代码

```html
<!DOCTYPE html>
<html>
<head>
  <title>子页面</title>
</head>
<body>
  <button id="notifyBtn">通知父页面</button>
  
  <script type="module">
    import { IframeChannel } from 'postmessage-duplex'
    
    // 传入父页面 origin
    const channel = new IframeChannel(window.location.origin)
    
    // 处理数据请求
    channel.subscribe('getData', ({ data }) => {
      return {
        id: data.id,
        name: 'Item ' + data.id,
        price: 99.99
      }
    })
    
    // 发送通知
    document.getElementById('notifyBtn').onclick = async () => {
      await channel.publish('notification', {
        type: 'info',
        message: 'Hello from child!'
      })
    }
  </script>
</body>
</html>
```

## 下一步

- [快速开始](/guide/getting-started.md) - 详细的入门指南
- [API 文档](/api/) - 完整的 API 参考
- [Vue/React 集成](/examples/vue.md) - 框架集成示例
