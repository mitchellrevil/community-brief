import re
import ipaddress
from typing import Optional

IP_PARSE_ERRORS = (ValueError, TypeError)


def normalize_ip(ip_str: Optional[str]) -> Optional[str]:
    """Normalize an IP string by removing ports and zone identifiers.

    Examples:
      - '1.2.3.4:12345' -> '1.2.3.4'
      - '[2001:db8::1]:12345' -> '2001:db8::1'
      - 'fe80::1%eth0' -> 'fe80::1'
      - '1.2.3.4, 5.6.7.8' -> '1.2.3.4' (first entry)

    Returns None when input is falsy.
    """
    if not ip_str:
        return None

    s = ip_str.strip()

    # If multiple entries (X-Forwarded-For), take first
    if ',' in s:
        s = s.split(',')[0].strip()

    # Bracketed IPv6 with optional port: [ip]:port
    m = re.match(r'^\[(?P<ip>[^]]+)\](?::\d+)?$', s)
    if m:
        s = m.group('ip')

    # Remove trailing port for IPv4-like host:port when port is digits
    if ':' in s and s.count(':') < 2:
        # likely ipv4:port
        host, sep, port = s.rpartition(':')
        if port.isdigit():
            s = host

    # Remove zone identifier like %eth0
    if '%' in s:
        s = s.split('%', 1)[0]

    # Final validation: if it parses as an IP, return canonical form (keep textual)
    try:
        ipaddress.ip_address(s)
        return s
    except IP_PARSE_ERRORS:
        # If not a valid IP after normalization, return cleaned string anyway
        return s


def normalize_ip_prefix(ip_str: Optional[str]) -> Optional[str]:
    """Normalize an IP string and anonymize by trimming the last octet/hextet.

    IPv4: keep /24 (e.g., 1.2.3.4 -> 1.2.3.0/24)
    IPv6: keep /112 (e.g., 2001:db8::1 -> 2001:db8::/112)
    """
    normalized = normalize_ip(ip_str)
    if not normalized:
        return None

    try:
        ip_obj = ipaddress.ip_address(normalized)
        if isinstance(ip_obj, ipaddress.IPv4Address):
            network = ipaddress.ip_network(f"{ip_obj}/24", strict=False)
            return f"{network.network_address}/24"
        network = ipaddress.ip_network(f"{ip_obj}/112", strict=False)
        return f"{network.network_address}/112"
    except IP_PARSE_ERRORS:
        return normalized


def normalize_ip_list(ip_list, max_entries: int = 10, primary_ip: Optional[str] = None):
    """Normalize a list of IP strings, dedupe while preserving order, cap to most recent entries.

    If primary_ip is provided it will be normalized and ensured to be included as the last (most recent)
    entry in the returned list.

    Returns a tuple: (normalized_list, normalized_primary)
    """
    if not ip_list:
        ip_list = []

    normalized = []
    for ip in ip_list:
        n = normalize_ip(ip)
        if n and n not in normalized:
            normalized.append(n)

    # Normalize primary and ensure it is present and most-recent
    norm_primary = normalize_ip(primary_ip) if primary_ip else None
    if norm_primary:
        if norm_primary in normalized:
            # Move existing occurrence to the end (most recent)
            normalized = [x for x in normalized if x != norm_primary] + [norm_primary]
        else:
            normalized.append(norm_primary)

    # Cap to the last `max_entries` items
    if len(normalized) > max_entries:
        normalized = normalized[-max_entries:]

    return normalized, norm_primary
