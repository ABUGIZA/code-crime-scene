//! AI integration layer — DeepSeek chat completions.
//! Called ONLY on explicit user request. The HTTP call happens in Rust so the
//! API key (read from the OS keychain) never crosses into the webview.

use serde::{Deserialize, Serialize};

const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";

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

/// Validate an API key with a minimal request. Returns Ok(()) if accepted.
pub async fn verify_key(key: &str) -> Result<(), String> {
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
        .post(DEEPSEEK_URL)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = resp.status();
    if status.is_success() {
        Ok(())
    } else if status.as_u16() == 401 {
        Err("Invalid API key — DeepSeek rejected it (401). Re-copy the full key from platform.deepseek.com (it starts with sk-).".to_string())
    } else if status.as_u16() == 402 {
        // Key is valid but the account has no balance — still a usable key.
        Ok(())
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(format!("DeepSeek error {status}: {}", clip(&text, 200)))
    }
}

/// Send the compact evidence summary and return the assistant's Markdown report.
/// `lang` selects the report language ("ar" => Arabic, anything else => English).
pub async fn analyze(key: &str, model: &str, summary: &str, lang: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let system = if lang == "ar" { SYSTEM_PROMPT_AR } else { SYSTEM_PROMPT };
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
        temperature: 0.4,
        max_tokens: 1200,
    };

    let resp = client
        .post(DEEPSEEK_URL)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("DeepSeek error {status}: {}", clip(&text, 300)));
    }

    let parsed: ChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse DeepSeek response: {e}"))?;

    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "DeepSeek returned an empty response.".to_string())
}

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        s.chars().take(n).collect()
    }
}
