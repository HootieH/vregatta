#!/bin/bash
set -e
echo "Installing dependencies..."
npm install
echo "Building extension..."
npm run build
echo ""
echo "Done! Now load the extension in Chrome:"
echo "  1. Open chrome://extensions"
echo "  2. Enable Developer mode (top-right)"
echo "  3. Click 'Load unpacked' -> select the dist/ folder"
echo "  4. Go to virtualregatta.com and join a race"
echo ""
