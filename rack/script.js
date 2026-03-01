// Production Grade Configuration
const CONFIG = {
    API_BASE_URL: 'https://app.vbo.co.in',
    CURRENT_WINDOW: 'TSN',  // Changed from 'ALL' to 'TSN'
    REFRESH_INTERVAL: 90000,
    SCREENSHOT_QUALITY: 2,
    MIN_DROPS_THRESHOLD: 3,
    MAX_PONS_PER_OLT: 16,
    PON_PATTERN: /^([A-Z0-9]+)P(\d+)$/i,
    WINDOWS: {
        'TSN': 'TSN'  // Only TSN window
    },
    API_ENDPOINTS: {
        'TSN': 'TSN/complains'  // TSN folder path
    }
};

const state = {
    isLoading: false,
    isRefreshing: false,
    lastSyncTime: null,
    oltData: {},
    userData: [],
    selectedUsers: [],
    modalType: 'all',
    refreshIntervalId: null,
    discoveredOLTs: new Set(),
    totalStats: { users: 0, offline: 0, tickets: 0 },
    currentOltName: '',
    currentPonNumber: '',
    allWindowsData: {},
    activeWindows: []
};

const elements = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingDetails: document.getElementById('loadingDetails'),
    dataLoading: document.getElementById('dataLoading'),
    lastSyncTime: document.getElementById('lastSyncTime'),
    btnRefresh: document.getElementById('btnRefresh'),
    totalUsers: document.getElementById('totalUsers'),
    totalOffline: document.getElementById('totalOffline'),
    totalTickets: document.getElementById('totalTickets'),
    oltCount: document.getElementById('oltCount'),
    oltContainer: document.getElementById('oltContainer'),
    userModal: document.getElementById('userModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    modalBody: document.getElementById('modalBody'),
    currentUsersCount: document.getElementById('currentUsersCount'),
    modalTimestamp: document.getElementById('modalTimestamp'),
    btnDownloadCSV: document.getElementById('btnDownloadCSV'),
    btnModalScreenshot: document.getElementById('btnModalScreenshot'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnQuickRefresh: document.getElementById('btnQuickRefresh'),
    btnScreenshot: document.getElementById('btnScreenshot'),
    toast: document.getElementById('toast'),
    windowSelector: document.getElementById('windowSelector'),
    mobileTotalUsers: document.getElementById('mobileTotalUsers'),
    mobileTotalOffline: document.getElementById('mobileTotalOffline'),
    mobileTotalTickets: document.getElementById('mobileTotalTickets'),
    mobileOltCount: document.getElementById('mobileOltCount'),
    mobileLastSyncTime: document.getElementById('mobileLastSyncTime'),
    mobileWindowSelector: document.getElementById('mobileWindowSelector')
};

const utils = {
    formatDateTime(date) {
        if (!date) return '--:--';
        const now = new Date();
        const syncDate = new Date(date);
        const diffMs = now - syncDate;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return syncDate.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    },
    formatTime(date) {
        if (!date) return '--:--';
        return new Date(date).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    },
    formatLastSeen(date) {
    if (!date) return 'N/A';

    const d = new Date(date);

    return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
},
    showToast(message, type = 'info', duration = 3000) {
        elements.toast.textContent = message;
        elements.toast.className = `toast ${type}`;
        elements.toast.classList.add('show');
        setTimeout(() => elements.toast.classList.remove('show'), duration);
    },
    updateLoading(show, message = 'Loading rack data...') {
        state.isLoading = show;
        if (show) {
            elements.loadingDetails.textContent = message;
            elements.loadingOverlay.style.display = 'flex';
            elements.dataLoading?.classList.add('active');
        } else {
            elements.loadingOverlay.style.display = 'none';
            elements.dataLoading?.classList.remove('active');
        }
    },
    showRefreshing(show) {
        state.isRefreshing = show;
        elements.btnRefresh?.classList.toggle('refreshing', show);
    },
    animateCounter(element, target) {
        if (!element) return;
        const current = parseInt(element.textContent) || 0;
        if (current === target) return;
        const duration = 500;
        const steps = 20;
        const increment = (target - current) / steps;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            element.textContent = Math.round(current + (increment * step));
            if (step >= steps) {
                element.textContent = target;
                clearInterval(timer);
            }
        }, duration / steps);
    },
    parsePON(ponString) {
        if (!ponString || typeof ponString !== 'string') return null;
        const match = ponString.trim().match(CONFIG.PON_PATTERN);
        if (!match) return null;
        const olt = match[1].toUpperCase();
        const ponNumber = parseInt(match[2], 10);
        if (isNaN(ponNumber) || ponNumber < 1 || ponNumber > CONFIG.MAX_PONS_PER_OLT) return null;
        return { olt, ponNumber };
    },
    normalizeData(user, windowName = '') {
        return {
            id: user.Users || user.user_id || '',
            name: user.Name || '',
            phone: user['Last called no'] || user.Number || '',
            power: user.Power ? Number(user.Power) : null,
            location: user.Location || '',
            status: user['User status'] || '',
            ticket: user.Ticket || '',
            drops: user.Drops || '',
            pon: user.PON || '',
            address: user.address || '',
            mac: user.MAC || '',
            window: windowName || CONFIG.CURRENT_WINDOW,
            serviceStatus: user["Service Status"] || '',
            lastSeen: user['Last Seen'] || '' 
        };
    },
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },
    generateOLTKey(oltName, windowName) {
        return `${windowName}_${oltName}`;
    },
    parseOLTKey(key) {
        const parts = key.split('_');
        if (parts.length >= 2) {
            return { windowName: parts[0], oltName: parts.slice(1).join('_') };
        }
        return { windowName: 'UNKNOWN', oltName: key };
    }
};

