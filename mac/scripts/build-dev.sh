#!/bin/bash
set -e

# Cerebro Mac App Development Build Script
# Quick build for development without signing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$MAC_DIR")"

APP_NAME="Cerebro"
BUILD_DIR="$MAC_DIR/.build"

echo "Building $APP_NAME (dev)..."

# Build the Bun executable
echo ""
echo "Building Cerebro server..."
cd "$ROOT_DIR"
bun run build:exe

# Build Swift app in debug mode
echo ""
echo "Building Swift app (debug)..."
cd "$MAC_DIR"
swift build

echo ""
echo "Build complete!"
echo ""
echo "To run the Swift app directly:"
echo "  $BUILD_DIR/debug/Cerebro"
echo ""
echo "Note: The app will look for the cerebro binary in:"
echo "  1. Bundle resources (for .app bundles)"
echo "  2. $ROOT_DIR/dist-exe/cerebro (development)"
echo "  3. ~/.local/bin/cerebro"
