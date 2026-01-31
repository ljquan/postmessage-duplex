import { 
  IframeChannel, 
  ServiceWorkerChannel, 
  ReturnCode,
  BaseChannel
} from '../src/index'
import {
  mockConsole,
  resetMockConsole,
  setupIframeDOM,
  setupReferrer,
  getFirstValue,
  mapToArray,
  PostTask,
  createMessageEvent,
  createResponseMessage,
  createRequestMessage,
  createReadyMessage,
  createBroadcastMessage
} from './helpers'

/**
 * IframeChannel 测试
 */
describe('IframeChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetMockConsole()
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('构造函数', () => {
    it('父页面模式：传入 iframe 元素', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      expect(channel).toBeInstanceOf(IframeChannel)
      expect(channel.isSon).toBe(false)
      expect(channel.getTargetOrigin()).toBe('http://localhost')
      expect(channel.getTargetUrl()).toBe('http://localhost/')
      
      channel.destroy()
    })

    it('子页面模式：传入父页面 URL', () => {
      const channel = new IframeChannel('http://localhost/', { log: mockConsole })
      
      expect(channel).toBeInstanceOf(IframeChannel)
      expect(channel.isSon).toBe(true)
      
      channel.destroy()
    })

    it('子页面模式：origin 不匹配时抛出错误', () => {
      setupReferrer('http://other-domain.com/')

      expect(() => {
        new IframeChannel('http://localhost/')
      }).toThrow()
    })

    it('应该生成唯一的 baseKey', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel1 = new IframeChannel(iframe, { log: mockConsole })
      const channel2 = new IframeChannel(iframe, { log: mockConsole })
      
      expect((channel1 as any).baseKey).not.toBe((channel2 as any).baseKey)
      
      channel1.destroy()
      channel2.destroy()
    })

    it('baseKey 应该包含正确的前缀', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const parentChannel = new IframeChannel(iframe, { log: mockConsole })
      const childChannel = new IframeChannel('http://localhost/', { log: mockConsole })
      
      expect((parentChannel as any).baseKey).toContain('parent_')
      expect((childChannel as any).baseKey).toContain('son_')
      
      parentChannel.destroy()
      childChannel.destroy()
    })
  })

  describe('配置选项', () => {
    it('应该使用自定义超时时间', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        timeout: 10000,
        log: mockConsole 
      })
      
      expect((channel as any).timeout).toBe(10000)
      
      channel.destroy()
    })

    it('应该使用默认超时时间 5000ms', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      expect((channel as any).timeout).toBe(5000)
      
      channel.destroy()
    })

    it('应该使用自定义日志', () => {
      const customLog = { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: customLog })
      
      expect(customLog.log).toHaveBeenCalled()
      
      channel.destroy()
    })

    it('应该使用预定义的订阅', () => {
      const pingHandler = jest.fn(() => ({ pong: true }))
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        subscribeMap: {
          'ping': pingHandler
        }
      })
      
      expect((channel as any).subscribeMap.get('ping')).toBe(pingHandler)
      
      channel.destroy()
    })
  })

  describe('subscribe / unSubscribe', () => {
    it('应该能够订阅事件', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      const callback = jest.fn()
      
      const result = channel.subscribe('test', callback)
      
      expect(result).toBe(channel) // 链式调用
      expect((channel as any).subscribeMap.get('test')).toBe(callback)
      
      channel.destroy()
    })

    it('应该能够取消订阅', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      const callback = jest.fn()
      
      channel.subscribe('test', callback)
      const result = channel.unSubscribe('test')
      
      expect(result).toBe(channel) // 链式调用
      expect((channel as any).subscribeMap.has('test')).toBe(false)
      
      channel.destroy()
    })

    it('重复订阅应该发出警告', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      channel.subscribe('test', jest.fn())
      channel.subscribe('test', jest.fn())
      
      expect(mockConsole.warn).toHaveBeenCalled()
      
      channel.destroy()
    })

    it('取消未订阅的事件不应报错', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      expect(() => {
        channel.unSubscribe('nonexistent')
      }).not.toThrow()
      
      channel.destroy()
    })

    it('应该支持多个订阅', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      channel.subscribe('event1', jest.fn())
      channel.subscribe('event2', jest.fn())
      channel.subscribe('event3', jest.fn())
      
      expect((channel as any).subscribeMap.size).toBe(3)
      
      channel.destroy()
    })
  })

  describe('publish', () => {
    it('应该返回 Promise', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      const result = channel.publish('test', { data: 'value' })
      
      expect(result).toBeInstanceOf(Promise)
      
      // 捕获 destroy 引起的拒绝
      result.catch(() => {})
      channel.destroy()
    })

    it('isReady 为 false 时应该将消息加入队列', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      expect(channel.isReady).toBe(false)
      
      // 捕获 destroy 引起的拒绝
      channel.publish('test1', { data: 1 }).catch(() => {})
      channel.publish('test2', { data: 2 }).catch(() => {})
      
      expect((channel as any).postTasks.size).toBe(2)
      
      channel.destroy()
    })

    it('每次 publish 应该增加 requestId', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      // 捕获 destroy 引起的拒绝
      channel.publish('test1').catch(() => {})
      channel.publish('test2').catch(() => {})
      
      const tasks = mapToArray<PostTask>((channel as any).postTasks)
      expect(tasks[0].data.requestId).not.toBe(tasks[1].data.requestId)
      
      channel.destroy()
    })

    it('publish 数据应该包含正确的结构', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      // 捕获 destroy 引起的拒绝
      channel.publish('testCmd', { key: 'value' }).catch(() => {})
      
      const task = getFirstValue<PostTask>((channel as any).postTasks)!
      expect(task.data.cmdname).toBe('testCmd')
      expect(task.data.data).toEqual({ key: 'value' })
      expect(task.data.requestId).toBeDefined()
      
      channel.destroy()
    })

    it('publish 不传 data 也应该正常工作', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      // 捕获 destroy 引起的拒绝
      const promise = channel.publish('testCmd')
      promise.catch(() => {})
      
      expect(promise).toBeInstanceOf(Promise)
      
      channel.destroy()
    })
  })

  describe('destroy', () => {
    it('应该清理所有资源', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      channel.subscribe('test', jest.fn())
      // 捕获 destroy 引起的拒绝
      channel.publish('test').catch(() => {})
      
      channel.destroy()
      
      expect(channel.isReady).toBe(false)
      expect((channel as any).subscribeMap.size).toBe(0)
      expect((channel as any).postTasks.size).toBe(0)
      expect((channel as any).callbackMap.size).toBe(0)
    })

    it('销毁后不应该报错', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      channel.destroy()
      
      expect(() => {
        channel.destroy() // 重复销毁
      }).not.toThrow()
    })
  })

  describe('isReady 状态', () => {
    it('初始状态应该为 false', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      expect(channel.isReady).toBe(false)
      
      channel.destroy()
    })
  })

  describe('超时处理', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('请求超时应该返回 TimeOut 状态', async () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        timeout: 1000,
        log: mockConsole 
      })
      
      // 设置 ready 以便消息立即发送
      channel.isReady = true
      
      const promise = channel.publish('test')
      
      // 快进超时时间
      jest.advanceTimersByTime(1001)
      
      const response = await promise
      expect(response.ret).toBe(ReturnCode.TimeOut)
      expect(response.msg).toBe('timeout')
      
      channel.destroy()
    })
  })
})

