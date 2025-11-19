#!/bin/bash

# Install MediaMTX - it handles WebRTC to SRT conversion properly

echo "Installing MediaMTX for WebRTC to SRT conversion..."

# Download MediaMTX
wget https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_v1.9.0_linux_amd64.tar.gz
tar -xzf mediamtx_v1.9.0_linux_amd64.tar.gz

# Create configuration
cat > mediamtx.yml << 'EOF'
webrtcAddress: :8889
srtAddress: :8890

paths:
  slot1:
    source: publisher
    sourceOnDemand: no
    
  slot2:
    source: publisher
    sourceOnDemand: no
EOF

echo "MediaMTX installed!"
echo ""
echo "To run:"
echo "./mediamtx"
echo ""
echo "WebRTC publish to:"
echo "  http://localhost:8889/slot1/whep"
echo "  http://localhost:8889/slot2/whep"
echo ""
echo "vMix pulls SRT from:"
echo "  srt://localhost:8890/slot1"
echo "  srt://localhost:8890/slot2"