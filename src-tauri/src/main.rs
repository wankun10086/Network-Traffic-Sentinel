mod collector;
mod commands;
mod db;
mod geo;
mod models;

use crate::{
    collector::{CollectorSample, NetworkCollector},
    db::{month_range, today_range, Database},
    geo::GeoResolver,
    models::{AlertEvent, AppSettings, CollectorStatus, TrafficSnapshot},
};
use chrono::Utc;
use parking_lot::Mutex;
use std::{collections::HashSet, path::PathBuf, sync::Arc, thread, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
};

#[derive(Clone)]
pub struct AppState {
    runtime: Arc<Mutex<RuntimeState>>,
    db: Arc<Database>,
    geo: Arc<GeoResolver>,
    settings: Arc<Mutex<AppSettings>>,
}

pub struct RuntimeState {
    snapshot: TrafficSnapshot,
    connections: Vec<models::ConnectionInfo>,
    apps: Vec<models::AppUsage>,
    seen_apps: HashSet<String>,
    raised_alerts: HashSet<String>,
    last_db_view_refresh: i64,
    today_totals: (u64, u64, u64),
    month_totals: (u64, u64, u64),
    usage_points: Vec<models::UsageAggregate>,
    recent_alerts: Vec<AlertEvent>,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = build_state(app.handle())?;
            app.manage(state.clone());
            setup_tray(app)?;
            spawn_collector(app.handle().clone(), state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_current_snapshot,
            commands::get_usage_summary,
            commands::list_connections,
            commands::list_app_usage,
            commands::set_alert_rule,
            commands::list_alerts,
            commands::update_settings,
            commands::clear_history,
            commands::open_app_monitor,
            commands::set_widget_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running traffic sentinel");
}

fn build_state(app: &AppHandle) -> Result<AppState, Box<dyn std::error::Error>> {
    let app_data = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".traffic-sentinel"));
    let db = Arc::new(Database::open(&app_data.join("traffic-sentinel.sqlite3"))?);
    let _ = db.apply_retention();
    let settings = db.load_settings().unwrap_or_default();
    let resource_geo = app
        .path()
        .resource_dir()
        .ok()
        .map(|path| path.join("geoip").join("country-ranges.csv"));
    let geo = Arc::new(GeoResolver::load(resource_geo));
    let status = CollectorStatus {
        running: true,
        permission_level: "standard".to_string(),
        adapter_count: 0,
        last_error: None,
        geo_db_loaded: geo.loaded(),
        geo_db_label: geo.label().to_string(),
        started_at: Utc::now().timestamp_millis(),
    };

    let snapshot = TrafficSnapshot::empty(status);
    Ok(AppState {
        runtime: Arc::new(Mutex::new(RuntimeState {
            snapshot,
            connections: Vec::new(),
            apps: Vec::new(),
            seen_apps: HashSet::new(),
            raised_alerts: HashSet::new(),
            last_db_view_refresh: 0,
            today_totals: (0, 0, 0),
            month_totals: (0, 0, 0),
            usage_points: Vec::new(),
            recent_alerts: Vec::new(),
        })),
        db,
        geo,
        settings: Arc::new(Mutex::new(settings)),
    })
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开主窗口", true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", "显示/隐藏悬浮窗", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &widget, &quit])?;

    TrayIconBuilder::with_id("traffic-sentinel")
        .tooltip("流量哨兵")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_window(app, "main"),
            "widget" => toggle_window(app, "widget"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                show_window(tray.app_handle(), "main");
            }
        })
        .build(app)?;
    Ok(())
}

fn show_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn spawn_collector(app: AppHandle, state: AppState) {
    thread::spawn(move || {
        let include_virtual = state.settings.lock().include_virtual_adapters;
        let mut collector = NetworkCollector::new(include_virtual);
        loop {
            match collector.sample(&state.geo) {
                Ok(sample) => handle_sample(&app, &state, sample),
                Err(error) => {
                    let mut runtime = state.runtime.lock();
                    runtime.snapshot.status.last_error = Some(error.clone());
                    let _ = app.emit("collector_status_changed", &runtime.snapshot.status);
                }
            }
            thread::sleep(Duration::from_secs(1));
        }
    });
}

