const listEl = document.getElementById("incident-list");
const detailEl = document.getElementById("incident-detail");
const badgeEl = document.getElementById("backend-badge");
const refreshBtn = document.getElementById("refresh-btn");

let selectedId = null;

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function renderIncidentList(incidents) {
  if (!incidents.length) {
    listEl.innerHTML = `<div class="empty-state">No incidents yet. Waiting on collectors…</div>`;
    return;
  }
  listEl.innerHTML = incidents
    .map((inc) => {
      const statusClass = inc.status === "diagnosed" ? "diagnosed" : inc.status === "diagnosing" ? "diagnosing" : "";
      return `
      <div class="incident-card sev-${inc.severity} ${inc.id === selectedId ? "selected" : ""}" data-id="${inc.id}">
        <div class="card-top">
          <span class="sev-pill ${inc.severity}">${inc.severity}</span>
          <span class="status-pill ${statusClass}">${inc.status}</span>
        </div>
        <div class="card-title">${escapeHtml(inc.title)}</div>
        <div class="card-meta">
          <span>${inc.event_count} event${inc.event_count === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>${timeAgo(inc.updated_at)}</span>
        </div>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll(".incident-card").forEach((el) => {
    el.addEventListener("click", () => selectIncident(el.dataset.id));
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

async function selectIncident(id) {
  selectedId = id;
  document.querySelectorAll(".incident-card").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === id);
  });
  detailEl.innerHTML = `<div class="empty-state">Loading…</div>`;
  try {
    const data = await fetchJSON(`/api/incidents/${id}`);
    renderDetail(data);
  } catch (err) {
    detailEl.innerHTML = `<div class="empty-state">Failed to load incident: ${err.message}</div>`;
  }
}

function renderDetail(data) {
  const { incident, events, diagnosis } = data;

  const labelsHtml = Object.entries(incident.labels || {})
    .map(([k, v]) => `<span class="label-chip">${escapeHtml(k)}=${escapeHtml(String(v))}</span>`)
    .join("");

  const eventsHtml = events
    .map(
      (e) => `
      <div class="event-row">
        <span class="event-ts">${new Date(e.timestamp).toLocaleTimeString()}</span>
        <span class="sev-pill ${e.severity}">${e.severity}</span>
        <span class="event-msg">${escapeHtml(e.message)}</span>
      </div>`
    )
    .join("");

  const diagnosisHtml = diagnosis
    ? `
    <div class="diagnosis-box">
      <div class="diagnosis-row">
        <div class="diagnosis-label">Root cause</div>
        <div class="diagnosis-value">${escapeHtml(diagnosis.root_cause)}</div>
      </div>
      <div class="diagnosis-row">
        <div class="diagnosis-label">Suggested fix</div>
        <div class="diagnosis-value">${escapeHtml(diagnosis.suggested_fix)}</div>
      </div>
      <div class="diagnosis-row">
        <div class="diagnosis-label">Reasoning</div>
        <div class="diagnosis-value">${escapeHtml(diagnosis.reasoning)}</div>
      </div>
      <div class="diagnosis-row">
        <div class="diagnosis-label">Confidence — ${Math.round(diagnosis.confidence * 100)}%
          <span class="backend-tag"> · ${diagnosis.backend_used} backend</span>
        </div>
        <div class="confidence-bar-track">
          <div class="confidence-bar-fill" style="width:${diagnosis.confidence * 100}%"></div>
        </div>
      </div>
    </div>`
    : `<div class="empty-state" style="padding:20px 0;">No diagnosis yet.</div>
       <button class="diagnose-btn" id="diagnose-btn">Run AI diagnosis</button>`;

  detailEl.innerHTML = `
    <div class="detail-header">
      <h1 class="detail-title">${escapeHtml(incident.title)}</h1>
      <div class="detail-labels">${labelsHtml}</div>
    </div>

    <div class="section-heading">AI diagnosis</div>
    ${diagnosisHtml}

    <div class="section-heading">Correlated events (${events.length})</div>
    <div class="diagnosis-box" style="padding:0;">${eventsHtml}</div>
  `;

  const btn = document.getElementById("diagnose-btn");
  if (btn) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Diagnosing…";
      try {
        await fetchJSON(`/api/incidents/${incident.id}/diagnose`, { method: "POST" });
        await selectIncident(incident.id);
        await loadIncidents();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Run AI diagnosis";
      }
    });
  }
}

async function loadIncidents() {
  try {
    const incidents = await fetchJSON("/api/incidents");
    renderIncidentList(incidents);
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">Failed to load incidents: ${err.message}</div>`;
  }
}

async function loadHealth() {
  try {
    const health = await fetchJSON("/api/health");
    badgeEl.textContent = `${health.ai_backend} backend`;
  } catch (err) {
    badgeEl.textContent = "offline";
  }
}

refreshBtn.addEventListener("click", () => {
  loadIncidents();
  if (selectedId) selectIncident(selectedId);
});

loadHealth();
loadIncidents();
setInterval(loadIncidents, 10000);
