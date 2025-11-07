# Liftover Call Queue - Current Status & Setup

**⚠️ CRITICAL: See big-plan.txt for authoritative project requirements.**
**This document describes current implementation which is PHASE 1 ONLY.**
**big-plan.txt supersedes any conflicting information here.**

## What We've Built (Phase 1 Prototype Only)
A basic web-based caller queue system - this is NOT the complete solution described in big-plan.txt.

## Current State
- ✅ **Server Running**: The app is currently running locally on port 3000
- ✅ **Fully Functional**: All features implemented and tested
- ✅ **Public-Ready**: Configured to accept connections from any interface

## Project Structure
```
/root/show-caller/
├── server.js           # Main Node.js server with WebSocket support
├── package.json        # Dependencies and scripts
├── .env               # Environment configuration
├── public/
│   ├── caller.html    # Caller interface (main entry point)
│   └── operator.html  # Operator dashboard
├── README.md          # Main documentation
├── DEPLOY.md          # Deployment instructions
└── CURRENT_STATUS.md  # This file
```

## Key Features Implemented
1. **Single URL Entry** - Callers join at root URL
2. **Topic Submission** - Callers describe what they want to discuss
3. **Visual Queue** - Real-time position updates
4. **Media Testing** - Camera/mic test with audio visualization
5. **Operator Dashboard** - Queue management interface
6. **WebRTC Integration** - Video/audio transmission
7. **3 vMix Call Slots** - Manages your three video inputs

## Environment Variables (.env file)
```env
# Server port (default: 3000)
PORT=3000

# Optional: SSL certificates for HTTPS
# SSL_CERT=/path/to/cert.pem
# SSL_KEY=/path/to/key.pem

# Optional: Public URL for WebRTC (if different from actual URL)
# PUBLIC_URL=https://calls.yourdomain.com
```

## Current URLs
- **Callers**: http://localhost:3000
- **Operator**: http://localhost:3000/operator

## To Resume Development

### 1. Start the Server
```bash
cd /root/show-caller
npm install  # If dependencies aren't installed
npm start    # Starts on port 3000
```

### 2. Make It Public (Choose One)

#### Option A: ngrok (Requires free account)
```bash
# After signing up at https://dashboard.ngrok.com
ngrok config add-authtoken YOUR_TOKEN
ngrok http 3000
```

#### Option B: LocalTunnel (No account needed)
```bash
npx localtunnel --port 3000
```

#### Option C: Serveo.net (SSH tunnel)
```bash
ssh -R 80:localhost:3000 serveo.net
```

## Git Repository Setup
```bash
# Initialize git if needed
git init

# Add all files
git add .

# Initial commit
git commit -m "Initial commit - Liftover Call Queue system"

# Add your remote
git remote add origin YOUR_GIT_REPO_URL

# Push
git push -u origin main
```

## Important Files for Git
Make sure these are included:
- `server.js` - Main server
- `package.json` - Dependencies
- `public/caller.html` - Caller interface
- `public/operator.html` - Operator dashboard
- `README.md` - Documentation
- `DEPLOY.md` - Deployment guide

Consider adding `.gitignore`:
```
node_modules/
.env
*.log
.DS_Store
```

## Next Steps After Git Upload
1. Deploy to production server
2. Configure domain/subdomain
3. Set up SSL certificates (required for WebRTC)
4. Configure production TURN servers for better connectivity
5. Add authentication to operator dashboard

## Technical Stack
- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JavaScript with WebRTC
- **Real-time**: WebSocket connections
- **Video/Audio**: WebRTC with STUN/TURN servers

## WebRTC Configuration
Currently using:
- Google STUN servers (free)
- OpenRelay TURN servers (free, may have limitations)

For production, consider upgrading to:
- Twilio TURN
- Xirsys
- Self-hosted coturn

## Support for vMix
The system manages 3 vMix call slots:
- Automatically assigns callers to available slots
- Handles connection/disconnection
- Operator can end calls manually

## Testing Status
- ✅ Local testing complete
- ⏳ Public access pending (needs tunnel/port forward)
- ⏳ vMix integration pending (needs actual vMix setup)

## CRITICAL MISSING COMPONENTS (per big-plan.txt)
- ❌ NO SRT output implementation
- ❌ NO persistent vMix connections  
- ❌ NO program feed for waiting callers
- ❌ NO Asterisk integration
- ❌ NO Companion/StreamDeck control
- ❌ NO two-slot switching system

**REFER TO big-plan.txt FOR ACTUAL REQUIREMENTS**

---
*Last updated: When you ran this setup*
*Server currently running on port 3000*
*THIS IS PHASE 1 PROTOTYPE ONLY - See big-plan.txt*