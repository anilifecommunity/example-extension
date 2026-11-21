import { http, log, cacheGet, cacheSet } from 'anilili:provider/host@1.0.0';

export function info() {
  return {
    name: 'WatchAnimeWorld',
    hosts: ['watchanimeworld.one', 'play.zephyrix.org', 'st3.dpopdrop89.store', 'spr-cdn.winghoster.site'],
  };
}

function bytesToString(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function stringToBytes(s) {
  return Array.from(new TextEncoder().encode(s));
}

function cacheGetStr(key) {
  const v = cacheGet(key);
  return v === undefined || v === null ? null : v;
}

function cacheSetStr(key, value) {
  cacheSet(key, value, 86400);
}

function findSlug(title) {
  const key = 'slug:' + title.toLowerCase();
  const cached = cacheGetStr(key);
  if (cached) return cached;

  const searchUrl = 'https://watchanimeworld.one/?s=' + encodeURIComponent(title);
  const res = http({
    method: 'GET',
    url: searchUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!res || res.status !== 200) return null;

  const html = bytesToString(res.body);
  const needle = 'watchanimeworld.one/series/';
  let idx = 0;
  while (true) {
    const pos = html.indexOf(needle, idx);
    if (pos === -1) break;
    const abs = pos + needle.length;
    let end = abs;
    while (end < html.length && !['/', '"', "'", '<', ' ', '\n', '\r', '\t'].includes(html[end])) {
      end++;
    }
    const slug = html.slice(abs, end);
    if (slug && slug !== 'series') {
      cacheSetStr(key, slug);
      return slug;
    }
    idx = abs;
  }
  return null;
}

function detectSeason(titles) {
  for (const t of titles) {
    const low = t.toLowerCase();
    const i = low.indexOf('season');
    if (i !== -1) {
      const rest = low.slice(i + 6);
      let digits = '';
      for (const ch of rest) {
        if (/[0-9]/.test(ch)) digits += ch;
        else if (digits) break;
      }
      if (digits) return parseInt(digits, 10);
    }
  }
  return 1;
}

function extractIframeId(html) {
  const needle = 'play.zephyrix.org/video/';
  const pos = html.indexOf(needle);
  if (pos === -1) return null;
  const abs = pos + needle.length;
  let end = abs;
  while (end < html.length && !['/', '"', "'", '<', ' ', '\n', '\r', '\t', '?', '&'].includes(html[end])) {
    end++;
  }
  return html.slice(abs, end);
}

function getZephyrixStream(id) {
  const postUrl = 'https://play.zephyrix.org/player/index.php?data=' + encodeURIComponent(id) + '&do=getVideo';
  const refUrl = 'https://play.zephyrix.org/video/' + id;
  const body = 'hash=' + encodeURIComponent(id) + '&r=' + encodeURIComponent(refUrl);

  const res = http({
    method: 'POST',
    url: postUrl,
    headers: [
      ['Content-Type', 'application/x-www-form-urlencoded'],
      ['X-Requested-With', 'XMLHttpRequest'],
      ['Referer', refUrl],
    ],
    body: stringToBytes(body),
  });

  if (!res || res.status !== 200) {
    throw new Error('WatchAnimeWorld: zephyrix HTTP ' + (res ? res.status : 'none'));
  }

  const text = bytesToString(res.body);
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error('WatchAnimeWorld: invalid zephyrix JSON');
  }

  const securedLink = json.securedLink || json.videoSource;
  if (!securedLink) {
    throw new Error('WatchAnimeWorld: no stream url');
  }

  return securedLink;
}

export function servers(query) {
  log('WatchAnimeWorld lookup: ' + JSON.stringify(query.titles) + ' ep=' + query.episode + ' dub=' + query.dub);

  let slug = null;
  for (const t of query.titles) {
    slug = findSlug(t);
    if (slug) break;
  }
  if (!slug) {
    throw new Error('WatchAnimeWorld: no matching series found');
  }

  const season = detectSeason(query.titles);
  const epStr = String(query.episode);

  const epUrl = 'https://watchanimeworld.one/episode/' + slug + '-' + season + 'x' + epStr + '/';
  const res = http({
    method: 'GET',
    url: epUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!res || res.status !== 200) {
    throw new Error('WatchAnimeWorld: HTTP ' + (res ? res.status : 'none') + ' for episode page');
  }

  const html = bytesToString(res.body);
  const id = extractIframeId(html);
  if (!id) {
    throw new Error('WatchAnimeWorld: no zephyrix iframe found');
  }

  const streamUrl = getZephyrixStream(id);

  return [
    {
      name: 'WatchAnimeWorld',
      dub: query.dub,
      headers: [['Referer', 'https://play.zephyrix.org/']],
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
