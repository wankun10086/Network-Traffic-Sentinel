import { invoke } from "@tauri-apps/api/core";
import type {
  AlertEvent,
  AlertRule,
  AppSettings,
  AppUsage,
  ConnectionInfo,
  TrafficSnapshot,
  UsageAggregate,
  UsageRange
} from "../types";
import { mockAlerts, mockApps, mockConnections, mockSettings, mockSnapshot, mockUsage } from "./mock";

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

async function call<T>(command: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isTauriRuntime()) {
      throw new Error(`${command}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return fallback;
  }
}

export function getCurrentSnapshot(): Promise<TrafficSnapshot> {
  return call("get_current_snapshot", {}, mockSnapshot());
}

export function getUsageSummary(range: UsageRange, groupBy: string): Promise<UsageAggregate[]> {
  return call("get_usage_summary", { range, groupBy }, mockUsage);
}

export function listConnections(filter = "", limit = 600): Promise<ConnectionInfo[]> {
  return call("list_connections", { filter, limit }, mockConnections.slice(0, limit));
}

export function listAppUsage(range: UsageRange): Promise<AppUsage[]> {
  return call("list_app_usage", { range }, mockApps);
}

export function listAlerts(range: UsageRange): Promise<AlertEvent[]> {
  return call("list_alerts", { range }, mockAlerts);
}

export function setAlertRule(rule: AlertRule): Promise<AlertRule> {
  return call("set_alert_rule", { rule }, rule);
}

export function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  return call("update_settings", { settings }, { ...mockSettings, ...settings });
}

export function clearHistory(scope: string): Promise<boolean> {
  return call("clear_history", { scope }, true);
}

export async function openAppMonitor(app: Pick<AppUsage, "app_key" | "app_name">): Promise<boolean> {
  if (!isTauriRuntime()) {
    const url = `${window.location.origin}${window.location.pathname}#/app/${encodeURIComponent(app.app_key)}`;
    window.open(url, `app-monitor-${app.app_key}`, "width=900,height=660");
    return true;
  }

  return call("open_app_monitor", { appKey: app.app_key }, true);
}

export function setWidgetSize(size: AppSettings["widget_size"]): Promise<boolean> {
  return call("set_widget_size", { size }, true);
}
