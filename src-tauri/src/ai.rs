//! AI integration layer — multi-provider chat completions.
//! Providers: DeepSeek, OpenAI, Anthropic, and any custom OpenAI-compatible
//! endpoint (Ollama, LM Studio, vLLM…). Called ONLY on explicit user request.
//! The HTTP call happens in Rust so the API key (read from the OS keychain)
//! never crosses into the webview.

use serde::{Deserialize, Serialize};

const ANTHROPIC_VERSION: &str = "2023-06-01";
const TEMPERATURE: f32 = 0.4;
const MAX_TOKENS: u32 = 1200;

const SYSTEM_PROMPT: &str = r#"You are a senior software-forensics investigator.
You receive a compact summary of a LOCAL static code analysis ("the evidence").
Write a sharp, practical "Detective's Report" in Markdown using exactly these sections:

## Verdict
One or two lines: overall state of the codebase.

## Key Suspects
The riskiest files / hotspots, referencing concrete numbers from the evidence.

## Modus Operandi
The root causes behind the technical debt (duplication, long functions, coupling, etc.).

## Recommended Sentence
A short, prioritized, concrete action list (max 6 items).

Rules: reference the actual numbers, name real files, avoid generic filler, never invent data
not present in the evidence. Keep the whole report under 400 words."#;

const SYSTEM_PROMPT_AR: &str = r#"أنت محقّق جنائي خبير في هندسة البرمجيات. تصلك خلاصة مضغوطة لتحليل ساكن محلي ("الأدلّة").
اكتب "تقرير المحقّق" بالعربية بأسلوب احترافي وحادّ، وبهذه الأقسام بالضبط:

## الحكم
سطر أو سطران عن الحالة العامة للكود.

## المشتبه بهم
أخطر الملفات والبؤر، مع أرقام محدّدة من الأدلّة.

## أسلوب الجريمة
الأسباب الجذرية للدَّين التقني (تكرار، دوال طويلة، ترابط مفرط…).

## الحكم والعقوبة
قائمة إصلاحات عملية مرتّبة حسب الأولوية (٦ بنود كحدٍّ أقصى).

القواعد: استشهد بالأرقام الفعلية، وسمِّ ملفات حقيقية، وتجنّب الحشو، ولا تختلق بيانات غير موجودة.
اجعل التقرير تحت ٤٠٠ كلمة، وبعربية واضحة قوية احترافية."#;

// --- provider resolution ------------------------------------------------------

/// Human-readable provider name for error messages.
pub fn display_name(provider: &str) -> &'static str {
    match provider {
        "openai" => "OpenAI",
        "anthropic" => "Anthropic",
        "custom" => "Custom endpoint",
        _ => "DeepSeek",
    }
}

/// Resolved provider: display name + API base URL (no trailing slash).
struct Provider {
    name: &'static str,
    base: String,
    is_custom: bool,
}

/// Map a provider id to its canonical base. `base_url` is only used for
/// "custom"; the named providers always use their official base.
fn resolve(provider: &str, base_url: &str) -> Result<Provider, String> {
    let named = |base: &str| Provider {
        name: display_name(provider),
        base: base.to_string(),
        is_custom: false,
    };
    match provider {
        "deepseek" => Ok(named("https://api.deepseek.com")),
        "openai" => Ok(named("https://api.openai.com/v1")),
        "anthropic" => Ok(named("https://api.anthropic.com/v1")),
        "custom" => {
            let base = base_url.trim().trim_end_matches('/').to_string();
            if base.is_empty() {
                return Err(
                    "Custom provider needs a base URL (e.g. http://localhost:11434/v1)."
                        .to_string(),
                );
            }
            Ok(Provider {
                name: "Custom endpoint",
                base,
                is_custom: true,
            })
        }
        other => Err(format!("Unknown AI provider: {other}")),
    }
}

fn invalid_key_msg(name: &str) -> String {
    let hint = match name {
        "DeepSeek" => "Re-copy the full key from platform.deepseek.com (it starts with sk-).",
        "OpenAI" => "Re-copy the full key from platform.openai.com/api-keys (it starts with sk-).",
        "Anthropic" => "Re-copy the full key from console.anthropic.com (it starts with sk-ant-).",
        _ => "Check the key configured for this endpoint.",
    };
    format!("Invalid API key — {name} rejected it (401). {hint}")
}

/// Network-failure message; local custom endpoints get a clearer hint.
fn network_err(p: &Provider, e: &reqwest::Error) -> String {
    if p.is_custom {
        format!("Could not reach {} — is the local server running?", p.base)
    } else {
        format!("Network error: {e}")
    }
}

// --- request / response shapes ------------------------------------------------

/// OpenAI-style chat body (DeepSeek, OpenAI, custom endpoints).
#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<Msg<'a>>,
    stream: bool,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Serialize)]
struct Msg<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: RespMsg,
}

#[derive(Deserialize)]
struct RespMsg {
    content: String,
}

