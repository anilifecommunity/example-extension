wit_bindgen::generate!({
    path: "wit",
    world: "provider",
});

use anilili::provider::host;
use anilili::provider::types::{MediaStream, ProviderInfo, Query, Request, Server};

struct Component;

impl Guest for Component {
    fn info() -> ProviderInfo {
        ProviderInfo {
            name: "Example".to_string(),
            hosts: vec!["api.example.com".to_string()],
        }
    }

    fn servers(query: Query) -> Result<Vec<Server>, String> {
        let title = query.titles.first().ok_or("no titles provided")?;
        host::log(&format!("lookup: {title} ep={} dub={}", query.episode, query.dub));

        let cache_key = format!("ep:{}:{}:{}", query.anilist_id, query.episode, query.dub);
        if let Some(cached) = host::cache_get(&cache_key) {
            return parse_response(&cached);
        }

        let url = format!(
            "[https://api.example.com/watch?title=](https://api.example.com/watch?title=){}&episode={}&dub={}",
            percent_encode(title),
            query.episode,
            query.dub,
        );

        let res = host::http(&Request {
            method: "GET".to_string(),
            url,
            headers: vec![("Accept".to_string(), "application/json".to_string())],
            body: None,
        })?;

        if res.status != 200 {
            return Err(format!("HTTP {}", res.status));
        }

        let body = String::from_utf8(res.body).map_err(|e| e.to_string())?;
        host::cache_set(&cache_key, &body, 600);
        parse_response(&body)
    }
}

fn parse_response(text: &str) -> Result<Vec<Server>, String> {
    let json: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    for item in json["servers"].as_array().ok_or("missing servers array")? {
        let streams = item["streams"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| {
                        Some(MediaStream {
                            url: s["url"].as_str()?.to_string(),
                            quality: s["quality"].as_str().map(str::to_string),
                            format: s["format"].as_str().unwrap_or("hls").to_string(),
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if streams.is_empty() {
            continue;
        }

        out.push(Server {
            name: item["name"].as_str().unwrap_or("Example").to_string(),
            dub: item["dub"].as_bool().unwrap_or(false),
            headers: vec![("Referer".to_string(), "[https://api.example.com/](https://api.example.com/)".to_string())],
            streams,
        });
    }

    Ok(out)
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