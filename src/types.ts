export type GeoClass =
  | "mainland_china"
  | "hong_kong_macau_taiwan"
  | "overseas"
  | "private"
  | "unknown";

export type AttributionConfidence = "exact" | "estimated" | "unknown";

export interface RemoteEndpoint {
  remote_ip: string;
  remote_port?: number | null;
  host?: string | null;
  country_code?: string | null;
  region_name: string;
  geo_class: GeoClass;
  bytes_down: number;
  bytes_up: number;
  confidence: AttributionConfidence;
  app_name?: string | null;
  pid?: number | null;
}

export interface ConnectionInfo {
  id: string;
  protocol: "TCP" | "UDP";
  local_addr: string;
  local_port: number;
  remote_ip: string;
  remote_port?: number | null;
  pid: number;
  app_key: string;
  process_name: string;
  app_name: string;
  state: string;
  direction: "outbound" | "inbound" | "listening" | "unknown";
  endpoint: RemoteEndpoint;
  confidence: AttributionConfidence;
}

export interface AppUsage {
  app_key: string;
  app_name: string;
  process_name: string;
  pid?: number | null;
  download_bytes: number;
  upload_bytes: number;
  overseas_bytes: number;
  current_download_bps: number;
  current_upload_bps: number;
  connection_count: number;
  overseas_connection_count: number;
  confidence: AttributionConfidence;
}

export interface UsageAggregate {
  label: string;
  bucket_start: number;
  bucket_end: number;
  download_bytes: number;
  upload_bytes: number;
  overseas_bytes: number;
  group_key: string;
  group_name: string;
}

export interface AlertEvent {
  id: number;
  timestamp: number;
  severity: "info" | "notice" | "warning" | "critical";
  title: string;
  message: string;
  object_type: string;
  object_value: string;
  acknowledged: boolean;
}

export interface AlertRule {
  id?: number | null;
  rule_type: string;
  enabled: boolean;
  severity: "info" | "notice" | "warning" | "critical";
  threshold_bytes?: number | null;
  threshold_ratio?: number | null;
  window: "day" | "month" | "realtime";
  target?: string | null;
}

export interface CollectorStatus {
  running: boolean;
  permission_level: "standard" | "elevated" | "unknown";
  adapter_count: number;
  last_error?: string | null;
  geo_db_loaded: boolean;
  geo_db_label: string;
  started_at: number;
}

export interface TrafficSnapshot {
  timestamp: number;
  download_bps: number;
  upload_bps: number;
  today_download_bytes: number;
  today_upload_bytes: number;
  month_download_bytes: number;
  month_upload_bytes: number;
  overseas_today_bytes: number;
  overseas_month_bytes: number;
  overseas_ratio: number;
  adapter_count: number;
  status: CollectorStatus;
  top_apps: AppUsage[];
  top_overseas: RemoteEndpoint[];
  recent_alerts: AlertEvent[];
  sample_points: UsageAggregate[];
}

export interface UsageRange {
  preset?: "today" | "week" | "month" | "custom";
  start?: number | null;
  end?: number | null;
}

export interface AppSettings {
  theme: "system" | "light" | "dark";
  autostart: boolean;
  widget_visible: boolean;
  widget_size: "small" | "medium" | "large";
  widget_opacity: number;
  include_virtual_adapters: boolean;
  monthly_quota_bytes?: number | null;
  daily_quota_bytes?: number | null;
  overseas_quota_bytes?: number | null;
}
