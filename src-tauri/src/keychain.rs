//! Secure API-key storage using the OS keychain (Windows Credential Manager,
//! macOS Keychain, ...). Keys are never written to disk in plaintext and are
//! never sent to the webview/JS — only Rust reads them when calling a provider.
//! One keychain account per AI provider.

use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "com.mhmds.code-crime-scene";

/// Keychain account for a provider id. Unknown/legacy ids fall back to the
/// original DeepSeek account so previously stored keys keep working.
fn account_for(provider: &str) -> &'static str {
    match provider {
        "openai" => "openai-api-key",
        "anthropic" => "anthropic-api-key",
        "custom" => "custom-api-key",
        _ => "deepseek-api-key",
    }
}

fn entry(provider: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account_for(provider)).map_err(|e| e.to_string())
}

pub fn save_key(provider: &str, key: &str) -> Result<(), String> {
    entry(provider)?.set_password(key).map_err(|e| e.to_string())
}

pub fn get_key(provider: &str) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_key(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_key(provider: &str) -> bool {
    matches!(get_key(provider), Ok(Some(_)))
}
