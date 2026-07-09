import { makeId } from "./store";
import type { GoogleAccountProfile } from "../core/googleCalendar";

export type AuthMethod = "password" | "google";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastSignedInAt: string;
  authMethods: AuthMethod[];
  avatarUrl?: string;
}

export interface AuthResult {
  user: AuthUser;
}

interface StoredUser extends AuthUser {
  password?: PasswordRecord;
  googleSubject?: string;
}

interface PasswordRecord {
  algorithm: "PBKDF2-SHA-256" | "FNV1A-FALLBACK";
  iterations: number;
  salt: string;
  hash: string;
}

interface AuthSession {
  userId: string;
  signedInAt: string;
}

export const AUTH_USERS_KEY = "smart-departure-alarm/auth-users/v1";
export const AUTH_SESSION_KEY = "smart-departure-alarm/auth-session/v1";

const PASSWORD_MIN_LENGTH = 8;
const HASH_ITERATIONS = 120_000;

export async function signUp(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const name = normalizeName(input.name, email);
  validateEmail(email);
  validatePassword(input.password);

  const users = loadUsers();
  if (users.some((user) => user.email === email)) {
    throw new Error("An account with that email already exists.");
  }

  const now = new Date().toISOString();
  const storedUser: StoredUser = {
    id: makeId("user"),
    email,
    name,
    createdAt: now,
    lastSignedInAt: now,
    authMethods: ["password"],
    password: await hashPassword(input.password),
  };

  saveUsers([...users, storedUser]);
  saveSession({ userId: storedUser.id, signedInAt: now });
  return { user: publicUser(storedUser) };
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const users = loadUsers();
  const user = users.find((item) => item.email === email);
  if (!user?.password || !(await verifyPassword(input.password, user.password))) {
    throw new Error("Email or password is incorrect.");
  }

  const now = new Date().toISOString();
  const updatedUser = { ...user, lastSignedInAt: now };
  saveUsers(users.map((item) => (item.id === user.id ? updatedUser : item)));
  saveSession({ userId: user.id, signedInAt: now });
  return { user: publicUser(updatedUser) };
}

export async function signInWithGoogle(
  profile: GoogleAccountProfile,
): Promise<AuthResult> {
  const email = normalizeEmail(profile.email);
  validateEmail(email);

  const users = loadUsers();
  const existing = users.find(
    (user) => user.googleSubject === profile.sub || user.email === email,
  );
  const now = new Date().toISOString();

  if (existing) {
    const updatedUser: StoredUser = {
      ...existing,
      email,
      name: profile.name.trim() || existing.name,
      avatarUrl: profile.picture,
      googleSubject: profile.sub,
      authMethods: uniqueAuthMethods([...existing.authMethods, "google"]),
      lastSignedInAt: now,
    };
    saveUsers(users.map((user) => (user.id === existing.id ? updatedUser : user)));
    saveSession({ userId: updatedUser.id, signedInAt: now });
    return { user: publicUser(updatedUser) };
  }

  const storedUser: StoredUser = {
    id: `google-${profile.sub}`,
    email,
    name: profile.name.trim() || normalizeName(undefined, email),
    avatarUrl: profile.picture,
    googleSubject: profile.sub,
    authMethods: ["google"],
    createdAt: now,
    lastSignedInAt: now,
  };
  saveUsers([...users, storedUser]);
  saveSession({ userId: storedUser.id, signedInAt: now });
  return { user: publicUser(storedUser) };
}

export function signOut(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

export function getCurrentUser(): AuthUser | null {
  const session = loadSession();
  if (!session) return null;
  const user = loadUsers().find((item) => item.id === session.userId);
  if (!user) {
    signOut();
    return null;
  }
  return publicUser(user);
}

export function hasUsers(): boolean {
  return loadUsers().length > 0;
}

function publicUser(user: StoredUser): AuthUser {
  const { password: _password, googleSubject: _googleSubject, ...publicFields } = user;
  return {
    ...publicFields,
    authMethods: normalizedAuthMethods(user),
  };
}

function loadUsers(): StoredUser[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(AUTH_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredUser>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredUser).map((user) => ({
      ...user,
      authMethods: normalizedAuthMethods(user),
    }));
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

function loadSession(): AuthSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (typeof parsed.userId !== "string" || typeof parsed.signedInAt !== "string") {
      return null;
    }
    return { userId: parsed.userId, signedInAt: parsed.signedInAt };
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function isStoredUser(value: Partial<StoredUser>): value is StoredUser {
  return (
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.lastSignedInAt === "string" &&
    (value.password === undefined || isPasswordRecord(value.password)) &&
    (value.googleSubject === undefined || typeof value.googleSubject === "string")
  );
}

function normalizedAuthMethods(user: Partial<StoredUser>): AuthMethod[] {
  const methods = Array.isArray(user.authMethods)
    ? user.authMethods.filter(
        (method): method is AuthMethod => method === "password" || method === "google",
      )
    : [];
  if (user.password) methods.push("password");
  if (user.googleSubject) methods.push("google");
  return uniqueAuthMethods(methods);
}

function uniqueAuthMethods(methods: AuthMethod[]): AuthMethod[] {
  return [...new Set(methods)];
}

function isPasswordRecord(value: unknown): value is PasswordRecord {
  const record = value as Partial<PasswordRecord>;
  return (
    (record.algorithm === "PBKDF2-SHA-256" ||
      record.algorithm === "FNV1A-FALLBACK") &&
    typeof record.iterations === "number" &&
    typeof record.salt === "string" &&
    typeof record.hash === "string"
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string | undefined, email: string): string {
  const cleaned = name?.trim();
  if (cleaned) return cleaned;
  return email.split("@")[0] || "Departure user";
}

function validateEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
}

function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
}

async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomSalt();
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const hash = await pbkdf2(password, salt, HASH_ITERATIONS);
    return {
      algorithm: "PBKDF2-SHA-256",
      iterations: HASH_ITERATIONS,
      salt,
      hash,
    };
  }

  return {
    algorithm: "FNV1A-FALLBACK",
    iterations: 1,
    salt,
    hash: fallbackHash(password, salt),
  };
}

async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const hash =
    record.algorithm === "PBKDF2-SHA-256" && globalThis.crypto?.subtle
      ? await pbkdf2(password, record.salt, record.iterations)
      : fallbackHash(password, record.salt);
  return timingSafeEqual(hash, record.hash);
}

async function pbkdf2(
  password: string,
  salt: string,
  iterations: number,
): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const saltBytes = base64ToBytes(salt);
  const key = await globalThis.crypto!.subtle.importKey(
    "raw",
    encoded,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto!.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes.buffer as ArrayBuffer,
      iterations,
    },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function fallbackHash(password: string, salt: string): string {
  let hash = 0x811c9dc5;
  const input = `${salt}:${password}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}
