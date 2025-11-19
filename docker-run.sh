#!/bin/bash

# Quick Docker deployment script for Liftover SRT Bridge

echo "======================================="
echo "Liftover SRT Bridge - Docker Deployment"
echo "======================================="

# Build the Docker image
echo "Building Docker image..."
docker build -t liftover-srt .

# Stop any existing container
echo "Stopping existing container (if any)..."
docker stop liftover-srt 2>/dev/null
docker rm liftover-srt 2>/dev/null

# Run the container
echo "Starting SRT bridge container..."
docker run -d \
  --name liftover-srt \
  --restart unless-stopped \
  -p 3001:3001 \
  -p 9001:9001/udp \
  -p 9002:9002/udp \
  -p 9001:9001/tcp \
  -p 9002:9002/tcp \
  liftover-srt

# Wait for container to start
sleep 3

# Check if running
if docker ps | grep -q liftover-srt; then
    # Get host IP
    HOST_IP=$(hostname -I | awk '{print $1}')
    
    echo ""
    echo "======================================="
    echo "✅ SRT Bridge Running in Docker!"
    echo "======================================="
    echo ""
    echo "Container Status:"
    docker ps | grep liftover-srt
    echo ""
    echo "vMix SRT URLs:"
    echo "  Slot 1: srt://$HOST_IP:9001?mode=caller"
    echo "  Slot 2: srt://$HOST_IP:9002?mode=caller"
    echo ""
    echo "API Status: http://$HOST_IP:3001/api/status"
    echo ""
    echo "View logs: docker logs -f liftover-srt"
    echo "Stop: docker stop liftover-srt"
    echo "======================================="
else
    echo "❌ Container failed to start!"
    echo "Check logs: docker logs liftover-srt"
fi