import type {
  AIHistory,
  AIHistoryDelete,
  AIRecommendations,
  AISearchInput,
  AISearchResponse,
  AIPreferences,
  AIPreferencesUpdate,
} from "@workspace/api-client-react";

export type AccountType = "customer" | "business" | "service_provider" | "admin";

export type AuthUser = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  accountType: AccountType;
  profilePhoto: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  locationAccuracy?: number | null;
  locationUpdatedAt?: string | null;
  locationEnabled?: boolean;
  locationPermissionStatus?: string;
  preferredLanguage: string;
  notificationsEnabled: boolean;
  status: string;
  createdAt: string;
};

type AuthResult = {
  authenticated: boolean;
  needsRegistration: boolean;
  phone: string | null;
  user: AuthUser | null;
};

type OtpChallenge = {
  challengeId: string;
  expiresAt: string;
  developmentOtp: string | null;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Something went wrong");
  return data as T;
}

export function requestOtp(phone: string) {
  return request<OtpChallenge>("/api/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) });
}

export function verifyOtp(phone: string, code: string) {
  return request<AuthResult>("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, code }) }).then((result) => {
    if (result.authenticated) clearAIConversation();
    return result;
  });
}

export function registerAccount(input: {
  fullName: string;
  accountType: Exclude<AccountType, "admin">;
  city?: string;
  state?: string;
  address?: string;
}) {
  return request<AuthResult>("/api/register", { method: "POST", body: JSON.stringify(input) });
}

export async function getSession() {
  try {
    return await request<AuthResult>("/api/auth/session");
  } catch {
    return { authenticated: false, needsRegistration: false, phone: null, user: null } satisfies AuthResult;
  }
}

export async function logout() {
  const result = await request<{ message: string }>("/api/auth/logout", { method: "POST" });
  clearAIConversation();
  return result;
}

const AI_CONVERSATION_STORAGE_KEY = "shopnear:ai:conversation";

