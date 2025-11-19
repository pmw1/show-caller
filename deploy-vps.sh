#!/bin/bash

# Liftover Low-Latency VPS Setup Script
# Run this on your new VPS

echo "==========================================="
echo "Liftover SRT Bridge - VPS Setup"
echo "==========================================="

# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y wget ffmpeg curl git nodejs npm

# Download MediaMTX
cd /opt
wget https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_v1.9.0_linux_amd64.tar.gz
tar -xzf mediamtx_v1.9.0_linux_amd64.tar.gz

# Create MediaMTX config for low latency
cat > mediamtx.yml << 'EOF'
# Low latency configuration
logLevel: info
logDestinations: [stdout]

# RTSP server
rtspDisable: no
rtspAddress: :8554

# WebRTC settings for input from Cloudflare
webrtcAddress: :8889
webrtcLocalUDPAddress: :8189
webrtcLocalTCPAddress: :8189

# SRT output settings for vMix
srtAddress: :8890

paths:
  # Slot 1
  slot1:
    source: publisher
    srtReadTimeout: 5s
    
  # Slot 2  
  slot2:
    source: publisher
    srtReadTimeout: 5s

  # Test pattern when no caller
  test:
    runOnInit: ffmpeg -re -f lavfi -i testsrc2=size=1920x1080:rate=30 -f lavfi -i sine -c:v libx264 -preset ultrafast -b:v 3000k -c:a aac -f rtsp rtsp://localhost:8554/test
    runOnInitRestart: yes
EOF

# Create systemd service
cat > /etc/systemd/system/mediamtx.service << 'EOF'
[Unit]
Description=MediaMTX
After=network.target

[Service]
ExecStart=/opt/mediamtx
WorkingDirectory=/opt
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

# Create simple Node.js bridge controller
cat > /opt/bridge-controller.js << 'EOF'
const express = require('express');
const { exec } = require('child_process');
const app = express();

app.use(express.json());

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    slots: {
      slot1: { srt: 'srt://SERVER_IP:8890/slot1' },
      slot2: { srt: 'srt://SERVER_IP:8890/slot2' }
    }
  });
});

// Switch caller to slot
app.post('/switch/:slot/:callerId', (req, res) => {
  const { slot, callerId } = req.params;
  console.log(`Switching ${slot} to caller ${callerId}`);
  // In production: manage WebRTC to SRT routing here
  res.json({ success: true });
});

app.listen(3000, () => {
  console.log('Bridge controller running on :3000');
});
EOF

# Install Node dependencies
cd /opt
npm init -y
npm install express

# Create startup script
cat > /opt/start-bridge.sh << 'EOF'
#!/bin/bash
# Start MediaMTX
systemctl start mediamtx

# Start controller
node /opt/bridge-controller.js &

echo "SRT Bridge Running!"
echo "vMix SRT URLs:"
echo "  Slot 1: srt://YOUR_VPS_IP:8890/slot1"
echo "  Slot 2: srt://YOUR_VPS_IP:8890/slot2"
EOF

chmod +x /opt/start-bridge.sh

# Configure firewall
ufw allow 22/tcp
ufw allow 3000/tcp
ufw allow 8554/tcp
ufw allow 8889/tcp
ufw allow 8889/udp
ufw allow 8890/tcp
ufw allow 8890/udp
ufw allow 8189/udp
ufw allow 9001:9002/udp
ufw --force enable

# Enable and start services
systemctl daemon-reload
systemctl enable mediamtx
systemctl start mediamtx

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)

echo ""
echo "==========================================="
echo "✅ SETUP COMPLETE!"
echo "==========================================="
echo ""
echo "Your VPS IP: $PUBLIC_IP"
echo ""
echo "vMix SRT Connection URLs:"
echo "  Slot 1: srt://$PUBLIC_IP:8890/slot1"
echo "  Slot 2: srt://$PUBLIC_IP:8890/slot2"
echo ""
echo "WebRTC endpoint: ws://$PUBLIC_IP:8889"
echo "Controller API: http://$PUBLIC_IP:3000"
echo ""
echo "To connect from Cloudflare:"
echo "  Update your worker to send WebRTC to ws://$PUBLIC_IP:8889"
echo ""
echo "==========================================="