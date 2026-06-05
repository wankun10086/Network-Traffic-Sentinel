use crate::models::GeoClass;
use std::{
    fs,
    net::{IpAddr, Ipv4Addr},
    path::PathBuf,
};

#[derive(Debug, Clone)]
pub struct GeoInfo {
    pub country_code: Option<String>,
    pub region_name: String,
    pub geo_class: GeoClass,
}

#[derive(Debug, Clone)]
struct CidrRange {
    network: u32,
    mask: u32,
    country_code: String,
    region_name: String,
    geo_class: GeoClass,
}

#[derive(Debug, Clone)]
pub struct GeoResolver {
    ranges: Vec<CidrRange>,
    label: String,
    loaded: bool,
}

impl GeoResolver {
    pub fn load(path: Option<PathBuf>) -> Self {
        if let Some(path) = path {
            if let Ok(content) = fs::read_to_string(&path) {
                let ranges = parse_ranges(&content);
                if !ranges.is_empty() {
                    return Self {
                        ranges,
                        label: format!("离线前缀库 {}", path.display()),
                        loaded: true,
                    };
                }
            }
        }

        Self {
            ranges: parse_ranges(DEFAULT_RANGES),
            label: "内置开发种子库".to_string(),
            loaded: true,
        }
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    pub fn loaded(&self) -> bool {
        self.loaded
    }

    pub fn lookup(&self, ip: &str) -> GeoInfo {
        let Ok(parsed) = ip.parse::<IpAddr>() else {
            return unknown();
        };

        match parsed {
            IpAddr::V4(ipv4) => self.lookup_v4(ipv4),
            IpAddr::V6(ipv6) => {
                if ipv6.is_loopback()
                    || ipv6.is_unspecified()
                    || ipv6.is_unique_local()
                    || ipv6.is_multicast()
                {
                    private()
                } else {
                    unknown()
                }
            }
        }
    }

    fn lookup_v4(&self, ip: Ipv4Addr) -> GeoInfo {
        if is_private_v4(ip) {
            return private();
        }

        let value = u32::from(ip);
        for range in &self.ranges {
            if value & range.mask == range.network {
                return GeoInfo {
                    country_code: Some(range.country_code.clone()),
                    region_name: range.region_name.clone(),
                    geo_class: range.geo_class.clone(),
                };
            }
        }

        unknown()
    }
}

pub fn is_outside_mainland(class: &GeoClass) -> bool {
    matches!(class, GeoClass::HongKongMacauTaiwan | GeoClass::Overseas)
}

fn parse_ranges(content: &str) -> Vec<CidrRange> {
    content
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }

            let mut parts = line.split(',').map(str::trim);
            let cidr = parts.next()?;
            let country_code = parts.next()?.to_ascii_uppercase();
            let region_name = parts.next()?.to_string();
            parse_cidr(cidr).map(|(network, mask)| CidrRange {
                network,
                mask,
                geo_class: class_for_country(&country_code),
                country_code,
                region_name,
            })
        })
        .collect()
}

fn parse_cidr(input: &str) -> Option<(u32, u32)> {
    let mut parts = input.split('/');
    let ip = parts.next()?.parse::<Ipv4Addr>().ok()?;
    let prefix = parts.next()?.parse::<u32>().ok()?;
    if prefix > 32 {
        return None;
    }
    let mask = if prefix == 0 {
        0
    } else {
        u32::MAX << (32 - prefix)
    };
    Some((u32::from(ip) & mask, mask))
}

fn class_for_country(country_code: &str) -> GeoClass {
    match country_code {
        "CN" => GeoClass::MainlandChina,
        "HK" | "MO" | "TW" => GeoClass::HongKongMacauTaiwan,
        "PRIVATE" => GeoClass::Private,
        _ => GeoClass::Overseas,
    }
}

fn is_private_v4(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_multicast()
        || ip.is_broadcast()
        || ip.octets()[0] == 0
}

fn private() -> GeoInfo {
    GeoInfo {
        country_code: None,
        region_name: "内网".to_string(),
        geo_class: GeoClass::Private,
    }
}

fn unknown() -> GeoInfo {
    GeoInfo {
        country_code: None,
        region_name: "未知".to_string(),
        geo_class: GeoClass::Unknown,
    }
}

const DEFAULT_RANGES: &str = r#"
1.0.1.0/24,CN,中国大陆
1.0.2.0/23,CN,中国大陆
1.1.1.0/24,AU,澳大利亚
8.8.8.0/24,US,美国
20.205.0.0/16,SG,新加坡
114.114.114.0/24,CN,中国大陆
142.250.0.0/15,US,美国
18.162.0.0/15,HK,香港
203.69.0.0/16,TW,台湾
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_private_addresses() {
        let resolver = GeoResolver::load(None);
        assert_eq!(resolver.lookup("192.168.1.1").geo_class, GeoClass::Private);
    }

    #[test]
    fn classifies_seed_mainland_and_overseas() {
        let resolver = GeoResolver::load(None);
        assert_eq!(
            resolver.lookup("114.114.114.114").geo_class,
            GeoClass::MainlandChina
        );
        assert_eq!(resolver.lookup("8.8.8.8").geo_class, GeoClass::Overseas);
    }

    #[test]
    fn treats_hmt_as_outside_mainland() {
        let resolver = GeoResolver::load(None);
        let class = resolver.lookup("18.162.1.1").geo_class;
        assert_eq!(class, GeoClass::HongKongMacauTaiwan);
        assert!(is_outside_mainland(&class));
    }
}
