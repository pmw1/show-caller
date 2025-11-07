# Liftover Call Queue

**⚠️ IMPORTANT: See big-plan.txt for the canonical project requirements and direction.**
**All information in this README is subordinate to big-plan.txt**

A streamlined web-based caller queue system for vMix that eliminates complex URL management. Callers join through a single URL, describe their topic, wait in queue, and get connected to vMix when ready.

**NOTE: Current implementation is Phase 1 only. See big-plan.txt for full requirements including SRT bridging and Asterisk integration.**

## Features

- **Single URL for all callers** - No more managing multiple vMix call URLs
- **Topic submission** - Callers can describe what they want to talk about
- **Visual queue** - Callers see their position in line
- **Media testing** - Built-in camera/mic testing while waiting
- **Operator dashboard** - Manage the queue and assign callers to vMix calls
- **Real-time updates** - WebSocket-based for instant queue updates
- **3 simultaneous calls** - Support for your three vMix video call inputs

## Installation

```bash
npm install
```

## Public Access Setup

### Option 1: ngrok (Easiest)
```bash
# Install dependencies first
npm install

# Start the server
npm start

# In another terminal, create tunnel
npm run tunnel
# Or manually: ngrok http 3000
```
Share the ngrok URL with callers.

### Option 2: Cloudflare Tunnel (Best for Production)
1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
2. Create tunnel:
```bash
cloudflared tunnel create liftover-calls
cloudflared tunnel route dns liftover-calls calls.yourdomain.com
```
3. Create config file `~/.cloudflared/config.yml`:
```yaml
tunnel: <TUNNEL_ID>
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: calls.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```
4. Run tunnel:
```bash
cloudflared tunnel run liftover-calls
```

### Option 3: Port Forwarding
1. Forward port 3000 on your router to your machine
2. Use your public IP: `http://YOUR_PUBLIC_IP:3000`

## Usage

1. Start the server:
```bash
npm start
```

2. Access the system:
- **Callers**: `http://localhost:3000`
- **Operator Dashboard**: `http://localhost:3000/operator`

3. Share the caller URL with your audience

## vMix Integration

The system manages three vMix call slots. When an operator takes a caller from the queue:

1. The caller is assigned to an available vMix call slot (1, 2, or 3)
2. WebRTC connection is established
3. The caller appears in the corresponding vMix video call input
4. Operator can end the call when finished

## How It Works

### For Callers
1. Visit the main URL
2. Enter name and topic
3. Join the queue
4. Test camera/mic while waiting
5. Automatically connect when selected

### For Operators
1. Open the operator dashboard
2. See all waiting callers with their topics
3. Click "Take Call" to bring someone on
4. Manage active calls
5. End calls when finished

## WebRTC Configuration

The system uses WebRTC for video/audio transmission. It includes:
- STUN server configuration for NAT traversal
- Automatic ICE candidate exchange
- Audio visualization for mic testing
- Camera switching support

## Environment Variables

Create a `.env` file to customize:

```env
PORT=3000

# For HTTPS (optional)
SSL_CERT=/path/to/cert.pem
SSL_KEY=/path/to/key.pem

# Public URL (for WebRTC)
PUBLIC_URL=https://calls.yourdomain.com
```

## Requirements

- Node.js 14+
- Modern browser with WebRTC support
- vMix with video call inputs configured

## Security Notes

- Add authentication to the operator dashboard in production
- Use HTTPS for secure WebRTC connections
- Configure CORS settings as needed

## Development

```bash
npm run dev  # Runs with nodemon for auto-restart
```