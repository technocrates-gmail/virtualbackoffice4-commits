// ===============================
// Production Grade Configuration
// ===============================
const CONFIG = {
    API_BASE_URL: 'https://app.vbo.co.in',
    CURRENT_WINDOW: 'TSN',
    REFRESH_INTERVAL: 30000,
    SCREENSHOT_QUALITY: 2,
    MIN_DROPS_THRESHOLD: 3,
    MAX_PONS_PER_OLT: 16,
    PON_PATTERN: /^([A-Z0-9]+)P(\d+)$/i
};

// ===============================
// State Management
// ===============================
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
    totalStats: { users: 0, offline: 0, tickets: 0 }
};

// ===============================
// DOM Elements
// ===============================
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
    toast: document.getElementById('toast')
};

// ===============================
// Core Utility Functions
// ===============================
const utils = {
    formatDateTime(date) {
        if (!date) return '--:--';
        try {
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
        } catch (error) {
            console.error('Date formatting error:', error);
            return '--:--';
        }
    },

    formatTime(date) {
        if (!date) return '--:--';
        try {
            return new Date(date).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } catch (error) {
            return '--:--';
        }
    },

    showToast(message, type = 'info', duration = 3000) {
        try {
            elements.toast.textContent = message;
            elements.toast.className = `toast ${type}`;
            elements.toast.classList.add('show');
            
            setTimeout(() => {
                elements.toast.classList.remove('show');
            }, duration);
        } catch (error) {
            console.error('Toast error:', error);
        }
    },

    updateLoading(show, message = 'Loading rack data...') {
        try {
            state.isLoading = show;
            
            if (show) {
                elements.loadingDetails.textContent = message;
                elements.loadingOverlay.style.display = 'flex';
                if (elements.dataLoading) {
                    elements.dataLoading.classList.add('active');
                }
            } else {
                elements.loadingOverlay.style.display = 'none';
                if (elements.dataLoading) {
                    elements.dataLoading.classList.remove('active');
                }
            }
        } catch (error) {
            console.error('Loading update error:', error);
        }
    },

    showRefreshing(show) {
        try {
            state.isRefreshing = show;
            if (elements.btnRefresh) {
                elements.btnRefresh.classList.toggle('refreshing', show);
            }
        } catch (error) {
            console.error('Refreshing state error:', error);
        }
    },

    animateCounter(element, target) {
        try {
            const current = parseInt(element.textContent) || 0;
            if (current === target) return;
            
            const duration = 500;
            const steps = 20;
            const increment = (target - current) / steps;
            let step = 0;
            
            const timer = setInterval(() => {
                step++;
                const value = Math.round(current + (increment * step));
                if (element) {
                    element.textContent = value;
                }
                
                if (step >= steps) {
                    if (element) {
                        element.textContent = target;
                    }
                    clearInterval(timer);
                }
            }, duration / steps);
        } catch (error) {
            console.error('Counter animation error:', error);
        }
    },

    parsePON(ponString) {
        try {
            if (!ponString || typeof ponString !== 'string') return null;
            
            const match = ponString.trim().match(CONFIG.PON_PATTERN);
            if (!match) return null;
            
            const olt = match[1].toUpperCase();
            const ponNumber = parseInt(match[2], 10);
            
            if (isNaN(ponNumber) || ponNumber < 1 || ponNumber > CONFIG.MAX_PONS_PER_OLT) {
                return null;
            }
            
            return { olt, ponNumber };
        } catch (error) {
            console.error('PON parsing error:', error);
            return null;
        }
    },

    normalizeData(user) {
        try {
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
                mac: user.MAC || ''
            };
        } catch (error) {
            console.error('Data normalization error:', error);
            return null;
        }
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// ===============================
// API Service
// ===============================
const apiService = {
    async fetchComplaintsData(silent = false) {
        const url = `${CONFIG.API_BASE_URL}/${CONFIG.CURRENT_WINDOW}/complains`;
        
        if (!silent) {
            utils.updateLoading(true, 'Fetching rack data from TSN...');
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.runtime_timestamp) {
                state.lastSyncTime = data.runtime_timestamp;
                elements.lastSyncTime.textContent = utils.formatDateTime(state.lastSyncTime);
                elements.lastSyncTime.title = `Last updated: ${new Date(state.lastSyncTime).toLocaleString()}`;
            }
            
            return Array.isArray(data.rows) ? data.rows : [];
            
        } catch (error) {
            console.error('API Fetch Error:', error);
            if (!silent) {
                if (error.name === 'AbortError') {
                    utils.showToast('Request timeout. Please check network.', 'error');
                } else {
                    utils.showToast('Failed to fetch rack data', 'error');
                }
            }
            throw error;
        } finally {
            if (!silent) {
                utils.updateLoading(false);
            }
        }
    }
};

