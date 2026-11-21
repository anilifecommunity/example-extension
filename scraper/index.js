
import * as cheerio from "cheerio";
import { URL } from "node:url";
import readline from "node:readline/promises";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isValidUrl(value, base) {
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function getServiceName(host) {
  const known = {
    "vidstream": "Vidstream",
    "streamtape": "Streamtape",
    "filemoon": "Filemoon",
    "dood": "DoodStream",
    "mp4upload": "MP4Upload"
  };

  const match = Object.entries(known).find(
    ([key]) => host.toLowerCase().includes(key)
  );

  return match?.[1] ?? "Unknown player host";
}

async function inspect(url) {
  const parsed = new URL(url);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  console.log("\nFetching webpage:", url);

  
const response = await fetch(url, {
  headers: {
    "User-Agent": "AnimeInspector/1.0",
    "Accept": "text/html"
  },
  signal: AbortSignal.timeout(15000)
});

console.log("Status:", response.status);
console.log("Final URL:", response.url);
console.log("Content-Type:", response.headers.get("content-type"));
console.log("Server:", response.headers.get("server"));

if (response.status === 403) {
  const body = await response.text();

  return {
    error: "ACCESS_DENIED",
    status: 403,
    finalUrl: response.url,
    server: response.headers.get("server"),
    responsePreview: body.slice(0, 500),
    message: "The website refused this request."
  };
}

if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}


  const html = await response.text();
  const $ = cheerio.load(html);

  const embeds = new Map();

  // Inspect publicly exposed player containers.
  $("iframe[src], iframe[data-src], embed[src], object[data]")
    .each((_, element) => {
      const raw =
        $(element).attr("src") ||
        $(element).attr("data-src") ||
        $(element).attr("data");

      if (!raw) return;

      const embedUrl = isValidUrl(raw, response.url);
      if (!embedUrl) return;

      const host = getDomain(embedUrl);
      if (!host) return;

      if (!embeds.has(host)) {
        embeds.set(host, {
          service: getServiceName(host),
          domain: host,
          embeds: []
        });
      }

      embeds.get(host).embeds.push(embedUrl);
    });

  const result = {
    page: url,
    pageTitle: $("title").text().trim(),
    hasVideoElement: $("video").length > 0,
    playerHosts: [...embeds.values()]
  };

  return result;
}

try {
  const url = await rl.question("Anime episode URL: ");

  const result = await inspect(url);

  console.log("\n========== RESULTS ==========\n");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n========== PLAYER HOSTS ==========\n");

  for (const player of result.playerHosts) {
    console.log("Service:", player.service);
    console.log("Domain:", player.domain);
    console.log("Embeds:", player.embeds.length);
    console.log("-----------------------------");
  }

} catch (error) {
  console.error("Inspector error:", error.message);
} finally {
  rl.close();
}
