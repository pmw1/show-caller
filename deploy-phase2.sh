#!/bin/bash

# Liftover Call Queue - Phase 2 Deployment Script
# Deploys to Cloudflare with SRT bridge

echo "==================================="
echo "Liftover Call Queue - Phase 2 Deploy"
echo "==================================="

# Check prerequisites
command -v wrangler >/dev/null 2>&1 || { echo "Error: wrangler CLI not installed. Run: npm install -g wrangler" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "Error: ffmpeg not installed." >&2; exit 1; }

# Configuration
read -p "Enter your Cloudflare account ID: " CF_ACCOUNT_ID
read -p "Enter your domain (e.g., calls.example.com): " DOMAIN
read -p "Enter vMix host IP: " VMIX_IP
read -p "Deploy SRT bridge locally (L) or on edge server (E)? [L/E]: " BRIDGE_LOC

# Update wrangler.toml with actual values
sed -i "s/YOUR_ZONE_ID/$CF_ACCOUNT_ID/g" cloudflare/wrangler.toml
sed -i "s/calls.example.com/$DOMAIN/g" cloudflare/wrangler.toml
sed -i "s/vmix.local/$VMIX_IP/g" cloudflare/wrangler.toml

# Deploy to Cloudflare Workers
echo "Deploying to Cloudflare Workers..."
cd cloudflare
wrangler publish

# Set secrets
echo "Setting Cloudflare secrets..."
wrangler secret put OPERATOR_PASSWORD
wrangler secret put TURN_SERVER_URL
wrangler secret put TURN_USERNAME
wrangler secret put TURN_PASSWORD

cd ..

# Deploy SRT Bridge
if [ "$BRIDGE_LOC" = "L" ]; then
    echo "Setting up local SRT bridge..."
    
    # Create systemd service
    sudo tee /etc/systemd/system/liftover-srt.service > /dev/null <<EOF
[Unit]
Description=Liftover SRT Bridge
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node server-v2.js
Restart=always
Environment="NODE_ENV=production"
Environment="VMIX_SRT_SLOT1=srt://$VMIX_IP:9001?streamid=slot1"
Environment="VMIX_SRT_SLOT2=srt://$VMIX_IP:9002?streamid=slot2"

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable liftover-srt
    sudo systemctl start liftover-srt
    
    # Setup Cloudflare Tunnel for local bridge
    echo "Setting up Cloudflare Tunnel..."
    cloudflared tunnel create liftover-srt
    cloudflared tunnel route dns liftover-srt srt.$DOMAIN
    
    cat > ~/.cloudflared/liftover-srt.yml <<EOF
tunnel: liftover-srt
credentials-file: $HOME/.cloudflared/liftover-srt.json

ingress:
  - hostname: srt.$DOMAIN
    service: http://localhost:3000
  - service: http_status:404
EOF
    
    cloudflared tunnel run liftover-srt &
    
else
    echo "Edge server deployment selected."
    echo "Deploy the SRT bridge to your edge server using Docker:"
    echo ""
    echo "docker build -t liftover-srt ./srt-bridge"
    echo "docker run -d -p 9001-9003:9001-9003/udp liftover-srt"
fi

# Configure vMix
echo ""
echo "==================================="
echo "vMix Configuration Required:"
echo "==================================="
echo "1. Add SRT Input 1:"
echo "   URL: srt://0.0.0.0:9001?mode=listener"
echo "   Name: Liftover Slot 1"
echo ""
echo "2. Add SRT Input 2:"
echo "   URL: srt://0.0.0.0:9002?mode=listener"
echo "   Name: Liftover Slot 2"
echo ""
echo "3. Configure Program Output:"
echo "   Stream to: rtmp://ingest.$DOMAIN/live"
echo "   Stream key: program"
echo ""
echo "==================================="
echo "URLs:"
echo "==================================="
echo "Callers: https://$DOMAIN"
echo "Operator: https://$DOMAIN/operator"
echo "SRT Bridge: https://srt.$DOMAIN"
echo ""
echo "Companion API Endpoints:"
echo "  GET  https://$DOMAIN/api/status"
echo "  POST https://$DOMAIN/api/next-caller"
echo "  POST https://$DOMAIN/api/end-slot/:slotId"
echo "==================================="