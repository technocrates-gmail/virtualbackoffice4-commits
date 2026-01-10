const CLIENT = "TSN";
const API_URL    = `https://app.vbo.co.in/${CLIENT}/complains`;
const API_MARK   = `https://app.vbo.co.in/${CLIENT}/mark_complain`;
const API_DELETE = `https://app.vbo.co.in/${CLIENT}/delete_complain`;

let rawRows = [];
let filtered = [];
let currentMode = "offline";

const tbody = document.querySelector("#dataTable tbody");
const spinner = document.getElementById("spinnerOverlay");
const toast = document.getElementById("toast");

const globalSearch = document.getElementById("globalSearch");
const powerMin = document.getElementById("powerMin");
const powerMax = document.getElementById("powerMax");
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
    applyAllFilters();
  } catch (err) {
    showToast("Failed to load data");
  } finally {
    hideSpinner();
  }
}

function populateFilters() {
  // PON
  const pons = [...new Set(rawRows.map(r => r.PON || "").filter(Boolean))].sort();
  filterPon.innerHTML = pons.map(p => `<option value="${p}">${p}</option>`).join('');

  // Team (fixed Satyam)
  filterTeam.innerHTML = '<option value="Satyam">Satyam</option>';

  // Mode
  const modes = [...new Set(rawRows.map(r => r.Mode || "").filter(Boolean))].sort();
  filterMode.innerHTML = modes.map(m => `<option value="${m}">${m}</option>`).join('');

  // Status
  const statuses = [...new Set(rawRows.map(r => r["User status"] || "").filter(Boolean))].sort();
  filterStatus.innerHTML = statuses.map(s => `<option value="${s}">${s}</option>`).join('');
}

function applyAllFilters() {
  let data = rawRows.slice();

  // Mode filter
  if (currentMode === "offline") {
    data = data.filter(r => r["User status"] === "DOWN");
  } else if (currentMode === "complains") {
    data = data.filter(r => r.Ticket && r.Ticket.trim() !== "");
  } else if (currentMode === "drops") {
    data = data.filter(r => r.Drops && r.Drops.trim() !== "");
  }

  // Global search
  const term = globalSearch.value.toLowerCase().trim();
  if (term) {
    data = data.filter(r =>
      Object.values(r).some(v => String(v || "").toLowerCase().includes(term))
    );
  }

  // Power range
  const minP = parseFloat(powerMin.value);
  const maxP = parseFloat(powerMax.value);
  if (!isNaN(minP)) data = data.filter(r => r.Power != null && Number(r.Power) >= minP);
  if (!isNaN(maxP)) data = data.filter(r => r.Power != null && Number(r.Power) <= maxP);

  // Dropdown filters
  if (filterPon.value)    data = data.filter(r => r.PON === filterPon.value);
  if (filterTeam.value)   data = data.filter(r => (r.Team || "Satyam") === filterTeam.value);
  if (filterMode.value)   data = data.filter(r => r.Mode === filterMode.value);
  if (filterStatus.value) data = data.filter(r => r["User status"] === filterStatus.value);

  // Drops → sort by timestamp descending (newest first)
  if (currentMode === "drops") {
    data.sort((a, b) => {
      const ta = a.Drops ? new Date(a.Drops).getTime() : 0;
      const tb = b.Drops ? new Date(b.Drops).getTime() : 0;
      return tb - ta;
    });
  }

  filtered = data;
  renderTable();
}

async function postJSON(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(r => r.json());
}

function renderTable() {
  tbody.innerHTML = "";
  filtered.forEach(r => {
    const tr = document.createElement("tr");
    if (r["User status"] === "DOWN") tr.classList.add("offline");
    if (r.Ticket) tr.classList.add("ticket");

    const status = r["User status"] || "";
    let statusHtml = "";
    if (status === "UP")   statusHtml = '<span class="status-indicator status-up"></span>';
    if (status === "DOWN") statusHtml = '<span class="status-indicator status-down"></span>';

    tr.innerHTML = `
      <td>${r.PON || ""}</td>
      <td>${r.Users || ""}</td>
      <td>${r["Last called no"] || ""}</td>
      <td>${r.Name || ""}</td>
      <td>${r.MAC || ""}<br><small>${r.Serial || ""}</small></td>
      <td>${r.Drops || ""}</td>
      <td><input class="remarkInput" value="${r.Remarks || ""}"></td>
      <td>
        <select class="teamSel" disabled>
          <option>Satyam</option>
        </select>
      </td>
      <td>
        <select class="modeSel">
          <option>Manual</option>
          <option>Auto</option>
        </select>
      </td>
      <td>${r.Power != null ? Number(r.Power).toFixed(2) : ""}</td>
      <td>
        <button class="mark-btn"><i class="fas fa-check"></i></button>
        <button class="remove-btn"><i class="fas fa-trash"></i></button>
      </td>
      <td>${r.Location || ""}</td>
      <td>${statusHtml}</td>
    `;

    tr.querySelector(".modeSel").value = r.Mode || "Manual";

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
        showToast("Marked successfully");
        fetchData();
      } catch {
        showToast("Failed to mark");
      }
    };

    tr.querySelector(".remove-btn").onclick = async () => {
      const payload = { /* same as above */ ...payload };
      try {
        await postJSON(API_DELETE, payload);
        showToast("Deleted successfully");
        fetchData();
      } catch {
        showToast("Failed to delete");
      }
    };

    tbody.appendChild(tr);
  });
}

// Events
document.getElementById("btnOffline").onclick   = () => { currentMode = "offline";   applyAllFilters(); };
document.getElementById("btnComplains").onclick = () => { currentMode = "complains"; applyAllFilters(); };
document.getElementById("btnDrops").onclick     = () => { currentMode = "drops";     applyAllFilters(); };

globalSearch.oninput = applyAllFilters;
powerMin.oninput = applyAllFilters;
powerMax.oninput = applyAllFilters;
filterPon.onchange = applyAllFilters;
filterTeam.onchange = applyAllFilters;
filterMode.onchange = applyAllFilters;
filterStatus.onchange = applyAllFilters;

// Screenshot
document.getElementById("btnScreenshot").onclick = async () => {
  showToast("Preparing screenshot...");
  try {
    const el = document.getElementById("tableWrap");
    const originalOverflow = el.style.overflow;
    el.style.overflow = "visible";

    const canvas = await html2canvas(el, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: null
    });

    el.style.overflow = originalOverflow;

    const link = document.createElement("a");
    link.download = `complains-${currentMode}-${new Date().toISOString().slice(0,16)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    showToast("Screenshot saved!");
  } catch (e) {
    showToast("Screenshot failed");
  }
};

// CSV
document.getElementById("btnCsv").onclick = () => {
  if (!filtered.length) return showToast("No data to export");

  const headers = ["PON","User ID","Mobile","Name","Mac","Serial","Down","Remark","Team","Mode","Power","Location","Status"];
  
  const rows = filtered.map(r => [
    r.PON || "",
    r.Users || "",
    r["Last called no"] || "",
    `"${(r.Name || "").replace(/"/g,'""')}"`,
    `"${r.MAC || ""}"`,
    `"${r.Serial || ""}"`,
    r.Drops || "",
    `"${(r.Remarks || "").replace(/"/g,'""')}"`,
    "Satyam",
    r.Mode || "Manual",
    r.Power != null ? Number(r.Power).toFixed(2) : "",
    `"${(r.Location || "").replace(/"/g,'""')}"`,
    r["User status"] || ""
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `filtered-${currentMode}-${new Date().toISOString().slice(0,16)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast("CSV downloaded");
};

// Start
fetchData();
