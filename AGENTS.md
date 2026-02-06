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
// PAGE SIDE - Basic usage
const channel = await ServiceWorkerChannel.createFromPage()
const response = await channel.publish('fetchData', { url: '/api' })

// PAGE SIDE - With Hub integration and connection stability (recommended)
const channel = await ServiceWorkerChannel.createFromPage({
  swUrl: '/sw.js',           // Auto-register SW
  appType: 'cart',           // For broadcastToType
  appName: 'Shopping Cart',
  autoReconnect: true,       // Auto-reconnect on SW update (default: true)
  heartbeatInterval: 30000,  // Connection health check interval (default: 30s)
  maxMissedHeartbeats: 3,    // Disconnect after N failures (default: 3)
})

// CONNECTION STATE MONITORING (important for stability)
channel.on('connected', ({ isReconnect }) => {
  console.log(isReconnect ? 'Reconnected' : 'Connected')
})

channel.on('disconnected', ({ reason }) => {
  console.log('Disconnected:', reason)  // 'heartbeat_failed' | 'sw_terminated' | 'controller_changed'
})

channel.on('reconnecting', ({ attempt, maxAttempts }) => {
  console.log(`Reconnecting (${attempt}/${maxAttempts})...`)
})

// Check connection state
console.log(channel.connectionState)  // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
console.log(channel.isConnected)      // boolean

// SERVICE WORKER SIDE - Using Hub API (recommended)
importScripts('./postmessage-duplex.umd.js')
const { ServiceWorkerChannel } = PostMessageChannel

ServiceWorkerChannel.setupHub({ version: '1.0.0' })

ServiceWorkerChannel.subscribeGlobal('fetchData', async ({ data, clientId }) => {
  const res = await fetch(data.url)
  return await res.json()
})

// Broadcast to all clients
await ServiceWorkerChannel.broadcastToAll('notification', { msg: 'Hello' })

// Broadcast to specific app type
await ServiceWorkerChannel.broadcastToType('cart', 'update', { items: 3 })
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
// IframeChannel options
const channel = new IframeChannel(target, {
  timeout: 5000,           // ms, default: 5000
  maxMessageSize: 1048576, // bytes, default: 1MB
  rateLimit: 100,          // msgs/sec, default: 100
})

// ServiceWorkerChannel options (includes connection stability)
const channel = await ServiceWorkerChannel.createFromPage({
  timeout: 5000,              // Request timeout (default: 5000ms)
  heartbeatInterval: 30000,   // Health check interval (default: 30s, 0 to disable)
  heartbeatTimeout: 5000,     // Heartbeat timeout (default: 5s)
  maxMissedHeartbeats: 3,     // Failures before disconnect (default: 3)
  smartHeartbeat: true,       // Skip heartbeat if recent message (default: true)
  autoReconnect: true,        // Auto-reconnect on disconnect (default: true)
  maxReconnectAttempts: 5,    // Max reconnection attempts (default: 5)
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

### Broadcast (One-way Communication)

```typescript
channel.broadcast('notification', { message: 'Data changed' })  // Fire-and-forget
channel.onBroadcast('notification', ({ data }) => console.log(data.message))  // No return
channel.offBroadcast('notification')  // Remove handler
```

**Key differences:** No Promise, no return value, no timeout - ideal for notifications.

### Debugging

```typescript
import { enableDebugger } from 'postmessage-duplex'
if (process.env.NODE_ENV === 'development') enableDebugger()
// Then use: __POSTMESSAGE_DUPLEX__.debug.help() in console
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
├── base-channel.ts    # Base class with core messaging logic
├── iframe-channel.ts  # IframeChannel class
├── sw-channel.ts      # ServiceWorkerChannel class
├── sw-hub.ts          # ServiceWorkerHub for multi-client management
├── interface.ts       # Type definitions (ClientMeta, HubOptions, etc.)
├── utils.ts           # Shared utilities (cloneMessage, generateUniqueId)
├── errors.ts          # ChannelError, ErrorCode
├── validators.ts      # Message validation utilities
├── event-emitter.ts   # Event emitter for lifecycle events
├── debugger.ts        # enableDebugger()
├── rate-limiter.ts    # Rate limiting for message sending
└── timeout-manager.ts # Timeout management for requests
```

## Common Mistakes to Avoid

```typescript
// ❌ WRONG: Not awaiting publish
channel.publish('cmd', data)  // Fire and forget - won't get response

// ✅ CORRECT: Await the response
const response = await channel.publish('cmd', data)

// ✅ ALSO CORRECT: Use broadcast for one-way messages
channel.broadcast('notification', data)  // Fire and forget by design

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

// ❌ WRONG: Using subscribeGlobal without setupHub
ServiceWorkerChannel.subscribeGlobal('cmd', handler)  // Won't work!

// ✅ CORRECT: Initialize Hub first
ServiceWorkerChannel.setupHub({ version: '1.0.0' })
ServiceWorkerChannel.subscribeGlobal('cmd', handler)

// ❌ WRONG: Ignoring connection state in critical operations
await channel.publish('payment', data)  // May fail silently if disconnected

// ✅ CORRECT: Check connection state before critical operations
if (channel.isConnected) {
  await channel.publish('payment', data)
} else {
  // Queue for retry or show error to user
}

// ❌ WRONG: Not listening for disconnection events
const channel = await ServiceWorkerChannel.createFromPage()

// ✅ CORRECT: Handle connection lifecycle for robust apps
const channel = await ServiceWorkerChannel.createFromPage()
channel.on('disconnected', ({ reason }) => {
  showReconnectingUI()
})
channel.on('connected', () => {
  hideReconnectingUI()
})
```

## Testing Guidelines

### Key Testing Notes

1. **Global routing is ON by default** - Use `ServiceWorkerChannel.disableGlobalRouting()` to test individual listeners
2. **Static state persists between tests** - Reset with `disableGlobalRouting()` then `enableGlobalRouting()`
3. **Use Jest fake timers for timeout tests** - `jest.useFakeTimers()` / `jest.useRealTimers()`
4. **Mock SW global scope** - Set `(globalThis as any).self = mockSelf` with `clients.get()` and `clients.matchAll()`
