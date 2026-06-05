import type {
  AlertEvent,
  AppSettings,
  AppUsage,
  ConnectionInfo,
  TrafficSnapshot,
  UsageAggregate
} from "../types";

const now = Date.now();

export const mockAlerts: AlertEvent[] = [
  {
    id: 1,
    timestamp: now - 240000,
    severity: "notice",
    title: "境外流量上升",
    message: "Code.exe 在最近 5 分钟内连接了多个境外地址。",
    object_type: "app",
    object_value: "Code.exe",
    acknowledged: false
  },
  {
    id: 2,
    timestamp: now - 900000,
    severity: "info",
    title: "新应用联网",
    message: "首次观察到 node.exe 建立外部连接。",
    object_type: "process",
    object_value: "node.exe",
    acknowledged: false
  }
];

export const mockApps: AppUsage[] = [
  {
    app_key: "chrome",
    app_name: "Chrome",
    process_name: "chrome.exe",
    pid: 4484,
    download_bytes: 4294967296,
    upload_bytes: 828375040,
    overseas_bytes: 1739461754,
    current_download_bps: 812500,
    current_upload_bps: 42000,
    connection_count: 18,
    overseas_connection_count: 5,
    confidence: "estimated"
  },
  {
    app_key: "visual studio code",
    app_name: "Visual Studio Code",
    process_name: "Code.exe",
    pid: 6932,
    download_bytes: 1585446912,
    upload_bytes: 247463936,
    overseas_bytes: 1099511627,
    current_download_bps: 352000,
    current_upload_bps: 61000,
    connection_count: 8,
    overseas_connection_count: 4,
    confidence: "estimated"
  },
  {
    app_key: "wechat",
    app_name: "WeChat",
    process_name: "WeChat.exe",
    pid: 5332,
    download_bytes: 742391808,
    upload_bytes: 296956723,
    overseas_bytes: 0,
    current_download_bps: 87000,
    current_upload_bps: 18000,
    connection_count: 5,
    overseas_connection_count: 0,
    confidence: "estimated"
  },
  {
    app_key: "onedrive",
    app_name: "OneDrive",
    process_name: "OneDrive.exe",
    pid: 7364,
    download_bytes: 612368384,
    upload_bytes: 934281216,
    overseas_bytes: 418381824,
    current_download_bps: 96000,
    current_upload_bps: 126000,
    connection_count: 6,
    overseas_connection_count: 2,
    confidence: "estimated"
  }
];

