const TRUSTED_NO_KEY_HOSTS = new Set([
  'tools.tornevall.com',
  'tools.tornevall.net',
]);

const BACKEND_AUTH_MODE_KEY = 'irc_backend_auth_mode';

export function updateBackendAuthModeFromHeaders(headers) {
  const modeHeader = headers?.get?.('x-irclog-auth-mode');
  const keyRequiredHeader = headers?.get?.('x-irclog-api-key-required');

  if (modeHeader) {
    localStorage.setItem(BACKEND_AUTH_MODE_KEY, String(modeHeader).toLowerCase());
    return;
  }

  if (keyRequiredHeader) {
    const required = String(keyRequiredHeader).toLowerCase();
    if (required === '0' || required === 'false' || required === 'no') {
      localStorage.setItem(BACKEND_AUTH_MODE_KEY, 'trusted-no-key');
    } else if (required === '1' || required === 'true' || required === 'yes') {
      localStorage.setItem(BACKEND_AUTH_MODE_KEY, 'key-required');
    }
  }
}

export function backendAllowsNoKey() {
  const mode = String(localStorage.getItem(BACKEND_AUTH_MODE_KEY) || '').toLowerCase();
  return mode === 'trusted-no-key' || mode === 'no-key' || mode === 'public';
}

export function isTrustedNoKeyHost() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  return backendAllowsNoKey() || TRUSTED_NO_KEY_HOSTS.has(String(window.location.hostname || '').toLowerCase());
}

export function hasWriteAccess(apiKey) {
  if (isTrustedNoKeyHost()) {
    return true;
  }
  return Boolean(String(apiKey || '').trim());
}
