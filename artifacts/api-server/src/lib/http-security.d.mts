export interface OriginCheckInput {
  method: string;
  origin?: string;
  host?: string;
  secFetchSite?: string;
}

export interface HeaderResponse {
  setHeader(name: string, value: string): unknown;
}

export function isCrossOriginMutation(input: OriginCheckInput): boolean;
export function isSafeSignedObjectUrl(value: unknown): value is string;
export function parsePrivateObjectPath(value: unknown): { ownerId: string; objectId: string } | null;
export function setApiSecurityHeaders(response: HeaderResponse, production?: boolean): void;
