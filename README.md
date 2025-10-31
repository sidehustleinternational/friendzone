# 🏠 FriendZone - Advanced Location Sharing with Friends

FriendZone is a sophisticated React Native mobile application built with Expo that enables seamless location sharing with friends at specific places. Create "Zones" (locations with custom names and radius), add friends, and track when friends are at shared locations with real-time updates and beautiful map visualizations.

## ✨ Features

### 🎯 **Multi-Zone Support**
- **Overlapping Zones** - Users can be in multiple zones simultaneously
- **Smart Zone Detection** - Advanced GPS accuracy with no false rejections
- **Real-time Updates** - Instant zone entry/exit notifications

### 🗺️ **Interactive Map Tab**
- **Apple Maps Integration** - Beautiful, native map experience
- **Colorful Zone Circles** - Visual zone boundaries with status colors
  - 🔵 Blue: You're currently here
  - 🟢 Green: Friends are here
  - 🟠 Orange: Empty zones
- **Zoom-Responsive Labels** - Text scales with map zoom level
- **Friend Count Display** - Live "2/4" friend count per zone

### 🔐 **Secure Authentication**
- **Apple Sign-In** - Native iOS authentication
- **Phone Verification** - SMS-based verification system
- **Firebase Auth** - Enterprise-grade security

### 👥 **Advanced Friend Management**
- **Phone Number Search** - Find friends by phone number
- **Real-time Status** - See which zones friends are in
- **Smart Formatting** - E.164 backend, user-friendly display
- **Permission System** - Granular location sharing controls

### 📍 **Intelligent Location Services**
- **Background Tracking** - Continuous location monitoring
- **Geofencing** - Automatic zone detection
- **Battery Optimized** - Efficient location updates
- **Privacy First** - Location data stays with your friends

### 🎨 **Modern UI/UX**
- **Dynamic Zone Cards** - Blue for current zones, red for away
- **Clean Interface** - Intuitive navigation and controls
- **Real-time Updates** - Live data without refresh needed
- **Accessibility** - VoiceOver and accessibility support

## 🚀 Tech Stack

- **Framework**: Expo SDK 51 (React Native)
- **Language**: TypeScript with strict typing
- **Authentication**: Firebase Auth + Apple Sign-In
- **Database**: Firebase Firestore with real-time listeners
- **Maps**: Apple Maps (iOS native)
- **Location**: Expo Location with background permissions
- **Navigation**: React Navigation v6
- **State Management**: React Hooks + Firebase listeners
- **Push Notifications**: Expo Notifications
- **Build System**: EAS Build for production

## 📱 App Architecture

### Main Screens
- **Auth Screen** - Apple Sign-In and phone verification
- **Zones Tab** - Create/manage zones, see friend status
- **Map Tab** - Visual map with zone circles and friend counts
- **Broadcast Tab** - Share your location status
- **Friends Tab** - Manage friend connections
- **Profile Tab** - User settings and privacy controls

### Navigation Flow
```
Auth Screen → Main Tab Navigator
                ├── Zones Screen (Home)
                ├── Map Screen (NEW!)
                ├── Broadcast Screen
                ├── Friends Screen
                └── Profile Screen
            → Add Friends Screen (Modal)
            → Privacy Policy / Terms
```

## 🛠 Installation & Setup

### Prerequisites
- **Node.js** (>=18)
- **Expo CLI** (`npm install -g @expo/cli`)
- **EAS CLI** (`npm install -g eas-cli`)
- **iOS Simulator** (Xcode required)
- **Firebase Project** with Authentication and Firestore
- **Apple Developer Account** (for Apple Sign-In)

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/jamiegoldstein/Homer.git
   cd FriendZone
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase**
   - Update `firebaseConfig.ts` with your Firebase project credentials
   - Enable Firebase Authentication (Apple Sign-In provider)
   - Enable Firestore Database
   - Set up Firestore security rules (see Configuration section)

4. **Configure Apple Sign-In**
   - Create Services ID in Apple Developer Console
   - Configure Firebase Authentication Apple provider
   - Update bundle identifier in `app.json`

5. **Start the development server**
   ```bash
   npx expo start --clear
   npx expo run:ios  # for iOS simulator
   ```

## 🔧 Configuration

### Firebase Setup
The app uses Firebase for authentication and data storage. Update `firebaseConfig.ts`:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### Firestore Security Rules
Essential security rules for the app:

```javascript
// Users collection - allow authenticated users to read all users (for friend search)
match /users/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == userId;
}

// Homes collection - allow members to read/write
match /homes/{homeId} {
  allow read, write: if request.auth != null && 
    request.auth.uid in resource.data.members;
}

// Friends collection - allow users to manage their friendships
match /friends/{friendId} {
  allow read, write: if request.auth != null && 
    (request.auth.uid == resource.data.userId || 
     request.auth.uid == resource.data.friendUserId);
}
```

### Apple Sign-In Configuration
1. **Apple Developer Console:**
   - Create Services ID: `com.jamiegoldstein.FriendZone.signin`
   - Enable Sign In with Apple
   - Configure domain and return URL

