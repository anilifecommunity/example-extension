wit_bindgen::generate!({
    path: "wit",
    world: "provider",
});

use anilili::provider::host;
use anilili::provider::types::{MediaStream, ProviderInfo, Query, Request, Response, Server};

struct Component;

impl Guest for Component {
    fn info() -> ProviderInfo {
        ProviderInfo {
            name: "AnimeSalt".to_string(),
            hosts: vec![
                "animesalt.cx".to_string(),
                "ravok.buzz".to_string(),
            ],
        }
    }

    fn servers(query: Query) -> Result<Vec<Server>, String> {
        host::log(&format!("AnimeSalt lookup: titles={:?} ep={} dub={}", query.titles, query.episode, query.dub));

        let mut slug: Option<String> = None;
        for t in &query.titles {
            if let Some(s) = find_slug(t) {
                slug = Some(s);
                break;
            }
        }
        let slug = slug.ok_or_else(|| "AnimeSalt: no matching series found".to_string())?;

        let season = detect_season(&query.titles).unwrap_or(1);
        let ep_str = format!("{}", query.episode);
        // trim trailing .0 not needed; rust formats 1.0 as 1

        let page_url = format!("https://animesalt.cx/episode/{}-{}x{}/", slug, season, ep_str);
        host::log(&format!("AnimeSalt page: {}", page_url));

        let res = host::http(&Request {
            method: "GET".to_string(),
            url: page_url.clone(),
            headers: vec![("Accept".to_string(), "text/html".to_string())],
            body: None,
        })?;

        if res.status != 200 {
            // try season 1 fallback
            if season != 1 {
                let fallback = format!("https://animesalt.cx/episode/{}-1x{}/", slug, ep_str);
                let res2 = host::http(&Request {
                    method: "GET".to_string(),
                    url: fallback,
                    headers: vec![("Accept".to_string(), "text/html".to_string())],
                    body: None,
                })?;
                if res2.status != 200 {
                    return Err(format!("AnimeSalt: HTTP {} for episode page", res2.status));
                }
                return handle_page(&query, &slug, &String::from_utf8_lossy(&res2.body), season);
            }
            return Err(format!("AnimeSalt: HTTP {} for episode page", res.status));
        }

        handle_page(&query, &slug, &String::from_utf8_lossy(&res.body), season)
    }
}

fn handle_page(query: &Query, _slug: &str, html: &str, _season: u32) -> Result<Vec<Server>, String> {
    let hash = extract_after(html, "ravok.buzz/video/")
        .ok_or_else(|| "AnimeSalt: no ravok embed found".to_string())?;
    host::log(&format!("AnimeSalt ravok hash: {}", hash));

    let post_url = format!("https://ravok.buzz/player/index.php?data={}&do=getVideo", hash);
    let ref_url = format!("https://ravok.buzz/video/{}", hash);
    let body = format!("hash={}&r={}", percent_encode(&hash), percent_encode(&ref_url));

    let res = host::http(&Request {
        method: "POST".to_string(),
        url: post_url,
        headers: vec![
            ("Content-Type".to_string(), "application/x-www-form-urlencoded".to_string()),
            ("X-Requested-With".to_string(), "XMLHttpRequest".to_string()),
        ],
        body: Some(body.bytes().collect()),
    })?;

    if res.status != 200 {
        return Err(format!("AnimeSalt: ravok HTTP {}", res.status));
    }

    let text = String::from_utf8(res.body).map_err(|e| e.to_string())?;
    host::log(&format!("AnimeSalt ravok resp: {}", &text[..text.len().min(200)]));

    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let video_url = json.get("videoSource")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "AnimeSalt: no videoSource".to_string())?
        .to_string();

    let hls = json.get("hls").and_then(|v| v.as_bool()).unwrap_or(true);

    let stream = MediaStream {
        url: video_url,
        quality: None,
        format: if hls { "hls".to_string() } else { "mp4".to_string() },
    };

    let server = Server {
        name: "AnimeSalt".to_string(),
        dub: query.dub,
        headers: vec![("Referer".to_string(), "https://ravok.buzz/".to_string())],
        streams: vec![stream],
    };

    Ok(vec![server])
}

fn find_slug(title: &str) -> Option<String> {
    let cache_key = format!("slug:{}", title.to_lowercase());
    if let Some(cached) = host::cache_get(&cache_key) {
        return Some(cached);
    }

    let search_url = format!("https://animesalt.cx/?s={}", percent_encode(title));
    let res = host::http(&Request {
        method: "GET".to_string(),
        url: search_url,
        headers: vec![("Accept".to_string(), "text/html".to_string())],
        body: None,
    }).ok()?;

    if res.status != 200 {
        return None;
    }
    let html = String::from_utf8_lossy(&res.body);

    // find first series link
    let needle = "animesalt.cx/series/";
    let mut idx = 0;
    while let Some(pos) = html[idx..].find(needle) {
        let abs = idx + pos + needle.len();
        // read slug until slash or quote
        let rest = &html[abs..];
        let mut end = 0;
        for (j, c) in rest.char_indices() {
            if c == '/' || c == '"' || c == '\'' || c == '<' || c.is_whitespace() {
                break;
            }
            end = j + c.len_utf8();
        }
        if end > 0 {
            let slug = rest[..end].to_string();
            // validate slug not empty
            if !slug.is_empty() {
                host::cache_set(&cache_key, &slug, 86400);
                return Some(slug);
            }
        }
        idx = abs;
    }
    None
}

fn detect_season(titles: &[String]) -> Option<u32> {
    for t in titles {
        let low = t.to_lowercase();
        if let Some(i) = low.find("season") {
            let rest = &low[i + 6..];
            let mut digits = String::new();
            for c in rest.chars() {
                if c.is_ascii_digit() {
                    digits.push(c);
                } else if !digits.is_empty() {
                    break;
                }
            }
            if !digits.is_empty() {
                if let Ok(n) = digits.parse::<u32>() {
                    return Some(n);
                }
            }
        }
        // pattern "2nd season"
        let mut chars = low.chars().peekable();
        // simple: find leading digit before "season" handled above; also try "season" not present but " s2"
    }
    None
}

fn extract_after<'a>(html: &'a str, needle: &str) -> Option<String> {
    let i = html.find(needle)?;
    let start = i + needle.len();
    let rest = &html[start..];
    let mut end = 0;
    for (j, c) in rest.char_indices() {
        if c == '"' || c == '\'' || c == '<' || c.is_whitespace() {
            break;
        }
        end = j + c.len_utf8();
    }
    if end == 0 {
        return None;
    }
    Some(rest[..end].to_string())
}

fn percent_encode(input: &str) -> String {
    input
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

export!(Component);
