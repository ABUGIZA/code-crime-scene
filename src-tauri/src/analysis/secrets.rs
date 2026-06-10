//! Secret detection v2: provider-specific token shapes, FiveM server.cfg keys,
//! and an entropy-gated generic assignment detector. One finding per
//! (file, line) — detectors are ordered most-specific / highest-severity first.

use super::defs::Patterns;
use super::detect::truncate;
use crate::models::SecurityFinding;
use std::collections::HashMap;

pub(crate) fn scan_security(
    path: &str,
    lang: &str,
    content: &str,
    pats: &Patterns,
    out: &mut Vec<SecurityFinding>,
) {
    let dampen = is_damp_path(path);
    let name = path.rsplit('/').next().unwrap_or(path).to_ascii_lowercase();
    let is_cfg = name == "server.cfg" || lang == "Config";
    for (idx, line) in content.lines().enumerate() {
        if line.len() > 400 {
            continue; // skip minified / data lines
        }
        if let Some(mut f) = match_line(path, idx, line, pats, is_cfg) {
            if dampen {
                f.severity = "low".into();
            }
            out.push(f);
        }
    }
}

/// Test/fixture/mock paths get downgraded to low severity.
fn is_damp_path(path: &str) -> bool {
    let p = path.to_ascii_lowercase();
    ["test", "fixture", "mock", "example", "__tests__"].iter().any(|t| p.contains(t))
}

/// First matching detector wins; ordering encodes specificity and severity.
fn match_line(path: &str, idx: usize, line: &str, pats: &Patterns, is_cfg: bool) -> Option<SecurityFinding> {
    let raw = match_line_raw(line, pats, is_cfg)?;
    Some(make_finding(path, idx, raw.kind, raw.severity, line, raw.secret))
}

/// A detector hit, decoupled from `path`/`idx` so the matching logic is pure.
struct RawHit<'a> {
    kind: &'a str,
    severity: &'a str,
    secret: &'a str,
}

fn raw<'a>(kind: &'a str, severity: &'a str, secret: &'a str) -> Option<RawHit<'a>> {
    Some(RawHit { kind, severity, secret })
}

/// Run the ordered detector groups against `line`; ordering encodes specificity
/// and severity (most-specific / highest-severity first).
fn match_line_raw<'a>(line: &'a str, pats: &Patterns, is_cfg: bool) -> Option<RawHit<'a>> {
    if pats.sec_private_key.is_match(line) {
        return raw("Private key material", "high", "");
    }
    if is_cfg {
        if let Some(hit) = match_cfg(line, pats) {
            return Some(hit);
        }
    }
    if let Some(hit) = match_table(line, HIGH_PROVIDERS, pats, "high") {
        return Some(hit);
    }
    if let Some(hit) = match_table(line, MEDIUM_PROVIDERS, pats, "medium") {
        return Some(hit);
    }
    match_generic_assign(line, pats)
}

/// FiveM server.cfg keys; the matched value (second whitespace token) is masked.
fn match_cfg<'a>(line: &'a str, pats: &Patterns) -> Option<RawHit<'a>> {
    let cfg: [(&regex::Regex, &str); 3] = [
        (&pats.sec_rcon, "RCON password in server.cfg"),
        (&pats.sec_fivem_license, "FiveM license key"),
        (&pats.sec_steam_key, "Steam Web API key"),
    ];
    for (re, kind) in cfg {
        if let Some(m) = re.find(line) {
            return raw(kind, "high", cfg_value(m.as_str()));
        }
    }
    None
}

/// Selector for a provider regex on `Patterns`, paired with its finding kind.
type Provider = (fn(&Patterns) -> &regex::Regex, &'static str);

const HIGH_PROVIDERS: &[Provider] = &[
    (|p| &p.sec_aws, "AWS access key"),
    (|p| &p.sec_aws_sts, "AWS STS key"),
    (|p| &p.sec_github, "GitHub token"),
    (|p| &p.sec_stripe, "Stripe live key"),
    (|p| &p.sec_anthropic, "Anthropic API key"),
    (|p| &p.sec_slack_token, "Slack token"),
    (|p| &p.sec_google, "Google API key"),
    (|p| &p.sec_npm, "npm token"),
    (|p| &p.sec_sendgrid, "SendGrid API key"),
    (|p| &p.sec_telegram, "Telegram bot token"),
    (|p| &p.sec_generic_sk, "API secret key"),
];

const MEDIUM_PROVIDERS: &[Provider] = &[
    (|p| &p.sec_whsec, "Stripe webhook secret"),
    (|p| &p.sec_slack_webhook, "Slack webhook URL"),
    (|p| &p.sec_twilio, "Twilio API key"),
    (|p| &p.sec_jwt, "JWT committed to source"),
];

/// First provider in `table` whose regex matches; the full match is the secret.
fn match_table<'a>(
    line: &'a str,
    table: &[Provider],
    pats: &Patterns,
    severity: &'static str,
) -> Option<RawHit<'a>> {
    for (sel, kind) in table {
        if let Some(m) = sel(pats).find(line) {
            return raw(kind, severity, m.as_str());
        }
    }
    None
}

/// Generic `key = "value"` assignment, entropy-gated; placeholders are ignored.
fn match_generic_assign<'a>(line: &'a str, pats: &Patterns) -> Option<RawHit<'a>> {
    let caps = pats.sec_assign.captures(line)?;
    let val = caps.get(2).map(|x| x.as_str()).unwrap_or("");
    if pats.sec_placeholder.is_match(val) {
        return None; // obvious placeholder, not a secret
    }
    if shannon_entropy(val) >= 4.2 && val.chars().count() >= 20 {
        return raw("High-entropy secret", "high", val);
    }
    raw("Hardcoded secret", "medium", val)
}

/// The value part of a `key value` server.cfg match (for masking).
fn cfg_value(matched: &str) -> &str {
    matched.split_whitespace().nth(1).unwrap_or("")
}

/// Shannon entropy in bits per character (no dependencies).
pub(crate) fn shannon_entropy(s: &str) -> f64 {
    let mut counts: HashMap<char, usize> = HashMap::new();
    let mut n = 0usize;
    for c in s.chars() {
        *counts.entry(c).or_insert(0) += 1;
        n += 1;
    }
    if n == 0 {
        return 0.0;
    }
    let nf = n as f64;
    -counts
        .values()
        .map(|&c| {
            let p = c as f64 / nf;
            p * p.log2()
        })
        .sum::<f64>()
}

pub(crate) fn make_finding(
    path: &str,
    idx: usize,
    kind: &str,
    severity: &str,
    line: &str,
    secret: &str,
) -> SecurityFinding {
    let masked = if secret.is_empty() {
        line.trim().to_string()
    } else {
        line.trim().replace(secret, "«redacted»")
    };
    SecurityFinding {
        file: path.to_string(),
        line: idx + 1,
        kind: kind.to_string(),
        severity: severity.to_string(),
        snippet: truncate(&masked, 160),
    }
}

pub(crate) fn severity_rank(s: &str) -> u8 {
    match s {
        "high" => 0,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    }
}
