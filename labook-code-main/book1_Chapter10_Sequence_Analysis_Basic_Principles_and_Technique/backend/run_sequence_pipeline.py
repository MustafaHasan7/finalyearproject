from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import OneHotEncoder


RSEED = 2026
MAX_SEQUENCE_LENGTH = 49
FINAL_CLUSTER_COUNT = 4


def project_paths() -> dict[str, Path]:
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    data_raw_dir = project_root / "data" / "raw"
    data_processed_dir = project_root / "data" / "processed"
    output_dir = project_root / "outputs" / "backend"
    models_dir = output_dir / "models"

    data_processed_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    models_dir.mkdir(parents=True, exist_ok=True)

    return {
        "project_root": project_root,
        "data_raw_dir": data_raw_dir,
        "data_processed_dir": data_processed_dir,
        "output_dir": output_dir,
        "models_dir": models_dir,
    }


def prepare_events(events: pd.DataFrame) -> pd.DataFrame:
    working = events[["user", "timecreated", "Action"]].copy()
    working["timecreated"] = pd.to_datetime(working["timecreated"])
    working = working.sort_values(["user", "timecreated"]).reset_index(drop=True)
    working["time_gap_seconds"] = (
        working.groupby("user")["timecreated"].diff().dt.total_seconds()
    )
    working["new_session"] = working["time_gap_seconds"].isna() | (working["time_gap_seconds"] > 900)
    working["session_nr"] = working.groupby("user")["new_session"].cumsum().astype(int)
    working["session_id"] = working["user"].astype(str) + "_Session_" + working["session_nr"].astype(str)
    working["position"] = working.groupby("session_id").cumcount() + 1

    session_lengths = working.groupby("session_id")["position"].max().rename("sequence_length")
    working = working.merge(session_lengths.reset_index(), on="session_id", how="left")
    return working


def build_sequence_table(events: pd.DataFrame) -> pd.DataFrame:
    filtered = events[(events["sequence_length"] > 1) & (events["position"] <= MAX_SEQUENCE_LENGTH)].copy()
    sequence_pivot = filtered.pivot_table(
        index=["user", "session_id", "session_nr", "sequence_length"],
        columns="position",
        values="Action",
        aggfunc="first",
    )

    ordered_columns = list(range(1, MAX_SEQUENCE_LENGTH + 1))
    sequence_pivot = sequence_pivot.reindex(columns=ordered_columns)
    sequence_pivot.columns = [f"step_{column}" for column in ordered_columns]
    sequence_pivot = sequence_pivot.fillna("END").reset_index()
    return sequence_pivot


def encode_sequences(sequence_table: pd.DataFrame) -> tuple[np.ndarray, OneHotEncoder, list[str]]:
    step_columns = [column for column in sequence_table.columns if column.startswith("step_")]
    encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    encoded = encoder.fit_transform(sequence_table[step_columns])
    return encoded, encoder, step_columns


def evaluate_cluster_range(encoded: np.ndarray) -> pd.DataFrame:
    rows: list[dict[str, float | int]] = []
    sample_size = min(1500, encoded.shape[0])

    for cluster_count in range(2, 7):
        model = MiniBatchKMeans(n_clusters=cluster_count, random_state=RSEED, batch_size=1024, n_init=10)
        labels = model.fit_predict(encoded)
        score = silhouette_score(encoded, labels, sample_size=sample_size, random_state=RSEED)
        rows.append(
            {
                "clusters": cluster_count,
                "silhouette": round(float(score), 4),
                "inertia": round(float(model.inertia_), 2),
            }
        )

    return pd.DataFrame(rows)


