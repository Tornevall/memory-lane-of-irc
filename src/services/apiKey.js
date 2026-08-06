const CONFIGURED_API_KEY = String(import.meta.env.VITE_IRC_API_KEY || '').trim();

export function getApiKey() {
  return CONFIGURED_API_KEY;
}

export function hasConfiguredApiKey() {
  return CONFIGURED_API_KEY.length > 0;
}
