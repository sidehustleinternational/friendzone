# Location Service Redesign

## Current Problems

1. **Zone oscillates every 30 seconds** between Weston (wrong) and Back Bay (correct)
2. **Multiple triggers** calling `checkLocationAndUpdateZones()`:
   - App start
   - Every 30 seconds (setInterval)
   - After creating zone
   - On 100m+ movement
   - After accepting friend request
3. **Complex hysteresis logic** with cached state
4. **GPS accuracy threshold** rejecting valid readings
5. **No visibility** into what's actually happening

## Root Cause Analysis

**The oscillation pattern suggests:**
- Location service is getting TWO different GPS readings
- One reading shows Weston (15 miles away)
- One reading shows Back Bay (correct)
- They alternate every 30 seconds

**Possible causes:**
1. **Stale GPS cache** - iOS returning old cached location
2. **Multiple location subscriptions** - Different subscriptions returning different data
3. **Race condition** - Multiple simultaneous location checks interfering
4. **Zone detection bug** - Incorrectly calculating which zone user is in

## Proposed Solution

### **Simplify to bare minimum:**

1. **Single location subscription** - Use `watchPositionAsync` instead of polling
2. **Remove hysteresis** - Just use simple distance calculation
3. **Remove accuracy threshold** - Accept all GPS readings
4. **Remove cached state** - Always calculate fresh from GPS
5. **Add comprehensive logging** - Log every GPS reading and zone calculation

### **New Architecture:**

```typescript
// Single subscription that watches for location changes
Location.watchPositionAsync({
  accuracy: Location.Accuracy.Balanced,
  distanceInterval: 100, // Only update if moved 100m
}, async (location) => {
  // Log GPS reading
  await logToFirestore('gps_reading', {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
    accuracy: location.coords.accuracy,
    timestamp: location.timestamp,
  });
  
  // Get all zones
  const zones = await getUserZones();
  
  // Find closest zone
  const closestZone = findClosestZone(location.coords, zones);
  
  // Check if inside any zone
  const currentZone = zones.find(zone => {
    const distance = calculateDistance(location.coords, zone);
    return distance <= zone.radius;
  });
  
  // Log zone detection
  await logToFirestore('zone_detected', {
    zoneId: currentZone?.id || 'none',
    zoneName: currentZone?.name || 'none',
    distance: closestZone.distance,
  });
  
  // Update Firebase
  await updateUserLocation({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    isAtHome: !!currentZone,
    currentHomeId: currentZone?.id || null,
  });
  
  // Log Firebase update
  await logToFirestore('firebase_updated', {
    zoneId: currentZone?.id || 'none',
  });
});
```

### **Benefits:**
- ✅ Single source of truth (one subscription)
- ✅ No polling (battery efficient)
- ✅ No complex hysteresis
- ✅ No cached state
- ✅ Full visibility via Firestore logs
- ✅ Simple, understandable logic

### **Implementation Plan:**

1. Create new `locationServiceV2.ts`
2. Implement simple watch-based system
3. Add comprehensive Firestore logging
4. Test in parallel with old system
5. Switch over once verified
6. Remove old system

## Next Steps

1. Implement `locationServiceV2.ts`
2. Update `HomesScreen.tsx` to use new service
3. Build and test
4. Monitor Firestore logs to verify correct behavior
