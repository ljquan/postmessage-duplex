# PostMessage Duplex Library - AI Assistant Guide

This file provides guidance for AI assistants (Cursor, Copilot, etc.) when working with this postmessage-duplex library.

## Project Overview

postmessage-duplex is a lightweight, type-safe duplex communication library based on the postMessage API. It provides a unified interface for both **iframe** and **Service Worker** communication.

## File Structure

```
src/
├── index.ts              # Main entry, exports all public APIs
├── base-channel.ts       # Abstract base class with shared logic
├── iframe-channel.ts     # IframeChannel implementation
├── sw-channel.ts         # ServiceWorkerChannel implementation
├── interface.ts          # TypeScript types and interfaces
├── errors.ts             # ChannelError class and ErrorCode enum
├── trace.ts              # Message tracing for debugging
├── debugger.ts           # Debug tools (enableDebugger)
├── event-emitter.ts      # Lifecycle events
├── validators.ts         # Message validation
├── timeout-manager.ts    # Efficient timeout handling
└── rate-limiter.ts       # Rate limiting
```

## Key APIs

### IframeChannel

Use for parent-child iframe communication.

```typescript
// Parent page - pass iframe element
const channel = new IframeChannel(iframeElement)

// Child page - pass parent origin string
const channel = new IframeChannel('https://parent-domain.com')
```

### ServiceWorkerChannel

Use for page-to-ServiceWorker communication.

```typescript
// Page side - recommended
const channel = await ServiceWorkerChannel.createFromPage()

// Worker side - from message event
const channel = ServiceWorkerChannel.createFromEvent(event)
```

### Common Methods (Both Channels)

```typescript
// Send message and wait for response (Promise-based)
const response = await channel.publish('commandName', { data: 'value' })

// Subscribe to incoming messages
channel.subscribe('commandName', async ({ data }) => {
  // Process data
  return { result: 'response' }  // Return value sent as response
})

// Unsubscribe
channel.unSubscribe('commandName')

// Destroy channel (cleanup)
channel.destroy()
```

### Response Handling

```typescript
import { ReturnCode } from 'postmessage-duplex'

const response = await channel.publish('getData')

if (response.ret === ReturnCode.Success) {
  // Success - use response.data
} else if (response.ret === ReturnCode.TimeOut) {
  // Request timed out (default: 5000ms)
} else if (response.ret === ReturnCode.NoSubscribe) {
  // No handler registered on remote side
} else {
  // Error - check response.msg
}
```

### Channel Options

```typescript
const channel = new IframeChannel(target, {
  timeout: 5000,           // Request timeout in ms
  maxMessageSize: 1048576, // Max message size (1MB)
  rateLimit: 100,          // Max messages per second
  strictValidation: true,  // Validate message structure
  log: console,            // Custom logger
  subscribeMap: {          // Pre-defined handlers
    'ping': () => ({ pong: true })
  }
})
```

### Lifecycle Events

```typescript
channel.on('ready', ({ peerKey }) => {
  console.log('Channel ready')
})

channel.on('timeout', ({ cmdname, requestId }) => {
  console.log('Request timed out:', cmdname)
})

channel.on('error', ({ error, context }) => {
  console.error('Channel error:', error)
})

channel.on('destroy', () => {
  console.log('Channel destroyed')
})
```

### Debugging

```typescript
import { enableDebugger } from 'postmessage-duplex'

// Enable debugger (only in development)
if (process.env.NODE_ENV === 'development') {
  enableDebugger()
}

// Then in browser console:
__POSTMESSAGE_DUPLEX__.debug.help()           // Show commands
__POSTMESSAGE_DUPLEX__.debug.getChannels()    // List channels
__POSTMESSAGE_DUPLEX__.debug.getHistory()     // Message history
__POSTMESSAGE_DUPLEX__.debug.enableLiveLog(true)  // Real-time logs
```

## Best Practices

1. **Always call `destroy()`** when component unmounts or channel is no longer needed
2. **Handle all ReturnCode cases** in production code
3. **Use TypeScript generics** for type-safe remote calls:
   ```typescript
   interface RemoteMethods {
     getData(params: { id: number }): { name: string }
   }
   const channel = new IframeChannel<RemoteMethods>(iframe)
   const response = await channel.call('getData', { id: 1 })
   // response.data is typed as { name: string } | undefined
   ```
4. **Enable debugger in development** for easier troubleshooting
5. **Use lifecycle events** for monitoring and error reporting

## Common Patterns

### Vue 3 Composable

```typescript
import { ref, onMounted, onUnmounted } from 'vue'
import { IframeChannel } from 'postmessage-duplex'

export function useIframeChannel(iframeRef: Ref<HTMLIFrameElement | undefined>) {
  const channel = ref<IframeChannel>()
  const isReady = ref(false)

  onMounted(() => {
    if (iframeRef.value) {
      channel.value = new IframeChannel(iframeRef.value)
      channel.value.on('ready', () => { isReady.value = true })
    }
  })

  onUnmounted(() => {
    channel.value?.destroy()
  })

  return { channel, isReady }
}
```

### React Hook

```typescript
import { useEffect, useRef, useState } from 'react'
import { IframeChannel } from 'postmessage-duplex'

export function useIframeChannel(iframeRef: React.RefObject<HTMLIFrameElement>) {
  const channelRef = useRef<IframeChannel>()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (iframeRef.current) {
      channelRef.current = new IframeChannel(iframeRef.current)
      channelRef.current.on('ready', () => setIsReady(true))
    }
    return () => channelRef.current?.destroy()
  }, [])

  return { channel: channelRef.current, isReady }
}
```

## When Generating Code

- Import from `'postmessage-duplex'` (the npm package name)
- Use async/await with `publish()` - it returns a Promise
- Always check `response.ret` before using `response.data`
- Call `destroy()` in cleanup/unmount lifecycle
- Use `enableDebugger()` only in development environment
