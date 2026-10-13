/**
 * Validates and normalizes a redirect URL or path to ensure it stays strictly within same-origin safe routes.
 * Rejects external domain open-redirects, backslash-trick host spoofing, protocol-relative paths,
 * control characters, and dangerous URI schemes.
 */
export function validateSafeRedirect(targetUrl: string | null | undefined, fallbackPath = '/'): string {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return fallbackPath;
  }

  const trimmed = targetUrl.trim();
  if (!trimmed) {
    return fallbackPath;
  }

  // Reject backslashes, control characters, tabs, newlines, null bytes anywhere in the path
  // WHATWG URL parser converts '\' to '/' and strips control chars, enabling domain spoofing (e.g. /\\evil.com)
  if (/[\\\r\n\t\0\v\f]/.test(trimmed)) {
    return fallbackPath;
  }

  // Reject protocol-relative starting slashes like //evil.com or / /evil.com
  if (trimmed.startsWith('//')) {
    return fallbackPath;
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return fallbackPath;
  }

  try {
    const origin =
      typeof window !== 'undefined' && window.location && window.location.origin
        ? window.location.origin
        : 'http://localhost:5173';

    const parsed = new URL(trimmed, origin);

    // Check origin after complete WHATWG URL resolution & normalization
    if (parsed.origin !== origin) {
      return fallbackPath;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallbackPath;
    }

    const safePath = parsed.pathname + parsed.search + parsed.hash;
    // Extra safety check: normalized path must still start with / and not //
    if (!safePath.startsWith('/') || safePath.startsWith('//')) {
      return fallbackPath;
    }

    return safePath;
  } catch {
    return fallbackPath;
  }
}