// ===============================
// Data Processor - Dynamic OLT Detection
// ===============================
const dataProcessor = {
    processOLTData(users) {
        try {
            const oltData = {};
            const stats = { users: 0, offline: 0, tickets: 0 };
            const discoveredOLTs = new Set();
            
            state.oltData = {};
            state.discoveredOLTs.clear();
            
            users.forEach(user => {
                const normalizedUser = utils.normalizeData(user);
                if (!normalizedUser || !normalizedUser.pon) return;
                
                const ponInfo = utils.parsePON(normalizedUser.pon);
                if (!ponInfo) return;
                
                const { olt, ponNumber } = ponInfo;
                discoveredOLTs.add(olt);
                
                if (!oltData[olt]) {
                    oltData[olt] = {
                        name: olt,
                        total: 0,
                        offline: 0,
                        tickets: 0,
                        pons: {}
                    };
                    
                    for (let i = 1; i <= CONFIG.MAX_PONS_PER_OLT; i++) {
                        oltData[olt].pons[i] = {
                            users: [],
                            offline: [],
                            tickets: [],
                            drops: 0,
                            hasProblems: false
                        };
                    }
                }
            });
            
            users.forEach(user => {
                const normalizedUser = utils.normalizeData(user);
                if (!normalizedUser || !normalizedUser.pon) return;
                
                const ponInfo = utils.parsePON(normalizedUser.pon);
                if (!ponInfo) return;
                
                const { olt, ponNumber } = ponInfo;
                const oltObj = oltData[olt];
                const ponObj = oltObj.pons[ponNumber];
                
                if (!oltObj || !ponObj) return;
                
                oltObj.total++;
                stats.users++;
                ponObj.users.push(normalizedUser);
                
                const isOffline = normalizedUser.status === 'DOWN';
                if (isOffline) {
                    oltObj.offline++;
                    stats.offline++;
                    ponObj.offline.push(normalizedUser);
                }
                
                const hasTicket = normalizedUser.ticket && normalizedUser.ticket !== '';
                if (hasTicket) {
                    oltObj.tickets++;
                    stats.tickets++;
                    ponObj.tickets.push(normalizedUser);
                }
                
                const hasDrops = normalizedUser.drops && normalizedUser.drops !== '';
                if (hasDrops) {
                    ponObj.drops++;
                    if (ponObj.drops >= CONFIG.MIN_DROPS_THRESHOLD) {
                        ponObj.hasProblems = true;
                    }
                }
            });
            
            state.oltData = oltData;
            state.discoveredOLTs = discoveredOLTs;
            state.totalStats = stats;
            state.userData = users.map(u => utils.normalizeData(u)).filter(Boolean);
            
            elements.oltCount.textContent = `${discoveredOLTs.size} OLT${discoveredOLTs.size !== 1 ? 's' : ''}`;
            
            setTimeout(() => {
                utils.animateCounter(elements.totalUsers, stats.users);
                utils.animateCounter(elements.totalOffline, stats.offline);
                utils.animateCounter(elements.totalTickets, stats.tickets);
            }, 100);
            
            return oltData;
            
        } catch (error) {
            console.error('OLT Data Processing Error:', error);
            utils.showToast('Error processing data', 'error');
            return {};
        }
    }
};

