// ===============================
// Power Variance Analysis Page - Fixed PON Filter
// ===============================

const baseUrl = "https://app.vbo.co.in";
let currentWindow = "ALL";

let mode = "power"; // power | event | daywise | eventwise
let viewMode = "cards"; // cards | table

let powerRows = [];
let eventRows = [];

let powerUsers = [];
let eventUsers = [];
let dayWiseUsers = [];
let eventWiseUsers = [];

let filtered = [];

// ✅ Fixed PON Filter Variables
const ponMultiWrap = document.getElementById("ponMultiWrap");
const ponMultiBtn = document.getElementById("ponMultiBtn");
const ponMultiDropdown = document.getElementById("ponMultiDropdown");
const ponMultiList = document.getElementById("ponMultiList");
const ponMultiSearchInput = document.getElementById("ponMultiSearchInput");
const ponClearBtn = document.getElementById("ponClearBtn");
const ponOkBtn = document.getElementById("ponOkBtn");

let selectedPonsSet = new Set();
let allAvailablePons = [];
let isPonFilterActive = false;

const cardContainer = document.getElementById("cardView");
const tbody = document.querySelector("#dataTable tbody");
const tableWrap = document.getElementById("tableWrap");
const spinner = document.getElementById("spinnerOverlay");
const toastEl = document.getElementById("toast");

const menuToggle = document.getElementById("menuToggle");
const topMenu = document.getElementById("topMenu");
const userCount = document.getElementById("userCount");

const btnPowerHistory = document.getElementById("btnPowerHistory");
const btnEventHistory = document.getElementById("btnEventHistory");
const btnDayWise = document.getElementById("btnDayWise");
const btnEventWise = document.getElementById("btnEventWise");
const btnRefresh = document.getElementById("btnRefresh");
const btnToggleView = document.getElementById("btnToggleView");

const powerGapSearch = document.getElementById("powerGapSearch");
const powerKeywordSearch = document.getElementById("powerKeywordSearch");
const eventKeywordSearch = document.getElementById("eventKeywordSearch");
const dayKeywordSearch = document.getElementById("dayKeywordSearch");
const eventWiseKeywordSearch = document.getElementById("eventWiseKeywordSearch");

const filtersPower = document.getElementById("filtersPower");
const filtersEvent = document.getElementById("filtersEvent");
const filtersDay = document.getElementById("filtersDay");
const filtersEventWise = document.getElementById("filtersEventWise");
const filtersPon = document.getElementById("filtersPon");

const thMode = document.getElementById("thMode");

// Modal
const complaintModal = document.getElementById("complaintModal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const btnPopupScreenshot = document.getElementById("btnPopupScreenshot");

// New Modals
const daySelectionModal = document.getElementById("daySelectionModal");
const eventSelectionModal = document.getElementById("eventSelectionModal");
const dayModalCloseBtn = document.getElementById("dayModalCloseBtn");
const eventModalCloseBtn = document.getElementById("eventModalCloseBtn");

// Variables for day/event wise analysis
let selectedDays = 2; // Default 2 days
let selectedEvents = 1; // Default 1 event

// Window list
const WINDOWS = ["TSN"];

// ---------------- Toast + Spinner ----------------
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2500);
}
function showSpinner() { spinner.style.display = "flex"; }
function hideSpinner() { spinner.style.display = "none"; }

function safeParseDate(s) {
  const d = new Date(s || "");
  return isNaN(d.getTime()) ? new Date(0) : d;
}
function norm(s) { return String(s || "").trim().toLowerCase(); }
function setHeadingCount(count) { userCount.textContent = `(${count})`; }

// ---------------- PON Filter Functions ----------------
function extractAllPons(data) {
  const ponSet = new Set();
  data.forEach(u => {
    if (u.pon_number) {
      u.pon_number.split(',').forEach(pon => {
        const cleanPon = pon.trim().toUpperCase();
        if (cleanPon) ponSet.add(cleanPon);
      });
    }
  });
  return Array.from(ponSet).sort();
}

function updatePonButtonText() {
  const count = selectedPonsSet.size;
  if (!ponMultiBtn) return;
  
  if (count === 0) {
    ponMultiBtn.innerHTML = '<i class="fa-solid fa-filter"></i> All PON';
    ponMultiBtn.classList.remove("active");
  } else {
    ponMultiBtn.innerHTML = `<i class="fa-solid fa-filter"></i> PON (${count})`;
    ponMultiBtn.classList.add("active");
  }
}

function populatePonCheckboxes() {
  if (!ponMultiList) return;
  
  ponMultiList.innerHTML = "";
  
  allAvailablePons.forEach(pon => {
    const item = document.createElement("div");
    item.className = "ponItem";
    item.setAttribute("data-pon", pon);
    item.innerHTML = `
      <input type="checkbox" id="pon_${pon}" ${selectedPonsSet.has(pon) ? 'checked' : ''}>
      <span>${pon}</span>
    `;
    ponMultiList.appendChild(item);
  });
}

// ---------------- Mobile friendly menu ----------------
function setupMenu() {
  if (window.innerWidth <= 720) {
    topMenu.classList.add("mobileHidden");
  }
}
setupMenu();

menuToggle.onclick = () => {
  topMenu.classList.toggle("mobileHidden");
};