def compute_cluster_profiles(sequence_table: pd.DataFrame, labels: np.ndarray, step_columns: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    working = sequence_table.copy()
    working["cluster"] = labels + 1

    profiles: list[dict[str, object]] = []
    action_frequency_rows: list[dict[str, object]] = []

    for cluster_id in sorted(working["cluster"].unique()):
        cluster_frame = working[working["cluster"] == cluster_id].copy()
        flattened_actions = (
            cluster_frame[step_columns]
            .where(cluster_frame[step_columns] != "END")
            .stack()
            .value_counts()
            .head(6)
        )

        prototype = []
        for column in step_columns[:12]:
            non_end = cluster_frame.loc[cluster_frame[column] != "END", column]
            prototype.append(non_end.mode().iat[0] if not non_end.empty else "END")

        for action_name, count in flattened_actions.items():
            action_frequency_rows.append(
                {
                    "cluster": int(cluster_id),
                    "action": action_name,
                    "count": int(count),
                }
            )

        profiles.append(
            {
                "cluster": int(cluster_id),
                "size": int(len(cluster_frame)),
                "median_length": float(cluster_frame["sequence_length"].median()),
                "mean_length": float(cluster_frame["sequence_length"].mean()),
                "prototype_sequence": prototype,
                "top_actions": flattened_actions.index.tolist(),
            }
        )

    return pd.DataFrame(profiles), pd.DataFrame(action_frequency_rows)


def serialize_encoder(encoder: OneHotEncoder) -> dict[str, object]:
    categories = [list(map(str, category_group)) for category_group in encoder.categories_]
    return {"categories": categories}


def build_dashboard_payload(
    sequence_table: pd.DataFrame,
    validation_metrics: pd.DataFrame,
    cluster_profiles: pd.DataFrame,
    action_frequency: pd.DataFrame,
    encoder: OneHotEncoder,
    step_columns: list[str],
) -> dict[str, object]:
    actions = sorted({action for action in sequence_table[step_columns].stack().unique() if action != "END"})
    samples = (
        sequence_table[["user", "session_id", "sequence_length", "cluster", *step_columns[:10]]]
        .sort_values(["cluster", "sequence_length"], ascending=[True, False])
        .head(180)
        .copy()
    )

    samples["preview_sequence"] = samples[[column for column in step_columns[:10]]].apply(
        lambda row: " -> ".join([value for value in row.tolist() if value != "END"]),
        axis=1,
    )
    samples = samples[["user", "session_id", "cluster", "sequence_length", "preview_sequence"]]

    return {
        "project": {
            "title": "Learning Session Sequence Studio",
            "generated_at": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
            "backend": "Python",
            "source_chapter": "Chapter 10",
            "source_qmd": "ch10-seq.qmd",
            "source_notebook": "ch10-sequence-analysis.ipynb",
        },
        "overview": {
            "total_sessions": int(len(sequence_table)),
            "unique_students": int(sequence_table["user"].nunique()),
            "distinct_actions": int(len(actions)),
            "chosen_clusters": FINAL_CLUSTER_COUNT,
            "median_sequence_length": float(sequence_table["sequence_length"].median()),
        },
        "action_catalogue": actions,
        "validation_metrics": json.loads(validation_metrics.to_json(orient="records")),
        "cluster_profiles": json.loads(cluster_profiles.round(3).to_json(orient="records")),
        "action_frequency": json.loads(action_frequency.to_json(orient="records")),
        "manual_demo": {
            "instructions": "Enter a comma-separated action sequence using the catalogue shown below.",
            "default_sequence": ", ".join(actions[:5]),
            "max_sequence_length": MAX_SEQUENCE_LENGTH,
            "prototype_sequences": {
                str(int(row.cluster)): row.prototype_sequence
                for row in cluster_profiles.itertuples(index=False)
            },
        },
        "sequence_schema": {
            "steps": step_columns,
            "encoder": serialize_encoder(encoder),
        },
        "samples": json.loads(samples.to_json(orient="records")),
    }


def run_pipeline() -> dict[str, object]:
    paths = project_paths()
    events_path = paths["data_raw_dir"] / "Events.xlsx"
    if not events_path.exists():
        raise FileNotFoundError("Expected local Events.xlsx in data/raw before running the backend.")

    events = pd.read_excel(events_path, engine="openpyxl")
    prepared_events = prepare_events(events)
    sequence_table = build_sequence_table(prepared_events)

    encoded, encoder, step_columns = encode_sequences(sequence_table)
    validation_metrics = evaluate_cluster_range(encoded)

    final_model = MiniBatchKMeans(
        n_clusters=FINAL_CLUSTER_COUNT,
        random_state=RSEED,
        batch_size=1024,
        n_init=10,
    )
    sequence_table["cluster"] = final_model.fit_predict(encoded) + 1

    cluster_profiles, action_frequency = compute_cluster_profiles(sequence_table, sequence_table["cluster"].to_numpy() - 1, step_columns)

    prepared_events.to_csv(paths["data_processed_dir"] / "sessionized_events.csv", index=False)
    sequence_table.to_csv(paths["data_processed_dir"] / "session_sequences.csv", index=False)
    validation_metrics.to_csv(paths["output_dir"] / "validation_metrics.csv", index=False)
    cluster_profiles.to_csv(paths["output_dir"] / "cluster_profiles.csv", index=False)
    action_frequency.to_csv(paths["output_dir"] / "cluster_action_frequency.csv", index=False)

    payload = build_dashboard_payload(sequence_table, validation_metrics, cluster_profiles, action_frequency, encoder, step_columns)
    (paths["output_dir"] / "dashboard.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return payload


if __name__ == "__main__":
    dashboard_payload = run_pipeline()
    print(json.dumps(dashboard_payload["overview"], indent=2))