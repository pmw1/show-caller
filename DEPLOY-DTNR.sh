#!/bin/bash

echo "======================================"
echo "Deploying Liftover Queue to DTNR.IO"
echo "======================================"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing wrangler CLI..."
    npm install -g wrangler
fi

cd cloudflare-simple

# Install dependencies
echo "Installing dependencies..."
npm install

# Login to Cloudflare (if not already)
echo ""
echo "Ensuring Cloudflare login..."
wrangler login

# Deploy to dtnr.io
echo ""
echo "Deploying to dtnr.io..."
wrangler deploy

echo ""
echo "======================================"
echo "DEPLOYMENT COMPLETE!"
echo "======================================"
echo ""
echo "Your app is now live at:"
echo ""
echo "PRIMARY URL:"
echo "  https://calls.dtnr.io"
echo ""
echo "PAGES:"
echo "  Callers:  https://calls.dtnr.io/"
echo "  Operator: https://calls.dtnr.io/operator"
echo ""
echo "API ENDPOINTS:"
echo "  POST https://calls.dtnr.io/api/join     - Join queue"
echo "  GET  https://calls.dtnr.io/api/queue    - Get status"
echo "  POST https://calls.dtnr.io/api/approve  - Approve caller"
echo ""
echo "======================================"
echo "NEXT STEPS:"
echo "======================================"
echo ""
echo "1. DNS Setup (if needed):"
echo "   - Add CNAME: calls.dtnr.io → liftover-queue.workers.dev"
echo "   - Or use Cloudflare's auto-DNS if dtnr.io is on Cloudflare"
echo ""
echo "2. For vMix Connection:"
echo "   Run: node server-v2.js"
echo "   Then use Cloudflare Tunnel or ngrok to expose SRT ports"
echo ""
echo "3. Share with callers:"
echo "   https://calls.dtnr.io"
echo ""
echo "======================================"