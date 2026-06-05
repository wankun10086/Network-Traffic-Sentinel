use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum GeoClass {
    MainlandChina,
    HongKongMacauTaiwan,
    Overseas,
    Private,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttributionConfidence {
    Exact,
    Estimated,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteEndpoint {
    pub remote_ip: String,
    pub remote_port: Option<u16>,
    pub host: Option<String>,
    pub country_code: Option<String>,
    pub region_name: String,
    pub geo_class: GeoClass,
    pub bytes_down: u64,
    pub bytes_up: u64,
    pub confidence: AttributionConfidence,
    pub app_name: Option<String>,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub id: String,
    pub protocol: String,
    pub local_addr: String,
    pub local_port: u16,
    pub remote_ip: String,
    pub remote_port: Option<u16>,
    pub pid: u32,
    pub app_key: String,
    pub process_name: String,
    pub app_name: String,
    pub state: String,
    pub direction: String,
    pub endpoint: RemoteEndpoint,
    pub confidence: AttributionConfidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUsage {
    pub app_key: String,
    pub app_name: String,
    pub process_name: String,
    pub pid: Option<u32>,
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub overseas_bytes: u64,
    pub current_download_bps: f64,
    pub current_upload_bps: f64,
    pub connection_count: u32,
    pub overseas_connection_count: u32,
    pub confidence: AttributionConfidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageAggregate {
    pub label: String,
    pub bucket_start: i64,
    pub bucket_end: i64,
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub overseas_bytes: u64,
    pub group_key: String,
    pub group_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertEvent {
    pub id: i64,
    pub timestamp: i64,
    pub severity: String,
    pub title: String,
    pub message: String,
    pub object_type: String,
    pub object_value: String,
    pub acknowledged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub id: Option<i64>,
    pub rule_type: String,
    pub enabled: bool,
    pub severity: String,
    pub threshold_bytes: Option<u64>,
    pub threshold_ratio: Option<f64>,
    pub window: String,
    pub target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectorStatus {
    pub running: bool,
    pub permission_level: String,
    pub adapter_count: usize,
    pub last_error: Option<String>,
    pub geo_db_loaded: bool,
    pub geo_db_label: String,
    pub started_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficSnapshot {
    pub timestamp: i64,
    pub download_bps: f64,
    pub upload_bps: f64,
    pub today_download_bytes: u64,
    pub today_upload_bytes: u64,
    pub month_download_bytes: u64,
    pub month_upload_bytes: u64,
    pub overseas_today_bytes: u64,
    pub overseas_month_bytes: u64,
    pub overseas_ratio: f64,
    pub adapter_count: usize,
    pub status: CollectorStatus,
    pub top_apps: Vec<AppUsage>,
    pub top_overseas: Vec<RemoteEndpoint>,
    pub recent_alerts: Vec<AlertEvent>,
    pub sample_points: Vec<UsageAggregate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageRange {
    pub preset: Option<String>,
    pub start: Option<i64>,
    pub end: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub autostart: bool,
    pub widget_visible: bool,
    pub widget_size: String,
    pub widget_opacity: f64,
    pub include_virtual_adapters: bool,
    pub monthly_quota_bytes: Option<u64>,
    pub daily_quota_bytes: Option<u64>,
    pub overseas_quota_bytes: Option<u64>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            autostart: false,
            widget_visible: true,
            widget_size: "medium".to_string(),
            widget_opacity: 0.92,
            include_virtual_adapters: false,
            monthly_quota_bytes: Some(300 * 1024 * 1024 * 1024),
            daily_quota_bytes: Some(15 * 1024 * 1024 * 1024),
            overseas_quota_bytes: Some(30 * 1024 * 1024 * 1024),
        }
    }
}

impl TrafficSnapshot {
    pub fn empty(status: CollectorStatus) -> Self {
        Self {
            timestamp: status.started_at,
            download_bps: 0.0,
            upload_bps: 0.0,
            today_download_bytes: 0,
            today_upload_bytes: 0,
            month_download_bytes: 0,
            month_upload_bytes: 0,
            overseas_today_bytes: 0,
            overseas_month_bytes: 0,
            overseas_ratio: 0.0,
            adapter_count: 0,
            status,
            top_apps: Vec::new(),
            top_overseas: Vec::new(),
            recent_alerts: Vec::new(),
            sample_points: Vec::new(),
        }
    }
}
