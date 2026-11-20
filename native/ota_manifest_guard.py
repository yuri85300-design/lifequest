#!/usr/bin/env python3
"""Monotonic, conflict-safe GitHub manifest publishing for all PRIME OTA releases.

Only call after the release asset exists and its test workflow passed. The
manifest is never rewound by a rerun of an earlier workflow.
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
from pathlib import Path

TARGET = "repos/yuri85300-design/lifequest/contents/updates/latest.json"


def gh(*args, data=None, allow_fail=False):
    argv = ["gh", "api", *args]
    result = subprocess.run(argv, input=data, text=True, capture_output=True, check=False)
    if result.returncode and not allow_fail:
        raise RuntimeError("gh api failed: " + result.stderr[-700:])
    return result


def manifest(current):
    return json.loads(base64.b64decode(current["content"]).decode("utf-8"))


def publish(path):
    desired = json.loads(Path(path).read_text(encoding="utf-8"))
    next_code = desired["version_code"]
    if not isinstance(next_code, int) or next_code < 25000:
        raise ValueError("Unexpected version_code")
    if desired.get("schema") != 1 or desired.get("min_shell", 0) < 25004:
        raise ValueError("Unexpected manifest schema or min_shell")
    if not desired.get("sha256") or len(desired["sha256"]) != 64:
        raise ValueError("Missing SHA-256")
    if not desired["url"].startswith(
        f"https://github.com/yuri85300-design/lifequest/releases/download/prime-content-v{desired['version']}/"
    ):
        raise ValueError("Manifest URL does not point to the selected release")

    for attempt in range(7):
        current_resp = gh(TARGET)
        current = json.loads(current_resp.stdout)
        old = manifest(current)
        old_code = int(old.get("version_code", 0))
        if old_code >= next_code:
            print(json.dumps({
                "manifest_guard": "SKIP_NO_DOWNGRADE",
                "published": old_code,
                "candidate": next_code
            }))
            return 0
        payload = base64.b64encode(
            (json.dumps(desired, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        ).decode("ascii")
        update = gh(
            TARGET, "-X", "PUT",
            "-f", f"message=release: PRIME {desired['version']} OTA manifest monotone [skip ci]",
            "-f", f"content={payload}",
            "-f", f"sha={current['sha']}",
            "-f", "branch=main",
            allow_fail=True
        )
        if update.returncode == 0:
            print(json.dumps({
                "manifest_guard": "ADVANCED",
                "old": old_code,
                "new": next_code
            }))
            return 0
        # A concurrent publisher updated this same file. Refetch and retry.
        if attempt == 6:
            raise RuntimeError("Could not atomically advance OTA manifest: " + update.stderr[-700:])
        time.sleep(1 + attempt)
    return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()
    sys.exit(publish(args.manifest))
