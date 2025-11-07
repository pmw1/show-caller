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

const app = express();

// Security middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Disable for WebRTC
}));

// Create server (HTTPS in production if certs available)
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

// Caller queue storage
const callerQueue = [];
const activeCallers = new Map();

// vMix configuration
const VMIX_CALLS = [
  { id: 1, inUse: false, assignedCaller: null },
  { id: 2, inUse: false, assignedCaller: null },
  { id: 3, inUse: false, assignedCaller: null }
];

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Caller joins the queue
  socket.on('join-queue', (data) => {
    const caller = {
      id: uuidv4(),
      socketId: socket.id,
      name: data.name || 'Anonymous',
      topic: data.topic || 'No topic provided',
      joinedAt: new Date(),
      status: 'waiting'
    };

    callerQueue.push(caller);
    socket.callerId = caller.id;

    // Send queue position to caller
    socket.emit('queue-update', {
      position: callerQueue.length,
      callerId: caller.id
    });

    // Notify operator of new caller
    io.to('operators').emit('queue-changed', callerQueue);
    
    console.log(`Caller ${caller.name} joined queue with topic: ${caller.topic}`);
  });

  // Operator joins
  socket.on('operator-connect', () => {
    socket.join('operators');
    socket.emit('initial-state', {
      queue: callerQueue,
      vmixCalls: VMIX_CALLS
    });
    console.log('Operator connected');
  });

  // Operator takes caller from queue
  socket.on('take-caller', (callerId) => {
    const callerIndex = callerQueue.findIndex(c => c.id === callerId);
    if (callerIndex === -1) return;

    const caller = callerQueue[callerIndex];
    const availableCall = VMIX_CALLS.find(call => !call.inUse);

    if (!availableCall) {
      socket.emit('error', 'No vMix calls available');
      return;
    }

    // Remove from queue
    callerQueue.splice(callerIndex, 1);

    // Assign to vMix call
    availableCall.inUse = true;
    availableCall.assignedCaller = caller;
    activeCallers.set(callerId, availableCall.id);

    // Update caller status
    caller.status = 'live';
    caller.vmixCallId = availableCall.id;

    // Notify caller to start WebRTC
    const callerSocket = io.sockets.sockets.get(caller.socketId);
    if (callerSocket) {
      callerSocket.emit('go-live', {
        vmixCallId: availableCall.id,
        roomId: `vmix-call-${availableCall.id}`
      });
    }

    // Update all operators
    io.to('operators').emit('queue-changed', callerQueue);
    io.to('operators').emit('vmix-updated', VMIX_CALLS);

    // Update queue positions for remaining callers
    callerQueue.forEach((c, index) => {
      const s = io.sockets.sockets.get(c.socketId);
      if (s) {
        s.emit('queue-update', { position: index + 1 });
      }
    });
  });

  // End a call
  socket.on('end-call', (vmixCallId) => {
    const call = VMIX_CALLS.find(c => c.id === vmixCallId);
    if (call && call.inUse) {
      const caller = call.assignedCaller;
      if (caller) {
        const callerSocket = io.sockets.sockets.get(caller.socketId);
        if (callerSocket) {
          callerSocket.emit('call-ended');
          callerSocket.disconnect();
        }
      }

      call.inUse = false;
      call.assignedCaller = null;
      
      io.to('operators').emit('vmix-updated', VMIX_CALLS);
    }
  });

  // Handle WebRTC signaling
  socket.on('webrtc-offer', (data) => {
    socket.to(data.roomId).emit('webrtc-offer', data);
  });

  socket.on('webrtc-answer', (data) => {
    socket.to(data.roomId).emit('webrtc-answer', data);
  });

  socket.on('webrtc-ice', (data) => {
    socket.to(data.roomId).emit('webrtc-ice', data);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    // Remove from queue if caller disconnects
    if (socket.callerId) {
      const index = callerQueue.findIndex(c => c.id === socket.callerId);
      if (index !== -1) {
        callerQueue.splice(index, 1);
        io.to('operators').emit('queue-changed', callerQueue);
      }

      // Check if caller was active
      if (activeCallers.has(socket.callerId)) {
        const vmixCallId = activeCallers.get(socket.callerId);
        const call = VMIX_CALLS.find(c => c.id === vmixCallId);
        if (call) {
          call.inUse = false;
          call.assignedCaller = null;
          io.to('operators').emit('vmix-updated', VMIX_CALLS);
        }
        activeCallers.delete(socket.callerId);
      }
    }
    console.log('Connection closed:', socket.id);
  });
});

// Serve caller page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'caller.html'));
});

// Serve operator dashboard
app.get('/operator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'operator.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all interfaces for public access

server.listen(PORT, HOST, () => {
  const protocol = process.env.SSL_CERT ? 'https' : 'http';
  console.log(`\n=================================`);
  console.log(`Liftover Call Queue Server`);
  console.log(`=================================`);
  console.log(`Server running on ${protocol}://${HOST}:${PORT}`);
  console.log(`\nLocal URLs:`);
  console.log(`  Callers: ${protocol}://localhost:${PORT}`);
  console.log(`  Operator: ${protocol}://localhost:${PORT}/operator`);
  console.log(`\nFor public access, use one of these methods:`);
  console.log(`  1. ngrok: npm run tunnel`);
  console.log(`  2. Port forwarding: Forward port ${PORT} on your router`);
  console.log(`  3. Cloudflare Tunnel: See setup instructions`);
  console.log(`=================================\n`);
});