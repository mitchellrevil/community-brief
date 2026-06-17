from __future__ import annotations

from community_load.openapi import load_schema, write_endpoint_artifacts


def main() -> None:
    json_path, md_path = write_endpoint_artifacts(load_schema())
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()

