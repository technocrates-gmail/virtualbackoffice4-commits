const baseUrl = "https://app.vbo.co.in";
let currentWindow = "TSN";
let rawRows = [];
let filtered = [];
let currentMode = "all";
let currentView = "cards"; // Default to cards

const cardContainer = document.getElementById("cardView");
const tbody = document.querySelector("#dataTable tbody");
const tableWrap = document.getElementById("tableWrap");
const spinner = document.getElementById("spinnerOverlay");
const toastEl = document.getElementById("toast");

const globalSearch = document.getElementById("globalSearch");
const powerRange = document.getElementById("powerRange");

const filterPon = document.getElementById("filterPon");
const filterTeam = document.getElementById("filterTeam");
const filterMode = document.getElementById("filterMode");
const filterStatus = document.getElementById("filterStatus");

const menuToggle = document.getElementById("menuToggle");
const topMenu = document.getElementById("topMenu");
const userCount = document.getElementById("userCount");
const btnToggleView = document.getElementById("btnToggleView");

let isComplainsView = false;

/* ===============================
   ✅ PON Excel-style multi select
================================= */
const ponMultiWrap = document.getElementById("ponMultiWrap");
const ponMultiBtn = document.getElementById("ponMultiBtn");
const ponMultiDropdown = document.getElementById("ponMultiDropdown");
const ponMultiList = document.getElementById("ponMultiList");
const ponMultiSearchInput = document.getElementById("ponMultiSearchInput");
const ponClearBtn = document.getElementById("ponClearBtn");
const ponOkBtn = document.getElementById("ponOkBtn");
let selectedPonsSet = new Set();

/* ===============================
   ✅ Modal (Popup)
================================= */
const complaintModal = document.getElementById("complaintModal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalCloseBtn = document.getElementById("modalCloseBtn");

/* ===============================
   ✅ Toast + Spinner
================================= */
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3000);
}
function showSpinner() { spinner.style.display = "flex"; }
function hideSpinner() { spinner.style.display = "none"; }

/* ✅ Smooth fadeout removal */
function fadeOutAndRemove(el) {
  if (!el) return;
  el.classList.add("fade-remove");
  setTimeout(() => {
    el.remove();

    // update counter without reloading
    const cardCount = document.querySelectorAll(".complaint-card").length;
    const rowCount = document.querySelectorAll("#dataTable tbody tr").length;
    const count = currentView === "cards" ? cardCount : rowCount;

    const txt = userCount.textContent || "";
    const ts = txt.includes(")") ? txt.split(")").slice(1).join(")").trim() : "";
    userCount.textContent = ts ? `(${count}) ${ts}` : `(${count})`;
  }, 450);
}

/* ===============================
   ✅ API Fetchers
================================= */
async function fetchWindowData(windowName) {
  const url = `${baseUrl}/${windowName}/complains`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.rows || []).map(row => ({ ...row, _runtime_timestamp: data.runtime_timestamp || "" }));
  } catch (err) {
    showToast(`Failed to load ${windowName}`);
    return [];
  }
}

async function fetchOpenComplaintUsers(windowName) {
  const url = `${baseUrl}/${windowName}/heroesocr_latest?limit=5000`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows = data.rows || [];

    const latestMap = {};
    rows.forEach(r => {
      const uid = String(r.user_id || "").trim().toLowerCase();
      if (!uid) return;

      const currTs = new Date(r.created_at || 0).getTime();
      const prev = latestMap[uid];
      const prevTs = prev ? new Date(prev.created_at || 0).getTime() : -1;

      if (!prev || currTs >= prevTs) {
        latestMap[uid] = r;
      }
    });

    const openRows = Object.values(latestMap).filter(r =>
      String(r.status || "").toLowerCase() === "open"
    );

    return openRows;

  } catch (err) {
    showToast(`Failed to load Open Complains ${windowName}`);
    return [];
  }
}

/* ===============================
   ✅ Helpers
================================= */
function setHeadingCountAndTimestamp(count, runtimeTs) {
  if (runtimeTs) userCount.textContent = `(${count}) ${runtimeTs}`;
  else userCount.textContent = `(${count})`;
}