// ✅ Auto close menu after clicking ONLY buttons (not select)
topMenu.addEventListener("click", (e) => {
  if (window.innerWidth > 720) return;

  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";

  // do NOT close when selecting options
  if (tag === "select" || tag === "option" || tag === "input") {
    return;
  }

  // close only on button clicks
  const btn = e.target.closest("button");
  if (btn) {
    topMenu.classList.add("mobileHidden");
  }
});

// Modal events
if (modalCloseBtn && complaintModal) modalCloseBtn.onclick = () => complaintModal.style.display = "none";
if (complaintModal) {
  complaintModal.onclick = (e) => {
    if (e.target === complaintModal) complaintModal.style.display = "none";
  };
}

// Day Selection Modal events
if (dayModalCloseBtn && daySelectionModal) dayModalCloseBtn.onclick = () => daySelectionModal.style.display = "none";
if (daySelectionModal) {
  daySelectionModal.onclick = (e) => {
    if (e.target === daySelectionModal) daySelectionModal.style.display = "none";
  };
}

// Event Selection Modal events
if (eventModalCloseBtn && eventSelectionModal) eventModalCloseBtn.onclick = () => eventSelectionModal.style.display = "none";
if (eventSelectionModal) {
  eventSelectionModal.onclick = (e) => {
    if (e.target === eventSelectionModal) eventSelectionModal.style.display = "none";
  };
}

// ---------------- PON Filter Event Listeners ----------------
if (ponMultiBtn && ponMultiDropdown) {
  ponMultiBtn.onclick = (e) => {
    e.stopPropagation();
    ponMultiDropdown.classList.toggle("show");
    if (ponMultiSearchInput) {
      ponMultiSearchInput.value = "";
      setTimeout(() => ponMultiSearchInput.focus(), 100);
    }
  };
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (ponMultiWrap && !ponMultiWrap.contains(e.target)) {
    ponMultiDropdown.classList.remove("show");
  }
});

if (ponMultiList) {
  ponMultiList.onclick = (e) => {
    const item = e.target.closest(".ponItem");
    if (!item) return;

    const pon = item.getAttribute("data-pon");
    const cb = item.querySelector("input[type='checkbox']");
    
    if (cb) {
      cb.checked = !cb.checked;
      if (cb.checked) {
        selectedPonsSet.add(pon);
      } else {
        selectedPonsSet.delete(pon);
      }
      updatePonButtonText();
    }
  };
}

if (ponMultiSearchInput) {
  ponMultiSearchInput.oninput = () => {
    const query = ponMultiSearchInput.value.trim().toLowerCase();
    const items = ponMultiList.querySelectorAll(".ponItem");
    
    items.forEach(item => {
      const pon = (item.getAttribute("data-pon") || "").toLowerCase();
      item.style.display = pon.includes(query) ? "flex" : "none";
    });
  };
}

if (ponClearBtn) {
  ponClearBtn.onclick = () => {
    selectedPonsSet.clear();
    isPonFilterActive = false;
    if (ponMultiList) {
      ponMultiList.querySelectorAll("input[type='checkbox']").forEach(cb => {
        cb.checked = false;
      });
    }
    updatePonButtonText();
    applyFilters();
    ponMultiDropdown.classList.remove("show");
    showToast("PON filter cleared");
  };
}

if (ponOkBtn) {
  ponOkBtn.onclick = () => {
    isPonFilterActive = selectedPonsSet.size > 0;
    ponMultiDropdown.classList.remove("show");
    applyFilters();
    showToast(`${selectedPonsSet.size} PON${selectedPonsSet.size !== 1 ? 's' : ''} selected`);
  };
}

// Day selection buttons
document.querySelectorAll('.day-option').forEach(btn => {
  btn.onclick = (e) => {
    selectedDays = parseInt(e.target.getAttribute('data-days'));
    daySelectionModal.style.display = "none";
    showToast(`Day-wise analysis for ${selectedDays} days selected`);
    
    // Load day-wise data
    if (powerRows.length > 0) {
      processDayWiseData();
      applyFilters();
    }
  };
});

// Event selection buttons
document.querySelectorAll('.event-option').forEach(btn => {
  btn.onclick = (e) => {
    selectedEvents = parseInt(e.target.getAttribute('data-events'));
    eventSelectionModal.style.display = "none";
    showToast(`Event-wise analysis for ${selectedEvents} events selected`);
    
    // Load event-wise data
    if (powerRows.length > 0) {
      processEventWiseData();
      applyFilters();
    }
  };
});

// ---------------- Fetchers ----------------
async function fetchWindowPower(windowName) {
  const url = `${baseUrl}/${windowName}/poworlog?limit=5000`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return (data.rows || []).map(r => ({ ...r, _window: windowName }));
  } catch {
    showToast(`Failed to load powerlog ${windowName}`);
    return [];
  }
}

async function fetchWindowEvent(windowName) {
  const url = `${baseUrl}/${windowName}/eventlog?limit=5000`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return (data.rows || []).map(r => ({ ...r, _window: windowName }));
  } catch {
    showToast(`Failed to load eventlog ${windowName}`);
    return [];
  }
}