/**
 * ServiceWorkerChannel 测试
 */
describe('ServiceWorkerChannel', () => {
  let originalSelf: any
  let mockSelf: any
  let mockAddEventListener: jest.Mock
  let mockRemoveEventListener: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    // 保存原始的 self
    originalSelf = (globalThis as any).self
    
    // 创建 mock 函数
    mockAddEventListener = jest.fn()
    mockRemoveEventListener = jest.fn()
    
    // 创建 mockSelf 对象
    mockSelf = {
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      clients: {
        get: jest.fn().mockResolvedValue(null)
      }
    }
    
    // 设置 globalThis.self（Jest 29 需要这样设置）
    Object.defineProperty(globalThis, 'self', {
      value: mockSelf,
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    // 恢复原始的 self
    Object.defineProperty(globalThis, 'self', {
      value: originalSelf,
      writable: true,
      configurable: true
    })
  })

  describe('构造函数', () => {
    it('页面端：没有有效 ServiceWorker 时抛出错误', () => {
      // 恢复原始 self（jsdom 环境）
      Object.defineProperty(globalThis, 'self', {
        value: originalSelf,
        writable: true,
        configurable: true
      })
      
      expect(() => {
        new ServiceWorkerChannel(null)
      }).toThrow('页面端必须传入有效的 ServiceWorker 实例')
    })

    it('页面端：传入字符串时抛出错误', () => {
      // 恢复原始 self（jsdom 环境）
      Object.defineProperty(globalThis, 'self', {
        value: originalSelf,
        writable: true,
        configurable: true
      })
      
      expect(() => {
        new ServiceWorkerChannel('not-a-service-worker' as any)
      }).toThrow('页面端必须传入有效的 ServiceWorker 实例')
    })

    it('Worker 端：没有 clientId 时抛出错误', () => {
      expect(() => {
        new ServiceWorkerChannel(null as any, { isWorkerSide: true })
      }).toThrow('Service Worker 端必须传入 clientId 字符串')
    })

    it('Worker 端：传入数字时抛出错误', () => {
      expect(() => {
        new ServiceWorkerChannel(123 as any, { isWorkerSide: true })
      }).toThrow('Service Worker 端必须传入 clientId 字符串')
    })

    it('Worker 端：传入有效 clientId 时成功创建', () => {
      const channel = ServiceWorkerChannel.createFromWorker('test-client-id', { 
        log: mockConsole 
      })
      
      expect(channel).toBeInstanceOf(ServiceWorkerChannel)
      expect(channel.getClientId()).toBe('test-client-id')
      
      channel.destroy()
    })
  })

  describe('静态方法', () => {
    it('createFromWorker 应该创建 Worker 端通道', () => {
      const channel = ServiceWorkerChannel.createFromWorker('client-123', {
        log: mockConsole
      })
      
      expect(channel).toBeInstanceOf(ServiceWorkerChannel)
      expect(channel.getClientId()).toBe('client-123')
      
      channel.destroy()
    })

    it('createFromWorker 应该传递选项', () => {
      const channel = ServiceWorkerChannel.createFromWorker('client-123', {
        timeout: 10000,
        log: mockConsole
      })
      
      expect((channel as any).timeout).toBe(10000)
      
      channel.destroy()
    })

    it('createFromEvent 应该从事件创建通道', () => {
      const mockEvent = {
        source: { id: 'event-client-id' }
      } as any

      const channel = ServiceWorkerChannel.createFromEvent(mockEvent, {
        log: mockConsole
      })
      
      expect(channel.getClientId()).toBe('event-client-id')
      
      channel.destroy()
    })

    it('createFromEvent 无效事件时抛出错误', () => {
      const mockEvent = { source: null } as any

      expect(() => {
        ServiceWorkerChannel.createFromEvent(mockEvent)
      }).toThrow('Invalid message event: no client source')
    })

    it('createFromEvent source 没有 id 时抛出错误', () => {
      const mockEvent = { source: {} } as any

      expect(() => {
        ServiceWorkerChannel.createFromEvent(mockEvent)
      }).toThrow('Invalid message event: no client source')
    })
  })

  describe('isWorkerAvailable', () => {
    it('Worker 端应该返回 true', () => {
      const channel = ServiceWorkerChannel.createFromWorker('client-id', {
        log: mockConsole
      })
      
      expect(channel.isWorkerAvailable()).toBe(true)
      
      channel.destroy()
    })
  })

  describe('消息监听', () => {
    it('全局路由模式下应该使用全局监听器', () => {
      // 默认启用全局路由，所以会设置全局监听器
      const channel = ServiceWorkerChannel.createFromWorker('client-id', {
        log: mockConsole
      })
      
      // 全局路由启用时，会在首次创建 channel 时添加全局监听器
      // 注意：全局监听器由 ServiceWorkerChannel 静态方法管理
      expect(ServiceWorkerChannel.hasChannel('client-id')).toBe(true)
      
      channel.destroy()
    })

    it('禁用全局路由时应该添加独立监听器', () => {
      // 禁用全局路由
      ServiceWorkerChannel.disableGlobalRouting()
      
      const channel = ServiceWorkerChannel.createFromWorker('client-id-2', {
        log: mockConsole
      })
      
      expect(mockAddEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      )
      
      channel.destroy()
      
      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      )
      
      // 恢复全局路由
      ServiceWorkerChannel.enableGlobalRouting()
    })
  })

  describe('baseKey', () => {
    it('Worker 端 baseKey 应该包含 sw_ 前缀', () => {
      const channel = ServiceWorkerChannel.createFromWorker('client-id', {
        log: mockConsole
      })
      
      expect((channel as any).baseKey).toContain('sw_')
      
      channel.destroy()
    })
  })
})

