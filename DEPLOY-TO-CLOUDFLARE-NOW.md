# Deploy to Cloudflare - Quick Start Guide

## Prerequisites
```bash
# Install Cloudflare CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

## Step 1: Prepare Cloudflare Worker

```bash
# Create worker project
mkdir cloudflare-deploy
cd cloudflare-deploy

# Initialize wrangler
wrangler init liftover-queue
# Choose: "Hello World" Worker
```

## Step 2: Create Minimal Worker

Create `src/index.js`:
```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Serve static HTML for now
    if (url.pathname === '/') {
      return new Response(getCallerHTML(), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (url.pathname === '/operator') {
      return new Response(getOperatorHTML(), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Simple API endpoint
    if (url.pathname === '/api/status') {
      return new Response(JSON.stringify({
        queue: 0,
        slots: { slot1: null, slot2: null }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

function getCallerHTML() {
  return `<!DOCTYPE html>
<html>
<head><title>Liftover Queue</title></head>
<body>
  <h1>Join the Show</h1>
  <form id="join">
    <input type="text" placeholder="Your name" id="name" required>
    <textarea placeholder="What do you want to talk about?" id="topic" required></textarea>
    <button type="submit">Join Queue</button>
  </form>
  <div id="status"></div>
  <script>
    document.getElementById('join').onsubmit = (e) => {
      e.preventDefault();
      document.getElementById('status').innerHTML = 'You are in the queue!';
      // In production: WebSocket connection here
    };
  </script>
</body>
</html>`;
}

function getOperatorHTML() {
  return `<!DOCTYPE html>
<html>
<head><title>Operator Dashboard</title></head>
<body>
  <h1>Operator Dashboard</h1>
  <div id="queue">No callers in queue</div>
  <button onclick="fetch('/api/status').then(r=>r.json()).then(console.log)">Check Status</button>
</body>
</html>`;
}
```

## Step 3: Configure wrangler.toml

```toml
name = "liftover-queue"
main = "src/index.js"
compatibility_date = "2024-01-01"
workers_dev = true

# For custom domain later:
# route = { pattern = "calls.yourdomain.com/*", zone_id = "YOUR_ZONE_ID" }
```

## Step 4: Deploy

```bash
# Deploy to workers.dev subdomain
wrangler deploy

# You'll get a URL like:
# https://liftover-queue.YOUR-SUBDOMAIN.workers.dev
```

## Step 5: Add SRT Bridge (Separate Service)

Since Cloudflare Workers can't run FFmpeg, deploy the SRT bridge separately:

### Option A: Use Cloudflare Tunnel (Recommended)
```bash
# On your local machine or server with FFmpeg
cd /root/show-caller

# Install cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Create tunnel
cloudflared tunnel create liftover-srt

# Start the SRT bridge server
node server-v2.js &

# Expose via tunnel
cloudflared tunnel run liftover-srt
```

### Option B: Direct Port Forward
```bash
# Run SRT bridge locally
node server-v2.js

# Forward ports 9001-9002 on your router to this machine
# Share your public IP with vMix
```

## Step 6: Connect vMix

In vMix:
1. Add Input → Streaming → SRT
2. URL: `srt://YOUR-IP:9001?mode=caller`
3. Repeat for port 9002

## Quick Test URLs

After deployment:
- Callers: `https://liftover-queue.YOUR-SUBDOMAIN.workers.dev/`
- Operator: `https://liftover-queue.YOUR-SUBDOMAIN.workers.dev/operator`
- API: `https://liftover-queue.YOUR-SUBDOMAIN.workers.dev/api/status`

## Custom Domain (Optional)

```bash
# Add your domain to Cloudflare
wrangler route add calls.yourdomain.com/* --zone YOUR_ZONE_ID
```

## That's It! 🚀

You now have:
- ✅ Public web interface on Cloudflare
- ✅ Local SRT bridge for vMix
- ✅ Basic queue structure

Next steps:
- Add WebSocket support for real-time updates
- Implement WebRTC capture
- Connect WebRTC to SRT bridge