// ---------------- Grouping ----------------
function groupPowerUsers(rows) {
  const map = {};
  rows.forEach(r => {
    const key = norm(r.user_id || r.mac_address || "");
    if (!key) return;

    if (!map[key]) {
      map[key] = {
        key,
        _window: r._window,
        user_id: r.user_id || "",
        name: r.name || "",
        address: r.address || "",
        primary_phone: r.primary_phone || "",
        mac_address: r.mac_address || "",
        window_name: r.window_name || "",
        pon_number: r.pon_number || "",
        status: r.status || "",
        logs: []
      };
    }
    map[key].logs.push({
      rxPower: (r.rxPower != null ? Number(r.rxPower) : null),
      inserted_at: r.inserted_at || ""
    });
  });

  const out = Object.values(map);

  out.forEach(u => {
    u.logs.sort((a, b) => safeParseDate(a.inserted_at) - safeParseDate(b.inserted_at));
    u.last_ts = u.logs.length ? u.logs[u.logs.length - 1].inserted_at : "";

    // ✅ recent two for gap only
    const n = u.logs.length;
    if (n >= 2 && u.logs[n - 1].rxPower != null && u.logs[n - 2].rxPower != null) {
      u.varGap = Number((u.logs[n - 1].rxPower - u.logs[n - 2].rxPower).toFixed(2));
    } else {
      u.varGap = null;
    }
  });

  out.sort((a, b) => {
    const av = a.varGap == null ? -999 : Math.abs(a.varGap);
    const bv = b.varGap == null ? -999 : Math.abs(b.varGap);
    if (bv !== av) return bv - av;
    return safeParseDate(b.last_ts) - safeParseDate(a.last_ts);
  });

  return out;
}

function groupEventUsers(rows) {
  const map = {};
  rows.forEach(r => {
    const key = norm(r.user_id || r.mac_address || "");
    if (!key) return;

    if (!map[key]) {
      map[key] = {
        key,
        _window: r._window,
        user_id: r.user_id || "",
        name: r.name || "",
        address: r.address || "",
        primary_phone: r.primary_phone || "",
        mac_address: r.mac_address || "",
        window_name: r.window_name || "",
        pon_number: r.pon_number || "",
        status: r.status || "",
        logs: []
      };
    }
    map[key].logs.push({
      downEvent: r.downEvent || "",
      inserted_at: r.inserted_at || ""
    });
  });

  const out = Object.values(map);
  out.forEach(u => {
    u.logs.sort((a, b) => safeParseDate(a.inserted_at) - safeParseDate(b.inserted_at));
    u.last_ts = u.logs.length ? u.logs[u.logs.length - 1].inserted_at : "";
  });

  out.sort((a, b) => safeParseDate(b.last_ts) - safeParseDate(a.last_ts));
  return out;
}

// ---------------- Day Wise Processing ----------------
function processDayWiseData() {
  const dayWiseMap = {};
  
  // Group data by user
  powerRows.forEach(r => {
    const key = norm(r.user_id || r.mac_address || "");
    if (!key) return;

    if (!dayWiseMap[key]) {
      dayWiseMap[key] = {
        key,
        _window: r._window,
        user_id: r.user_id || "",
        name: r.name || "",
        address: r.address || "",
        primary_phone: r.primary_phone || "",
        mac_address: r.mac_address || "",
        window_name: r.window_name || "",
        pon_number: r.pon_number || "",
        status: r.status || "",
        logs: [],
        dayLogs: {} // Store logs by date
      };
    }
    
    const logDate = new Date(r.inserted_at || "");
    if (!isNaN(logDate.getTime())) {
      const dateKey = logDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      if (!dayWiseMap[key].dayLogs[dateKey]) {
        dayWiseMap[key].dayLogs[dateKey] = {
          totalPower: 0,
          count: 0,
          date: dateKey
        };
      }
      
      if (r.rxPower != null) {
        dayWiseMap[key].dayLogs[dateKey].totalPower += Number(r.rxPower);
        dayWiseMap[key].dayLogs[dateKey].count += 1;
      }
    }
    
    // Also keep original logs for spark chart
    dayWiseMap[key].logs.push({
      rxPower: (r.rxPower != null ? Number(r.rxPower) : null),
      inserted_at: r.inserted_at || "",
      date: new Date(r.inserted_at || "")
    });
  });

  const out = Object.values(dayWiseMap);

  out.forEach(u => {
    // Sort logs by date
    u.logs.sort((a, b) => a.date - b.date);
    
    // Process day logs
    const dayEntries = Object.values(u.dayLogs);
    
    // Calculate average power for each day
    dayEntries.forEach(day => {
      if (day.count > 0) {
        day.avgPower = day.totalPower / day.count;
      } else {
        day.avgPower = null;
      }
    });
    
    // Sort day entries by date
    dayEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Get current and previous day power
    if (dayEntries.length >= selectedDays + 1) {
      const currentDay = dayEntries[dayEntries.length - 1];
      const previousDay = dayEntries[dayEntries.length - (selectedDays + 1)];
      
      if (currentDay.avgPower != null && previousDay.avgPower != null) {
        u.currentPower = currentDay.avgPower;
        u.previousPower = previousDay.avgPower;
        u.dayGap = Number((currentDay.avgPower - previousDay.avgPower).toFixed(2));
        u.dayAnalysis = `${selectedDays} day comparison`;
      } else {
        u.currentPower = null;
        u.previousPower = null;
        u.dayGap = null;
        u.dayAnalysis = "Insufficient data";
      }
    } else if (dayEntries.length >= 2) {
      const currentDay = dayEntries[dayEntries.length - 1];
      const previousDay = dayEntries[dayEntries.length - 2];
      
      if (currentDay.avgPower != null && previousDay.avgPower != null) {
        u.currentPower = currentDay.avgPower;
        u.previousPower = previousDay.avgPower;
        u.dayGap = Number((currentDay.avgPower - previousDay.avgPower).toFixed(2));
        u.dayAnalysis = "Last 2 days comparison";
      } else {
        u.currentPower = null;
        u.previousPower = null;
        u.dayGap = null;
        u.dayAnalysis = "Insufficient data";
      }
    } else {
      u.currentPower = null;
      u.previousPower = null;
      u.dayGap = null;
      u.dayAnalysis = "Insufficient data";
    }
    
    u.last_ts = u.logs.length ? u.logs[u.logs.length - 1].inserted_at : "";
  });

  // Sort by absolute day gap
  out.sort((a, b) => {
    const av = a.dayGap == null ? -999 : Math.abs(a.dayGap);
    const bv = b.dayGap == null ? -999 : Math.abs(b.dayGap);
    if (bv !== av) return bv - av;
    return safeParseDate(b.last_ts) - safeParseDate(a.last_ts);
  });

  dayWiseUsers = out;
}

