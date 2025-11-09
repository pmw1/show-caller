/**
 * SRT Bridge Manager - Maintains 2 persistent SRT connections to vMix
 * Per big-plan.txt requirements
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class SRTManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.slots = {
      slot1: {
        id: 'slot1',
        process: null,
        active: false,
        currentCaller: null,
        srtUrl: config.slot1_srt_url || 'srt://localhost:9001?streamid=slot1'
      },
      slot2: {
        id: 'slot2',
        process: null,
        active: false,
        currentCaller: null,
        srtUrl: config.slot2_srt_url || 'srt://localhost:9002?streamid=slot2'
      }
    };
    
    // Idle video source (black frame or holding graphic)
    this.idleSource = config.idleSource || path.join(__dirname, 'assets', 'idle.mp4');
    this.ensureIdleSource();
  }

  // Create idle video if it doesn't exist
  ensureIdleSource() {
    const dir = path.dirname(this.idleSource);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (!fs.existsSync(this.idleSource)) {
      // Generate 10 second black video with silence
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'color=c=black:s=1920x1080:r=30',
        '-f', 'lavfi', 
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-t', '10',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        this.idleSource
      ]);
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('Idle source created successfully');
        }
      });
    }
  }

  // Initialize both SRT slots with idle feed
  async initialize() {
    console.log('Initializing SRT connections to vMix...');
    
    for (const slotId in this.slots) {
      await this.startIdleStream(slotId);
    }
    
    this.emit('initialized');
    console.log('SRT Manager initialized with 2 persistent connections');
  }

  // Start idle stream for a slot
  async startIdleStream(slotId) {
    const slot = this.slots[slotId];
    
    // Kill existing process if any
    if (slot.process) {
      slot.process.kill();
    }

    // FFmpeg command to stream idle video to SRT
    const args = [
      '-re', // Real-time streaming
      '-stream_loop', '-1', // Loop indefinitely
      '-i', this.idleSource,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-b:v', '4000k',
      '-maxrate', '4000k',
      '-bufsize', '8000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60', // GOP size
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-f', 'mpegts',
      slot.srtUrl
    ];

    slot.process = spawn('ffmpeg', args);
    slot.active = false;
    slot.currentCaller = null;

    slot.process.on('error', (err) => {
      console.error(`SRT ${slotId} error:`, err);
      this.emit('slot-error', { slotId, error: err });
      // Restart after error
      setTimeout(() => this.startIdleStream(slotId), 5000);
    });

    slot.process.stderr.on('data', (data) => {
      // Log FFmpeg output for debugging
      if (this.config.debug) {
        console.log(`[${slotId}]`, data.toString());
      }
    });

    console.log(`SRT ${slotId} started with idle stream to ${slot.srtUrl}`);
  }

  // Switch a slot to active caller's WebRTC stream
  async switchToCallerStream(slotId, webrtcStreamUrl, callerId) {
    const slot = this.slots[slotId];
    
    if (!slot) {
      throw new Error(`Invalid slot: ${slotId}`);
    }

    console.log(`Switching ${slotId} to caller ${callerId}`);

    // Kill idle stream
    if (slot.process) {
      slot.process.kill();
    }

    // FFmpeg command to convert WebRTC to SRT
    const args = [
      '-i', webrtcStreamUrl, // WebRTC input (via WHIP or pipe)
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-b:v', '4000k',
      '-maxrate', '4000k',
      '-bufsize', '8000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-f', 'mpegts',
      slot.srtUrl
    ];

    slot.process = spawn('ffmpeg', args);
    slot.active = true;
    slot.currentCaller = callerId;

    slot.process.on('error', (err) => {
      console.error(`SRT ${slotId} caller stream error:`, err);
      this.emit('slot-error', { slotId, error: err });
      // Return to idle on error
      this.returnToIdle(slotId);
    });

    slot.process.on('close', (code) => {
      console.log(`SRT ${slotId} caller stream ended with code ${code}`);
      if (slot.active) {
        this.returnToIdle(slotId);
      }
    });

    this.emit('slot-activated', { slotId, callerId });
    return slot;
  }

  // Return slot to idle stream
  async returnToIdle(slotId) {
    const slot = this.slots[slotId];
    
    if (!slot) return;

    console.log(`Returning ${slotId} to idle`);
    
    const previousCaller = slot.currentCaller;
    await this.startIdleStream(slotId);
    
    this.emit('slot-idle', { slotId, previousCaller });
  }

  // Get available slot
  getAvailableSlot() {
    for (const slotId in this.slots) {
      if (!this.slots[slotId].active) {
        return slotId;
      }
    }
    return null;
  }

  // Get slot status
  getStatus() {
    const status = {};
    for (const slotId in this.slots) {
      const slot = this.slots[slotId];
      status[slotId] = {
        active: slot.active,
        currentCaller: slot.currentCaller
      };
    }
    return status;
  }

  // Cleanup on shutdown
  async shutdown() {
    console.log('Shutting down SRT Manager...');
    
    for (const slotId in this.slots) {
      const slot = this.slots[slotId];
      if (slot.process) {
        slot.process.kill();
      }
    }
  }
}

module.exports = SRTManager;