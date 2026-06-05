use crate::{
    db::{month_range, resolve_range},
    models::{AlertRule, AppSettings, ConnectionInfo, TrafficSnapshot, UsageAggregate, UsageRange},
    AppState,
};
use serde_json::Value;
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
};
use tauri::{AppHandle, LogicalSize, Manager, Size, State, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn get_current_snapshot(state: State<'_, AppState>) -> Result<TrafficSnapshot, String> {
    Ok(state.runtime.lock().snapshot.clone())
}

#[tauri::command]
pub fn get_usage_summary(
    range: UsageRange,
    group_by: String,
    state: State<'_, AppState>,
) -> Result<Vec<UsageAggregate>, String> {
    let (start, end) = resolve_range(&range);
    match group_by.as_str() {
        "app" => {
            let apps = state.db.app_usage(start, end)?;
            Ok(apps
                .into_iter()
                .map(|app| UsageAggregate {
                    label: app.app_name.clone(),
                    bucket_start: start,
                    bucket_end: end,
                    download_bytes: app.download_bytes,
                    upload_bytes: app.upload_bytes,
                    overseas_bytes: app.overseas_bytes,
                    group_key: app.app_key,
                    group_name: app.app_name,
                })
                .collect())
        }
        "country" | "geo" => {
            let (download, upload, overseas) = state.db.totals(start, end)?;
            Ok(vec![
                UsageAggregate {
                    label: "中国大陆外".to_string(),
                    bucket_start: start,
                    bucket_end: end,
                    download_bytes: overseas,
                    upload_bytes: 0,
                    overseas_bytes: overseas,
                    group_key: "outside_mainland".to_string(),
                    group_name: "中国大陆外".to_string(),
                },
                UsageAggregate {
                    label: "其他/未知".to_string(),
                    bucket_start: start,
                    bucket_end: end,
                    download_bytes: download.saturating_add(upload).saturating_sub(overseas),
                    upload_bytes: 0,
                    overseas_bytes: 0,
                    group_key: "other".to_string(),
                    group_name: "其他/未知".to_string(),
                },
            ])
        }
        _ => state.db.usage_points(start, end),
    }
}

#[tauri::command]
pub fn list_connections(
    filter: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<ConnectionInfo>, String> {
    let filter = filter.trim().to_ascii_lowercase();
    let connections = state.runtime.lock().connections.clone();
    let limit = limit.unwrap_or(600).clamp(50, 2_000);
    let rows = if filter.is_empty() {
        connections
    } else {
        connections
            .into_iter()
            .filter(|conn| {
                format!(
                    "{} {} {} {} {}",
                    conn.app_key,
                    conn.app_name,
                    conn.process_name,
                    conn.remote_ip,
                    conn.endpoint.region_name
                )
                .to_ascii_lowercase()
                .contains(&filter)
            })
            .collect()
    };
    Ok(rows.into_iter().take(limit).collect())
}

#[tauri::command]
pub fn list_app_usage(
    range: UsageRange,
    state: State<'_, AppState>,
) -> Result<Vec<crate::models::AppUsage>, String> {
    let (start, end) = resolve_range(&range);
    let mut apps = state.db.app_usage(start, end)?;
    let current = state.runtime.lock().apps.clone();
    for app in &mut apps {
        if let Some(current) = current.iter().find(|item| item.app_key == app.app_key) {
            app.current_download_bps = current.current_download_bps;
            app.current_upload_bps = current.current_upload_bps;
            app.connection_count = current.connection_count;
            app.overseas_connection_count = current.overseas_connection_count;
        }
    }
    if apps.is_empty() {
        Ok(current)
    } else {
        Ok(apps)
    }
}

#[tauri::command]
pub fn set_alert_rule(rule: AlertRule, state: State<'_, AppState>) -> Result<AlertRule, String> {
    state.db.set_alert_rule(rule)
}

#[tauri::command]
pub fn list_alerts(
    range: UsageRange,
    state: State<'_, AppState>,
) -> Result<Vec<crate::models::AlertEvent>, String> {
    let (start, end) = resolve_range(&range);
    state.db.alerts(start, end)
}

#[tauri::command]
pub fn update_settings(settings: Value, state: State<'_, AppState>) -> Result<AppSettings, String> {
    let mut current = state.settings.lock().clone();
    merge_settings(&mut current, settings);
    state.db.save_settings(&current)?;
    *state.settings.lock() = current.clone();
    Ok(current)
}

#[tauri::command]
pub fn clear_history(scope: String, state: State<'_, AppState>) -> Result<bool, String> {
    state.db.clear_history(&scope)?;
    Ok(true)
}

#[tauri::command]
pub fn open_app_monitor(
    app_key: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let app_key = app_key.trim();
    if app_key.is_empty() {
        return Err("应用标识不能为空".to_string());
    }

    let app_name = resolve_app_name(app_key, &state)
        .ok_or_else(|| format!("未找到应用监控目标：{app_key}"))?;
    let label = app_monitor_label(app_key);
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(true);
    }

    let title = format!("{} - 应用监控", app_name);
    let url = format!("index.html#/app/{}", encode_hash_segment(app_key));

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(900.0, 660.0)
        .min_inner_size(720.0, 520.0)
        .resizable(true)
        .build()
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn set_widget_size(size: String, app: AppHandle) -> Result<bool, String> {
    let (width, height) = match size.as_str() {
        "small" => (178.0, 120.0),
        "large" => (408.0, 232.0),
        _ => (286.0, 186.0),
    };

    if let Some(window) = app.get_webview_window("widget") {
        window
            .set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|error| error.to_string())?;
    }
    Ok(true)
}

fn merge_settings(current: &mut AppSettings, value: Value) {
    if let Some(theme) = value.get("theme").and_then(Value::as_str) {
        current.theme = theme.to_string();
    }
    if let Some(autostart) = value.get("autostart").and_then(Value::as_bool) {
        current.autostart = autostart;
    }
    if let Some(widget_visible) = value.get("widget_visible").and_then(Value::as_bool) {
        current.widget_visible = widget_visible;
    }
    if let Some(widget_size) = value.get("widget_size").and_then(Value::as_str) {
        current.widget_size = widget_size.to_string();
    }
    if let Some(widget_opacity) = value.get("widget_opacity").and_then(Value::as_f64) {
        current.widget_opacity = widget_opacity.clamp(0.5, 1.0);
    }
    if let Some(include_virtual_adapters) = value
        .get("include_virtual_adapters")
        .and_then(Value::as_bool)
    {
        current.include_virtual_adapters = include_virtual_adapters;
    }
    if value.get("monthly_quota_bytes").is_some() {
        current.monthly_quota_bytes = value.get("monthly_quota_bytes").and_then(Value::as_u64);
    }
    if value.get("daily_quota_bytes").is_some() {
        current.daily_quota_bytes = value.get("daily_quota_bytes").and_then(Value::as_u64);
    }
    if value.get("overseas_quota_bytes").is_some() {
        current.overseas_quota_bytes = value.get("overseas_quota_bytes").and_then(Value::as_u64);
    }
}

fn app_monitor_label(app_key: &str) -> String {
    let mut prefix = app_key
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    while prefix.contains("--") {
        prefix = prefix.replace("--", "-");
    }
    prefix = prefix.trim_matches('-').to_string();
    if prefix.is_empty() {
        prefix = "app".to_string();
    }
    if prefix.len() > 34 {
        prefix.truncate(34);
    }

    let mut hasher = DefaultHasher::new();
    app_key.hash(&mut hasher);
    format!("app-monitor-{}-{:016x}", prefix, hasher.finish())
}

fn resolve_app_name(app_key: &str, state: &AppState) -> Option<String> {
    let runtime_name = {
        let runtime = state.runtime.lock();
        runtime
            .apps
            .iter()
            .find(|item| item.app_key.eq_ignore_ascii_case(app_key))
            .map(|item| item.app_name.clone())
            .or_else(|| {
                runtime
                    .connections
                    .iter()
                    .find(|item| item.app_key.eq_ignore_ascii_case(app_key))
                    .map(|item| item.app_name.clone())
            })
    };
    if runtime_name.is_some() {
        return runtime_name;
    }

    let (start, end) = month_range();
    state.db.app_usage(start, end).ok().and_then(|apps| {
        apps.into_iter()
            .find(|item| item.app_key.eq_ignore_ascii_case(app_key))
            .map(|item| item.app_name)
    })
}

fn encode_hash_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}
