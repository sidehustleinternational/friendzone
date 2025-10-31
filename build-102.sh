#!/bin/bash
# Build 102 - Simple build script

echo "🚀 Starting build 102..."

# Set environment variable to skip VCS check
export EAS_NO_VCS=1

# Run build
eas build --platform ios --profile production --no-wait

echo "✅ Build submitted!"