// ---------------- Event Wise Processing ----------------
function processEventWiseData() {
  const eventWiseMap = {};
  
  // Group data by user
  powerRows.forEach(r => {
    const key = norm(r.user_id || r.mac_address || "");
    if (!key) return;

    if (!eventWiseMap[key]) {
      eventWiseMap[key] = {
        key,
        _window: r._window,
        user_id: r.user_id || "",
        name: r.name || "",
        address: r.address || "",
        primary_phone: r.primary_phone || "",
        mac_address: r.mac_address || "",
        window_name: r.window_name || "",
        pon_number: r.pon_number || "",
        status: r.status || "",
        logs: []
      };
    }
    
    eventWiseMap[key].logs.push({
      rxPower: (r.rxPower != null ? Number(r.rxPower) : null),
      inserted_at: r.inserted_at || "",
      date: new Date(r.inserted_at || "")
    });
  });

  const out = Object.values(eventWiseMap);

  out.forEach(u => {
    // Sort logs by date
    u.logs.sort((a, b) => a.date - b.date);
    
    // Filter valid power readings
    const validLogs = u.logs.filter(log => log.rxPower != null);
    
    if (validLogs.length >= selectedEvents + 1) {
      const currentEvent = validLogs[validLogs.length - 1];
      const previousEvent = validLogs[validLogs.length - (selectedEvents + 1)];
      
      u.currentPower = currentEvent.rxPower;
      u.previousPower = previousEvent.rxPower;
      u.eventGap = Number((currentEvent.rxPower - previousEvent.rxPower).toFixed(2));
      u.eventAnalysis = `${selectedEvents} event comparison`;
    } else if (validLogs.length >= 2) {
      const currentEvent = validLogs[validLogs.length - 1];
      const previousEvent = validLogs[validLogs.length - 2];
      
      u.currentPower = currentEvent.rxPower;
      u.previousPower = previousEvent.rxPower;
      u.eventGap = Number((currentEvent.rxPower - previousEvent.rxPower).toFixed(2));
      u.eventAnalysis = "Last 2 events comparison";
    } else {
      u.currentPower = null;
      u.previousPower = null;
      u.eventGap = null;
      u.eventAnalysis = "Insufficient data";
    }
    
    u.last_ts = u.logs.length ? u.logs[u.logs.length - 1].inserted_at : "";
  });

  // Sort by absolute event gap
  out.sort((a, b) => {
    const av = a.eventGap == null ? -999 : Math.abs(a.eventGap);
    const bv = b.eventGap == null ? -999 : Math.abs(b.eventGap);
    if (bv !== av) return bv - av;
    return safeParseDate(b.last_ts) - safeParseDate(a.last_ts);
  });

  eventWiseUsers = out;
}

// ---------------- Render (Cards/Table) ----------------
function render() {
  cardContainer.innerHTML = "";
  tbody.innerHTML = "";

  setHeadingCount(filtered.length);

  // update table column heading
  let columnTitle = "Recent Gap";
  if (mode === "event") columnTitle = "Last Event";
  if (mode === "daywise") columnTitle = `${selectedDays} Day Gap`;
  if (mode === "eventwise") columnTitle = `${selectedEvents} Event Gap`;
  
  thMode.textContent = columnTitle;

  if (!filtered.length) {
    cardContainer.style.display = (viewMode === "cards") ? "grid" : "none";
    tableWrap.style.display = (viewMode === "table") ? "block" : "none";
    if (viewMode === "cards") {
      cardContainer.innerHTML =
        '<div style="text-align:center;padding:20px;color:rgba(229,231,235,.65);font-weight:900;">No users found</div>';
    }
    return;
  }

  if (viewMode === "cards") {
    cardContainer.style.display = "grid";
    tableWrap.style.display = "none";
    renderCards();
  } else {
    cardContainer.style.display = "none";
    tableWrap.style.display = "block";
    renderTable();
  }
}

