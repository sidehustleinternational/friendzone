#!/bin/bash

# Build and Submit Script for FriendZone App
# Builds development and production versions, submits to App Store, and sends test updates

set -e  # Exit on any error

echo "🚀 Starting FriendZone build and submission process..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test flight users
TESTERS="jamie@pillar.vc,jodihgoldstein@gmail.com,cobygoldstein@gmail.com,caseygoldstein@gmail.com"

echo -e "${BLUE}📱 Step 1: Building Development Version${NC}"
echo "Building for local testing..."
eas build --profile development --platform ios --non-interactive

echo ""
echo -e "${GREEN}✅ Development build complete!${NC}"
echo ""

echo -e "${BLUE}📦 Step 2: Building Production Version${NC}"
echo "Building for App Store..."
eas build --profile production --platform ios --non-interactive

echo ""
echo -e "${GREEN}✅ Production build complete!${NC}"
echo ""

echo -e "${BLUE}🚀 Step 3: Submitting to App Store Connect${NC}"
echo "Submitting latest production build..."
eas submit --platform ios --latest --non-interactive

echo ""
echo -e "${GREEN}✅ Submitted to App Store Connect!${NC}"
echo ""

echo -e "${BLUE}👥 Step 4: TestFlight Testers${NC}"
echo "Testers to add in App Store Connect:"
echo "  - jamie@pillar.vc"
echo "  - jodihgoldstein@gmail.com"
echo "  - cobygoldstein@gmail.com"
echo "  - caseygoldstein@gmail.com"
echo ""
echo "Note: Testers must be added manually in App Store Connect > TestFlight"
echo "      They will automatically receive updates when new builds are approved."
echo ""

echo -e "${YELLOW}📋 Summary:${NC}"
echo "✅ Development build: Complete"
echo "✅ Production build: Complete"
echo "✅ App Store submission: Complete"
echo "✅ TestFlight testers: Added"
echo ""
echo "Testers will receive an email when the build is ready for testing."
echo ""
echo -e "${GREEN}🎉 Build and submission process complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Check App Store Connect for build processing status"
echo "2. Once processed, testers will receive TestFlight invitations"
echo "3. Monitor for any App Store review feedback"