// ===============================
// UI Renderer - Dynamic OLT Cards
// ===============================
const uiRenderer = {
    renderOLTCards(oltData) {
        try {
            elements.oltContainer.innerHTML = '';
            
            const oltNames = Object.keys(oltData);
            
            if (oltNames.length === 0) {
                elements.oltContainer.innerHTML = `
                    <div class="no-data">
                        <i class="fas fa-database"></i>
                        <h3>No Rack Data Available</h3>
                        <p>No OLTs found in TSN window data.</p>
                    </div>
                `;
                return;
            }
            
            const sortedOlts = oltNames.sort();
            
            sortedOlts.forEach((oltName, index) => {
                const olt = oltData[oltName];
                const card = this.createOLTCard(olt, index);
                elements.oltContainer.appendChild(card);
            });
            
            setTimeout(() => {
                elements.oltContainer.querySelectorAll('.clickable-cell').forEach(cell => {
                    cell.addEventListener('click', eventHandlers.handleCellClick);
                });
            }, 100);
            
        } catch (error) {
            console.error('OLT Cards Rendering Error:', error);
        }
    },

    createOLTCard(olt, index) {
        try {
            const card = document.createElement('div');
            card.className = 'olt-card';
            card.style.animationDelay = `${index * 100}ms`;
            
            const activePons = Object.values(olt.pons).filter(pon => pon.users.length > 0).length;
            
            card.innerHTML = `
                <div class="olt-card-header">
                    <div class="olt-name">
                        <i class="fas fa-server"></i>
                        <div>
                            <span>${olt.name}</span>
                            <div class="subtitle" style="font-size: 0.7rem; opacity: 0.9; margin-top: 2px;">
                                ${activePons} active PON${activePons !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="olt-stats">
                        <div class="olt-stat">
                            <span class="olt-stat-label">Total</span>
                            <span class="olt-stat-value">${olt.total}</span>
                        </div>
                        <div class="olt-stat">
                            <span class="olt-stat-label">Offline</span>
                            <span class="olt-stat-value">${olt.offline}</span>
                        </div>
                        <div class="olt-stat">
                            <span class="olt-stat-label">Tickets</span>
                            <span class="olt-stat-value">${olt.tickets}</span>
                        </div>
                    </div>
                </div>
                <div class="olt-card-body">
                    <table class="olt-table">
                        <thead>
                            <tr>
                                <th>PON</th>
                                <th>Users</th>
                                <th>Offline</th>
                                <th>Tickets</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Array.from({ length: CONFIG.MAX_PONS_PER_OLT }, (_, i) => {
                                const ponNumber = i + 1;
                                const ponData = olt.pons[ponNumber];
                                
                                if (ponData.users.length === 0 && !ponData.hasProblems) {
                                    return '';
                                }
                                
                                const hasProblems = ponData.hasProblems;
                                const statusClass = hasProblems ? 'status-problem' : '';
                                const statusIcon = hasProblems ? 
                                    '<span class="status-problem" title="Multiple drops detected">🔴</span>' : 
                                    '<span class="green-circle" title="Normal"></span>';
                                
                                return `
                                    <tr>
                                        <td><strong>${olt.name}P${ponNumber}</strong></td>
                                        <td class="clickable-cell" 
                                            data-olt="${olt.name}" 
                                            data-pon="${ponNumber}" 
                                            data-type="all">
                                            ${ponData.users.length}
                                        </td>
                                        <td class="clickable-cell" 
                                            data-olt="${olt.name}" 
                                            data-pon="${ponNumber}" 
                                            data-type="offline">
                                            ${ponData.offline.length}
                                        </td>
                                        <td class="clickable-cell" 
                                            data-olt="${olt.name}" 
                                            data-pon="${ponNumber}" 
                                            data-type="ticket">
                                            ${ponData.tickets.length}
                                        </td>
                                        <td class="status-cell ${statusClass}">
                                            ${statusIcon}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td><strong>${olt.name} Total</strong></td>
                                <td class="clickable-cell" 
                                    data-olt="${olt.name}" 
                                    data-type="olt-all">
                                    ${olt.total}
                                </td>
                                <td class="clickable-cell" 
                                    data-olt="${olt.name}" 
                                    data-type="olt-offline">
                                    ${olt.offline}
                                </td>
                                <td class="clickable-cell" 
                                    data-olt="${olt.name}" 
                                    data-type="olt-ticket">
                                    ${olt.tickets}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
            
            return card;
            
        } catch (error) {
            console.error('OLT Card Creation Error:', error);
            return document.createElement('div');
        }
    },

    renderUserModal(users, title, subtitle, oltName = '', ponNumber = '') {
        try {
            elements.modalTitle.textContent = title;
            elements.modalSubtitle.textContent = subtitle;
            elements.currentUsersCount.textContent = users.length;
            elements.modalTimestamp.textContent = utils.formatTime(new Date());
            
            state.selectedUsers = users;
            
            // Store OLT and PON info for screenshot
            state.currentOltName = oltName;
            state.currentPonNumber = ponNumber;
            
            if (!users || users.length === 0) {
                elements.modalBody.innerHTML = `
                    <div class="no-data">
                        <i class="fas fa-users-slash"></i>
                        <h3>No Users Found</h3>
                        <p>There are no users matching the selected criteria.</p>
                    </div>
                `;
                return;
            }
            
            const table = document.createElement('table');
            table.className = 'user-table';
            
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>User ID</th>
                        <th>Phone</th>
                        <th>Power (dBm)</th>
                        <th style="max-width: 200px; min-width: 150px;">Location</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map((user, index) => {
                        const isOffline = user.status === 'DOWN';
                        const hasTicket = user.ticket && user.ticket !== '';
                        const rowClass = isOffline ? 'highlight-offline' : hasTicket ? 'highlight-ticket' : '';
                        const statusBadge = isOffline ? 
                            '<span class="badge badge-danger">Offline</span>' : 
                            '<span class="badge badge-success">Online</span>';
                        
                        // Truncate long location text
                        const locationText = user.location || 'N/A';
                        const truncatedLocation = locationText.length > 50 ? 
                            locationText.substring(0, 47) + '...' : locationText;
                        
                        return `
                            <tr class="${rowClass}">
                                <td><strong>${index + 1}</strong></td>
                                <td>${user.name || 'N/A'}</td>
                                <td><code>${user.id || 'N/A'}</code></td>
                                <td>${user.phone || 'N/A'}</td>
                                <td>${user.power !== null ? `<strong>${user.power.toFixed(2)}</strong>` : 'N/A'}</td>
                                <td title="${user.location || 'N/A'}" style="max-width: 200px; word-wrap: break-word; white-space: normal; line-height: 1.4;">
                                    ${truncatedLocation}
                                </td>
                                <td>${statusBadge}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            `;
            
            elements.modalBody.innerHTML = '';
            elements.modalBody.appendChild(table);
            
            elements.userModal.style.display = 'flex';
            
        } catch (error) {
            console.error('Modal Rendering Error:', error);
        }
    }
};

// ===============================
// Screenshot Service - Enhanced with PON Number and Text Wrapping
// ===============================
const screenshotService = {
    async captureElementWithFullTable(element, filename, tableSelector, screenshotInfo = {}) {
        return new Promise((resolve, reject) => {
            try {
                utils.showToast('Preparing full table screenshot...', 'info');
                
                // Find the table
                const table = tableSelector ? 
                    element.querySelector(tableSelector) : 
                    element.querySelector('table');
                
                if (!table) {
                    utils.showToast('Table not found for screenshot', 'error');
                    reject(new Error('Table not found'));
                    return;
                }
                
                // Create a temporary container
                const tempContainer = document.createElement('div');
                tempContainer.id = 'temp-screenshot-container';
                
                // Calculate optimal width
                const tableWidth = table.scrollWidth;
                const maxWidth = Math.min(tableWidth + 100, window.innerWidth * 0.95);
                
                tempContainer.style.cssText = `
                    position: fixed;
                    left: 0;
                    top: 0;
                    width: ${maxWidth}px;
                    background: #ffffff;
                    padding: 25px;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    z-index: 10000;
                    overflow: visible;
                    box-sizing: border-box;
                    font-family: 'Inter', sans-serif;
                `;
                
                // Clone the table with all its styles
                const clonedTable = table.cloneNode(true);
                
                // Apply screenshot-specific styles
                clonedTable.style.cssText = `
                    width: 100% !important;
                    max-width: none !important;
                    border-collapse: collapse !important;
                    font-family: 'Inter', sans-serif !important;
                    font-size: 14px !important;
                    background: #ffffff !important;
                    color: #1e293b !important;
                    table-layout: auto !important;
                    border: 2px solid #e2e8f0 !important;
                `;
                
                // Fix for location column text wrapping
                const allCells = clonedTable.querySelectorAll('td, th');
                allCells.forEach(cell => {
                    const isLocationCell = cell.textContent.includes('Location') || 
                                          (cell.cellIndex === 5 && clonedTable.rows[0].cells[cell.cellIndex]?.textContent.includes('Location'));
                    
                    if (isLocationCell) {
                        cell.style.cssText = `
                            padding: 10px 12px !important;
                            border: 1px solid #e2e8f0 !important;
                            white-space: normal !important;
                            word-wrap: break-word !important;
                            word-break: break-word !important;
                            max-width: 200px !important;
                            min-width: 150px !important;
                            background: #ffffff !important;
                            line-height: 1.4 !important;
                            text-align: left !important;
                        `;
                    } else {
                        cell.style.cssText = `
                            padding: 10px 12px !important;
                            border: 1px solid #e2e8f0 !important;
                            white-space: nowrap !important;
                            overflow: visible !important;
                            background: #ffffff !important;
                            text-align: center !important;
                        `;
                    }
                });
                
                // Style header cells
                const headerCells = clonedTable.querySelectorAll('th');
                headerCells.forEach(th => {
                    th.style.cssText = `
                        padding: 14px 12px !important;
                        background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
                        color: white !important;
                        font-weight: 600 !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.05em !important;
                        border: 1px solid #2563eb !important;
                        text-align: center !important;
                        font-size: 13px !important;
                    `;
                });
                
                // Style status badges
                const badges = clonedTable.querySelectorAll('.badge');
                badges.forEach(badge => {
                    badge.style.cssText = `
                        display: inline-block !important;
                        padding: 4px 10px !important;
                        font-size: 11px !important;
                        font-weight: 600 !important;
                        border-radius: 20px !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.05em !important;
                        border: none !important;
                    `;
                    
                    if (badge.classList.contains('badge-danger')) {
                        badge.style.background = '#ef4444 !important';
                        badge.style.color = 'white !important';
                    } else if (badge.classList.contains('badge-success')) {
                        badge.style.background = '#10b981 !important';
                        badge.style.color = 'white !important';
                    }
                });
                
                // Style code elements
                const codeElements = clonedTable.querySelectorAll('code');
                codeElements.forEach(code => {
                    code.style.cssText = `
                        font-family: 'SF Mono', 'Monaco', monospace !important;
                        font-size: 12px !important;
                        background: #f1f5f9 !important;
                        padding: 2px 6px !important;
                        border-radius: 4px !important;
                        border: 1px solid #e2e8f0 !important;
                    `;
                });
                
                // Create header with all information
                const header = document.createElement('div');
                header.style.cssText = `
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #3b82f6;
                    font-family: 'Inter', sans-serif;
                `;
                
                const timestamp = new Date().toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                
                // Build header HTML with PON information
                let ponInfoHTML = '';
                if (screenshotInfo.oltName && screenshotInfo.ponNumber) {
                    ponInfoHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                            <span style="background: #3b82f6; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 13px;">
                                OLT: ${screenshotInfo.oltName}
                            </span>
                            <span style="background: #10b981; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 13px;">
                                PON: ${screenshotInfo.ponNumber}
                            </span>
                        </div>
                    `;
                } else if (screenshotInfo.oltName) {
                    ponInfoHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                            <span style="background: #3b82f6; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 13px;">
                                OLT: ${screenshotInfo.oltName}
                            </span>
                        </div>
                    `;
                }
                
                header.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 20px; font-weight: 700;">
                                ${filename}
                            </h3>
                            <p style="margin: 0; color: #64748b; font-size: 13px; font-weight: 500;">
                                ${screenshotInfo.type || 'Data'} | ${timestamp}
                            </p>
                        </div>
                        <div style="text-align: right;">
                            <div style="background: #f1f5f9; padding: 6px 12px; border-radius: 8px; font-weight: 600; color: #3b82f6;">
                                ${clonedTable.rows.length - 1} Users
                            </div>
                        </div>
                    </div>
                    ${ponInfoHTML}
                `;
                
                tempContainer.appendChild(header);
                tempContainer.appendChild(clonedTable);
                document.body.appendChild(tempContainer);
                
                // Calculate dimensions
                const tempRect = tempContainer.getBoundingClientRect();
                const deviceScale = window.devicePixelRatio || 1;
                const scale = CONFIG.SCREENSHOT_QUALITY * deviceScale;
                
                // Hide the temporary container during capture
                tempContainer.style.opacity = '0';
                tempContainer.style.pointerEvents = 'none';
                
                const html2canvasOptions = {
                    scale: scale,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    removeContainer: true,
                    imageTimeout: 30000,
                    width: tempRect.width * scale,
                    height: tempRect.height * scale,
                    x: 0,
                    y: 0,
                    scrollX: 0,
                    scrollY: 0,
                    windowWidth: tempRect.width * scale,
                    windowHeight: tempRect.height * scale,
                    onclone: function(clonedDoc) {
                        const clonedTemp = clonedDoc.getElementById('temp-screenshot-container');
                        if (clonedTemp) {
                            clonedTemp.style.cssText = tempContainer.style.cssText;
                            clonedTemp.style.opacity = '1';
                            clonedTemp.style.position = 'absolute';
                            clonedTemp.style.left = '0';
                            clonedTemp.style.top = '0';
                        }
                    }
                };
                
                html2canvas(tempContainer, html2canvasOptions)
                    .then(canvas => {
                        // Create download link
                        const link = document.createElement('a');
                        const safeFilename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        const finalTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        link.download = `${safeFilename}-${finalTimestamp}.png`;
                        link.href = canvas.toDataURL('image/png', 1.0);
                        
                        // Trigger download
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        
                        // Clean up
                        document.body.removeChild(tempContainer);
                        
                        utils.showToast('Full table screenshot saved!', 'success');
                        resolve();
                    })
                    .catch(error => {
                        console.error('Screenshot capture error:', error);
                        document.body.removeChild(tempContainer);
                        utils.showToast('Screenshot failed: ' + error.message, 'error');
                        reject(error);
                    });
                
            } catch (error) {
                console.error('Screenshot setup error:', error);
                utils.showToast('Failed to setup screenshot', 'error');
                reject(error);
            }
        });
    },

    async captureHighQuality(element, filename) {
        return new Promise((resolve, reject) => {
            try {
                const originalStyles = {
                    width: element.style.width,
                    height: element.style.height,
                    maxWidth: element.style.maxWidth,
                    maxHeight: element.style.maxHeight,
                    overflow: element.style.overflow,
                    position: element.style.position,
                    top: element.style.top,
                    left: element.style.left
                };
                
                const rect = element.getBoundingClientRect();
                const deviceScale = window.devicePixelRatio || 1;
                const scale = CONFIG.SCREENSHOT_QUALITY * deviceScale;
                
                // Save original styles
                const originalInlineStyles = element.getAttribute('style') || '';
                
                // Apply temporary styles
                element.style.cssText += `
                    width: ${rect.width}px !important;
                    height: ${rect.height}px !important;
                    max-width: none !important;
                    max-height: none !important;
                    overflow: visible !important;
                    position: relative !important;
                    top: 0 !important;
                    left: 0 !important;
                    background: #ffffff !important;
                `;
                
                const html2canvasOptions = {
                    scale: scale,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    removeContainer: true,
                    imageTimeout: 20000,
                    width: rect.width * scale,
                    height: rect.height * scale,
                    x: 0,
                    y: 0,
                    scrollX: 0,
                    scrollY: 0,
                    windowWidth: rect.width * scale,
                    windowHeight: rect.height * scale
                };
                
                html2canvas(element, html2canvasOptions)
                    .then(canvas => {
                        // Restore original styles
                        element.setAttribute('style', originalInlineStyles);
                        
                        // Download the image
                        const link = document.createElement('a');
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        link.download = `${filename}-${timestamp}.png`;
                        link.href = canvas.toDataURL('image/png', 1.0);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        
                        resolve();
                    })
                    .catch(error => {
                        element.setAttribute('style', originalInlineStyles);
                        reject(error);
                    });
                    
            } catch (error) {
                reject(error);
            }
        });
    },

    captureDashboard() {
        utils.showToast('Capturing full dashboard screenshot...', 'info');
        
        const dashboard = document.querySelector('.dashboard-container');
        if (!dashboard) {
            utils.showToast('Dashboard element not found', 'error');
            return;
        }
        
        const screenshotInfo = {
            type: 'Dashboard',
            timestamp: new Date().toLocaleString()
        };
        
        this.captureElementWithFullTable(dashboard, 'rack-dashboard-tsn', '.olt-container', screenshotInfo)
            .then(() => {
                utils.showToast('Dashboard screenshot saved!', 'success');
            })
            .catch(error => {
                console.error('Dashboard screenshot failed:', error);
                utils.showToast('Failed to capture dashboard', 'error');
            });
    },

    captureModal() {
        if (!state.selectedUsers || state.selectedUsers.length === 0) {
            utils.showToast('No users to capture', 'warning');
            return;
        }
        
        utils.showToast('Capturing full user table screenshot...', 'info');
        
        const modalContent = document.querySelector('.modal-content');
        if (!modalContent) {
            utils.showToast('Modal element not found', 'error');
            return;
        }
        
        const type = state.modalType.charAt(0).toUpperCase() + state.modalType.slice(1);
        
        const screenshotInfo = {
            type: type + ' Users',
            oltName: state.currentOltName || '',
            ponNumber: state.currentPonNumber || '',
            timestamp: new Date().toLocaleString()
        };
        
        this.captureElementWithFullTable(modalContent, `rack-users-${type}`, '.user-table', screenshotInfo)
            .then(() => {
                utils.showToast('User table screenshot saved!', 'success');
            })
            .catch(error => {
                console.error('Modal screenshot failed:', error);
                utils.showToast('Failed to capture screenshot', 'error');
            });
    }
};

// ===============================
// Event Handlers
// ===============================
const eventHandlers = {
    handleCellClick(event) {
        try {
            const cell = event.currentTarget;
            const olt = cell.dataset.olt;
            const pon = cell.dataset.pon;
            const type = cell.dataset.type;
            
            if (!olt || !type) return;
            
            let users = [];
            let title = '';
            let subtitle = '';
            
            const oltData = state.oltData[olt];
            if (!oltData) return;
            
            if (type.startsWith('olt-')) {
                const filterType = type.replace('olt-', '');
                
                users = Object.values(oltData.pons).flatMap(ponData => {
                    if (filterType === 'all') return ponData.users;
                    if (filterType === 'offline') return ponData.offline;
                    if (filterType === 'ticket') return ponData.tickets;
                    return [];
                });
                
                title = `${olt} - ${filterType.charAt(0).toUpperCase() + filterType.slice(1)} Users`;
                subtitle = `${users.length} users found`;
                
                state.modalType = filterType;
                state.currentOltName = olt;
                state.currentPonNumber = '';
            } else {
                const ponNumber = parseInt(pon);
                const ponData = oltData.pons[ponNumber];
                
                if (!ponData) return;
                
                if (type === 'all') users = ponData.users;
                if (type === 'offline') users = ponData.offline;
                if (type === 'ticket') users = ponData.tickets;
                
                title = `${olt}P${pon} - ${type.charAt(0).toUpperCase() + type.slice(1)} Users`;
                subtitle = `${users.length} users in PON ${pon}`;
                
                state.modalType = type;
                state.currentOltName = olt;
                state.currentPonNumber = ponNumber;
            }
            
            uiRenderer.renderUserModal(users, title, subtitle, olt, pon);
            
        } catch (error) {
            console.error('Cell click handler error:', error);
        }
    },

    async handleRefresh(silent = false) {
        if (state.isRefreshing) return;
        
        state.isRefreshing = true;
        utils.showRefreshing(true);
        
        if (!silent) {
            utils.showToast('Refreshing rack data...', 'info');
        }
        
        try {
            const users = await apiService.fetchComplaintsData(silent);
            const oltData = dataProcessor.processOLTData(users);
            
            elements.oltContainer.style.opacity = '0.7';
            setTimeout(() => {
                uiRenderer.renderOLTCards(oltData);
                elements.oltContainer.style.opacity = '1';
            }, 150);
            
            if (!silent) {
                utils.showToast(`Loaded ${state.discoveredOLTs.size} OLTs`, 'success');
            }
            
        } catch (error) {
            console.error('Refresh failed:', error);
            if (!silent) {
                utils.showToast('Refresh failed', 'error');
            }
        } finally {
            state.isRefreshing = false;
            utils.showRefreshing(false);
        }
    },

    handleDownloadCSV() {
        try {
            if (!state.selectedUsers || state.selectedUsers.length === 0) {
                utils.showToast('No users to export', 'warning');
                return;
            }
            
            const headers = ['#', 'Name', 'User ID', 'Phone', 'Power (dBm)', 'Location', 'Status', 'PON'];
            const rows = state.selectedUsers.map((user, index) => [
                index + 1,
                user.name || '',
                user.id || '',
                user.phone || '',
                user.power ? user.power.toFixed(2) : '',
                user.location || '',
                user.status === 'DOWN' ? 'Offline' : 'Online',
                user.pon || ''
            ]);
            
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(','))
            ].join('\n');
            
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.download = `rack-users-${state.modalType}-${timestamp}.csv`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            utils.showToast('CSV exported successfully', 'success');
            
        } catch (error) {
            console.error('CSV export error:', error);
            utils.showToast('CSV export failed', 'error');
        }
    },

    handleCloseModal() {
        try {
            elements.userModal.style.display = 'none';
            state.selectedUsers = [];
            state.currentOltName = '';
            state.currentPonNumber = '';
        } catch (error) {
            console.error('Modal close error:', error);
        }
    }
};

// ===============================
// Application Initialization
// ===============================
const app = {
    async initialize() {
        try {
            console.log('🚀 Initializing Rack Dashboard...');
            
            this.setupEventListeners();
            
            await eventHandlers.handleRefresh(false);
            
            state.refreshIntervalId = setInterval(() => {
                eventHandlers.handleRefresh(true);
            }, CONFIG.REFRESH_INTERVAL);
            
            setTimeout(() => {
                utils.showToast(`TSN Dashboard Ready • ${state.discoveredOLTs.size} OLTs detected`, 'success', 2000);
            }, 1000);
            
            console.log('✅ Rack Dashboard initialized successfully');
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            utils.showToast('Failed to initialize dashboard', 'error');
            
            setTimeout(() => {
                this.initialize();
            }, 5000);
        }
    },

    setupEventListeners() {
        try {
            if (elements.btnRefresh) {
                elements.btnRefresh.addEventListener('click', () => eventHandlers.handleRefresh(false));
            }
            
            if (elements.btnQuickRefresh) {
                elements.btnQuickRefresh.addEventListener('click', () => eventHandlers.handleRefresh(false));
            }
            
            if (elements.btnDownloadCSV) {
                elements.btnDownloadCSV.addEventListener('click', eventHandlers.handleDownloadCSV);
            }
            
            if (elements.btnModalScreenshot) {
                elements.btnModalScreenshot.addEventListener('click', screenshotService.captureModal.bind(screenshotService));
            }
            
            if (elements.btnCloseModal) {
                elements.btnCloseModal.addEventListener('click', eventHandlers.handleCloseModal);
            }
            
            if (elements.btnScreenshot) {
                elements.btnScreenshot.addEventListener('click', screenshotService.captureDashboard.bind(screenshotService));
            }
            
            if (elements.userModal) {
                elements.userModal.addEventListener('click', (event) => {
                    if (event.target === elements.userModal) {
                        eventHandlers.handleCloseModal();
                    }
                });
            }
            
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && elements.userModal.style.display === 'flex') {
                    eventHandlers.handleCloseModal();
                }
                
                if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
                    event.preventDefault();
                    eventHandlers.handleRefresh(false);
                }
                
                if (event.key === 'F5') {
                    event.preventDefault();
                    eventHandlers.handleRefresh(false);
                }
            });
            
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && !state.isRefreshing) {
                    setTimeout(() => eventHandlers.handleRefresh(true), 1000);
                }
            });
            
            window.addEventListener('resize', utils.debounce(() => {
                if (Object.keys(state.oltData).length > 0) {
                    uiRenderer.renderOLTCards(state.oltData);
                }
            }, 250));
            
            console.log('✅ Event listeners set up');
            
        } catch (error) {
            console.error('❌ Event listener setup failed:', error);
        }
    },

    cleanup() {
        try {
            if (state.refreshIntervalId) {
                clearInterval(state.refreshIntervalId);
            }
            console.log('🧹 Dashboard cleaned up');
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
};

// ===============================
// Start Application
// ===============================
document.addEventListener('DOMContentLoaded', () => {
    app.initialize();
});

window.addEventListener('beforeunload', () => {
    app.cleanup();
});

if (typeof window !== 'undefined') {
    window.RackDashboard = {
        state,
        utils,
        app,
        refresh: () => eventHandlers.handleRefresh(false),
        getOLTs: () => Array.from(state.discoveredOLTs),
        getStats: () => ({ ...state.totalStats })
    };
}