function renderCards() {
  filtered.forEach(u => {
    const card = document.createElement("div");
    card.className = "complaint-card";

    // ✅ Blink if gap <= -2 for all modes
    if (mode === "power" && u.varGap != null && u.varGap <= -2) {
      card.classList.add("alertBlink");
    } else if (mode === "daywise" && u.dayGap != null && u.dayGap <= -2) {
      card.classList.add("alertBlink");
    } else if (mode === "eventwise" && u.eventGap != null && u.eventGap <= -2) {
      card.classList.add("alertBlink");
    }

    const statusEmoji = String(u.status || "").toUpperCase() === "DOWN" ? "📵" : "📶";

    const title = `
      <div class="card-header">
        ${u.name || "Unknown"} <span>${statusEmoji}</span>
      </div>
    `;

    const head = `
      <div class="card-row"><span class="card-label">Window:</span><span class="card-value">${u._window || u.window_name || ""}</span></div>
      <div class="card-row"><span class="card-label">User ID:</span><span class="card-value">${u.user_id || ""}</span></div>
      <div class="card-row"><span class="card-label">MAC:</span><span class="card-value">${u.mac_address || ""}</span></div>
      <div class="card-row"><span class="card-label">PON:</span><span class="card-value">${u.pon_number || ""}</span></div>
      <div class="card-row"><span class="card-label">Status:</span><span class="card-value">${u.status || ""}</span></div>
    `;

    let mid = "";
    if (mode === "power") {
      const v = (u.varGap == null) ? "N/A" : (u.varGap > 0 ? `+${u.varGap}` : `${u.varGap}`);
      mid += `<div style="margin-top:8px;"><span class="badgeVar">Recent gap: ${v} dBm</span></div>`;
      mid += buildSpark(u.logs);
    } else if (mode === "daywise" && u.dayGap != null) {
      mid += `<div class="power-comparison">
                <div class="comparison-row">
                  <span class="comparison-label">Previous (${selectedDays} days ago):</span>
                  <span class="comparison-value">${u.previousPower.toFixed(2)} dBm</span>
                </div>
                <div class="comparison-row">
                  <span class="comparison-label">Current Power:</span>
                  <span class="comparison-value">${u.currentPower.toFixed(2)} dBm</span>
                </div>
                <div class="comparison-row">
                  <span class="comparison-label">Power Gap:</span>
                  <span class="comparison-value ${u.dayGap >= 0 ? 'gap-positive' : 'gap-negative'}">
                    ${u.dayGap > 0 ? '+' : ''}${u.dayGap} dBm
                  </span>
                </div>
              </div>`;
    } else if (mode === "eventwise" && u.eventGap != null) {
      mid += `<div class="power-comparison">
                <div class="comparison-row">
                  <span class="comparison-label">Previous Event (${selectedEvents} events ago):</span>
                  <span class="comparison-value">${u.previousPower.toFixed(2)} dBm</span>
                </div>
                <div class="comparison-row">
                  <span class="comparison-label">Current Power:</span>
                  <span class="comparison-value">${u.currentPower.toFixed(2)} dBm</span>
                </div>
                <div class="comparison-row">
                  <span class="comparison-label">Power Gap:</span>
                  <span class="comparison-value ${u.eventGap >= 0 ? 'gap-positive' : 'gap-negative'}">
                    ${u.eventGap > 0 ? '+' : ''}${u.eventGap} dBm
                  </span>
                </div>
              </div>`;
    } else {
      // keep last 8 in card, full in popup
      mid += buildEvents(u.logs);
    }

    const actions = `
      <div style="margin-top:10px;">
        <span class="rowLink">Open full record</span>
      </div>
    `;

    card.innerHTML = title + head + mid + actions;

    card.querySelector(".rowLink").onclick = (e) => {
      e.stopPropagation();
      openUserPopup(u);
    };

    cardContainer.appendChild(card);

    if (mode === "power") {
      const canvas = card.querySelector("canvas");
      if (canvas) drawSpark(canvas, u.logs);
    }
  });
}

function renderTable() {
  filtered.forEach(u => {
    const tr = document.createElement("tr");

    const varText = (() => {
      if (mode === "event") {
        const last = u.logs.length ? u.logs[u.logs.length - 1] : null;
        return last ? last.downEvent : "";
      }
      if (mode === "power" && u.varGap != null) {
        return (u.varGap > 0 ? `+${u.varGap}` : `${u.varGap}`) + " dBm";
      }
      if (mode === "daywise" && u.dayGap != null) {
        return (u.dayGap > 0 ? `+${u.dayGap}` : `${u.dayGap}`) + " dBm";
      }
      if (mode === "eventwise" && u.eventGap != null) {
        return (u.eventGap > 0 ? `+${u.eventGap}` : `${u.eventGap}`) + " dBm";
      }
      return "";
    })();

    tr.innerHTML = `
      <td>${u._window || ""}</td>
      <td><span class="rowLink">${u.user_id || ""}</span></td>
      <td>${u.name || ""}</td>
      <td>${u.mac_address || ""}</td>
      <td>${u.pon_number || ""}</td>
      <td>${u.status || ""}</td>
      <td>${varText}</td>
      <td>${u.last_ts || ""}</td>
    `;

    tr.querySelector(".rowLink").onclick = (e) => {
      e.stopPropagation();
      openUserPopup(u);
    };

    tbody.appendChild(tr);
  });
}

function buildSpark(logs) {
  const last = logs.length ? logs[logs.length - 1] : null;
  const first = logs.length ? logs[0] : null;
  return `
    <div class="sparkWrap">
      <div class="sparkMeta">
        <span>${first ? first.inserted_at : ""}</span>
        <span>${last ? last.inserted_at : ""}</span>
      </div>
      <canvas class="sparkCanvas" width="600" height="120"></canvas>
    </div>
  `;
}

