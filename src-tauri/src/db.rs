use crate::{
    collector::CollectorSample,
    models::{AlertEvent, AlertRule, AppSettings, AppUsage, AttributionConfidence, UsageAggregate},
};
use chrono::{Datelike, Local, TimeZone, Timelike, Utc};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::{fs, path::Path};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let conn = Connection::open(path).map_err(|err| err.to_string())?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.initialize()?;
        Ok(db)
    }

    fn initialize(&self) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER NOT NULL,
                download_bytes INTEGER NOT NULL,
                upload_bytes INTEGER NOT NULL,
                overseas_download_bytes INTEGER NOT NULL,
                overseas_upload_bytes INTEGER NOT NULL,
                adapter_count INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts);

            CREATE TABLE IF NOT EXISTS app_usage_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER NOT NULL,
                app_key TEXT NOT NULL,
                app_name TEXT NOT NULL,
                process_name TEXT NOT NULL,
                pid INTEGER,
                download_bytes INTEGER NOT NULL,
                upload_bytes INTEGER NOT NULL,
                overseas_bytes INTEGER NOT NULL,
                connection_count INTEGER NOT NULL,
                overseas_connection_count INTEGER NOT NULL,
                confidence TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_app_usage_ts ON app_usage_samples(ts);
            CREATE INDEX IF NOT EXISTS idx_app_usage_key ON app_usage_samples(app_key);

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                object_type TEXT NOT NULL,
                object_value TEXT NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);

            CREATE TABLE IF NOT EXISTS alert_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_type TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                severity TEXT NOT NULL,
                threshold_bytes INTEGER,
                threshold_ratio REAL,
                window TEXT NOT NULL,
                target TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn insert_sample(&self, sample: &CollectorSample) -> Result<(), String> {
        let conn = self.conn.lock();
        let tx = conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        tx.execute(
            "INSERT INTO samples (ts, download_bytes, upload_bytes, overseas_download_bytes, overseas_upload_bytes, adapter_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                sample.timestamp,
                sample.download_delta as i64,
                sample.upload_delta as i64,
                sample.overseas_download_delta as i64,
                sample.overseas_upload_delta as i64,
                sample.adapter_count as i64
            ],
        )
        .map_err(|err| err.to_string())?;

        for app in &sample.apps {
            tx.execute(
                "INSERT INTO app_usage_samples
                 (ts, app_key, app_name, process_name, pid, download_bytes, upload_bytes, overseas_bytes, connection_count, overseas_connection_count, confidence)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    sample.timestamp,
                    app.app_key,
                    app.app_name,
                    app.process_name,
                    app.pid.map(|pid| pid as i64),
                    app.download_bytes as i64,
                    app.upload_bytes as i64,
                    app.overseas_bytes as i64,
                    app.connection_count as i64,
                    app.overseas_connection_count as i64,
                    confidence_label(&app.confidence)
                ],
            )
            .map_err(|err| err.to_string())?;
        }

        tx.commit().map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn apply_retention(&self) -> Result<(), String> {
        let cutoff = Utc::now().timestamp_millis() - 72 * 60 * 60 * 1000;
        let conn = self.conn.lock();
        conn.execute("DELETE FROM samples WHERE ts < ?1", params![cutoff])
            .map_err(|err| err.to_string())?;
        conn.execute(
            "DELETE FROM app_usage_samples WHERE ts < ?1",
            params![cutoff],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn totals(&self, start: i64, end: i64) -> Result<(u64, u64, u64), String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT
                COALESCE(SUM(download_bytes), 0),
                COALESCE(SUM(upload_bytes), 0),
                COALESCE(SUM(overseas_download_bytes + overseas_upload_bytes), 0)
             FROM samples WHERE ts >= ?1 AND ts <= ?2",
            params![start, end],
            |row| {
                Ok((
                    row.get::<_, i64>(0)? as u64,
                    row.get::<_, i64>(1)? as u64,
                    row.get::<_, i64>(2)? as u64,
                ))
            },
        )
        .map_err(|err| err.to_string())
    }

    pub fn usage_points(&self, start: i64, end: i64) -> Result<Vec<UsageAggregate>, String> {
        let duration = (end - start).max(1);
        let bucket_ms = if duration <= 2 * 24 * 60 * 60 * 1000 {
            60 * 60 * 1000
        } else if duration <= 45 * 24 * 60 * 60 * 1000 {
            24 * 60 * 60 * 1000
        } else {
            30 * 24 * 60 * 60 * 1000
        };

        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT
                    (ts / ?1) * ?1 AS bucket,
                    COALESCE(SUM(download_bytes), 0),
                    COALESCE(SUM(upload_bytes), 0),
                    COALESCE(SUM(overseas_download_bytes + overseas_upload_bytes), 0)
                 FROM samples
                 WHERE ts >= ?2 AND ts <= ?3
                 GROUP BY bucket
                 ORDER BY bucket",
            )
            .map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map(params![bucket_ms, start, end], |row| {
                let bucket = row.get::<_, i64>(0)?;
                Ok(UsageAggregate {
                    label: label_for_bucket(bucket, bucket_ms),
                    bucket_start: bucket,
                    bucket_end: bucket + bucket_ms,
                    download_bytes: row.get::<_, i64>(1)? as u64,
                    upload_bytes: row.get::<_, i64>(2)? as u64,
                    overseas_bytes: row.get::<_, i64>(3)? as u64,
                    group_key: bucket.to_string(),
                    group_name: label_for_bucket(bucket, bucket_ms),
                })
            })
            .map_err(|err| err.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn app_usage(&self, start: i64, end: i64) -> Result<Vec<AppUsage>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT
                    app_key,
                    MAX(app_name),
                    MAX(process_name),
                    MAX(pid),
                    COALESCE(SUM(download_bytes), 0),
                    COALESCE(SUM(upload_bytes), 0),
                    COALESCE(SUM(overseas_bytes), 0),
                    COALESCE(MAX(connection_count), 0),
                    COALESCE(MAX(overseas_connection_count), 0)
                 FROM app_usage_samples
                 WHERE ts >= ?1 AND ts <= ?2
                 GROUP BY app_key
                 ORDER BY SUM(download_bytes + upload_bytes) DESC
                 LIMIT 100",
            )
            .map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map(params![start, end], |row| {
                Ok(AppUsage {
                    app_key: row.get(0)?,
                    app_name: row.get(1)?,
                    process_name: row.get(2)?,
                    pid: row.get::<_, Option<i64>>(3)?.map(|pid| pid as u32),
                    download_bytes: row.get::<_, i64>(4)? as u64,
                    upload_bytes: row.get::<_, i64>(5)? as u64,
                    overseas_bytes: row.get::<_, i64>(6)? as u64,
                    current_download_bps: 0.0,
                    current_upload_bps: 0.0,
                    connection_count: row.get::<_, i64>(7)? as u32,
                    overseas_connection_count: row.get::<_, i64>(8)? as u32,
                    confidence: AttributionConfidence::Estimated,
                })
            })
            .map_err(|err| err.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn insert_alert(&self, alert: &AlertEvent) -> Result<AlertEvent, String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO alerts (ts, severity, title, message, object_type, object_value, acknowledged)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                alert.timestamp,
                alert.severity,
                alert.title,
                alert.message,
                alert.object_type,
                alert.object_value,
                if alert.acknowledged { 1 } else { 0 }
            ],
        )
        .map_err(|err| err.to_string())?;
        let mut saved = alert.clone();
        saved.id = conn.last_insert_rowid();
        Ok(saved)
    }

    pub fn alerts(&self, start: i64, end: i64) -> Result<Vec<AlertEvent>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT id, ts, severity, title, message, object_type, object_value, acknowledged
                 FROM alerts
                 WHERE ts >= ?1 AND ts <= ?2
                 ORDER BY ts DESC
                 LIMIT 200",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![start, end], |row| {
                Ok(AlertEvent {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    severity: row.get(2)?,
                    title: row.get(3)?,
                    message: row.get(4)?,
                    object_type: row.get(5)?,
                    object_value: row.get(6)?,
                    acknowledged: row.get::<_, i64>(7)? != 0,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn set_alert_rule(&self, rule: AlertRule) -> Result<AlertRule, String> {
        let conn = self.conn.lock();
        if let Some(id) = rule.id {
            conn.execute(
                "UPDATE alert_rules
                 SET rule_type = ?1, enabled = ?2, severity = ?3, threshold_bytes = ?4, threshold_ratio = ?5, window = ?6, target = ?7
                 WHERE id = ?8",
                params![
                    rule.rule_type,
                    if rule.enabled { 1 } else { 0 },
                    rule.severity,
                    rule.threshold_bytes.map(|value| value as i64),
                    rule.threshold_ratio,
                    rule.window,
                    rule.target,
                    id
                ],
            )
            .map_err(|err| err.to_string())?;
            Ok(rule)
        } else {
            conn.execute(
                "INSERT INTO alert_rules (rule_type, enabled, severity, threshold_bytes, threshold_ratio, window, target)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    rule.rule_type,
                    if rule.enabled { 1 } else { 0 },
                    rule.severity,
                    rule.threshold_bytes.map(|value| value as i64),
                    rule.threshold_ratio,
                    rule.window,
                    rule.target,
                ],
            )
            .map_err(|err| err.to_string())?;
            let mut saved = rule;
            saved.id = Some(conn.last_insert_rowid());
            Ok(saved)
        }
    }

    pub fn load_settings(&self) -> Result<AppSettings, String> {
        let conn = self.conn.lock();
        let value: Option<String> = conn
            .query_row("SELECT value FROM settings WHERE key = 'app'", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|err| err.to_string())?;
        match value {
            Some(value) => serde_json::from_str(&value).map_err(|err| err.to_string()),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
        let conn = self.conn.lock();
        let value = serde_json::to_string(settings).map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('app', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![value],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn clear_history(&self, scope: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        match scope {
            "samples" => {
                conn.execute("DELETE FROM samples", [])
                    .map_err(|err| err.to_string())?;
                conn.execute("DELETE FROM app_usage_samples", [])
                    .map_err(|err| err.to_string())?;
            }
            "alerts" => {
                conn.execute("DELETE FROM alerts", [])
                    .map_err(|err| err.to_string())?;
            }
            "all" => {
                conn.execute("DELETE FROM samples", [])
                    .map_err(|err| err.to_string())?;
                conn.execute("DELETE FROM app_usage_samples", [])
                    .map_err(|err| err.to_string())?;
                conn.execute("DELETE FROM alerts", [])
                    .map_err(|err| err.to_string())?;
                conn.execute("DELETE FROM alert_rules", [])
                    .map_err(|err| err.to_string())?;
            }
            _ => {}
        }
        Ok(())
    }
}

pub fn resolve_range(range: &crate::models::UsageRange) -> (i64, i64) {
    let now = Local::now();
    let end = range.end.unwrap_or_else(|| now.timestamp_millis());
    let start = match range.preset.as_deref() {
        Some("week") => now
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .and_then(|time| Local.from_local_datetime(&time).single())
            .map(|start| start.timestamp_millis() - 6 * 24 * 60 * 60 * 1000)
            .unwrap_or(end - 7 * 24 * 60 * 60 * 1000),
        Some("month") => Local
            .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
            .single()
            .map(|start| start.timestamp_millis())
            .unwrap_or(end - 30 * 24 * 60 * 60 * 1000),
        Some("custom") => range.start.unwrap_or(end - 24 * 60 * 60 * 1000),
        _ => now
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .and_then(|time| Local.from_local_datetime(&time).single())
            .map(|start| start.timestamp_millis())
            .unwrap_or(end - 24 * 60 * 60 * 1000),
    };
    (start, end)
}

pub fn month_range() -> (i64, i64) {
    let now = Local::now();
    let start = Local
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .map(|time| time.timestamp_millis())
        .unwrap_or_else(|| now.timestamp_millis() - 30 * 24 * 60 * 60 * 1000);
    (start, now.timestamp_millis())
}

pub fn today_range() -> (i64, i64) {
    let now = Local::now();
    let start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|time| Local.from_local_datetime(&time).single())
        .map(|time| time.timestamp_millis())
        .unwrap_or_else(|| now.timestamp_millis() - 24 * 60 * 60 * 1000);
    (start, now.timestamp_millis())
}

fn label_for_bucket(timestamp: i64, bucket_ms: i64) -> String {
    let date = Local
        .timestamp_millis_opt(timestamp)
        .single()
        .unwrap_or_else(Local::now);
    if bucket_ms <= 60 * 60 * 1000 {
        format!("{:02}:00", date.hour())
    } else {
        format!("{:02}-{:02}", date.month(), date.day())
    }
}

fn confidence_label(confidence: &AttributionConfidence) -> &'static str {
    match confidence {
        AttributionConfidence::Exact => "exact",
        AttributionConfidence::Estimated => "estimated",
        AttributionConfidence::Unknown => "unknown",
    }
}