/**
 * ReturnCode 测试
 */
describe('ReturnCode', () => {
  it('Success 应该等于 0', () => {
    expect(ReturnCode.Success).toBe(0)
  })

  it('ReceiverCallbackError 应该等于 -1', () => {
    expect(ReturnCode.ReceiverCallbackError).toBe(-1)
  })

  it('SendCallbackError 应该等于 -2', () => {
    expect(ReturnCode.SendCallbackError).toBe(-2)
  })

  it('NoSubscribe 应该等于 -3', () => {
    expect(ReturnCode.NoSubscribe).toBe(-3)
  })

  it('TimeOut 应该等于 -99', () => {
    expect(ReturnCode.TimeOut).toBe(-99)
  })

  it('所有返回码应该是不同的值', () => {
    const codes = [
      ReturnCode.Success,
      ReturnCode.ReceiverCallbackError,
      ReturnCode.SendCallbackError,
      ReturnCode.NoSubscribe,
      ReturnCode.TimeOut
    ]
    const uniqueCodes = new Set(codes)
    expect(uniqueCodes.size).toBe(codes.length)
  })
})

/**
 * BaseChannel 测试
 */
describe('BaseChannel', () => {
  it('应该导出 BaseChannel', () => {
    expect(BaseChannel).toBeDefined()
  })

  it('BaseChannel 应该是抽象类（不能直接实例化）', () => {
    // TypeScript 已经在编译时阻止了这一点
    // 这里只是确认 BaseChannel 被正确导出
    expect(typeof BaseChannel).toBe('function')
  })
})

/**
 * 集成测试
 */
describe('集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  it('多个通道应该独立工作', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    
    const channel1 = new IframeChannel(iframe, { log: mockConsole })
    const channel2 = new IframeChannel(iframe, { log: mockConsole })
    
    const callback1 = jest.fn()
    const callback2 = jest.fn()
    
    channel1.subscribe('event1', callback1)
    channel2.subscribe('event2', callback2)
    
    expect((channel1 as any).subscribeMap.get('event1')).toBe(callback1)
    expect((channel2 as any).subscribeMap.get('event2')).toBe(callback2)
    
    // 独立销毁
    channel1.destroy()
    
    expect((channel1 as any).subscribeMap.size).toBe(0)
    expect((channel2 as any).subscribeMap.get('event2')).toBe(callback2)
    
    channel2.destroy()
  })

  it('链式调用应该正常工作', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const result = channel
      .subscribe('event1', jest.fn())
      .subscribe('event2', jest.fn())
      .unSubscribe('event1')
    
    expect(result).toBe(channel)
    expect((channel as any).subscribeMap.has('event1')).toBe(false)
    expect((channel as any).subscribeMap.has('event2')).toBe(true)
    
    channel.destroy()
  })

  it('父页面和子页面通道应该有不同的 isSon 值', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    
    const parentChannel = new IframeChannel(iframe, { log: mockConsole })
    const childChannel = new IframeChannel('http://localhost/', { log: mockConsole })
    
    expect(parentChannel.isSon).toBe(false)
    expect(childChannel.isSon).toBe(true)
    
    parentChannel.destroy()
    childChannel.destroy()
  })
})

/**
 * 模块导出测试
 */
describe('模块导出', () => {
  it('应该导出所有必要的类型和类', () => {
    const exports = require('../src/index')
    
    expect(exports.IframeChannel).toBeDefined()
    expect(exports.ServiceWorkerChannel).toBeDefined()
    expect(exports.BaseChannel).toBeDefined()
    expect(exports.ReturnCode).toBeDefined()
  })
})

/**
 * 边界情况测试
 */
