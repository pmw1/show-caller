# Liftover Call Queue - Deployment Guide

**⚠️ IMPORTANT: See big-plan.txt for complete system requirements.**
**This deployment guide covers Phase 1 prototype only.**
**Full production deployment requires SRT bridging and Asterisk integration per big-plan.txt**

## Quick Start with ngrok (Immediate Public Access)

```bash
# Terminal 1 - Start the server
npm install
npm start

# Terminal 2 - Create public tunnel
npx ngrok http 3000
```

You'll get a URL like `https://abc123.ngrok.io` - share this with callers!

## Cloudflare Tunnel Setup (Production)

### 1. Install Cloudflare Tunnel
```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Windows
# Download from: https://github.com/cloudflare/cloudflared/releases
```

### 2. Authenticate & Create Tunnel
```bash
cloudflared tunnel login
cloudflared tunnel create liftover-calls
```

### 3. Configure DNS
```bash
# Replace 'calls.yourdomain.com' with your desired subdomain
cloudflared tunnel route dns liftover-calls calls.yourdomain.com
```

### 4. Create Config File
Create `~/.cloudflared/config.yml`:
```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/USER/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: calls.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 5. Run the Services
```bash
# Terminal 1 - Start Liftover
npm start

# Terminal 2 - Start Cloudflare Tunnel
cloudflared tunnel run liftover-calls
```

Your app is now live at `https://calls.yourdomain.com`!

## Using Port Forwarding

1. Start the server:
```bash
npm start
```

2. Configure your router:
   - Forward external port 3000 to internal port 3000
   - Point to your machine's local IP

3. Share your public IP:
   - Find it at: https://whatismyipaddress.com
   - Share: `http://YOUR_PUBLIC_IP:3000`

## WebRTC Considerations

For best connectivity behind NATs/firewalls:

1. The included TURN servers are free but may have limitations
2. For production, consider:
   - Twilio TURN: https://www.twilio.com/stun-turn
   - Xirsys: https://xirsys.com
   - Self-hosted: coturn

3. Update the TURN config in `public/caller.html`:
```javascript
iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
        urls: 'turn:YOUR_TURN_SERVER:3478',
        username: 'YOUR_USERNAME',
        credential: 'YOUR_PASSWORD'
    }
]
```

## SSL/HTTPS (Required for WebRTC on Public Networks)

ngrok and Cloudflare Tunnel handle SSL automatically.

For direct hosting with SSL:

1. Get certificates (Let's Encrypt):
```bash
sudo certbot certonly --standalone -d calls.yourdomain.com
```

2. Update `.env`:
```env
SSL_CERT=/etc/letsencrypt/live/calls.yourdomain.com/fullchain.pem
SSL_KEY=/etc/letsencrypt/live/calls.yourdomain.com/privkey.pem
```

3. Restart the server

## Systemd Service (Linux)

Create `/etc/systemd/system/liftover.service`:
```ini
[Unit]
Description=Liftover Call Queue
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/liftover-call-queue
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable liftover
sudo systemctl start liftover
```

## PM2 (Process Manager)

```bash
npm install -g pm2
pm2 start server.js --name liftover
pm2 save
pm2 startup
```