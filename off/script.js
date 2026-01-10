// script.js

const CLIENT = "TSN";
const API_URL    = `https://app.vbo.co.in/${CLIENT}/complains`;
const API_MARK   = `https://app.vbo.co.in/${CLIENT}/mark_complain`;
const API_DELETE = `https://app.vbo.co.in/${CLIENT}/delete_complain`;

let rawRows = [];
let filtered = [];
let currentMode = "offline";

const tbody   = document.querySelector("#dataTable tbody");
const spinner = document.getElementById("spinnerOverlay");
const toast   = document.getElementById("toast");

const globalSearch = document.getElementById("globalSearch");
const powerMinInput = document.getElementById("powerMin");
const powerMaxInput = document.getElementById("powerMax");
const filterPon = document.getElementById("filterPon");
const filterTeam = document.getElementById("filterTeam");
const filterMode = document.getElementById("filterMode");
const filterStatus = document.getElementById("filterStatus");

function showSpinner() { spinner.style.display = "flex"; }
function hideSpinner() { spinner.style.display = "none"; }

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

async function fetchData() {
  showSpinner();
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    rawRows = data.rows || [];
    populateFilters();
    applyMode();
  } catch (err) {
    showToast("Failed to load data");
  } finally {
    hideSpinner();
  }
}

function populateFilters() {
  // Unique PON
  const pons = [...new Set(rawRows.map(r => r.PON || ""))].sort();
  filterPon.innerHTML = '<option value="">All</option>' + pons.map(p => `<option value="${p}">${p}</option>`).join('');

  // Unique Team (but since only Satyam, perhaps fixed, but populate anyway)
  const teams = [...new Set(rawRows.map(r => r.Team || ""))].sort();
  filterTeam.innerHTML = '<option value="">All</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');

  // Unique Mode
  const modes = [...new Set(rawRows.map(r => r.Mode || ""))].sort();
  filterMode.innerHTML = '<option value="">All</option>' + modes.map(m => `<option value="${m}">${m}</option>`).join('');

  // Unique Status
  const statuses = [...new Set(rawRows.map(r => r["User status"] || ""))].sort();
  filterStatus.innerHTML = '<option value="">All</option>' + statuses.map(s => `<option value="${s}">${s}</option>`).join('');
}

function applyFilters(data) {
  let filteredData = data;

  // Global Search
  const searchTerm = globalSearch.value.toLowerCase().trim();
  if (searchTerm) {
    filteredData = filteredData.filter(r => 
      Object.values(r).some(v => (v || "").toString().toLowerCase().includes(searchTerm))
    );
  }

  // Power Range
  const minPower = parseFloat(powerMinInput.value);
  const maxPower = parseFloat(powerMaxInput.value);
  if (!isNaN(minPower)) {
    filteredData = filteredData.filter(r => (r.Power != null && Number(r.Power) >= minPower));
  }
  if (!isNaN(maxPower)) {
    filteredData = filteredData.filter(r => (r.Power != null && Number(r.Power) <= maxPower));
  }

  // Dropdown Filters
  const ponFilter = filterPon.value;
  if (ponFilter) {
    filteredData = filteredData.filter(r => (r.PON || "") === ponFilter);
  }

  const teamFilter = filterTeam.value;
  if (teamFilter) {
    filteredData = filteredData.filter(r => (r.Team || "") === teamFilter);
  }

  const modeFilter = filterMode.value;
  if (modeFilter) {
    filteredData = filteredData.filter(r => (r.Mode || "") === modeFilter);
  }

  const statusFilter = filterStatus.value;
  if (statusFilter) {
    filteredData = filteredData.filter(r => (r["User status"] || "") === statusFilter);
  }

  return filteredData;
}

function applyMode() {
  let baseFiltered;
  if (currentMode === "offline") {
    baseFiltered = rawRows.filter(r => r["User status"] === "DOWN");
  } else if (currentMode === "complains") {
    baseFiltered = rawRows.filter(r => r.Ticket && r.Ticket !== "");
  } else if (currentMode === "drops") {
    baseFiltered = rawRows.filter(r => r.Drops && r.Drops !== "");
  } else {
    baseFiltered = rawRows.slice();
  }
  filtered = applyFilters(baseFiltered);
  renderTable();
}

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