function drawSpark(canvas, logs) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const values = logs.map(x => x.rxPower).filter(v => v != null);

  // No enough data
  if (values.length < 2) {
    ctx.font = "22px Arial";
    ctx.fillStyle = "#64748b";
    ctx.fillText("No graph data", 20, 60);
    return;
  }

  // Line color logic (recent two)
  let lineColor = "#2563eb"; // default BLUE

  if (logs.length >= 2) {
    const last = logs[logs.length - 1].rxPower;
    const prev = logs[logs.length - 2].rxPower;

    if (last != null && prev != null) {
      const diff = last - prev;
      if (diff < 0) lineColor = "#dc2626";       // RED (down)
      else if (diff > 0) lineColor = "#16a34a";  // GREEN (up)
    }
  }

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = 10;

  const points = logs
    .filter(x => x.rxPower != null)
    .map((x, i, arr) => {
      const t = i / (arr.length - 1 || 1);
      const xPix = pad + t * (W - pad * 2);
      const v = x.rxPower;
      const yPix = (maxV === minV)
        ? H / 2
        : (H - pad) - ((v - minV) / (maxV - minV)) * (H - pad * 2);

      return { x: xPix, y: yPix };
    });

  // Draw line
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = lineColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Draw points
  ctx.beginPath();
  points.forEach(p => {
    ctx.moveTo(p.x + 3, p.y);
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  });
  ctx.fill();

  // Labels (min/max)
  ctx.font = "20px Arial";
  ctx.fillStyle = "#334155";
  ctx.fillText(`${maxV.toFixed(2)} dBm`, 10, 24);
  ctx.fillText(`${minV.toFixed(2)} dBm`, 10, H - 10);
}

