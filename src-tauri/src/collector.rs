use crate::{
    geo::{is_outside_mainland, GeoResolver},
    models::{AppUsage, AttributionConfidence, ConnectionInfo, GeoClass, RemoteEndpoint},
};
use chrono::Utc;
use std::collections::HashMap;

#[derive(Debug, Clone, Default)]
pub struct InterfaceCounters {
    pub download_total: u64,
    pub upload_total: u64,
    pub adapter_count: usize,
}

#[derive(Debug, Clone)]
pub struct CollectorSample {
    pub timestamp: i64,
    pub download_delta: u64,
    pub upload_delta: u64,
    pub download_bps: f64,
    pub upload_bps: f64,
    pub overseas_download_delta: u64,
    pub overseas_upload_delta: u64,
    pub adapter_count: usize,
    pub connections: Vec<ConnectionInfo>,
    pub apps: Vec<AppUsage>,
    pub top_overseas: Vec<RemoteEndpoint>,
}

#[derive(Debug, Clone)]
struct LastCounters {
    timestamp: i64,
    counters: InterfaceCounters,
}

pub struct NetworkCollector {
    last: Option<LastCounters>,
    include_virtual_adapters: bool,
    cached_connections: Vec<ConnectionInfo>,
    last_connection_refresh: i64,
}

impl NetworkCollector {
    pub fn new(include_virtual_adapters: bool) -> Self {
        Self {
            last: None,
            include_virtual_adapters,
            cached_connections: Vec::new(),
            last_connection_refresh: 0,
        }
    }

    pub fn sample(&mut self, geo: &GeoResolver) -> Result<CollectorSample, String> {
        let timestamp = Utc::now().timestamp_millis();
        let counters = platform::interface_counters(self.include_virtual_adapters)?;
        let mut connections = if self.cached_connections.is_empty()
            || timestamp.saturating_sub(self.last_connection_refresh) >= 3_000
        {
            let fresh = platform::connections(geo)?;
            self.cached_connections = fresh.clone();
            self.last_connection_refresh = timestamp;
            fresh
        } else {
            self.cached_connections.clone()
        };

        let (download_delta, upload_delta, elapsed_secs) = match &self.last {
            Some(last) => {
                let elapsed = ((timestamp - last.timestamp) as f64 / 1000.0).max(0.001);
                (
                    safe_delta(counters.download_total, last.counters.download_total),
                    safe_delta(counters.upload_total, last.counters.upload_total),
                    elapsed,
                )
            }
            None => (0, 0, 1.0),
        };

        self.last = Some(LastCounters {
            timestamp,
            counters: counters.clone(),
        });

        let (apps, top_overseas, overseas_download_delta, overseas_upload_delta) =
            estimate_attribution(&mut connections, download_delta, upload_delta);

        Ok(CollectorSample {
            timestamp,
            download_delta,
            upload_delta,
            download_bps: download_delta as f64 / elapsed_secs,
            upload_bps: upload_delta as f64 / elapsed_secs,
            overseas_download_delta,
            overseas_upload_delta,
            adapter_count: counters.adapter_count,
            connections,
            apps,
            top_overseas,
        })
    }
}

pub fn safe_delta(current: u64, previous: u64) -> u64 {
    current.saturating_sub(previous)
}