function safeParseDate(s) {
  const d = new Date(s || "");
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function pageOrder(pageId) {
  const p = String(pageId || "").toLowerCase();
  if (p === "repairs") return 1;
  if (p === "installations") return 2;
  if (p === "collections") return 3;
  return 99;
}

function groupTitle(pageId) {
  if (!pageId) return "Others";
  return pageId;
}

function getDefaultTeam(windowName) {
  return "Satyam";
}

/* ===============================
   ✅ PON Dropdown logic
================================= */
function updatePonButtonText() {
  const cnt = selectedPonsSet.size;
  if (!ponMultiBtn) return;
  if (cnt === 0) ponMultiBtn.textContent = "All PON";
  else ponMultiBtn.textContent = `PON (${cnt} selected)`;
}

if (ponMultiBtn && ponMultiDropdown) {
  ponMultiBtn.onclick = () => {
    ponMultiDropdown.classList.toggle("show");
    if (ponMultiSearchInput) ponMultiSearchInput.value = "";
  };

  document.addEventListener("click", (e) => {
    if (ponMultiWrap && !ponMultiWrap.contains(e.target)) {
      ponMultiDropdown.classList.remove("show");
    }
  });
}

if (ponMultiList) {
  ponMultiList.onclick = (e) => {
    const item = e.target.closest(".ponItem");
    if (!item) return;

    const pon = item.getAttribute("data-pon");
    const cb = item.querySelector("input[type='checkbox']");
    cb.checked = !cb.checked;

    if (cb.checked) selectedPonsSet.add(pon);
    else selectedPonsSet.delete(pon);

    updatePonButtonText();
  };
}

if (ponMultiSearchInput) {
  ponMultiSearchInput.oninput = () => {
    const q = ponMultiSearchInput.value.trim().toLowerCase();
    const items = ponMultiList.querySelectorAll(".ponItem");
    items.forEach(it => {
      const p = (it.getAttribute("data-pon") || "").toLowerCase();
      it.style.display = p.includes(q) ? "flex" : "none";
    });
  };
}

if (ponClearBtn) {
  ponClearBtn.onclick = () => {
    selectedPonsSet.clear();
    if (ponMultiList) {
      ponMultiList.querySelectorAll("input[type='checkbox']").forEach(cb => cb.checked = false);
    }
    updatePonButtonText();
    applyAllFilters();
  };
}

if (ponOkBtn) {
  ponOkBtn.onclick = () => {
    ponMultiDropdown.classList.remove("show");
    applyAllFilters();
  };
}

/* ===============================
   ✅ Modal events
================================= */
if (modalCloseBtn && complaintModal) {
  modalCloseBtn.onclick = () => complaintModal.style.display = "none";
}
if (complaintModal) {
  complaintModal.onclick = (e) => {
    if (e.target === complaintModal) complaintModal.style.display = "none";
  };
}

async function openComplaintPopup(windowName, userId, userName) {
  try {
    showSpinner();
    const url = `${baseUrl}/${windowName}/heroesocr_user_complaints/${encodeURIComponent(userId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    const rows = data.rows || [];

    if (modalTitle) modalTitle.textContent = `${userName || "User"} (${userId}) - Complaints`;

    let html = "";
    if (!rows.length) {
      html = `<div class="modalRow">No complaint history found.</div>`;
    } else {
      const latest = rows[0];

      html += `
        <div class="modalEntry">
          <div class="modalRow"><b>Status:</b> ${latest.status || ""}</div>
          <div class="modalRow"><b>Page:</b> ${latest.page_id || ""}</div>
          <div class="modalRow"><b>Reason:</b> ${latest.reason || ""}</div>
          <div class="modalRow"><b>Created:</b> ${latest.created_at || ""}</div>
          <div class="modalRow"><b>Team:</b> ${latest.Team || ""}</div>
          <div class="modalRow"><b>Mode:</b> ${latest.Mode || ""}</div>
          <div class="modalRow"><b>Power:</b> ${latest.Power ?? ""}</div>
          <div class="modalRow"><b>Phone:</b> ${latest.Phone || ""}</div>
          <div class="modalRow"><b>PON:</b> ${latest.pon || ""}</div>
          <div class="modalRow"><b>Drops:</b> ${latest.drops || ""}</div>
          <div class="modalRow"><b>Down Time:</b> ${latest.down_time || ""}</div>
          <div class="modalRow"><b>Down List:</b> ${latest.down_list || ""}</div>
          <div class="modalRow"><b>StatusUpDown:</b> ${latest.statusUpDown || ""}</div>
        </div>
      `;

      html += `<div style="font-weight:800;margin-top:10px;">History</div>`;

      rows.forEach((r, idx) => {
        html += `
          <div class="modalEntry">
            <div class="modalRow"><b>#</b> ${idx + 1}</div>
            <div class="modalRow"><b>Status:</b> ${r.status || ""}</div>
            <div class="modalRow"><b>Page:</b> ${r.page_id || ""}</div>
            <div class="modalRow"><b>Reason:</b> ${r.reason || ""}</div>
            <div class="modalRow"><b>Created:</b> ${r.created_at || ""}</div>
            <div class="modalRow"><b>Team:</b> ${r.Team || ""}</div>
            <div class="modalRow"><b>Mode:</b> ${r.Mode || ""}</div>
          </div>
        `;
      });
    }

    if (modalBody) modalBody.innerHTML = html;
    if (complaintModal) complaintModal.style.display = "flex";

  } catch (e) {
    showToast("Popup load failed");
  } finally {
    hideSpinner();
  }
}

/* ===============================
   ✅ Main Load
================================= */
async function fetchData() {
  showSpinner();
  try {
    rawRows = await fetchWindowData(currentWindow);
    
    showToast(rawRows.length ? `${rawRows.length} users loaded` : "No users found");
    populateFilters();
    applyAllFilters();
  } catch (err) {
    showToast("Load failed");
  } finally {
    hideSpinner();
  }
}

function populateFilters() {
  const pons = [...new Set(rawRows.map(r => r.PON || "").filter(Boolean))].sort();

  // ✅ fill PON checkbox dropdown
  if (ponMultiList) {
    ponMultiList.innerHTML = pons.map(p => `
      <div class="ponItem" data-pon="${p}">
        <input type="checkbox" ${selectedPonsSet.has(p) ? "checked" : ""}/>
        <span>${p}</span>
      </div>
    `).join("");
  }
  updatePonButtonText();

  // hide team dropdown
  if (filterTeam) filterTeam.style.display = "none";

  const modes = [...new Set(rawRows.map(r => r.Mode || "").filter(Boolean))].sort();
  filterMode.innerHTML = '<option value="">All Mode</option>' + modes.map(m => `<option value="${m}">${m}</option>`).join('');

  const statuses = [...new Set(rawRows.map(r => r["User status"] || "").filter(Boolean))].sort();
  let html = '<option value="">All Status</option>';
  statuses.forEach(s => html += `<option value="${s}">${s}</option>`);
  filterStatus.innerHTML = html;
}

function applyAllFilters() {
  let data = [...rawRows];

  const term = globalSearch.value.trim().toLowerCase();
  if (term) {
    data = data.filter(r =>
      Object.values(r).some(v => String(v || '').toLowerCase().includes(term))
    );
  }

  // ✅ Power range "26-30" => -26 to -30
  const pr = (powerRange?.value || "").trim();
  if (pr.includes("-")) {
    const parts = pr.split("-").map(x => x.trim()).filter(Boolean);
    if (parts.length === 2) {
      const a = parseFloat(parts[0]);
      const b = parseFloat(parts[1]);
      if (!isNaN(a) && !isNaN(b)) {
        const minAbs = Math.min(a, b);
        const maxAbs = Math.max(a, b);
        const minVal = -maxAbs;
        const maxVal = -minAbs;
        data = data.filter(r => r.Power != null && Number(r.Power) >= minVal && Number(r.Power) <= maxVal);
      }
    }
  }

  // ✅ Multi PON filter
  if (selectedPonsSet.size > 0) {
    data = data.filter(r => selectedPonsSet.has(r.PON));
  }

  if (filterMode.value) data = data.filter(r => r.Mode === filterMode.value);
  if (filterStatus.value) data = data.filter(r => r["User status"] === filterStatus.value);

  filtered = data;

  const runtimeTs = (filtered[0] && filtered[0]._runtime_timestamp) ? filtered[0]._runtime_timestamp : "";
  setHeadingCountAndTimestamp(filtered.length, runtimeTs);

  if (currentView === "cards") renderCards();
  else renderTable();
}

/* ===============================
   ✅ Cards Render
================================= */
function renderCards() {
  cardContainer.innerHTML = "";
  tableWrap.style.display = "none";

  if (!filtered.length) {
    cardContainer.style.display = "grid";
    cardContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">No users found</div>';
    return;
  }

  const hasSections = filtered.some(r => r._page_id);
  if (!hasSections) {
    cardContainer.style.display = "grid";
    filtered.forEach((r, index) => renderSingleCard(r, index, cardContainer));
    return;
  }

  cardContainer.style.display = "block";

  const groups = {};
  filtered.forEach(r => {
    const key = r._page_id || "Others";
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  const groupKeys = Object.keys(groups).sort((a, b) => pageOrder(a) - pageOrder(b));

  groupKeys.forEach(gk => {
    groups[gk].sort((a, b) => safeParseDate(b._created_at) - safeParseDate(a._created_at));

    const section = document.createElement("div");
    section.className = "sectionWrap";

    const head = document.createElement("div");
    head.className = "sectionHead";
    head.innerHTML = `${groupTitle(gk)} <span class="secCount">(${groups[gk].length})</span>`;
    section.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "sectionGrid";
    section.appendChild(grid);

    groups[gk].forEach((r, idx) => renderSingleCard(r, idx, grid));
    cardContainer.appendChild(section);
  });
}

function renderSingleCard(r, index, container) {
  const card = document.createElement("div");
  card.className = "complaint-card";

  // ✅ status-based colors
  if (r["User status"] === "DOWN") {
    card.classList.add("card-complain");
  } else if (r["User status"] === "UP") {
    if (r._complain_open) card.classList.add("card-blink");
    else card.classList.add("card-online");
  } else {
    card.classList.add("card-offline");
  }

  const statusEmoji = r["User status"] === "UP" ? '📶' : r["User status"] === "DOWN" ? '📵' : '💀';

  card.innerHTML = `
      <div class="card-header">
        ${r.Name || "Unknown"} <span>${statusEmoji}</span>
      </div>
      <div class="card-row"><span class="card-label">User ID:</span><span class="card-value">${r.Users || ""}</span></div>
      <div class="card-row"><span class="card-label">Mobile:</span><span class="card-value">${r["Last called no"] || ""}</span></div>
      <div class="card-row"><span class="card-label">PON:</span><span class="card-value">${r.PON || ""}</span></div>
      <div class="card-row"><span class="card-label">Location:</span><span class="card-value">${r.Location || ""}</span></div>
      <div class="card-row"><span class="card-label">Power:</span><span class="card-value">${r.Power?.toFixed(2) || ""}</span></div>
      <div class="card-row"><span class="card-label">Down:</span><span class="card-value">${r.Drops || ""}</span></div>
      <div class="card-row"><span class="card-label">MAC / Serial:</span><span class="card-value">${r.MAC || ""} / ${r.Serial || ""}</span></div>
      <div class="card-row"><span class="card-label">Remark:</span><input class="remarkInput" value="${r.Remarks || ""}"></div>
      <div class="card-row">
        <span class="card-label">Team:</span>
        <select class="teamSel">
          <option>Satyam</option>
        </select>
      </div>
      <div class="card-row">
        <span class="card-label">Mode:</span>
        <select class="modeSel">
          <option>Manual</option><option>Auto</option>
        </select>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:10px;">
      <button class="mark-btn"><i class="fa-solid fa-thumbtack"></i></button>
      <button class="remove-btn"><i class="fa-solid fa-trash"></i></button>

      </div>
    `;

  card.style.cursor = (isComplainsView && r._complain_open) ? "pointer" : "default";
  card.onclick = (e) => {
    if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
    if (!isComplainsView || !r._complain_open) return;
    openComplaintPopup(currentWindow, r.Users || "", r.Name || "");
  };

  const teamSel = card.querySelector(".teamSel");
  teamSel.value = r.Team || getDefaultTeam(currentWindow);

  const modeSel = card.querySelector(".modeSel");
  modeSel.value = r.Mode || "Manual";

  // ✅ MARK: no reload
  card.querySelector(".mark-btn").onclick = async (e) => {
    e.stopPropagation();
    const payload = {
      user_id: r.Users || "",
      name: r.Name || "",
      address: r.Location || "",
      reason: card.querySelector(".remarkInput").value || "",
      Mode: modeSel.value,
      Power: r.Power,
      Phone: r["Last called no"] || "",
      Team: teamSel.value,
      pon: r.PON || "",
      window: currentWindow
    };
    try {
      await fetch(`${baseUrl}/${currentWindow}/mark_complain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      showToast("Marked !");
      fadeOutAndRemove(card);
    } catch {
      showToast("Mark failed");
    }
  };

  // ✅ DELETE: no reload
  card.querySelector(".remove-btn").onclick = async (e) => {
    e.stopPropagation();
    try {
      await fetch(`${baseUrl}/${currentWindow}/delete_complain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: r.Users || "" })
      });
      showToast("Removed !");
      fadeOutAndRemove(card);
    } catch {
      showToast("Delete failed");
    }
  };

  container.appendChild(card);
  setTimeout(() => card.classList.add("visible"), index * 60);
}

/* ===============================
   ✅ Table Render
================================= */
function renderTable() {
  tbody.innerHTML = "";
  cardContainer.style.display = "none";
  tableWrap.style.display = "block";

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:20px;color:var(--text-secondary);">No users found</td></tr>';
    return;
  }

  const tableData = [...filtered];

  if (tableData.some(r => r._page_id)) {
    tableData.sort((a, b) => {
      const po = pageOrder(a._page_id) - pageOrder(b._page_id);
      if (po !== 0) return po;
      return safeParseDate(b._created_at) - safeParseDate(a._created_at);
    });
  }

  let lastGroup = "";

  tableData.forEach(r => {
    if (r._page_id) {
      const grp = r._page_id || "";
      if (grp !== lastGroup) {
        const sep = document.createElement("tr");
        sep.innerHTML = `<td colspan="14" style="font-weight:800;padding:10px;background:#f5f5f5;">${grp}</td>`;
        tbody.appendChild(sep);
        lastGroup = grp;
      }
    }

    const tr = document.createElement("tr");
    const statusEmoji = r["User status"] === "UP" ? '📶' : r["User status"] === "DOWN" ? '📵' : '💀';

    if (r["User status"] === "DOWN") {
      tr.classList.add("ticket");
    } else if (r["User status"] === "UP") {
      if (r._complain_open) tr.classList.add("tr-blink");
      else tr.classList.add("onlineRow");
    } else {
      tr.classList.add("offline");
    }

    tr.innerHTML = `
      <td>${r.PON || ""}</td>
      <td>${r.Users || ""}</td>
      <td>${r["Last called no"] || ""}</td>
      <td>${r.Name || ""}</td>
      <td>${r.MAC || ""}<br><small>${r.Serial || ""}</small></td>
      <td>${r.Drops || ""}</td>
      <td><input class="remarkInput remarkCol" value="${r.Remarks || ""}"></td>
      <td class="teamCol resizableCol">
        <select class="teamSel">
          <option>Satyam</option>
        </select>
      </td>
      <td class="modeCol resizableCol">
        <select class="modeSel">
          <option>Manual</option>
          <option>Auto</option>
        </select>
      </td>
      <td>${r.Power != null ? Number(r.Power).toFixed(2) : ""}</td>
      <td>
<button class="mark-btn"><i class="fa-solid fa-thumbtack"></i></button>

        <button class="remove-btn"><i class="fas fa-trash"></i></button>
      </td>
      <td>${r.Location || ""}</td>
      <td>${statusEmoji}</td>
    `;

    tr.style.cursor = (isComplainsView && r._complain_open) ? "pointer" : "default";
    tr.onclick = (e) => {
      if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
      if (!isComplainsView || !r._complain_open) return;
      openComplaintPopup(currentWindow, r.Users || "", r.Name || "");
    };

    const teamSelect = tr.querySelector(".teamSel");
    teamSelect.value = r.Team || getDefaultTeam(currentWindow);

    const modeSelect = tr.querySelector(".modeSel");
    modeSelect.value = r.Mode || "Manual";

    // MARK: no reload
    tr.querySelector(".mark-btn").onclick = async (e) => {
      e.stopPropagation();
      const payload = {
        user_id: r.Users || "",
        name: r.Name || "",
        address: r.Location || "",
        reason: tr.querySelector(".remarkInput").value || "",
        Mode: modeSelect.value,
        Power: r.Power,
        Phone: r["Last called no"] || "",
        Team: teamSelect.value,
        pon: r.PON || "",
        window: currentWindow
      };
      try {
        await fetch(`${baseUrl}/${currentWindow}/mark_complain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        showToast("Marked !");
        fadeOutAndRemove(tr);
      } catch {
        showToast("Mark failed");
      }
    };

    // DELETE: no reload
    tr.querySelector(".remove-btn").onclick = async (e) => {
      e.stopPropagation();
      try {
        await fetch(`${baseUrl}/${currentWindow}/delete_complain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: r.Users || "" })
        });
        showToast("Removed !");
        fadeOutAndRemove(tr);
      } catch {
        showToast("Delete failed");
      }
    };

    tbody.appendChild(tr);
  });
}

/* ===============================
   ✅ UI events
================================= */
menuToggle.onclick = () => {
  topMenu.classList.toggle("show");
};

document.addEventListener("click", (e) => {
  if (!topMenu.contains(e.target) && !menuToggle.contains(e.target)) {
    topMenu.classList.remove("show");
  }
});

btnToggleView.onclick = () => {
  currentView = currentView === "cards" ? "table" : "cards";
  btnToggleView.textContent = currentView === "cards" ? "Switch to Table" : "Switch to Cards";
  applyAllFilters();
};

// screenshot rule
document.getElementById("btnScreenshot").onclick = () => {
  if (filtered.length > 100) {
    showToast("Too many users for screenshot!");
    return;
  }

  html2canvas(document.getElementById("contentWrap"), {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff"
  }).then(canvas => {
    const link = document.createElement("a");
    link.download = "complain-manager-screenshot.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Screenshot downloaded");
  }).catch(() => showToast("Screenshot failed"));
};

// csv
document.getElementById("btnCsv").onclick = () => {
  if (!filtered.length) {
    showToast("No data to export");
    return;
  }

  const headers = ["PON", "User ID", "Mobile", "Name", "Mac / Serial", "Down", "Remark", "Team", "Mode", "Power", "Location", "Status"];
  const csvContent = [headers.join(","), ...filtered.map(r => [
    r.PON || "",
    r.Users || "",
    r["Last called no"] || "",
    r.Name || "",
    `${r.MAC || ""} / ${r.Serial || ""}`,
    r.Drops || "",
    r.Remarks || "",
    r.Team || getDefaultTeam(currentWindow),
    r.Mode || "Manual",
    r.Power?.toFixed(2) || "",
    r.Location || "",
    r["User status"] || ""
  ].map(v => `"${v}"`).join(","))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = "complain-manager.csv";
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV downloaded");
};

// complains button
document.getElementById("btnComplains").onclick = async () => {
  showSpinner();
  try {
    isComplainsView = true;

    const openComplaints = await fetchOpenComplaintUsers(currentWindow);

    // load normal list
    await fetchData();

    const openMap = {};
    openComplaints.forEach(c => {
      const id = String(c.user_id || "").trim().toLowerCase();
      if (id) openMap[id] = c;
    });

    rawRows = rawRows
      .filter(r => openMap[String(r.Users || "").trim().toLowerCase()])
      .map(r => {
        const c = openMap[String(r.Users || "").trim().toLowerCase()];
        return {
          ...r,
          _complain_open: true,
          _page_id: c.page_id || "Others",
          _created_at: c.created_at || ""
        };
      });

    rawRows.sort((a, b) => {
      const po = pageOrder(a._page_id) - pageOrder(b._page_id);
      if (po !== 0) return po;
      return safeParseDate(b._created_at) - safeParseDate(a._created_at);
    });

    showToast(rawRows.length ? `${rawRows.length} open complains users loaded` : "No open complains found");
    populateFilters();
    applyAllFilters();

  } catch (e) {
    showToast("Failed to load complains");
  } finally {
    hideSpinner();
  }
};

// refresh
document.getElementById("btnRefresh").onclick = () => {
  isComplainsView = false;
  fetchData();
};

// drops button
document.getElementById("btnDrops").onclick = () => {
  currentMode = "drops";
  applyAllFilters();
};

// filter events
globalSearch.oninput = applyAllFilters;
if (powerRange) powerRange.oninput = applyAllFilters;
filterMode.onchange = applyAllFilters;
filterStatus.onchange = applyAllFilters;

// init
fetchData();
