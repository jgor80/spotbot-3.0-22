// Shared EA FC Pro Clubs helpers for FC27.
// FC27 removed the common-gen4 (PS4 / Xbox One) namespace: requests to it return HTTP 400.
// Keep this in sync with public/spotbot/ea-fc27.cjs (used by the Discord bot).

export const EA_PLATFORM_MAP: Record<string, string> = {
  'ps5': 'common-gen5',
  'xbox-series-xs': 'common-gen5',
  'pc': 'common-gen5',
  'switch': 'nx',
  // Clubs saved before FC27 with an old-gen platform are queried on gen5
  'ps4': 'common-gen5',
  'xboxone': 'common-gen5',
}

// Platforms to try when searching for a club without a known platform
export const FC_PLATFORMS = ['common-gen5', 'nx']

// Map a stored platform (ps5, switch, common-gen5, ...) to the EA API platform value
export function toFcPlatform(platform?: string | null): string {
  if (!platform) return 'common-gen5'
  const p = platform.toLowerCase()
  if (p === 'common-gen5' || p === 'nx') return p
  if (p === 'common-gen4') return 'common-gen5'
  return EA_PLATFORM_MAP[p] || 'common-gen5'
}

// FC27 returns regionId as ASCII packed into an integer, e.g. 5457237 -> "SEU"
export function decodeRegionId(regionId: unknown): string | null {
  const raw = typeof regionId === 'string' ? Number(regionId) : regionId
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  let n = Math.floor(raw)
  let out = ''
  while (n > 0) {
    const code = n % 256
    if (code < 32 || code > 126) return null
    out = String.fromCharCode(code) + out
    n = Math.floor(n / 256)
  }
  return out || null
}

export function regionLabel(info: Record<string, any> | null | undefined): string | null {
  if (!info) return null
  return info.regionName || info.region || info.countryName || decodeRegionId(info.regionId)
}

export function normalizeClubName(name?: string | null): string {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim()
}