const apiService = {
    async fetchWindowData(windowName) {
        if (!CONFIG.API_ENDPOINTS[windowName]) return [];
        const url = `${CONFIG.API_BASE_URL}/${CONFIG.API_ENDPOINTS[windowName]}`;
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return {
                window: windowName,
                data: Array.isArray(data.rows) ? data.rows : [],
                timestamp: data.runtime_timestamp || new Date().toISOString()
            };
        } catch (error) {
            console.error(`API Fetch Error for ${windowName}:`, error);
            return { window: windowName, data: [], timestamp: new Date().toISOString(), error: error.message };
        }
    },
    async fetchAllWindowsData(silent = false) {
        if (!silent) utils.updateLoading(true, `Fetching data from all windows...`);
        try {
            const windowNames = Object.keys(CONFIG.API_ENDPOINTS);
            const promises = windowNames.map(w => this.fetchWindowData(w));
            const results = await Promise.allSettled(promises);
            const successfulWindows = [];
            const allUsers = [];
            results.forEach((result, index) => {
                const windowName = windowNames[index];
                if (result.status === 'fulfilled' && result.value.data.length > 0) {
                    successfulWindows.push(windowName);
                    const windowUsers = result.value.data.map(user => utils.normalizeData(user, windowName));
                    allUsers.push(...windowUsers);
                    state.allWindowsData[windowName] = {
                        users: windowUsers,
                        timestamp: result.value.timestamp,
                        count: windowUsers.length
                    };
                } else {
                    state.allWindowsData[windowName] = { users: [], timestamp: new Date().toISOString(), count: 0 };
                }
            });
            state.activeWindows = successfulWindows;
            if (!silent) {
                utils.showToast(`Loaded ${successfulWindows.length} windows`, successfulWindows.length ? 'success' : 'error');
            }
            return allUsers;
        } catch (error) {
            if (!silent) utils.showToast('Failed to fetch some data', 'error');
            return [];
        } finally {
            if (!silent) utils.updateLoading(false);
        }
    },
    async fetchSingleWindowData(windowName, silent = false) {
        if (!silent) utils.updateLoading(true, `Fetching data from ${CONFIG.WINDOWS[windowName] || windowName}...`);
        try {
            const result = await this.fetchWindowData(windowName);
            if (result.error) throw new Error(result.error);
            state.activeWindows = [windowName];
            state.allWindowsData[windowName] = {
                users: result.data.map(user => utils.normalizeData(user, windowName)),
                timestamp: result.timestamp,
                count: result.data.length
            };
            return state.allWindowsData[windowName].users;
        } catch (error) {
            if (!silent) utils.showToast(`Failed to fetch ${windowName} data`, 'error');
            throw error;
        } finally {
            if (!silent) utils.updateLoading(false);
        }
    },
    async fetchComplaintsData(silent = false) {
        return CONFIG.CURRENT_WINDOW === 'ALL' 
            ? this.fetchAllWindowsData(silent) 
            : this.fetchSingleWindowData(CONFIG.CURRENT_WINDOW, silent);
    }
};

