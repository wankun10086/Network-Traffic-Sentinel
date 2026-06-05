import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  ChevronsDown,
  ChevronsUp,
  CircleDot,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Gauge,
  Globe2,
  HardDrive,
  LayoutDashboard,
  ListFilter,
  Monitor,
  Network,
  Pin,
  Radar,
  RefreshCw,
  Router,
  Search,
  ServerCog,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SignalHigh,
  SlidersHorizontal,
  Waypoints,
  Wifi,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  clearHistory,
  getCurrentSnapshot,
  getUsageSummary,
  listAlerts,
  listAppUsage,
  listConnections,
  openAppMonitor,
  setWidgetSize,
  setAlertRule,
  updateSettings
} from "./lib/api";
import { formatBps, formatBytes, formatPercent, geoClassLabel, shortTime } from "./lib/format";
import type {
  AlertEvent,
  AppSettings,
  AppUsage,
  AttributionConfidence,
  ConnectionInfo,
  GeoClass,
  RemoteEndpoint,
  TrafficSnapshot,
  UsageAggregate,
  UsageRange
} from "./types";

type TabId = "overview" | "apps" | "realtime" | "stats" | "overseas" | "control";
type TrafficDataMode = "main" | "widget" | "app";
type TrafficChartVariant = "realtime" | "usage";

interface LiveTrafficSample {
  timestamp: number;
  downloadBps: number;
  uploadBps: number;
}

interface TrendPoint {
  id: string;
  timestamp: number;
  label: string;
  download: number;
  upload: number;
  overseas: number;
}

const CONNECTION_RENDER_LIMIT = 420;
const LIVE_TREND_LIMIT = 36;
const HISTORY_TREND_LIMIT = 32;
const CHART_FRAME = { left: 8, right: 4, top: 8, bottom: 16 };

const navItems: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "apps", label: "应用", icon: AppWindow },
  { id: "realtime", label: "连接", icon: Activity },
  { id: "stats", label: "历史", icon: BarChart3 },
  { id: "overseas", label: "地理/境外", icon: Globe2 },
  { id: "control", label: "规则/设置", icon: Settings }
];

const tabCopy: Record<TabId, { title: string; subtitle: string }> = {
  overview: { title: "实时态势总览", subtitle: "总流量、重点应用、境外目的地和最近告警汇总" },
  apps: { title: "应用监控矩阵", subtitle: "按应用查看实时速率、累计用量、连接数和境外占比" },
  realtime: { title: "实时连接流", subtitle: "当前 TCP/UDP 会话、PID、远端地址、端口、归属和置信度" },
  stats: { title: "历史统计", subtitle: "按日、周、月观察流量账本和长期趋势" },
  overseas: { title: "中国大陆外流量", subtitle: "聚焦非中国大陆公网 IP、未知归属和涉及应用" },
  control: { title: "规则与设置", subtitle: "低打扰提醒、悬浮窗、主题、保留策略和采集偏好" }
};

