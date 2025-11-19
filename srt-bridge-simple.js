/**
 * Simplified SRT Bridge for Liftover Queue
 * Uses FFmpeg directly without complex WebRTC libraries
 */

const express = require('express');
const { spawn } = require('child_process');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Two SRT slots as per big-plan.txt
const srtSlots = {
  slot1: {
    port: 9001,
    process: null,
    active: false
  },
  slot2: {
    port: 9002, 
    process: null,
    active: false
  }
};

// Initialize SRT outputs with test pattern
function initializeSRT() {
  console.log('Initializing SRT outputs...');
  
  // Start test pattern for slot 1
  srtSlots.slot1.process = spawn('ffmpeg', [
    '-re',
    '-f', 'lavfi',
    '-i', 'testsrc=size=1920x1080:rate=30',
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', '4000k',
    '-c:a', 'aac',
    '-f', 'mpegts',
    `srt://0.0.0.0:${srtSlots.slot1.port}?mode=listener`
  ]);

  // Start test pattern for slot 2  
  srtSlots.slot2.process = spawn('ffmpeg', [
    '-re',
    '-f', 'lavfi',
    '-i', 'testsrc2=size=1920x1080:rate=30',
    '-f', 'lavfi',
    '-i', 'sine=frequency=500',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', '4000k',
    '-c:a', 'aac',
    '-f', 'mpegts',
    `srt://0.0.0.0:${srtSlots.slot2.port}?mode=listener`
  ]);

  console.log('SRT outputs initialized:');
  console.log(`  Slot 1: srt://0.0.0.0:9001`);
  console.log(`  Slot 2: srt://0.0.0.0:9002`);
}

// API endpoint to switch caller to slot
app.post('/api/switch-slot/:slotId', (req, res) => {
  const { slotId } = req.params;
  const { callerId, streamUrl } = req.body;
  
  if (!srtSlots[slotId]) {
    return res.status(400).json({ error: 'Invalid slot' });
  }

  // In production, this would switch the FFmpeg input
  // For now, just track the state
  srtSlots[slotId].active = true;
  srtSlots[slotId].callerId = callerId;
  
  console.log(`Switched ${slotId} to caller ${callerId}`);
  res.json({ success: true });
});

// API endpoint to return slot to idle
app.post('/api/idle-slot/:slotId', (req, res) => {
  const { slotId } = req.params;
  
  if (!srtSlots[slotId]) {
    return res.status(400).json({ error: 'Invalid slot' });
  }

  srtSlots[slotId].active = false;
  srtSlots[slotId].callerId = null;
  
  console.log(`Returned ${slotId} to idle`);
  res.json({ success: true });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    slot1: {
      port: srtSlots.slot1.port,
      active: srtSlots.slot1.active,
      callerId: srtSlots.slot1.callerId
    },
    slot2: {
      port: srtSlots.slot2.port,
      active: srtSlots.slot2.active,
      callerId: srtSlots.slot2.callerId
    }
  });
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.SRT_BRIDGE_PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n================================`);
  console.log(`Liftover SRT Bridge`);
  console.log(`================================`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`\nSRT Outputs for vMix:`);
  console.log(`  Slot 1: srt://YOUR_IP:9001`);
  console.log(`  Slot 2: srt://YOUR_IP:9002`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET  /api/status`);
  console.log(`  POST /api/switch-slot/:slotId`);
  console.log(`  POST /api/idle-slot/:slotId`);
  console.log(`================================\n`);
  
  // Initialize SRT outputs
  initializeSRT();
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down SRT bridge...');
  if (srtSlots.slot1.process) srtSlots.slot1.process.kill();
  if (srtSlots.slot2.process) srtSlots.slot2.process.kill();
  process.exit(0);
});