export function getAIConversationId() {
  try {
    return window.sessionStorage.getItem(AI_CONVERSATION_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberAIConversationId(conversationId: string) {
  try {
    window.sessionStorage.setItem(AI_CONVERSATION_STORAGE_KEY, conversationId);
  } catch {
    // Session storage can be disabled; the current page can still use the response.
  }
}

export function clearAIConversation() {
  try {
    window.sessionStorage.removeItem(AI_CONVERSATION_STORAGE_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}

export function searchWithAI(input: AISearchInput) {
  return request<AISearchResponse>("/api/ai/search", { method: "POST", body: JSON.stringify(input) });
}

export function getAIRecommendations(params: { latitude?: number; longitude?: number; radiusKm?: number } = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && query.set(key, String(value)));
  return request<AIRecommendations>(`/api/ai/recommendations${query.size ? `?${query.toString()}` : ""}`);
}

export function getAIHistory() {
  return request<AIHistory>("/api/ai/history");
}

export function clearAIHistory() {
  return request<AIHistoryDelete>("/api/ai/history", { method: "DELETE" });
}

export function getAIPreferences() {
  return request<AIPreferences>("/api/ai/preferences");
}

export function updateAIPreferences(input: AIPreferencesUpdate) {
  return request<AIPreferences>("/api/ai/preferences", { method: "PUT", body: JSON.stringify(input) });
}

export function updateProfile(input: Record<string, unknown>) {
  return request<AuthUser>("/api/profile", { method: "PUT", body: JSON.stringify(input) });
}

export type UserLocation = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  updatedAt: string | null;
  enabled: boolean;
  visibility: "public" | "private" | string;
  permissionStatus: "prompt" | "granted" | "denied" | "unavailable" | string;
  city?: string | null;
  state?: string | null;
};

export function getLocation() {
  return request<UserLocation>("/api/location");
}

export function updateLocation(input: {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  enabled?: boolean;
  visibility?: "public" | "private";
  permissionStatus?: "prompt" | "granted" | "denied" | "unavailable";
  city?: string | null;
  state?: string | null;
}) {
  return request<UserLocation>("/api/location", { method: "PUT", body: JSON.stringify(input) });
}

export type BusinessRecord = {
  id: string;
  ownerId?: string;
  businessName: string;
  category: string;
  description: string | null;
  businessAddress: string | null;
  phone: string | null;
  businessLogo?: string | null;
  coverPhoto?: string | null;
  workingHours?: Record<string, unknown> | null;
  website?: string | null;
  averageRating?: string;
  totalReviews?: number;
  verificationStatus: string;
  latitude?: number | null;
  longitude?: number | null;
  locationEnabled?: boolean;
  locationVisibility?: string;
  distanceKm?: number | null;
};

export type ServiceProviderRecord = {
  id: string;
  profession: string;
  experience: string | null;
  skills: string[] | null;
  location: string | null;
  verificationStatus: string;
  latitude?: number | null;
  longitude?: number | null;
  locationEnabled?: boolean;
  locationVisibility?: string;
  distanceKm?: number | null;
};

export function getMyBusiness() {
  return request<BusinessRecord>("/api/businesses/mine");
}

export function saveBusiness(input: Record<string, unknown>, id?: string) {
  return request<BusinessRecord>(id ? `/api/businesses/${id}` : "/api/businesses", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
}

export function updateBusinessLocation(id: string, input: { latitude: number; longitude: number; accuracy: number; enabled: boolean; visibility: "public" | "private" }) {
  return request<UserLocation>(`/api/businesses/${id}/location`, { method: "PUT", body: JSON.stringify(input) });
}

export function getMyServiceProvider() {
  return request<ServiceProviderRecord>("/api/service-providers/mine");
}

export function saveServiceProvider(input: Record<string, unknown>, id?: string) {
  return request<ServiceProviderRecord>(id ? `/api/service-providers/${id}` : "/api/service-providers", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
}

export function updateServiceProviderLocation(id: string, input: { latitude: number; longitude: number; accuracy: number; enabled: boolean; visibility: "public" | "private" }) {
  return request<UserLocation>(`/api/service-providers/${id}/location`, { method: "PUT", body: JSON.stringify(input) });
}

export type MarketplaceProduct = {
  id: string;
  businessId?: string;
  name: string;
  description: string | null;
  imagePaths?: string[];
  primaryImagePath?: string | null;
  priceCents: number;
  regularPriceCents?: number | null;
  discountPriceCents?: number | null;
  brand?: string | null;
  condition?: string | null;
  specifications?: Record<string, unknown> | null;
  location?: string | null;
  tags?: string[];
  isAvailable: boolean;
  isVisible: boolean;
  status: string;
  isFeatured?: boolean;
  favoriteCount?: number;
  viewCount?: number;
  createdAt?: string;
  distanceKm?: number | null;
  travelDistanceMeters?: number | null;
  travelTimeSeconds?: number | null;
};

export type MarketplaceService = {
  id: string;
  businessId?: string | null;
  providerId?: string | null;
  name: string;
  description: string | null;
  imagePaths?: string[];
  primaryImagePath?: string | null;
  priceFromCents: number | null;
  pricingOptions?: Record<string, unknown>[] | null;
  serviceRadius: number | null;
  availability?: Record<string, unknown> | null;
  workingHours?: Record<string, unknown> | null;
  emergencyService?: boolean;
  bookingReady?: boolean;
  estimatedDuration?: number | null;
  location?: string | null;
  tags?: string[];
  isAvailable: boolean;
  isVisible: boolean;
  status: string;
  isFeatured?: boolean;
  favoriteCount?: number;
  viewCount?: number;
  createdAt?: string;
  distanceKm?: number | null;
  travelDistanceMeters?: number | null;
  travelTimeSeconds?: number | null;
};

export type BusinessDashboard = {
  business: BusinessRecord | null;
  metrics: {
    products: number;
    availableProducts: number;
    services: number;
    visibleProducts: number;
    featuredProducts: number;
    views: number;
    favorites: number;
    messages: number;
    verificationStatus: string;
    visibility: string;
    recentActivity: { label?: string; createdAt?: string }[];
    quickActions: string[];
    sales: { status: string; value: number };
    analytics: { status: string; value: number };
  };
};

export function getBusinessDashboard() {
  return request<BusinessDashboard>("/api/business/dashboard");
}

export function getMyProducts() {
  return request<MarketplaceProduct[]>("/api/business/products");
}

export function saveProduct(input: Record<string, unknown>, id?: string) {
  return request<MarketplaceProduct>(id ? `/api/business/products/${id}` : "/api/business/products", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
}

export function deleteProduct(id: string) {
  return request<{ message: string }>(`/api/business/products/${id}`, { method: "DELETE" });
}

export function getMyServices() {
  return request<MarketplaceService[]>("/api/provider/services");
}

export function saveService(input: Record<string, unknown>, id?: string) {
  return request<MarketplaceService>(id ? `/api/provider/services/${id}` : "/api/provider/services", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
}

export function deleteService(id: string) {
  return request<{ message: string }>(`/api/provider/services/${id}`, { method: "DELETE" });
}

export type MarketplaceCatalog = {
  products: MarketplaceProduct[];
  services: MarketplaceService[];
  page: number;
  limit: number;
};

export function getMarketplaceCatalog(params: Record<string, string | number | boolean | undefined> = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && query.set(key, String(value)));
  return request<MarketplaceCatalog>(`/api/marketplace/catalog${query.size ? `?${query.toString()}` : ''}`);
}

export type MarketplaceSearchResult = MarketplaceCatalog & {
  businesses: BusinessRecord[];
  serviceProviders: ServiceProviderRecord[];
};

export function searchMarketplace(query: string, options: { verified?: boolean; city?: string; state?: string; featured?: boolean; newest?: boolean } = {}) {
  const params = new URLSearchParams({ query });
  Object.entries(options).forEach(([key, value]) => value !== undefined && value !== '' && params.set(key, String(value)));
  return request<MarketplaceSearchResult>(`/api/marketplace/search?${params.toString()}`);
}

export type NearbyMarketplace = MarketplaceSearchResult & {
  center: { latitude: number; longitude: number };
  radiusKm: number;
  mapProvider: string;
  businesses: (BusinessRecord & { distanceKm?: number | null; travelDistanceMeters?: number | null; travelTimeSeconds?: number | null })[];
  serviceProviders: (ServiceProviderRecord & { distanceKm?: number | null; travelDistanceMeters?: number | null; travelTimeSeconds?: number | null })[];
  products: (MarketplaceProduct & { distanceKm?: number | null; travelDistanceMeters?: number | null; travelTimeSeconds?: number | null })[];
  services: (MarketplaceService & { distanceKm?: number | null; travelDistanceMeters?: number | null; travelTimeSeconds?: number | null })[];
};

export function getNearbyMarketplace(params: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  query?: string;
  city?: string;
  state?: string;
  verified?: boolean;
  featured?: boolean;
  newest?: boolean;
}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && query.set(key, String(value)));
  return request<NearbyMarketplace>(`/api/marketplace/nearby?${query.toString()}`);
}

export type FeaturedMarketplace = {
  featuredBusinesses: BusinessRecord[];
  featuredProducts: MarketplaceProduct[];
  featuredServices: MarketplaceService[];
  trendingProducts: MarketplaceProduct[];
  trendingServices: MarketplaceService[];
  newestBusinesses: BusinessRecord[];
  newestProviders: ServiceProviderRecord[];
  newestProducts: MarketplaceProduct[];
  newestServices: MarketplaceService[];
};

export function getFeaturedMarketplace() {
  return request<FeaturedMarketplace>("/api/marketplace/featured");
}

export type BusinessDetail = {
  business: BusinessRecord;
  products: MarketplaceProduct[];
  services: MarketplaceService[];
  relatedBusinesses: BusinessRecord[];
};

export type ProductDetail = {
  product: MarketplaceProduct;
  business: BusinessRecord;
  relatedProducts: MarketplaceProduct[];
  relatedServices: MarketplaceService[];
};

export type ServiceDetail = {
  service: MarketplaceService;
  business: BusinessRecord | null;
  provider: ServiceProviderRecord | null;
  relatedServices: MarketplaceService[];
};

export function getBusinessDetail(id: string) {
  return request<BusinessDetail>(`/api/businesses/${id}`);
}

export function getProductDetail(id: string) {
  return request<ProductDetail>(`/api/products/${id}`);
}

export function getServiceDetail(id: string) {
  return request<ServiceDetail>(`/api/services/${id}`);
}

export type FavoriteItem = {
  id: string;
  targetType: "business" | "product" | "service";
  targetId: string;
  createdAt: string;
  item: BusinessRecord | MarketplaceProduct | MarketplaceService;
};

export type FavoritePage = {
  favorites: FavoriteItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export function getFavorites(options: { page?: number; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (options.page !== undefined) query.set("page", String(options.page));
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  const suffix = query.toString();
  return request<FavoritePage>(`/api/favorites${suffix ? `?${suffix}` : ""}`);
}

export function addFavorite(targetType: FavoriteItem["targetType"], targetId: string) {
  return request<{ targetType: FavoriteItem["targetType"]; targetId: string }>("/api/favorites", {
    method: "POST",
    body: JSON.stringify({ targetType, targetId }),
  });
}

export function removeFavorite(targetType: FavoriteItem["targetType"], targetId: string) {
  return request<{ message: string }>(`/api/favorites/${targetType}/${targetId}`, { method: "DELETE" });
}