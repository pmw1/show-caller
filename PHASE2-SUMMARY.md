# Liftover Call Queue - Phase 2 Implementation Summary

## What's Been Reconfigured

Per `big-plan.txt` requirements, the system has been redesigned from Phase 1 prototype to Phase 2 architecture:

### Key Changes from Phase 1

1. **Two SRT Slots Instead of Three WebRTC**
   - OLD: 3 vMix call slots managed via WebRTC
   - NEW: 2 persistent SRT connections to vMix (per Josh's requirements)

2. **Screening Queue Added**
   - OLD: Direct join to main queue
   - NEW: Screening queue → Approval → Main queue → Live

3. **Program Feed for Waiting Callers**
   - OLD: No program viewing while waiting
   - NEW: HLS/WebRTC feed so callers can watch the show

4. **SRT Bridge Architecture**
   - OLD: Direct WebRTC to vMix (not possible)
   - NEW: WebRTC → FFmpeg → SRT → vMix pipeline

5. **Cloudflare Deployment Ready**
   - OLD: Basic Node.js server
   - NEW: Cloudflare Workers + Durable Objects + Edge SRT bridge

## New File Structure

```
/root/show-caller/
├── server-v2.js              # Phase 2 server with SRT support
├── srt-bridge/
│   ├── srt-manager.js        # Manages 2 persistent SRT connections
│   ├── webrtc-bridge.js      # WebRTC to SRT conversion
│   └── assets/
│       └── idle.mp4          # Idle video for empty slots
├── cloudflare/
│   ├── wrangler.toml         # Cloudflare deployment config
│   └── src/
│       └── worker.js         # Edge worker with queue management
├── public/
│   ├── caller-v2.html        # Updated caller interface
│   └── operator-v2.html      # Updated operator dashboard
├── deploy-phase2.sh          # Deployment script
└── ARCHITECTURE.md           # Technical architecture details
```

## How It Works Now

### Video Caller Flow (Matching big-plan.txt)
1. Caller visits public URL
2. Enters name/topic → Screening queue
3. Operator approves → Main queue  
4. Watches program feed while waiting
5. Host takes caller → Assigned to SRT slot 1 or 2
6. WebRTC stream converted to SRT for vMix
7. Live on air through persistent SRT connection
8. Returns to idle when done

### Technical Flow
```
[WebRTC Caller] → [Cloudflare Worker] → [WebRTC-to-SRT Bridge] → [vMix SRT Input]
                          ↓
                  [Queue Management]
                          ↓
                  [Operator Control]
```

## Deployment Options

### Option A: Local Bridge (Recommended for Testing)
- Cloudflare Workers for web interface
- Local SRT bridge on same network as vMix
- Cloudflare Tunnel for public access

### Option B: Edge Server Bridge
- Cloudflare Workers for web interface  
- Docker container on edge server for SRT bridge
- Direct SRT connections to vMix

### Option C: Full Cloudflare (Future)
- Cloudflare Stream for WebRTC ingestion
- Cloudflare Workers for everything
- Requires Cloudflare Stream SRT support

## vMix Configuration Required

1. **Add SRT Input 1**
   - Type: SRT Caller
   - URL: `srt://0.0.0.0:9001?mode=listener`
   - Name: "Liftover Slot 1"

2. **Add SRT Input 2**
   - Type: SRT Caller
   - URL: `srt://0.0.0.0:9002?mode=listener`
   - Name: "Liftover Slot 2"

3. **Program Output for Return Feed**
   - Stream to: RTMP or SRT server
   - Transcode to HLS for web viewing

## Companion Integration

HTTP API endpoints for StreamDeck control:

```
GET  /api/status          # Queue counts and slot status
POST /api/next-caller     # Take next caller from queue
POST /api/end-slot/1      # End call in slot 1
POST /api/end-slot/2      # End call in slot 2
```

## Next Steps for Production

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Test locally**:
   ```bash
   node server-v2.js
   ```

3. **Deploy to Cloudflare**:
   ```bash
   chmod +x deploy-phase2.sh
   ./deploy-phase2.sh
   ```

4. **Configure vMix** with SRT inputs

5. **Set up Companion** with HTTP API triggers

## What's Still Missing (Phase 3 & 4)

Per big-plan.txt, these are still needed:

### Phase 3 - Asterisk Integration
- Telephone call-in path
- IVR screening
- SIP to vMix audio
- Mix-minus routing

### Phase 4 - Production Hardening  
- Enhanced Companion control
- Multi-host support
- Analytics and recording
- Custom branding

## Critical Notes

- **SRT is required** - vMix must support SRT input
- **HTTPS required** - WebRTC needs secure context
- **TURN servers needed** - For NAT traversal
- **FFmpeg required** - For WebRTC to SRT conversion

## Status

✅ Phase 1: Basic prototype (COMPLETE)
🚧 Phase 2: SRT implementation (READY FOR TESTING)
⏳ Phase 3: Asterisk integration (NOT STARTED)
⏳ Phase 4: Production features (NOT STARTED)

**This implementation now aligns with big-plan.txt requirements for Phase 2**