const dataProcessor = {
    processOLTData(users) {
        const oltData = {};
        const stats = { users: 0, offline: 0, tickets: 0 };
        const discoveredOLTs = new Set();

        users.forEach(user => {
            if (!user?.pon) return;
            const ponInfo = utils.parsePON(user.pon);
            if (!ponInfo) return;
            const { olt, ponNumber } = ponInfo;
            const oltKey = utils.generateOLTKey(olt, user.window);
            discoveredOLTs.add(oltKey);

            if (!oltData[oltKey]) {
                const { windowName, oltName } = utils.parseOLTKey(oltKey);
                oltData[oltKey] = {
                    key: oltKey,
                    name: oltName,
                    window: windowName,
                    displayName: `${oltName} (${CONFIG.WINDOWS[windowName] || windowName})`,
                    total: 0,
                    offline: 0,
                    tickets: 0,
                    pons: {}
                };
                for (let i = 1; i <= CONFIG.MAX_PONS_PER_OLT; i++) {
                    oltData[oltKey].pons[i] = { number: i, users: [], offline: [], tickets: [], drops: 0, hasProblems: false };
                }
            }
        });

        users.forEach(user => {
            if ((user.serviceStatus || '').toLowerCase() !== 'active') return;
            if (!user?.pon) return;
            const ponInfo = utils.parsePON(user.pon);
            if (!ponInfo) return;
            const oltKey = utils.generateOLTKey(ponInfo.olt, user.window);
            const oltObj = oltData[oltKey];
            const ponObj = oltObj?.pons[ponInfo.ponNumber];
            if (!oltObj || !ponObj) return;

            oltObj.total++;
            stats.users++;
            ponObj.users.push(user);

            if (user.status === 'DOWN') {
                oltObj.offline++;
                stats.offline++;
                ponObj.offline.push(user);
            }
            if (user.ticket && user.ticket.trim() !== '') {  // ← Yeh check important hai
                oltObj.tickets++;
                stats.tickets++;
                ponObj.tickets.push(user);
            }
            if (user.drops) {
                ponObj.drops++;
                if (ponObj.drops >= CONFIG.MIN_DROPS_THRESHOLD) ponObj.hasProblems = true;
            }
        });

        state.oltData = oltData;
        state.discoveredOLTs = discoveredOLTs;
        state.totalStats = stats;
        state.userData = users;

        elements.oltCount.textContent = `${discoveredOLTs.size} OLT${discoveredOLTs.size !== 1 ? 's' : ''}`;

        [elements.totalUsers, elements.mobileTotalUsers].forEach(el => utils.animateCounter(el, stats.users));
        [elements.totalOffline, elements.mobileTotalOffline].forEach(el => utils.animateCounter(el, stats.offline));
        [elements.totalTickets, elements.mobileTotalTickets].forEach(el => utils.animateCounter(el, stats.tickets));
        [elements.mobileOltCount].forEach(el => el && (el.textContent = discoveredOLTs.size));

        const currentTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        [elements.lastSyncTime, elements.mobileLastSyncTime].forEach(el => el && (el.textContent = currentTime));

        return oltData;
    }
};

