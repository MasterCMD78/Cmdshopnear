import { z } from "zod";

export const coordinateSchema = z.number().finite();

export const locationUpdateSchema = z.object({
  latitude: coordinateSchema.min(-90).max(90).nullable().optional(),
  longitude: coordinateSchema.min(-180).max(180).nullable().optional(),
  accuracy: z.number().finite().min(0).max(100_000).nullable().optional(),
  enabled: z.boolean().optional(),
  visibility: z.enum(["public", "private"]).optional(),
  permissionStatus: z.enum(["prompt", "granted", "denied", "unavailable"]).optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
}).superRefine((value, context) => {
  const hasLatitude = value.latitude !== undefined && value.latitude !== null;
  const hasLongitude = value.longitude !== undefined && value.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Latitude and longitude must be provided together" });
  }
});

export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type TravelEstimate = {
  distanceMeters: number | null;
  durationSeconds: number | null;
};

/**
 * A deliberately provider-neutral boundary. A future Google, Mapbox, OSM, or
 * Apple implementation can supply travel estimates without changing search
 * or marketplace business logic.
 */
export interface MapProvider {
  readonly name: string;
  getTravelEstimate(from: Coordinates, to: Coordinates): Promise<TravelEstimate>;
}

export const nullMapProvider: MapProvider = {
  name: "none",
  async getTravelEstimate() {
    return { distanceMeters: null, durationSeconds: null };
  },
};

// Keep provider selection isolated here; replacing this adapter does not
// change the nearby search or marketplace logic.
const activeMapProvider: MapProvider = nullMapProvider;

export function getMapProvider() {
  return activeMapProvider;
}

export function parseCoordinates(latitude: string | number | null | undefined, longitude: string | number | null | undefined): Coordinates | null {
  if (latitude == null || longitude == null) return null;
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) return null;
  if (parsedLatitude < -90 || parsedLatitude > 90 || parsedLongitude < -180 || parsedLongitude > 180) return null;
  return { latitude: parsedLatitude, longitude: parsedLongitude };
}

export function haversineDistanceKm(from: Coordinates, to: Coordinates) {
  const earthRadiusKm = 6_371;
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(from.latitude * Math.PI / 180) * Math.cos(to.latitude * Math.PI / 180) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function safePublicCoordinates<T extends {
  latitude?: string | number | null;
  longitude?: string | number | null;
  locationEnabled?: boolean;
  locationVisibility?: string;
  locationAccuracy?: number | null;
  locationUpdatedAt?: Date | null;
  verificationStatus?: string;
}>(record: T) {
  const coordinates = record.locationEnabled && record.locationVisibility === "public"
    && record.verificationStatus === "approved"
    ? parseCoordinates(record.latitude, record.longitude)
    : null;
  const {
    latitude: _latitude,
    longitude: _longitude,
    locationAccuracy: _locationAccuracy,
    locationUpdatedAt: _locationUpdatedAt,
    ...rest
  } = record;
  return {
    ...rest,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };
}

export function locationFields(data: LocationUpdate) {
  const hasCoordinates = data.latitude !== undefined || data.longitude !== undefined;
  return {
    ...(data.latitude === undefined ? {} : { latitude: data.latitude == null ? null : String(data.latitude) }),
    ...(data.longitude === undefined ? {} : { longitude: data.longitude == null ? null : String(data.longitude) }),
    ...(data.accuracy === undefined ? {} : { locationAccuracy: data.accuracy == null ? null : Math.round(data.accuracy) }),
    ...(data.enabled === undefined ? {} : { locationEnabled: data.enabled }),
    ...(data.visibility === undefined ? {} : { locationVisibility: data.visibility }),
    ...(data.permissionStatus === undefined ? {} : { locationPermissionStatus: data.permissionStatus }),
    ...(hasCoordinates ? { locationUpdatedAt: new Date() } : {}),
    ...(data.city === undefined ? {} : { city: data.city }),
    ...(data.state === undefined ? {} : { state: data.state }),
  };
}

export type LocationResponse = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updatedAt: Date | null;
  enabled: boolean;
  visibility: string;
  permissionStatus: string;
  city?: string | null;
  state?: string | null;
};

export function serializeLocation(record: {
  latitude?: string | null;
  longitude?: string | null;
  locationAccuracy?: number | null;
  locationUpdatedAt?: Date | null;
  locationEnabled?: boolean;
  locationVisibility?: string;
  locationPermissionStatus?: string;
  city?: string | null;
  state?: string | null;
}): LocationResponse {
  const coordinates = parseCoordinates(record.latitude, record.longitude);
  return {
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    accuracy: record.locationAccuracy ?? null,
    updatedAt: record.locationUpdatedAt ?? null,
    enabled: record.locationEnabled ?? false,
    visibility: record.locationVisibility ?? "private",
    permissionStatus: record.locationPermissionStatus ?? "prompt",
    ...(record.city !== undefined ? { city: record.city } : {}),
    ...(record.state !== undefined ? { state: record.state } : {}),
  };
}