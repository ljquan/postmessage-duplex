# AI Agent Instructions for postmessage-duplex

This document provides guidance for AI coding assistants when working with the postmessage-duplex library.

## Library Purpose

postmessage-duplex is a type-safe, Promise-based duplex communication library built on the postMessage API. It provides:

- **Request-response pattern** with automatic correlation
- **Unified API** for iframe and Service Worker communication
- **Built-in timeout handling** and message queuing
- **TypeScript support** with full type definitions

## Quick Reference

### Installation

```bash
npm install postmessage-duplex
```

### Core Imports

```typescript
import {
  IframeChannel,           // For iframe communication
  ServiceWorkerChannel,    // For Service Worker communication
  ReturnCode,              // Response status codes
  enableDebugger           // Debug tools (dev only)
} from 'postmessage-duplex'
```

### IframeChannel Usage

```typescript
// PARENT PAGE: Pass the iframe element
const iframe = document.getElementById('my-iframe') as HTMLIFrameElement
const channel = new IframeChannel(iframe)

// CHILD PAGE: Pass the parent origin URL
const channel = new IframeChannel('https://parent-domain.com')

// SEND MESSAGE (both sides)
const response = await channel.publish('commandName', { key: 'value' })

// HANDLE MESSAGE (both sides)
channel.subscribe('commandName', async ({ data }) => {
  // Process incoming data
  return { result: 'processed' }  // Sent back as response
})

// CLEANUP (important!)
channel.destroy()
```

### ServiceWorkerChannel Usage

```typescript
// PAGE SIDE
const channel = await ServiceWorkerChannel.createFromPage()
const response = await channel.publish('fetchData', { url: '/api' })

// SERVICE WORKER SIDE (in sw.js)
const channel = ServiceWorkerChannel.createFromEvent(event)
channel.subscribe('fetchData', async ({ data }) => {
  const res = await fetch(data.url)
  return await res.json()
})
```

### Response Handling Pattern

```typescript
import { ReturnCode } from 'postmessage-duplex'

const response = await channel.publish('action', data)

switch (response.ret) {
  case ReturnCode.Success:        // 0
    return response.data
  case ReturnCode.TimeOut:        // -99
    throw new Error('Request timed out')
  case ReturnCode.NoSubscribe:    // -3
    throw new Error('Handler not registered')
  default:
    throw new Error(response.msg || 'Unknown error')
}
```

### Configuration Options

```typescript
const channel = new IframeChannel(target, {
  timeout: 5000,           // ms, default: 5000
  maxMessageSize: 1048576, // bytes, default: 1MB
  rateLimit: 100,          // msgs/sec, default: 100
})
```

### Type-Safe Calls (TypeScript)

```typescript
interface RemoteMethods {
  getUser(params: { id: number }): { name: string; email: string }
  updateUser(params: { id: number; name: string }): boolean
}

const channel = new IframeChannel<RemoteMethods>(iframe)

// Type-checked parameters and return type
const response = await channel.call('getUser', { id: 123 })
// response.data is typed as { name: string; email: string } | undefined
```

### Debugging

```typescript
// Enable in development only
import { enableDebugger } from 'postmessage-duplex'

if (process.env.NODE_ENV === 'development') {
  enableDebugger()
}

// Console commands available after enabling:
// __POSTMESSAGE_DUPLEX__.debug.help()
// __POSTMESSAGE_DUPLEX__.debug.getChannels()
// __POSTMESSAGE_DUPLEX__.debug.getHistory()
// __POSTMESSAGE_DUPLEX__.debug.enableLiveLog(true)
```

## Code Generation Rules

When generating code that uses this library:

1. **Always import from `'postmessage-duplex'`** - this is the npm package name

2. **`publish()` returns a Promise** - always use await or .then()

3. **Check `response.ret` before using `response.data`** - data may be undefined on error

4. **Call `destroy()` on cleanup** - in React useEffect return, Vue onUnmounted, etc.

5. **Parent vs Child initialization differs**:
   - Parent: `new IframeChannel(iframeElement)`
   - Child: `new IframeChannel('https://parent-origin.com')`

6. **Subscribe handler return value becomes response** - return data directly, not wrapped

7. **For debugging, use `enableDebugger()`** - not the legacy `__postmessage_duplex_getTrace()`

## File Structure

```
src/
├── index.ts           # Public exports
├── base-channel.ts    # Base class (internal)
├── iframe-channel.ts  # IframeChannel class
├── sw-channel.ts      # ServiceWorkerChannel class
├── interface.ts       # Type definitions
├── errors.ts          # ChannelError, ErrorCode
├── debugger.ts        # enableDebugger()
└── ...                # Other internal modules
```

## Common Mistakes to Avoid

```typescript
// ❌ WRONG: Not awaiting publish
channel.publish('cmd', data)  // Fire and forget - won't get response

// ✅ CORRECT: Await the response
const response = await channel.publish('cmd', data)

// ❌ WRONG: Using data without checking ret
const data = response.data  // May be undefined!

// ✅ CORRECT: Check ret first
if (response.ret === ReturnCode.Success) {
  const data = response.data
}

// ❌ WRONG: Not destroying on unmount
useEffect(() => {
  const channel = new IframeChannel(iframe)
  // Missing cleanup!
}, [])

// ✅ CORRECT: Cleanup on unmount
useEffect(() => {
  const channel = new IframeChannel(iframe)
  return () => channel.destroy()
}, [])

// ❌ WRONG: Wrapping subscribe return value
channel.subscribe('cmd', ({ data }) => {
  return { data: processedData }  // Don't wrap!
})

// ✅ CORRECT: Return data directly
channel.subscribe('cmd', ({ data }) => {
  return processedData  // This becomes response.data
})
```
