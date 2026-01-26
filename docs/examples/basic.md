# 基础示例

## Iframe 通讯

### 父页面

```html
<!DOCTYPE html>
<html>
<head>
  <title>父页面</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    iframe { width: 100%; height: 200px; border: 1px solid #ccc; }
    .log { 
      background: #f5f5f5; 
      padding: 10px; 
      margin: 10px 0; 
      max-height: 200px; 
      overflow-y: auto; 
    }
    button { padding: 8px 16px; margin: 5px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="container">
    <h1>父页面</h1>
    
    <div>
      <button id="sendBtn">发送消息</button>
      <button id="timeoutBtn">测试超时</button>
      <button id="destroyBtn">销毁通道</button>
    </div>
    
    <h3>日志</h3>
    <div class="log" id="log"></div>
    
    <h3>子页面</h3>
    <iframe id="child" src="./child.html"></iframe>
  </div>

  <script type="module">
    import { IframeChannel, ReturnCode } from 'postmessage-duplex'
    
    const iframe = document.getElementById('child')
    const logEl = document.getElementById('log')
    
    function log(msg, type = 'info') {
      const time = new Date().toLocaleTimeString()
      const color = type === 'error' ? 'red' : type === 'success' ? 'green' : 'black'
      logEl.innerHTML += `<div style="color:${color}">[${time}] ${msg}</div>`
      logEl.scrollTop = logEl.scrollHeight
    }
    
    // 创建通道
    const channel = new IframeChannel(iframe, {
      timeout: 5000,
      subscribeMap: {
        'childReady': () => {
          log('收到子页面就绪通知', 'success')
          return { acknowledged: true }
        }
      }
    })
    
    // 监听子页面消息
    channel.subscribe('notification', ({ data }) => {
      log(`收到通知: ${JSON.stringify(data)}`)
      return { received: true }
    })
    
    // 发送消息
    document.getElementById('sendBtn').addEventListener('click', async () => {
      log('发送 getData 请求...')
      
      try {
        const response = await channel.publish('getData', { 
          id: Math.floor(Math.random() * 100) 
        })
        
        if (response.ret === ReturnCode.Success) {
          log(`响应数据: ${JSON.stringify(response.data)}`, 'success')
        } else {
          log(`请求失败: ${response.msg}`, 'error')
        }
      } catch (error) {
        log(`错误: ${error.message}`, 'error')
      }
    })
    
    // 测试超时
    document.getElementById('timeoutBtn').addEventListener('click', async () => {
      log('发送 slowOperation 请求（将超时）...')
      
      const response = await channel.publish('slowOperation', {}, {
        timeout: 2000
      })
      
      if (response.ret === ReturnCode.TimeOut) {
        log('请求超时', 'error')
      }
    })
    
    // 销毁通道
    document.getElementById('destroyBtn').addEventListener('click', () => {
      channel.destroy()
      log('通道已销毁', 'info')
    })
    
    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
      channel.destroy()
    })
  </script>
</body>
</html>
```

### 子页面

```html
<!DOCTYPE html>
<html>
<head>
  <title>子页面</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; background: #f9f9f9; }
    .log { 
      background: white; 
      padding: 10px; 
      margin: 10px 0; 
      max-height: 150px; 
      overflow-y: auto; 
      border: 1px solid #ddd;
    }
    button { padding: 8px 16px; margin: 5px; cursor: pointer; }
  </style>
</head>
<body>
  <h2>子页面</h2>
  
  <button id="sendBtn">发送通知给父页面</button>
  
  <h3>日志</h3>
  <div class="log" id="log"></div>

  <script type="module">
    import { IframeChannel, ReturnCode } from 'postmessage-duplex'
    
    const logEl = document.getElementById('log')
    
    function log(msg, type = 'info') {
      const time = new Date().toLocaleTimeString()
      const color = type === 'error' ? 'red' : type === 'success' ? 'green' : 'black'
      logEl.innerHTML += `<div style="color:${color}">[${time}] ${msg}</div>`
      logEl.scrollTop = logEl.scrollHeight
    }
    
    // 创建通道 - 传入父页面 origin
    const channel = new IframeChannel(window.location.origin)
    
    log('通道已创建')
    
    // 订阅消息
    channel.subscribe('getData', ({ data }) => {
      log(`收到 getData 请求: ${JSON.stringify(data)}`)
      
      // 模拟处理
      return {
        id: data.id,
        name: `Item ${data.id}`,
        timestamp: Date.now()
      }
    })
    
    // 模拟慢操作（不返回，导致超时）
    channel.subscribe('slowOperation', async () => {
      log('收到 slowOperation 请求，将不响应...')
      // 故意不返回，触发超时
      await new Promise(() => {})
    })
    
    // 发送就绪通知
    channel.publish('childReady', { time: Date.now() }).then(response => {
      if (response.ret === ReturnCode.Success) {
        log('父页面已确认就绪', 'success')
      }
    })
    
    // 发送通知
    document.getElementById('sendBtn').addEventListener('click', async () => {
      log('发送通知...')
      
      const response = await channel.publish('notification', {
        type: 'click',
        message: 'Hello from child!',
        time: Date.now()
      })
      
      if (response.ret === ReturnCode.Success) {
        log(`父页面响应: ${JSON.stringify(response.data)}`, 'success')
      }
    })
  </script>
</body>
</html>
```