describe('边界情况', () => {
  beforeEach(() => {
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  it('publish 空字符串 cmdname 应该正常工作', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 捕获 destroy 引起的拒绝
    const promise = channel.publish('')
    promise.catch(() => {})
    
    expect(promise).toBeInstanceOf(Promise)
    
    channel.destroy()
  })

  it('subscribe 空字符串 cmdname 应该正常工作', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    expect(() => {
      channel.subscribe('', jest.fn())
    }).not.toThrow()
    
    channel.destroy()
  })

  it('publish 大数据量应该正常工作', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const largeData = {
      array: new Array(1000).fill({ key: 'value' }),
      nested: { deep: { data: new Array(100).fill('test') } }
    }
    
    // 捕获 destroy 引起的拒绝
    const promise = channel.publish('test', largeData)
    promise.catch(() => {})
    
    expect(promise).toBeInstanceOf(Promise)
    
    channel.destroy()
  })

  it('快速连续 publish 应该正常工作', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    for (let i = 0; i < 100; i++) {
      // 捕获 destroy 引起的拒绝
      channel.publish(`event-${i}`, { index: i }).catch(() => {})
    }
    
    expect((channel as any).postTasks.size).toBe(100)
    
    channel.destroy()
  })
})

/**
 * 点对点通信测试
 */
describe('点对点通信', () => {
  beforeEach(() => {
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  it('ready 消息应该包含 _senderKey', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // baseKey 应该被设置
    expect((channel as any).baseKey).toBeDefined()
    expect((channel as any).baseKey).toContain('parent_')
    
    channel.destroy()
  })

  it('初始状态下 peerKey 应该为空', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    expect((channel as any).peerKey).toBe('')
    
    channel.destroy()
  })

  it('destroy 应该清除 peerKey', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 模拟设置 peerKey
    ;(channel as any).peerKey = 'test_peer_key'
    
    channel.destroy()
    
    expect((channel as any).peerKey).toBe('')
  })

  it('getPeerKey 应该返回 peerKey', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    expect(channel.getPeerKey()).toBe('')
    
    // 模拟设置 peerKey
    ;(channel as any).peerKey = 'test_peer_key'
    
    expect(channel.getPeerKey()).toBe('test_peer_key')
    
    channel.destroy()
  })

  it('isFromPeer 应该在 peerKey 未设置时返回 true', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // peerKey 未设置，应该允许所有消息
    const result = (channel as any).isFromPeer({ requestId: 'any', cmdname: 'test' })
    expect(result).toBe(true)
    
    channel.destroy()
  })

  it('isFromPeer 应该拒绝来自非配对通道的消息', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 设置 peerKey
    ;(channel as any).peerKey = 'expected_peer_'
    
    // 消息来自不同的发送方
    const result = (channel as any).isFromPeer({ 
      requestId: 'other_key_1', 
      cmdname: 'test',
      _senderKey: 'different_peer_'
    })
    expect(result).toBe(false)
    
    channel.destroy()
  })

  it('isFromPeer 应该接受来自配对通道的消息', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 设置 peerKey
    ;(channel as any).peerKey = 'expected_peer_'
    
    // 消息来自配对的发送方
    const result = (channel as any).isFromPeer({ 
      requestId: 'expected_peer_1', 
      cmdname: 'test',
      _senderKey: 'expected_peer_'
    })
    expect(result).toBe(true)
    
    channel.destroy()
  })

  it('响应消息应该验证 requestId 前缀', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 设置 peerKey
    ;(channel as any).peerKey = 'son_peer_'
    
    // 这是一个响应消息，但 requestId 不是我们发出的
    const result = (channel as any).isFromPeer({ 
      requestId: 'other_channel_1', 
      ret: 0,
      _senderKey: 'son_peer_'
    })
    // 应该被拒绝，因为 requestId 不以本通道的 baseKey 开头
    expect(result).toBe(false)
    
    channel.destroy()
  })

  it('响应消息应该接受匹配 baseKey 的 requestId', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const baseKey = (channel as any).baseKey
    
    // 设置 peerKey
    ;(channel as any).peerKey = 'son_peer_'
    
    // 这是一个响应消息，requestId 是我们发出的
    const result = (channel as any).isFromPeer({ 
      requestId: baseKey + '1', 
      ret: 0,
      _senderKey: 'son_peer_'
    })
    expect(result).toBe(true)
    
    channel.destroy()
  })
})

/**
 * onMessage 处理器测试
 */
describe('onMessage 处理器', () => {
  beforeEach(() => {
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  it('应该忽略来自错误 origin 的消息', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 模拟来自错误 origin 的消息
    const event = new MessageEvent('message', {
      data: { requestId: 'test_1', cmdname: 'test' },
      origin: 'http://other-domain.com'
    })
    
    // 应该不处理消息
    await (channel as any).onMessage(event)
    
    channel.destroy()
  })

  it('应该忽略空 data 的消息', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: null,
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    channel.destroy()
  })

  it('应该处理响应消息并调用回调', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const baseKey = (channel as any).baseKey
    const requestId = baseKey + '1'
    
    // 手动添加回调
    const mockResolve = jest.fn()
    const mockReject = jest.fn()
    ;(channel as any).callbackMap.set(requestId, { 
      resolve: mockResolve, 
      reject: mockReject 
    })
    
    // 模拟响应消息
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId, 
        ret: 0, 
        data: { result: 'success' },
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    expect(mockResolve).toHaveBeenCalled()
    expect((channel as any).callbackMap.has(requestId)).toBe(false)
    
    channel.destroy()
  })

  it('应该处理订阅的命令并返回成功响应', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const mockHandler = jest.fn().mockResolvedValue({ result: 'test' })
    channel.subscribe('testCmd', mockHandler)
    
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId: 'peer_1', 
        cmdname: 'testCmd',
        data: { input: 'value' },
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    expect(mockHandler).toHaveBeenCalled()
    
    channel.destroy()
  })

  it('应该处理订阅处理器抛出的错误', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const mockHandler = jest.fn().mockRejectedValue(new Error('Handler error'))
    channel.subscribe('errorCmd', mockHandler)
    
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId: 'peer_1', 
        cmdname: 'errorCmd',
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    expect(mockHandler).toHaveBeenCalled()
    
    channel.destroy()
  })

  it('应该处理 ready 消息并建立配对', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    expect(channel.isReady).toBe(false)
    
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId: 'peer_0', 
        msg: 'ready',
        _senderKey: 'peer_key_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    expect(channel.isReady).toBe(true)
    expect((channel as any).peerKey).toBe('peer_key_')
    
    channel.destroy()
  })

  it('应该对未订阅的命令返回 NoSubscribe', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId: 'peer_1', 
        cmdname: 'unknownCmd',
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    // 应该记录警告
    expect(mockConsole.warn).toHaveBeenCalled()
    
    channel.destroy()
  })
})

