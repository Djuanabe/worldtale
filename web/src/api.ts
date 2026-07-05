import { API_BASE } from "./config";

// ---- 型定義 ----

export interface User {
  publicId: string;
  username: string;
  handle: string;
}

export interface StorySummary {
  id: string;
  title: string;
  excerpt: string;
  prefecture: number;
  municipality: string | null;
  year: number;
  season: string | null;
  username: string;
  userHandle: string;
  createdAt: string;
  likeCount: number;
  metCount: number;
}

export interface StoryPhoto {
  id: string;
  url: string;
  season: string;
}

export interface StoryDetail {
  id: string;
  title: string;
  body: string;
  prefecture: number;
  municipality: string | null;
  year: number;
  season: string | null;
  username: string;
  userHandle: string;
  createdAt: string;
  updatedAt?: string;
  likeCount: number;
  metCount: number;
  photos: StoryPhoto[];
}

export interface StoryListResult {
  stories: StorySummary[];
  total: number;
  page: number;
}

export interface StoryStats {
  views: number;
  likeCount: number;
  metCount: number;
}

export interface MyStory extends StorySummary {
  views: number;
  isHidden: boolean;
}

export interface ReactionResult {
  likeCount: number;
  metCount: number;
  reacted: { like: boolean; met: boolean };
}

export interface Photo {
  id: string;
  url: string;
  season: string;
  username?: string;
  prefecture?: number;
}

export interface MapSummary {
  counts: Record<string, number>;
}

export type ReportReason = "personal_info" | "face" | "harmful" | "other";

// ---- エラー ----

export class ApiRequestError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---- トークン管理 ----

const TOKEN_KEY = "wt_token";
const ANON_KEY = "wt_anon";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function getAnonToken(): string {
  let t = localStorage.getItem(ANON_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(ANON_KEY, t);
  }
  return t;
}

// ---- 汎用リクエスト ----

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "サーバーに接続できませんでした。しばらくしてからお試しください。");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = data?.error ?? { code: "UNKNOWN", message: "エラーが発生しました" };
    throw new ApiRequestError(res.status, err.code, err.message);
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---- 認証 ----

export function register(username: string, password: string): Promise<{ user: User; token: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function login(publicId: string, password: string): Promise<{ user: User; token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ publicId, password })
  });
}

export function fetchMe(): Promise<{ user: User }> {
  return request("/api/auth/me");
}

// ---- 物語 ----

export function listStories(params: {
  prefecture?: number;
  year?: number;
  userId?: string;
  page?: number;
  limit?: number;
}): Promise<StoryListResult> {
  return request(`/api/stories${qs(params)}`);
}

export function getStory(id: string): Promise<StoryDetail> {
  return request(`/api/stories/${encodeURIComponent(id)}`);
}

export function createStory(input: {
  title: string;
  body: string;
  prefecture: number;
  municipality: string;
  year: number;
  season: string;
}): Promise<StoryDetail> {
  return request("/api/stories", { method: "POST", body: JSON.stringify(input) });
}

export function updateStory(
  id: string,
  input: Partial<{
    title: string;
    body: string;
    prefecture: number;
    municipality: string;
    year: number;
    season: string;
  }>
): Promise<StoryDetail> {
  return request(`/api/stories/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteStory(id: string): Promise<void> {
  return request(`/api/stories/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getStoryStats(id: string): Promise<StoryStats> {
  return request(`/api/stories/${encodeURIComponent(id)}/stats`);
}

export function myStories(): Promise<{ stories: MyStory[] }> {
  return request("/api/my/stories");
}

// ---- リアクション ----

export function reactToStory(id: string, type: "like" | "met"): Promise<ReactionResult> {
  return request(`/api/stories/${encodeURIComponent(id)}/reactions`, {
    method: "POST",
    body: JSON.stringify({ type, anonToken: getAnonToken() })
  });
}

export function getReactions(id: string): Promise<ReactionResult> {
  return request(`/api/stories/${encodeURIComponent(id)}/reactions${qs({ anonToken: getAnonToken() })}`);
}

// ---- ユーザー ----

export function getUser(handle: string): Promise<{ handle: string; username: string; storyCount: number }> {
  return request(`/api/users/${encodeURIComponent(handle)}`);
}

// ---- 写真 ----

export function uploadPhoto(input: {
  file: File;
  prefecture: number;
  season: string;
  storyId?: string;
}): Promise<{ id: string; url: string; prefecture: number; season: string }> {
  const form = new FormData();
  form.set("file", input.file);
  form.set("prefecture", String(input.prefecture));
  form.set("season", input.season);
  if (input.storyId) form.set("storyId", input.storyId);
  return request("/api/photos", { method: "POST", body: form });
}

export function listPhotos(prefecture: number, season?: string): Promise<{ photos: Photo[] }> {
  return request(`/api/photos${qs({ prefecture, season })}`);
}

export function myPhotos(): Promise<{ photos: Photo[] }> {
  return request("/api/my/photos");
}

export function deletePhoto(id: string): Promise<void> {
  return request(`/api/photos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---- 報告 ----

export function submitReport(input: {
  targetType: "story" | "photo";
  targetId: string;
  reason: ReportReason;
  detail?: string;
}): Promise<void> {
  return request("/api/reports", { method: "POST", body: JSON.stringify(input) });
}

// ---- マップ ----

export function mapSummary(year?: number): Promise<MapSummary> {
  return request(`/api/map/summary${qs({ year })}`);
}
