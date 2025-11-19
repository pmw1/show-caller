# Program Return Feed Setup

The program feed lets callers watch the show while waiting in queue.

## Current Issue
The program feed path isn't implemented. We need to get video FROM vMix TO the waiting callers.

## Solution Options

### Option 1: vMix → RTMP → HLS (Most Common)

#### Step 1: Configure vMix Output
In vMix:
1. Click **Stream** button
2. Settings:
   - **Destination**: Custom RTMP Server
   - **URL**: `rtmp://YOUR-SERVER/live`
   - **Stream Key**: `program`
   - **Quality**: 720p30 (for bandwidth)

#### Step 2A: Use a Free RTMP Server
**YouTube Live** (Easy & Free):
1. Create YouTube Live stream
2. Get stream key
3. Stream from vMix to YouTube
4. Embed YouTube player in queue page

**Twitch** (Free):
1. Stream to Twitch
2. Embed Twitch player
3. Low latency mode available

#### Step 2B: Self-Host RTMP → HLS
On your Linux server:
```bash
# Install nginx with RTMP
sudo apt install nginx libnginx-mod-rtmp

# Configure nginx
cat > /etc/nginx/rtmp.conf << 'EOF'
rtmp {
    server {
        listen 1935;
        application live {
            live on;
            hls on;
            hls_path /var/www/html/hls;
            hls_fragment 3;
            hls_playlist_length 60;
        }
    }
}
EOF

# Restart nginx
sudo systemctl restart nginx
```

vMix streams to: `rtmp://YOUR-SERVER/live/program`
Callers watch: `http://YOUR-SERVER/hls/program.m3u8`

### Option 2: vMix → SRT → Web (Lower Latency)

Add to your SRT bridge:
```javascript
// In srt-bridge-simple.js, add:
const programFeed = {
  port: 9003,
  process: null
};

// Start SRT listener for program feed
programFeed.process = spawn('ffmpeg', [
  '-i', 'srt://0.0.0.0:9003?mode=listener',
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-c:a', 'aac',
  '-f', 'flv',
  'rtmp://localhost/live/program'  // Or output to HLS
]);
```

vMix External Output → `srt://YOUR-SERVER:9003`

### Option 3: NDI → Web (Best Quality, LAN Only)

If on same network:
1. vMix outputs NDI
2. Use NDI2Web tool
3. Embed in queue page

### Option 4: vMix Web Controller (Simplest)

vMix has a built-in web interface:
1. Enable Web Controller in vMix
2. Access at `http://VMIX-IP:8088`
3. Embed iframe in queue page

## Quick Fix - Embed the Updated Cloudflare Worker:

```javascript
// In cloudflare-simple/src/index.js, update getCallerPage():

function getCallerPage() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Liftover Queue</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
  <!-- Add this video player for program feed -->
  <div id="programFeed" style="display:none;">
    <h3>Watch the Show</h3>
    <video id="video" controls width="640" height="360"></video>
  </div>
  
  <script>
    // Configure your program feed URL here
    const PROGRAM_FEED_URL = 'https://YOUR-STREAM-URL/program.m3u8';
    
    // HLS.js player setup
    const video = document.getElementById('video');
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(PROGRAM_FEED_URL);
      hls.attachMedia(video);
      
      // Show player when in queue
      document.getElementById('programFeed').style.display = 'block';
    }
  </script>
  
  <!-- Rest of your page... -->
</body>
</html>`;
}
```

## Recommended Setup for You:

1. **For Testing**: Use YouTube Live
   - Stream from vMix to YouTube
   - Embed YouTube player
   - Works immediately

2. **For Production**: nginx RTMP on your Linux server
   - Low latency
   - Full control
   - Free

3. **Update Cloudflare Worker** with embed code

Which option do you want to implement?