2. **Firebase Console:**
   - Enable Apple Sign-In provider
   - Add Services ID and Team ID

### Environment Variables
For production builds, configure:
- **Google Maps API Key** (if using Google Maps)
- **Firebase Web API Key**
- **Apple Services ID**

## 📂 Project Structure

```
FriendZone/
├── src/
│   ├── navigation/          # Navigation configuration
│   │   ├── RootNavigator.tsx
│   │   └── MainTabNavigator.tsx
│   ├── screens/            # App screens
│   │   ├── AuthScreen.tsx
│   │   ├── HomesScreen.tsx      # Main zones screen
│   │   ├── MapScreen.tsx        # NEW: Interactive map
│   │   ├── BroadcastScreen.tsx  # Location sharing
│   │   ├── FriendsScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   └── AddFriendsScreen.tsx
│   ├── services/           # External services
│   │   ├── firebase.ts         # Firebase integration
│   │   ├── locationService.ts  # GPS and geofencing
│   │   ├── notificationService.ts
│   │   └── appleAuth.ts        # Apple Sign-In
│   ├── components/         # Reusable components
│   │   └── PhoneNumberInput.tsx
│   ├── utils/             # Utility functions
│   │   ├── logger.ts
│   │   └── dataRetention.ts
│   └── types/             # TypeScript definitions
│       └── index.ts
├── plugins/               # Custom Expo plugins
│   └── withGoogleMaps.js
├── assets/               # Images and icons
├── firebaseConfig.ts     # Firebase configuration
├── app.json             # Expo configuration
└── eas.json            # EAS Build configuration
```

## 🚀 Deployment

### Development Builds
```bash
# Start development server
npx expo start --clear

# Run on iOS simulator
npx expo run:ios

# Run on physical device
npx expo start --tunnel
# Scan QR code with Expo Go app
```

### Production Builds (EAS)

**Recommended: Use GitHub Codespaces**
```bash
# In Codespaces terminal
cd FriendZone
git pull origin continued-fixes
./build.sh  # Auto-increments build number and submits to TestFlight
```

**Alternative: Manual EAS Build**
```bash
# Configure EAS (first time)
eas login
eas build:configure

# Build for iOS
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios --latest
```

**Note**: Using `./build.sh` in Codespaces prevents build number conflicts and automates the entire build process.

### Branch Strategy
- **`main`** - Stable production code
- **`continued-fixes`** - Current development branch (UX improvements)
- **`multi-zone-support`** - Multi-zone implementation (merged)
- **`map-feature`** - Map tab implementation (merged)

## 🔮 Roadmap

### ✅ Completed Features
- Multi-zone support with overlapping zones
- Interactive map with Apple Maps
- Apple Sign-In integration
- Real-time friend tracking
- Background location services
- Push notifications
- Advanced UI/UX improvements

### 🚧 In Development
- **Enhanced Friend Invitations** - Improved zone selection UX with pre-selected zones
- **Simulator Testing** - Debug bypasses for phone verification and Apple Sign-In
- **UI/UX Polish** - Compact layouts and better vertical spacing
- Android support optimization
- Enhanced notification system

### 📋 Planned Features
- **Group Zones** - Shared zones for multiple friend groups
- **Zone History** - Track time spent in zones
- **Smart Suggestions** - AI-powered zone recommendations
- **Integration APIs** - Connect with other location apps
- **Advanced Analytics** - Location insights and patterns

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Jamie Goldstein**
- GitHub: [@jamiegoldstein](https://github.com/jamiegoldstein)
- Project: [FriendZone on GitHub](https://github.com/jamiegoldstein/Homer)

## 🛠️ Development Environment

### Recommended Setup
- **Primary Development**: Windsurf IDE with Cascade AI assistant
- **Builds**: GitHub Codespaces for EAS builds (avoids local build issues)
- **Testing**: iOS Simulator for development, TestFlight for production testing
- **Version Control**: Git with feature branches and pull requests

### Build Status
- **Current Version**: Build 220+
- **Active Branch**: `continued-fixes`
- **Last Major Release**: UX improvements for friend invitations and zone selection
- **Platform**: iOS (primary), Android (planned)
- **Build Method**: GitHub Codespaces with `./build.sh` script

### Known Issues
- **Simulator Limitations**: 
  - Push notifications don't work on iOS simulators
  - SMS verification requires real device
  - Use debug bypass buttons in development mode
- **Location Permissions**: Requires background location for full functionality
- **Apple Sign-In**: Requires proper Services ID configuration in Apple Developer Console

### Development Features
- **Debug Bypasses** (Dev mode only):
  - Skip Apple Sign-In with test email/password
  - Skip phone verification with entered phone number
  - Skip onboarding screen
- **Simulator Support**: Full app testing without SMS or push notifications

### Performance Notes
- **Battery Usage**: Optimized background location tracking
- **Network Usage**: Efficient Firebase real-time listeners
- **Memory Usage**: Proper cleanup of location services and listeners
- **Startup Time**: Fast cold start with lazy loading

---

Built with ❤️ using **Expo**, **Firebase**, **Apple Maps**, and **TypeScript**

*"Connecting friends through intelligent location sharing"*