export const mockConnections: ConnectionInfo[] = [
  {
    id: "tcp-4484-142.250.72.142-443",
    protocol: "TCP",
    local_addr: "192.168.1.10",
    local_port: 53121,
    remote_ip: "142.250.72.142",
    remote_port: 443,
    pid: 4484,
    app_key: "chrome",
    process_name: "chrome.exe",
    app_name: "Chrome",
    state: "Established",
    direction: "outbound",
    confidence: "estimated",
    endpoint: {
      remote_ip: "142.250.72.142",
      remote_port: 443,
      country_code: "US",
      region_name: "美国",
      geo_class: "overseas",
      bytes_down: 481000,
      bytes_up: 26000,
      confidence: "estimated",
      app_name: "Chrome",
      pid: 4484
    }
  },
  {
    id: "tcp-6932-20.205.243.166-443",
    protocol: "TCP",
    local_addr: "192.168.1.10",
    local_port: 53125,
    remote_ip: "20.205.243.166",
    remote_port: 443,
    pid: 6932,
    app_key: "visual studio code",
    process_name: "Code.exe",
    app_name: "Visual Studio Code",
    state: "Established",
    direction: "outbound",
    confidence: "estimated",
    endpoint: {
      remote_ip: "20.205.243.166",
      remote_port: 443,
      country_code: "SG",
      region_name: "新加坡",
      geo_class: "overseas",
      bytes_down: 300000,
      bytes_up: 42000,
      confidence: "estimated",
      app_name: "Visual Studio Code",
      pid: 6932
    }
  },
  {
    id: "udp-5332-119.147.10.22-8000",
    protocol: "UDP",
    local_addr: "192.168.1.10",
    local_port: 60213,
    remote_ip: "119.147.10.22",
    remote_port: 8000,
    pid: 5332,
    app_key: "wechat",
    process_name: "WeChat.exe",
    app_name: "WeChat",
    state: "Active",
    direction: "outbound",
    confidence: "estimated",
    endpoint: {
      remote_ip: "119.147.10.22",
      remote_port: 8000,
      country_code: "CN",
      region_name: "中国大陆",
      geo_class: "mainland_china",
      bytes_down: 87000,
      bytes_up: 18000,
      confidence: "estimated",
      app_name: "WeChat",
      pid: 5332
    }
  },
  {
    id: "tcp-7364-13.107.42.12-443",
    protocol: "TCP",
    local_addr: "192.168.1.10",
    local_port: 53144,
    remote_ip: "13.107.42.12",
    remote_port: 443,
    pid: 7364,
    app_key: "onedrive",
    process_name: "OneDrive.exe",
    app_name: "OneDrive",
    state: "Established",
    direction: "outbound",
    confidence: "estimated",
    endpoint: {
      remote_ip: "13.107.42.12",
      remote_port: 443,
      country_code: "US",
      region_name: "美国",
      geo_class: "overseas",
      bytes_down: 96000,
      bytes_up: 126000,
      confidence: "estimated",
      app_name: "OneDrive",
      pid: 7364
    }
  },
  {
    id: "tcp-4484-10.0.0.8-9100",
    protocol: "TCP",
    local_addr: "192.168.1.10",
    local_port: 53201,
    remote_ip: "10.0.0.8",
    remote_port: 9100,
    pid: 4484,
    app_key: "chrome",
    process_name: "chrome.exe",
    app_name: "Chrome",
    state: "Established",
    direction: "outbound",
    confidence: "estimated",
    endpoint: {
      remote_ip: "10.0.0.8",
      remote_port: 9100,
      region_name: "内网",
      geo_class: "private",
      bytes_down: 12000,
      bytes_up: 8000,
      confidence: "estimated",
      app_name: "Chrome",
      pid: 4484
    }
  },
  {
    id: "udp-0-203.0.113.44-5353",
    protocol: "UDP",
    local_addr: "0.0.0.0",
    local_port: 5353,
    remote_ip: "203.0.113.44",
    remote_port: 5353,
    pid: 0,
    app_key: "system",
    process_name: "System",
    app_name: "System",
    state: "Listening",
    direction: "unknown",
    confidence: "unknown",
    endpoint: {
      remote_ip: "203.0.113.44",
      remote_port: 5353,
      region_name: "未知归属",
      geo_class: "unknown",
      bytes_down: 0,
      bytes_up: 0,
      confidence: "unknown",
      app_name: "System",
      pid: 0
    }
  }
];

export const mockUsage: UsageAggregate[] = Array.from({ length: 24 }, (_, index) => ({
  label: `${String(index).padStart(2, "0")}:00`,
  bucket_start: now - (24 - index) * 3600000,
  bucket_end: now - (23 - index) * 3600000,
  download_bytes: (index + 2) * 120000000,
  upload_bytes: (index + 1) * 26000000,
  overseas_bytes: index % 3 === 0 ? (index + 1) * 34000000 : (index + 1) * 12000000,
  group_key: `hour-${index}`,
  group_name: `${String(index).padStart(2, "0")}:00`
}));

export const mockSettings: AppSettings = {
  theme: "system",
  autostart: false,
  widget_visible: true,
  widget_size: "medium",
  widget_opacity: 0.92,
  include_virtual_adapters: false,
  monthly_quota_bytes: 300 * 1024 * 1024 * 1024,
  daily_quota_bytes: 15 * 1024 * 1024 * 1024,
  overseas_quota_bytes: 30 * 1024 * 1024 * 1024
};

export function mockSnapshot(): TrafficSnapshot {
  const wave = Math.sin(Date.now() / 5000);
  return {
    timestamp: Date.now(),
    download_bps: 760000 + wave * 220000,
    upload_bps: 84000 + Math.max(0, wave) * 40000,
    today_download_bytes: 8246337208,
    today_upload_bytes: 1288490188,
    month_download_bytes: 126701535232,
    month_upload_bytes: 20401094656,
    overseas_today_bytes: 2791728742,
    overseas_month_bytes: 39728447488,
    overseas_ratio: 0.29,
    adapter_count: 1,
    status: {
      running: false,
      permission_level: "standard",
      adapter_count: 1,
      geo_db_loaded: false,
      geo_db_label: "浏览器预览 mock 数据",
      started_at: Date.now() - 3600000
    },
    top_apps: mockApps,
    top_overseas: mockConnections.filter((item) => item.endpoint.geo_class === "overseas").map((item) => item.endpoint),
    recent_alerts: mockAlerts,
    sample_points: mockUsage
  };
}
