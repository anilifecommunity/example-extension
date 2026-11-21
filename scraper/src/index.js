import { http, log, cacheGet, cacheSet, browserFetch } from 'anilili:provider/host@1.0.0';

export function info() {
  return {
    name: 'JkAnime',
    hosts: ['jkanime.net', 'nika.playmudos.com', 'cdn.jkdesa.com'],
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

  const searchUrl = 'https://jkanime.net/directorio?q=' + encodeURIComponent(title);
  const res = browserFetch('https://jkanime.net', {
    method: 'GET',
    url: searchUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });

  let html;
  if (res && res.status === 200) {
    html = bytesToString(res.body);
  } else {
    const res2 = http({
      method: 'GET',
      url: searchUrl,
      headers: [['Accept', 'text/html']],
      body: undefined,
    });
    if (!res2 || res2.status !== 200) return null;
    html = bytesToString(res2.body);
  }

  const needle = 'jkanime.net/';
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
    if (slug && slug !== 'directorio' && slug !== '') {
      cacheSetStr(key, slug);
      return slug;
    }
    idx = abs;
  }
  return null;
}

function extractStreamUrl(html) {
  const m3u8Match = html.match(/https?:\/\/[^"'\s<]+\.m3u8[^"'\s<]*/);
  if (m3u8Match) {
    return m3u8Match[0].replace(/&amp;/g, '&');
  }
  const streamMatch = html.match(/https?:\/\/[^"'\s<]+playmudos[^"'\s<]*/);
  if (streamMatch) {
    return streamMatch[0].replace(/&amp;/g, '&');
  }
  return null;
}

export function servers(query) {
  log('JkAnime lookup: ' + JSON.stringify(query.titles) + ' ep=' + query.episode + ' dub=' + query.dub);

  let slug = null;
  for (const t of query.titles) {
    slug = findSlug(t);
    if (slug) break;
  }
  if (!slug) {
    throw new Error('JkAnime: no matching series found');
  }

  const epUrl = 'https://jkanime.net/' + slug + '/' + query.episode + '/';
  const res = browserFetch('https://jkanime.net', {
    method: 'GET',
    url: epUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });

  let html;
  if (res && res.status === 200) {
    html = bytesToString(res.body);
  } else {
    const res2 = http({
      method: 'GET',
      url: epUrl,
      headers: [['Accept', 'text/html']],
      body: undefined,
    });
    if (!res2 || res2.status !== 200) {
      throw new Error('JkAnime: HTTP ' + (res2 ? res2.status : 'none') + ' for episode page');
    }
    html = bytesToString(res2.body);
  }

  const iframeMatch = html.match(/jkplayer\/um\?[^"'\s<]+/);
  if (!iframeMatch) {
    throw new Error('JkAnime: no jkplayer iframe found');
  }
  const iframeUrl = 'https://jkanime.net/' + iframeMatch[0].replace(/&amp;/g, '&');

  const iframeRes = browserFetch('https://jkanime.net', {
    method: 'GET',
    url: iframeUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });

  let iframeHtml;
  if (iframeRes && iframeRes.status === 200) {
    iframeHtml = bytesToString(iframeRes.body);
  } else {
    throw new Error('JkAnime: iframe HTTP ' + (iframeRes ? iframeRes.status : 'none'));
  }

  const streamUrl = extractStreamUrl(iframeHtml);
  if (!streamUrl) {
    throw new Error('JkAnime: no stream url found in iframe');
  }

  return [
    {
      name: 'JkAnime',
      dub: query.dub,
      headers: [['Referer', 'https://jkanime.net/']],
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
