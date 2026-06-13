export type StoredLocation = {
  latitude: number;
  longitude: number;
  grantedAt: number;
};

const LOCATION_KEY = "seekeatz_user_location";
const LOCATION_SEARCH_PROMPTED_KEY = "seekeatz_location_search_prompted";

let pendingLocationRequest: Promise<StoredLocation | null> | null = null;

export function getStoredLocation(): StoredLocation | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocation;
    if (
      typeof parsed?.latitude === "number" &&
      typeof parsed?.longitude === "number"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function storeLocation(latitude: number, longitude: number) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: StoredLocation = {
    latitude,
    longitude,
    grantedAt: Date.now(),
  };

  window.localStorage.setItem(LOCATION_KEY, JSON.stringify(payload));
}

function hasPromptedForSearchLocation(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(LOCATION_SEARCH_PROMPTED_KEY) === "true";
}

function markPromptedForSearchLocation() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCATION_SEARCH_PROMPTED_KEY, "true");
}

export async function requestAndStoreLocation(): Promise<StoredLocation | null> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: StoredLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          grantedAt: Date.now(),
        };

        storeLocation(location.latitude, location.longitude);
        resolve(location);
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  });
}

export async function ensureSearchLocation(): Promise<StoredLocation | null> {
  const stored = getStoredLocation();
  if (stored) {
    return stored;
  }

  if (hasPromptedForSearchLocation()) {
    return null;
  }

  if (pendingLocationRequest) {
    return pendingLocationRequest;
  }

  pendingLocationRequest = (async () => {
    try {
      return await requestAndStoreLocation();
    } finally {
      markPromptedForSearchLocation();
      pendingLocationRequest = null;
    }
  })();

  return pendingLocationRequest;
}

export function clearLocationSearchPrompt(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LOCATION_SEARCH_PROMPTED_KEY);
}

export async function refreshSearchLocation(): Promise<StoredLocation | null> {
  clearLocationSearchPrompt();
  return requestAndStoreLocation();
}

export function getLocationAccessState(): "enabled" | "disabled" | "unsupported" {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return "unsupported";
  }

  return getStoredLocation() ? "enabled" : "disabled";
}
