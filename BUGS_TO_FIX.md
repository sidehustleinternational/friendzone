# Bugs To Fix

## Priority 1: Critical

### Bug #1: Zone Membership Update Fails During Friend Request Acceptance
- **File:** `src/services/firebase.ts` (line 969)
- **Problem:** Firestore rules prevent adding user to zone members
- **Impact:** Zones don't appear on Zones screen after accepting friend request
- **Fix:** Update Firestore rules to allow zone creator to add members
- **Status:** TODO

### Bug #2: GPS Coordinates Not Validated
- **File:** `src/services/locationService.ts` (line 190)
- **Problem:** Undefined GPS coordinates get written to Firestore, then silently dropped
- **Impact:** User shows `isAtHome: true` but `currentHomeIds: []` and `lastLocation: undefined`
- **Fix:** Add validation before updateDoc
- **Status:** TODO

## Priority 2: High

### Bug #3: Zone Subscription Race Condition
- **File:** `src/screens/HomesScreen.tsx` (line 365)
- **Problem:** Subscription starts after component mount, may miss immediate updates
- **Impact:** Zones don't appear immediately after being added
- **Fix:** Force refresh after critical operations
- **Status:** TODO

### Bug #4: Entry Buffer Too Aggressive for Small Zones
- **File:** `src/services/locationService.ts` (lines 86-87)
- **Problem:** 50m entry buffer makes small zones hard to detect
- **Impact:** User must be deep inside zone to be detected (2-mile zone → 1.97 miles effective)
- **Fix:** Reduce or remove entry buffer
- **Status:** TODO

## Priority 3: Medium

### Bug #5: Friends Showing "Away" (Backward Compatibility)
- **Status:** FIXED (backward compatibility added)
- **Build:** Included in continued-fixes branch

### Bug #6: Badge Count Showing Outgoing Requests
- **Status:** FIXED (only counts incoming now)
- **Build:** Included in continued-fixes branch

### Bug #7: Performance - Friend Request Acceptance Takes 20 Seconds
- **Status:** FIXED (parallelized operations)
- **Build:** Included in continued-fixes branch