const uiRenderer = {
    initializeWindowSelector() {
        const populate = (selector) => {
            if (!selector) return;
            selector.innerHTML = '';
            const allOption = document.createElement('option');
            allOption.value = 'ALL';
            allOption.textContent = CONFIG.WINDOWS.ALL;
            selector.appendChild(allOption);
            Object.entries(CONFIG.WINDOWS).forEach(([key, value]) => {
                if (key !== 'ALL') {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = value;
                    selector.appendChild(option);
                }
            });
            selector.value = CONFIG.CURRENT_WINDOW;
        };
        populate(elements.windowSelector);
        populate(elements.mobileWindowSelector);
    },
    renderOLTCards(oltData) {
        elements.oltContainer.innerHTML = '';
        const oltKeys = Object.keys(oltData);
        if (oltKeys.length === 0) {
            elements.oltContainer.innerHTML = `<div class="no-data">
                <i class="fas fa-database"></i>
                <h3>No Rack Data Available</h3>
                <p>No OLTs found.</p>
            </div>`;
            return;
        }
        const sortedOltKeys = oltKeys.sort((a, b) => {
            const oa = oltData[a], ob = oltData[b];
            if (oa.window < ob.window) return -1;
            if (oa.window > ob.window) return 1;
            return oa.name.localeCompare(ob.name);
        });
let currentWindow = '';

sortedOltKeys.forEach((key) => {
    const olt = oltData[key];

    if (olt.window !== currentWindow) {
        currentWindow = olt.window;

        // ✅ Always show header (even for TSN)
        elements.oltContainer.appendChild(this.createWindowHeader(olt.window));
    }

    elements.oltContainer.appendChild(this.createOLTCard(olt));
});
        setTimeout(() => {
            elements.oltContainer.querySelectorAll('.clickable-cell').forEach(cell => {
                cell.addEventListener('click', eventHandlers.handleCellClick);
            });
        }, 100);
    },
    createWindowHeader(windowName) {
        const header = document.createElement('div');
        header.className = 'window-header';
        const displayName = CONFIG.WINDOWS[windowName] || windowName;
        const data = state.allWindowsData[windowName];
        header.innerHTML = `
            <div class="window-header-content">
                <i class="fas fa-window-restore"></i>
                <div>
                    <h3>${displayName}</h3>
                    <div class="window-header-subtitle">
                        ${data ? 'Last updated: ' + utils.formatDateTime(data.timestamp) : 'No data'}
                    </div>
                </div>
            </div>
        `;
        return header;
    },
    createOLTCard(olt) {
        const card = document.createElement('div');
        card.className = 'olt-card';
        const activePons = Object.values(olt.pons).filter(p => p.users.length > 0).length;
        const windowBadge = CONFIG.CURRENT_WINDOW === 'ALL' ? `<span class="window-badge">${olt.window}</span>` : '';
        card.innerHTML = `
            <div class="olt-card-header">
                <div class="olt-name">
                    <i class="fas fa-server"></i>
                    <div>
                        <span>${olt.name} ${windowBadge}</span>
                        <div class="subtitle">
                            ${activePons} active PON${activePons !== 1 ? 's' : ''} • ${olt.total} Users
                        </div>
                    </div>
                </div>
                <div class="olt-stats">
                    <div class="olt-stat"><span class="olt-stat-label">Total</span><span class="olt-stat-value">${olt.total}</span></div>
                    <div class="olt-stat"><span class="olt-stat-label">Offline</span><span class="olt-stat-value">${olt.offline}</span></div>
                    <div class="olt-stat"><span class="olt-stat-label">Tickets</span><span class="olt-stat-value">${olt.tickets}</span></div>
                </div>
            </div>
            <div class="olt-card-body">
                <table class="olt-table">
                    <thead>
                        <tr>
                            <th>PON No</th>
                            <th>Live</th>
                            <th>Off</th>
                            <th>Comp</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Array.from({ length: CONFIG.MAX_PONS_PER_OLT }, (_, i) => {
                            const num = i + 1;
                            const pon = olt.pons[num];
                            if (pon.users.length === 0 && !pon.hasProblems) return '';
                            const hasProblems = pon.hasProblems;
                            const statusIcon = hasProblems ? '<span class="status-problem" title="Multiple drops">🔴</span>' : '<span class="green-circle" title="Normal"></span>';
                            return `
                                <tr>
                                    <td class="pon-number-cell">
                                        <strong>PON ${num}</strong>
                                        <div class="pon-status-indicator ${hasProblems ? 'problem' : 'normal'}"></div>
                                        ${pon.drops > 0 ? `<span class="pon-details">${pon.drops} drop${pon.drops > 1 ? 's' : ''}</span>` : ''}
                                    </td>
                                    <td class="clickable-cell" data-olt="${olt.key}" data-pon="${num}" data-type="all">${pon.users.length}</td>
                                    <td class="clickable-cell" data-olt="${olt.key}" data-pon="${num}" data-type="offline">${pon.offline.length}</td>
                                    <td class="clickable-cell" data-olt="${olt.key}" data-pon="${num}" data-type="ticket">${pon.tickets.length}</td>
                                    <td class="status-cell ${hasProblems ? 'status-problem' : ''}">${statusIcon}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td class="pon-number-cell"><strong>${olt.name} Total</strong></td>
                            <td class="clickable-cell" data-olt="${olt.key}" data-type="olt-all">${olt.total}</td>
                            <td class="clickable-cell" data-olt="${olt.key}" data-type="olt-offline">${olt.offline}</td>
                            <td class="clickable-cell" data-olt="${olt.key}" data-type="olt-ticket">${olt.tickets}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        return card;
    },
    renderUserModal(users, title, subtitle, oltKey = '', ponNumber = '') {
        elements.modalTitle.textContent = title;
        elements.modalSubtitle.textContent = subtitle;
        elements.currentUsersCount.textContent = users.length;
        elements.modalTimestamp.textContent = utils.formatTime(new Date());
        state.selectedUsers = users;
        if (oltKey) {
            const parsed = utils.parseOLTKey(oltKey);
            state.currentOltName = parsed.oltName;
            state.currentPonNumber = ponNumber;
        }
        if (!users.length) {
            elements.modalBody.innerHTML = `<div class="no-data">
                <i class="fas fa-ticket-alt"></i>
                <h3>No Open Repairs Complaints</h3>
                <p>No users with open Repairs tickets in this selection.</p>
            </div>`;
            elements.userModal.style.display = 'flex';
            return;
        }
        let tableHTML = `<table class="user-table"><thead><tr>
            <th>#</th><th>Name</th><th>User ID</th><th>Phone</th><th>Power (dBm)</th><th>Location</th><th>Status</th><th>PON</th><th>Last Seen(on or before)</th>
            ${CONFIG.CURRENT_WINDOW === 'ALL' ? '<th>Window</th>' : ''}
        </tr></thead><tbody>`;
        users.forEach((user, index) => {
            const isOffline = user.status === 'DOWN';
            const hasTicket = !!user.ticket && user.ticket.trim() !== '';
            const rowClass = isOffline ? 'highlight-offline' : hasTicket ? 'highlight-ticket' : '';
            const statusBadge = isOffline ? '<span class="badge badge-danger">Offline</span>' : '<span class="badge badge-success">Online</span>';
            const location = user.location || 'N/A';
            const truncated = location.length > 40 ? location.substring(0, 37) + '...' : location;
            tableHTML += `<tr class="${rowClass}">
                <td><strong>${index + 1}</strong></td>
                <td>${user.name || 'N/A'}</td>
                <td><code>${user.id || 'N/A'}</code></td>
                <td>${user.phone || 'N/A'}</td>
                <td>${user.power !== null ? user.power.toFixed(2) : 'N/A'}</td>
                <td title="${location}">${truncated}</td>
                <td>${statusBadge}</td>
                <td><code>${user.pon || 'N/A'}</code></td>
                <td>${user.lastSeen ? utils.formatLastSeen(user.lastSeen) : 'N/A'}</td>
                ${CONFIG.CURRENT_WINDOW === 'ALL' ? `<td><span class="window-badge-small">${user.window || 'N/A'}</span></td>` : ''}
            </tr>`;
        });
        tableHTML += `</tbody></table>`;
        elements.modalBody.innerHTML = tableHTML;
        elements.userModal.style.display = 'flex';
    }
};