const defaultSettings: AppSettings = {
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

function useTrafficData(mode: TrafficDataMode) {
  const [snapshot, setSnapshot] = useState<TrafficSnapshot | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [apps, setApps] = useState<AppUsage[]>([]);
  const [usage, setUsage] = useState<UsageAggregate[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastHeavyRefresh = useRef(0);
  const hasHeavyData = useRef(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async (forceHeavy = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const range: UsageRange = { preset: "today" };
    const now = Date.now();
    const heavyInterval = mode === "app" ? 8000 : 6000;
    const shouldRefreshHeavy = forceHeavy || now - lastHeavyRefresh.current > heavyInterval;
    const shouldLoadConnections = mode !== "widget";
    const connectionLimit = mode === "app" ? 300 : 600;

    try {
      const [nextSnapshot, nextConnections] = await Promise.all([
        getCurrentSnapshot(),
        shouldLoadConnections ? listConnections("", connectionLimit) : Promise.resolve([])
      ]);
      setSnapshot(nextSnapshot);
      setConnections(nextConnections);

      if (mode === "widget") {
        setApps(nextSnapshot.top_apps);
        setUsage(nextSnapshot.sample_points);
        setAlerts(nextSnapshot.recent_alerts);
        hasHeavyData.current = true;
        setError(null);
        return;
      }

      if (shouldRefreshHeavy) {
        lastHeavyRefresh.current = now;
        const [nextApps, nextUsage, nextAlerts] = await Promise.all([
          listAppUsage(range),
          mode === "app" ? Promise.resolve(nextSnapshot.sample_points) : getUsageSummary(range, "time"),
          mode === "app" ? Promise.resolve(nextSnapshot.recent_alerts) : listAlerts(range)
        ]);
        setApps(nextApps);
        setUsage(nextUsage);
        setAlerts(nextAlerts);
        hasHeavyData.current = true;
      } else if (!hasHeavyData.current) {
        setApps(nextSnapshot.top_apps);
        setUsage(nextSnapshot.sample_points);
        setAlerts(nextSnapshot.recent_alerts);
        hasHeavyData.current = true;
      }

      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { snapshot, connections, apps, usage, alerts, loading, error, refresh };
}

export default function App() {
  const appRoute = parseAppRoute();
  const isWidget = window.location.hash.includes("widget");
  const data = useTrafficData(isWidget ? "widget" : appRoute ? "app" : "main");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const activeCopy = tabCopy[activeTab];

  if (isWidget) {
    return <Widget snapshot={data.snapshot} apps={data.apps} />;
  }

  if (appRoute) {
    return (
      <AppMonitorWindow
        appKey={appRoute}
        apps={data.apps}
        connections={data.connections}
        error={data.error}
        loading={data.loading}
        snapshot={data.snapshot}
        usage={data.usage}
        onRefresh={data.refresh}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Radar size={20} />
          </div>
          <div>
            <div className="brand-title">流量哨兵</div>
            <div className="brand-subtitle">Traffic Sentinel</div>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                type="button"
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-status">
            <CircleDot size={14} />
            <span>{data.snapshot?.status.running ? "采集中" : "预览模式"}</span>
          </div>
          <div className="sidebar-meta">
            <span>{data.snapshot?.status.permission_level ?? "standard"}</span>
            <span>{data.snapshot?.status.geo_db_loaded ? "GeoDB 在线" : "GeoDB 预置"}</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="command-bar">
          <div>
            <div className="eyebrow">LOCAL NETWORK COMMAND CENTER</div>
            <h1>{activeCopy.title}</h1>
            <p>{activeCopy.subtitle}</p>
          </div>
          <div className="command-actions">
            <button className="tool-button" onClick={() => void data.refresh()} title="刷新数据" type="button">
              <RefreshCw size={16} />
            </button>
            <button className="tool-button" title="采样间隔：1 秒" type="button">
              <SignalHigh size={16} />
            </button>
            <button className="tool-button wide" title="全局筛选" type="button">
              <SlidersHorizontal size={16} />
              <span>今日</span>
            </button>
          </div>
        </header>

        <TopStatus snapshot={data.snapshot} connections={data.connections} />
        {data.error && <ErrorBanner message={data.error} onRetry={data.refresh} />}
        {data.loading && <div className="empty-state">正在读取本机网络状态</div>}

        {!data.loading && activeTab === "overview" && (
          <Overview
            alerts={data.alerts}
            apps={data.apps}
            snapshot={data.snapshot}
            usage={data.usage}
          />
        )}
        {!data.loading && activeTab === "apps" && <AppsRanking apps={data.apps} connections={data.connections} />}
        {!data.loading && activeTab === "realtime" && (
          <Realtime connections={data.connections} apps={data.apps} snapshot={data.snapshot} />
        )}
        {!data.loading && activeTab === "stats" && <Stats usage={data.usage} apps={data.apps} />}
        {!data.loading && activeTab === "overseas" && (
          <Overseas snapshot={data.snapshot} connections={data.connections} apps={data.apps} />
        )}
        {!data.loading && activeTab === "control" && <ControlCenter alerts={data.alerts} />}
      </main>
    </div>
  );
}

function TopStatus({
  snapshot,
  connections
}: {
  snapshot: TrafficSnapshot | null;
  connections: ConnectionInfo[];
}) {
  const totalToday = (snapshot?.today_download_bytes ?? 0) + (snapshot?.today_upload_bytes ?? 0);

  return (
    <section className="top-status">
      <StatusMetric icon={ChevronsDown} label="下载" value={formatBps(snapshot?.download_bps ?? 0)} tone="down" />
      <StatusMetric icon={ChevronsUp} label="上传" value={formatBps(snapshot?.upload_bps ?? 0)} tone="up" />
      <StatusMetric icon={Database} label="今日累计" value={formatBytes(totalToday)} />
      <StatusMetric
        icon={Globe2}
        label="境外占比"
        sublabel={`${connections.length} 个连接`}
        value={formatPercent(snapshot?.overseas_ratio ?? 0)}
        tone="foreign"
      />
    </section>
  );
}

function StatusMetric({
  icon: Icon,
  label,
  sublabel,
  value,
  tone = ""
}: {
  icon: LucideIcon;
  label: string;
  sublabel?: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`status-cell ${tone}`}>
      <div className="status-icon">
        <Icon size={18} />
      </div>
      <div>
        <span className="label">{label}</span>
        <strong>{value}</strong>
        {sublabel && <small>{sublabel}</small>}
      </div>
    </div>
  );
}

function Overview({
  snapshot,
  apps,
  usage,
  alerts
}: {
  snapshot: TrafficSnapshot | null;
  apps: AppUsage[];
  usage: UsageAggregate[];
  alerts: AlertEvent[];
}) {
  return (
    <div className="view-grid overview-grid">
      <section className="panel main-chart">
        <PanelTitle icon={Gauge} title="实时趋势" action="滚动窗口 / 当前速率" />
        <TrafficChart
          live={snapshot ? { timestamp: snapshot.timestamp, downloadBps: snapshot.download_bps, uploadBps: snapshot.upload_bps } : undefined}
          points={snapshot?.sample_points.length ? snapshot.sample_points : usage}
          variant="realtime"
        />
      </section>

      <section className="panel side-panel">
        <PanelTitle icon={AppWindow} title="活跃应用" action="可弹出监控窗" />
        <RankList apps={apps.slice(0, 6)} />
      </section>

      <section className="panel side-panel">
        <PanelTitle icon={Globe2} title="境外目的地" />
        <EndpointList endpoints={snapshot?.top_overseas ?? []} />
      </section>

      <section className="panel table-panel">
        <PanelTitle icon={ShieldAlert} title="最近告警" />
        <AlertList alerts={alerts.slice(0, 5)} />
      </section>
    </div>
  );
}

function Realtime({
  connections,
  apps,
  snapshot
}: {
  connections: ConnectionInfo[];
  apps: AppUsage[];
  snapshot: TrafficSnapshot | null;
}) {
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"connections" | "profile">("connections");
  const [protocol, setProtocol] = useState<"all" | "TCP" | "UDP">("all");
  const [geoClass, setGeoClass] = useState<"all" | GeoClass>("all");
  const [direction, setDirection] = useState<"all" | ConnectionInfo["direction"]>("all");
  const rows = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    return connections.filter((item) => {
      if (protocol !== "all" && item.protocol !== protocol) return false;
      if (geoClass !== "all" && item.endpoint.geo_class !== geoClass) return false;
      if (direction !== "all" && item.direction !== direction) return false;
      if (!keyword) return true;
      return [
        item.app_name,
        item.process_name,
        item.remote_ip,
        String(item.remote_port ?? ""),
        item.local_addr,
        String(item.local_port),
        item.endpoint.region_name,
        item.protocol
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [connections, direction, filter, geoClass, protocol]);

  return (
    <div className="connection-view">
      <div className="table-toolbar">
        <div className="toolbar-left">
          <PanelTitle icon={Activity} title="连接工作台" action={`${rows.length} / ${connections.length}`} />
          <div className="segmented">
            <button className={view === "connections" ? "active" : ""} onClick={() => setView("connections")} type="button">实时连接</button>
            <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")} type="button">网络剖面</button>
          </div>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索应用、IP、端口、地区" />
        </label>
      </div>
      {view === "connections" && (
        <section className="panel full-panel">
          <FilterRail>
            <SelectFilter label="协议" value={protocol} onChange={(value) => setProtocol(value as typeof protocol)}>
              <option value="all">全部</option>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
            </SelectFilter>
            <SelectFilter label="归属" value={geoClass} onChange={(value) => setGeoClass(value as typeof geoClass)}>
              <option value="all">全部</option>
              <option value="mainland_china">中国大陆</option>
              <option value="hong_kong_macau_taiwan">港澳台</option>
              <option value="overseas">境外</option>
              <option value="private">内网</option>
              <option value="unknown">未知</option>
            </SelectFilter>
            <SelectFilter label="方向" value={direction} onChange={(value) => setDirection(value as typeof direction)}>
              <option value="all">全部</option>
              <option value="outbound">出站</option>
              <option value="inbound">入站</option>
              <option value="listening">监听</option>
              <option value="unknown">未知</option>
            </SelectFilter>
          </FilterRail>
          <ConnectionTable rows={rows} />
        </section>
      )}
      {view === "profile" && <NetworkDetails apps={apps} connections={connections} snapshot={snapshot} />}
    </div>
  );
}

function NetworkDetails({
  snapshot,
  connections,
  apps
}: {
  snapshot: TrafficSnapshot | null;
  connections: ConnectionInfo[];
  apps: AppUsage[];
}) {
  const protocolRows = countBy(connections, (item) => item.protocol);
  const geoRows = countBy(connections, (item) => geoClassLabel(item.endpoint.geo_class));
  const confidenceRows = countBy(connections, (item) => confidenceLabel(item.confidence));
  const remoteHosts = new Set(connections.map((item) => item.remote_ip).filter(Boolean));
  const localPorts = new Set(connections.map((item) => `${item.local_addr}:${item.local_port}`));
  const overseasApps = apps.filter((app) => app.overseas_connection_count > 0);
  const topEndpoints = [...connections]
    .sort((a, b) => endpointBytes(b.endpoint) - endpointBytes(a.endpoint))
    .slice(0, 8);

  return (
    <div className="view-grid network-grid">
      <section className="panel network-profile">
        <PanelTitle icon={Network} title="网络态势剖面" action="本机视角" />
        <div className="profile-map">
          <div className="node local">
            <Router size={24} />
            <strong>本机</strong>
            <span>{snapshot?.adapter_count ?? 0} 个适配器</span>
          </div>
          <div className="link-line" />
          <div className="node middle">
            <Waypoints size={24} />
            <strong>{connections.length}</strong>
            <span>当前连接</span>
          </div>
          <div className="link-line" />
          <div className="node remote">
            <Globe2 size={24} />
            <strong>{remoteHosts.size}</strong>
            <span>远端地址</span>
          </div>
        </div>
        <div className="detail-card-grid">
          <DetailCard icon={HardDrive} label="本地端点" value={`${localPorts.size} 个`} />
          <DetailCard icon={ServerCog} label="GeoDB" value={snapshot?.status.geo_db_loaded ? "已加载" : "预置/回退"} />
          <DetailCard icon={ShieldCheck} label="权限级别" value={snapshot?.status.permission_level ?? "standard"} />
          <DetailCard icon={Clock3} label="采集启动" value={shortTime(snapshot?.status.started_at ?? Date.now())} />
        </div>
      </section>

      <section className="panel side-panel">
        <PanelTitle icon={SignalHigh} title="协议分布" />
        <BreakdownList rows={protocolRows} total={connections.length} />
      </section>

      <section className="panel side-panel">
        <PanelTitle icon={Globe2} title="归属分类" />
        <BreakdownList rows={geoRows} total={connections.length} />
      </section>

      <section className="panel side-panel">
        <PanelTitle icon={ShieldAlert} title="归因置信度" />
        <BreakdownList rows={confidenceRows} total={connections.length} />
      </section>

      <section className="panel side-panel">
        <PanelTitle icon={AppWindow} title="涉及境外的应用" />
        <RankList apps={overseasApps.slice(0, 5)} compact />
      </section>

      <section className="panel table-panel">
        <PanelTitle icon={Waypoints} title="高流量端点明细" action="按端点估算字节排序" />
        <div className="endpoint-detail-list">
          {topEndpoints.map((item) => (
            <EndpointDetailRow item={item} key={item.id} />
          ))}
          {topEndpoints.length === 0 && <div className="empty-inline">暂无连接端点</div>}
        </div>
      </section>
    </div>
  );
}

function Stats({ usage, apps }: { usage: UsageAggregate[]; apps: AppUsage[] }) {
  const totalDown = usage.reduce((sum, item) => sum + item.download_bytes, 0);
  const totalUp = usage.reduce((sum, item) => sum + item.upload_bytes, 0);
  const overseas = usage.reduce((sum, item) => sum + item.overseas_bytes, 0);

  return (
    <div className="view-grid stats-grid">
      <section className="panel main-chart">
        <div className="chart-head">
          <div className="segmented">
            <button className="active" type="button">今天</button>
            <button type="button">7 天</button>
            <button type="button">本月</button>
            <button type="button">自定义</button>
          </div>
          <span>上传/下载分离展示</span>
        </div>
        <TrafficChart points={usage} variant="usage" />
      </section>
      <section className="panel side-panel">
        <PanelTitle icon={Database} title="摘要" />
        <div className="summary-list">
          <SummaryRow label="下载" value={formatBytes(totalDown)} tone="down" />
          <SummaryRow label="上传" value={formatBytes(totalUp)} tone="up" />
          <SummaryRow label="境外" value={formatBytes(overseas)} tone="foreign" />
          <SummaryRow label="最大应用" value={apps[0]?.app_name ?? "无"} />
        </div>
      </section>
      <section className="panel table-panel">
        <PanelTitle icon={BarChart3} title="应用用量排行" />
        <AppTable apps={apps} compact />
      </section>
    </div>
  );
}

function AppsRanking({ apps, connections }: { apps: AppUsage[]; connections: ConnectionInfo[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return apps;
    return apps.filter((app) => [app.app_name, app.process_name, app.app_key].join(" ").toLowerCase().includes(keyword));
  }, [apps, query]);

  return (
    <section className="panel full-panel apps-panel">
      <div className="table-toolbar">
        <PanelTitle icon={ListFilter} title="应用排行" action={`${connections.length} 个连接`} />
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用或进程" />
        </label>
      </div>
      <AppTable apps={filtered} />
    </section>
  );
}

function Overseas({
  snapshot,
  connections,
  apps
}: {
  snapshot: TrafficSnapshot | null;
  connections: ConnectionInfo[];
  apps: AppUsage[];
}) {
  const overseas = connections.filter((item) => item.endpoint.geo_class === "overseas");
  const unknown = connections.filter((item) => item.endpoint.geo_class === "unknown");
  const countries = new Map<string, { name: string; count: number; bytes: number }>();
  for (const item of overseas) {
    const key = item.endpoint.country_code ?? item.endpoint.region_name;
    const current = countries.get(key) ?? { name: item.endpoint.region_name, count: 0, bytes: 0 };
    current.count += 1;
    current.bytes += endpointBytes(item.endpoint);
    countries.set(key, current);
  }
  const countryRows = Array.from(countries.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.bytes - a.bytes);

  return (
    <div className="view-grid overseas-grid">
      <section className="panel quota-panel">
        <PanelTitle icon={Globe2} title="中国大陆外流量" />
        <div className="quota-number">{formatBytes(snapshot?.overseas_today_bytes ?? 0)}</div>
        <div className="quota-caption">
          今日境外估算流量，占全部流量 {formatPercent(snapshot?.overseas_ratio ?? 0)}。未知归属 {unknown.length} 个连接单独提示。
        </div>
        <div className="progress">
          <span style={{ width: `${Math.min(100, (snapshot?.overseas_ratio ?? 0) * 100)}%` }} />
        </div>
        <div className="quota-mini">
          <SummaryRow label="本月境外" value={formatBytes(snapshot?.overseas_month_bytes ?? 0)} tone="foreign" />
          <SummaryRow label="当前境外连接" value={`${overseas.length} 个`} />
        </div>
      </section>
      <section className="panel side-panel">
        <PanelTitle icon={Globe2} title="国家/地区排行" />
        <div className="country-list">
          {countryRows.map((item) => (
            <div className="country-row" key={item.key}>
              <span>{item.name}</span>
              <strong>{item.count} 连接 · {formatBytes(item.bytes)}</strong>
            </div>
          ))}
          {countryRows.length === 0 && <div className="empty-inline">暂无境外连接</div>}
        </div>
      </section>
      <section className="panel table-panel">
        <PanelTitle icon={ShieldAlert} title="涉及应用" action="点击监控打开独立窗口" />
        <AppTable apps={apps.filter((item) => item.overseas_connection_count > 0)} compact />
      </section>
    </div>
  );
}

function Alerts({ alerts }: { alerts: AlertEvent[] }) {
  const [saving, setSaving] = useState(false);

  async function createDefaultRule() {
    setSaving(true);
    await setAlertRule({
      rule_type: "overseas_daily_quota",
      enabled: true,
      severity: "notice",
      threshold_bytes: 5 * 1024 * 1024 * 1024,
      window: "day"
    });
    setSaving(false);
  }

  return (
    <div className="view-grid alerts-grid">
      <section className="panel side-panel">
        <PanelTitle icon={Bell} title="规则" />
        <button className="primary-button" disabled={saving} onClick={() => void createDefaultRule()} type="button">
          <Bell size={16} />
          添加境外日阈值
        </button>
        <div className="rule-list">
          <div className="rule-row">
            <span>新进程首次联网</span>
            <strong>信息</strong>
          </div>
          <div className="rule-row">
            <span>未知归属突增</span>
            <strong>注意</strong>
          </div>
          <div className="rule-row">
            <span>月流量接近阈值</span>
            <strong>警告</strong>
          </div>
        </div>
      </section>
      <section className="panel table-panel">
        <PanelTitle icon={AlertTriangle} title="告警事件" />
        <AlertList alerts={alerts} />
      </section>
    </div>
  );
}

function ControlCenter({ alerts }: { alerts: AlertEvent[] }) {
  return (
    <div className="view-grid control-grid">
      <Alerts alerts={alerts} />
      <SettingsView embedded />
    </div>
  );
}

function SettingsView({ embedded = false }: { embedded?: boolean }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [busy, setBusy] = useState(false);

  async function patch(next: Partial<AppSettings>) {
    setSettings((current) => ({ ...current, ...next }));
    await updateSettings(next);
  }

  async function clear(scope: string) {
    setBusy(true);
    await clearHistory(scope);
    setBusy(false);
  }

  return (
    <section className={`panel full-panel settings-panel ${embedded ? "embedded" : ""}`}>
      <PanelTitle icon={Settings} title="设置" />
      <div className="settings-grid">
        <SettingRow label="跟随系统主题">
          <input
            checked={settings.theme === "system"}
            onChange={(event) => void patch({ theme: event.target.checked ? "system" : "light" })}
            type="checkbox"
          />
        </SettingRow>
        <SettingRow label="开机自启">
          <input checked={settings.autostart} onChange={(event) => void patch({ autostart: event.target.checked })} type="checkbox" />
        </SettingRow>
        <SettingRow label="显示悬浮窗">
          <input
            checked={settings.widget_visible}
            onChange={(event) => void patch({ widget_visible: event.target.checked })}
            type="checkbox"
          />
        </SettingRow>
        <SettingRow label="悬浮窗透明度">
          <input
            max="1"
            min="0.5"
            onChange={(event) => void patch({ widget_opacity: Number(event.target.value) })}
            step="0.02"
            type="range"
            value={settings.widget_opacity}
          />
        </SettingRow>
        <SettingRow label="包含虚拟网卡">
          <input
            checked={settings.include_virtual_adapters}
            onChange={(event) => void patch({ include_virtual_adapters: event.target.checked })}
            type="checkbox"
          />
        </SettingRow>
      </div>
      <div className="danger-zone">
        <button className="ghost-button" disabled={busy} onClick={() => void clear("samples")} type="button">
          清空短周期样本
        </button>
        <button className="ghost-button" disabled={busy} onClick={() => void clear("all")} type="button">
          清空全部历史
        </button>
      </div>
    </section>
  );
}

function AppMonitorWindow({
  appKey,
  snapshot,
  apps,
  connections,
  usage,
  loading,
  error,
  onRefresh
}: {
  appKey: string;
  snapshot: TrafficSnapshot | null;
  apps: AppUsage[];
  connections: ConnectionInfo[];
  usage: UsageAggregate[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [monitorTab, setMonitorTab] = useState<"connections" | "destinations" | "history" | "rules">("connections");
  const normalized = appKey.toLowerCase();
  const app =
    apps.find((item) => item.app_key.toLowerCase() === normalized) ??
    apps.find((item) => [item.app_name, item.process_name].join(" ").toLowerCase().includes(normalized));
  const targetAppKey = app?.app_key.toLowerCase() ?? normalized;
  const appConnections = connections.filter((item) => {
    if (item.app_key.toLowerCase() === targetAppKey) return true;
    const haystack = [item.app_name, item.process_name, item.endpoint.app_name ?? ""].join(" ").toLowerCase();
    return !app && haystack.includes(normalized);
  });
  const title = app?.app_name ?? appKey;
  const currentDown = app?.current_download_bps ?? appConnections.reduce((sum, item) => sum + item.endpoint.bytes_down, 0);
  const currentUp = app?.current_upload_bps ?? appConnections.reduce((sum, item) => sum + item.endpoint.bytes_up, 0);
  const overseas = appConnections.filter((item) => item.endpoint.geo_class === "overseas");
  const unknown = appConnections.filter((item) => item.endpoint.geo_class === "unknown");
  const destinationRows = [...appConnections]
    .sort((a, b) => endpointBytes(b.endpoint) - endpointBytes(a.endpoint))
    .slice(0, 16);

  return (
    <main className="app-monitor-window">
      <header className="app-monitor-title" data-tauri-drag-region>
        <div className="app-avatar">
          <AppWindow size={24} />
        </div>
        <div>
          <div className="eyebrow">APP MONITOR</div>
          <h1>{title}</h1>
          <p>{app?.process_name ?? "当前没有可归因的进程信息"} · {confidenceLabel(app?.confidence ?? "unknown")}</p>
        </div>
        <div className="monitor-actions">
          <button className="tool-button" onClick={() => void onRefresh()} title="刷新" type="button">
            <RefreshCw size={16} />
          </button>
          <button className="tool-button" onClick={() => window.close()} title="关闭窗口" type="button">
            <X size={16} />
          </button>
        </div>
      </header>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}
      {loading && <div className="empty-state">正在读取应用网络状态</div>}

      {!loading && (
        <>
          <section className="monitor-kpis">
            <StatusMetric icon={ChevronsDown} label="下载" value={formatBps(currentDown)} tone="down" />
            <StatusMetric icon={ChevronsUp} label="上传" value={formatBps(currentUp)} tone="up" />
            <StatusMetric icon={Database} label="累计用量" value={formatBytes((app?.download_bytes ?? 0) + (app?.upload_bytes ?? 0))} />
            <StatusMetric icon={Globe2} label="境外" value={formatBytes(app?.overseas_bytes ?? 0)} tone="foreign" />
            <StatusMetric icon={Waypoints} label="连接" value={`${appConnections.length} 个`} sublabel={`${overseas.length} 境外 / ${unknown.length} 未知`} />
          </section>

          <div className="app-monitor-grid">
            <section className="panel main-chart">
              <PanelTitle icon={Activity} title="该应用实时趋势" action="滚动窗口 / 估算速率" />
              <TrafficChart
                live={{ timestamp: snapshot?.timestamp ?? Date.now(), downloadBps: currentDown, uploadBps: currentUp }}
                points={usage}
                variant="realtime"
              />
            </section>
            <section className="panel side-panel">
              <PanelTitle icon={ShieldCheck} title="应用摘要" />
              <div className="summary-list">
                <SummaryRow label="PID" value={String(app?.pid ?? "-")} />
                <SummaryRow label="当前下载" value={formatBps(currentDown)} tone="down" />
                <SummaryRow label="当前上传" value={formatBps(currentUp)} tone="up" />
                <SummaryRow label="境外连接" value={`${overseas.length} 个`} tone="foreign" />
                <SummaryRow label="未知端点" value={`${unknown.length} 个`} />
                <SummaryRow label="总境外占比" value={formatPercent(ratio(app?.overseas_bytes ?? 0, (app?.download_bytes ?? 0) + (app?.upload_bytes ?? 0)))} />
              </div>
            </section>
            <section className="panel table-panel">
              <div className="monitor-tabs">
                <PanelTitle icon={Waypoints} title="应用排查" action={`${snapshot?.status.geo_db_label ?? "GeoDB"}`} />
                <div className="segmented">
                  <button className={monitorTab === "connections" ? "active" : ""} onClick={() => setMonitorTab("connections")} type="button">连接</button>
                  <button className={monitorTab === "destinations" ? "active" : ""} onClick={() => setMonitorTab("destinations")} type="button">目的地</button>
                  <button className={monitorTab === "history" ? "active" : ""} onClick={() => setMonitorTab("history")} type="button">历史</button>
                  <button className={monitorTab === "rules" ? "active" : ""} onClick={() => setMonitorTab("rules")} type="button">规则</button>
                </div>
              </div>
              {monitorTab === "connections" && <ConnectionTable rows={appConnections} />}
              {monitorTab === "destinations" && (
                <div className="endpoint-detail-list app-destinations">
                  {destinationRows.map((item) => (
                    <EndpointDetailRow item={item} key={item.id} />
                  ))}
                  {destinationRows.length === 0 && <div className="empty-inline">暂无目的地</div>}
                </div>
              )}
              {monitorTab === "history" && (
                <div className="app-history-panel">
                  <TrafficChart points={usage} variant="usage" />
                  <div className="data-quality-note">
                    <ShieldAlert size={16} />
                    <span>当前为低权限 MVP 的应用级估算趋势，后续 ETW 精确模式会替换这里的数据源。</span>
                  </div>
                </div>
              )}
              {monitorTab === "rules" && (
                <div className="app-rules-panel">
                  <button className="primary-button" type="button">
                    <Bell size={16} />
                    关注此应用
                  </button>
                  <button className="ghost-button" type="button">境外流量超过阈值时提醒</button>
                  <button className="ghost-button" type="button">未知归属端点突增时提醒</button>
                  <div className="data-quality-note">
                    <ShieldCheck size={16} />
                    <span>当前只做提醒和静默，不在低权限模式下承诺阻断或限速。</span>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function Widget({ snapshot, apps }: { snapshot: TrafficSnapshot | null; apps: AppUsage[] }) {
  const [size, setSize] = useState<"small" | "medium" | "large">("medium");
  const topApp = apps[0];
  const className = `widget widget-${size}`;

  function changeSize(nextSize: "small" | "medium" | "large") {
    setSize(nextSize);
    void setWidgetSize(nextSize);
  }

  return (
    <div className={className}>
      <div className="widget-handle" data-tauri-drag-region>
        <Pin size={14} />
        <span>流量哨兵</span>
        <div className="widget-size-buttons">
          {(["small", "medium", "large"] as const).map((item) => (
            <button className={size === item ? "active" : ""} key={item} onClick={() => changeSize(item)} type="button">
              {item === "small" ? "S" : item === "medium" ? "M" : "L"}
            </button>
          ))}
        </div>
      </div>
      <div className="widget-speed">
        <div>
          <ChevronsDown size={15} />
          <strong>{formatBps(snapshot?.download_bps ?? 0)}</strong>
        </div>
        <div>
          <ChevronsUp size={15} />
          <strong>{formatBps(snapshot?.upload_bps ?? 0)}</strong>
        </div>
      </div>
      {size !== "small" && (
        <div className="widget-extra">
          <span>今日 {formatBytes((snapshot?.today_download_bytes ?? 0) + (snapshot?.today_upload_bytes ?? 0))}</span>
          <span>境外 {formatPercent(snapshot?.overseas_ratio ?? 0)}</span>
        </div>
      )}
      {size === "large" && (
        <div className="widget-detail">
          <div>
            <span>活跃应用</span>
            <strong>{topApp?.app_name ?? "无"}</strong>
          </div>
          <div className="progress">
            <span style={{ width: `${Math.min(100, (snapshot?.overseas_ratio ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  action
}: {
  icon: LucideIcon;
  title: string;
  action?: string;
}) {
  return (
    <div className="panel-title">
      <div>
        <Icon size={17} />
        <h2>{title}</h2>
      </div>
      {action && <span>{action}</span>}
    </div>
  );
}

function TrafficChart({
  points,
  live,
  variant = "usage"
}: {
  points: UsageAggregate[];
  live?: LiveTrafficSample;
  variant?: TrafficChartVariant;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [livePoints, setLivePoints] = useState<TrendPoint[]>([]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const seedPoints = useMemo(
    () =>
      points
        .slice(-(variant === "realtime" ? LIVE_TREND_LIMIT : HISTORY_TREND_LIMIT))
        .map((item) => usagePointToTrendPoint(item, variant)),
    [points, variant]
  );

  useEffect(() => {
    if (!live) return;
    const nextPoint = liveSampleToTrendPoint(live);
    setLivePoints((current) => {
      const last = current[current.length - 1];
      if (last && last.timestamp === nextPoint.timestamp) {
        return current;
      }
      const base = current.length > 0 ? current : seedPoints.slice(-(LIVE_TREND_LIMIT - 1));
      return [...base, nextPoint].slice(-LIVE_TREND_LIMIT);
    });
  }, [live?.downloadBps, live?.timestamp, live?.uploadBps, seedPoints]);

  useEffect(() => {
    if (live) return;
    setHoverIndex(null);
  }, [live, points]);

  const chartPoints = live ? (livePoints.length > 0 ? livePoints : seedPoints) : seedPoints;
  const pointCount = chartPoints.length;

  if (pointCount === 0) {
    return (
      <div className={`chart-wrap trend-chart ${variant}`}>
        <div className="trend-empty">
          <strong>等待样本</strong>
          <span>{variant === "realtime" ? "实时速率样本到达后会开始滚动。" : "暂无可展示的历史用量。"}</span>
        </div>
      </div>
    );
  }

  const activeIndex = hoverIndex ?? pointCount - 1;
  const activePoint = chartPoints[Math.min(activeIndex, pointCount - 1)];
  const latestPoint = chartPoints[pointCount - 1];
  const previousPoint = chartPoints[Math.max(0, pointCount - 2)];
  const totals = chartPoints.map(pointTotal);
  const maxValue = Math.max(1, ...chartPoints.flatMap((item) => [item.download, item.upload, pointTotal(item)]));
  const averageTotal = totals.reduce((sum, value) => sum + value, 0) / pointCount;
  const peakTotal = Math.max(...totals);
  const latestTotal = pointTotal(latestPoint);
  const delta = latestTotal - pointTotal(previousPoint);
  const downCoords = chartPoints.map((item, index) => chartCoord(index, item.download, pointCount, maxValue));
  const upCoords = chartPoints.map((item, index) => chartCoord(index, item.upload, pointCount, maxValue));
  const totalCoords = chartPoints.map((item, index) => chartCoord(index, pointTotal(item), pointCount, maxValue));
  const activeCoord = chartCoord(activeIndex, pointTotal(activePoint), pointCount, maxValue);
  const tickValues = [maxValue, maxValue * 0.66, maxValue * 0.33];
  const tickIndexes = Array.from(new Set([0, Math.floor((pointCount - 1) / 2), pointCount - 1]));
  const spanLabel = variant === "realtime" ? `${pointCount} 个速率样本` : `${pointCount} 个时间桶`;
  const tooltipTransform = activeCoord.y > 56 ? "translate(-50%, -112%)" : "translate(-50%, 12px)";

  function handleChartMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (pointCount < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const nextIndex = Math.round(ratio * (pointCount - 1));
    setHoverIndex((current) => (current === nextIndex ? current : nextIndex));
  }

  return (
    <div className={`chart-wrap trend-chart ${variant}`}>
      <div className="trend-summary">
        <div className="trend-primary">
          <span>
            {variant === "realtime" && <i className="live-dot" />}
            {variant === "realtime" ? "当前总速率" : "当前桶合计"}
          </span>
          <strong>{formatTrendValue(latestTotal, variant)}</strong>
          <small className={delta >= 0 ? "up" : "down"}>{formatTrendDelta(delta, variant)} 较前一点</small>
        </div>
        <div className="trend-metrics">
          <TrendMetric label="下载" value={formatTrendValue(latestPoint.download, variant)} tone="down" />
          <TrendMetric label="上传" value={formatTrendValue(latestPoint.upload, variant)} tone="up" />
          <TrendMetric label="峰值" value={formatTrendValue(peakTotal, variant)} />
          <TrendMetric label="均值" value={formatTrendValue(averageTotal, variant)} />
        </div>
      </div>

      <div className="trend-canvas" onMouseLeave={() => setHoverIndex(null)} onMouseMove={handleChartMove}>
        <svg className="traffic-chart" preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <linearGradient id={`${gradientId}-down`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#58d7ff" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#58d7ff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gradientId}-up`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#64e0a5" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#64e0a5" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect className="chart-backdrop" height="100" rx="3" width="100" x="0" y="0" />
          {tickValues.map((value) => {
            const y = chartY(value, maxValue);
            return (
              <g key={value}>
                <line className="grid-line" x1={CHART_FRAME.left} x2={100 - CHART_FRAME.right} y1={y} y2={y} />
                <text className="axis-label y-label" x="2" y={y + 1.2}>
                  {formatTrendValue(value, variant)}
                </text>
              </g>
            );
          })}
          {tickIndexes.map((index) => {
            const x = chartX(index, pointCount);
            return (
              <g key={`${chartPoints[index].id}-tick`}>
                <line className="tick-line" x1={x} x2={x} y1={CHART_FRAME.top} y2={100 - CHART_FRAME.bottom} />
                <text className="axis-label x-label" textAnchor={index === 0 ? "start" : index === pointCount - 1 ? "end" : "middle"} x={x} y="96">
                  {chartPoints[index].label}
                </text>
              </g>
            );
          })}
          {chartPoints.map((item, index) => {
            const total = pointTotal(item);
            const x = chartX(index, pointCount);
            const width = Math.max(0.8, Math.min(2.4, 58 / pointCount));
            const totalHeight = Math.max(1.2, ((total / maxValue) * 15));
            const uploadHeight = total === 0 ? 0 : Math.max(0.7, (item.upload / total) * totalHeight);
            const baseY = 100 - CHART_FRAME.bottom - 1.5;
            return (
              <g className="trend-bar" key={`${item.id}-bar`}>
                <rect className="trend-bar-down" height={totalHeight} rx="0.7" width={width} x={x - width / 2} y={baseY - totalHeight} />
                <rect className="trend-bar-up" height={uploadHeight} rx="0.7" width={width} x={x - width / 2} y={baseY - uploadHeight} />
              </g>
            );
          })}
          <path className="chart-area down-area" d={buildAreaPath(downCoords)} fill={`url(#${gradientId}-down)`} />
          <path className="chart-area up-area" d={buildAreaPath(upCoords)} fill={`url(#${gradientId}-up)`} />
          <polyline className="chart-line total-line" points={buildLinePoints(totalCoords)} />
          <polyline className="chart-line down-line" points={buildLinePoints(downCoords)} />
          <polyline className="chart-line up-line" points={buildLinePoints(upCoords)} />
          <line className="active-rule" x1={activeCoord.x} x2={activeCoord.x} y1={CHART_FRAME.top} y2={100 - CHART_FRAME.bottom} />
          <circle className="active-dot down-dot" cx={chartCoord(activeIndex, activePoint.download, pointCount, maxValue).x} cy={chartCoord(activeIndex, activePoint.download, pointCount, maxValue).y} r="1.45" />
          <circle className="active-dot up-dot" cx={chartCoord(activeIndex, activePoint.upload, pointCount, maxValue).x} cy={chartCoord(activeIndex, activePoint.upload, pointCount, maxValue).y} r="1.35" />
          <circle className="latest-pulse" cx={totalCoords[pointCount - 1].x} cy={totalCoords[pointCount - 1].y} r="2.4" />
        </svg>
        <div
          className="chart-tooltip"
          style={{ left: `${activeCoord.x}%`, top: `${Math.max(10, Math.min(84, activeCoord.y))}%`, transform: tooltipTransform }}
        >
          <strong>{activePoint.label}</strong>
          <span>下载 {formatTrendValue(activePoint.download, variant)}</span>
          <span>上传 {formatTrendValue(activePoint.upload, variant)}</span>
          <span>合计 {formatTrendValue(pointTotal(activePoint), variant)}</span>
        </div>
      </div>

      <div className="trend-legend">
        <span><i className="legend-dot down" />下载</span>
        <span><i className="legend-dot up" />上传</span>
        <span><i className="legend-dot total" />合计轨迹</span>
        <strong>{spanLabel}</strong>
      </div>
    </div>
  );
}

function TrendMetric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`trend-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function usagePointToTrendPoint(item: UsageAggregate, variant: TrafficChartVariant): TrendPoint {
  const durationSeconds = Math.max(1, (item.bucket_end - item.bucket_start) / 1000);
  const divisor = variant === "realtime" ? durationSeconds : 1;
  const timestamp = item.bucket_end || item.bucket_start;
  return {
    id: `${item.group_key}-${item.bucket_start}-${variant}`,
    timestamp,
    label: item.label || shortTime(timestamp),
    download: Math.max(0, item.download_bytes / divisor),
    upload: Math.max(0, item.upload_bytes / divisor),
    overseas: Math.max(0, item.overseas_bytes / divisor)
  };
}

function liveSampleToTrendPoint(sample: LiveTrafficSample): TrendPoint {
  return {
    id: `live-${sample.timestamp}`,
    timestamp: sample.timestamp,
    label: shortTime(sample.timestamp),
    download: Math.max(0, sample.downloadBps),
    upload: Math.max(0, sample.uploadBps),
    overseas: 0
  };
}

function pointTotal(point: TrendPoint) {
  return point.download + point.upload;
}

function formatTrendValue(value: number, variant: TrafficChartVariant) {
  return variant === "realtime" ? formatBps(value) : formatBytes(value);
}

function formatTrendDelta(value: number, variant: TrafficChartVariant) {
  if (!Number.isFinite(value) || Math.abs(value) < 1) return "持平";
  return `${value > 0 ? "+" : "-"}${formatTrendValue(Math.abs(value), variant)}`;
}

function chartX(index: number, pointCount: number) {
  const width = 100 - CHART_FRAME.left - CHART_FRAME.right;
  if (pointCount <= 1) return CHART_FRAME.left + width;
  return CHART_FRAME.left + (index / (pointCount - 1)) * width;
}

function chartY(value: number, maxValue: number) {
  const height = 100 - CHART_FRAME.top - CHART_FRAME.bottom;
  return CHART_FRAME.top + (1 - Math.min(1, value / maxValue)) * height;
}

function chartCoord(index: number, value: number, pointCount: number, maxValue: number) {
  return { x: chartX(index, pointCount), y: chartY(value, maxValue) };
}

function buildLinePoints(coords: Array<{ x: number; y: number }>) {
  return coords.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function buildAreaPath(coords: Array<{ x: number; y: number }>) {
  if (coords.length === 0) return "";
  const base = 100 - CHART_FRAME.bottom;
  const line = coords.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  return `M ${coords[0].x.toFixed(2)} ${base} ${line} L ${coords[coords.length - 1].x.toFixed(2)} ${base} Z`;
}

function RankList({ apps, compact = false }: { apps: AppUsage[]; compact?: boolean }) {
  return (
    <div className={`rank-list ${compact ? "compact" : ""}`}>
      {apps.map((app, index) => (
        <div className="rank-row" key={app.app_key}>
          <span className="rank-index">{index + 1}</span>
          <div>
            <strong>{app.app_name}</strong>
            <span>{formatBps(app.current_download_bps)} / {app.connection_count} 连接</span>
          </div>
          <button className="row-action" onClick={() => void openAppMonitor(app)} title={`打开 ${app.app_name} 监控窗口`} type="button">
            <ExternalLink size={14} />
          </button>
        </div>
      ))}
      {apps.length === 0 && <div className="empty-inline">暂无应用数据</div>}
    </div>
  );
}

function EndpointList({ endpoints }: { endpoints: TrafficSnapshot["top_overseas"] }) {
  return (
    <div className="endpoint-list">
      {endpoints.slice(0, 5).map((endpoint) => (
        <div className="endpoint-row" key={`${endpoint.remote_ip}-${endpoint.remote_port}`}>
          <div>
            <strong>{endpoint.remote_ip}</strong>
            <span>{endpoint.app_name ?? "未知应用"} · {endpoint.remote_port ?? "*"}</span>
          </div>
          <GeoBadge value={endpoint.geo_class} label={endpoint.region_name} />
        </div>
      ))}
      {endpoints.length === 0 && <div className="empty-inline">暂无境外目的地</div>}
    </div>
  );
}

function AppTable({ apps, compact = false }: { apps: AppUsage[]; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>应用</th>
            {!compact && <th>PID</th>}
            <th>下载</th>
            <th>上传</th>
            <th>境外</th>
            <th>当前速率</th>
            <th>连接</th>
            <th>置信度</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={`${app.app_key}-${app.pid ?? "all"}`}>
              <td>
                <strong>{app.app_name}</strong>
                <span>{app.process_name}</span>
              </td>
              {!compact && <td>{app.pid ?? "-"}</td>}
              <td>{formatBytes(app.download_bytes)}</td>
              <td>{formatBytes(app.upload_bytes)}</td>
              <td>
                <span className={app.overseas_bytes > 0 ? "cell-foreign" : ""}>{formatBytes(app.overseas_bytes)}</span>
              </td>
              <td>{formatBps(app.current_download_bps + app.current_upload_bps)}</td>
              <td>{app.connection_count}</td>
              <td>{confidenceLabel(app.confidence)}</td>
              <td>
                <button className="row-action labeled" onClick={() => void openAppMonitor(app)} type="button">
                  <ExternalLink size={14} />
                  <span>监控</span>
                </button>
              </td>
            </tr>
          ))}
          {apps.length === 0 && <EmptyTable colSpan={compact ? 8 : 9} text="暂无应用统计" />}
        </tbody>
      </table>
    </div>
  );
}

function ConnectionTable({ rows }: { rows: ConnectionInfo[] }) {
  const visibleRows = rows.length > CONNECTION_RENDER_LIMIT ? rows.slice(0, CONNECTION_RENDER_LIMIT) : rows;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>应用</th>
            <th>PID</th>
            <th>协议</th>
            <th>本地端点</th>
            <th>远端端点</th>
            <th>地区</th>
            <th>状态</th>
            <th>方向</th>
            <th>置信度</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.app_name}</strong>
                <span>{item.process_name}</span>
              </td>
              <td>{item.pid}</td>
              <td><ProtocolPill value={item.protocol} /></td>
              <td>{item.local_addr}:{item.local_port}</td>
              <td>
                <EndpointAddress ip={item.remote_ip} port={item.remote_port} />
              </td>
              <td>
                <GeoBadge value={item.endpoint.geo_class} label={item.endpoint.region_name} />
              </td>
              <td>{item.state}</td>
              <td>{directionLabel(item.direction)}</td>
              <td>{confidenceLabel(item.confidence)}</td>
            </tr>
          ))}
          {rows.length > visibleRows.length && (
            <tr>
              <td className="empty-table" colSpan={9}>
                为保持桌面响应速度，当前仅显示前 {visibleRows.length} 条连接。请使用搜索缩小范围。
              </td>
            </tr>
          )}
          {rows.length === 0 && <EmptyTable colSpan={9} text="没有匹配的连接" />}
        </tbody>
      </table>
    </div>
  );
}

function AlertList({ alerts }: { alerts: AlertEvent[] }) {
  return (
    <div className="alert-list">
      {alerts.map((alert) => (
        <div className={`alert-row ${alert.severity}`} key={alert.id}>
          <AlertTriangle size={16} />
          <div>
            <strong>{alert.title}</strong>
            <span>{alert.message}</span>
          </div>
          <time>{shortTime(alert.timestamp)}</time>
        </div>
      ))}
      {alerts.length === 0 && <div className="empty-inline">暂无告警</div>}
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return (
    <div className="error-banner">
      <AlertTriangle size={16} />
      <span>{message}</span>
      <button onClick={() => void onRetry()} type="button">重试</button>
    </div>
  );
}

function GeoBadge({ value, label }: { value: GeoClass; label: string }) {
  return <span className={`geo-badge ${value}`}>{label || geoClassLabel(value)}</span>;
}

function ProtocolPill({ value }: { value: ConnectionInfo["protocol"] }) {
  return <span className={`protocol-pill ${value.toLowerCase()}`}>{value}</span>;
}

function EndpointAddress({ ip, port }: { ip: string; port?: number | null }) {
  return (
    <span className="endpoint-address">
      {ip || "*"}:{port ?? "*"}
      <button className="copy-button" onClick={() => void navigator.clipboard?.writeText(`${ip}:${port ?? "*"}`)} title="复制端点" type="button">
        <Copy size={12} />
      </button>
    </span>
  );
}

function SummaryRow({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`summary-row ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FilterRail({ children }: { children: ReactNode }) {
  return <div className="filter-rail">{children}</div>;
}

function SelectFilter({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="select-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SignalGauge({
  label,
  value,
  ratio,
  tone = ""
}: {
  label: string;
  value: string;
  ratio: number;
  tone?: string;
}) {
  return (
    <div className={`signal-gauge ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="progress">
        <span style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
      </div>
    </div>
  );
}

function DetailCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="detail-card">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BreakdownList({ rows, total }: { rows: Array<{ key: string; count: number }>; total: number }) {
  return (
    <div className="breakdown-list">
      {rows.map((row) => (
        <div className="breakdown-row" key={row.key}>
          <div>
            <span>{row.key}</span>
            <strong>{row.count}</strong>
          </div>
          <div className="progress">
            <span style={{ width: `${Math.max(4, ratio(row.count, total) * 100)}%` }} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="empty-inline">暂无数据</div>}
    </div>
  );
}

function EndpointDetailRow({ item }: { item: ConnectionInfo }) {
  return (
    <div className="endpoint-detail-row">
      <div>
        <strong>{item.remote_ip || "*"}</strong>
        <span>{item.app_name} · {item.protocol} · {directionLabel(item.direction)}</span>
      </div>
      <GeoBadge value={item.endpoint.geo_class} label={item.endpoint.region_name} />
      <div className="endpoint-bytes">
        <span>下 {formatBytes(item.endpoint.bytes_down)}</span>
        <span>上 {formatBytes(item.endpoint.bytes_up)}</span>
      </div>
    </div>
  );
}

function EmptyTable({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td className="empty-table" colSpan={colSpan}>{text}</td>
    </tr>
  );
}

function parseAppRoute() {
  const match = window.location.hash.match(/^#\/app\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function confidenceLabel(confidence: AttributionConfidence) {
  if (confidence === "exact") return "精确";
  if (confidence === "estimated") return "估算";
  return "未知";
}

function directionLabel(direction: ConnectionInfo["direction"]) {
  switch (direction) {
    case "outbound":
      return "出站";
    case "inbound":
      return "入站";
    case "listening":
      return "监听";
    default:
      return "未知";
  }
}

function endpointBytes(endpoint: RemoteEndpoint) {
  return endpoint.bytes_down + endpoint.bytes_up;
}

function ratio(value: number, total: number) {
  return total <= 0 ? 0 : value / total;
}

function quotaRatio(value: number, quota: number) {
  return quota <= 0 ? 0 : value / quota;
}

function countBy<T>(items: T[], select: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = select(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
