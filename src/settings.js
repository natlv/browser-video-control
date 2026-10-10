export const MIN_SPEED = 0.5;
export const MAX_SPEED = 5;
export const DEFAULTS = Object.freeze({ schema: 1, mode: 'global', globalSpeed: 1, sites: {}, indicator: true });

export function validSpeed(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_SPEED && value <= MAX_SPEED;
}

export function normalizeSpeed(value) {
  if (!validSpeed(value)) throw new Error('Enter a speed between 0.5 and 5.');
  return Math.round(value * 1e6) / 1e6;
}

export function stepSpeed(value, direction) {
  return normalizeSpeed(Math.min(MAX_SPEED, Math.max(MIN_SPEED, value + direction * 0.1)));
}

export function siteKey(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return 'local-files';
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.hostname.toLowerCase();
  } catch { /* Restricted or unavailable tab. */ }
  return null;
}

export function sanitizePreferences(raw) {
  const sites = Object.create(null);
  if (raw?.sites && typeof raw.sites === 'object' && !Array.isArray(raw.sites)) {
    for (const [key, value] of Object.entries(raw.sites)) {
      if (key.length <= 253 && validSpeed(value)) sites[key] = normalizeSpeed(value);
    }
  }
  return {
    schema: 1,
    mode: raw?.mode === 'site' ? 'site' : 'global',
    globalSpeed: validSpeed(raw?.globalSpeed) ? normalizeSpeed(raw.globalSpeed) : 1,
    sites,
    indicator: raw?.indicator !== false
  };
}

export function resolveContext(preferences, temporary, tab, revision = 0) {
  const site = siteKey(tab?.url);
  const remembered = site !== null && Object.hasOwn(preferences.sites, site);
  const session = temporary && temporary.site === site && validSpeed(temporary.speed);
  const speed = preferences.mode === 'global' ? preferences.globalSpeed
    : session ? temporary.speed : remembered ? preferences.sites[site] : preferences.globalSpeed;
  return {
    site, speed, revision, mode: preferences.mode, remembered,
    globalSpeed: preferences.globalSpeed, indicator: preferences.indicator,
    source: preferences.mode === 'global' ? 'global' : session ? 'session' : remembered ? 'site' : 'default'
  };
}

export function formatSpeed(value) { return `${Number(value.toFixed(6))}×`; }
