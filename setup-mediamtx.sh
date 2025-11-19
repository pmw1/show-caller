#!/bin/bash

# Complete MediaMTX Setup for WebRTC to SRT

echo "================================================"
echo "Setting up MediaMTX for WebRTC to SRT Bridge"
echo "================================================"

# Download MediaMTX
echo "Downloading MediaMTX..."
wget -q https://github.com/bluenviron/mediamtx/releases/download/v1.9.3/mediamtx_v1.9.3_linux_amd64.tar.gz
tar -xzf mediamtx_v1.9.3_linux_amd64.tar.gz

# Create configuration
echo "Creating configuration..."
cat > mediamtx.yml << 'EOF'
# MediaMTX Configuration for Liftover

# WebRTC settings
webrtcAddress: :8889
webrtcServerKey: server.key
webrtcServerCert: server.crt
webrtcAllowOrigin: '*'
webrtcTrustedProxies: []
webrtcLocalUDPAddress: :8189
webrtcLocalTCPAddress: :8189
webrtcIPsFromInterfaces: true
webrtcICEServers:
  - urls: [stun:stun.l.google.com:19302]

# SRT settings  
srtAddress: :8890

# API settings
api: yes
apiAddress: :9997

# Paths configuration
paths:
  # Slot 1 - WebRTC in, SRT out
  slot1:
    source: publisher
    sourceOnDemand: no
    runOnReady: ffmpeg -i rtsp://localhost:8554/$RTSP_PATH -c copy -f mpegts srt://0.0.0.0:9001?mode=listener
    
  # Slot 2 - WebRTC in, SRT out  
  slot2:
    source: publisher
    sourceOnDemand: no
    runOnReady: ffmpeg -i rtsp://localhost:8554/$RTSP_PATH -c copy -f mpegts srt://0.0.0.0:9002?mode=listener
EOF

# Generate self-signed certificates for WebRTC
echo "Generating SSL certificates..."
openssl req -new -x509 -days 365 -nodes \
  -keyout server.key \
  -out server.crt \
  -subj "/C=US/ST=State/L=City/O=Liftover/CN=localhost"

# Create systemd service
echo "Creating systemd service..."
sudo cat > /etc/systemd/system/mediamtx.service << 'EOF'
[Unit]
Description=MediaMTX
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/mediamtx
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create HTML test page
cat > test-webrtc.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>WebRTC to SRT Test</title>
</head>
<body>
    <h1>WebRTC Publisher Test</h1>
    <video id="localVideo" autoplay muted width="640" height="480"></video>
    <br>
    <button onclick="startPublishing('slot1')">Publish to Slot 1</button>
    <button onclick="startPublishing('slot2')">Publish to Slot 2</button>
    
    <script>
        async function startPublishing(slot) {
            // Get user media
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            document.getElementById('localVideo').srcObject = stream;
            
            // Create peer connection
            const pc = new RTCPeerConnection({
                iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
            });
            
            // Add tracks
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });
            
            // Create offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            // Send to MediaMTX WHEP endpoint
            const response = await fetch(`https://localhost:8889/${slot}/whep`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/sdp'
                },
                body: offer.sdp
            });
            
            const answer = await response.text();
            await pc.setRemoteDescription({
                type: 'answer',
                sdp: answer
            });
            
            console.log(`Publishing to ${slot}`);
        }
    </script>
</body>
</html>
EOF

echo ""
echo "================================================"
echo "✅ MediaMTX Setup Complete!"
echo "================================================"
echo ""
echo "To run MediaMTX:"
echo "  ./mediamtx"
echo ""
echo "WebRTC publish URLs:"
echo "  https://localhost:8889/slot1/whep"
echo "  https://localhost:8889/slot2/whep"
echo ""
echo "SRT output URLs for vMix:"
echo "  srt://YOUR_IP:9001"
echo "  srt://YOUR_IP:9002"
echo ""
echo "Test page:"
echo "  Open test-webrtc.html in browser"
echo ""
echo "API:"
echo "  http://localhost:9997/v3/paths/list"
echo ""
echo "To run as service:"
echo "  sudo systemctl enable mediamtx"
echo "  sudo systemctl start mediamtx"
echo ""
echo "================================================"