/**
 * ServiceWorkerChannel 页面端测试
 */
describe('ServiceWorkerChannel 页面端', () => {
  let mockServiceWorker: any
  let mockServiceWorkerContainer: any

  beforeEach(() => {
    mockServiceWorker = {
      postMessage: jest.fn(),
      state: 'activated'
    }
    
    mockServiceWorkerContainer = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      controller: mockServiceWorker,
      ready: Promise.resolve({ active: mockServiceWorker })
    }
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorkerContainer,
      writable: true,
      configurable: true
    })
  })

  it('页面端应该发送消息到 ServiceWorker', () => {
    const channel = new ServiceWorkerChannel(mockServiceWorker, { log: mockConsole })
    
    // 消息会被发送到 worker，捕获 destroy 引起的拒绝
    channel.publish('testCmd', { data: 'test' }).catch(() => {})
    
    // 验证 postMessage 被调用
    expect(mockServiceWorker.postMessage).toHaveBeenCalled()
    
    channel.destroy()
  })

  it('isWorkerAvailable 应该检查 worker 状态', () => {
    const channel = new ServiceWorkerChannel(mockServiceWorker, { log: mockConsole })
    
    expect(channel.isWorkerAvailable()).toBe(true)
    
    // 修改 worker 状态
    mockServiceWorker.state = 'installing'
    expect(channel.isWorkerAvailable()).toBe(false)
    
    channel.destroy()
  })

  it('页面端 isValidSource 应该返回 true', () => {
    const channel = new ServiceWorkerChannel(mockServiceWorker, { log: mockConsole })
    
    const event = new MessageEvent('message', { data: {} })
    const result = (channel as any).isValidSource(event)
    
    expect(result).toBe(true)
    
    channel.destroy()
  })

  it('sendRawMessage 应该处理序列化错误', () => {
    const channel = new ServiceWorkerChannel(mockServiceWorker, { log: mockConsole })
    
    // 创建一个无法序列化的对象（循环引用）
    const circularData: any = { a: 1 }
    circularData.self = circularData
    
    // 应该捕获错误而不是抛出
    expect(() => {
      ;(channel as any).sendRawMessage(circularData)
    }).not.toThrow()
    
    expect(mockConsole.error).toHaveBeenCalled()
    
    channel.destroy()
  })
})

/**
 * 版本信息测试
 */
describe('版本信息', () => {
  it('__POSTMESSAGE_DUPLEX__ 应该存在于全局作用域', () => {
    expect(typeof (window as any).__POSTMESSAGE_DUPLEX__).toBe('object')
    expect((window as any).__POSTMESSAGE_DUPLEX__.version).toBeDefined()
    expect((window as any).__POSTMESSAGE_DUPLEX__.name).toBeDefined()
  })
})

/**
 * 消息队列执行测试
 */
