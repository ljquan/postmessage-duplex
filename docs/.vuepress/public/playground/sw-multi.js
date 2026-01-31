/**
 * Service Worker 多页面通讯演示 - 使用 Hub API
 * 
 * 这个 Service Worker 使用 postmessage-duplex 库的 Hub API，
 * 只需几行代码即可实现完整的多客户端管理和广播功能。
 */

importScripts('./postmessage-duplex.umd.js')
const { ServiceWorkerChannel, ReturnCode } = PostMessageChannel

// ========== 初始化 Hub ==========
// setupHub() 自动处理：
// - SW 生命周期事件（install/activate）
// - 客户端注册和元数据管理
// - 定期清理断开的客户端
// - SW 更新时通知客户端重连

ServiceWorkerChannel.setupHub({
  version: '2.0.0',
  onClientConnect: (clientId, meta) => {
    console.log('[SW] Client connected:', meta.appName || clientId.slice(0, 8), meta.appType || '')
  },
  onClientDisconnect: (clientId) => {
    console.log('[SW] Client disconnected:', clientId.slice(0, 8))
  },
  cleanupInterval: 30000
})

// ========== 业务处理器 ==========

// Ping/Pong
ServiceWorkerChannel.subscribeGlobal('ping', ({ clientId }) => {
  return {
    pong: true,
    timestamp: Date.now(),
    from: 'ServiceWorker',
    clientId: clientId,
    activeClients: ServiceWorkerChannel.getChannelCount()
  }
})

// Echo
ServiceWorkerChannel.subscribeGlobal('echo', ({ data, clientMeta }) => {
  return {
    original: data.message,
    echoed: `[SW回复] ${data.message}`,
    from: clientMeta?.appName || 'unknown',
    processedAt: new Date().toISOString()
  }
})

// 获取购物车数据
ServiceWorkerChannel.subscribeGlobal('getCart', async ({ data }) => {
  await sleep(100)
  return {
    userId: data.userId,
    items: [
      { id: 1, name: 'iPhone 15 Pro', price: 8999, quantity: 1 },
      { id: 2, name: 'AirPods Pro', price: 1899, quantity: 2 },
      { id: 3, name: 'MagSafe 充电器', price: 399, quantity: 1 }
    ],
    total: 13196,
    updatedAt: new Date().toISOString()
  }
})

// 获取用户信息
ServiceWorkerChannel.subscribeGlobal('getUserInfo', async ({ data }) => {
  await sleep(100)
  return {
    userId: data.userId,
    name: '张三',
    email: 'zhangsan@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + data.userId,
    vipLevel: 'Gold',
    points: 12580,
    registeredAt: '2023-01-15'
  }
})

// 获取所有连接的客户端
ServiceWorkerChannel.subscribeGlobal('getClients', ({ clientId }) => {
  const allClients = ServiceWorkerChannel.getAllClients()
  const clients = []
  for (const [id, meta] of allClients) {
    clients.push({
      clientId: id,
      ...meta,
      isCurrentClient: id === clientId
    })
  }
  return { clients, total: clients.length }
})

// ========== 广播功能 ==========

// 全局广播（页面请求 SW 执行广播）
ServiceWorkerChannel.subscribeGlobal('broadcastToAll', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToAll('globalBroadcast', {
    message: data.message,
    from: data.from
  }, clientId)  // 排除发送者
  
  return {
    success: true,
    clientCount: count
  }
})

// 按类型广播
ServiceWorkerChannel.subscribeGlobal('broadcastToType', async ({ data, clientId }) => {
  const count = await ServiceWorkerChannel.broadcastToType(
    data.targetType,
    data.eventName || 'typedNotification',
    {
      title: data.title,
      body: data.body,
      from: data.from,
      targetType: data.targetType
    },
    clientId  // 排除发送者
  )
  
  return {
    success: true,
    sentCount: count,
    targetType: data.targetType
  }
})

// 更新购物车并广播通知
ServiceWorkerChannel.subscribeGlobal('updateCartAndNotify', async ({ data, clientId, clientMeta }) => {
  const cartData = {
    itemCount: data.items?.length || 0,
    total: data.total || 0,
    updatedAt: new Date().toISOString(),
    updatedBy: clientMeta?.appName || 'unknown'
  }
  
  // 向所有 user 类型的应用广播购物车更新
  const count = await ServiceWorkerChannel.broadcastToType('user', 'cartUpdated', cartData, clientId)
  
  return { success: true, cart: cartData, notifiedCount: count }
})

// ========== 工具函数 ==========

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
