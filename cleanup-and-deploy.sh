#!/bin/bash

echo "==================================="
echo "Cleaning up and deploying MediaMTX"
echo "==================================="

# Stash local changes
echo "Stashing local changes..."
git stash

# Remove conflicting files
echo "Removing conflicting files..."
rm -f .dockerignore Dockerfile PROGRAM-FEED-SETUP.md docker-compose.yml

# Pull latest version
echo "Pulling latest from GitHub..."
git pull

# Create media directory
echo "Creating media directory..."
mkdir -p media

# Stop and remove old containers
echo "Stopping old containers..."
docker compose down 2>/dev/null || true
docker stop liftover-srt-bridge liftover-cloudflare-tunnel 2>/dev/null || true
docker rm liftover-srt-bridge liftover-cloudflare-tunnel 2>/dev/null || true
docker stop liftover-srt 2>/dev/null || true
docker rm liftover-srt 2>/dev/null || true

# Build new container
echo "Building MediaMTX container..."
docker compose build --no-cache

# Start container
echo "Starting MediaMTX container..."
docker compose up -d

echo ""
echo "==================================="
echo "✅ Deployment complete!"
echo "==================================="
echo ""
echo "MediaMTX is running with:"
echo "  - WebRTC: https://192.168.51.197:8889"
echo "  - SRT Slot 1: srt://192.168.51.197:9001"
echo "  - SRT Slot 2: srt://192.168.51.197:9002"
echo ""
echo "Place videos in: $(pwd)/media/"
echo "  - standby.mp4 (for both slots)"
echo "  - standby-slot1.mp4 (for slot 1)"
echo "  - standby-slot2.mp4 (for slot 2)"
echo ""
echo "View logs: docker compose logs -f"