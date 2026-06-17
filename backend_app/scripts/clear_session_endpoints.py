from __future__ import annotations

import re
from collections.abc import Iterable


def _normalize_endpoint(endpoint: str) -> str:
    return endpoint


def filter_endpoints(endpoints: Iterable[str], patterns: Iterable[str]) -> list[str]:
    normalized_patterns = []
    regex_patterns = []

    for pattern in patterns:
        if pattern.startswith("re:"):
            regex_patterns.append(re.compile(pattern[3:]))
        else:
            normalized_patterns.append(_normalize_endpoint(pattern))

    filtered: list[str] = []
    seen: set[str] = set()

    for endpoint in endpoints:
        normalized_endpoint = _normalize_endpoint(endpoint)

        if any(normalized_endpoint.startswith(pattern) for pattern in normalized_patterns):
            continue

        if endpoint.endswith("/me"):
            regex_matched = False
        else:
            regex_matched = any(regex.search(endpoint) for regex in regex_patterns)

        if regex_matched:
            continue

        if endpoint in seen:
            continue

        seen.add(endpoint)
        filtered.append(endpoint)

    return filtered
