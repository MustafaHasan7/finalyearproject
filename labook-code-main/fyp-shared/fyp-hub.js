document.addEventListener("DOMContentLoaded", () => initializeHub());

async function initializeHub() {
    const summaryGrid = document.getElementById("hubSummaryGrid");
    const tableBody = document.getElementById("hubTableBody");
    const statusMessage = document.getElementById("hubStatusMessage");
    if (!summaryGrid || !tableBody || !statusMessage) {
        return;
    }

    try {
        const response = await fetch("fyp-registry.json", { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const registry = await response.json();
        renderHubSummary(summaryGrid, registry.summary);
        renderHubTable(tableBody, registry.projects || []);
        statusMessage.textContent = `Registry loaded from Python hub on ${registry.generated_at}.`;
    } catch (error) {
        console.error(error);
        statusMessage.textContent = "Live registry unavailable. Launch the portfolio with run_fyp_hub.ps1 so the page can load the hub status file.";
    }
}

function renderHubSummary(target, summary) {
    const cards = [
        ["Projects", summary.total_projects],
        ["Python-only", summary.python_only_projects],
        ["Local Data Ready", summary.local_data_ready_projects],
        ["Live Outputs Ready", summary.live_output_projects],
    ];
    target.innerHTML = cards.map(([label, value]) => `
        <article class="hub-summary-card">
            <h3>${label}</h3>
            <p>${value}</p>
        </article>
    `).join("");
}

function renderHubTable(target, projects) {
    target.innerHTML = projects.map((project) => {
        const dataStatus = project.local_data_ready ? "ready" : "warn";
        const outputStatus = project.live_output_ready ? "ready" : "warn";
        const runtimeStatus = project.python_only ? "ready" : "warn";
        const links = [
            `<a href="${project.launch_path}">Open project</a>`,
            `<a href="${project.readme_path}">README</a>`,
            `<a href="${project.output_path}">Live JSON</a>`,
        ].join("");
        return `
            <tr>
                <td><strong>${project.chapter_label}</strong><br>${project.title}</td>
                <td><span class="hub-pill ${runtimeStatus}">${project.python_only ? "Python only" : "Check runtime"}</span></td>
                <td><span class="hub-pill ${dataStatus}">${project.local_data_ready ? `${project.dataset_count} dataset(s)` : "Data missing"}</span></td>
                <td><span class="hub-pill ${outputStatus}">${project.live_output_ready ? "Live output ready" : "Run backend"}</span></td>
                <td>${project.generated_at || "Not generated yet"}</td>
                <td>${(project.datasets || []).join(", ") || "No local datasets found"}</td>
                <td><div class="hub-link-group">${links}</div></td>
            </tr>
        `;
    }).join("");
}
