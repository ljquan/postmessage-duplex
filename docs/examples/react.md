# React 集成

## 基础组件

```tsx
import { useEffect, useRef, useState } from 'react'
import { IframeChannel, ReturnCode } from 'postmessage-duplex'

function ParentComponent() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const channelRef = useRef<IframeChannel>()
  
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (iframeRef.current) {
      channelRef.current = new IframeChannel(iframeRef.current, {
        timeout: 5000
      })
      
      channelRef.current.subscribe('notification', ({ data }) => {
        console.log('Received:', data)
        return { acknowledged: true }
      })
    }
    
    return () => {
      channelRef.current?.destroy()
    }
  }, [])
  
  const handleFetch = async () => {
    const channel = channelRef.current
    if (!channel) return
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await channel.publish('getData', { id: 1 })
      
      if (response.ret === ReturnCode.Success) {
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
    <div>
      <button onClick={handleFetch} disabled={loading}>
        {loading ? '加载中...' : '获取数据'}
      </button>
      
      {error && <div className="error">{error}</div>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
      
      <iframe ref={iframeRef} src="./child.html" />
    </div>
  )
}

export default ParentComponent
```

## 自定义 Hook

```typescript
// hooks/useIframeChannel.ts
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  IframeChannel,
  ReturnCode,
  type Methods,
  type PostResponse,
  type ChannelOption
} from 'postmessage-duplex'

interface UseIframeChannelResult<T extends Methods> {
  isReady: boolean
  isDestroyed: boolean
  publish: (cmdname: string, data?: any) => Promise<PostResponse>
  call: <K extends keyof T>(
    methodName: K,
    params: Parameters<T[K]>[0]
  ) => Promise<PostResponse>
  subscribe: (cmdname: string, callback: (res: PostResponse) => any) => void
  unSubscribe: (cmdname: string) => void
}

export function useIframeChannel<T extends Methods = Methods>(
  iframeRef: React.RefObject<HTMLIFrameElement>,
  options?: ChannelOption
): UseIframeChannelResult<T> {
  const channelRef = useRef<IframeChannel<T>>()
  const [isReady, setIsReady] = useState(false)
  const [isDestroyed, setIsDestroyed] = useState(false)
  
  useEffect(() => {
    if (iframeRef.current) {
      channelRef.current = new IframeChannel<T>(iframeRef.current, options)
      setIsReady(true)
    }
    
    return () => {
      channelRef.current?.destroy()
      setIsDestroyed(true)
    }
  }, [])
  
  const publish = useCallback(async (cmdname: string, data?: any) => {
    if (!channelRef.current) {
      throw new Error('Channel not initialized')
    }
    return channelRef.current.publish(cmdname, data)
  }, [])
  
  const call = useCallback(async <K extends keyof T>(
    methodName: K,
    params: Parameters<T[K]>[0]
  ) => {
    if (!channelRef.current) {
      throw new Error('Channel not initialized')
    }
    return channelRef.current.call(methodName, params)
  }, [])
  
  const subscribe = useCallback((
    cmdname: string,
    callback: (res: PostResponse) => any
  ) => {
    channelRef.current?.subscribe(cmdname, callback)
  }, [])
  
  const unSubscribe = useCallback((cmdname: string) => {
    channelRef.current?.unSubscribe(cmdname)
  }, [])
  
  return {
    isReady,
    isDestroyed,
    publish,
    call,
    subscribe,
    unSubscribe
  }
}
```

### 使用 Hook

```tsx
import { useRef, useState, useEffect } from 'react'
import { useIframeChannel } from './hooks/useIframeChannel'
import { ReturnCode } from 'postmessage-duplex'

interface ChildMethods {
  getData(params: { id: number }): { name: string; value: number }
  setData(params: { data: object }): void
}

function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { isReady, call, subscribe } = useIframeChannel<ChildMethods>(
    iframeRef,
    { timeout: 10000 }
  )
  
  const [data, setData] = useState<{ name: string; value: number } | null>(null)
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    if (isReady) {
      subscribe('notification', ({ data }) => {
        console.log('Notification:', data)
        return { handled: true }
      })
    }
  }, [isReady, subscribe])
  
  const handleFetch = async () => {
    setLoading(true)
    
    try {
      const response = await call('getData', { id: 1 })
      
      if (response.ret === ReturnCode.Success && response.data) {
        setData(response.data)
      }
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div>
      <p>状态: {isReady ? '就绪' : '初始化中...'}</p>
      
      <button onClick={handleFetch} disabled={!isReady || loading}>
        {loading ? '加载中...' : '获取数据'}
      </button>
      
      {data && (
        <div>
          <p>Name: {data.name}</p>
          <p>Value: {data.value}</p>
        </div>
      )}
      
      <iframe ref={iframeRef} src="./child.html" />
    </div>
  )
}

export default App
```