/// Anthropic Messages API body (system prompt is a top-level field).
#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: Vec<Msg<'a>>,
    temperature: f32,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicBlock>,
}

#[derive(Deserialize)]
struct AnthropicBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

// --- key verification -----------------------------------------------------------

/// Validate an API key for the given provider. Returns Ok(()) if usable.
/// `base_url` is only consulted for the "custom" provider.
pub async fn verify_key(provider: &str, base_url: &str, key: &str) -> Result<(), String> {
    let p = resolve(provider, base_url)?;
    match provider {
        // DeepSeek has no GET /models; probe with a minimal chat request.
        "deepseek" => verify_deepseek(&p, key).await,
        "anthropic" => verify_via_models(&p, key, true).await,
        // OpenAI and custom OpenAI-compatible servers expose GET {base}/models.
        _ => verify_via_models(&p, key, false).await,
    }
}

async fn verify_deepseek(p: &Provider, key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let body = ChatRequest {
        model: "deepseek-chat",
        messages: vec![Msg {
            role: "user",
            content: "ping",
        }],
        stream: false,
        temperature: 0.0,
        max_tokens: 1,
    };
    let resp = client
        .post(format!("{}/chat/completions", p.base))
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| network_err(p, &e))?;

    let status = resp.status();
    if status.is_success() {
        Ok(())
    } else if status.as_u16() == 401 {
        Err(invalid_key_msg(p.name))
    } else if status.as_u16() == 402 {
        // Key is valid but the account has no balance — still a usable key.
        Ok(())
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(format!("{} error {status}: {}", p.name, clip(&text, 200)))
    }
}

/// Verify via GET {base}/models. Anthropic needs x-api-key + version headers;
/// the others use bearer auth — skipped when no key is set (e.g. Ollama).
async fn verify_via_models(p: &Provider, key: &str, anthropic: bool) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut req = client.get(format!("{}/models", p.base));
    req = if anthropic {
        req.header("x-api-key", key)
            .header("anthropic-version", ANTHROPIC_VERSION)
    } else if !key.is_empty() {
        req.bearer_auth(key)
    } else {
        req
    };
    let resp = req.send().await.map_err(|e| network_err(p, &e))?;

    let status = resp.status();
    if status.is_success() {
        Ok(())
    } else if status.as_u16() == 401 {
        Err(invalid_key_msg(p.name))
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(format!("{} error {status}: {}", p.name, clip(&text, 200)))
    }
}

// --- analysis -------------------------------------------------------------------

/// Send the compact evidence summary and return the assistant's Markdown report.
/// `lang` selects the report language ("ar" => Arabic, anything else => English).
/// `base_url` is only consulted for the "custom" provider.
pub async fn analyze(
    provider: &str,
    base_url: &str,
    key: &str,
    model: &str,
    summary: &str,
    lang: &str,
) -> Result<String, String> {
    let p = resolve(provider, base_url)?;
    let system = if lang == "ar" { SYSTEM_PROMPT_AR } else { SYSTEM_PROMPT };
    match provider {
        "anthropic" => analyze_anthropic(&p, key, model, system, summary).await,
        _ => analyze_openai_style(&p, key, model, system, summary).await,
    }
}

/// OpenAI-style POST {base}/chat/completions (DeepSeek, OpenAI, custom).
async fn analyze_openai_style(
    p: &Provider,
    key: &str,
    model: &str,
    system: &str,
    summary: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = ChatRequest {
        model,
        messages: vec![
            Msg {
                role: "system",
                content: system,
            },
            Msg {
                role: "user",
                content: summary,
            },
        ],
        stream: false,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
    };

    let mut req = client.post(format!("{}/chat/completions", p.base));
    if !key.is_empty() {
        req = req.bearer_auth(key);
    }
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| network_err(p, &e))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("{} error {status}: {}", p.name, clip(&text, 300)));
    }

    let parsed: ChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse {} response: {e}", p.name))?;

    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| format!("{} returned an empty response.", p.name))
}

/// POST {base}/messages with Anthropic headers; concatenates "text" blocks.
async fn analyze_anthropic(
    p: &Provider,
    key: &str,
    model: &str,
    system: &str,
    summary: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = AnthropicRequest {
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: vec![Msg {
            role: "user",
            content: summary,
        }],
        temperature: TEMPERATURE,
    };

    let resp = client
        .post(format!("{}/messages", p.base))
        .header("x-api-key", key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&body)
        .send()
        .await
        .map_err(|e| network_err(p, &e))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("{} error {status}: {}", p.name, clip(&text, 300)));
    }

    let parsed: AnthropicResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse {} response: {e}", p.name))?;

    let text: String = parsed
        .content
        .iter()
        .filter(|b| b.kind == "text")
        .map(|b| b.text.as_str())
        .collect();

    if text.trim().is_empty() {
        Err(format!("{} returned an empty response.", p.name))
    } else {
        Ok(text)
    }
}

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        s.chars().take(n).collect()
    }
}
