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
  # Slot 1 - WebRTC input from browser or standby video
  slot1:
    source: publisher
    # Standby video loop - checks for custom video first, falls back to default
    runOnInit: sh -c "if [ -f /app/media/standby-slot1.mp4 ]; then ffmpeg -re -stream_loop -1 -i /app/media/standby-slot1.mp4 -c copy -f rtsp rtsp://localhost:8554/slot1; elif [ -f /app/media/standby.mp4 ]; then ffmpeg -re -stream_loop -1 -i /app/media/standby.mp4 -c copy -f rtsp rtsp://localhost:8554/slot1; else ffmpeg -re -stream_loop -1 -i /app/standby.mp4 -c copy -f rtsp rtsp://localhost:8554/slot1; fi"
    runOnInitRestart: yes
    # When someone publishes via WebRTC, they take over
    
  # Slot 2 - WebRTC input from browser or standby video  
  slot2:
    source: publisher
    # Standby video loop - checks for custom video first, falls back to default
    runOnInit: sh -c "if [ -f /app/media/standby-slot2.mp4 ]; then ffmpeg -re -stream_loop -1 -i /app/media/standby-slot2.mp4 -c copy -f rtsp rtsp://localhost:8554/slot2; elif [ -f /app/media/standby.mp4 ]; then ffmpeg -re -stream_loop -1 -i /app/media/standby.mp4 -c copy -f rtsp rtsp://localhost:8554/slot2; else ffmpeg -re -stream_loop -1 -i /app/standby.mp4 -c copy -f rtsp rtsp://localhost:8554/slot2; fi"
    runOnInitRestart: yes
    # When someone publishes via WebRTC, they take over
    
  # SRT output streams (always running)
  srt1:
    runOnInit: ffmpeg -i rtsp://localhost:8554/slot1 -c copy -f mpegts "srt://0.0.0.0:9001?mode=listener"
    runOnInitRestart: yes
    
  srt2:
    runOnInit: ffmpeg -i rtsp://localhost:8554/slot2 -c copy -f mpegts "srt://0.0.0.0:9002?mode=listener"
    runOnInitRestart: yes
EOF

# Copy standby video (or create one if not provided)
# Option 1: Copy your own video file
# COPY standby.mp4 /app/standby.mp4

# Option 2: Create a simple standby video with text
RUN ffmpeg -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:r=30:d=10,drawtext=text='Waiting for Caller':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2" \
    -f lavfi -i "anullsrc=r=48000:cl=stereo" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
    -c:a aac -b:a 128k -shortest -y \
    /app/standby.mp4

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