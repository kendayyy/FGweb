import { MeDTO, MeDTOSchema } from '@fg/contracts';
import { validateSafeRedirect } from './utils.js';

export function validateDiscordOAuthUrl(urlStr: string | null | undefined): string {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('Server returned empty or invalid OAuth URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('Server returned malformed OAuth URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`OAuth URL must use HTTPS protocol: ${parsed.protocol}`);
  }

  if (parsed.hostname !== 'discord.com') {
    throw new Error(`Invalid OAuth authorization host: ${parsed.hostname}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('OAuth URL must not contain userinfo credentials');
  }

  const path = parsed.pathname;
  if (path !== '/oauth2/authorize' && path !== '/api/oauth2/authorize') {
    throw new Error(`Invalid OAuth authorization endpoint path: ${path}`);
  }

  return parsed.toString();
}

export async function fetchMe(signal?: AbortSignal): Promise<MeDTO | null> {
  const res = await fetch('/api/v1/me', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (res.status === 401) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch session identity: HTTP ${res.status}`);
  }

  const data = await res.json();
  const parsed = MeDTOSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Received invalid MeDTO structure from server');
  }

  return parsed.data;
}

export async function signInWithDiscord(callbackPath = '/'): Promise<string> {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:5173';
  const safePath = validateSafeRedirect(callbackPath);
  const callbackURL = `${origin}${safePath}`;
  const errorCallbackURL = `${origin}/login?error=oauth_denied`;

  const res = await fetch('/api/auth/sign-in/social', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      provider: 'discord',
      callbackURL,
      errorCallbackURL,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to initiate Discord login: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data && typeof data.url === 'string') {
    // Strictly validate returned authorization URL before returning or redirecting
    return validateDiscordOAuthUrl(data.url);
  }

  throw new Error('Server did not return a valid OAuth redirect URL');
}

export async function signOutServer(): Promise<void> {
  const res = await fetch('/api/auth/sign-out', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok && res.status !== 401) {
    throw new Error(`Logout server request failed: HTTP ${res.status}`);
  }
}