fn estimate_attribution(
    connections: &mut [ConnectionInfo],
    download_delta: u64,
    upload_delta: u64,
) -> (Vec<AppUsage>, Vec<RemoteEndpoint>, u64, u64) {
    let attributable_count = connections
        .iter()
        .filter(|conn| !conn.remote_ip.is_empty() && conn.endpoint.geo_class != GeoClass::Private)
        .count()
        .max(1) as u64;
    let down_each = download_delta / attributable_count;
    let up_each = upload_delta / attributable_count;

    let mut apps: HashMap<String, AppUsage> = HashMap::new();
    let mut overseas_down = 0_u64;
    let mut overseas_up = 0_u64;
    let mut endpoints = Vec::new();

    for conn in connections.iter_mut() {
        if conn.remote_ip.is_empty() || conn.endpoint.geo_class == GeoClass::Private {
            conn.endpoint.bytes_down = 0;
            conn.endpoint.bytes_up = 0;
        } else {
            conn.endpoint.bytes_down = down_each;
            conn.endpoint.bytes_up = up_each;
        }

        let outside_mainland = is_outside_mainland(&conn.endpoint.geo_class);
        if outside_mainland {
            overseas_down = overseas_down.saturating_add(conn.endpoint.bytes_down);
            overseas_up = overseas_up.saturating_add(conn.endpoint.bytes_up);
            endpoints.push(conn.endpoint.clone());
        }

        let entry = apps
            .entry(conn.app_key.clone())
            .or_insert_with(|| AppUsage {
                app_key: conn.app_key.clone(),
                app_name: conn.app_name.clone(),
                process_name: conn.process_name.clone(),
                pid: Some(conn.pid),
                download_bytes: 0,
                upload_bytes: 0,
                overseas_bytes: 0,
                current_download_bps: 0.0,
                current_upload_bps: 0.0,
                connection_count: 0,
                overseas_connection_count: 0,
                confidence: AttributionConfidence::Estimated,
            });

        entry.download_bytes = entry
            .download_bytes
            .saturating_add(conn.endpoint.bytes_down);
        entry.upload_bytes = entry.upload_bytes.saturating_add(conn.endpoint.bytes_up);
        if outside_mainland {
            entry.overseas_bytes = entry.overseas_bytes.saturating_add(
                conn.endpoint
                    .bytes_down
                    .saturating_add(conn.endpoint.bytes_up),
            );
            entry.overseas_connection_count += 1;
        }
        entry.connection_count += 1;
    }

    let mut app_rows: Vec<_> = apps.into_values().collect();
    app_rows.sort_by_key(|item| std::cmp::Reverse(item.download_bytes + item.upload_bytes));
    for app in &mut app_rows {
        app.current_download_bps = app.download_bytes as f64;
        app.current_upload_bps = app.upload_bytes as f64;
    }

    endpoints.sort_by_key(|item| std::cmp::Reverse(item.bytes_down + item.bytes_up));
    endpoints.truncate(20);

    (app_rows, endpoints, overseas_down, overseas_up)
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::{
        ffi::OsString,
        net::Ipv4Addr,
        os::windows::ffi::OsStringExt,
        ptr::{null_mut, NonNull},
        slice,
    };
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        NetworkManagement::IpHelper::{
            FreeMibTable, GetExtendedTcpTable, GetExtendedUdpTable, GetIfTable2, MIB_IF_TABLE2,
            MIB_TCPTABLE_OWNER_PID, MIB_UDPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_ALL,
            UDP_TABLE_OWNER_PID,
        },
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
    };

    const NO_ERROR: u32 = 0;
    const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
    const AF_INET: u32 = 2;
    const IF_TYPE_SOFTWARE_LOOPBACK: u32 = 24;

    pub fn interface_counters(include_virtual_adapters: bool) -> Result<InterfaceCounters, String> {
        let mut table: *mut MIB_IF_TABLE2 = null_mut();
        let result = unsafe { GetIfTable2(&mut table) };
        if result != NO_ERROR {
            return Err(format!("GetIfTable2 failed with code {result}"));
        }

        let table =
            NonNull::new(table).ok_or_else(|| "GetIfTable2 returned a null table".to_string())?;
        let mut counters = InterfaceCounters::default();

        unsafe {
            let table_ref = table.as_ref();
            let rows =
                slice::from_raw_parts(table_ref.Table.as_ptr(), table_ref.NumEntries as usize);
            for row in rows {
                let description = utf16_to_string(&row.Description);
                let alias = utf16_to_string(&row.Alias);
                if row.Type == IF_TYPE_SOFTWARE_LOOPBACK {
                    continue;
                }
                if !include_virtual_adapters && looks_virtual(&description, &alias) {
                    continue;
                }
                counters.download_total = counters.download_total.saturating_add(row.InOctets);
                counters.upload_total = counters.upload_total.saturating_add(row.OutOctets);
                counters.adapter_count += 1;
            }
            FreeMibTable(table.as_ptr().cast());
        }

        Ok(counters)
    }

    pub fn connections(geo: &GeoResolver) -> Result<Vec<ConnectionInfo>, String> {
        let mut items = tcp4_connections(geo)?;
        items.extend(udp4_connections(geo)?);
        Ok(items)
    }

    fn tcp4_connections(geo: &GeoResolver) -> Result<Vec<ConnectionInfo>, String> {
        let mut size = 0_u32;
        let first = unsafe {
            GetExtendedTcpTable(
                null_mut(),
                &mut size,
                0,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };
        if first != ERROR_INSUFFICIENT_BUFFER && first != NO_ERROR {
            return Err(format!(
                "GetExtendedTcpTable sizing failed with code {first}"
            ));
        }

        let mut buffer = vec![0_u8; size as usize];
        let result = unsafe {
            GetExtendedTcpTable(
                buffer.as_mut_ptr().cast(),
                &mut size,
                0,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            )
        };
        if result != NO_ERROR {
            return Err(format!("GetExtendedTcpTable failed with code {result}"));
        }

        let table = buffer.as_ptr().cast::<MIB_TCPTABLE_OWNER_PID>();
        let mut rows = Vec::new();
        unsafe {
            let count = (*table).dwNumEntries as usize;
            let entries = slice::from_raw_parts((*table).table.as_ptr(), count);
            let mut process_cache = HashMap::new();
            for row in entries {
                let remote_ip = ipv4(row.dwRemoteAddr);
                let remote_port = port(row.dwRemotePort);
                let pid = row.dwOwningPid;
                let (process_name, app_name) = process_cache
                    .entry(pid)
                    .or_insert_with(|| process_names(pid))
                    .clone();
                let geo_info = geo.lookup(&remote_ip);
                let endpoint = RemoteEndpoint {
                    remote_ip: remote_ip.clone(),
                    remote_port: Some(remote_port),
                    host: None,
                    country_code: geo_info.country_code,
                    region_name: geo_info.region_name,
                    geo_class: geo_info.geo_class,
                    bytes_down: 0,
                    bytes_up: 0,
                    confidence: AttributionConfidence::Estimated,
                    app_name: Some(app_name.clone()),
                    pid: Some(pid),
                };
                rows.push(ConnectionInfo {
                    id: format!("tcp-{pid}-{remote_ip}-{remote_port}-{}", row.dwLocalPort),
                    protocol: "TCP".to_string(),
                    local_addr: ipv4(row.dwLocalAddr),
                    local_port: port(row.dwLocalPort),
                    remote_ip,
                    remote_port: Some(remote_port),
                    pid,
                    app_key: app_key(&app_name),
                    process_name,
                    app_name,
                    state: tcp_state(row.dwState),
                    direction: "outbound".to_string(),
                    endpoint,
                    confidence: AttributionConfidence::Estimated,
                });
            }
        }
        Ok(rows)
    }

    fn udp4_connections(geo: &GeoResolver) -> Result<Vec<ConnectionInfo>, String> {
        let mut size = 0_u32;
        let first = unsafe {
            GetExtendedUdpTable(null_mut(), &mut size, 0, AF_INET, UDP_TABLE_OWNER_PID, 0)
        };
        if first != ERROR_INSUFFICIENT_BUFFER && first != NO_ERROR {
            return Err(format!(
                "GetExtendedUdpTable sizing failed with code {first}"
            ));
        }

        let mut buffer = vec![0_u8; size as usize];
        let result = unsafe {
            GetExtendedUdpTable(
                buffer.as_mut_ptr().cast(),
                &mut size,
                0,
                AF_INET,
                UDP_TABLE_OWNER_PID,
                0,
            )
        };
        if result != NO_ERROR {
            return Err(format!("GetExtendedUdpTable failed with code {result}"));
        }

        let table = buffer.as_ptr().cast::<MIB_UDPTABLE_OWNER_PID>();
        let mut rows = Vec::new();
        unsafe {
            let count = (*table).dwNumEntries as usize;
            let entries = slice::from_raw_parts((*table).table.as_ptr(), count);
            let mut process_cache = HashMap::new();
            for row in entries {
                let pid = row.dwOwningPid;
                let (process_name, app_name) = process_cache
                    .entry(pid)
                    .or_insert_with(|| process_names(pid))
                    .clone();
                let geo_info = geo.lookup("");
                let endpoint = RemoteEndpoint {
                    remote_ip: String::new(),
                    remote_port: None,
                    host: None,
                    country_code: geo_info.country_code,
                    region_name: geo_info.region_name,
                    geo_class: geo_info.geo_class,
                    bytes_down: 0,
                    bytes_up: 0,
                    confidence: AttributionConfidence::Unknown,
                    app_name: Some(app_name.clone()),
                    pid: Some(pid),
                };
                rows.push(ConnectionInfo {
                    id: format!("udp-{pid}-{}", row.dwLocalPort),
                    protocol: "UDP".to_string(),
                    local_addr: ipv4(row.dwLocalAddr),
                    local_port: port(row.dwLocalPort),
                    remote_ip: String::new(),
                    remote_port: None,
                    pid,
                    app_key: app_key(&app_name),
                    process_name,
                    app_name,
                    state: "Listening".to_string(),
                    direction: "listening".to_string(),
                    endpoint,
                    confidence: AttributionConfidence::Unknown,
                });
            }
        }
        Ok(rows)
    }

    fn ipv4(value: u32) -> String {
        Ipv4Addr::from(u32::from_be(value)).to_string()
    }

    fn port(value: u32) -> u16 {
        u16::from_be((value & 0xffff) as u16)
    }

    fn tcp_state(value: u32) -> String {
        match value {
            1 => "Closed",
            2 => "Listen",
            3 => "SynSent",
            4 => "SynReceived",
            5 => "Established",
            6 => "FinWait1",
            7 => "FinWait2",
            8 => "CloseWait",
            9 => "Closing",
            10 => "LastAck",
            11 => "TimeWait",
            12 => "DeleteTcb",
            _ => "Unknown",
        }
        .to_string()
    }

    fn process_names(pid: u32) -> (String, String) {
        let process_name = query_process_path(pid)
            .and_then(|path| {
                std::path::Path::new(&path)
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| format!("PID {pid}"));

        let app_name = process_name
            .trim_end_matches(".exe")
            .trim_end_matches(".EXE")
            .to_string();
        (process_name, app_name)
    }

    fn app_key(app_name: &str) -> String {
        app_name.to_ascii_lowercase()
    }

    fn query_process_path(pid: u32) -> Option<String> {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return None;
        }

        let mut buffer = vec![0_u16; 4096];
        let mut size = buffer.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) };
        unsafe {
            CloseHandle(handle);
        }
        if ok == 0 || size == 0 {
            return None;
        }

        Some(
            OsString::from_wide(&buffer[..size as usize])
                .to_string_lossy()
                .to_string(),
        )
    }

    fn utf16_to_string(value: &[u16]) -> String {
        let len = value.iter().position(|ch| *ch == 0).unwrap_or(value.len());
        OsString::from_wide(&value[..len])
            .to_string_lossy()
            .to_string()
    }

    fn looks_virtual(description: &str, alias: &str) -> bool {
        let text = format!("{description} {alias}").to_ascii_lowercase();
        [
            "virtual", "vpn", "loopback", "vmware", "hyper-v", "vbox", "tap", "tunnel",
        ]
        .iter()
        .any(|needle| text.contains(needle))
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    pub fn interface_counters(
        _include_virtual_adapters: bool,
    ) -> Result<InterfaceCounters, String> {
        Ok(InterfaceCounters::default())
    }

    pub fn connections(_geo: &GeoResolver) -> Result<Vec<ConnectionInfo>, String> {
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counter_delta_never_goes_negative() {
        assert_eq!(safe_delta(120, 100), 20);
        assert_eq!(safe_delta(10, 100), 0);
    }
}
