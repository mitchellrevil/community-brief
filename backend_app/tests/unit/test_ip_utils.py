import pytest
from app.utils.ip_utils import normalize_ip


def test_normalize_ipv4_with_port():
    assert normalize_ip("1.2.3.4:12345") == "1.2.3.4"


def test_normalize_ipv6_bracketed_with_port():
    assert normalize_ip("[2001:db8::1]:54321") == "2001:db8::1"


def test_normalize_ipv6_with_zone():
    assert normalize_ip("fe80::1%eth0") == "fe80::1"


def test_normalize_x_forwarded_for_multiple():
    assert normalize_ip("1.2.3.4, 5.6.7.8") == "1.2.3.4"


def test_normalize_none_or_empty():
    assert normalize_ip(None) is None
    assert normalize_ip("") is None


def test_normalize_ip_list_dedupe_and_primary_inclusion():
    from app.utils.ip_utils import normalize_ip_list

    ip_list = ["1.2.3.4:1234", "1.2.3.4", "5.6.7.8"]
    normalized, primary = normalize_ip_list(ip_list, max_entries=10, primary_ip=None)
    assert normalized == ["1.2.3.4", "5.6.7.8"]
    assert primary is None


def test_normalize_ip_list_with_primary_added_and_moved_to_end():
    from app.utils.ip_utils import normalize_ip_list

    ip_list = ["1.2.3.4", "2.3.4.5"]
    normalized, primary = normalize_ip_list(ip_list, max_entries=10, primary_ip="1.2.3.4:5678")
    # primary normalized (already present) should be moved to the end
    assert normalized == ["2.3.4.5", "1.2.3.4"]
    assert primary == "1.2.3.4"


def test_normalize_ip_list_capping():
    from app.utils.ip_utils import normalize_ip_list

    ip_list = [f"10.0.0.{i}" for i in range(1, 15)]
    normalized, primary = normalize_ip_list(ip_list, max_entries=10, primary_ip=None)
    assert len(normalized) == 10
    assert normalized[0] == "10.0.0.5"  # should drop earliest 4
    assert primary is None


def test_normalize_ip_prefix_ipv4():
    from app.utils.ip_utils import normalize_ip_prefix

    assert normalize_ip_prefix("1.2.3.4") == "1.2.3.0/24"


def test_normalize_ip_prefix_ipv6():
    from app.utils.ip_utils import normalize_ip_prefix

    assert normalize_ip_prefix("2001:db8::1") == "2001:db8::/112"