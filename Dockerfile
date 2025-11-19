# Liftover SRT Bridge - Complete WebRTC to SRT solution
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && \
    apt-get install -y \
    wget \
    ffmpeg \
    openssl \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Download MediaMTX (this IS our SRT bridge)
RUN wget -q https://github.com/bluenviron/mediamtx/releases/download/v1.9.3/mediamtx_v1.9.3_linux_amd64.tar.gz && \
    tar -xzf mediamtx_v1.9.3_linux_amd64.tar.gz && \
    rm mediamtx_v1.9.3_linux_amd64.tar.gz

# Generate SSL certificates for WebRTC
RUN openssl req -new -x509 -days 365 -nodes \
    -keyout server.key \
    -out server.crt \
    -subj "/C=US/ST=State/L=City/O=Liftover/CN=localhost"

# Configure MediaMTX as our complete SRT bridge
RUN cat > mediamtx.yml << 'EOF'
# MediaMTX IS the SRT bridge - it receives WebRTC and outputs SRT

logLevel: info
logDestinations: [stdout]

# API for monitoring
api: yes
apiAddress: :9997

# WebRTC input from browsers
webrtcAddress: :8889
webrtcServerKey: server.key
webrtcServerCert: server.crt
webrtcAllowOrigin: '*'
webrtcICEServers:
  - stun:stun.l.google.com:19302

# Internal RTSP server
rtspAddress: :8554

paths:
  # Slot 1 - WebRTC input from browser
  slot1:
    source: publisher
    # When someone publishes via WebRTC, start SRT output on port 9001
    runOnReady: ffmpeg -i rtsp://localhost:8554/slot1 -c copy -f mpegts "srt://0.0.0.0:9001?mode=listener"
    
  # Slot 2 - WebRTC input from browser
  slot2:
    source: publisher
    # When someone publishes via WebRTC, start SRT output on port 9002
    runOnReady: ffmpeg -i rtsp://localhost:8554/slot2 -c copy -f mpegts "srt://0.0.0.0:9002?mode=listener"
    
  # Test pattern when no caller
  test:
    runOnInit: ffmpeg -re -f lavfi -i testsrc2=s=1920x1080:r=30 -f lavfi -i sine -c:v libx264 -preset ultrafast -c:a aac -f rtsp rtsp://localhost:8554/test
    runOnInitRestart: yes
EOF

# Copy any Node.js control scripts (optional)
COPY package*.json ./
COPY package-simple.json ./
RUN cp package-simple.json package.json && npm install || true

# Startup script
RUN cat > start.sh << 'EOF'
#!/bin/bash

echo "========================================="
echo "Liftover SRT Bridge (powered by MediaMTX)"
echo "========================================="
echo ""
echo "Starting MediaMTX (WebRTC to SRT bridge)..."

# Run MediaMTX
./mediamtx &

sleep 3

echo ""
echo "========================================="
echo "✅ SRT Bridge Running!"
echo "========================================="
echo ""
echo "INPUTS (WebRTC from browsers):"
echo "  https://DOCKER_HOST:8889/slot1/whep"
echo "  https://DOCKER_HOST:8889/slot2/whep"
echo ""
echo "OUTPUTS (SRT to vMix):"
echo "  srt://DOCKER_HOST:9001"
echo "  srt://DOCKER_HOST:9002"
echo ""
echo "API Status:"
echo "  http://DOCKER_HOST:9997/v3/paths/list"
echo "========================================="

# Keep running
wait
EOF

RUN chmod +x start.sh

# Expose ports
# WebRTC signaling
EXPOSE 8889/tcp
# WebRTC media
EXPOSE 8189/udp
# SRT output slot 1
EXPOSE 9001/udp
# SRT output slot 2
EXPOSE 9002/udp
# API
EXPOSE 9997/tcp

CMD ["./start.sh"]