const screenshotService = {
    async captureElement(element, filename, tableSelector, info = {}) {
        utils.showToast('Capturing full screenshot...', 'info');

        const tempContainer = document.createElement('div');
        tempContainer.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 1400px;
            background: #ffffff;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            z-index: 10000;
            overflow: visible;
            font-family: 'Inter', sans-serif;
        `;
        document.body.appendChild(tempContainer);

        const header = document.createElement('div');
        header.style.marginBottom = '20px';
        header.style.paddingBottom = '16px';
        header.style.borderBottom = '2px solid #3b82f6';
        header.innerHTML = `
            <h3 style="margin:0; color:#1e293b; font-size:20px;">${filename}</h3>
            <p style="margin:8px 0 0; color:#64748b; font-size:13px;">
                ${new Date().toLocaleString('en-IN')} | ${CONFIG.WINDOWS[CONFIG.CURRENT_WINDOW] || CONFIG.CURRENT_WINDOW}
            </p>
        `;
        tempContainer.appendChild(header);

        const contentToClone = element.querySelector(tableSelector || 'table') || element;
        const clonedContent = contentToClone.cloneNode(true);

        clonedContent.style.cssText = `
            width: 100% !important;
            max-width: 1350px !important;
            border-collapse: collapse !important;
            font-family: 'Inter', sans-serif !important;
            font-size: 13px !important;
            background: #ffffff !important;
            color: #1e293b !important;
            table-layout: auto !important;
        `;

        const allCells = clonedContent.querySelectorAll('td, th');
        allCells.forEach(cell => {
            if (cell.cellIndex === 5 || cell.textContent.includes('Location')) {
                cell.style.cssText = `
                    max-width: 220px !important;
                    min-width: 140px !important;
                    white-space: normal !important;
                    word-wrap: break-word !important;
                    word-break: break-word !important;
                    line-height: 1.4 !important;
                    padding: 10px 12px !important;
                    text-align: left !important;
                `;
            } else {
                cell.style.cssText = `
                    padding: 10px 12px !important;
                    white-space: nowrap !important;
                    text-align: center !important;
                `;
            }
        });

        const headerCells = clonedContent.querySelectorAll('th');
        headerCells.forEach(th => {
            th.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb) !important';
            th.style.color = 'white !important';
            th.style.fontWeight = '600 !important';
            th.style.textTransform = 'uppercase !important';
            th.style.letterSpacing = '0.05em !important';
        });

        const badges = clonedContent.querySelectorAll('.badge');
        badges.forEach(badge => {
            badge.style.padding = '4px 10px !important';
            badge.style.fontSize = '11px !important';
            badge.style.borderRadius = '20px !important';
        });

        tempContainer.appendChild(clonedContent);

        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(tempContainer, {
            scale: CONFIG.SCREENSHOT_QUALITY || 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: tempContainer.scrollWidth,
            windowHeight: tempContainer.scrollHeight,
            scrollX: 0,
            scrollY: 0
        });

        const link = document.createElement('a');
        const safeName = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `${safeName}-${timestamp}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();

        document.body.removeChild(tempContainer);
        utils.showToast('Full screenshot saved!', 'success');
    },

    captureDashboard() {
        this.captureElement(document.querySelector('.dashboard-container'), 
            `rack-dashboard-${CONFIG.CURRENT_WINDOW.toLowerCase()}`, 
            '.olt-container');
    },

    captureModal() {
        if (!state.selectedUsers.length) return utils.showToast('No users to capture', 'warning');
        this.captureElement(document.querySelector('.modal-content'), 
            `rack-users-${CONFIG.CURRENT_WINDOW.toLowerCase()}-${state.modalType}`, 
            '.user-table');
    }
};

