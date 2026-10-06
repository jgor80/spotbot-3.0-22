// Shared EA FC Pro Clubs helpers for FC27, used by index.cjs and local/ea-sync-local.cjs.
// FC27 removed the common-gen4 (PS4 / Xbox One) namespace: requests to it return HTTP 400.
// Keep this in sync with supabase/functions/_shared/ea.ts.

const EA_PLATFORM_MAP = {
  'ps5': 'common-gen5',
  'xbox-series-xs': 'common-gen5',
  'pc': 'common-gen5',
  'switch': 'nx',
  // Clubs saved before FC27 with an old-gen platform are queried on gen5
  'ps4': 'common-gen5',
  'xboxone': 'common-gen5'
};

// Platforms to try when searching for a club without a known platform
const FC_PLATFORMS = ['common-gen5', 'nx'];

// Map a stored platform (ps5, switch, common-gen5, ...) to the EA API platform value
function toFcPlatform(platform) {
  if (!platform) return 'common-gen5';
  const p = String(platform).toLowerCase();
  if (p === 'common-gen5' || p === 'nx') return p;
  if (p === 'common-gen4') return 'common-gen5';
  return EA_PLATFORM_MAP[p] || 'common-gen5';
}

// Map an EA API platform back to the platform value we store on a club
function fromFcPlatform(fcPlatform) {
  return fcPlatform === 'nx' ? 'switch' : 'ps5';
}

// FC27 returns regionId as ASCII packed into an integer, e.g. 5457237 -> "SEU"
function decodeRegionId(regionId) {
  let n = typeof regionId === 'string' ? Number(regionId) : regionId;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  n = Math.floor(n);
  let out = '';
  while (n > 0) {
    const code = n % 256;
    if (code < 32 || code > 126) return null;
    out = String.fromCharCode(code) + out;
    n = Math.floor(n / 256);
  }
  return out || null;
}

function regionLabel(info) {
  if (!info) return null;
  return info.regionName || info.region || info.countryName || decodeRegionId(info.regionId);
}

function normalizeClubName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Pick the club whose name matches exactly (ignoring case and spacing).
// Returns null when there is no exact match, so callers never relink to a lookalike club.
function findExactClubMatch(results, name) {
  const target = normalizeClubName(name);
  if (!target || !Array.isArray(results)) return null;
  return results.find(r => normalizeClubName(r.name) === target) || null;
}

module.exports = {
  EA_PLATFORM_MAP,
  FC_PLATFORMS,
  toFcPlatform,
  fromFcPlatform,
  decodeRegionId,
  regionLabel,
  normalizeClubName,
  findExactClubMatch
};
