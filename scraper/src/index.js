import { http, log, cacheGet, cacheSet } from 'anilili:provider/host@1.0.0';

export function info() {
  return {
    name: 'VerAnime',
    hosts: ['verani.me', 'player.zilla-networks.com'],
  };
}

function bytesToString(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function stringToBytes(s) {
  return Array.from(new TextEncoder().encode(s));
}

function findSlug(title) {
  const key = 'slug:' + title.toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;

  const searchUrl = 'https://verani.me/?s=' + encodeURIComponent(title);
  const res = http({
    method: 'GET',
    url: searchUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!res || res.status !== 200) return null;

  const html = bytesToString(res.body);
  const needle = 'verani.me/';
  let idx = 0;
  while (true) {
    const pos = html.indexOf(needle, idx);
    if (pos === -1) break;
    const abs = pos + needle.length;
    let end = abs;
    while (end < html.length && !['/', '"', "'", '<', ' ', '\n', '\r', '\t', '?'].includes(html[end])) {
      end++;
    }
    const slug = html.slice(abs, end);
    if (slug && slug !== 'wp-content' && slug !== 'wp-includes') {
      // validate by checking series page exists
      cacheSet(key, slug, 86400);
      return slug;
    }
    idx = abs;
  }
  return null;
}

function findEpisodeUrl(html, slug, episode) {
  const needle = 'verani.me/' + slug + '/';
  let idx = 0;
  while (true) {
    const pos = html.indexOf(needle, idx);
    if (pos === -1) break;
    const abs = pos + needle.length;
    let end = abs;
    while (end < html.length && !['"', "'", '<', ' ', '\n', '\r', '\t'].includes(html[end])) {
      end++;
    }
    const path = html.slice(abs, end);
    const m = path.match(/^(\d+(?:\.\d+)?)-/);
    if (m && Number(m[1]) === episode) {
      return 'https://verani.me/' + slug + '/' + path;
    }
    idx = abs;
  }
  return null;
}

function extractZillaUrls(html) {
  const seen = new Set();
  const out = [];
  const re = /player\.zilla-networks\.com\/m3u8\/[A-Za-z0-9]+/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[0];
    if (!seen.has(u)) {
      seen.add(u);
      out.push('https://' + u);
    }
  }
  return out;
}

export function servers(query) {
  log('VerAnime lookup: ' + JSON.stringify(query.titles) + ' ep=' + query.episode + ' dub=' + query.dub);

  let slug = null;
  for (const t of query.titles) {
    slug = findSlug(t);
    if (slug) break;
  }
  if (!slug) {
    throw new Error('VerAnime: no matching series found');
  }

  const seriesUrl = 'https://verani.me/' + slug + '/';
  const seriesRes = http({
    method: 'GET',
    url: seriesUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!seriesRes || seriesRes.status !== 200) {
    throw new Error('VerAnime: HTTP ' + (seriesRes ? seriesRes.status : 'none') + ' for series page');
  }
  const seriesHtml = bytesToString(seriesRes.body);

  const epUrl = findEpisodeUrl(seriesHtml, slug, query.episode);
  if (!epUrl) {
    throw new Error('VerAnime: episode not found');
  }
  log('VerAnime episode url: ' + epUrl);

  const epRes = http({
    method: 'GET',
    url: epUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!epRes || epRes.status !== 200) {
    throw new Error('VerAnime: HTTP ' + (epRes ? epRes.status : 'none') + ' for episode page');
  }
  const epHtml = bytesToString(epRes.body);

  const zillaUrls = extractZillaUrls(epHtml);
  if (zillaUrls.length === 0) {
    throw new Error('VerAnime: no stream found');
  }

  const idx = query.dub ? 0 : (zillaUrls.length > 1 ? 1 : 0);
  const streamUrl = zillaUrls[idx];

  return [
    {
      name: 'VerAnime',
      dub: query.dub,
      headers: [['Referer', 'https://player.zilla-networks.com/']],
      streams: [
        {
          url: streamUrl,
          quality: undefined,
          format: 'hls',
        },
      ],
    },
  ];
}
