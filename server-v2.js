/**
 * Liftover Call Queue - Phase 2 Server
 * Implements big-plan.txt requirements with 2 SRT slots
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Import SRT Manager for persistent vMix connections
const SRTManager = require('./srt-bridge/srt-manager');

const app = express();

// Security middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Disable for WebRTC
}));

// Create server
let server;
if (process.env.SSL_CERT && process.env.SSL_KEY) {
  const privateKey = fs.readFileSync(process.env.SSL_KEY, 'utf8');
  const certificate = fs.readFileSync(process.env.SSL_CERT, 'utf8');
  const credentials = { key: privateKey, cert: certificate };
  server = https.createServer(credentials, app);
} else {
  server = http.createServer(app);
}

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));
app.use(express.json());

// Initialize SRT Manager with 2 persistent slots (per big-plan.txt)
const srtManager = new SRTManager({
  slot1_srt_url: process.env.VMIX_SRT_SLOT1 || 'srt://localhost:9001?streamid=slot1',
  slot2_srt_url: process.env.VMIX_SRT_SLOT2 || 'srt://localhost:9002?streamid=slot2',
  idleSource: path.join(__dirname, 'srt-bridge', 'assets', 'idle.mp4'),
  debug: process.env.DEBUG === 'true'
});

// Caller queue management
const callerQueue = [];
const screeningQueue = []; // Pre-screening queue
const activeSlots = {
  slot1: null,
  slot2: null
};

// Program feed URL for waiting callers (HLS or WebRTC)
const PROGRAM_FEED_URL = process.env.PROGRAM_FEED_URL || 'https://stream.example.com/program.m3u8';

// WebRTC peer connections for active callers
const peerConnections = new Map();

// Initialize SRT connections on startup
srtManager.initialize().then(() => {
  console.log('SRT connections established with vMix');
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Caller joins the screening queue
  socket.on('join-screening', (data) => {
    const caller = {
      id: uuidv4(),
      socketId: socket.id,
      name: data.name || 'Anonymous',
      topic: data.topic || 'No topic provided',
      joinedAt: new Date(),
      status: 'screening',
      approved: false
    };

    screeningQueue.push(caller);
    socket.callerId = caller.id;

    // Send initial response
    socket.emit('screening-joined', {
      callerId: caller.id,
      programFeedUrl: PROGRAM_FEED_URL // So they can watch while waiting
    });

    // Notify operators of new caller for screening
    io.to('operators').emit('screening-queue-changed', screeningQueue);
    
    console.log(`Caller ${caller.name} joined screening with topic: ${caller.topic}`);
  });

  // Operator approves caller from screening to main queue
  socket.on('approve-caller', (callerId) => {
    const callerIndex = screeningQueue.findIndex(c => c.id === callerId);
    if (callerIndex === -1) return;

    const caller = screeningQueue[callerIndex];
    caller.status = 'waiting';
    caller.approved = true;
    
    // Move from screening to main queue
    screeningQueue.splice(callerIndex, 1);
    callerQueue.push(caller);

    // Notify caller they're approved
    const callerSocket = io.sockets.sockets.get(caller.socketId);
    if (callerSocket) {
      callerSocket.emit('approved', {
        position: callerQueue.length
      });
    }

    // Update both queues for operators
    io.to('operators').emit('screening-queue-changed', screeningQueue);
    io.to('operators').emit('main-queue-changed', callerQueue);
  });

  // Operator connects
  socket.on('operator-connect', () => {
    socket.join('operators');
    socket.emit('initial-state', {
      screeningQueue: screeningQueue,
      mainQueue: callerQueue,
      activeSlots: srtManager.getStatus(),
      programFeedUrl: PROGRAM_FEED_URL
    });
    console.log('Operator connected');
  });

  // Operator takes caller from main queue to live (2 slots only per big-plan.txt)
  socket.on('take-caller', async (callerId) => {
    const callerIndex = callerQueue.findIndex(c => c.id === callerId);
    if (callerIndex === -1) return;

    // Check for available SRT slot
    const availableSlot = srtManager.getAvailableSlot();
    if (!availableSlot) {
      socket.emit('error', 'Both SRT slots are in use');
      return;
    }

    const caller = callerQueue[callerIndex];
    callerQueue.splice(callerIndex, 1);

    // Update caller status
    caller.status = 'live';
    caller.slot = availableSlot;
    activeSlots[availableSlot] = caller;

    // Notify caller to start WebRTC for SRT bridge
    const callerSocket = io.sockets.sockets.get(caller.socketId);
    if (callerSocket) {
      callerSocket.emit('go-live', {
        slot: availableSlot,
        stunServers: getSTUNServers(),
        turnServers: getTURNServers()
      });
    }

    // Update all operators
    io.to('operators').emit('main-queue-changed', callerQueue);
    io.to('operators').emit('slots-changed', srtManager.getStatus());

    // Update queue positions
    updateQueuePositions();
  });

  // WebRTC signaling for SRT bridge
  socket.on('webrtc-offer', async (data) => {
    const caller = [...screeningQueue, ...callerQueue, ...Object.values(activeSlots)]
      .find(c => c && c.socketId === socket.id);
    
    if (!caller || !caller.slot) return;

    // Store peer connection for this caller
    peerConnections.set(caller.id, {
      offer: data.offer,
      socketId: socket.id
    });

    // In production, this would connect to the SRT bridge service
    // For now, simulate the connection
    const answer = await createWebRTCAnswer(data.offer);
    socket.emit('webrtc-answer', { answer });

    // Switch SRT slot to this caller's stream
    // In production: Pass WebRTC stream to FFmpeg for SRT conversion
    const webrtcStreamUrl = `webrtc://${socket.id}`; // Placeholder
    await srtManager.switchToCallerStream(caller.slot, webrtcStreamUrl, caller.id);
  });

  // End a call and return slot to idle
  socket.on('end-call', async (slotId) => {
    const caller = activeSlots[slotId];
    if (!caller) return;

    // Return SRT slot to idle
    await srtManager.returnToIdle(slotId);
    
    // Notify caller
    const callerSocket = io.sockets.sockets.get(caller.socketId);
    if (callerSocket) {
      callerSocket.emit('call-ended');
      callerSocket.disconnect();
    }

    // Clean up
    activeSlots[slotId] = null;
    peerConnections.delete(caller.id);

    io.to('operators').emit('slots-changed', srtManager.getStatus());
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    // Remove from screening queue
    const screeningIndex = screeningQueue.findIndex(c => c.socketId === socket.id);
    if (screeningIndex !== -1) {
      screeningQueue.splice(screeningIndex, 1);
      io.to('operators').emit('screening-queue-changed', screeningQueue);
    }

    // Remove from main queue
    const queueIndex = callerQueue.findIndex(c => c.socketId === socket.id);
    if (queueIndex !== -1) {
      callerQueue.splice(queueIndex, 1);
      io.to('operators').emit('main-queue-changed', callerQueue);
      updateQueuePositions();
    }

    // Check if was active
    for (const slotId in activeSlots) {
      if (activeSlots[slotId] && activeSlots[slotId].socketId === socket.id) {
        await srtManager.returnToIdle(slotId);
        activeSlots[slotId] = null;
        io.to('operators').emit('slots-changed', srtManager.getStatus());
      }
    }

    console.log('Connection closed:', socket.id);
  });
});

// Helper functions
function updateQueuePositions() {
  callerQueue.forEach((caller, index) => {
    const socket = io.sockets.sockets.get(caller.socketId);
    if (socket) {
      socket.emit('queue-update', { position: index + 1 });
    }
  });
}

function getSTUNServers() {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
}

function getTURNServers() {
  // In production, use your own TURN servers
  return [
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];
}

async function createWebRTCAnswer(offer) {
  // Placeholder - in production, this would create actual WebRTC answer
  return {
    type: 'answer',
    sdp: 'placeholder_sdp'
  };
}

// API endpoints for Companion integration
app.get('/api/status', (req, res) => {
  res.json({
    screening: screeningQueue.length,
    queued: callerQueue.length,
    slots: srtManager.getStatus()
  });
});

app.post('/api/next-caller', (req, res) => {
  if (callerQueue.length === 0) {
    return res.status(404).json({ error: 'No callers in queue' });
  }

  const availableSlot = srtManager.getAvailableSlot();
  if (!availableSlot) {
    return res.status(503).json({ error: 'No available slots' });
  }

  const nextCaller = callerQueue[0];
  io.emit('take-caller', nextCaller.id);
  
  res.json({ 
    success: true, 
    caller: nextCaller.name,
    slot: availableSlot 
  });
});

app.post('/api/end-slot/:slotId', (req, res) => {
  const { slotId } = req.params;
  io.emit('end-call', slotId);
  res.json({ success: true });
});

// Serve pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'caller-v2.html'));
});

app.get('/operator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'operator-v2.html'));
});

// Cleanup on shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await srtManager.shutdown();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  const protocol = process.env.SSL_CERT ? 'https' : 'http';
  console.log(`\n=================================`);
  console.log(`Liftover Call Queue - Phase 2`);
  console.log(`=================================`);
  console.log(`Server running on ${protocol}://${HOST}:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  Callers: ${protocol}://localhost:${PORT}`);
  console.log(`  Operator: ${protocol}://localhost:${PORT}/operator`);
  console.log(`\nSRT Outputs to vMix:`);
  console.log(`  Slot 1: ${process.env.VMIX_SRT_SLOT1 || 'srt://localhost:9001'}`);
  console.log(`  Slot 2: ${process.env.VMIX_SRT_SLOT2 || 'srt://localhost:9002'}`);
  console.log(`\nCompanion API:`);
  console.log(`  GET  /api/status`);
  console.log(`  POST /api/next-caller`);
  console.log(`  POST /api/end-slot/:slotId`);
  console.log(`=================================\n`);
});