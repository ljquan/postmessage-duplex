# Vue 集成

## Vue 3 Composition API

### 基础组件

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { IframeChannel, ReturnCode } from 'postmessage-duplex'

const iframeRef = ref<HTMLIFrameElement>()
let channel: IframeChannel

const message = ref('')
const response = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  if (iframeRef.value) {
    channel = new IframeChannel(iframeRef.value)
    
    channel.subscribe('notification', ({ data }) => {
      message.value = JSON.stringify(data)
      return { received: true }
    })
  }
})

onUnmounted(() => {
  channel?.destroy()
})

async function sendMessage() {
  if (!channel) return
  
  loading.value = true
  error.value = null
  
  try {
    const res = await channel.publish('getData', { id: 1 })
    
    if (res.ret === ReturnCode.Success) {
      response.value = res.data
    } else {
      error.value = res.msg || 'Request failed'
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="iframe-container">
    <div class="controls">
      <button @click="sendMessage" :disabled="loading">
        {{ loading ? '发送中...' : '发送消息' }}
      </button>
    </div>
    
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="response" class="response">{{ response }}</div>
    <div v-if="message" class="message">收到: {{ message }}</div>
    
    <iframe ref="iframeRef" src="./child.html" />
  </div>
</template>

<style scoped>
.iframe-container {
  padding: 20px;
}

iframe {
  width: 100%;
  height: 300px;
  border: 1px solid #ddd;
  margin-top: 20px;
}

.error {
  color: red;
  margin: 10px 0;
}

.response, .message {
  background: #f5f5f5;
  padding: 10px;
  margin: 10px 0;
}

button {
  padding: 8px 16px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

### 可复用 Composable

```typescript
// composables/useIframeChannel.ts
import { ref, onMounted, onUnmounted, Ref } from 'vue'
import { 
  IframeChannel, 
  ReturnCode, 
  type Methods,
  type PostResponse 
} from 'postmessage-duplex'

interface UseIframeChannelOptions {
  timeout?: number
  onReady?: () => void
  onDestroy?: () => void
}

export function useIframeChannel<TMethods extends Methods = Methods>(
  iframeRef: Ref<HTMLIFrameElement | undefined>,
  options: UseIframeChannelOptions = {}
) {
  const channel = ref<IframeChannel<TMethods>>()
  const isReady = ref(false)
  const isDestroyed = ref(false)
  
  onMounted(() => {
    if (iframeRef.value) {
      channel.value = new IframeChannel<TMethods>(iframeRef.value, {
        timeout: options.timeout || 5000
      })
      
      isReady.value = true
      options.onReady?.()
    }
  })
  
  onUnmounted(() => {
    if (channel.value) {
      channel.value.destroy()
      isDestroyed.value = true
      options.onDestroy?.()
    }
  })
  
  async function publish(cmdname: string, data?: any) {
    if (!channel.value || isDestroyed.value) {
      throw new Error('Channel not available')
    }
    return channel.value.publish(cmdname, data)
  }
  
  async function call<K extends keyof TMethods>(
    methodName: K,
    params: Parameters<TMethods[K]>[0]
  ) {
    if (!channel.value || isDestroyed.value) {
      throw new Error('Channel not available')
    }
    return channel.value.call(methodName, params)
  }
  
  function subscribe(cmdname: string, callback: (res: PostResponse) => any) {
    if (channel.value) {
      channel.value.subscribe(cmdname, callback)
    }
  }
  
  function unSubscribe(cmdname: string) {
    channel.value?.unSubscribe(cmdname)
  }
  
  return {
    channel,
    isReady,
    isDestroyed,
    publish,
    call,
    subscribe,
    unSubscribe
  }
}
```

### 使用 Composable

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useIframeChannel } from './composables/useIframeChannel'

interface ChildMethods {
  getData(params: { id: number }): { name: string }
  setData(params: { value: string }): void
}

const iframeRef = ref<HTMLIFrameElement>()

const { 
  isReady, 
  call, 
  subscribe 
} = useIframeChannel<ChildMethods>(iframeRef, {
  timeout: 10000,
  onReady: () => {
    console.log('Channel ready')
    
    subscribe('notification', ({ data }) => {
      console.log('Notification:', data)
      return { ok: true }
    })
  }
})

const data = ref<{ name: string } | null>(null)
const loading = ref(false)

async function fetchData() {
  if (!isReady.value) return
  
  loading.value = true
  
  try {
    const response = await call('getData', { id: 1 })
    if (response.data) {
      data.value = response.data
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <p>状态: {{ isReady ? '就绪' : '未就绪' }}</p>
    <button @click="fetchData" :disabled="!isReady || loading">
      获取数据
    </button>
    <pre v-if="data">{{ data }}</pre>
    <iframe ref="iframeRef" src="./child.html" />
  </div>
</template>
```

## Vue 2 Options API

```vue
<template>
  <div>
    <button @click="sendMessage" :disabled="loading">
      {{ loading ? '发送中...' : '发送消息' }}
    </button>
    
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="response">{{ response }}</div>
    
    <iframe ref="childIframe" src="./child.html" />
  </div>
</template>

<script>
import { IframeChannel, ReturnCode } from 'postmessage-duplex'

export default {
  name: 'ParentComponent',
  
  data() {
    return {
      channel: null,
      response: null,
      loading: false,
      error: null
    }
  },
  
  mounted() {
    this.channel = new IframeChannel(this.$refs.childIframe, {
      timeout: 5000
    })
    
    this.channel.subscribe('notification', ({ data }) => {
      console.log('Notification:', data)
      return { received: true }
    })
  },
  
  beforeDestroy() {
    if (this.channel) {
      this.channel.destroy()
    }
  },
  
  methods: {
    async sendMessage() {
      this.loading = true
      this.error = null
      
      try {
        const res = await this.channel.publish('getData', { id: 1 })
        
        if (res.ret === ReturnCode.Success) {
          this.response = res.data
        } else {
          this.error = res.msg || 'Request failed'
        }
      } catch (e) {
        this.error = e.message
      } finally {
        this.loading = false
      }
    }
  }
}
</script>
```

## Pinia Store

```typescript
// stores/channelStore.ts
import { defineStore } from 'pinia'
import { IframeChannel, ReturnCode, type Methods } from 'postmessage-duplex'

interface RemoteMethods extends Methods {
  getData(p: { id: number }): { name: string }
  setData(p: { data: object }): void
}

export const useChannelStore = defineStore('channel', {
  state: () => ({
    channel: null as IframeChannel<RemoteMethods> | null,
    isReady: false,
    lastError: null as string | null
  }),
  
  actions: {
    init(iframe: HTMLIFrameElement) {
      if (this.channel) {
        this.channel.destroy()
      }
      
      this.channel = new IframeChannel<RemoteMethods>(iframe)
      this.isReady = true
      this.lastError = null
      
      this.channel.subscribe('notification', ({ data }) => {
        console.log('Store received:', data)
        return { handled: true }
      })
    },
    
    async fetchData(id: number) {
      if (!this.channel) {
        throw new Error('Channel not initialized')
      }
      
      const response = await this.channel.call('getData', { id })
      
      if (response.ret !== ReturnCode.Success) {
        this.lastError = response.msg || 'Request failed'
        throw new Error(this.lastError)
      }
      
      return response.data
    },
    
    destroy() {
      this.channel?.destroy()
      this.channel = null
      this.isReady = false
    }
  }
})
```

### 在组件中使用 Store

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useChannelStore } from './stores/channelStore'

const store = useChannelStore()
const iframeRef = ref<HTMLIFrameElement>()
const data = ref<any>(null)

onMounted(() => {
  if (iframeRef.value) {
    store.init(iframeRef.value)
  }
})

onUnmounted(() => {
  store.destroy()
})

async function getData() {
  try {
    data.value = await store.fetchData(1)
  } catch (e) {
    console.error('Error:', e)
  }
}
</script>

<template>
  <div>
    <p>状态: {{ store.isReady ? '就绪' : '未就绪' }}</p>
    <p v-if="store.lastError" class="error">{{ store.lastError }}</p>
    <button @click="getData">获取数据</button>
    <pre v-if="data">{{ data }}</pre>
    <iframe ref="iframeRef" src="./child.html" />
  </div>
</template>
```

## 下一步

- [React 集成](./react.md)
- [高级用法](./advanced.md)
