//! Tiny shared helpers.

use std::time::{SystemTime, UNIX_EPOCH};

/// Current unix time in seconds (0 if the clock is before the epoch).
pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
