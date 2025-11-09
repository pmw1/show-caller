# Liftover Call Queue - Phase 2 Architecture

## System Overview

Per big-plan.txt, this system bridges WebRTC callers to vMix via persistent SRT connections.

```
[Callers] -> WebRTC -> [Cloudflare App] -> SRT -> [vMix Input 1]
                                        -> SRT -> [vMix Input 2]
```

## Components

### 1. Public Web App (Cloudflare Workers/Pages)
- **Caller Interface** (`/`): WebRTC capture, queue position, program viewer
- **Operator Dashboard** (`/operator`): Queue management, screening
- **WebSocket Server**: Real-time queue updates

### 2. SRT Bridge Service (Cloudflare or Edge Server)
- **FFmpeg Processes**: 2 persistent SRT outputs to vMix
- **WebRTC Ingestion**: Receives caller feeds
- **Stream Switching**: Routes active caller to SRT slot
- **Program Return Feed**: HLS/WebRTC from vMix for waiting callers

### 3. vMix Configuration
- **SRT Input 1**: `srt://[server]:9001?mode=caller&streamid=slot1`
- **SRT Input 2**: `srt://[server]:9002?mode=caller&streamid=slot2`
- **Program Output**: SRT/RTMP to Cloudflare for return feed

### 4. Control System
- **API Endpoints**: For Companion integration
- **State Management**: Track which caller is in which slot
- **Queue Logic**: FIFO with screening approval

## Data Flow

### Caller Journey
1. **Join**: WebRTC getUserMedia() -> Send to server
2. **Queue**: Hold WebRTC connection, show position
3. **Preview Program**: Receive HLS/WebRTC feed while waiting
4. **Go Live**: Route WebRTC to available SRT slot
5. **On Air**: Bidirectional audio/video via SRT
6. **End**: Disconnect WebRTC, free SRT slot

### SRT Slot Management
- **Slot 1 & 2**: Always connected to vMix
- **Idle State**: Black frame or holding graphic
- **Active State**: Current caller's feed
- **Switching**: Crossfade or cut between slots

## Cloudflare Deployment

### Workers Configuration
```javascript
// wrangler.toml
name = "liftover-queue"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
SRT_BRIDGE_URL = "srt-bridge.example.com"
VMIX_HOST = "192.168.1.100"

[[kv_namespaces]]
binding = "QUEUE_STATE"
id = "queue_kv_namespace_id"

[[durable_objects.bindings]]
name = "QUEUE_MANAGER"
class_name = "QueueManager"
```

### SRT Bridge Options

#### Option A: Cloudflare Stream (Limited SRT)
- Use Stream Connect for SRT ingestion
- Limitations: May not support persistent connections

#### Option B: Edge VM with FFmpeg
```bash
# Docker container on edge server
docker run -d \
  -p 9001:9001/udp \
  -p 9002:9002/udp \
  ffmpeg-srt-bridge
```

#### Option C: Local Bridge (Behind Cloudflare Tunnel)
```bash
# Run on same network as vMix
cloudflared tunnel --url localhost:3000
# FFmpeg bridges WebRTC->SRT locally
```

## Implementation Steps

### Phase 2A: SRT Foundation
1. Set up 2 FFmpeg processes for persistent SRT
2. Configure vMix to receive SRT inputs
3. Test slot switching with test patterns

### Phase 2B: WebRTC Bridge
1. Implement WebRTC-to-FFmpeg pipeline
2. Add stream routing logic
3. Handle connection state changes

### Phase 2C: Program Feed
1. Configure vMix program output (SRT/RTMP)
2. Transcode to HLS for web viewing
3. Embed player in caller queue page

### Phase 2D: Production Features
1. Add authentication for operator
2. Implement screening chat
3. Add connection quality monitoring
4. Create Companion HTTP API

## Technical Stack

### Backend
- **Node.js**: API server
- **Socket.io**: WebSocket management
- **FFmpeg**: Media transcoding
- **node-media-server**: RTMP/SRT handling (alternative)

### Frontend
- **WebRTC**: getUserMedia, RTCPeerConnection
- **HLS.js**: Program feed playback
- **Socket.io-client**: Real-time updates

### Infrastructure
- **Cloudflare Workers**: Edge compute
- **Cloudflare KV**: State storage
- **Cloudflare Stream**: Media pipeline (optional)
- **Docker**: Containerized SRT bridge

## Configuration Files Needed

### 1. `srt-bridge/config.json`
```json
{
  "slots": [
    {
      "id": "slot1",
      "srt_output": "srt://vmix.local:9001?streamid=slot1",
      "idle_source": "black.mp4"
    },
    {
      "id": "slot2",
      "srt_output": "srt://vmix.local:9002?streamid=slot2",
      "idle_source": "black.mp4"
    }
  ],
  "program_input": "srt://0.0.0.0:9003?mode=listener"
}
```

### 2. `cloudflare/wrangler.toml`
```toml
name = "liftover-queue"
main = "src/worker.js"
compatibility_date = "2024-01-01"
workers_dev = true
route = "calls.example.com/*"
```

### 3. `docker-compose.yml`
```yaml
version: '3'
services:
  srt-bridge:
    build: ./srt-bridge
    ports:
      - "9001:9001/udp"
      - "9002:9002/udp"
      - "9003:9003/udp"
    environment:
      - VMIX_HOST=192.168.1.100
  
  web-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - SRT_BRIDGE_HOST=srt-bridge
```

## Security Considerations
- TURN servers required for NAT traversal
- API authentication for operator endpoints
- Rate limiting on public endpoints
- SRT encryption for sensitive content

## Next Steps
1. Choose SRT bridge deployment model
2. Set up Cloudflare Workers project
3. Implement FFmpeg WebRTC->SRT pipeline
4. Test with vMix SRT inputs
5. Add program return feed