//! Secure API-key storage using the OS keychain (Windows Credential Manager,
//! macOS Keychain, ...). The key is never written to disk in plaintext and is
//! never sent to the webview/JS — only Rust reads it when calling DeepSeek.

use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "com.mhmds.code-crime-scene";
const ACCOUNT: &str = "deepseek-api-key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

pub fn save_key(key: &str) -> Result<(), String> {
    entry()?.set_password(key).map_err(|e| e.to_string())
}

pub fn get_key() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_key() -> bool {
    matches!(get_key(), Ok(Some(_)))
}