## Service Worker 通讯

### 页面

```html
<!DOCTYPE html>
<html>
<head>
  <title>Service Worker 示例</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    .log { 
      background: #f5f5f5; 
      padding: 10px; 
      margin: 10px 0; 
      max-height: 300px; 
      overflow-y: auto; 
    }
    button { padding: 8px 16px; margin: 5px; cursor: pointer; }
    .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
    .status.ready { background: #e6ffe6; }
    .status.error { background: #ffe6e6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Service Worker 通讯示例</h1>
    
    <div class="status" id="status">初始化中...</div>
    
    <div>
      <button id="fetchBtn" disabled>获取数据</button>
      <button id="cacheBtn" disabled>缓存数据</button>
      <button id="clearBtn" disabled>清除缓存</button>
    </div>
    
    <h3>日志</h3>
    <div class="log" id="log"></div>
  </div>

  <script type="module">
    import { ServiceWorkerChannel, ReturnCode } from 'postmessage-duplex'
    
    const statusEl = document.getElementById('status')
    const logEl = document.getElementById('log')
    const fetchBtn = document.getElementById('fetchBtn')
    const cacheBtn = document.getElementById('cacheBtn')
    const clearBtn = document.getElementById('clearBtn')
    
    let channel = null
    
    function log(msg, type = 'info') {
      const time = new Date().toLocaleTimeString()
      const color = type === 'error' ? 'red' : type === 'success' ? 'green' : 'black'
      logEl.innerHTML += `<div style="color:${color}">[${time}] ${msg}</div>`
      logEl.scrollTop = logEl.scrollHeight
    }
    
    function setStatus(text, ready = false) {
      statusEl.textContent = text
      statusEl.className = 'status ' + (ready ? 'ready' : 'error')
    }
    
    async function init() {
      if (!('serviceWorker' in navigator)) {
        setStatus('浏览器不支持 Service Worker', false)
        log('浏览器不支持 Service Worker', 'error')
        return
      }
      
      try {
        log('注册 Service Worker...')
        await navigator.serviceWorker.register('./sw.js')
        
        log('创建通道...')
        channel = await ServiceWorkerChannel.createFromPage({
          timeout: 10000
        })
        
        // 监听推送
        channel.subscribe('notification', ({ data }) => {
          log(`收到推送: ${JSON.stringify(data)}`)
          return { displayed: true }
        })
        
        setStatus('Service Worker 已就绪', true)
        log('初始化完成', 'success')
        
        // 启用按钮
        fetchBtn.disabled = false
        cacheBtn.disabled = false
        clearBtn.disabled = false
        
      } catch (error) {
        setStatus('初始化失败: ' + error.message, false)
        log('初始化失败: ' + error.message, 'error')
      }
    }
    
    fetchBtn.addEventListener('click', async () => {
      log('请求数据...')
      
      const response = await channel.publish('fetchData', {
        url: 'https://jsonplaceholder.typicode.com/todos/1'
      })
      
      if (response.ret === ReturnCode.Success) {
        log(`数据: ${JSON.stringify(response.data)}`, 'success')
      } else {
        log(`失败: ${response.msg}`, 'error')
      }
    })
    
    cacheBtn.addEventListener('click', async () => {
      log('缓存数据...')
      
      const response = await channel.publish('cacheData', {
        key: 'test-data',
        data: { value: Math.random(), time: Date.now() }
      })
      
      if (response.ret === ReturnCode.Success) {
        log('缓存成功', 'success')
      } else {
        log(`失败: ${response.msg}`, 'error')
      }
    })
    
    clearBtn.addEventListener('click', async () => {
      log('清除缓存...')
      
      const response = await channel.publish('clearCache', {})
      
      if (response.ret === ReturnCode.Success) {
        log('缓存已清除', 'success')
      } else {
        log(`失败: ${response.msg}`, 'error')
      }
    })
    
    init()
  </script>
</body>
</html>
```

### Service Worker

```javascript
// sw.js
const CACHE_NAME = 'demo-cache-v1'

// 简化的消息处理
self.addEventListener('message', async (event) => {
  const { cmdname, data, requestId } = event.data
  const client = event.source
  
  let response = { requestId, ret: 0 }
  
  try {
    switch (cmdname) {
      case 'fetchData':
        const fetchResult = await fetch(data.url)
        response.data = await fetchResult.json()
        break
        
      case 'cacheData':
        const cache = await caches.open(CACHE_NAME)
        await cache.put(data.key, new Response(JSON.stringify(data.data)))
        response.data = { cached: true }
        break
        
      case 'clearCache':
        await caches.delete(CACHE_NAME)
        response.data = { cleared: true }
        break
        
      default:
        response.ret = -3 // NoSubscribe
        response.msg = `Unknown command: ${cmdname}`
    }
  } catch (error) {
    response.ret = -1
    response.msg = error.message
  }
  
  client.postMessage(response)
})

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
```

## 下一步

- [Vue 集成](./vue.md)
- [React 集成](./react.md)
- [高级用法](./advanced.md)
