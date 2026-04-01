export type StoredLocation = {
  latitude: number;
  longitude: number;
  grantedAt: number;
};

const LOCATION_KEY = "seekeatz_user_location";

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

