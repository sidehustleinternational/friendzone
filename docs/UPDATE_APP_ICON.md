# Update App Icon and Splash Screen

## Current Issue
- App shows white box with 4 concentric circles (default Expo icon)
- Need to update to blue circle with red pin design

## Design
- Blue concentric circles (representing zones)
- Red location pin in center
- Clean, simple, recognizable

## Files to Update

### 1. App Icon (icon.png)
- **Size**: 1024x1024 pixels
- **Format**: PNG with transparency
- **Design**: Blue circles + red pin on white background
- **Location**: `./assets/icon.png`

### 2. Splash Screen (splash-icon.png)
- **Size**: 1024x1024 pixels (or larger)
- **Format**: PNG
- **Design**: Same as icon
- **Location**: `./assets/splash-icon.png`

### 3. Adaptive Icon (Android) (adaptive-icon.png)
- **Size**: 1024x1024 pixels
- **Format**: PNG with transparency
- **Design**: Same as icon (Android will crop to circle)
- **Location**: `./assets/adaptive-icon.png`

### 4. Favicon (favicon.png)
- **Size**: 48x48 pixels
- **Format**: PNG
- **Design**: Simplified version
- **Location**: `./assets/favicon.png`

## Quick Solution: Use Online Tool

### Option 1: Use Figma/Canva (Recommended)
1. Open the SVG file: `assets/icon-source.svg`
2. Export as PNG at 1024x1024
3. Save as:
   - `assets/icon.png`
   - `assets/splash-icon.png`
   - `assets/adaptive-icon.png`

### Option 2: Use Command Line (if you have ImageMagick)
```bash
cd assets

# Convert SVG to PNG (1024x1024)
convert icon-source.svg -resize 1024x1024 icon.png
convert icon-source.svg -resize 1024x1024 splash-icon.png
convert icon-source.svg -resize 1024x1024 adaptive-icon.png
convert icon-source.svg -resize 48x48 favicon.png
```

### Option 3: Use Online Converter
1. Go to: https://cloudconvert.com/svg-to-png
2. Upload `assets/icon-source.svg`
3. Set size to 1024x1024
4. Download and rename to `icon.png`, `splash-icon.png`, `adaptive-icon.png`

### Option 4: Use Expo's Icon Generator (Easiest)
1. Go to: https://icon.kitchen/
2. Upload `assets/icon-source.svg`
3. Download the generated icon pack
4. Replace files in `assets/` folder

## After Updating Files

### 1. Clear Expo Cache
```bash
npx expo start -c
```

### 2. Rebuild App (for native changes)
```bash
# For iOS
npx expo run:ios

# For Android
npx expo run:android
```

### 3. Test
- App icon should show blue circles + red pin
- Splash screen should show same design
- Both iOS and Android

## Design Specifications

### Colors
- Blue: `#1E90FF` (DodgerBlue)
- Red: `#FF5A5F` (FriendZone Red)
- White: `#FFFFFF`

### Layout
- 4 concentric blue circles (fading opacity)
- Red location pin in center
- White circle inside pin
- Clean, minimal design

## Current Status

✅ SVG source file created: `assets/icon-source.svg`
⏳ Need to convert to PNG files
⏳ Need to replace existing icon files
⏳ Need to rebuild app to see changes

## Quick Steps (Summary)

1. Convert `icon-source.svg` to PNG (1024x1024)
2. Replace these files:
   - `assets/icon.png`
   - `assets/splash-icon.png`
   - `assets/adaptive-icon.png`
3. Run `npx expo start -c`
4. Rebuild app if needed

The design is ready - just need to generate the PNG files!
