"""
Local strategy registry and cache for xcoin-cli

Stores a lightweight catalog of local projects and optional cached
backtest summaries for offline viewing.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REGISTRY_PATH = Path.home() / ".xcoin" / "strategies.json"


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def load_registry() -> Dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {"strategies": []}
    try:
        with open(REGISTRY_PATH, "r") as f:
            data = json.load(f)
            data.setdefault("strategies", [])
            return data
    except Exception:
        return {"strategies": []}


def save_registry(registry: Dict[str, Any]) -> None:
    _ensure_parent(REGISTRY_PATH)
    tmp = REGISTRY_PATH.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(registry, f, indent=2)
    os.replace(tmp, REGISTRY_PATH)


def _normalize_path(path: Path) -> str:
    return str(Path(path).expanduser().resolve())


def _find_index(registry: Dict[str, Any], *, local_id: Optional[str] = None, remote_id: Optional[str] = None, path: Optional[Path] = None) -> int:
    items: List[Dict[str, Any]] = registry.get("strategies", [])
    for idx, item in enumerate(items):
        if local_id and item.get("localId") == local_id:
            return idx
        if remote_id and item.get("remoteId") == remote_id:
            return idx
        if path and _normalize_path(Path(item.get("path", ""))) == _normalize_path(path):
            return idx
    return -1


def register_or_update_project(
    *,
    path: Path,
    name: Optional[str] = None,
    code: Optional[str] = None,
    remote_id: Optional[str] = None,
    version: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Add or update a project in the local registry.
    Returns the stored entry.
    """
    registry = load_registry()
    idx = _find_index(registry, path=path)
    entry = {
        "localId": _normalize_path(path),
        "name": name,
        "code": code,
        "path": _normalize_path(path),
        "remoteId": remote_id,
        "version": version,
        "tags": tags or [],
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
        "lastDeployedAt": None,
        "cache": {},
    }

    if idx >= 0:
        # Merge
        existing = registry["strategies"][idx]
        existing.update({k: v for k, v in entry.items() if v is not None})
        existing["updatedAt"] = _now_iso()
        entry = existing
    else:
        registry["strategies"].append(entry)

    save_registry(registry)
    return entry


def mark_deployed(path: Path) -> None:
    registry = load_registry()
    idx = _find_index(registry, path=path)
    if idx >= 0:
        registry["strategies"][idx]["lastDeployedAt"] = _now_iso()
        registry["strategies"][idx]["updatedAt"] = _now_iso()
        save_registry(registry)


def remove_project(identifier: str) -> bool:
    """
    Remove a project by localId/remoteId/path.
    Returns True if removed.
    """
    registry = load_registry()
    items = registry.get("strategies", [])
    norm_identifier = _normalize_path(Path(identifier)) if os.path.sep in identifier else identifier
    new_items = []
    removed = False
    for it in items:
        if it.get("localId") == identifier or it.get("remoteId") == identifier or _normalize_path(Path(it.get("path", ""))) == norm_identifier:
            removed = True
            continue
        new_items.append(it)
    if removed:
        registry["strategies"] = new_items
        save_registry(registry)
    return removed


def list_local() -> List[Dict[str, Any]]:
    return load_registry().get("strategies", [])


def find_by_name_or_id(query: str) -> Optional[Dict[str, Any]]:
    query_norm = query.lower()
    for it in list_local():
        if it.get("remoteId") == query or it.get("localId") == query:
            return it
        if (it.get("name") or "").lower() == query_norm or (it.get("code") or "").lower() == query_norm:
            return it
    return None


def update_cache(remote_id: str, *, backtest_summary: Optional[Dict[str, Any]] = None, equity_curve_sample: Optional[List[Dict[str, Any]]] = None) -> None:
    registry = load_registry()
    idx = _find_index(registry, remote_id=remote_id)
    if idx < 0:
        return
    entry = registry["strategies"][idx]
    cache = entry.get("cache", {})
    if backtest_summary is not None:
        cache["backtestSummary"] = backtest_summary
    if equity_curve_sample is not None:
        cache["equityCurveSample"] = equity_curve_sample
    entry["cache"] = cache
    entry["updatedAt"] = _now_iso()
    save_registry(registry)


