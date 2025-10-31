export interface User {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string; // Optional for backward compatibility
  isVerified: boolean;
  createdAt: Date;
  expoPushToken?: string; // For push notifications
  pushTokenUpdatedAt?: string;
  zoneNicknames?: { [zoneId: string]: string }; // Personal zone names
}

export interface Home {
  id: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  radius: number; // in miles
  createdBy: string; // Owner who created the zone - only they can edit location/radius
  userId?: string; // Legacy field - same as createdBy
  members: string[];
  createdAt: Date;
}

export interface Friend {
  id: string;
  userId: string;
  friendUserId: string;
  name: string;
  phoneNumber: string;
  status: 'pending' | 'connected';
  sharedHomes: string[]; // Zone permissions (mutual consent required to change)
  activeHomes?: string[]; // Zone status (individual control - which zones are currently ON)
  isCurrentlyAtHome?: boolean;
  currentHomeIds?: string[]; // Array of zone IDs the friend is currently in
  currentHomeId?: string; // Legacy field - backward compatibility for old app versions
  lastSeen?: number;
  broadcastLocation?: string;
  broadcastMessage?: string;
  broadcastTimestamp?: any;
  // Proximity detection (Magnet feature)
  proximityAlertEnabled?: boolean;
  proximityAlertRadius?: number; // in miles
  lastKnownLocation?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId?: string | null; // Optional - null if user doesn't exist on FriendZone yet
  toPhoneNumber: string; // Always present - the phone number of the recipient
  fromUserName: string;
  status: 'pending' | 'accepted' | 'rejected';
  homeId?: string; // Legacy support
  homeIds?: string[]; // New array format
  createdAt: Date;
}

export interface ZoneRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromUserName: string;
  toUserName: string;
  status: 'pending' | 'accepted' | 'rejected';
  requestType: 'add' | 'remove'; // Adding zones to share or removing zones
  zoneIds: string[]; // Array of zone IDs being requested
  zoneNames: string[]; // Array of zone names for display
  message?: string; // Optional message from requester
  createdAt: Date;
}

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Main: undefined;
  AddFriends: {
    homeId?: string;
  };
  SelectFriends: {
    preSelectedZoneId?: string;
  };
  SelectZones: {
    selectedFriends: Array<{
      name: string;
      phoneNumber: string;
      source: 'contact' | 'manual' | 'zonefriend';
      existingSharedZones?: string[]; // For existing friends, their current shared zones
    }>;
    preSelectedZoneId?: string;
  };
  Profile: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
};

export type MainTabParamList = {
  Zones: undefined;
  Map: undefined;
  Broadcast: undefined;
  Friends: undefined;
  Profile: undefined;
};