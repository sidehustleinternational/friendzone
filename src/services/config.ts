// Central place to pull runtime config from secure environment variables

import { getGoogleMapsApiKey as getSecureGoogleMapsApiKey } from '../config/environment';

export function getGoogleMapsApiKey(): string {
  return getSecureGoogleMapsApiKey();
}
