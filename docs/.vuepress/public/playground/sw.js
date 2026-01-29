/**
 * Service Worker Demo for postmessage-duplex Playground
 */

const VERSION = '1.0.0';
const channels = new Map();

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v' + VERSION);
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v' + VERSION);
  event.waitUntil(self.clients.claim());
});

// Message event
self.addEventListener('message', (event) => {
  const clientId = event.source?.id;
  if (!clientId) {
    console.warn('[SW] Message without client ID');
    return;
  }

  console.log('[SW] Message from:', clientId, event.data);

  let channel = channels.get(clientId);
  if (!channel) {
    channel = createChannel(clientId);
    channels.set(clientId, channel);
    console.log('[SW] New channel for:', clientId);
  }

  channel.handleMessage(event.data);
});

function createChannel(clientId) {
  const subscribeMap = {};

  // Ping handler
  subscribeMap['ping'] = async () => {
    return { pong: true, timestamp: Date.now(), from: 'ServiceWorker' };
  };

  // Get data handler
  subscribeMap['getData'] = async ({ data }) => {
    await sleep(100);
    return {
      id: data.id,
      name: 'Item ' + data.id,
      value: Math.round(Math.random() * 1000),
      fetchedAt: new Date().toISOString()
    };
  };

  // Echo handler
  subscribeMap['echo'] = async ({ data }) => {
    return {
      original: data.message,
      echoed: 'SW echoes: ' + data.message,
      processedAt: new Date().toISOString()
    };
  };

  // Cache operation handler
  subscribeMap['cacheOperation'] = async ({ data }) => {
    const key = data.key || 'default';
    const value = data.value;
    
    // Simulate cache operation
    await sleep(50);
    return {
      operation: value ? 'set' : 'get',
      key: key,
      value: value || 'cached_value_' + key,
      cached: true
    };
  };

  // Error test handler
  subscribeMap['throwError'] = async () => {
    throw new Error('Test error from Service Worker');
  };

  // Slow request handler (for timeout testing)
  subscribeMap['slowRequest'] = async ({ data }) => {
    const delay = data.delay || 5000;
    await sleep(delay);
    return { completed: true, delay: delay };
  };

  async function sendMessage(data) {
    try {
      const client = await self.clients.get(clientId);
      if (client) {
        data.time = Date.now();
        client.postMessage(data);
      } else {
        console.warn('[SW] Client not found:', clientId);
        channels.delete(clientId);
      }
    } catch (e) {
      console.error('[SW] Send error:', e);
    }
  }

  async function handleMessage(data) {
    const { requestId, cmdname, msg } = data || {};

    if (msg === 'ready') {
      sendMessage({ requestId, ret: 0, msg: 'ready' });
      console.log('[SW] Ready for:', clientId);
      return;
    }

    if (cmdname && cmdname in subscribeMap) {
      try {
        const result = await subscribeMap[cmdname](data);
        sendMessage({ requestId, ret: 0, data: result });
      } catch (e) {
        sendMessage({ requestId, ret: -1, msg: e.message || 'Error' });
      }
    } else if (requestId && !('ret' in data)) {
      sendMessage({ requestId, ret: -3, msg: 'No handler: ' + cmdname });
    }
  }

  return { handleMessage, sendMessage };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