function renderTable() {
  tbody.innerHTML = "";
  filtered.forEach((r) => {
    const tr = document.createElement("tr");
    if (r["User status"] === "DOWN") tr.classList.add("offline");
    if (r.Ticket) tr.classList.add("ticket");

    const remarkVal = r.Remarks || "";
    const teamVal   = "Satyam"; // Fixed to Satyam
    const modeVal   = r.Mode    || "Manual";

    const status = r["User status"] || "";
    let statusHtml = '';
    if (status === "UP") {
      statusHtml = '<span class="status-indicator status-up"></span> UP';
    } else if (status === "DOWN") {
      statusHtml = '<span class="status-indicator status-down"></span> DOWN';
    } else {
      statusHtml = status;
    }

    tr.innerHTML = `
      <td>${r.PON||""}</td>
      <td>${r.Users||""}</td>
      <td>${r["Last called no"]||""}</td>
      <td>${r.Name||""}</td>
      <td>${r.MAC||""}<br><small>${r.Serial||""}</small></td>
      <td>${r.Drops||""}</td>
      <td><input class="remarkInput" value="${remarkVal}"></td>
      <td>
        <select class="teamSel" disabled>
          <option value="Satyam">Satyam</option>
        </select>
      </td>
      <td>
        <select class="modeSel">
          <option value="Manual">Manual</option>
          <option value="Auto">Auto</option>
        </select>
      </td>
      <td>${r.Power != null ? Number(r.Power).toFixed(2) : ""}</td>
      <td>
        <button class="mark-btn"><i class="fas fa-check"></i></button>
        <button class="remove-btn"><i class="fas fa-trash"></i></button>
      </td>
      <td>${r.Location||""}</td>
      <td>${statusHtml}</td>
    `;

    // Set defaults
    tr.querySelector(".teamSel").value = teamVal;
    tr.querySelector(".modeSel").value = modeVal;

    // Mark button
    tr.querySelector(".mark-btn").onclick = async () => {
      const payload = {
        user_id: r.Users || "",
        name: r.Name || "",
        address: r.Location || "",
        reason: tr.querySelector(".remarkInput").value || "",
        Mode: tr.querySelector(".modeSel").value || "Manual",
        Power: r.Power,
        Phone: r["Last called no"] || "",
        Team: "Satyam",
        pon: r.PON || ""
      };
      try {
        await postJSON(API_MARK, payload);
        showToast("✅ Complaint marked (Open)");
        fetchData(); // Reload after success
      } catch {
        showToast("❌ Failed to mark complain");
      }
    };

    // Delete button
    tr.querySelector(".remove-btn").onclick = async () => {
      const payload = {
        user_id: r.Users || "",
        name: r.Name || "",
        address: r.Location || "",
        reason: tr.querySelector(".remarkInput").value || "",
        Mode: tr.querySelector(".modeSel").value || "Manual",
        Power: r.Power,
        Phone: r["Last called no"] || "",
        Team: "Satyam",
        pon: r.PON || ""
      };
      try {
        await postJSON(API_DELETE, payload);
        showToast("🗑 Complaint closed (Close)");
        fetchData(); // Reload after success
      } catch {
        showToast("❌ Failed to delete complain");
      }
    };

    tbody.appendChild(tr);
  });
}

// Button events
document.getElementById("btnOffline").onclick   = () => { currentMode = "offline";   applyMode(); };
document.getElementById("btnComplains").onclick = () => { currentMode = "complains"; applyMode(); };
document.getElementById("btnDrops").onclick     = () => { currentMode = "drops";     applyMode(); };

// Filter events
globalSearch.oninput = applyMode;
powerMinInput.oninput = applyMode;
powerMaxInput.oninput = applyMode;
filterPon.onchange = applyMode;
filterTeam.onchange = applyMode;
filterMode.onchange = applyMode;
filterStatus.onchange = applyMode;

// Start
fetchData();
