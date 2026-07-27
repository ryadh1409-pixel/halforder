/**
 * Parse Google Maps share / place URLs into a query or coordinates.
 * Short links (maps.app.goo.gl) need network resolution separately.
 */

export type ParsedGoogleMapsLink = {
  query: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  originalUrl: string;
  isShortLink: boolean;
};

function firstMatch(input: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const m = input.match(pattern);
    if (m) return m;
  }
  return null;
}

export function parseGoogleMapsLink(raw: string): ParsedGoogleMapsLink | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isGoogleMaps =
    host.includes('google.') ||
    host.includes('maps.app.goo.gl') ||
    host === 'goo.gl' ||
    host.includes('g.page');
  if (!isGoogleMaps && !host.includes('maps')) {
    // Allow bare goo.gl maps links
    if (!host.includes('goo.gl')) return null;
  }

  const isShortLink =
    host.includes('maps.app.goo.gl') ||
    host === 'goo.gl' ||
    host.startsWith('goo.gl');

  const placeId =
    url.searchParams.get('place_id') ||
    url.searchParams.get('query_place_id') ||
    null;

  const qParam =
    url.searchParams.get('q') ||
    url.searchParams.get('query') ||
    url.searchParams.get('destination') ||
    null;

  const atMatch = firstMatch(url.pathname + url.search, [
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]center=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ]);
  let lat: number | null = null;
  let lng: number | null = null;
  if (atMatch) {
    const a = Number.parseFloat(atMatch[1] ?? '');
    const b = Number.parseFloat(atMatch[2] ?? '');
    if (Number.isFinite(a) && Number.isFinite(b)) {
      lat = a;
      lng = b;
    }
  }

  if (qParam && /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(qParam.trim())) {
    const [la, ln] = qParam.split(',').map((p) => Number.parseFloat(p.trim()));
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      lat = la;
      lng = ln;
    }
  }

  const placePath = url.pathname.match(/\/place\/([^/]+)/);
  let query: string | null = null;
  if (qParam && !/^-?\d+\.?\d*,/.test(qParam.trim())) {
    query = qParam.replace(/\+/g, ' ').trim();
  } else if (placePath?.[1]) {
    try {
      query = decodeURIComponent(placePath[1].replace(/\+/g, ' ')).replace(
        /-/g,
        ' ',
      );
    } catch {
      query = placePath[1].replace(/-/g, ' ');
    }
  }

  return {
    query,
    lat,
    lng,
    placeId,
    originalUrl: trimmed,
    isShortLink,
  };
}