fn handle_sample(app: &AppHandle, state: &AppState, sample: CollectorSample) {
    let sample_timestamp = sample.timestamp;
    let _ = state.db.insert_sample(&sample);
    let (today_start, today_end) = today_range();
    let (month_start, month_end) = month_range();
    let overseas_delta = sample
        .overseas_download_delta
        .saturating_add(sample.overseas_upload_delta);
    let should_refresh_db_views = {
        let mut runtime = state.runtime.lock();
        runtime.today_totals.0 = runtime.today_totals.0.saturating_add(sample.download_delta);
        runtime.today_totals.1 = runtime.today_totals.1.saturating_add(sample.upload_delta);
        runtime.today_totals.2 = runtime.today_totals.2.saturating_add(overseas_delta);
        runtime.month_totals.0 = runtime.month_totals.0.saturating_add(sample.download_delta);
        runtime.month_totals.1 = runtime.month_totals.1.saturating_add(sample.upload_delta);
        runtime.month_totals.2 = runtime.month_totals.2.saturating_add(overseas_delta);
        runtime.last_db_view_refresh == 0
            || sample_timestamp.saturating_sub(runtime.last_db_view_refresh) >= 5_000
    };

    let (today, month, usage_points, mut recent_alerts) = if should_refresh_db_views {
        let today = state.db.totals(today_start, today_end).unwrap_or((0, 0, 0));
        let month = state.db.totals(month_start, month_end).unwrap_or((0, 0, 0));
        let usage_points = state
            .db
            .usage_points(today_start, today_end)
            .unwrap_or_default();
        let recent_alerts = state.db.alerts(today_start, today_end).unwrap_or_default();
        (today, month, usage_points, recent_alerts)
    } else {
        let runtime = state.runtime.lock();
        (
            runtime.today_totals,
            runtime.month_totals,
            runtime.usage_points.clone(),
            runtime.recent_alerts.clone(),
        )
    };

    let alerts = evaluate_alerts(state, &sample, today, month);
    if should_refresh_db_views || !alerts.is_empty() {
        recent_alerts = state.db.alerts(today_start, today_end).unwrap_or_default();
    }

    let mut status = {
        let runtime = state.runtime.lock();
        runtime.snapshot.status.clone()
    };
    status.adapter_count = sample.adapter_count;
    status.last_error = None;

    let total_today = today.0.saturating_add(today.1);
    let overseas_ratio = if total_today == 0 {
        0.0
    } else {
        today.2 as f64 / total_today as f64
    };

    let snapshot = TrafficSnapshot {
        timestamp: sample_timestamp,
        download_bps: sample.download_bps,
        upload_bps: sample.upload_bps,
        today_download_bytes: today.0,
        today_upload_bytes: today.1,
        month_download_bytes: month.0,
        month_upload_bytes: month.1,
        overseas_today_bytes: today.2,
        overseas_month_bytes: month.2,
        overseas_ratio,
        adapter_count: sample.adapter_count,
        status,
        top_apps: sample.apps.iter().take(8).cloned().collect(),
        top_overseas: sample.top_overseas.clone(),
        recent_alerts: recent_alerts.clone(),
        sample_points: usage_points.clone(),
    };

    {
        let mut runtime = state.runtime.lock();
        runtime.snapshot = snapshot.clone();
        runtime.connections = sample.connections;
        runtime.apps = sample.apps;
        runtime.today_totals = today;
        runtime.month_totals = month;
        runtime.usage_points = usage_points;
        runtime.recent_alerts = snapshot.recent_alerts.clone();
        if should_refresh_db_views {
            runtime.last_db_view_refresh = sample_timestamp;
        }
    }

    let _ = app.emit("traffic_tick", &snapshot);
    for alert in alerts {
        let _ = app.emit("alert_raised", &alert);
    }
}

fn evaluate_alerts(
    state: &AppState,
    sample: &CollectorSample,
    today: (u64, u64, u64),
    month: (u64, u64, u64),
) -> Vec<AlertEvent> {
    let settings = state.settings.lock().clone();
    let mut emitted = Vec::new();
    let mut runtime = state.runtime.lock();

    for app in &sample.apps {
        if runtime.seen_apps.insert(app.app_key.clone()) {
            let alert = AlertEvent {
                id: 0,
                timestamp: sample.timestamp,
                severity: "info".to_string(),
                title: "新应用联网".to_string(),
                message: format!("首次观察到 {} 建立网络连接。", app.app_name),
                object_type: "app".to_string(),
                object_value: app.app_name.clone(),
                acknowledged: false,
            };
            if let Ok(saved) = state.db.insert_alert(&alert) {
                emitted.push(saved);
            }
        }
    }

    if let Some(limit) = settings.daily_quota_bytes {
        let used = today.0.saturating_add(today.1);
        push_threshold_alert(
            &mut runtime.raised_alerts,
            &mut emitted,
            state,
            sample.timestamp,
            "daily_quota",
            used,
            limit,
            "今日流量接近阈值",
            "day",
        );
    }

    if let Some(limit) = settings.monthly_quota_bytes {
        let used = month.0.saturating_add(month.1);
        push_threshold_alert(
            &mut runtime.raised_alerts,
            &mut emitted,
            state,
            sample.timestamp,
            "monthly_quota",
            used,
            limit,
            "本月流量接近阈值",
            "month",
        );
    }

    if let Some(limit) = settings.overseas_quota_bytes {
        push_threshold_alert(
            &mut runtime.raised_alerts,
            &mut emitted,
            state,
            sample.timestamp,
            "overseas_quota",
            today.2,
            limit,
            "中国大陆外流量接近阈值",
            "outside_mainland",
        );
    }

    emitted
}

#[allow(clippy::too_many_arguments)]
fn push_threshold_alert(
    raised: &mut HashSet<String>,
    emitted: &mut Vec<AlertEvent>,
    state: &AppState,
    timestamp: i64,
    key: &str,
    used: u64,
    limit: u64,
    title: &str,
    object_value: &str,
) {
    if limit == 0 {
        return;
    }
    let ratio = used as f64 / limit as f64;
    if ratio < 0.8 || raised.contains(key) {
        return;
    }
    raised.insert(key.to_string());
    let severity = if ratio >= 0.95 { "warning" } else { "notice" };
    let alert = AlertEvent {
        id: 0,
        timestamp,
        severity: severity.to_string(),
        title: title.to_string(),
        message: format!("已使用阈值的 {:.0}%。", ratio * 100.0),
        object_type: "quota".to_string(),
        object_value: object_value.to_string(),
        acknowledged: false,
    };
    if let Ok(saved) = state.db.insert_alert(&alert) {
        emitted.push(saved);
    }
}
