#!/bin/bash

echo "======================================"
echo "Liftover Queue - Quick Cloudflare Deploy"
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

# Login to Cloudflare
echo ""
echo "Logging into Cloudflare..."
echo "A browser window will open for authentication"
wrangler login

# Deploy
echo ""
echo "Deploying to Cloudflare Workers..."
wrangler deploy

echo ""
echo "======================================"
echo "DEPLOYMENT COMPLETE!"
echo "======================================"
echo ""
echo "Your app is now live at:"
echo "https://liftover-queue.[your-subdomain].workers.dev"
echo ""
echo "Pages:"
echo "  Callers: https://liftover-queue.[your-subdomain].workers.dev/"
echo "  Operator: https://liftover-queue.[your-subdomain].workers.dev/operator"
echo ""
echo "API Endpoints:"
echo "  POST /api/join - Join the queue"
echo "  GET  /api/queue - Get queue status"
echo "  POST /api/approve - Approve caller from screening"
echo ""
echo "Next steps:"
echo "1. Share the caller URL with your audience"
echo "2. Open the operator dashboard to manage the queue"
echo "3. Set up the SRT bridge for vMix (run: node server-v2.js)"
echo ""