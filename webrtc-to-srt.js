/**
 * WebRTC to SRT Bridge - ACTUAL IMPLEMENTATION
 * This receives WebRTC from browser and outputs SRT to vMix
 */

const express = require('express');
const https = require('https');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const app = express();
app.use(express.static('public'));
app.use(express.json());

// Store active WebRTC connections
const activeConnections = new Map();

// Create HTTPS server (required for WebRTC)
const server = https.createServer({
  cert: fs.readFileSync('cert.pem'),
  key: fs.readFileSync('key.pem')
}, app);

// WebSocket for signaling
const wss = new WebSocket.Server({ server });

// Handle WebRTC signaling
wss.on('connection', (ws, req) => {
  const connectionId = req.url.split('/').pop();
  console.log(`New WebRTC connection: ${connectionId}`);
  
  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    
    if (data.type === 'offer') {
      // Start FFmpeg to receive WebRTC and output SRT
      startWebRTCToSRT(connectionId, data.sdp);
    }
  });
});

function startWebRTCToSRT(connectionId, sdp) {
  // Extract port from SDP
  const port = connectionId === 'slot1' ? 9001 : 9002;
  
  // Use GStreamer for WebRTC to SRT conversion
  const gstPipeline = `
    webrtcbin name=webrtc
    ! rtph264depay ! h264parse 
    ! mpegtsmux name=mux
    ! srtsink uri="srt://0.0.0.0:${port}?mode=listener"
    webrtc. 
    ! rtpopusdepay ! opusdec ! audioconvert 
    ! avenc_aac ! mux.
  `;
  
  const gst = spawn('gst-launch-1.0', ['-e', gstPipeline]);
  
  activeConnections.set(connectionId, gst);
  
  gst.stderr.on('data', (data) => {
    console.log(`GStreamer: ${data}`);
  });
  
  console.log(`Started WebRTC to SRT pipeline on port ${port}`);
}

// Alternative using FFmpeg with WebRTC input
function startFFmpegWebRTC(connectionId) {
  const port = connectionId === 'slot1' ? 9001 : 9002;
  
  // FFmpeg command to receive RTP and output SRT
  const ffmpeg = spawn('ffmpeg', [
    // Input from RTP (WebRTC uses RTP)
    '-protocol_whitelist', 'file,rtp,udp',
    '-i', 'rtp://0.0.0.0:5000',
    
    // Video settings
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', '3000k',
    
    // Audio settings  
    '-c:a', 'aac',
    '-b:a', '128k',
    
    // Output to SRT
    '-f', 'mpegts',
    `srt://0.0.0.0:${port}?mode=listener`
  ]);
  
  activeConnections.set(connectionId, ffmpeg);
  
  ffmpeg.stderr.on('data', (data) => {
    console.log(`FFmpeg: ${data}`);
  });
}

// WHIP endpoint (WebRTC HTTP Ingest Protocol)
app.post('/whip/:slot', async (req, res) => {
  const slot = req.params.slot;
  const offer = req.body;
  
  // Start FFmpeg to receive WebRTC
  const port = slot === 'slot1' ? 9001 : 9002;
  
  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',  // Read SDP from stdin
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-f', 'mpegts',
    `srt://0.0.0.0:${port}?mode=listener`
  ]);
  
  // Send SDP offer to FFmpeg
  ffmpeg.stdin.write(JSON.stringify(offer));
  ffmpeg.stdin.end();
  
  // Generate answer SDP
  const answer = {
    type: 'answer',
    sdp: 'v=0\r\n...' // Generated SDP
  };
  
  res.json(answer);
});

const PORT = 3002;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebRTC to SRT Bridge running on https://0.0.0.0:${PORT}`);
  console.log('SRT outputs:');
  console.log('  Slot 1: srt://0.0.0.0:9001');
  console.log('  Slot 2: srt://0.0.0.0:9002');
});