describe('消息队列', () => {
  beforeEach(() => {
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  it('ready 后应该执行队列中的消息', async () => {
    jest.useFakeTimers()
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 在 ready 之前发送消息，捕获可能的拒绝
    channel.publish('cmd1', { a: 1 }).catch(() => {})
    channel.publish('cmd2', { b: 2 }).catch(() => {})
    
    expect((channel as any).postTasks.size).toBe(2)
    
    // 模拟收到 ready 消息
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId: 'peer_0', 
        msg: 'ready',
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    expect(channel.isReady).toBe(true)
    
    // 清除所有 timers 避免超时问题
    jest.clearAllTimers()
    jest.useRealTimers()
    channel.destroy()
  })
})

/**
 * 超时处理测试
 */
describe('超时处理', () => {
  beforeEach(() => {
    setupIframeDOM()
    setupReferrer('http://localhost/')
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('超时后回调应该被清理', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { 
      log: mockConsole,
      timeout: 1000
    })
    
    // 设置 ready 状态
    ;(channel as any).isReady = true
    
    const promise = channel.publish('timeoutTest', { data: 'test' })
    
    // 等待超时
    jest.advanceTimersByTime(1001)
    
    const result = await promise
    
    expect(result.ret).toBe(ReturnCode.TimeOut)
    expect((channel as any).callbackMap.size).toBe(0)
    
    channel.destroy()
  })
})

/**
 * 安全特性测试
 */
describe('安全特性', () => {
  beforeEach(() => {
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  describe('消息大小限制', () => {
    it('应该有默认的消息大小限制', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      expect((channel as any).maxMessageSize).toBe(1024 * 1024) // 1MB
      
      channel.destroy()
    })

    it('应该可以配置消息大小限制', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        maxMessageSize: 1024 // 1KB
      })
      
      expect((channel as any).maxMessageSize).toBe(1024)
      
      channel.destroy()
    })

    it('超过大小限制时 validateMessageSize 应该抛出错误', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      // 使用足够大的限制来创建通道
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        maxMessageSize: 10000
      })
      
      // 然后修改限制为较小值
      ;(channel as any).maxMessageSize = 100
      
      const largeData = { data: 'a'.repeat(200) }
      
      expect(() => {
        ;(channel as any).validateMessageSize(largeData)
      }).toThrow('exceeds limit')
      
      channel.destroy()
    })

    it('在限制内时 validateMessageSize 不应抛出错误', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        maxMessageSize: 1000
      })
      
      const smallData = { data: 'test' }
      
      expect(() => {
        ;(channel as any).validateMessageSize(smallData)
      }).not.toThrow()
      
      channel.destroy()
    })

    it('maxMessageSize 为 0 时应禁用限制', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        maxMessageSize: 0
      })
      
      const largeData = { data: 'a'.repeat(10000) }
      
      expect(() => {
        ;(channel as any).validateMessageSize(largeData)
      }).not.toThrow()
      
      channel.destroy()
    })
  })

  describe('速率限制', () => {
    it('应该有默认的速率限制', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { log: mockConsole })
      
      expect((channel as any).rateLimiter.getLimit()).toBe(100)
      
      channel.destroy()
    })

    it('应该可以配置速率限制', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        rateLimit: 50
      })
      
      expect((channel as any).rateLimiter.getLimit()).toBe(50)
      
      channel.destroy()
    })

    it('checkRateLimit 应该在限制内返回 true', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        rateLimit: 10
      })
      
      // 发送几条消息
      for (let i = 0; i < 5; i++) {
        expect((channel as any).checkRateLimit()).toBe(true)
      }
      
      channel.destroy()
    })

    it('checkRateLimit 在超过限制时应返回 false', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        rateLimit: 10 // 设置为 10，因为 init 会发送 ready 消息
      })
      
      // 重置 rateLimiter 以清除 init 时的消息
      ;(channel as any).rateLimiter.reset()
      
      // 填满限制 (10 条消息)
      for (let i = 0; i < 10; i++) {
        expect((channel as any).checkRateLimit()).toBe(true)
      }
      
      // 下一条应该被限制
      expect((channel as any).checkRateLimit()).toBe(false)
      
      channel.destroy()
    })

    it('rateLimit 为 0 时应禁用限制', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        rateLimit: 0
      })
      
      // 应该始终返回 true
      for (let i = 0; i < 100; i++) {
        expect((channel as any).checkRateLimit()).toBe(true)
      }
      
      channel.destroy()
    })

    it('destroy 应该清除速率限制计数器', () => {
      const iframe = document.querySelector('#iframe') as HTMLIFrameElement
      const channel = new IframeChannel(iframe, { 
        log: mockConsole,
        rateLimit: 5
      })
      
      // 添加一些消息时间戳
      ;(channel as any).checkRateLimit()
      ;(channel as any).checkRateLimit()
      
      channel.destroy()
      
      // 销毁后，rateLimiter 应该被重置
      expect((channel as any).rateLimiter.getCurrentCount()).toBe(0)
    })
  })

  describe('唯一 ID 生成', () => {
    it('generateUniqueId 应该生成唯一的 ID', async () => {
      const { generateUniqueId } = await import('../src/base-channel')
      
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateUniqueId('test_'))
      }
      
      expect(ids.size).toBe(100)
    })

    it('generateUniqueId 应该包含指定的前缀', async () => {
      const { generateUniqueId } = await import('../src/base-channel')
      
      const id = generateUniqueId('custom_prefix_')
      expect(id.startsWith('custom_prefix_')).toBe(true)
    })
  })
})

/**
 * subscribeOnce() 一次性订阅测试
 */
describe('subscribeOnce() 一次性订阅', () => {
  beforeEach(() => {
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  it('subscribeOnce 回调只应执行一次', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const callback = jest.fn().mockResolvedValue({ success: true })
    channel.subscribeOnce('testOnce', callback)
    
    // 模拟两次接收消息
    const contentWindow = iframe.contentWindow!
    const event1 = new MessageEvent('message', {
      data: { 
        requestId: 'peer_1', 
        cmdname: 'testOnce',
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    const event2 = new MessageEvent('message', {
      data: { 
        requestId: 'peer_2', 
        cmdname: 'testOnce',
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event1)
    await (channel as any).onMessage(event2)
    
    // 回调只应被调用一次
    expect(callback).toHaveBeenCalledTimes(1)
    
    channel.destroy()
  })

  it('subscribeOnce 执行后应自动取消订阅', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const callback = jest.fn().mockResolvedValue({})
    channel.subscribeOnce('autoUnsub', callback)
    
    expect((channel as any).subscribeMap.has('autoUnsub')).toBe(true)
    
    // 触发一次
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId: 'peer_1', 
        cmdname: 'autoUnsub',
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    // 订阅应已被移除
    expect((channel as any).subscribeMap.has('autoUnsub')).toBe(false)
    
    channel.destroy()
  })

  it('subscribeOnce 应该支持链式调用', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const result = channel
      .subscribeOnce('event1', jest.fn())
      .subscribeOnce('event2', jest.fn())
    
    expect(result).toBe(channel)
    
    channel.destroy()
  })

  it('subscribeOnce 回调抛出错误后仍应取消订阅', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const callback = jest.fn().mockRejectedValue(new Error('Test error'))
    channel.subscribeOnce('errorOnce', callback)
    
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId: 'peer_1', 
        cmdname: 'errorOnce',
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    
    await (channel as any).onMessage(event)
    
    // 即使回调抛错，订阅也应被移除
    expect((channel as any).subscribeMap.has('errorOnce')).toBe(false)
    
    channel.destroy()
  })
})

/**
 * 连接生命周期增强测试
 */
describe('连接生命周期增强', () => {
  beforeEach(() => {
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  it('重复 destroy 不应报错', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    expect(() => {
      channel.destroy()
      channel.destroy()
      channel.destroy()
    }).not.toThrow()
  })

  it('destroy 后 publish 应该返回被拒绝的 Promise', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    channel.destroy()
    
    await expect(channel.publish('test')).rejects.toMatchObject({
      code: 'CONNECTION_DESTROYED'
    })
  })

  it('destroy 应该拒绝所有待处理的 Promise', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 在 ready 之前发送消息（会被加入队列）
    const promise1 = channel.publish('cmd1').catch(err => err)
    const promise2 = channel.publish('cmd2').catch(err => err)
    
    // 销毁通道
    channel.destroy()
    
    // 所有待处理的 Promise 应该被拒绝，并返回错误对象
    const result1 = await promise1
    const result2 = await promise2
    
    expect(result1).toMatchObject({
      ret: expect.any(Number)
    })
    expect(result2).toMatchObject({
      ret: expect.any(Number)
    })
  })

  it('isDestroyed 应该在 destroy 后为 true', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    expect((channel as any).isDestroyed).toBe(false)
    
    channel.destroy()
    
    expect((channel as any).isDestroyed).toBe(true)
  })

  it('destroy 后 subscribe 应该仍然可以调用但不会生效', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    channel.destroy()
    
    // destroy 后 subscribe 不应抛错
    expect(() => {
      channel.subscribe('test', jest.fn())
    }).not.toThrow()
  })
})

