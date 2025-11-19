#!/bin/bash

# Liftover Queue - Linux Server Deployment
# Run this on your actual Linux server

echo "============================================"
echo "Liftover Queue - Server Deployment"
echo "============================================"

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   echo "This script should be run with sudo or as root"
   exit 1
fi

# Install dependencies
echo "Installing dependencies..."
apt update
apt install -y git nodejs npm ffmpeg curl wget

# Install PM2 for process management
npm install -g pm2

# Clone the repository
echo "Cloning repository..."
cd /opt
if [ -d "show-caller" ]; then
    cd show-caller
    git pull
else
    git clone https://github.com/pmw1/show-caller.git
    cd show-caller
fi

# Install Node dependencies
echo "Installing Node modules..."
npm install express socket.io uuid child_process

# Create systemd service for auto-start
cat > /etc/systemd/system/liftover-srt.service << 'EOF'
[Unit]
Description=Liftover SRT Bridge
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/show-caller
ExecStart=/usr/bin/node /opt/show-caller/srt-bridge-simple.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=liftover-srt

[Install]
WantedBy=multi-user.target
EOF

# Install and configure Cloudflare Tunnel
echo "Setting up Cloudflare Tunnel..."
if ! command -v cloudflared &> /dev/null; then
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared-linux-amd64.deb
    rm cloudflared-linux-amd64.deb
fi

# Configure firewall
echo "Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp
    ufw allow 3001/tcp
    ufw allow 9001:9002/udp
    ufw allow 9001:9002/tcp
    echo "y" | ufw enable
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=3001/tcp
    firewall-cmd --permanent --add-port=9001-9002/udp
    firewall-cmd --permanent --add-port=9001-9002/tcp
    firewall-cmd --reload
fi

# Create startup script
cat > /opt/show-caller/start-production.sh << 'EOF'
#!/bin/bash

# Start SRT bridge
echo "Starting SRT bridge..."
pm2 start /opt/show-caller/srt-bridge-simple.js --name liftover-srt

# Start Cloudflare Tunnel (if configured)
if [ -f ~/.cloudflared/config.yml ]; then
    echo "Starting Cloudflare Tunnel..."
    pm2 start "cloudflared tunnel run" --name liftover-tunnel
fi

# Save PM2 configuration
pm2 save
pm2 startup systemd -u root --hp /root

echo "Services started!"
echo ""
echo "Check status with: pm2 status"
echo "View logs with: pm2 logs"
EOF

chmod +x /opt/show-caller/start-production.sh

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')
PUBLIC_IP=$(curl -s ifconfig.me)

echo ""
echo "============================================"
echo "✅ DEPLOYMENT COMPLETE!"
echo "============================================"
echo ""
echo "Server IPs:"
echo "  Local IP:  $SERVER_IP"
echo "  Public IP: $PUBLIC_IP"
echo ""
echo "vMix SRT URLs:"
echo "  Slot 1: srt://$SERVER_IP:9001"
echo "  Slot 2: srt://$SERVER_IP:9002"
echo ""
echo "Or if using public IP:"
echo "  Slot 1: srt://$PUBLIC_IP:9001"
echo "  Slot 2: srt://$PUBLIC_IP:9002"
echo ""
echo "Next Steps:"
echo "1. Start the services:"
echo "   /opt/show-caller/start-production.sh"
echo ""
echo "2. (Optional) Setup Cloudflare Tunnel:"
echo "   cloudflared tunnel login"
echo "   cloudflared tunnel create liftover"
echo "   cloudflared tunnel route dns liftover srt.dtnr.io"
echo ""
echo "3. Configure vMix with the SRT URLs above"
echo ""
echo "4. The queue system remains at:"
echo "   https://calls.dtnr.io"
echo ""
echo "============================================"