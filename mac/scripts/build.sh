#!/bin/bash
set -e

# Cerebro Mac App Build Script
# Creates a signed, notarized Mac app bundle with modern icon format

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$MAC_DIR")"

APP_NAME="Cerebro"
BUNDLE_ID="com.cerebro.app"
BUILD_DIR="$MAC_DIR/.build"
RELEASE_DIR="$MAC_DIR/release"
APP_BUNDLE="$RELEASE_DIR/$APP_NAME.app"

echo "Building $APP_NAME..."
echo "Root: $ROOT_DIR"
echo "Mac: $MAC_DIR"

# Clean previous builds
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Build the Bun executable first
echo ""
echo "Building Cerebro server executable..."
cd "$ROOT_DIR"
bun run build:exe

# Build Swift app
echo ""
echo "Building Swift app..."
cd "$MAC_DIR"
swift build -c release

# Create app bundle structure
echo ""
echo "Creating app bundle..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Copy Swift executable
cp "$BUILD_DIR/release/Cerebro" "$APP_BUNDLE/Contents/MacOS/"

# Copy Cerebro server binary
cp "$ROOT_DIR/dist-exe/cerebro" "$APP_BUNDLE/Contents/Resources/"

# Copy Info.plist
cp "$MAC_DIR/Info.plist" "$APP_BUNDLE/Contents/"

# Copy app icons from icon/ directory
# .icns for universal compatibility (macOS 10.x - 14.x)
if [ -f "$MAC_DIR/icon/Cerebro.icns" ]; then
    echo "Copying icon (Cerebro.icns)..."
    cp "$MAC_DIR/icon/Cerebro.icns" "$APP_BUNDLE/Contents/Resources/"
fi

# .icon folder for Liquid Glass effect (macOS 15+)
if [ -d "$MAC_DIR/icon/Cerebro.icon" ]; then
    echo "Copying Liquid Glass icon (Cerebro.icon)..."
    cp -r "$MAC_DIR/icon/Cerebro.icon" "$APP_BUNDLE/Contents/Resources/"
fi

# Generate PkgInfo
echo -n "APPL????" > "$APP_BUNDLE/Contents/PkgInfo"

# Set permissions
chmod +x "$APP_BUNDLE/Contents/MacOS/Cerebro"
chmod +x "$APP_BUNDLE/Contents/Resources/cerebro"

echo ""
echo "App bundle created at: $APP_BUNDLE"

# Check if we should sign
if [ -n "$DEVELOPER_ID" ]; then
    echo ""
    echo "Signing app with: $DEVELOPER_ID"
    codesign --force --options runtime --sign "$DEVELOPER_ID" \
        --entitlements "$MAC_DIR/Cerebro.entitlements" \
        "$APP_BUNDLE/Contents/Resources/cerebro"
    codesign --force --options runtime --sign "$DEVELOPER_ID" \
        --entitlements "$MAC_DIR/Cerebro.entitlements" \
        "$APP_BUNDLE"
    echo "App signed successfully"
else
    echo ""
    echo "Note: Set DEVELOPER_ID env var to sign the app"
    echo "Example: DEVELOPER_ID='Developer ID Application: Your Name' ./build.sh"
fi

# Print final info
echo ""
echo "Build complete!"
echo "Location: $APP_BUNDLE"
echo ""
echo "To run: open '$APP_BUNDLE'"
echo "To install: cp -r '$APP_BUNDLE' /Applications/"
