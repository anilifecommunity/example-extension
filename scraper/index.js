import { http, log, cacheGet, cacheSet } from 'anilili:provider/host@1.0.0';

export function info() {
  return {
    name: 'AnimeOnline',
    hosts: [
      'ver2.animeonline.ninja',
      'ww4.animeonline.ninja',
      'saidochesto.top',
      'gupload.site',
      'uqload.vc',
      'savefiles.top',
      'mxdrop.to',
      'streamtape.com',
      'luluvid.com',
      'hexload.com',
      'filemoon0.top',
      'mp4upload.com',
      'streamp2p.top',
      'upnshare.top',
      'dood.la',
      'vidara.to',
      'vidsonic.net',
    ],
  };
}

function bytesToString(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function findSlug(title) {
  const key = 'slug:' + title.toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;

  const searchUrl = 'https://ver2.animeonline.ninja/?s=' + encodeURIComponent(title);
  const res = http({
    method: 'GET',
    url: searchUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!res || res.status !== 200) return null;

  const html = bytesToString(res.body);
  const needles = ['ww4.animeonline.ninja/online/', 'ver2.animeonline.ninja/online/'];
  for (const needle of needles) {
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
      if (slug && slug !== 'wp-content' && slug !== 'wp-includes') {
        cacheSet(key, slug, 86400);
        return slug;
      }
      idx = abs;
    }
  }
  return null;
}

function findEpisodeUrl(html, episode) {
  const bases = ['https://ww4.animeonline.ninja/episodio/', 'https://ver2.animeonline.ninja/episodio/'];
  const needle = 'episodio/';
  let idx = 0;
  while (true) {
    const pos = html.indexOf(needle, idx);
    if (pos === -1) break;
    const abs = pos + needle.length;
    let end = abs;
    while (end < html.length && !['/', '"', "'", '<', ' ', '\n', '\r', '\t'].includes(html[end])) {
      end++;
    }
    const path = html.slice(abs, end);
    const m = path.match(/^cap-(\d+)/);
    if (m && Number(m[1]) === episode) {
      for (const b of bases) {
        if (html.indexOf(b, pos) !== -1) {
          return b + path;
        }
      }
      return bases[0] + path;
    }
    idx = abs;
  }
  return null;
}

function findIframeSrc(html) {
  const re = /<iframe[^>]*src="([^"]+)"/;
  const m = html.match(re);
  if (m) {
    return m[1].replace(/&amp;/g, '&');
  }
  const re2 = /<iframe[^>]*src='([^']+)'/;
  const m2 = html.match(re2);
  if (m2) {
    return m2[1];
  }
  const re3 = /iframe[^>]*src=["']([^"']+)["']/;
  const m3 = html.match(re3);
  if (m3) {
    return m3[1];
  }
  return null;
}

function extractSourceGroups(html) {
  const groups = {};
  const groupRe = /<div class="OD (OD_[A-Z_]+)"[^>]*>([\s\S]*?)(?=<div class="OD |<\/body>)/g;
  let m;
  while ((m = groupRe.exec(html)) !== null) {
    const lang = m[1];
    const body = m[2];
    const re = /go_to_player\('([^']+)'\)/g;
    const urls = [];
    let mm;
    while ((mm = re.exec(body)) !== null) {
      urls.push(mm[1]);
    }
    groups[lang] = urls;
  }
  return groups;
}

function deriveStreamUrl(sourceUrl) {
  const m = sourceUrl.match(/^https?:\/\/([^/]+)\/data\/e\/([A-Za-z0-9]+)$/);
  if (m) {
    return 'https://' + m[1] + '/data/e/hls/' + m[2] + '/720p.m3u8';
  }
  return null;
}

export function servers(query) {
  log('AnimeOnline lookup: ' + JSON.stringify(query.titles) + ' ep=' + query.episode + ' dub=' + query.dub);

  let slug = null;
  for (const t of query.titles) {
    slug = findSlug(t);
    if (slug) break;
  }
  if (!slug) {
    throw new Error('AnimeOnline: no matching series found');
  }

  const seriesUrl = 'https://ver2.animeonline.ninja/online/' + slug + '/';
  const seriesRes = http({
    method: 'GET',
    url: seriesUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!seriesRes || seriesRes.status !== 200) {
    throw new Error('AnimeOnline: HTTP ' + (seriesRes ? seriesRes.status : 'none') + ' for series page');
  }
  const seriesHtml = bytesToString(seriesRes.body);

  const epUrl = findEpisodeUrl(seriesHtml, query.episode);
  if (!epUrl) {
    throw new Error('AnimeOnline: episode not found');
  }

  const epRes = http({
    method: 'GET',
    url: epUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!epRes || epRes.status !== 200) {
    throw new Error('AnimeOnline: HTTP ' + (epRes ? epRes.status : 'none') + ' for episode page');
  }
  const epHtml = bytesToString(epRes.body);

  const iframeSrc = findIframeSrc(epHtml);
  if (!iframeSrc) {
    throw new Error('AnimeOnline: no player iframe found');
  }

  const embedRes = http({
    method: 'GET',
    url: iframeSrc,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!embedRes || embedRes.status !== 200) {
    throw new Error('AnimeOnline: HTTP ' + (embedRes ? embedRes.status : 'none') + ' for player');
  }
  const embedHtml = bytesToString(embedRes.body);

  const groups = extractSourceGroups(embedHtml);
  const groupKey = query.dub ? 'OD_LAT' : 'OD_SUB';
  const sources = groups[groupKey];
  if (!sources || sources.length === 0) {
    throw new Error('AnimeOnline: no sources for language group ' + groupKey);
  }

  const sourceUrl = sources[0];
  log('AnimeOnline source: ' + sourceUrl);

  const streamUrl = deriveStreamUrl(sourceUrl);
  if (!streamUrl) {
    throw new Error('AnimeOnline: unsupported source pattern');
  }

  return [
    {
      name: 'AnimeOnline',
      dub: query.dub,
      headers: [['Referer', 'https://gupload.site/']],
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