/**
 * 并发请求测试
 */
describe('并发请求', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('多个并发请求应该正确路由到各自的回调', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 设置 ready 状态
    channel.isReady = true
    
    const baseKey = (channel as any).baseKey
    
    // 发送多个并发请求
    const promise1 = channel.publish('cmd1', { id: 1 })
    const promise2 = channel.publish('cmd2', { id: 2 })
    const promise3 = channel.publish('cmd3', { id: 3 })
    
    // 模拟乱序响应
    const contentWindow = iframe.contentWindow!
    
    // 先响应第二个请求
    const event2 = new MessageEvent('message', {
      data: { 
        requestId: baseKey + '2',
        ret: 0,
        data: { result: 'response2' },
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    await (channel as any).onMessage(event2)
    
    // 再响应第一个请求
    const event1 = new MessageEvent('message', {
      data: { 
        requestId: baseKey + '1',
        ret: 0,
        data: { result: 'response1' },
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    await (channel as any).onMessage(event1)
    
    // 最后响应第三个请求
    const event3 = new MessageEvent('message', {
      data: { 
        requestId: baseKey + '3',
        ret: 0,
        data: { result: 'response3' },
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    await (channel as any).onMessage(event3)
    
    // 验证每个 Promise 收到正确的响应
    const result1 = await promise1
    const result2 = await promise2
    const result3 = await promise3
    
    expect(result1.data).toEqual({ result: 'response1' })
    expect(result2.data).toEqual({ result: 'response2' })
    expect(result3.data).toEqual({ result: 'response3' })
    
    channel.destroy()
  })

  it('混合请求和响应不应干扰', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    channel.isReady = true
    
    // 设置订阅
    const handler = jest.fn().mockResolvedValue({ handled: true })
    channel.subscribe('incoming', handler)
    
    const baseKey = (channel as any).baseKey
    
    // 发送请求
    const promise = channel.publish('outgoing', { data: 'test' })
    
    // 模拟收到一条请求（不是响应）
    const contentWindow = iframe.contentWindow!
    const incomingEvent = new MessageEvent('message', {
      data: { 
        requestId: 'peer_1',
        cmdname: 'incoming',
        data: { from: 'peer' },
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    await (channel as any).onMessage(incomingEvent)
    
    // 模拟收到我们请求的响应
    const responseEvent = new MessageEvent('message', {
      data: { 
        requestId: baseKey + '1',
        ret: 0,
        data: { result: 'success' },
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    await (channel as any).onMessage(responseEvent)
    
    // 验证处理器被调用
    expect(handler).toHaveBeenCalled()
    
    // 验证我们的请求收到了正确响应
    const result = await promise
    expect(result.data).toEqual({ result: 'success' })
    
    channel.destroy()
  })

  it('requestId 应该保持唯一性', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    const requestIds = new Set<string>()
    
    // 发送 100 个请求，捕获拒绝
    for (let i = 0; i < 100; i++) {
      channel.publish(`cmd${i}`).catch(() => {})
    }
    
    // 收集所有 requestId
    for (const task of (channel as any).postTasks.values()) {
      requestIds.add(task.data.requestId)
    }
    
    // 所有 requestId 应该是唯一的
    expect(requestIds.size).toBe(100)
    
    channel.destroy()
  })
})

/**
 * PublishOptions 测试
 */
describe('PublishOptions', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    setupIframeDOM()
    setupReferrer('http://localhost/')
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('单次调用超时应该覆盖默认超时', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { 
      log: mockConsole,
      timeout: 5000 // 默认 5 秒
    })
    
    channel.isReady = true
    
    // 使用较短的单次超时
    const promise = channel.publish('test', {}, { timeout: 1000 })
    
    // 快进 1001ms（超过单次超时但未超过默认超时）
    jest.advanceTimersByTime(1001)
    
    const response = await promise
    expect(response.ret).toBe(ReturnCode.TimeOut)
    
    channel.destroy()
  })

  it('较长的单次超时应该正常工作', async () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { 
      log: mockConsole,
      timeout: 1000 // 默认 1 秒
    })
    
    channel.isReady = true
    const baseKey = (channel as any).baseKey
    
    // 使用较长的单次超时
    const promise = channel.publish('test', {}, { timeout: 10000 })
    
    // 快进 2 秒（超过默认超时但未超过单次超时）
    jest.advanceTimersByTime(2000)
    
    // 此时不应超时，模拟收到响应
    const contentWindow = iframe.contentWindow!
    const event = new MessageEvent('message', {
      data: { 
        requestId: baseKey + '1',
        ret: 0,
        data: { success: true },
        _senderKey: 'peer_'
      },
      origin: 'http://localhost',
      source: contentWindow
    })
    await (channel as any).onMessage(event)
    
    const response = await promise
    expect(response.ret).toBe(ReturnCode.Success)
    
    channel.destroy()
  })

  it('options 应该传递给队列中的任务', () => {
    const iframe = document.querySelector('#iframe') as HTMLIFrameElement
    const channel = new IframeChannel(iframe, { log: mockConsole })
    
    // 在 ready 之前发送带 options 的消息，捕获拒绝
    const options = { timeout: 10000, transferables: [] }
    channel.publish('test', {}, options).catch(() => {})
    
    const task = (channel as any).postTasks.values().next().value
    expect(task.options).toEqual(options)
    
    channel.destroy()
  })
})

/**
 * ChannelError 和 ErrorCode 测试
 */
describe('ChannelError 和 ErrorCode', () => {
  it('ChannelError 应该有正确的属性', async () => {
    const { ChannelError, ErrorCode } = await import('../src/errors')
    
    const error = new ChannelError('Test error', ErrorCode.ConnectionDestroyed, { test: 'details' })
    
    expect(error.name).toBe('ChannelError')
    expect(error.message).toBe('Test error')
    expect(error.code).toBe(ErrorCode.ConnectionDestroyed)
    expect(error.details).toEqual({ test: 'details' })
    expect(error.stack).toBeDefined()
  })

  it('ChannelError.toJSON 应该返回正确的结构', async () => {
    const { ChannelError, ErrorCode } = await import('../src/errors')
    
    const error = new ChannelError('Test', ErrorCode.MethodCallTimeout)
    const json = error.toJSON()
    
    expect(json.name).toBe('ChannelError')
    expect(json.message).toBe('Test')
    expect(json.code).toBe(ErrorCode.MethodCallTimeout)
    expect(json.stack).toBeDefined()
  })

  it('ErrorCode 枚举应该有所有预期的值', async () => {
    const { ErrorCode } = await import('../src/errors')
    
    expect(ErrorCode.ConnectionDestroyed).toBe('CONNECTION_DESTROYED')
    expect(ErrorCode.ConnectionTimeout).toBe('CONNECTION_TIMEOUT')
    expect(ErrorCode.MethodCallTimeout).toBe('METHOD_CALL_TIMEOUT')
    expect(ErrorCode.MethodNotFound).toBe('METHOD_NOT_FOUND')
    expect(ErrorCode.TransmissionFailed).toBe('TRANSMISSION_FAILED')
    expect(ErrorCode.MessageSizeExceeded).toBe('MESSAGE_SIZE_EXCEEDED')
    expect(ErrorCode.RateLimitExceeded).toBe('RATE_LIMIT_EXCEEDED')
    expect(ErrorCode.HandlerError).toBe('HANDLER_ERROR')
    expect(ErrorCode.InvalidMessage).toBe('INVALID_MESSAGE')
    expect(ErrorCode.OriginMismatch).toBe('ORIGIN_MISMATCH')
  })

  it('createConnectionDestroyedError 应该创建正确的错误', async () => {
    const { createConnectionDestroyedError, ErrorCode } = await import('../src/errors')
    
    const error = createConnectionDestroyedError('req_123')
    
    expect(error.code).toBe(ErrorCode.ConnectionDestroyed)
    expect(error.details?.requestId).toBe('req_123')
  })

  it('createTimeoutError 应该创建正确的错误', async () => {
    const { createTimeoutError, ErrorCode } = await import('../src/errors')
    
    const error = createTimeoutError('getData', 5000)
    
    expect(error.code).toBe(ErrorCode.MethodCallTimeout)
    expect(error.message).toContain('getData')
    expect(error.message).toContain('5000')
    expect(error.details?.cmdname).toBe('getData')
    expect(error.details?.timeout).toBe(5000)
  })

  it('createHandlerError 应该创建正确的错误', async () => {
    const { createHandlerError, ErrorCode } = await import('../src/errors')
    
    const originalError = new Error('Original error message')
    const error = createHandlerError('handleData', originalError)
    
    expect(error.code).toBe(ErrorCode.HandlerError)
    expect(error.message).toBe('Original error message')
    expect(error.details?.cmdname).toBe('handleData')
    expect(error.details?.originalError).toBe('Original error message')
  })
})

/**
 * 模块导出完整性测试
 */
describe('模块导出完整性', () => {
  it('应该导出 ChannelError 和 ErrorCode', () => {
    const exports = require('../src/index')
    
    expect(exports.ChannelError).toBeDefined()
    expect(exports.ErrorCode).toBeDefined()
    expect(exports.createConnectionDestroyedError).toBeDefined()
    expect(exports.createTimeoutError).toBeDefined()
    expect(exports.createHandlerError).toBeDefined()
  })

  it('应该导出 PublishOptions 类型', () => {
    // TypeScript 类型不能在运行时检查，但我们可以验证接口文件被正确导出
    const exports = require('../src/interface')
    expect(exports).toBeDefined()
  })
})
