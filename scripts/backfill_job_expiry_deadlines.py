"""Backfill immutable expiry deadlines for existing recording jobs.

Run with --apply only after the application and Blob lifecycle policy have been
deployed. Without --apply the command reports what it would change.
"""

from __future__ import annotations

import argparse
import os
from datetime import UTC, datetime, timedelta
from math import ceil
from typing import Any

from azure.cosmos import CosmosClient

RETENTION_DAYS = 30


def parse_created_at(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def apply_expiry_deadline(job: dict[str, Any], now: datetime) -> bool:
    """Set the original 30-day deadline and remaining Cosmos TTL once."""
    if job.get("expires_at") is not None:
        return False

    created_at = parse_created_at(job.get("created_at"))
    if created_at is None:
        return False

    expires_at = created_at + timedelta(days=RETENTION_DAYS)
    job["expires_at"] = expires_at.isoformat()
    job["ttl"] = max(1, ceil((expires_at - now).total_seconds()))
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=os.getenv("AZURE_COSMOS_ENDPOINT"))
    parser.add_argument("--key", default=os.getenv("AZURE_COSMOS_KEY"))
    parser.add_argument("--database", default=os.getenv("AZURE_COSMOS_DB"))
    parser.add_argument("--container", default="voice_jobs")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if not all((args.endpoint, args.key, args.database)):
        parser.error("endpoint, key, and database are required")

    now = datetime.now(UTC)
    with CosmosClient(args.endpoint, credential=args.key) as client:
        container = client.get_database_client(args.database).get_container_client(args.container)
        jobs = container.query_items(
            query="SELECT * FROM c WHERE c.type = 'job' AND NOT IS_DEFINED(c.expires_at)",
            enable_cross_partition_query=True,
        )
        updated = expired = skipped = 0
        for job in jobs:
            if not apply_expiry_deadline(job, now):
                skipped += 1
                continue
            expired += job["ttl"] == 1
            if args.apply:
                container.replace_item(item=job["id"], body=job)
            updated += 1

    action = "updated" if args.apply else "would update"
    print(f"{action} {updated} jobs ({expired} already past deadline; {skipped} skipped)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
