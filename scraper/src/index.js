import { http, log, cacheGet, cacheSet } from 'anilili:provider/host@1.0.0';

export function info() {
  return {
    name: 'Latanime',
    hosts: ['latanime.org', 'mp4upload.com', 'www.mp4upload.com'],
  };
}

function bytesToString(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function stringToBytes(s) {
  return Array.from(new TextEncoder().encode(s));
}

function findSlug(title, dub) {
  const key = 'slug:' + title.toLowerCase() + ':' + dub;
  const cached = cacheGet(key);
  if (cached) return cached;

  const searchUrl = 'https://latanime.org/?s=' + encodeURIComponent(title);
  const res = http({
    method: 'GET',
    url: searchUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!res || res.status !== 200) return null;

  const html = bytesToString(res.body);
  const re = /latanime\.org\/anime\/([^"']+)/g;
  const slugs = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    slugs.push(m[1]);
  }
  if (slugs.length === 0) return null;

  let chosen = slugs[0];
  if (dub) {
    const latino = slugs.find(s => s.toLowerCase().includes('latino'));
    if (latino) chosen = latino;
  } else {
    const cast = slugs.find(s => s.toLowerCase().includes('castellano') || s.toLowerCase().includes('japones') || s.toLowerCase().includes('sub'));
    if (cast) chosen = cast;
  }

  cacheSet(key, chosen, 86400);
  return chosen;
}

function findMp4UploadEmbed(html) {
  const re = /data-player="([A-Za-z0-9+/=]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const url = atob(m[1]);
      if (url.includes('mp4upload')) return url;
    } catch (e) {}
  }
  return null;
}

export function servers(query) {
  log('Latanime lookup: ' + JSON.stringify(query.titles) + ' ep=' + query.episode + ' dub=' + query.dub);

  let slug = null;
  for (const t of query.titles) {
    slug = findSlug(t, query.dub);
    if (slug) break;
  }
  if (!slug) {
    throw new Error('Latanime: no matching series found');
  }

  const epUrl = 'https://latanime.org/ver/' + slug + '-episodio-' + query.episode;
  log('Latanime episode url: ' + epUrl);

  const epRes = http({
    method: 'GET',
    url: epUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!epRes || epRes.status !== 200) {
    throw new Error('Latanime: HTTP ' + (epRes ? epRes.status : 'none') + ' for episode page');
  }
  const epHtml = bytesToString(epRes.body);

  const embedUrl = findMp4UploadEmbed(epHtml);
  if (!embedUrl) {
    throw new Error('Latanime: no mp4upload embed found');
  }
  log('Latanime embed: ' + embedUrl);

  const embedRes = http({
    method: 'GET',
    url: embedUrl,
    headers: [['Accept', 'text/html']],
    body: undefined,
  });
  if (!embedRes || embedRes.status !== 200) {
    throw new Error('Latanime: HTTP ' + (embedRes ? embedRes.status : 'none') + ' for embed');
  }
  const embedHtml = bytesToString(embedRes.body);

  const mp4Match = embedHtml.match(/https?:\/\/[^\s"']*\.mp4/);
  if (!mp4Match) {
    throw new Error('Latanime: no mp4 found in embed');
  }
  const streamUrl = mp4Match[0];

  return [
    {
      name: 'Latanime',
      dub: query.dub,
      headers: [['Referer', 'https://www.mp4upload.com/']],
      streams: [
        {
          url: streamUrl,
          quality: undefined,
          format: 'mp4',
        },
      ],
    },
  ];
}
