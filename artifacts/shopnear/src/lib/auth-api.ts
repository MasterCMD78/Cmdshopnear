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
  return request<AuthResult>("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, code }) });
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

export function logout() {
  return request<{ message: string }>("/api/auth/logout", { method: "POST" });
}

export function updateProfile(input: Record<string, unknown>) {
  return request<AuthUser>("/api/profile", { method: "PUT", body: JSON.stringify(input) });
}

export type BusinessRecord = {
  id: string;
  businessName: string;
  category: string;
  description: string | null;
  businessAddress: string | null;
  phone: string | null;
  verificationStatus: string;
};

export type ServiceProviderRecord = {
  id: string;
  profession: string;
  experience: string | null;
  skills: string[] | null;
  location: string | null;
  verificationStatus: string;
};

export function getMyBusiness() {
  return request<BusinessRecord>("/api/businesses/mine");
}

export function saveBusiness(input: Record<string, unknown>, id?: string) {
  return request<BusinessRecord>(id ? `/api/businesses/${id}` : "/api/businesses", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
}

export function getMyServiceProvider() {
  return request<ServiceProviderRecord>("/api/service-providers/mine");
}

export function saveServiceProvider(input: Record<string, unknown>, id?: string) {
  return request<ServiceProviderRecord>(id ? `/api/service-providers/${id}` : "/api/service-providers", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
}

export type MarketplaceProduct = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  isVisible: boolean;
  status: string;
};

export type MarketplaceService = {
  id: string;
  name: string;
  description: string | null;
  priceFromCents: number | null;
  serviceRadius: number | null;
  isAvailable: boolean;
  isVisible: boolean;
  status: string;
};

export type BusinessDashboard = {
  business: BusinessRecord | null;
  metrics: { products: number; availableProducts: number; services: number; visibleProducts: number };
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