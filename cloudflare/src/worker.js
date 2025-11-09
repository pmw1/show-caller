/**
 * Cloudflare Worker for Liftover Call Queue
 * Handles WebRTC signaling and queue management at the edge
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // WebSocket upgrade for Socket.io compatibility
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request, env);
    }

    // Route handling
    switch (url.pathname) {
      case '/':
        return handleCallerPage(request, env);
      
      case '/operator':
        return handleOperatorPage(request, env);
      
      case '/api/status':
        return handleAPIStatus(request, env);
      
      case '/api/next-caller':
        return handleNextCaller(request, env);
      
      case '/api/end-slot':
        return handleEndSlot(request, env);
      
      case '/whip':
        // WHIP endpoint for WebRTC ingestion
        return handleWHIP(request, env);
      
      default:
        return new Response('Not Found', { status: 404 });
    }
  },
};

/**
 * Handle WebSocket connections for real-time updates
 */
async function handleWebSocket(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  // Accept the WebSocket connection
  server.accept();

  // Get or create queue manager durable object
  const id = env.QUEUE_MANAGER.idFromName('main-queue');
  const queueManager = env.QUEUE_MANAGER.get(id);

  // Forward messages between client and durable object
  server.addEventListener('message', async (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case 'join-screening':
        await queueManager.addToScreening(data.payload);
        break;
      
      case 'approve-caller':
        await queueManager.approveCaller(data.payload);
        break;
      
      case 'take-caller':
        await queueManager.takeCaller(data.payload);
        break;
      
      case 'end-call':
        await queueManager.endCall(data.payload);
        break;
    }
  });

  // Return response with WebSocket
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

/**
 * Serve caller page
 */
async function handleCallerPage(request, env) {
  // In production, serve from R2 or KV
  const html = await env.QUEUE_STATE.get('caller-page-html');
  
  return new Response(html || 'Loading...', {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * Serve operator page with authentication
 */
async function handleOperatorPage(request, env) {
  // Check authentication
  const auth = request.headers.get('Authorization');
  if (!auth || !validateAuth(auth, env.OPERATOR_PASSWORD)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Operator"',
      },
    });
  }

  const html = await env.QUEUE_STATE.get('operator-page-html');
  
  return new Response(html || 'Loading...', {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

/**
 * API: Get queue status
 */
async function handleAPIStatus(request, env) {
  const id = env.QUEUE_MANAGER.idFromName('main-queue');
  const queueManager = env.QUEUE_MANAGER.get(id);
  const status = await queueManager.getStatus();

  return new Response(JSON.stringify(status), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * API: Take next caller (for Companion)
 */
async function handleNextCaller(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const id = env.QUEUE_MANAGER.idFromName('main-queue');
  const queueManager = env.QUEUE_MANAGER.get(id);
  const result = await queueManager.takeNextCaller();

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * WHIP endpoint for WebRTC ingestion
 */
async function handleWHIP(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const offer = await request.text();
  
  // Forward to SRT bridge service
  const bridgeResponse = await fetch(`https://${env.SRT_BRIDGE_URL}/whip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
    },
    body: offer,
  });

  const answer = await bridgeResponse.text();

  return new Response(answer, {
    headers: {
      'Content-Type': 'application/sdp',
      'Location': `/whip/${crypto.randomUUID()}`,
    },
    status: 201,
  });
}

/**
 * Validate basic auth
 */
function validateAuth(auth, password) {
  try {
    const [scheme, encoded] = auth.split(' ');
    if (scheme !== 'Basic') return false;
    
    const decoded = atob(encoded);
    const [user, pass] = decoded.split(':');
    
    return pass === password;
  } catch {
    return false;
  }
}

/**
 * Queue Manager Durable Object
 */
export class QueueManager {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.screeningQueue = [];
    this.mainQueue = [];
    this.activeSlots = {
      slot1: null,
      slot2: null,
    };
  }

  async fetch(request) {
    // Handle Durable Object requests
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/status':
        return this.getStatus();
      case '/add-screening':
        return this.addToScreening(await request.json());
      case '/approve':
        return this.approveCaller(await request.json());
      case '/take':
        return this.takeCaller(await request.json());
      case '/end':
        return this.endCall(await request.json());
      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  async getStatus() {
    return new Response(JSON.stringify({
      screening: this.screeningQueue.length,
      queued: this.mainQueue.length,
      slots: this.activeSlots,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async addToScreening(caller) {
    caller.id = crypto.randomUUID();
    caller.joinedAt = Date.now();
    caller.status = 'screening';
    
    this.screeningQueue.push(caller);
    await this.state.storage.put('screeningQueue', this.screeningQueue);
    
    // Broadcast update
    this.broadcast({
      type: 'screening-queue-changed',
      data: this.screeningQueue,
    });

    return new Response(JSON.stringify({ success: true, callerId: caller.id }));
  }

  async approveCaller({ callerId }) {
    const index = this.screeningQueue.findIndex(c => c.id === callerId);
    if (index === -1) {
      return new Response('Caller not found', { status: 404 });
    }

    const caller = this.screeningQueue.splice(index, 1)[0];
    caller.status = 'queued';
    caller.approvedAt = Date.now();
    
    this.mainQueue.push(caller);
    
    await this.state.storage.put('screeningQueue', this.screeningQueue);
    await this.state.storage.put('mainQueue', this.mainQueue);

    // Broadcast updates
    this.broadcast({
      type: 'screening-queue-changed',
      data: this.screeningQueue,
    });
    this.broadcast({
      type: 'main-queue-changed',
      data: this.mainQueue,
    });

    return new Response(JSON.stringify({ success: true }));
  }

  async takeCaller({ callerId }) {
    const index = this.mainQueue.findIndex(c => c.id === callerId);
    if (index === -1) {
      return new Response('Caller not found', { status: 404 });
    }

    // Find available slot
    const slot = this.activeSlots.slot1 === null ? 'slot1' : 
                 this.activeSlots.slot2 === null ? 'slot2' : null;
    
    if (!slot) {
      return new Response('No available slots', { status: 503 });
    }

    const caller = this.mainQueue.splice(index, 1)[0];
    caller.status = 'live';
    caller.slot = slot;
    caller.liveAt = Date.now();
    
    this.activeSlots[slot] = caller;
    
    await this.state.storage.put('mainQueue', this.mainQueue);
    await this.state.storage.put('activeSlots', this.activeSlots);

    // Trigger SRT bridge
    await this.triggerSRTBridge(caller, slot);

    // Broadcast updates
    this.broadcast({
      type: 'main-queue-changed',
      data: this.mainQueue,
    });
    this.broadcast({
      type: 'slots-changed',
      data: this.activeSlots,
    });

    return new Response(JSON.stringify({ success: true, slot }));
  }

  async triggerSRTBridge(caller, slot) {
    // Signal SRT bridge to switch slot to this caller
    const srtUrl = slot === 'slot1' ? this.env.VMIX_SRT_SLOT1 : this.env.VMIX_SRT_SLOT2;
    
    await fetch(`https://${this.env.SRT_BRIDGE_URL}/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callerId: caller.id,
        slot: slot,
        srtUrl: srtUrl,
      }),
    });
  }

  broadcast(message) {
    // In production, use WebSocket connections to broadcast
    // For now, store in KV for polling
    this.env.QUEUE_STATE.put('last-update', JSON.stringify({
      ...message,
      timestamp: Date.now(),
    }));
  }
}