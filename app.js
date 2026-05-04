'use strict';
/* ============================================================
   FUELTRACK PRO — app.js
   Nigerian Fuel Station Dashboard
   Tank: Rectangular 10ft × 6ft × 10ft (max 16,990 L)
   ============================================================ */

// ── Constants ─────────────────────────────────────────────────
const TANK = { length: 10, width: 6, depth: 10 };
const L_PER_CUFT = 28.3168;
const MAX_LITRES = TANK.length * TANK.width * TANK.depth * L_PER_CUFT; // 16,990.08
const LITRES_PER_FOOT = TANK.length * TANK.width * L_PER_CUFT;         // 1,699.008
const STORAGE_KEY  = 'fueltrack_data';
const SETTINGS_KEY = 'fueltrack_settings';

// ── Utility: convert dipstick height → litres ─────────────────
function heightToLitres(h) {
  const hClamped = Math.min(Math.max(parseFloat(h) || 0, 0), TANK.depth);
  return hClamped * TANK.width * TANK.length * L_PER_CUFT;
}

// ── Utility: number formatting ────────────────────────────────
function fmtL(n)  { return isNaN(n) ? '—' : Number(n).toLocaleString('en-NG', { maximumFractionDigits: 1 }) + ' L'; }
function fmtN(n)  { return isNaN(n) ? '—' : '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }
function fmtNum(n){ return isNaN(n) ? '—' : Number(n).toLocaleString('en-NG', { maximumFractionDigits: 1 }); }
function pct(n)   { return ((n / MAX_LITRES) * 100).toFixed(1); }

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-NG', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ── Data Layer ────────────────────────────────────────────────
function defaultData() {
  return {
    petrol: { sellingPrice: 1350, lastCostPrice: 0, records: [] },
    diesel: { sellingPrice: 1500, lastCostPrice: 0, records: [] }
  };
}
function defaultSettings() {
  return { lossThreshold: 20 };
}
function getData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData(); }
  catch { return defaultData(); }
}
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function getSettings() {
  try { return Object.assign(defaultSettings(), JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
  catch { return defaultSettings(); }
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ── State ─────────────────────────────────────────────────────
const state = { fuel: 'petrol', view: 'dashboard' };

// ── Calculations ──────────────────────────────────────────────
function calcDay(openH, purchases, closeH, costPrice, sellingPrice) {
  const openStock   = heightToLitres(openH);
  const closeStock  = heightToLitres(closeH);
  const purch       = parseFloat(purchases) || 0;
  const rawSold     = openStock + purch - closeStock;
  const sold        = Math.max(0, rawSold);   // use 0 for revenue if negative
  const revenue     = sold * (parseFloat(sellingPrice) || 0);
  const profit      = sold * ((parseFloat(sellingPrice) || 0) - (parseFloat(costPrice) || 0));
  return { openStock, closeStock, purch, rawSold, sold, revenue, profit };
}

// ── Navigation ────────────────────────────────────────────────
function switchView(v) {
  state.view = v;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-' + v).classList.add('active');
  const titles = { dashboard: 'Dashboard', history: 'Record History', settings: 'Settings' };
  document.getElementById('page-title').textContent = titles[v];
  if (v === 'history')  renderHistory();
  if (v === 'settings') renderSettings();
}

function switchFuel(f) {
  state.fuel = f;
  document.body.setAttribute('data-fuel', f);
  document.querySelectorAll('.fuel-tab').forEach(el => el.classList.toggle('active', el.dataset.fuel === f));
  document.getElementById('form-fuel-badge').textContent = f.charAt(0).toUpperCase() + f.slice(1);
  // Update logo accent class in sidebar
  prefillFormDefaults();
  renderDashboard();
  if (state.view === 'history') renderHistory();
}

// ── Dashboard Render ──────────────────────────────────────────
function renderDashboard() {
  const data = getData();
  const fd   = data[state.fuel];
  // find today's record
  const today = todayStr();
  const rec   = fd.records.find(r => r.date === today) || null;

  // Stat cards
  if (rec) {
    setCard('sc-opening', fmtNum(rec.openStock) + ' L', `Dipstick: ${rec.openHeight} ft`, parseFloat(pct(rec.openStock)));
    setCard('sc-closing',  fmtNum(rec.closeStock) + ' L', `Dipstick: ${rec.closeHeight} ft`, parseFloat(pct(rec.closeStock)));
    setCard('sc-sold',     fmtNum(rec.sold) + ' L',  `Raw: ${fmtNum(rec.rawSold)} L`, null);
    setCard('sc-revenue',  fmtN(rec.revenue),  'Today', null);
    setCard('sc-profit',   fmtN(rec.profit),   'Today', null);
  } else {
    ['sc-opening','sc-closing','sc-sold','sc-revenue','sc-profit'].forEach(id => {
      setCard(id, '—', 'No entry today', 0);
    });
  }
  renderAlerts(rec, fd);
}

function setCard(id, val, sub, barPct) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.stat-value').textContent = val;
  el.querySelector('.stat-sub').textContent   = sub;
  const bar = el.querySelector('.tank-bar');
  if (bar && barPct !== null && barPct !== undefined) {
    bar.style.width = Math.min(Math.max(barPct, 0), 100) + '%';
  }
}

// ── Alerts ────────────────────────────────────────────────────
function renderAlerts(rec, fd) {
  const zone = document.getElementById('alert-zone');
  zone.innerHTML = '';
  if (!rec) return;

  const settings  = getSettings();
  const threshold = settings.lossThreshold || 20;

  // 1. Overnight loss: compare previous record's closing vs today's opening
  const sortedRecs = [...fd.records].sort((a,b) => b.date.localeCompare(a.date));
  const prevRec    = sortedRecs.find(r => r.date < rec.date);
  if (prevRec) {
    const oNight = prevRec.closeStock - rec.openStock;
    if (oNight > threshold) {
      addAlert(zone, 'danger',
        `⚠️ Overnight Loss Detected: ${fmtNum(oNight)} L missing between ${fmtDate(prevRec.date)} closing and today's opening.`);
    }
  }

  // 2. Unexpected stock gain (rawSold < 0)
  if (rec.rawSold < -threshold) {
    addAlert(zone, 'warning',
      `⚠️ Unexpected Stock Gain: Closing stock is ${fmtNum(Math.abs(rec.rawSold))} L higher than expected. Check dipstick readings.`);
  }

  // 3. Good day notification
  if (rec.rawSold >= 0 && rec.profit > 0 && (!prevRec || prevRec.closeStock - rec.openStock <= threshold)) {
    addAlert(zone, 'success',
      `✅ All good today — Est. profit: ${fmtN(rec.profit)} | Sold: ${fmtNum(rec.sold)} L`);
  }
}

function addAlert(zone, type, msg) {
  const div = document.createElement('div');
  div.className = `alert-banner ${type}`;
  div.innerHTML = `<span class="alert-icon">${type==='danger'?'🔴':type==='warning'?'🟡':'🟢'}</span><span>${msg}</span>`;
  zone.appendChild(div);
}

// ── Form — Prefill Defaults ───────────────────────────────────
function prefillFormDefaults() {
  const data = getData();
  const fd   = data[state.fuel];
  document.getElementById('input-sell').value = fd.sellingPrice || (state.fuel === 'petrol' ? 1350 : 1500);
  document.getElementById('input-cost').value = fd.lastCostPrice || '';
  document.getElementById('input-date').value = todayStr();
  document.getElementById('input-purchases').value = '';
  document.getElementById('input-open-h').value  = '';
  document.getElementById('input-close-h').value = '';
  document.getElementById('hint-open').textContent  = '— litres';
  document.getElementById('hint-close').textContent = '— litres';
  clearPreview();
}

// Load a specific record into the form (for editing)
function loadRecordIntoForm(rec) {
  document.getElementById('input-date').value       = rec.date;
  document.getElementById('input-open-h').value     = rec.openHeight;
  document.getElementById('input-close-h').value    = rec.closeHeight;
  document.getElementById('input-purchases').value  = rec.purchases;
  document.getElementById('input-cost').value       = rec.costPrice;
  document.getElementById('input-sell').value       = rec.sellingPrice;
  updatePreview();
  switchView('dashboard');
  showToast('Record loaded for editing — make changes and save.', 'warning');
}

// ── Form — Live Preview ───────────────────────────────────────
function updatePreview() {
  const openH = parseFloat(document.getElementById('input-open-h').value);
  const closeH= parseFloat(document.getElementById('input-close-h').value);
  const purch = parseFloat(document.getElementById('input-purchases').value) || 0;
  const cost  = parseFloat(document.getElementById('input-cost').value) || 0;
  const sell  = parseFloat(document.getElementById('input-sell').value) || 0;
  const date  = document.getElementById('input-date').value;

  // Update height hints
  if (!isNaN(openH)) {
    const oL = heightToLitres(openH);
    document.getElementById('hint-open').textContent = `≈ ${fmtNum(oL)} L  (${pct(oL)}% full)`;
  }
  if (!isNaN(closeH)) {
    const cL = heightToLitres(closeH);
    document.getElementById('hint-close').textContent = `≈ ${fmtNum(cL)} L  (${pct(cL)}% full)`;
    // Update gauge
    const gf  = document.getElementById('gauge-fill');
    const gp  = document.getElementById('gauge-pct');
    if (gf && gp) { gf.style.width = pct(cL) + '%'; gp.textContent = pct(cL) + '%'; }
  }

  if (isNaN(openH) || isNaN(closeH)) return;

  const c = calcDay(openH, purch, closeH, cost, sell);

  setText('p-open',    fmtNum(c.openStock) + ' L');
  setText('p-purch',   fmtNum(c.purch) + ' L');
  setText('p-close',   fmtNum(c.closeStock) + ' L');
  setText('p-sold',    fmtNum(c.sold) + ' L');
  setText('p-revenue', fmtN(c.revenue));
  setText('p-profit',  fmtN(c.profit));

  // Color the sold row
  const soldEl = document.getElementById('p-sold');
  if (soldEl) {
    soldEl.className = 'calc-val bold' + (c.rawSold < 0 ? ' text-danger' : c.sold > 0 ? ' text-success' : '');
  }

  // Overnight analysis
  if (date) {
    const data    = getData();
    const fd      = data[state.fuel];
    const prevRec = [...fd.records].filter(r => r.date < date).sort((a,b)=>b.date.localeCompare(a.date))[0];
    const box     = document.getElementById('overnight-box');
    if (prevRec && box) {
      const diff = prevRec.closeStock - c.openStock;
      box.style.display = 'block';
      setText('p-yest-close', fmtNum(prevRec.closeStock) + ' L');
      setText('p-today-open', fmtNum(c.openStock) + ' L');
      const diffEl = document.getElementById('p-diff');
      if (diffEl) {
        diffEl.textContent = (diff > 0 ? '−' : '+') + fmtNum(Math.abs(diff)) + ' L';
        const settings = getSettings();
        diffEl.className = 'calc-val bold ' + (diff > (settings.lossThreshold||20) ? 'text-danger' : diff > 5 ? 'text-warning' : 'text-success');
      }
    } else if (box) {
      box.style.display = 'none';
    }
  }
}

function clearPreview() {
  ['p-open','p-purch','p-close','p-sold','p-revenue','p-profit'].forEach(id => setText(id, '—'));
  ['p-yest-close','p-today-open','p-diff'].forEach(id => setText(id, '—'));
  const box = document.getElementById('overnight-box');
  if (box) box.style.display = 'none';
  const gf = document.getElementById('gauge-fill');
  const gp = document.getElementById('gauge-pct');
  if (gf) gf.style.width = '0%';
  if (gp) gp.textContent = '—%';
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Form Submit ───────────────────────────────────────────────
function handleFormSubmit(e) {
  e.preventDefault();

  const date  = document.getElementById('input-date').value;
  const openH = parseFloat(document.getElementById('input-open-h').value);
  const closeH= parseFloat(document.getElementById('input-close-h').value);
  const purch = parseFloat(document.getElementById('input-purchases').value) || 0;
  const cost  = parseFloat(document.getElementById('input-cost').value) || 0;
  const sell  = parseFloat(document.getElementById('input-sell').value) || 0;

  if (!date) { showToast('Please select a date.', 'error'); return; }
  if (isNaN(openH)) { showToast('Please enter the morning dipstick height.', 'error'); return; }
  if (isNaN(closeH)){ showToast('Please enter the evening dipstick height.', 'error'); return; }
  if (openH < 0 || openH > TANK.depth) { showToast(`Opening height must be 0–${TANK.depth} ft.`, 'error'); return; }
  if (closeH < 0 || closeH > TANK.depth){ showToast(`Closing height must be 0–${TANK.depth} ft.`, 'error'); return; }
  if (sell <= 0)  { showToast('Please enter a valid selling price.', 'error'); return; }

  const c = calcDay(openH, purch, closeH, cost, sell);

  // Calculate overnight loss vs previous record
  const data    = getData();
  const fd      = data[state.fuel];
  const prevRec = [...fd.records].filter(r => r.date < date).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const oNight  = prevRec ? prevRec.closeStock - c.openStock : 0;

  const record = {
    date,
    fuelType:    state.fuel,
    openHeight:  openH,
    openStock:   c.openStock,
    purchases:   purch,
    costPrice:   cost,
    sellingPrice:sell,
    closeHeight: closeH,
    closeStock:  c.closeStock,
    rawSold:     c.rawSold,
    sold:        c.sold,
    revenue:     c.revenue,
    profit:      c.profit,
    overnightLoss: oNight,
    savedAt:     new Date().toISOString()
  };

  // Upsert record
  const idx = fd.records.findIndex(r => r.date === date);
  if (idx >= 0) {
    fd.records[idx] = record;
  } else {
    fd.records.push(record);
  }
  fd.lastCostPrice = cost;
  fd.sellingPrice  = sell;
  saveData(data);

  showToast(`✅ Record saved for ${fmtDate(date)}`, 'success');
  renderDashboard();
  prefillFormDefaults();
  document.getElementById('input-date').value = todayStr();
}

// ── History Render ────────────────────────────────────────────
function renderHistory() {
  const data        = getData();
  const fuelFilter  = document.getElementById('filter-fuel').value;
  const monthFilter = document.getElementById('filter-month').value;
  const settings    = getSettings();
  const threshold   = settings.lossThreshold || 20;

  // Merge all records
  let allRecs = [];
  ['petrol','diesel'].forEach(f => {
    if (fuelFilter === 'all' || fuelFilter === f) {
      data[f].records.forEach(r => allRecs.push({ ...r, fuelType: f }));
    }
  });

  // Month filter
  if (monthFilter) {
    allRecs = allRecs.filter(r => r.date.startsWith(monthFilter));
  }

  // Sort newest first
  allRecs.sort((a,b) => b.date.localeCompare(a.date));

  const tbody  = document.getElementById('history-body');
  const empty  = document.getElementById('history-empty');
  const sumBox = document.getElementById('history-summary');
  tbody.innerHTML = '';

  if (!allRecs.length) {
    empty.style.display  = 'block';
    sumBox.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  allRecs.forEach(rec => {
    const oNight   = rec.overnightLoss || 0;
    let statusHtml = '<span class="status-ok">✅</span>';
    if (oNight > threshold) {
      statusHtml = `<span class="status-danger">🔴 −${fmtNum(oNight)}L overnight</span>`;
    } else if (rec.rawSold < -threshold) {
      statusHtml = `<span class="status-warn">🟡 Gain ${fmtNum(Math.abs(rec.rawSold))}L</span>`;
    }

    const fuelTag = `<span class="tag-${rec.fuelType}">${rec.fuelType.charAt(0).toUpperCase()+rec.fuelType.slice(1)}</span>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Select"><input type="checkbox" class="row-chk" data-date="${rec.date}" data-fuel="${rec.fuelType}" /></td>
      <td data-label="Date">${fmtDate(rec.date)}</td>
      <td data-label="Fuel">${fuelTag}</td>
      <td data-label="Opening (L)">${fmtNum(rec.openStock)}</td>
      <td data-label="Purchases (L)">${fmtNum(rec.purchases)}</td>
      <td data-label="Closing (L)">${fmtNum(rec.closeStock)}</td>
      <td data-label="Sold (L)" style="font-weight:600;color:${rec.rawSold<0?'var(--danger)':'var(--success)'}">${fmtNum(rec.sold)}</td>
      <td data-label="Revenue (₦)">${fmtNum(rec.revenue)}</td>
      <td data-label="Profit (₦)" style="color:var(--success)">${fmtNum(rec.profit)}</td>
      <td data-label="Status">${statusHtml}</td>
      <td data-label="Actions">
        <button class="action-btn action-edit" onclick="editRecord('${rec.date}','${rec.fuelType}')">✏️ Edit</button>
        <button class="action-btn action-del"  onclick="confirmDeleteRecord('${rec.date}','${rec.fuelType}')">🗑</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Summary footer
  const totalSold    = allRecs.reduce((s,r) => s + (r.sold||0), 0);
  const totalRevenue = allRecs.reduce((s,r) => s + (r.revenue||0), 0);
  const totalProfit  = allRecs.reduce((s,r) => s + (r.profit||0), 0);
  document.getElementById('sum-sold').textContent    = fmtNum(totalSold) + ' L';
  document.getElementById('sum-revenue').textContent = fmtN(totalRevenue);
  document.getElementById('sum-profit').textContent  = fmtN(totalProfit);
  document.getElementById('sum-count').textContent   = allRecs.length + ' records';
  sumBox.style.display = 'grid';

  // Select all checkbox
  document.getElementById('chk-all').checked = false;
}

// edit record from history
window.editRecord = function(date, fuel) {
  const data = getData();
  const rec  = data[fuel].records.find(r => r.date === date);
  if (!rec) return;
  if (state.fuel !== fuel) switchFuel(fuel);
  loadRecordIntoForm(rec);
};

// delete individual record
window.confirmDeleteRecord = function(date, fuel) {
  showModal(
    'Delete Record',
    `Delete the <strong>${fuel}</strong> record for <strong>${fmtDate(date)}</strong>? This cannot be undone.`,
    () => {
      const data = getData();
      data[fuel].records = data[fuel].records.filter(r => r.date !== date);
      saveData(data);
      renderHistory();
      showToast('Record deleted.', 'warning');
    }
  );
};

function deleteSelected() {
  const checks = document.querySelectorAll('.row-chk:checked');
  if (!checks.length) { showToast('No records selected.', 'warning'); return; }
  showModal(
    'Delete Selected',
    `Delete <strong>${checks.length}</strong> selected record(s)? This cannot be undone.`,
    () => {
      const data = getData();
      checks.forEach(chk => {
        data[chk.dataset.fuel].records = data[chk.dataset.fuel].records.filter(r => r.date !== chk.dataset.date);
      });
      saveData(data);
      renderHistory();
      showToast(`${checks.length} record(s) deleted.`, 'warning');
    }
  );
}

// ── Settings Render ───────────────────────────────────────────
function renderSettings() {
  const data     = getData();
  const settings = getSettings();
  document.getElementById('s-petrol-sell').value = data.petrol.sellingPrice || 1350;
  document.getElementById('s-petrol-cost').value = data.petrol.lastCostPrice || '';
  document.getElementById('s-diesel-sell').value = data.diesel.sellingPrice || 1500;
  document.getElementById('s-diesel-cost').value = data.diesel.lastCostPrice || '';
  document.getElementById('s-threshold').value   = settings.lossThreshold || 20;
  buildDipstickChart();
}

function buildDipstickChart() {
  const tbody = document.getElementById('dip-chart-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (let h = 0; h <= TANK.depth; h += 0.5) {
    const l = heightToLitres(h);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${h.toFixed(1)} ft</td><td>${fmtNum(l)}</td><td>${pct(l)}%</td>`;
    tbody.appendChild(tr);
  }
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast show ${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ── Modal ─────────────────────────────────────────────────────
let modalCallback = null;
function showModal(title, body, onConfirm) {
  document.getElementById('modal-title').textContent  = title;
  document.getElementById('modal-body').innerHTML     = body;
  document.getElementById('modal-overlay').classList.add('open');
  modalCallback = onConfirm;
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  modalCallback = null;
}

// ── Clock ─────────────────────────────────────────────────────
function updateClock() {
  const now  = new Date();
  const date = now.toLocaleDateString('en-NG', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const time = now.toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  document.getElementById('topbar-date').textContent = date;
  document.getElementById('topbar-time').textContent = time;
}

// ── Sidebar Mobile Toggle ─────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.toggle('open');
  overlay.classList.toggle('visible', isOpen);
}

// ── Init ──────────────────────────────────────────────────────
function init() {
  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Create sidebar overlay element
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id        = 'sidebar-overlay';
  overlay.addEventListener('click', toggleSidebar);
  document.body.appendChild(overlay);

  // Nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      if (window.innerWidth <= 768) toggleSidebar();
    });
  });

  // Hamburger
  document.getElementById('hamburger').addEventListener('click', toggleSidebar);

  // Fuel tabs
  document.querySelectorAll('.fuel-tab').forEach(btn => {
    btn.addEventListener('click', () => switchFuel(btn.dataset.fuel));
  });

  // Form live preview — input listeners
  ['input-open-h','input-close-h','input-purchases','input-cost','input-sell','input-date'].forEach(id => {
    document.getElementById(id).addEventListener('input', updatePreview);
  });

  // Form submit
  document.getElementById('entry-form').addEventListener('submit', handleFormSubmit);

  // Clear form button
  document.getElementById('btn-clear-form').addEventListener('click', prefillFormDefaults);

  // History filters
  document.getElementById('filter-fuel').addEventListener('change', renderHistory);
  document.getElementById('filter-month').addEventListener('change', renderHistory);
  document.getElementById('btn-reset-filter').addEventListener('click', () => {
    document.getElementById('filter-fuel').value  = 'all';
    document.getElementById('filter-month').value = '';
    renderHistory();
  });

  // Select all in history
  document.getElementById('chk-all').addEventListener('change', (e) => {
    document.querySelectorAll('.row-chk').forEach(c => c.checked = e.target.checked);
  });

  // Delete selected
  document.getElementById('btn-delete-selected').addEventListener('click', deleteSelected);

  // Settings — save petrol
  document.getElementById('btn-save-petrol').addEventListener('click', () => {
    const data = getData();
    data.petrol.sellingPrice  = parseFloat(document.getElementById('s-petrol-sell').value) || 1350;
    data.petrol.lastCostPrice = parseFloat(document.getElementById('s-petrol-cost').value) || 0;
    saveData(data);
    showToast('Petrol defaults saved.', 'success');
    if (state.fuel === 'petrol') prefillFormDefaults();
  });

  // Settings — save diesel
  document.getElementById('btn-save-diesel').addEventListener('click', () => {
    const data = getData();
    data.diesel.sellingPrice  = parseFloat(document.getElementById('s-diesel-sell').value) || 1500;
    data.diesel.lastCostPrice = parseFloat(document.getElementById('s-diesel-cost').value) || 0;
    saveData(data);
    showToast('Diesel defaults saved.', 'success');
    if (state.fuel === 'diesel') prefillFormDefaults();
  });

  // Settings — alert threshold
  document.getElementById('btn-save-alerts').addEventListener('click', () => {
    const s = getSettings();
    s.lossThreshold = parseInt(document.getElementById('s-threshold').value) || 20;
    saveSettings(s);
    showToast('Alert settings saved.', 'success');
  });

  // Danger — clear all
  document.getElementById('btn-nuke').addEventListener('click', () => {
    showModal(
      '⚠️ Clear All Data',
      'This will <strong>permanently delete</strong> all petrol and diesel records. This cannot be undone.',
      () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SETTINGS_KEY);
        showToast('All data cleared.', 'warning');
        renderDashboard();
      }
    );
  });

  // Modal buttons
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', () => {
    if (modalCallback) modalCallback();
    closeModal();
  });
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Set today's date in form
  document.getElementById('input-date').value = todayStr();

  // Initial render
  prefillFormDefaults();
  renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
