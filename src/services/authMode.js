const TRUSTED_NO_KEY_HOSTS = new Set([
  'tools.tornevall.com',
  'tools.tornevall.net',
]);

export function isTrustedNoKeyHost() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  return TRUSTED_NO_KEY_HOSTS.has(String(window.location.hostname || '').toLowerCase());
}

export function hasWriteAccess(apiKey) {
  if (isTrustedNoKeyHost()) {
    return true;
  }
  return Boolean(String(apiKey || '').trim());
}
