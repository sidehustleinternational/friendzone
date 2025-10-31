# Simple Auth Flow (What We Should Do)

## On App Start:
1. Check AsyncStorage for 'hasSeenOnboarding'
2. If NOT seen:
   - Sign out Firebase user (clear keychain)
   - Show onboarding
   - After onboarding: show auth screen
3. If seen:
   - Let Firebase auth listener determine if user is signed in
   - If signed in: show Main
   - If not: show Auth

## Key Principle:
**Onboarding check happens BEFORE auth check**

## Implementation:
```typescript
// 1. Check onboarding synchronously on mount
const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');

if (!hasSeenOnboarding) {
  // Clear any persisted auth
  await auth.signOut();
  // Show onboarding
  return <Onboarding />;
}

// 2. Only NOW check auth state
const user = auth.currentUser;
if (!user) {
  return <Auth />;
}

return <Main />;
```

## No complex flags, no race conditions, just simple sequential checks.
