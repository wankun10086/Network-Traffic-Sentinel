import type { GeoClass } from "../types";

const units = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

export function formatBps(value: number): string {
  return `${formatBytes(value)}/s`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

export function geoClassLabel(value: GeoClass): string {
  switch (value) {
    case "mainland_china":
      return "中国大陆";
    case "hong_kong_macau_taiwan":
      return "港澳台";
    case "overseas":
      return "境外";
    case "private":
      return "内网";
    default:
      return "未知";
  }
}

export function shortTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

export function dayLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}
