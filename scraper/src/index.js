import { http, log, cacheGet, cacheSet } from 'anilili:provider/host@1.0.0';

export function info() {
  return {
    name: 'Aniwave',
    hosts: ['aniwaves.tv', 'play.vhscdn.to', 'st3.dpopdrop89.store', 'spr-cdn.winghoster.site', 'hlsxst3.winghoster.site', 'aburton.emanateswellyunci.cfd'],
  };
}

function bytesToString(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes));
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

  const searchUrl = 'https://aniwaves.tv/filter?keyword=' + encodeURIComponent(title);
  const res = http({
    method: 'GET',
    url: searchUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!res || res.status !== 200) return null;

  const html = bytesToString(res.body);
  const needle = 'aniwaves.tv/watch/';
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
    if (path && path !== 'wp-content' && path !== 'wp-includes') {
      cacheSetStr(key, path);
      return path;
    }
    idx = abs;
  }
  return null;
}

function findStreamUrl(html, dub) {
  const marker = 'id="w-servers"';
  const pos = html.indexOf(marker);
  if (pos === -1) {
    throw new Error('Aniwave: no w-servers found');
  }
  const typeStart = html.indexOf('<div class="type" data-type="', pos);
  const type = dub ? 'dub' : 'sub';
  const typeRe = '<div class="type" data-type="' + type + '">';
  const tpos = html.indexOf(typeRe, pos);
  const groupStart = tpos;
  const nextType = html.indexOf('<div class="type" data-type="', tpos + typeRe.length);
  const groupEnd = nextType === -1 ? html.length : nextType;
  const groupHtml = html.slice(groupStart, groupEnd);

  const liRe = /<li ([^>]*?)>/g;
  const items = [];
  let m;
  while ((m = liRe.exec(groupHtml)) !== null) {
    const attrs = m[1];
    const get = (name) => {
      const mm = attrs.match(new RegExp(name + '="([^"]*)"'));
      return mm ? mm[1] : null;
    };
    if (get('data-link-id')) {
      items.push({ dataLinkId: get('data-link-id'), svId: get('data-sv-id') });
    }
  }
  if (items.length === 0) {
    throw new Error('Aniwave: no sources found for ' + type);
  }

  const linkId = items[0].dataLinkId;
  const sourcesUrl = 'https://aniwaves.tv/ajax/sources?id=' + encodeURIComponent(linkId) + '&asi=0&autoPlay=0';
  const srcRes = http({
    method: 'GET',
    url: sourcesUrl,
    headers: [['Accept', 'application/json'], ['X-Requested-With', 'XMLHttpRequest']],
    body: undefined,
  });
  if (!srcRes || srcRes.status !== 200) {
    throw new Error('Aniwave: sources HTTP ' + (srcRes ? srcRes.status : 'none'));
  }
  const srcText = bytesToString(srcRes.body);
  const srcJson = JSON.parse(srcText);
  const streamUrl = srcJson && srcJson.result ? srcJson.result.url : null;
  if (!streamUrl) {
    throw new Error('Aniwave: no stream url in sources response');
  }

  const emb = streamUrl.match(/embed-1\/([^?&#]+)/);
  const embedId = emb ? emb[1] : null;
  if (!embedId) {
    throw new Error('Aniwave: no embed id');
  }
  const getSourcesUrl = 'https://play.vhscdn.to/embed-1/getSources?id=' + encodeURIComponent(embedId) + '&asi=0&autoPlay=0&ao=0&autostart=true';
  const getRes = http({
    method: 'GET',
    url: getSourcesUrl,
    headers: [['Accept', 'application/json'], ['Referer', 'https://play.vhscdn.to/embed-1/']],
    body: undefined,
  });
  if (!getRes || getRes.status !== 200) {
    throw new Error('Aniwave: getSources HTTP ' + (getRes ? getRes.status : 'none'));
  }
  const getJson = JSON.parse(bytesToString(getRes.body));
  const finalUrl = getJson && getJson.sources ? getJson.sources : null;
  if (!finalUrl) {
    throw new Error('Aniwave: no final stream url');
  }

  return finalUrl;
}

export function servers(query) {
  log('Aniwave lookup: ' + JSON.stringify(query.titles) + ' ep=' + query.episode + ' dub=' + query.dub);

  let slug = null;
  for (const t of query.titles) {
    slug = findSlug(t);
    if (slug) break;
  }
  if (!slug) {
    throw new Error('Aniwave: no matching series found');
  }

  const seriesUrl = 'https://aniwaves.tv/watch/' + slug;
  const seriesRes = http({
    method: 'GET',
    url: seriesUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!seriesRes || seriesRes.status !== 200) {
    throw new Error('Aniwave: HTTP ' + (seriesRes ? seriesRes.status : 'none') + ' for series page');
  }
  const seriesHtml = bytesToString(seriesRes.body);

  const epUrl = seriesUrl + '/ep-' + query.episode;
  const epRes = http({
    method: 'GET',
    url: epUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!epRes || epRes.status !== 200) {
    throw new Error('Aniwave: HTTP ' + (epRes ? epRes.status : 'none') + ' for episode page');
  }
  const epHtml = bytesToString(epRes.body);

  const streamUrl = findStreamUrl(epHtml, query.dub);

  return [
    {
      name: 'Aniwave',
      dub: query.dub,
      headers: [['Referer', 'https://aniwaves.tv/']],
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