## 带异步请求处理的 Hook

```typescript
// hooks/useChannelQuery.ts
import { useState, useCallback } from 'react'
import { ReturnCode, type PostResponse } from 'postmessage-duplex'

interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface QueryResult<T> extends QueryState<T> {
  execute: () => Promise<void>
  reset: () => void
}

export function useChannelQuery<T>(
  queryFn: () => Promise<PostResponse>
): QueryResult<T> {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: false,
    error: null
  })
  
  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    
    try {
      const response = await queryFn()
      
      if (response.ret === ReturnCode.Success) {
        setState({
          data: response.data as T,
          loading: false,
          error: null
        })
      } else {
        setState({
          data: null,
          loading: false,
          error: response.msg || 'Request failed'
        })
      }
    } catch (e) {
      setState({
        data: null,
        loading: false,
        error: (e as Error).message
      })
    }
  }, [queryFn])
  
  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])
  
  return {
    ...state,
    execute,
    reset
  }
}
```

### 使用 Query Hook

```tsx
import { useRef, useCallback } from 'react'
import { useIframeChannel } from './hooks/useIframeChannel'
import { useChannelQuery } from './hooks/useChannelQuery'

interface User {
  id: number
  name: string
}

function UserProfile({ userId }: { userId: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { call, isReady } = useIframeChannel(iframeRef)
  
  const fetchUser = useCallback(() => {
    return call('getUser', { id: userId })
  }, [call, userId])
  
  const { data: user, loading, error, execute } = useChannelQuery<User>(fetchUser)
  
  return (
    <div>
      {loading && <p>加载中...</p>}
      {error && <p className="error">{error}</p>}
      
      {user && (
        <div>
          <h2>{user.name}</h2>
          <p>ID: {user.id}</p>
        </div>
      )}
      
      <button onClick={execute} disabled={!isReady || loading}>
        刷新
      </button>
      
      <iframe ref={iframeRef} src="./child.html" style={{ display: 'none' }} />
    </div>
  )
}
```

## Context Provider

```tsx
// context/ChannelContext.tsx
import { createContext, useContext, useRef, useEffect, ReactNode } from 'react'
import { IframeChannel, type Methods, type PostResponse } from 'postmessage-duplex'

interface ChannelContextValue<T extends Methods = Methods> {
  publish: (cmdname: string, data?: any) => Promise<PostResponse>
  subscribe: (cmdname: string, callback: (res: PostResponse) => any) => void
  unSubscribe: (cmdname: string) => void
}

const ChannelContext = createContext<ChannelContextValue | null>(null)

interface ChannelProviderProps {
  children: ReactNode
  iframeSrc: string
}

export function ChannelProvider<T extends Methods = Methods>({ 
  children, 
  iframeSrc 
}: ChannelProviderProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const channelRef = useRef<IframeChannel<T>>()
  
  useEffect(() => {
    if (iframeRef.current) {
      channelRef.current = new IframeChannel<T>(iframeRef.current)
    }
    
    return () => {
      channelRef.current?.destroy()
    }
  }, [])
  
  const value: ChannelContextValue<T> = {
    publish: async (cmdname, data) => {
      if (!channelRef.current) {
        throw new Error('Channel not ready')
      }
      return channelRef.current.publish(cmdname, data)
    },
    subscribe: (cmdname, callback) => {
      channelRef.current?.subscribe(cmdname, callback)
    },
    unSubscribe: (cmdname) => {
      channelRef.current?.unSubscribe(cmdname)
    }
  }
  
  return (
    <ChannelContext.Provider value={value}>
      {children}
      <iframe 
        ref={iframeRef} 
        src={iframeSrc} 
        style={{ display: 'none' }} 
      />
    </ChannelContext.Provider>
  )
}

export function useChannel<T extends Methods = Methods>() {
  const context = useContext(ChannelContext)
  if (!context) {
    throw new Error('useChannel must be used within ChannelProvider')
  }
  return context as ChannelContextValue<T>
}
```

### 使用 Context

```tsx
// App.tsx
import { ChannelProvider, useChannel } from './context/ChannelContext'
import { ReturnCode } from 'postmessage-duplex'

function DataDisplay() {
  const { publish } = useChannel()
  
  const handleClick = async () => {
    const response = await publish('getData', { id: 1 })
    
    if (response.ret === ReturnCode.Success) {
      console.log('Data:', response.data)
    }
  }
  
  return <button onClick={handleClick}>获取数据</button>
}

function App() {
  return (
    <ChannelProvider iframeSrc="./child.html">
      <h1>My App</h1>
      <DataDisplay />
    </ChannelProvider>
  )
}

export default App
```

## 下一步

- [高级用法](./advanced.md)
- [API 参考](/api/)
