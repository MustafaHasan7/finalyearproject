const DASHBOARD_URL = "../outputs/backend/dashboard.json";
const API_PORT = (typeof window !== "undefined" && window.FYP_API_PORT) || 9510;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const COLORS = {
    ink: "#162029",
    muted: "#64727d",
    accent: "#126c76",
    signal: "#c4512f",
    blue: "#4f88a3",
    olive: "#6d8452",
    gold: "#b68a3a",
    violet: "#725f9a",
    grid: "#d9e1e8",
    mutedBar: "#d8e1e7",
};

const CLUSTER_COLORS = [COLORS.accent, COLORS.signal, COLORS.blue, COLORS.olive, COLORS.gold, COLORS.violet];
const PLOTLY_OPTIONS = { responsive: true, displayModeBar: false };
const BASE_LAYOUT = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, Segoe UI, Roboto, Arial, sans-serif", color: COLORS.ink },
};

let dashboardData = null;
let visibleSamples = [];
let manualRequestSeq = 0;

document.addEventListener("DOMContentLoaded", () => {
    initializeDashboard();
});

async function initializeDashboard() {
    setStatus("Loading sequence-analysis artifacts from outputs/backend/dashboard.json...");

    try {
        const response = await fetch(DASHBOARD_URL, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        dashboardData = await response.json();
        visibleSamples = dashboardData.samples || [];

        renderMeta();
        renderOverview();
        renderClusterRibbon();
        renderValidationChart();
        renderClusterSizeChart();
        renderActionSignatureChart();
        renderPrototypeList();
        renderActionCatalogue();
        populateFilters();
        bindFilters();
        bindManualDemo();
        renderSampleTable(visibleSamples);
        runManualSequenceAssignment();
        setStatus("Dashboard loaded from generated backend artifacts.");
    } catch (error) {
        console.error(error);
        setStatus("Backend output is missing. Run python3 backend/run_sequence_pipeline.py, then refresh this page.");
    }
}

function renderMeta() {
    document.getElementById("generatedAt").textContent = `Generated ${dashboardData.project.generated_at}`;
}

function renderOverview() {
    const overview = dashboardData.overview;
    document.getElementById("totalSessions").textContent = formatNumber(overview.total_sessions);
    document.getElementById("uniqueStudents").textContent = formatNumber(overview.unique_students);
    document.getElementById("distinctActions").textContent = formatNumber(overview.distinct_actions);
    document.getElementById("chosenClusters").textContent = formatNumber(overview.chosen_clusters);
    document.getElementById("medianSequenceLength").textContent = Number(overview.median_sequence_length ?? 0).toFixed(1);
}

function renderClusterRibbon() {
    const container = document.getElementById("clusterRibbon");
    container.innerHTML = "";

    for (const [index, profile] of (dashboardData.cluster_profiles || []).entries()) {
        const prototype = cleanPrototype(profile.prototype_sequence);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "cluster-summary";
        card.style.setProperty("--cluster-color", getClusterColor(index));
        card.dataset.cluster = String(profile.cluster);
        card.dataset.prototype = prototype.join(", ");
        card.innerHTML = `
            <span class="cluster-summary-id">Cluster ${escapeHtml(profile.cluster)}</span>
            <strong>${formatNumber(profile.size)}</strong>
            <span>${Number(profile.median_length ?? 0).toFixed(1)} median steps</span>
            <small>${escapeHtml((profile.top_actions || []).slice(0, 3).join(" / "))}</small>
        `;
        container.appendChild(card);
    }

    container.addEventListener("click", (event) => {
        const card = event.target.closest("[data-cluster]");
        if (!card) return;
        document.getElementById("clusterFilter").value = card.dataset.cluster;
        applyFilters();
        setManualSequence(card.dataset.prototype || "");
        runManualSequenceAssignment();
        document.querySelector(".manual-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

function renderValidationChart() {
    const metrics = dashboardData.validation_metrics || [];
    Plotly.newPlot("validationChart", [
        {
            type: "scatter",
            mode: "lines+markers",
            x: metrics.map((item) => item.clusters),
            y: metrics.map((item) => item.silhouette),
            line: { color: COLORS.accent, width: 3 },
            marker: { color: COLORS.signal, size: 10, line: { color: "#fff", width: 2 } },
            hovertemplate: "k=%{x}<br>Silhouette=%{y:.3f}<extra></extra>",
        },
    ], {
        ...BASE_LAYOUT,
        margin: { t: 10, r: 18, b: 42, l: 50 },
        xaxis: { title: "Clusters", dtick: 1, gridcolor: COLORS.grid, zeroline: false },
        yaxis: { title: "Silhouette", gridcolor: COLORS.grid, zeroline: false },
    }, PLOTLY_OPTIONS);
}

function renderClusterSizeChart() {
    const profiles = dashboardData.cluster_profiles || [];
    Plotly.newPlot("clusterSizeChart", [
        {
            type: "bar",
            x: profiles.map((item) => `Cluster ${item.cluster}`),
            y: profiles.map((item) => item.size),
            marker: { color: profiles.map((_, index) => getClusterColor(index)) },
            hovertemplate: "%{x}: %{y:,} sessions<extra></extra>",
        },
    ], {
        ...BASE_LAYOUT,
        margin: { t: 10, r: 18, b: 42, l: 58 },
        yaxis: { title: "Sessions", gridcolor: COLORS.grid, zeroline: false },
    }, PLOTLY_OPTIONS);
}

function renderActionSignatureChart() {
    const rows = dashboardData.action_frequency || [];
    const totals = new Map();
    for (const row of rows) {
        totals.set(row.action, (totals.get(row.action) || 0) + Number(row.count || 0));
    }

    const topActions = [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([action]) => action);
    const profiles = dashboardData.cluster_profiles || [];

    const traces = profiles.map((profile, index) => ({
        type: "bar",
        name: `Cluster ${profile.cluster}`,
        x: topActions,
        y: topActions.map((action) => {
            const match = rows.find((row) => String(row.cluster) === String(profile.cluster) && row.action === action);
            return match ? match.count : 0;
        }),
        marker: { color: getClusterColor(index) },
        hovertemplate: "%{x}<br>%{y:,} actions<extra></extra>",
    }));

    Plotly.newPlot("actionSignatureChart", traces, {
        ...BASE_LAYOUT,
        barmode: "group",
        margin: { t: 10, r: 18, b: 92, l: 58 },
        legend: { orientation: "h", y: 1.12, x: 0 },
        xaxis: { tickangle: -28 },
        yaxis: { title: "Action count", gridcolor: COLORS.grid, zeroline: false },
    }, PLOTLY_OPTIONS);
}

function renderPrototypeList() {
    const container = document.getElementById("prototypeList");
    container.innerHTML = "";

    for (const [index, profile] of (dashboardData.cluster_profiles || []).entries()) {
        const prototype = cleanPrototype(profile.prototype_sequence);
        const topActions = profile.top_actions || [];
        const card = document.createElement("article");
        card.className = "prototype-card";
        card.style.setProperty("--cluster-color", getClusterColor(index));
        card.innerHTML = `
            <div class="prototype-card-header">
                <strong>Cluster ${escapeHtml(profile.cluster)}</strong>
                <span>${formatNumber(profile.size)} sessions</span>
            </div>
            <div class="prototype-meta">
                <span>Median ${Number(profile.median_length ?? 0).toFixed(1)}</span>
                <span>Mean ${Number(profile.mean_length ?? 0).toFixed(1)}</span>
            </div>
            <p>${escapeHtml(prototype.join(" -> ") || "No prototype actions")}</p>
            <div class="mini-chip-row">${topActions.slice(0, 5).map((action) => `<span>${escapeHtml(action)}</span>`).join("")}</div>
        `;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary compact-button";
        button.textContent = "Use Prototype";
        button.dataset.prototype = prototype.join(", ");
        card.appendChild(button);
        container.appendChild(card);
    }

    container.addEventListener("click", (event) => {
        const button = event.target.closest("[data-prototype]");
        if (!button) return;
        setManualSequence(button.dataset.prototype || "");
        runManualSequenceAssignment();
    });
}

function renderActionCatalogue() {
    const container = document.getElementById("actionCatalogue");
    container.innerHTML = "";

    for (const action of dashboardData.action_catalogue || []) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "catalogue-chip";
        chip.textContent = action;
        chip.addEventListener("click", () => appendActionToManualSequence(action));
        container.appendChild(chip);
    }
}

function populateFilters() {
    const clusterFilter = document.getElementById("clusterFilter");
    clusterFilter.innerHTML = '<option value="all">All clusters</option>';

    for (const profile of dashboardData.cluster_profiles || []) {
        const option = document.createElement("option");
        option.value = String(profile.cluster);
        option.textContent = `Cluster ${profile.cluster}`;
        clusterFilter.appendChild(option);
    }
}

function bindFilters() {
    document.getElementById("sessionSearch").addEventListener("input", applyFilters);
    document.getElementById("clusterFilter").addEventListener("change", applyFilters);
}

function applyFilters() {
    const searchValue = document.getElementById("sessionSearch").value.trim().toLowerCase();
    const clusterValue = document.getElementById("clusterFilter").value;

    visibleSamples = (dashboardData.samples || []).filter((sample) => {
        const user = String(sample.user || "").toLowerCase();
        const sessionId = String(sample.session_id || "").toLowerCase();
        const matchesSearch = user.includes(searchValue) || sessionId.includes(searchValue);
        const matchesCluster = clusterValue === "all" || String(sample.cluster) === clusterValue;
        return matchesSearch && matchesCluster;
    });

    renderSampleTable(visibleSamples);
}

function bindManualDemo() {
    const manualSequence = document.getElementById("manualSequence");
    manualSequence.value = dashboardData.manual_demo.default_sequence;

    document.getElementById("manualForm").addEventListener("submit", (event) => {
        event.preventDefault();
        runManualSequenceAssignment();
    });

    document.getElementById("resetSequence").addEventListener("click", () => {
        setManualSequence(dashboardData.manual_demo.default_sequence);
        runManualSequenceAssignment();
    });

    document.getElementById("clearSequence").addEventListener("click", () => {
        setManualSequence("");
        document.getElementById("manualSummary").textContent = "Enter a sequence or click a catalogue action to begin.";
        Plotly.purge("manualDistanceChart");
    });

    manualSequence.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            runManualSequenceAssignment();
        }
    });
}

async function runManualSequenceAssignment() {
    const summary = document.getElementById("manualSummary");
    const sequence = document.getElementById("manualSequence").value.trim();
    if (!sequence) {
        summary.textContent = "Enter a comma-separated Moodle session trace first.";
        Plotly.purge("manualDistanceChart");
        return;
    }

    const requestId = ++manualRequestSeq;
    summary.innerHTML = "<em>Contacting backend API...</em>";
    let payload;
    try {
        const response = await fetch(`${API_BASE}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sequence }),
        });
        payload = await response.json();
        if (!response.ok) {
            summary.innerHTML = `<strong>Backend error (HTTP ${response.status}).</strong><br><small>${escapeHtml(payload.detail || payload.error || "")}</small>`;
            return;
        }
    } catch (error) {
        if (requestId !== manualRequestSeq) return;
        summary.innerHTML = `<strong>Backend unreachable.</strong> Start <code>python3 -m uvicorn backend.api:app --host 127.0.0.1 --port ${API_PORT}</code>.<br><small>${escapeHtml(error.message)}</small>`;
        return;
    }
    if (requestId !== manualRequestSeq) return;

    const best = payload.prediction || {};
    const distances = payload.scores || [];
    const unknown = payload.unknown_tokens || [];
    const unknownLine = unknown.length
        ? `<small class="warning-text">Unknown tokens ignored: ${unknown.map(escapeHtml).join(", ")}</small>`
        : "";

    summary.innerHTML = `
        <div class="result-hero">
            <span>Closest match</span>
            <strong>Cluster ${escapeHtml(best.cluster ?? "--")}</strong>
        </div>
        <div class="result-grid">
            <span><b>${formatNumber(payload.sequence_length ?? 0)}</b> steps entered</span>
            <span><b>${escapeHtml(best.mismatches ?? "--")}</b> prototype mismatches</span>
            <span><b>${Number(best.median_length ?? 0).toFixed(1)}</b> cluster median length</span>
        </div>
        <p>${escapeHtml((best.top_actions || []).join(" / "))}</p>
        <small>${escapeHtml((best.prototype || []).join(" -> "))}</small>
        ${unknownLine}
    `;

    Plotly.newPlot("manualDistanceChart", [
        {
            type: "bar",
            x: distances.map((item) => `Cluster ${item.cluster}`),
            y: distances.map((item) => item.distance),
            marker: {
                color: distances.map((item, index) => index === 0 ? COLORS.accent : COLORS.mutedBar),
            },
            hovertemplate: "%{x}: %{y} mismatches<extra></extra>",
        },
    ], {
        ...BASE_LAYOUT,
        margin: { t: 10, r: 18, b: 42, l: 50 },
        yaxis: { title: "Mismatch Count", gridcolor: COLORS.grid, rangemode: "tozero", zeroline: false },
    }, PLOTLY_OPTIONS);
}

function renderSampleTable(samples) {
    const body = document.getElementById("sampleTableBody");
    body.innerHTML = "";

    const sampleCount = document.getElementById("sampleCount");
    sampleCount.textContent = `Showing ${formatNumber(Math.min(samples.length, 180))} of ${formatNumber((dashboardData.samples || []).length)} sessions`;

    if (!samples.length) {
        const row = document.createElement("tr");
        row.innerHTML = '<td colspan="5" class="empty-cell">No sessions match the current filters.</td>';
        body.appendChild(row);
        return;
    }

    for (const sample of samples.slice(0, 180)) {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHtml(sample.user)}</td>
            <td>${escapeHtml(sample.session_id)}</td>
            <td><span class="cluster-pill">Cluster ${escapeHtml(sample.cluster)}</span></td>
            <td>${escapeHtml(sample.sequence_length)}</td>
            <td>${escapeHtml(sample.preview_sequence)}</td>
        `;
        body.appendChild(row);
    }
}

function appendActionToManualSequence(action) {
    const manualSequence = document.getElementById("manualSequence");
    const current = manualSequence.value.trim();
    manualSequence.value = current ? `${current}, ${action}` : action;
    manualSequence.focus();
}

function setManualSequence(sequence) {
    const manualSequence = document.getElementById("manualSequence");
    manualSequence.value = sequence;
    manualSequence.focus();
}

function setStatus(message) {
    document.getElementById("statusMessage").textContent = message;
}

function cleanPrototype(sequence) {
    return (sequence || []).filter((value) => value !== "END");
}

function getClusterColor(index) {
    return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

function formatNumber(value) {
    return Number(value ?? 0).toLocaleString();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
