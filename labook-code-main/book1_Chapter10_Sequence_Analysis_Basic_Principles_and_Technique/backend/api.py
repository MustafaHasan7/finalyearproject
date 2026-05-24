"""FastAPI server for ch10 session-sequence assignment studio.

Mirrors runManualSequenceAssignment(): position-wise mismatch count between
the user-supplied action sequence and each cluster's prototype_sequence
(padded with "END" on either side).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_SHARED = _PROJECT_ROOT.parent / "fyp-shared" / "python"
if str(_SHARED) not in sys.path:
    sys.path.insert(0, str(_SHARED))

from fyp_shared.api import create_app, parse_sequence  # noqa: E402

_DASHBOARD_PATH = _PROJECT_ROOT / "outputs" / "backend" / "dashboard.json"


def _load() -> Dict[str, Any]:
    if not _DASHBOARD_PATH.exists():
        raise RuntimeError(f"{_DASHBOARD_PATH} missing; run run/run_pipeline.ps1 first.")
    return json.loads(_DASHBOARD_PATH.read_text(encoding="utf-8"))


_DASHBOARD = _load()
_MANUAL = _DASHBOARD.get("manual_demo") or {}
_CLUSTER_PROFILES: List[Dict[str, Any]] = list(_DASHBOARD.get("cluster_profiles") or [])
_ACTION_CATALOGUE: List[str] = list(_DASHBOARD.get("action_catalogue") or [])
_DEFAULT_SEQUENCE: str = str(_MANUAL.get("default_sequence") or "")
_MAX_LEN: int = int(_MANUAL.get("max_sequence_length", 200))

_SCHEMA = {
    "input_type": "event_sequence",
    "instructions": _MANUAL.get("instructions") or "Enter a comma-separated action sequence.",
    "default_sequence": _DEFAULT_SEQUENCE,
    "action_catalogue": _ACTION_CATALOGUE,
    "max_sequence_length": _MAX_LEN,
    "cluster_count": len(_CLUSTER_PROFILES),
}


def predict(payload: Dict[str, Any]) -> Dict[str, Any]:
    raw = payload.get("sequence")
    if raw is None:
        raise ValueError("payload must include 'sequence' (string or array)")
    actions, unknown = parse_sequence(raw, _ACTION_CATALOGUE, max_length=_MAX_LEN)

    if not actions and not unknown:
        raise ValueError("sequence is empty")

    scored: List[Dict[str, Any]] = []
    for profile in _CLUSTER_PROFILES:
        prototype = list(profile.get("prototype_sequence") or [])
        compared_length = max(len(actions), len(prototype))
        mismatches = 0
        for i in range(compared_length):
            entered = actions[i] if i < len(actions) else "END"
            reference = prototype[i] if i < len(prototype) else "END"
            if entered != reference:
                mismatches += 1
        scored.append({
            "cluster": profile.get("cluster"),
            "distance": mismatches,
            "prototype": [p for p in prototype if p != "END"],
            "top_actions": profile.get("top_actions") or [],
            "median_length": profile.get("median_length"),
        })
    scored.sort(key=lambda r: r["distance"])
    best = scored[0] if scored else {}
    return {
        "prediction": {
            "cluster": best.get("cluster"),
            "mismatches": best.get("distance"),
            "median_length": best.get("median_length"),
            "top_actions": best.get("top_actions"),
            "prototype": best.get("prototype"),
        },
        "scores": scored,
        "sequence_length": len(actions),
        "unknown_tokens": unknown,
        "echo": {"sequence": actions},
    }


app = create_app(
    title="ch10 Sequence Studio",
    predict_fn=predict,
    schema_dict=_SCHEMA,
)