const eventHandlers = {
    handleCellClick(event) {
        const cell = event.currentTarget;
        const oltKey = cell.dataset.olt;
        const pon = cell.dataset.pon;
        const type = cell.dataset.type;
        if (!oltKey || !type) return;

        let users = [];
        let title = '';
        let subtitle = '';

        const olt = state.oltData[oltKey];
        if (!olt) return;

        const { oltName, windowName } = utils.parseOLTKey(oltKey);
        const windowDisplay = CONFIG.WINDOWS[windowName] || windowName;

        if (type.startsWith('olt-')) {
            const filter = type.replace('olt-', '');
            if (filter === 'ticket') {
                // Sirf Repairs open complaints wale users (Ticket non-empty)
                users = Object.values(olt.pons).flatMap(ponData => 
                    ponData.tickets.filter(user => user.ticket && user.ticket.trim() !== '')
                );
                title = `Open Repairs Tickets - ${oltName}`;
                subtitle = `${users.length} users with open Repairs complaints in ${oltName} (${windowDisplay})`;
            } else {
                users = Object.values(olt.pons).flatMap(p => p[filter] || p.users);
                title = `${oltName} - ${filter.charAt(0).toUpperCase() + filter.slice(1)} Users`;
                subtitle = `${users.length} users in ${oltName} (${windowDisplay})`;
            }
            state.modalType = filter;
        } else {
            const ponNumber = parseInt(pon);
            const ponData = olt.pons[ponNumber];
            if (!ponData) return;

            if (type === 'ticket') {
                users = ponData.tickets.filter(user => user.ticket && user.ticket.trim() !== '');
                title = `${oltName}P${pon} - Open Repairs Tickets`;
                subtitle = `${users.length} users with open Repairs in PON ${pon} (${windowDisplay})`;
            } else {
                users = ponData[type] || ponData.users;
                title = `${oltName}P${pon} - ${type.charAt(0).toUpperCase() + type.slice(1)} Users`;
                subtitle = `${users.length} users in PON ${pon} (${windowDisplay})`;
            }
            state.modalType = type;
        }

        uiRenderer.renderUserModal(users, title, subtitle, oltKey, pon);
    },
    async handleRefresh(silent = false) {
        if (state.isRefreshing) return;
        state.isRefreshing = true;
        utils.showRefreshing(true);
        if (!silent) utils.showToast('Refreshing data...', 'info');
        try {
            const users = await apiService.fetchComplaintsData(silent);
            const oltData = dataProcessor.processOLTData(users);
            elements.oltContainer.style.opacity = '0.7';
            setTimeout(() => {
                uiRenderer.renderOLTCards(oltData);
                elements.oltContainer.style.opacity = '1';
            }, 150);
            if (!silent) utils.showToast(`Loaded ${state.discoveredOLTs.size} OLTs`, 'success');
        } catch (error) {
            if (!silent) utils.showToast('Refresh failed', 'error');
        } finally {
            state.isRefreshing = false;
            utils.showRefreshing(false);
        }
    },
    handleDownloadCSV() {
        if (!state.selectedUsers.length) return utils.showToast('No users to export', 'warning');
        const headers = ['#', 'Name', 'User ID', 'Phone', 'Power (dBm)', 'Location', 'Status', 'PON', 'Drops', 'Ticket', 'Window'];
        const rows = state.selectedUsers.map((u, i) => [
            i + 1,
            u.name || '',
            u.id || '',
            u.phone || '',
            u.power?.toFixed(2) || '',
            u.location || '',
            u.status === 'DOWN' ? 'Offline' : 'Online',
            u.pon || '',
            u.drops || '',
            u.ticket || '',
            u.window || ''
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c.toString().replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rack-users-${CONFIG.CURRENT_WINDOW.toLowerCase()}-${state.modalType}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        utils.showToast('CSV exported', 'success');
    },
    handleCloseModal() {
        elements.userModal.style.display = 'none';
        state.selectedUsers = [];
        state.currentOltName = '';
        state.currentPonNumber = '';
    }
};

const app = {
    async initialize() {
        uiRenderer.initializeWindowSelector();
        this.setupEventListeners();
        await eventHandlers.handleRefresh(false);
        state.refreshIntervalId = setInterval(() => eventHandlers.handleRefresh(true), CONFIG.REFRESH_INTERVAL);
        setTimeout(() => utils.showToast('Dashboard Ready', 'success', 2000), 1000);
    },
    setupEventListeners() {
        elements.windowSelector?.addEventListener('change', e => {
        CONFIG.CURRENT_WINDOW = e.target.value;
        elements.mobileWindowSelector.value = e.target.value;
         document.title = `Rack Dashboard | ${CONFIG.WINDOWS[CONFIG.CURRENT_WINDOW] || CONFIG.CURRENT_WINDOW}`;
            state.oltData = {};
            state.discoveredOLTs.clear();
            state.totalStats = { users: 0, offline: 0, tickets: 0 };
            elements.oltCount.textContent = '0 OLTs';
            elements.totalUsers.textContent = '0';
            elements.totalOffline.textContent = '0';
            elements.totalTickets.textContent = '0';
            elements.oltContainer.innerHTML = '';
            [elements.mobileTotalUsers, elements.mobileTotalOffline, elements.mobileTotalTickets, elements.mobileOltCount].forEach(el => el && (el.textContent = '0'));
            utils.showToast(`Switched to ${CONFIG.WINDOWS[CONFIG.CURRENT_WINDOW] || CONFIG.CURRENT_WINDOW}`, 'info');
            eventHandlers.handleRefresh(false);
        });
        elements.btnRefresh?.addEventListener('click', () => eventHandlers.handleRefresh(false));
        elements.btnQuickRefresh?.addEventListener('click', () => eventHandlers.handleRefresh(false));
        elements.btnDownloadCSV?.addEventListener('click', eventHandlers.handleDownloadCSV);
        elements.btnModalScreenshot?.addEventListener('click', () => screenshotService.captureModal());
        elements.btnCloseModal?.addEventListener('click', eventHandlers.handleCloseModal);
        elements.btnScreenshot?.addEventListener('click', () => screenshotService.captureDashboard());
        elements.userModal?.addEventListener('click', e => {
            if (e.target === elements.userModal) eventHandlers.handleCloseModal();
        });
        document.getElementById('mobileMenuToggle')?.addEventListener('click', () => {
            document.getElementById('mobileSidebar').classList.add('open');
            document.getElementById('mobileMenuToggle').style.opacity = '0';
        });
        document.getElementById('mobileSidebarClose')?.addEventListener('click', () => {
            document.getElementById('mobileSidebar').classList.remove('open');
            document.getElementById('mobileMenuToggle').style.opacity = '1';
        });
        document.getElementById('mobileWindowSelector')?.addEventListener('change', e => {
            CONFIG.CURRENT_WINDOW = e.target.value;
            elements.windowSelector.value = e.target.value;
            utils.showToast(`Switched to ${CONFIG.WINDOWS[CONFIG.CURRENT_WINDOW] || CONFIG.CURRENT_WINDOW}`, 'info');
            eventHandlers.handleRefresh(false);
            document.getElementById('mobileSidebar').classList.remove('open');
            document.getElementById('mobileMenuToggle').style.opacity = '1';
        });
        document.getElementById('mobileBtnRefresh')?.addEventListener('click', () => {
            eventHandlers.handleRefresh(false);
            document.getElementById('mobileSidebar').classList.remove('open');
            document.getElementById('mobileMenuToggle').style.opacity = '1';
        });
        document.getElementById('mobileBtnScreenshot')?.addEventListener('click', () => {
            screenshotService.captureDashboard();
            document.getElementById('mobileSidebar').classList.remove('open');
            document.getElementById('mobileMenuToggle').style.opacity = '1';
        });
        document.getElementById('mobileBtnFullscreen')?.addEventListener('click', () => {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else document.exitFullscreen();
            document.getElementById('mobileSidebar').classList.remove('open');
            document.getElementById('mobileMenuToggle').style.opacity = '1';
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && elements.userModal.style.display === 'flex') eventHandlers.handleCloseModal();
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                eventHandlers.handleRefresh(false);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                screenshotService.captureDashboard();
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !state.isRefreshing) setTimeout(() => eventHandlers.handleRefresh(true), 1000);
        });
        window.addEventListener('resize', utils.debounce(() => {
            if (Object.keys(state.oltData).length > 0) uiRenderer.renderOLTCards(state.oltData);
        }, 250));
    },
    cleanup() {
        if (state.refreshIntervalId) clearInterval(state.refreshIntervalId);
    }
};

document.addEventListener('DOMContentLoaded', () => app.initialize());

window.addEventListener('beforeunload', () => app.cleanup());