function buildEvents(logs) {
  if (!logs.length) return `<div class="eventList">No events</div>`;
  const lastN = logs.slice(-8).reverse();
  return `
    <div class="eventList">
      ${lastN.map(ev => `
        <div class="eventItem">
          <div>${ev.downEvent || ""}</div>
          <div class="eventTime">${ev.inserted_at || ""}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ---------------- Popup (FULL history) ----------------
function openUserPopup(u) {
  if (modalTitle) modalTitle.textContent = `${u.name || "User"} (${u.user_id || u.mac_address || ""})`;

  let html = `
    <div class="modalEntry">
      <div class="modalRow"><b>Window:</b> ${u._window || u.window_name || ""}</div>
      <div class="modalRow"><b>User ID:</b> ${u.user_id || ""}</div>
      <div class="modalRow"><b>Name:</b> ${u.name || ""}</div>
      <div class="modalRow"><b>Address:</b> ${u.address || ""}</div>
      <div class="modalRow"><b>Primary Phone:</b> ${u.primary_phone || ""}</div>
      <div class="modalRow"><b>MAC:</b> ${u.mac_address || ""}</div>
      <div class="modalRow"><b>PON:</b> ${u.pon_number || ""}</div>
      <div class="modalRow"><b>Status:</b> ${u.status || ""}</div>
    </div>
  `;

  if (mode === "power" || mode === "daywise" || mode === "eventwise") {
    html += `<div style="font-weight:1000;margin-top:10px;">Power History (All)</div>`;
    const list = [...u.logs].reverse(); // newest first
    list.forEach((r, idx) => {
      html += `
        <div class="modalEntry">
          <div class="modalRow"><b>#</b> ${idx + 1}</div>
          <div class="modalRow"><b>rxPower:</b> ${r.rxPower != null ? Number(r.rxPower).toFixed(2) : ""}</div>
          <div class="modalRow"><b>Inserted:</b> ${r.inserted_at || ""}</div>
        </div>
      `;
    });
  } else {
    html += `<div style="font-weight:1000;margin-top:10px;">Event History (All)</div>`;
    const list = [...u.logs].reverse();
    list.forEach((r, idx) => {
      html += `
        <div class="modalEntry">
          <div class="modalRow"><b>#</b> ${idx + 1}</div>
          <div class="modalRow"><b>downEvent:</b> ${r.downEvent || ""}</div>
          <div class="modalRow"><b>Inserted:</b> ${r.inserted_at || ""}</div>
        </div>
      `;
    });
  }

  modalBody.innerHTML = html;
  complaintModal.style.display = "flex";
}

// ---------------- Filters ----------------
function applyFilters() {
  let data = [];
  const gapText = String(powerGapSearch.value || "").trim();
  
  if (mode === "power") {
    data = [...powerUsers];
    const kw = norm(powerKeywordSearch.value || "");

    // keyword filter 3 letters
    if (kw.length >= 3) {
      data = data.filter(u => {
        const blob = [u.user_id, u.name, u.address, u.mac_address].map(norm).join(" | ");
        return blob.includes(kw);
      });
    }

    // gap filter: sign + digit typed
    if (/^[+-]\d/.test(gapText)) {
      data = applyGapFilter(data, gapText, "power");
    }
  } 
  else if (mode === "event") {
    data = [...eventUsers];
    const kw = norm(eventKeywordSearch.value || "");

    if (kw.length >= 3) {
      data = data.filter(u => {
        const blob = [u.user_id, u.name, u.address, u.mac_address].map(norm).join(" | ");
        return blob.includes(kw);
      });
    }
  }
  else if (mode === "daywise") {
    data = [...dayWiseUsers];
    const kw = norm(dayKeywordSearch.value || "");

    if (kw.length >= 3) {
      data = data.filter(u => {
        const blob = [u.user_id, u.name, u.address, u.mac_address].map(norm).join(" | ");
        return blob.includes(kw);
      });
    }

    // gap filter for daywise mode
    if (/^[+-]\d/.test(gapText)) {
      data = applyGapFilter(data, gapText, "daywise");
    }
  }
  else if (mode === "eventwise") {
    data = [...eventWiseUsers];
    const kw = norm(eventWiseKeywordSearch.value || "");

    if (kw.length >= 3) {
      data = data.filter(u => {
        const blob = [u.user_id, u.name, u.address, u.mac_address].map(norm).join(" | ");
        return blob.includes(kw);
      });
    }

    // gap filter for eventwise mode
    if (/^[+-]\d/.test(gapText)) {
      data = applyGapFilter(data, gapText, "eventwise");
    }
  }

  // ✅ Apply PON filter if active
  if (isPonFilterActive && selectedPonsSet.size > 0) {
    data = data.filter(u => {
      const userPons = (u.pon_number || "")
        .toUpperCase()
        .split(',')
        .map(p => p.trim())
        .filter(p => p);
      
      return Array.from(selectedPonsSet).some(selectedPon => 
        userPons.includes(selectedPon)
      );
    });
  }

  filtered = data;
  render();
}

// ---------------- Gap Filter Function ----------------
function applyGapFilter(data, gapText, modeType) {
  const sign = gapText[0];
  const num = parseFloat(gapText.slice(1));
  
  if (isNaN(num)) return data;
  
  if (sign === "+") {
    // decrease >= num -> gap <= -num (power down)
    return data.filter(u => {
      let gap = null;
      
      if (modeType === "power") {
        gap = u.varGap;
      } else if (modeType === "daywise") {
        gap = u.dayGap;
      } else if (modeType === "eventwise") {
        gap = u.eventGap;
      }
      
      return gap != null && gap <= (-num);
    });
  } else if (sign === "-") {
    // increase >= num -> gap >= num (power up)
    return data.filter(u => {
      let gap = null;
      
      if (modeType === "power") {
        gap = u.varGap;
      } else if (modeType === "daywise") {
        gap = u.dayGap;
      } else if (modeType === "eventwise") {
        gap = u.eventGap;
      }
      
      return gap != null && gap >= num;
    });
  }
  
  return data;
}

// ---------------- Buttons / events ----------------
document.getElementById("windowSelect").onchange = (e) => {
  currentWindow = e.target.value;
  loadAll();

  // ✅ optional: auto close after selection
  if (window.innerWidth <= 720) topMenu.classList.add("mobileHidden");
};

btnPowerHistory.onclick = () => {
  mode = "power";
  filtersPower.style.display = "";
  filtersEvent.style.display = "none";
  filtersDay.style.display = "none";
  filtersEventWise.style.display = "none";
  filtersPon.style.display = "";
  
  // Show power gap filter for power mode
  powerGapSearch.style.display = "";
  powerKeywordSearch.style.display = "";
  
  powerGapSearch.value = "";
  powerKeywordSearch.value = "";
  eventKeywordSearch.value = "";
  dayKeywordSearch.value = "";
  eventWiseKeywordSearch.value = "";
  applyFilters();
};

btnEventHistory.onclick = () => {
  mode = "event";
  filtersPower.style.display = "none";
  filtersEvent.style.display = "";
  filtersDay.style.display = "none";
  filtersEventWise.style.display = "none";
  filtersPon.style.display = "";
  
  // Hide power gap filter for event mode
  powerGapSearch.style.display = "none";
  powerKeywordSearch.style.display = "none";
  
  powerGapSearch.value = "";
  powerKeywordSearch.value = "";
  eventKeywordSearch.value = "";
  dayKeywordSearch.value = "";
  eventWiseKeywordSearch.value = "";
  applyFilters();
};

btnDayWise.onclick = () => {
  mode = "daywise";
  filtersPower.style.display = "none";
  filtersEvent.style.display = "none";
  filtersDay.style.display = "";
  filtersEventWise.style.display = "none";
  filtersPon.style.display = "";
  
  // Show power gap filter for daywise mode
  powerGapSearch.style.display = "";
  dayKeywordSearch.style.display = "";
  
  // Clear other search inputs
  powerKeywordSearch.value = "";
  eventKeywordSearch.value = "";
  eventWiseKeywordSearch.value = "";
  
  // Show day selection modal
  daySelectionModal.style.display = "flex";
  
  // If data already loaded, process it
  if (powerRows.length > 0) {
    processDayWiseData();
    applyFilters();
  }
};

btnEventWise.onclick = () => {
  mode = "eventwise";
  filtersPower.style.display = "none";
  filtersEvent.style.display = "none";
  filtersDay.style.display = "none";
  filtersEventWise.style.display = "";
  filtersPon.style.display = "";
  
  // Show power gap filter for eventwise mode
  powerGapSearch.style.display = "";
  eventWiseKeywordSearch.style.display = "";
  
  // Clear other search inputs
  powerKeywordSearch.value = "";
  eventKeywordSearch.value = "";
  dayKeywordSearch.value = "";
  
  // Show event selection modal
  eventSelectionModal.style.display = "flex";
  
  // If data already loaded, process it
  if (powerRows.length > 0) {
    processEventWiseData();
    applyFilters();
  }
};

btnRefresh.onclick = () => loadAll();

// Toggle cards/table
btnToggleView.onclick = () => {
  viewMode = (viewMode === "cards") ? "table" : "cards";
  btnToggleView.innerHTML = (viewMode === "cards")
    ? '<i class="fa-solid fa-table"></i> Table'
    : '<i class="fa-solid fa-grip"></i> Cards';
  
  // ✅ Always show PON filter in both views
  filtersPon.style.display = "";
  
  render();
};

// live search
powerGapSearch.oninput = () => applyFilters();
powerKeywordSearch.oninput = () => {
  const kw = norm(powerKeywordSearch.value || "");
  if (kw.length === 0 || kw.length >= 3) applyFilters();
};
eventKeywordSearch.oninput = () => {
  const kw = norm(eventKeywordSearch.value || "");
  if (kw.length === 0 || kw.length >= 3) applyFilters();
};
dayKeywordSearch.oninput = () => {
  const kw = norm(dayKeywordSearch.value || "");
  if (kw.length === 0 || kw.length >= 3) applyFilters();
};
eventWiseKeywordSearch.oninput = () => {
  const kw = norm(eventWiseKeywordSearch.value || "");
  if (kw.length === 0 || kw.length >= 3) applyFilters();
};

// screenshot
document.getElementById("btnScreenshot").onclick = () => {
  html2canvas(document.getElementById("contentWrap"), {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: null
  }).then(canvas => {
    let modeText = "power-history";
    if (mode === "event") modeText = "event-history";
    if (mode === "daywise") modeText = `day-wise-${selectedDays}days`;
    if (mode === "eventwise") modeText = `event-wise-${selectedEvents}events`;
    
    const link = document.createElement("a");
    link.download = `${modeText}-screenshot.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Screenshot downloaded");
  }).catch(() => showToast("Screenshot failed"));
};

// CSV
document.getElementById("btnCsv").onclick = () => {
  if (!filtered.length) return showToast("No data to export");

  let headers = [];
  let lines = [];

  if (mode === "power") {
    headers = ["Window", "User ID", "Name", "MAC", "PON", "Status", "RecentGap(dBm)", "LastUpdated"];
    lines = filtered.map(u => [
      u._window || "",
      u.user_id || "",
      u.name || "",
      u.mac_address || "",
      u.pon_number || "",
      u.status || "",
      (u.varGap == null ? "" : u.varGap),
      u.last_ts || ""
    ]);
  } else if (mode === "daywise") {
    headers = ["Window", "User ID", "Name", "MAC", "PON", "Status", "PreviousPower", "CurrentPower", `${selectedDays}DayGap(dBm)`, "LastUpdated"];
    lines = filtered.map(u => [
      u._window || "",
      u.user_id || "",
      u.name || "",
      u.mac_address || "",
      u.pon_number || "",
      u.status || "",
      (u.previousPower == null ? "" : u.previousPower.toFixed(2)),
      (u.currentPower == null ? "" : u.currentPower.toFixed(2)),
      (u.dayGap == null ? "" : u.dayGap),
      u.last_ts || ""
    ]);
  } else if (mode === "eventwise") {
    headers = ["Window", "User ID", "Name", "MAC", "PON", "Status", "PreviousPower", "CurrentPower", `${selectedEvents}EventGap(dBm)`, "LastUpdated"];
    lines = filtered.map(u => [
      u._window || "",
      u.user_id || "",
      u.name || "",
      u.mac_address || "",
      u.pon_number || "",
      u.status || "",
      (u.previousPower == null ? "" : u.previousPower.toFixed(2)),
      (u.currentPower == null ? "" : u.currentPower.toFixed(2)),
      (u.eventGap == null ? "" : u.eventGap),
      u.last_ts || ""
    ]);
  } else {
    headers = ["Window", "User ID", "Name", "MAC", "PON", "Status", "LastEvent", "LastUpdated"];
    lines = filtered.map(u => {
      const last = u.logs.length ? u.logs[u.logs.length - 1] : null;
      return [
        u._window || "",
        u.user_id || "",
        u.name || "",
        u.mac_address || "",
        u.pon_number || "",
        u.status || "",
        last ? last.downEvent : "",
        u.last_ts || ""
      ];
    });
  }

  const csvContent = [headers.join(","), ...lines.map(arr =>
    arr.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  )].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  let filename = "power-history";
  if (mode === "event") filename = "event-history";
  if (mode === "daywise") filename = `day-wise-${selectedDays}days-analysis`;
  if (mode === "eventwise") filename = `event-wise-${selectedEvents}events-analysis`;
  
  link.download = `${filename}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV downloaded");
};

// ---------------- Main load ----------------
async function loadAll() {
  showSpinner();
  try {
    if (currentWindow === "ALL") {
      // Fetch data from all three windows in parallel
      const powerPromises = WINDOWS.map(window => fetchWindowPower(window));
      const eventPromises = WINDOWS.map(window => fetchWindowEvent(window));
      
      const allPowerResults = await Promise.all(powerPromises);
      const allEventResults = await Promise.all(eventPromises);
      
      // Flatten the arrays
      powerRows = allPowerResults.flat();
      eventRows = allEventResults.flat();
    } else {
      // Single window
      powerRows = await fetchWindowPower(currentWindow);
      eventRows = await fetchWindowEvent(currentWindow);
    }

    powerUsers = groupPowerUsers(powerRows);
    eventUsers = groupEventUsers(eventRows);
    
    // ✅ Extract all PONs for dropdown
    allAvailablePons = extractAllPons([...powerUsers, ...eventUsers]);
    
    // ✅ Populate PON checkboxes and update button text
    populatePonCheckboxes();
    updatePonButtonText();
    
    // Process day wise and event wise data
    processDayWiseData();
    processEventWiseData();

    applyFilters();
    showToast("Loaded");
  } catch (error) {
    console.error("Load error:", error);
    showToast("Load failed");
  } finally {
    hideSpinner();
  }
}

// init
loadAll();