import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, deleteDoc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAsVBai3D8ojfynejbtiGWsxvCe7bqjQ9c",
  authDomain: "flylab-c1f97.firebaseapp.com",
  projectId: "flylab-c1f97",
  storageBucket: "flylab-c1f97.firebasestorage.app",
  messagingSenderId: "228492768215",
  appId: "1:228492768215:web:994473718aed17ea305192",
  measurementId: "G-XD4WTQ0QQE"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const defaultSettings = {
  schedule: [
    { time: '08:00', desc: 'Morning virgin collection', priority: 'critical' },
    { time: '09:00', desc: 'Set up crosses with collected virgins', priority: '' },
    { time: '14:00', desc: 'Check cultures, phenotype, flip stocks', priority: '' },
    { time: '17:00', desc: 'Afternoon virgin collection', priority: 'critical' },
    { time: '20:00', desc: 'Clear adults, move stocks to 18°C', priority: '' }
  ],
  temps: [
    { value: '18', label: '18°C (slow, ~18-20d)' },
    { value: '25', label: '25°C (standard, ~10d)' },
    { value: '29', label: '29°C (fast, ~8d)' }
  ],
  flipWarnDays: 10, flipCritDays: 14, virginWindow25: 12, virginWindow18: 18,
  stockTypes: ['wild-type', 'mutant', 'GAL4 driver', 'UAS responder', 'balancer', 'RNAi line', 'CRISPR line', 'other'],
  defaultPhenos: ['Wild-type', 'Mutant', '♀ flies', '♂ flies'],
  recurringTasks: [
    { name: 'Collect virgins (AM)', color: '#4a9eff' },
    { name: 'Collect virgins (PM)', color: '#85b7eb' },
    { name: 'Flip stocks', color: '#d95b5b' },
    { name: 'Set up crosses', color: '#b06bb0' },
    { name: 'Check cultures', color: '#4caf50' },
    { name: 'Score phenotypes', color: '#e8b14e' },
    { name: 'Move stocks to 18°C', color: '#5bc8d9' },
    { name: 'Prepare fly food', color: '#c8954a' }
  ]
};

const defaultProtocols = [
  { name: 'Virgin collection', category: 'maintenance', duration: '5-10 min/stock', materials: 'CO₂ pad, fresh vials, brush, microscope', steps: '1. Clear adults from vial at evening\n2. Return 8-12hr later\n3. Anesthetize, identify virgins (pale, meconium spot)\n4. Sort females into fresh vial\n5. Store at 18°C', notes: 'At 25°C ~10hr window. Never exceed it.' },
  { name: 'Standard cross setup', category: 'genetics', duration: '15 min, 14d total', materials: 'Fresh vials, virgins, males, labels', steps: '1. Verify virgin females\n2. Add 5♀ + 10♂ to fresh vial\n3. Label fully\n4. 25°C incubate\n5. Transfer after 3-4d\n6. Remove parents before F1 eclose', notes: 'Bottles: 20-30♀ + 30-50♂.' },
  { name: 'Climbing assay (geotaxis)', category: 'behavior', duration: '15-20 min', materials: 'Vials, stopwatch, light, camera', steps: '1. Place 10-20 flies in vial\n2. Tap to bottom 3×\n3. Time climbing past 8cm\n4. Record at 10s, 15s\n5. Repeat 3×', notes: 'ZT 2-10, flies 3-5d old, no CO₂ 24hr before.' },
  { name: 'Fly food prep (Bloomington)', category: 'maintenance', duration: '3hr for 600-800 vials', materials: 'Cornmeal, yeast, soy flour, agar, corn syrup, propionic acid', steps: '1. Per 1L: cornmeal 73g, yeast 17g, soy 10g, agar 5g\n2. Boil water, add dry ingredients\n3. Cook >90°C 10min\n4. Cool, add corn syrup 77mL\n5. Add propionic acid 5mL\n6. Dispense, cool, store 4°C', notes: 'Use within 2-3 weeks.' }
];

let data = { stocks: [], crosses: [], virgins: [], phenotypes: [], notes: [], protocols: [], calTasks: [], logs: [], settings: JSON.parse(JSON.stringify(defaultSettings)) };
window.__flyLabData = data;
let phenoCategories = [...defaultSettings.defaultPhenos];
let currentUser = null;
let currentProfile = null;
let activeStockFilter = 'all', activeCrossFilter = 'all', activeProtocolFilter = 'all', activeLogFilter = 'all';
let editingProtocolIdx = -1;
let pendingProtocolFile = null;
let authMode = 'login';
let unsubscribers = [];

const THEMES = [
  { id: 'garden',       name: 'Garden',       swatches: ['#f5f1e6', '#5a8a5e', '#2d2924'] },
  { id: 'garden-night', name: 'Garden Night', swatches: ['#161412', '#8fbf86', '#f0e7d2'] },
  { id: 'warm-dark',    name: 'Rose Quartz',  swatches: ['#f7f4f5', '#c98a9b', '#2c2429'] },
  { id: 'warm-light',   name: 'Sky Mist',     swatches: ['#f2f5f7', '#6fa3c0', '#232a30'] },
  { id: 'cool-dark',    name: 'Sage Paper',   swatches: ['#f3f6f2', '#7faa84', '#262d26'] },
  { id: 'midnight',     name: 'Lavender',     swatches: ['#f5f4f8', '#9a8fc4', '#28252e'] }
];
// Which themes count as "night" for the topbar sun/moon toggle — used to decide
// whether the toggle flips to the day or the night counterpart of the current theme.
const NIGHT_THEMES = new Set(['garden-night']);

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('flyLabTheme', id);
  renderThemePicker();
}
window.applyTheme = applyTheme;

// Topbar sun/moon button — flips Garden ↔ Garden Night.
// If the user is on any other theme, jumps them into Garden Night the first
// time they click and then toggles between Garden and Garden Night thereafter.
window.toggleDarkMode = function() {
  const current = document.documentElement.getAttribute('data-theme') || 'garden';
  const next = NIGHT_THEMES.has(current) ? 'garden' : 'garden-night';
  applyTheme(next);
};
function renderThemePicker() {
  const cont = document.getElementById('themePicker');
  if (!cont) return;
  const current = localStorage.getItem('flyLabTheme') || 'warm-dark';
  cont.innerHTML = THEMES.map(t => `
    <div class="theme-option ${t.id === current ? 'active' : ''}" onclick="applyTheme('${t.id}')">
      <div class="theme-swatches">${t.swatches.map(s => `<span class="theme-swatch" style="background:${s};"></span>`).join('')}</div>
      <div class="theme-name">${t.name}</div>
    </div>`).join('');
}
(function() { const saved = localStorage.getItem('flyLabTheme'); if (saved) document.documentElement.setAttribute('data-theme', saved); })();

function setSyncStatus(state) {
  const el = document.getElementById('syncStatus');
  const txt = document.getElementById('syncText');
  el.className = 'sync-status ' + (state === 'synced' ? '' : state);
  txt.textContent = state === 'synced' ? 'Synced' : state === 'syncing' ? 'Syncing...' : 'Offline';
}

function toast(msg, opts) {
  // Stack toasts by removing prior ones of same key (or all if no key)
  if (opts && opts.key) document.querySelectorAll(`.toast[data-key="${opts.key}"]`).forEach(n => n.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  if (opts && opts.key) t.dataset.key = opts.key;
  if (opts && opts.tone) t.classList.add('toast-' + opts.tone);
  const msgEl = document.createElement('span');
  msgEl.className = 'toast-msg';
  msgEl.textContent = msg;
  t.appendChild(msgEl);
  const ttl = (opts && opts.ttl) || 2500;
  if (opts && opts.actionLabel && typeof opts.onAction === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.actionLabel;
    btn.onclick = () => { try { opts.onAction(); } finally { t.remove(); } };
    t.appendChild(btn);
  }
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('toast-leaving'); setTimeout(() => t.remove(), 200); }, ttl);
  return t;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

/* ============================================================
   Comfort Wave utilities — smart defaults, FAB, sparklines,
   "Next up" widget, notifications, bulk select.
   ============================================================ */

// Smart defaults: remember the last non-empty value per form field
const DEFAULTS_KEY = 'flyLabDefaults';
function _loadDefaults() {
  try { return JSON.parse(localStorage.getItem(DEFAULTS_KEY) || '{}'); } catch (e) { return {}; }
}
function _saveDefaults(d) {
  try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d)); } catch (e) {}
}
function captureDefaults(formKey, fieldIds) {
  const store = _loadDefaults();
  store[formKey] = store[formKey] || {};
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = el.value;
    if (v != null && String(v).trim() !== '') store[formKey][id] = v;
  });
  _saveDefaults(store);
}
function applyDefaults(formKey, fieldIds) {
  const store = _loadDefaults();
  const remembered = store[formKey] || {};
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el || !remembered[id]) return;
    if (el.value == null || el.value === '' || el.value === '0') el.value = remembered[id];
  });
}
function applyAllDefaults() {
  applyDefaults('virgin', ['virginSource', 'virginContainer', 'virginTemp', 'virginSession']);
  applyDefaults('cross',  ['crossContainer', 'crossNFemales', 'crossNMales', 'crossTemp', 'crossGen']);
  applyDefaults('pheno',  ['phenoGen']);
  applyDefaults('stock',  ['stockType', 'stockSource', 'stockLocation', 'stockChrom']);
  applyDefaults('note',   ['noteTags']);
}

// FAB visibility per tab + click → scroll to the primary "+" form on the
// current tab and focus the first empty input inside it
const FAB_TABS = { stocks:1, crosses:1, virgins:1, phenotype:1, notebook:1, protocols:1 };
function updateFabVisibility() {
  const fab = document.getElementById('fab');
  if (!fab) return;
  const active = document.querySelector('.sidebar .tab-btn.active');
  const tab = active && active.dataset.tab;
  const show = !!FAB_TABS[tab];
  fab.classList.toggle('hidden', !show);
}
window.onFabClick = function() {
  const active = document.querySelector('.sidebar .tab-btn.active');
  const tab = active && active.dataset.tab;
  if (tab === 'protocols') { if (window.openProtocolModal) window.openProtocolModal(); return; }
  const tabEl = document.getElementById(tab);
  if (!tabEl) return;
  const primaryBtn = tabEl.querySelector('.btn-primary');
  if (!primaryBtn) return;
  const card = primaryBtn.closest('.card') || primaryBtn;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const firstInput = card.querySelector('input:not([type=checkbox]):not([type=hidden]), select, textarea');
  setTimeout(() => firstInput && firstInput.focus(), 300);
};

// Sparkline — tiny inline SVG line + filled area
function buildSparkline(values) {
  if (!values || values.length < 2) {
    return '<svg class="sparkline" viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M0,10 L100,10"/></svg>';
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const n = values.length;
  const w = 100, h = 20;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return [x, y];
  });
  const linePath = pts.map((p, i) => (i === 0 ? `M${p[0].toFixed(2)},${p[1].toFixed(2)}` : `L${p[0].toFixed(2)},${p[1].toFixed(2)}`)).join(' ');
  const fillPath = linePath + ` L${w},${h} L0,${h} Z`;
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path class="sparkline-fill" d="${fillPath}"/>
    <path d="${linePath}"/>
  </svg>`;
}

// "Next up" widget — picks the single most urgent action.
// Returns { ico, kicker, title, cta, action, tone } or a calm fallback.
function computeNextAction() {
  const now = new Date();
  const hour = now.getHours();
  const settings = data.settings || {};

  // 1. flip-overdue takes priority when anything is past flipCritDays
  const critDays = settings.flipCritDays || 14;
  const warnDays = settings.flipWarnDays || 10;
  const worstFlip = (data.stocks || []).map(s => {
    if (!s.flipDate) return null;
    const d = Math.floor((Date.now() - new Date(s.flipDate).getTime()) / 86400000);
    return d > warnDays ? { stock: s, days: d } : null;
  }).filter(Boolean).sort((a, b) => b.days - a.days)[0];
  if (worstFlip && worstFlip.days > critDays) {
    return {
      ico: '🔥',
      kicker: 'Flip overdue',
      title: `${worstFlip.stock.id} is ${worstFlip.days} days since last flip — flip now`,
      cta: 'Go to Stocks',
      action: () => jumpToStockType(''),
      tone: 'is-danger'
    };
  }

  // 2. critical-priority schedule items within the current hour
  const sched = (settings.schedule || []).filter(s => s.priority === 'critical');
  const sameHour = sched.find(s => {
    const t = parseInt((s.time || '').split(':')[0], 10);
    return !isNaN(t) && t === hour;
  });
  if (sameHour) {
    return {
      ico: '⏰',
      kicker: `Scheduled for ${sameHour.time}`,
      title: sameHour.desc,
      cta: 'Open calendar',
      action: () => { const btn = document.querySelector('.sidebar .tab-btn[data-tab="calendar"]'); if (btn) btn.click(); },
      tone: ''
    };
  }

  // 3. warn-level flips (between warn and crit)
  if (worstFlip) {
    return {
      ico: '⚠️',
      kicker: 'Flip due soon',
      title: `${worstFlip.stock.id} hits ${critDays}-day limit soon (${worstFlip.days}d since last flip)`,
      cta: 'Review',
      action: () => jumpToStockType(''),
      tone: ''
    };
  }

  // 4. virgin-window awareness — the next critical schedule slot today
  const upcoming = sched
    .map(s => ({ s, h: parseInt((s.time || '').split(':')[0], 10) }))
    .filter(x => !isNaN(x.h) && x.h > hour)
    .sort((a, b) => a.h - b.h)[0];
  if (upcoming) {
    return {
      ico: '🗓',
      kicker: `Upcoming · ${upcoming.s.time}`,
      title: upcoming.s.desc,
      cta: '',
      action: null,
      tone: 'is-calm'
    };
  }

  // 5. calm fallback
  return { ico: '☕', kicker: "What's next", title: 'Lab is calm — no urgent actions', cta: '', action: null, tone: 'is-calm' };
}
function renderNextAction() {
  const cont = document.getElementById('nextAction');
  if (!cont) return;
  const a = computeNextAction();
  cont.className = 'next-action ' + (a.tone || '');
  cont.innerHTML = `
    <div class="next-action-ico">${a.ico}</div>
    <div class="next-action-body">
      <div class="next-action-kicker">${escapeHtml(a.kicker)}</div>
      <div class="next-action-title">${escapeHtml(a.title)}</div>
    </div>
    ${a.cta ? `<button class="next-action-cta" type="button">${escapeHtml(a.cta)}</button>` : ''}`;
  const btn = cont.querySelector('.next-action-cta');
  if (btn && a.action) btn.addEventListener('click', (e) => { e.stopPropagation(); a.action(); });
  cont._action = a.action;
}
window.handleNextActionClick = function() {
  const cont = document.getElementById('nextAction');
  if (cont && cont._action) cont._action();
};

// Browser notifications for flip-due and virgin-window critical events
const NOTIF_PERM_KEY = 'flyLabNotifPerm';
const NOTIF_ENABLED_KEY = 'flyLabNotifEnabled';
const _firedNotifs = new Set();
function notifEnabled() {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  return localStorage.getItem(NOTIF_ENABLED_KEY) !== '0';
}
window.toggleNotifications = async function(checked) {
  if (!checked) {
    localStorage.setItem(NOTIF_ENABLED_KEY, '0');
    toast('Notifications off');
    return;
  }
  if (typeof Notification === 'undefined') {
    toast('This browser doesn\'t support notifications', { tone: 'error' });
    document.getElementById('notifToggle').checked = false;
    return;
  }
  if (Notification.permission === 'denied') {
    toast('Permission was blocked — enable it in browser settings', { tone: 'error', ttl: 5000 });
    document.getElementById('notifToggle').checked = false;
    return;
  }
  if (Notification.permission !== 'granted') {
    const ok = await confirmDialog({
      title: 'Send lab alerts to this device?',
      body: 'You\'ll get a quiet notification when a stock crosses the flip deadline or a virgin window is about to close. No external data is sent — alerts are computed right here.',
      confirmLabel: 'Allow'
    });
    if (!ok) { document.getElementById('notifToggle').checked = false; return; }
    const perm = await Notification.requestPermission();
    localStorage.setItem(NOTIF_PERM_KEY, perm);
    if (perm !== 'granted') {
      document.getElementById('notifToggle').checked = false;
      toast('Permission not granted', { tone: 'error' });
      return;
    }
  }
  localStorage.setItem(NOTIF_ENABLED_KEY, '1');
  toast('Notifications on', { tone: 'success' });
  checkAlerts();
};
// Notification cooldown so reopening the app doesn't fire the same alert
// multiple times in a row. Keyed in localStorage so it survives reloads.
const NOTIF_HISTORY_KEY = 'flyLabNotifHistory';
function _notifHistory() { try { return JSON.parse(localStorage.getItem(NOTIF_HISTORY_KEY) || '{}'); } catch (e) { return {}; } }
function _saveNotifHistory(h) { try { localStorage.setItem(NOTIF_HISTORY_KEY, JSON.stringify(h)); } catch (e) {} }

function fireNotif(key, title, body, opts) {
  opts = opts || {};
  const cooldownMs = (opts.cooldownHours != null ? opts.cooldownHours : 6) * 3600 * 1000;
  const hist = _notifHistory();
  if (hist[key] && Date.now() - hist[key] < cooldownMs) return;
  // Session-level dedupe (same instance)
  if (_firedNotifs.has(key)) return;
  _firedNotifs.add(key);
  hist[key] = Date.now();
  _saveNotifHistory(hist);
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: key, requireInteraction: !!opts.persistent }));
    } else {
      new Notification(title, { body, icon: 'icon-192.png', tag: key });
    }
  } catch (e) { /* graceful no-op */ }
}

// Schedule a notification at a specific future timestamp.
// Uses Notification Triggers (TimestampTrigger) when the browser supports it
// (Chrome desktop + Android in installed PWA mode). Falls back to a no-op
// elsewhere — the catch-up-on-open path will still surface the alert when
// the user next opens the app.
async function scheduleNotif(key, title, body, fireAt) {
  if (!notifEnabled()) return false;
  if (Date.now() >= fireAt) return false;
  if (typeof Notification === 'undefined' || !('showTrigger' in Notification.prototype)) return false;
  if (typeof TimestampTrigger === 'undefined') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    // Remove any prior scheduled notification for this key
    const existing = await reg.getNotifications({ tag: key, includeTriggered: false }).catch(() => []);
    existing.forEach(n => n.close && n.close());
    await reg.showNotification(title, {
      body, icon: 'icon-192.png', badge: 'icon-192.png', tag: key,
      showTrigger: new TimestampTrigger(fireAt),
      requireInteraction: true
    });
    return true;
  } catch (e) {
    return false;
  }
}
window.scheduleNotif = scheduleNotif;

function checkAlerts() {
  if (!notifEnabled()) return;
  const critDays = (data.settings && data.settings.flipCritDays) || 14;
  (data.stocks || []).forEach(s => {
    if (!s.flipDate) return;
    const d = Math.floor((Date.now() - new Date(s.flipDate).getTime()) / 86400000);
    if (d > critDays) {
      // 12-hour cooldown — if user reopens the app within 12hr, no repeat
      fireNotif(`flip-${s._id}`, '🔥 Flip overdue', `${s.id} is ${d} days since last flip.`, { cooldownHours: 12, persistent: true });
    }
  });
  // Virgin window: any virgin entry whose computed close time is within the next 30 min
  // AND schedule a future trigger (browsers that support it) so we get notified
  // even when the app is closed.
  const winHrs = (data.settings && data.settings.virginWindow25) || 12;
  (data.virgins || []).forEach(v => {
    if (!v.date || !v.time) return;
    const collected = new Date(`${v.date}T${v.time}`);
    if (isNaN(+collected)) return;
    const closesAt = collected.getTime() + winHrs * 3600 * 1000;
    const minsLeft = (closesAt - Date.now()) / 60000;
    if (minsLeft > 0 && minsLeft < 30) {
      fireNotif(`vw-${v._id}`, '⏰ Virgin window closing', `${v.source || 'a collection'} closes in ${Math.round(minsLeft)} min.`, { cooldownHours: 1, persistent: true });
    } else if (minsLeft >= 30 && minsLeft <= 48 * 60) {
      // Pre-schedule a trigger for 30 minutes before window close, where supported
      scheduleNotif(`vw-${v._id}`, '⏰ Virgin window closing', `${v.source || 'a collection'} closes in ~30 min.`, closesAt - 30 * 60 * 1000);
    }
  });
}
setInterval(() => { try { checkAlerts(); } catch (e) {} }, 60000);

// Bulk selection — Map<collection, Set<id>>
const bulkSel = { stocks: new Set(), crosses: new Set(), virgins: new Set(), phenotypes: new Set() };
function bulkActiveCollection() {
  const active = document.querySelector('.sidebar .tab-btn.active');
  const tab = active && active.dataset.tab;
  if (tab === 'stocks') return 'stocks';
  if (tab === 'crosses') return 'crosses';
  if (tab === 'virgins') return 'virgins';
  if (tab === 'phenotype') return 'phenotypes';
  return null;
}
function bulkUpdateBar() {
  const bar = document.getElementById('bulkBar');
  const countEl = document.getElementById('bulkBarCount');
  if (!bar || !countEl) return;
  const coll = bulkActiveCollection();
  const n = coll ? bulkSel[coll].size : 0;
  countEl.textContent = n;
  const visible = n > 0;
  bar.classList.toggle('is-visible', visible);
  document.body.classList.toggle('has-bulk-bar', visible);
}
window.bulkToggleRow = function(coll, id, checked) {
  if (!bulkSel[coll]) return;
  if (checked) bulkSel[coll].add(id); else bulkSel[coll].delete(id);
  bulkUpdateBar();
};
window.bulkClearSelection = function() {
  const coll = bulkActiveCollection();
  if (coll) bulkSel[coll].clear();
  document.querySelectorAll('.row-check:checked').forEach(c => c.checked = false);
  bulkUpdateBar();
};
window.bulkExport = function() {
  const coll = bulkActiveCollection();
  if (!coll) return;
  const ids = [...bulkSel[coll]];
  if (ids.length === 0) { toast('Nothing selected'); return; }
  const rows = (data[coll] || []).filter(r => ids.includes(r._id))
    .map(r => { const { _id, ...rest } = r; return rest; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), coll);
  XLSX.writeFile(wb, `flylab-${coll}-selection-${new Date().toISOString().split('T')[0]}.xlsx`);
  toast(`Exported ${ids.length} ${coll}`, { tone: 'success' });
};
window.bulkDelete = async function() {
  if (!canDelete()) { toast('No permission to delete'); return; }
  const coll = bulkActiveCollection();
  if (!coll) return;
  const ids = [...bulkSel[coll]];
  if (ids.length === 0) { toast('Nothing selected'); return; }
  const ok = await confirmDialog({
    title: `Delete ${ids.length} ${coll}?`,
    body: `This removes ${ids.length} record${ids.length === 1 ? '' : 's'}. You can undo for a few seconds.`,
    confirmLabel: `Delete ${ids.length}`,
    danger: true
  });
  if (!ok) return;
  const snapshots = ids.map(id => (data[coll] || []).find(r => r._id === id)).filter(Boolean);
  setSyncStatus('syncing');
  const results = await Promise.allSettled(ids.map(id => deleteDoc(doc(db, coll, id))));
  const done = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - done;
  logActivity('delete', coll, `Bulk-deleted ${done} ${coll}`);
  bulkSel[coll].clear();
  bulkUpdateBar();
  toast(`Deleted ${done}${failed ? ` · ${failed} failed` : ''}`, {
    key: 'bulk-undo',
    ttl: 7000,
    tone: failed ? 'error' : 'success',
    actionLabel: 'Undo all',
    onAction: async () => {
      setSyncStatus('syncing');
      const restoreResults = await Promise.allSettled(snapshots.map(rec => {
        const { _id, ...payload } = rec;
        return setDoc(doc(db, coll, _id), payload);
      }));
      const restored = restoreResults.filter(r => r.status === 'fulfilled').length;
      logActivity('edit', coll, `Bulk-restored ${restored} ${coll}`);
      toast(`Restored ${restored}`, { tone: 'success' });
    }
  });
};

// Field-level validation helper. Marks an input red with a message;
// auto-clears on next user input.
function flagField(elOrId, msg) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  el.classList.add('field-error');
  let msgEl = el.parentElement.querySelector('.field-error-msg[data-inline]');
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.className = 'field-error-msg';
    msgEl.setAttribute('data-inline', '1');
    el.parentElement.appendChild(msgEl);
  }
  msgEl.textContent = msg || 'Required';
  const clear = () => {
    el.classList.remove('field-error');
    msgEl.textContent = '';
    el.removeEventListener('input', clear);
    el.removeEventListener('change', clear);
  };
  el.addEventListener('input', clear);
  el.addEventListener('change', clear);
  el.focus();
}
window.flagField = flagField;

// Generic edit-record modal. `fields` is [{key,label,type?,options?,placeholder?,required?}]
function openEditModal({ title, fields, values, onSave, saveLabel = 'Save' }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  const inputs = fields.map(f => {
    const v = values[f.key] != null ? values[f.key] : '';
    const req = f.required ? ' required' : '';
    const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    let inp;
    if (f.type === 'textarea') inp = `<textarea data-key="${f.key}"${req}${ph}>${escapeHtml(v)}</textarea>`;
    else if (f.type === 'select') {
      const opts = (f.options || []).map(o => {
        const val = typeof o === 'object' ? o.value : o;
        const lab = typeof o === 'object' ? o.label : o;
        return `<option value="${escapeHtml(val)}" ${String(val) === String(v) ? 'selected' : ''}>${escapeHtml(lab || '(none)')}</option>`;
      }).join('');
      inp = `<select data-key="${f.key}"${req}>${opts}</select>`;
    }
    else inp = `<input type="${f.type || 'text'}" data-key="${f.key}" value="${escapeHtml(v)}"${req}${ph}>`;
    return `<div style="margin-bottom:12px;"><label>${escapeHtml(f.label)}</label>${inp}<div class="field-error-msg" data-error-for="${f.key}"></div></div>`;
  }).join('');
  bg.innerHTML = `<div class="modal edit-modal" role="dialog" aria-modal="true">
    <h3>${escapeHtml(title)}</h3>
    ${inputs}
    <div class="btn-row" style="justify-content:flex-end;">
      <button class="btn" data-act="cancel">Cancel</button>
      <button class="btn btn-primary" data-act="save">${escapeHtml(saveLabel)}</button>
    </div>
  </div>`;
  function close() {
    bg.classList.add('modal-leaving');
    setTimeout(() => bg.remove(), 180);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  }
  async function save() {
    const updates = {};
    let firstBad = null;
    bg.querySelectorAll('.field-error-msg').forEach(n => { n.textContent = ''; });
    bg.querySelectorAll('[data-key]').forEach(el => el.classList.remove('field-error'));
    for (const f of fields) {
      const el = bg.querySelector(`[data-key="${f.key}"]`);
      let v = el.value;
      if (f.required && !String(v).trim()) {
        el.classList.add('field-error');
        const msg = bg.querySelector(`[data-error-for="${f.key}"]`);
        if (msg) msg.textContent = `${f.label} is required`;
        if (!firstBad) firstBad = el;
        continue;
      }
      if (f.type === 'number') v = v === '' ? null : Number(v);
      updates[f.key] = v;
    }
    if (firstBad) { firstBad.focus(); return; }
    const btn = bg.querySelector('[data-act="save"]');
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await onSave(updates);
      close();
    } catch (e) {
      btn.disabled = false; btn.textContent = orig;
      toast('Save failed: ' + (e && e.message || 'unknown'), { tone: 'error' });
    }
  }
  bg.querySelector('[data-act="cancel"]').onclick = close;
  bg.querySelector('[data-act="save"]').onclick = save;
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  setTimeout(() => bg.querySelector('[data-key]')?.focus(), 50);
}
window.openEditModal = openEditModal;

// Styled confirm dialog — returns Promise<boolean>
function confirmDialog({ title = 'Are you sure?', body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal confirm-modal" role="dialog" aria-modal="true">
      <h3>${title}</h3>
      ${body ? `<p class="confirm-body">${body}</p>` : ''}
      <div class="btn-row" style="justify-content:flex-end;">
        <button class="btn" data-act="cancel">${cancelLabel}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${confirmLabel}</button>
      </div>
    </div>`;
    function close(val) {
      bg.classList.add('modal-leaving');
      setTimeout(() => bg.remove(), 180);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
    }
    bg.addEventListener('click', e => { if (e.target === bg) close(false); });
    bg.querySelector('[data-act="cancel"]').onclick = () => close(false);
    bg.querySelector('[data-act="ok"]').onclick = () => close(true);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    setTimeout(() => bg.querySelector('[data-act="ok"]').focus(), 50);
  });
}
window.confirmDialog = confirmDialog;

window.switchAuthTab = function(mode) {
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('signupNameRow').classList.toggle('hidden', mode === 'login');
  document.getElementById('authSubmit').textContent = mode === 'login' ? 'Sign in' : 'Create account';
  document.getElementById('authError').classList.add('hidden');
};

window.submitAuth = async function() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.classList.add('hidden');
  if (!email || !password) { showAuthError('Enter email and password'); return; }
  try {
    if (authMode === 'signup') {
      const name = document.getElementById('authName').value.trim();
      if (!name) { showAuthError('Enter your name'); return; }
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), { name, email, role: 'regular', created: Date.now() });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (e) {
    showAuthError(translateError(e.code));
  }
};

function showAuthError(msg) {
  const errEl = document.getElementById('authError');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
}
function translateError(code) {
  const map = {
    'auth/invalid-email': 'Invalid email address',
    'auth/user-not-found': 'No account with this email',
    'auth/wrong-password': 'Wrong password',
    'auth/invalid-credential': 'Wrong email or password',
    'auth/email-already-in-use': 'Email already registered — try signing in',
    'auth/weak-password': 'Password must be at least 6 characters'
  };
  return map[code] || ('Error: ' + code);
}

window.logout = async function() {
  if (!await confirmDialog({ title: 'Log out?', body: `Signed in as ${currentProfile && currentProfile.name}.`, confirmLabel: 'Log out' })) return;
  await logActivity('logout', 'system', `${currentProfile.name} logged out`);
  unsubscribers.forEach(u => u());
  unsubscribers = [];
  await signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const profileSnap = await getDoc(doc(db, 'users', user.uid));
    if (!profileSnap.exists()) {
      currentProfile = { name: user.email.split('@')[0], email: user.email, role: 'regular' };
      await setDoc(doc(db, 'users', user.uid), { ...currentProfile, created: Date.now() });
    } else {
      currentProfile = profileSnap.data();
    }
    enterApp();
  } else {
    currentUser = null;
    currentProfile = null;
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
  }
});

function enterApp() {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('userAvatar').textContent = currentProfile.name.charAt(0).toUpperCase();
  document.getElementById('userName').textContent = currentProfile.name;
  document.getElementById('userRole').textContent = roleLabel(currentProfile.role);
  document.getElementById('welcomeName').textContent = currentProfile.name;
  const isSuperAdmin = currentProfile.role === 'super_admin';
  document.getElementById('logsTab').style.display = isSuperAdmin ? '' : 'none';
  document.getElementById('usersTab').style.display = isSuperAdmin ? '' : 'none';
  applyPermissions();
  renderThemePicker();
  paintSkeletons();
  subscribeAll();
  setToday();
  renderPhenoCounters();
  applyAllDefaults();
  updateFabVisibility();
  // Hydrate the notifications toggle from saved state
  const notifToggle = document.getElementById('notifToggle');
  if (notifToggle) notifToggle.checked = notifEnabled();
  logActivity('login', 'system', `${currentProfile.name} logged in`);
}

// Paint shimmer placeholder rows into every record table until first Firestore snapshot fills them.
function paintSkeletons() {
  const targets = [
    { id: 'stockTableBody', cols: 9 },
    { id: 'crossTableBody', cols: 9 },
    { id: 'virginTableBody', cols: 10 },
    { id: 'phenoTableBody', cols: 8 },
    { id: 'logTableBody', cols: 6 },
    { id: 'usersTableBody', cols: 6 }
  ];
  targets.forEach(t => {
    const el = document.getElementById(t.id);
    if (!el || el.children.length > 0) return;
    let rows = '';
    for (let i = 0; i < 4; i++) {
      let cells = '';
      for (let c = 0; c < t.cols; c++) cells += '<td><span>—</span></td>';
      rows += `<tr class="sk-row">${cells}</tr>`;
    }
    el.innerHTML = rows;
  });
  // Notes & protocols are card lists, not tables — light skeleton blocks
  const lists = ['notesList', 'protocolsList'];
  lists.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.children.length > 0) return;
    el.innerHTML = '<div class="sk-block" style="height:64px;"></div><div class="sk-block" style="height:64px;"></div><div class="sk-block" style="height:64px;"></div>';
  });
}

function roleLabel(r) {
  if (r === 'super_admin') return '⭐ Super Admin';
  if (r === 'admin') return '🛡️ Admin';
  return 'Regular';
}
function canEdit() { return currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'super_admin'); }
function canDelete() { return currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'super_admin'); }
function canManageRoles() { return currentProfile && currentProfile.role === 'super_admin'; }

function applyPermissions() {
  document.body.classList.toggle('no-edit', !canEdit());
}

const COLLECTIONS = ['stocks', 'crosses', 'virgins', 'phenotypes', 'notes', 'protocols', 'calTasks'];

function subscribeAll() {
  setSyncStatus('syncing');
  unsubscribers.push(onSnapshot(doc(db, 'config', 'settings'), (snap) => {
    if (snap.exists()) { data.settings = { ...JSON.parse(JSON.stringify(defaultSettings)), ...snap.data() }; }
    else { setDoc(doc(db, 'config', 'settings'), data.settings); }
    if (!data.settings.recurringTasks) data.settings.recurringTasks = [...defaultSettings.recurringTasks];
    populateSelects(); renderDashboardSchedule(); renderScheduleSettings(); renderTempSettings(); renderStockTypes(); renderDefaultPhenos(); loadSettingsInputs(); renderStockFilters(); refreshDashboard();
  }));

  COLLECTIONS.forEach(coll => {
    unsubscribers.push(onSnapshot(collection(db, coll), (snap) => {
      data[coll] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      renderCollection(coll);
      refreshDashboard();
      setSyncStatus('synced');
    }, (err) => { console.error(err); setSyncStatus('offline'); }));
  });

  unsubscribers.push(onSnapshot(query(collection(db, 'logs'), orderBy('timestamp', 'desc')), (snap) => {
    data.logs = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    if (currentProfile && currentProfile.role === 'super_admin') renderLogs();
  }));

  unsubscribers.push(onSnapshot(collection(db, 'users'), (snap) => {
    data.users = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    if (currentProfile && currentProfile.role === 'super_admin') renderUsers();
  }));
}

function renderCollection(coll) {
  if (coll === 'stocks') renderStocks();
  else if (coll === 'crosses') renderCrosses();
  else if (coll === 'virgins') renderVirgins();
  else if (coll === 'phenotypes') renderPhenotypes();
  else if (coll === 'notes') renderNotes();
  else if (coll === 'protocols') renderProtocols();
  else if (coll === 'calTasks') renderCalendarDay();
}

// app.js loads as an ES module, so top-level `function foo` is NOT global.
// Expose every renderer called from inline HTML oninput="renderXxx()" handlers
// (search bars, filter inputs) so those events actually fire something.
window.renderStocks      = (...a) => renderStocks(...a);
window.renderCrosses     = (...a) => renderCrosses(...a);
window.renderVirgins     = (...a) => renderVirgins(...a);
window.renderPhenotypes  = (...a) => renderPhenotypes(...a);
window.renderNotes       = (...a) => renderNotes(...a);
window.renderProtocols   = (...a) => renderProtocols(...a);
window.renderLogs        = (...a) => renderLogs(...a);

async function dbAdd(coll, obj) {
  setSyncStatus('syncing');
  obj.createdBy = currentProfile.name;
  obj.created = Date.now();
  await addDoc(collection(db, coll), obj);
}
async function dbDelete(coll, id) {
  setSyncStatus('syncing');
  await deleteDoc(doc(db, coll, id));
}

// Confirm + delete + undo toast. Restores record at same Firestore id.
async function deleteWithUndo({ coll, id, label, module, body }) {
  if (!canDelete()) { toast('No permission to delete'); return false; }
  const rec = (data[coll] || []).find(x => x._id === id);
  if (!rec) return false;
  const ok = await confirmDialog({
    title: `Delete ${label}?`,
    body: body || 'You can undo for a few seconds.',
    confirmLabel: 'Delete',
    danger: true
  });
  if (!ok) return false;
  const { _id, ...payload } = rec;
  setSyncStatus('syncing');
  await deleteDoc(doc(db, coll, id));
  logActivity('delete', module, `Deleted ${label}`);
  toast('Deleted', {
    key: 'undo-' + id,
    ttl: 6000,
    actionLabel: 'Undo',
    onAction: async () => {
      try {
        setSyncStatus('syncing');
        await setDoc(doc(db, coll, id), payload);
        logActivity('edit', module, `Restored ${label}`);
        toast('Restored', { tone: 'success' });
      } catch (e) {
        toast('Restore failed', { tone: 'error' });
      }
    }
  });
  return true;
}
async function dbUpdate(coll, id, obj) {
  setSyncStatus('syncing');
  await updateDoc(doc(db, coll, id), obj);
}
async function saveSettingsToCloud() {
  setSyncStatus('syncing');
  await setDoc(doc(db, 'config', 'settings'), data.settings);
}

async function logActivity(action, module, details) {
  if (!currentProfile) return;
  try {
    await addDoc(collection(db, 'logs'), {
      user: currentProfile.name, role: currentProfile.role,
      action, module, details, timestamp: Date.now()
    });
  } catch (e) { console.error('log failed', e); }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
    refreshDashboard();
    if (btn.dataset.tab === 'logs') renderLogs();
    if (btn.dataset.tab === 'calendar') renderCalendarDay();
    if (btn.dataset.tab === 'users') renderUsers();
    // Comfort Wave: show/hide FAB based on tab + reset bulk-bar to active tab
    updateFabVisibility();
    bulkUpdateBar();
  });
});

function setToday() {
  const today = new Date().toISOString().split('T')[0];
  ['stockFlipDate', 'crossDate', 'virginDate', 'phenoDate', 'noteDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
  const now = new Date();
  const vt = document.getElementById('virginTime');
  if (vt && !vt.value) vt.value = now.toTimeString().slice(0, 5);
  const dd = document.getElementById('dateDisplay');
  if (dd) dd.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function populateSelects() {
  const st = document.getElementById('stockType');
  if (st) st.innerHTML = data.settings.stockTypes.map(t => `<option value="${t}">${t}</option>`).join('');
  const vt = document.getElementById('virginTemp');
  if (vt) vt.innerHTML = data.settings.temps.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
  const va = document.getElementById('virginAlertText');
  if (va) va.textContent = `Adults don't mate for ~10hr after eclosion. Collect within ${data.settings.virginWindow25}hr at 25°C (${data.settings.virginWindow18}hr at 18°C).`;
  const cts = document.getElementById('calTaskSelect');
  if (cts) { const rt = normalizeRecurring(); cts.innerHTML = rt.map(t => `<option value="${t.name.replace(/"/g,'&quot;')}">${t.name}</option>`).join(''); }
  renderRecurTaskList();
  // Keep phenotype categories in sync with the configured defaults so the
  // scoring tab always has counters ready before the user saves.
  if (Array.isArray(data.settings.defaultPhenos) && data.settings.defaultPhenos.length) {
    phenoCategories = [...data.settings.defaultPhenos];
    renderPhenoCounters();
  }
}

function normalizeRecurring() {
  if (!data.settings.recurringTasks) data.settings.recurringTasks = [];
  data.settings.recurringTasks = data.settings.recurringTasks.map(t =>
    typeof t === 'string' ? { name: t, color: '#4a9eff' } : { name: t.name, color: t.color || '#4a9eff' }
  );
  return data.settings.recurringTasks;
}

function colorForTask(taskName) {
  const rt = normalizeRecurring();
  const found = rt.find(t => t.name === taskName);
  return found ? found.color : '#888888';
}

function renderRecurTaskList() {
  const cont = document.getElementById('recurTaskList');
  if (!cont) return;
  const rt = normalizeRecurring();
  if (rt.length === 0) { cont.innerHTML = '<p style="color:var(--text-3); font-size:13px;">No recurring tasks yet</p>'; return; }
  cont.innerHTML = `<div class="setting-group">${rt.map((t, i) => `
    <div class="setting-row">
      <div style="display:flex; gap:8px; align-items:center; flex:1;">
        <input type="color" value="${t.color}" onchange="updateRecurColor(${i}, this.value)" style="width:40px; height:34px; padding:2px; cursor:pointer;">
        <input type="text" value="${t.name.replace(/"/g,'&quot;')}" onchange="updateRecurTask(${i}, this.value)">
      </div>
      <button class="action-btn delete" onclick="removeRecurTask(${i})">🗑</button>
    </div>`).join('')}</div>`;
}
window.updateRecurTask = async function(i, value) { normalizeRecurring(); data.settings.recurringTasks[i].name = value; await saveSettingsToCloud(); };
window.updateRecurColor = async function(i, value) { normalizeRecurring(); data.settings.recurringTasks[i].color = value; await saveSettingsToCloud(); };
window.addRecurTask = async function() {
  const inp = document.getElementById('newRecurTask');
  const v = inp.value.trim();
  if (!v) { toast('Enter a task'); return; }
  normalizeRecurring();
  const palette = ['#4a9eff','#d95b5b','#4caf50','#e8b14e','#b06bb0','#5bc8d9','#f5a962','#7dd85d'];
  const color = palette[data.settings.recurringTasks.length % palette.length];
  data.settings.recurringTasks.push({ name: v, color });
  await saveSettingsToCloud();
  inp.value = '';
  logActivity('edit', 'calendar', `Added recurring task "${v}"`);
  toast('Task added to list');
};
window.removeRecurTask = async function(i) {
  data.settings.recurringTasks.splice(i, 1);
  await saveSettingsToCloud();
};

window.addCalTask = async function() {
  const date = calSelectedDate;
  const task = document.getElementById('calTaskSelect').value;
  if (!date) { toast('Select a day first'); return; }
  if (!task) { toast('Pick a task'); return; }
  await dbAdd('calTasks', { date, task, color: colorForTask(task), done: false });
  logActivity('create', 'Calendar', `Added "${task}" to ${date}`);
  toast('Task added');
};
window.toggleCalTask = async function(id) {
  const t = data.calTasks.find(x => x._id === id);
  await dbUpdate('calTasks', id, { done: !t.done });
};
window.deleteCalTask = async function(id) {
  const t = data.calTasks.find(x => x._id === id); if (!t) return;
  await deleteWithUndo({ coll: 'calTasks', id, label: `task "${t.task}"`, module: 'Calendar' });
};

let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth();
let calSelectedDate = new Date().toISOString().split('T')[0];

window.calMonthShift = function(delta) {
  calViewMonth += delta;
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  renderCalendarGrid();
};
window.calGoToday = function() {
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();
  calSelectedDate = now.toISOString().split('T')[0];
  renderCalendarGrid();
  renderCalendarDay();
};
window.calSelectDay = function(dateStr) {
  calSelectedDate = dateStr;
  renderCalendarGrid();
  renderCalendarDay();
};

function dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function renderCalendarGrid() {
  const grid = document.getElementById('calGrid');
  if (!grid) return;
  const label = document.getElementById('calMonthLabel');
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (label) label.textContent = `${monthNames[calViewMonth]} ${calViewYear}`;

  const todayStr = new Date().toISOString().split('T')[0];
  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

  const tasksByDay = {};
  (data.calTasks || []).forEach(t => {
    if (!tasksByDay[t.date]) tasksByDay[t.date] = { total: 0, done: 0, colors: [] };
    tasksByDay[t.date].total++;
    if (t.done) tasksByDay[t.date].done++;
    const c = t.color || colorForTask(t.task);
    if (!tasksByDay[t.date].colors.includes(c)) tasksByDay[t.date].colors.push(c);
  });

  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateKey(calViewYear, calViewMonth, d);
    const info = tasksByDay[ds];
    const cls = ['cal-cell'];
    if (ds === todayStr) cls.push('today');
    if (ds === calSelectedDate) cls.push('selected');
    let dots = '';
    if (info) {
      dots = '<div class="cal-badge">' + info.colors.slice(0, 5).map(c => `<span class="cal-dot" style="background:${c};"></span>`).join('') + '</div>';
    }
    const countTxt = info ? `<div class="cal-count">${info.done}/${info.total}</div>` : '';
    html += `<div class="${cls.join(' ')}" onclick="calSelectDay('${ds}')"><div class="cal-daynum">${d}</div>${countTxt}${dots}</div>`;
  }
  grid.innerHTML = html;

  const legend = document.getElementById('calLegend');
  if (legend) {
    const rt = normalizeRecurring();
    legend.innerHTML = rt.map(t => `<div style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted);"><span style="width:12px; height:12px; border-radius:50%; background:${t.color}; display:inline-block;"></span>${t.name}</div>`).join('');
  }
}

function renderCalendarDay() {
  renderCalendarGrid();
  const label = document.getElementById('calDateLabel');
  if (label && calSelectedDate) label.textContent = new Date(calSelectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const cont = document.getElementById('calDayTasks');
  if (!cont) return;
  const tasks = (data.calTasks || []).filter(t => t.date === calSelectedDate).sort((a,b) => (a.created||0)-(b.created||0));
  if (tasks.length === 0) { cont.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>No tasks for this day. Add one above.</p></div>'; return; }
  const done = tasks.filter(t => t.done).length;
  cont.innerHTML = `<p style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">${done}/${tasks.length} completed</p>` + tasks.map(t => {
    const c = t.color || colorForTask(t.task);
    return `
    <li class="task-item" style="border-left:4px solid ${c}; ${t.done ? 'opacity:0.55;' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleCalTask('${t._id}')" style="width:20px; height:20px; cursor:pointer; flex:none;">
      <span class="task-desc" style="${t.done ? 'text-decoration:line-through;' : ''}">${t.task}</span>
      ${t.createdBy ? `<span style="font-size:11px; color:var(--text-3);">${t.createdBy}</span>` : ''}
      <button class="action-btn delete" onclick="deleteCalTask('${t._id}')">🗑</button>
    </li>`; }).join('');
}

function renderDashboardSchedule() {
  const list = document.getElementById('dailySchedule');
  if (!list) return;
  list.innerHTML = data.settings.schedule.map(s => `<li class="task-item"><span class="task-time">${s.time}</span><span class="task-desc">${s.desc}</span>${s.priority === 'critical' ? '<span class="task-priority">Critical</span>' : ''}</li>`).join('');
}

window.updateSchedule = function(i, key, value) { data.settings.schedule[i][key] = value; };
window.addScheduleItem = function() { data.settings.schedule.push({ time: '12:00', desc: 'New task', priority: '' }); renderScheduleSettings(); renderDashboardSchedule(); };
window.removeSchedule = function(i) { data.settings.schedule.splice(i, 1); renderScheduleSettings(); renderDashboardSchedule(); };
function renderScheduleSettings() {
  const cont = document.getElementById('scheduleSettings');
  if (!cont) return;
  cont.innerHTML = data.settings.schedule.map((s, i) => `
    <div class="setting-row"><div style="display:flex; gap:10px; align-items:center; flex:1;">
      <input type="time" value="${s.time}" onchange="updateSchedule(${i}, 'time', this.value)" style="width:110px;">
      <input type="text" value="${s.desc}" onchange="updateSchedule(${i}, 'desc', this.value)">
      <label class="toggle toggle-sm toggle-danger" title="Mark as critical">
        <input type="checkbox" ${s.priority === 'critical' ? 'checked' : ''} onchange="updateSchedule(${i}, 'priority', this.checked ? 'critical' : '')">
        <span class="toggle-track"></span>
        <span class="toggle-text">Critical</span>
      </label>
    </div><button class="action-btn delete" onclick="removeSchedule(${i})">🗑</button></div>`).join('');
}

window.updateTemp = function(i, key, value) { data.settings.temps[i][key] = value; populateSelects(); };
window.addTempPreset = function() { data.settings.temps.push({ value: '22', label: 'Custom' }); renderTempSettings(); populateSelects(); };
window.removeTemp = function(i) { data.settings.temps.splice(i, 1); renderTempSettings(); populateSelects(); };
function renderTempSettings() {
  const cont = document.getElementById('tempSettings');
  if (!cont) return;
  cont.innerHTML = data.settings.temps.map((t, i) => `
    <div class="setting-row"><div style="display:flex; gap:8px; align-items:center; flex:1;">
      <input type="number" step="0.1" value="${t.value}" onchange="updateTemp(${i}, 'value', this.value)" style="width:80px;"><span style="color:var(--text-muted);">°C</span>
      <input type="text" value="${t.label}" onchange="updateTemp(${i}, 'label', this.value)">
    </div><button class="action-btn delete" onclick="removeTemp(${i})">🗑</button></div>`).join('');
}

window.updateStockType = function(i, value) { data.settings.stockTypes[i] = value; populateSelects(); };
window.addStockType = function() { const n = prompt('New stock type:'); if (n) { data.settings.stockTypes.push(n); renderStockTypes(); populateSelects(); renderStockFilters(); } };
window.removeStockType = async function(i) {
  const name = data.settings.stockTypes[i];
  if (!await confirmDialog({ title: 'Remove stock type?', body: `"${name}" will be removed from the list. Existing stocks keep their value.`, confirmLabel: 'Remove', danger: true })) return;
  data.settings.stockTypes.splice(i, 1); renderStockTypes(); populateSelects(); renderStockFilters();
};
function renderStockTypes() {
  const cont = document.getElementById('stockTypesList');
  if (!cont) return;
  cont.innerHTML = `<div class="setting-group">${data.settings.stockTypes.map((t, i) => `<div class="setting-row"><input type="text" value="${t}" onchange="updateStockType(${i}, this.value)"><button class="action-btn delete" onclick="removeStockType(${i})">🗑</button></div>`).join('')}</div>`;
}

window.updateDefaultPheno = function(i, value) { data.settings.defaultPhenos[i] = value; };
window.addDefaultPheno = function() { const n = prompt('New phenotype:'); if (n) { data.settings.defaultPhenos.push(n); renderDefaultPhenos(); } };
window.removeDefaultPheno = function(i) { data.settings.defaultPhenos.splice(i, 1); renderDefaultPhenos(); };
function renderDefaultPhenos() {
  const cont = document.getElementById('defaultPhenosList');
  if (!cont) return;
  cont.innerHTML = `<div class="setting-group">${data.settings.defaultPhenos.map((p, i) => `<div class="setting-row"><input type="text" value="${p}" onchange="updateDefaultPheno(${i}, this.value)"><button class="action-btn delete" onclick="removeDefaultPheno(${i})">🗑</button></div>`).join('')}</div>`;
}

window.saveSettings = async function() {
  data.settings.flipWarnDays = parseInt(document.getElementById('flipWarnDays').value) || 10;
  data.settings.flipCritDays = parseInt(document.getElementById('flipCritDays').value) || 14;
  data.settings.virginWindow25 = parseInt(document.getElementById('virginWindow25').value) || 12;
  data.settings.virginWindow18 = parseInt(document.getElementById('virginWindow18').value) || 18;
  await saveSettingsToCloud();
  populateSelects(); renderDashboardSchedule(); refreshDashboard();
  logActivity('edit', 'settings', 'Updated lab settings');
  toast('Settings saved to cloud');
};
function loadSettingsInputs() {
  if (document.getElementById('flipWarnDays')) {
    document.getElementById('flipWarnDays').value = data.settings.flipWarnDays;
    document.getElementById('flipCritDays').value = data.settings.flipCritDays;
    document.getElementById('virginWindow25').value = data.settings.virginWindow25;
    document.getElementById('virginWindow18').value = data.settings.virginWindow18;
  }
}

window.renderStockFilters = function() {
  const cont = document.getElementById('stockFilters');
  if (!cont) return;
  const types = ['all', ...data.settings.stockTypes, 'flip-due'];
  cont.innerHTML = types.map(t => `<div class="filter-chip ${t === activeStockFilter ? 'active' : ''}" onclick="filterStocks('${t}', this)" ${t === 'flip-due' ? 'style="color:var(--warn);"' : ''}>${t === 'all' ? 'All' : t === 'flip-due' ? '⚠ Flip due' : t}</div>`).join('');
};
function renderStockFilters() { window.renderStockFilters(); }
window.filterStocks = function(filter, el) { activeStockFilter = filter; document.querySelectorAll('#stocks .filter-chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); renderStocks(); };

window.addStock = async function() {
  const stock = {
    id: document.getElementById('stockId').value.trim(),
    genotype: document.getElementById('stockGenotype').value.trim(),
    name: document.getElementById('stockName').value.trim(),
    type: document.getElementById('stockType').value,
    source: document.getElementById('stockSource').value.trim(),
    location: document.getElementById('stockLocation').value.trim(),
    flipDate: document.getElementById('stockFlipDate').value,
    chrom: document.getElementById('stockChrom').value,
    notes: document.getElementById('stockNotes').value.trim()
  };
  if (!stock.id) { flagField('stockId', 'Stock ID is required'); return; }
  try {
    await dbAdd('stocks', stock);
    logActivity('create', 'Stocks', `Added stock "${stock.id}" (${stock.genotype})`);
    captureDefaults('stock', ['stockType', 'stockSource', 'stockLocation', 'stockChrom']);
    ['stockId','stockGenotype','stockName','stockSource','stockLocation','stockNotes'].forEach(id => document.getElementById(id).value = '');
    toast('Stock added', { tone: 'success' });
  } catch (e) {
    console.error('addStock failed', e);
    toast('Save failed: ' + (e && e.message || 'unknown'), { tone: 'error', ttl: 5000 });
    setSyncStatus('offline');
  }
};
window.deleteStock = async function(id) {
  const s = data.stocks.find(x => x._id === id); if (!s) return;
  await deleteWithUndo({ coll: 'stocks', id, label: `stock "${s.id}"`, module: 'Stocks' });
};
window.editStock = function(id) {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const s = data.stocks.find(x => x._id === id); if (!s) return;
  openEditModal({
    title: `Edit stock ${s.id}`,
    values: s,
    fields: [
      { key: 'id', label: 'Stock ID', required: true },
      { key: 'genotype', label: 'Genotype', placeholder: 'e.g., w[1118]; +; +' },
      { key: 'name', label: 'Common name' },
      { key: 'type', label: 'Type', type: 'select', options: ['', ...(data.settings.stockTypes || [])] },
      { key: 'source', label: 'Source' },
      { key: 'location', label: 'Location' },
      { key: 'flipDate', label: 'Last flip date', type: 'date' },
      { key: 'chrom', label: 'Chromosome', type: 'select', options: ['', 'X', '2', '3', '4'] },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    onSave: async (updates) => {
      await dbUpdate('stocks', id, updates);
      logActivity('edit', 'Stocks', `Edited stock "${updates.id || s.id}"`);
      toast('Stock updated', { tone: 'success' });
    }
  });
};
window.markFlipped = async function(id) {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const s = data.stocks.find(x => x._id === id);
  await dbUpdate('stocks', id, { flipDate: new Date().toISOString().split('T')[0] });
  logActivity('edit', 'Stocks', `Flipped stock "${s.id}"`);
  toast('Flipped today', { tone: 'success' });
};

// Returns the currently-visible stocks given search + filter inputs.
// Shared by renderStocks (for display) and flipAllFiltered (for bulk action).
function currentlyFilteredStocks() {
  const search = (document.getElementById('stockSearch')?.value || '').toLowerCase().trim();
  const filterId = (document.getElementById('stockFilterId')?.value || '').toLowerCase().trim();
  const filterLoc = (document.getElementById('stockFilterLocation')?.value || '').toLowerCase().trim();
  const warnDays = data.settings.flipWarnDays;
  return data.stocks.filter(s => {
    if (search && !`${s.id || ''} ${s.genotype || ''} ${s.name || ''} ${s.location || ''}`.toLowerCase().includes(search)) return false;
    if (filterId && !(s.id || '').toLowerCase().includes(filterId)) return false;
    if (filterLoc && !(s.location || '').toLowerCase().includes(filterLoc)) return false;
    if (activeStockFilter === 'all') return true;
    if (activeStockFilter === 'flip-due') { if (!s.flipDate) return false; return (Date.now() - new Date(s.flipDate).getTime()) / 86400000 > warnDays; }
    return s.type === activeStockFilter;
  });
}

window.flipAllFiltered = async function() {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const list = currentlyFilteredStocks();
  if (list.length === 0) { toast('Nothing to flip in the current filter'); return; }
  const ok = await confirmDialog({
    title: `Flip all ${list.length} stock${list.length === 1 ? '' : 's'}?`,
    body: `Marks every stock in the current filter as flipped today (${new Date().toISOString().split('T')[0]}). This writes to ${list.length} document${list.length === 1 ? '' : 's'} — it cannot be undone in one click.`,
    confirmLabel: `Flip ${list.length}`,
  });
  if (!ok) return;
  const today = new Date().toISOString().split('T')[0];
  const btn = document.getElementById('flipAllBtn');
  if (btn) { btn.disabled = true; btn.textContent = `Flipping ${list.length}…`; }
  let done = 0, failed = 0;
  // Run in small parallel chunks to avoid hammering Firestore.
  const CHUNK = 10;
  for (let i = 0; i < list.length; i += CHUNK) {
    const batch = list.slice(i, i + CHUNK);
    const results = await Promise.allSettled(batch.map(s => dbUpdate('stocks', s._id, { flipDate: today })));
    results.forEach(r => { if (r.status === 'fulfilled') done++; else failed++; });
  }
  logActivity('edit', 'Stocks', `Bulk-flipped ${done} stock${done === 1 ? '' : 's'} (filter: ${describeStockFilter()})`);
  if (failed === 0) toast(`Flipped ${done} stock${done === 1 ? '' : 's'}`, { tone: 'success' });
  else toast(`Flipped ${done}, ${failed} failed`, { tone: 'error', ttl: 5000 });
  // Button gets re-enabled on the next render
};

function describeStockFilter() {
  const parts = [];
  const search = document.getElementById('stockSearch')?.value.trim();
  const fId = document.getElementById('stockFilterId')?.value.trim();
  const fLoc = document.getElementById('stockFilterLocation')?.value.trim();
  if (search) parts.push(`search="${search}"`);
  if (fId) parts.push(`id~"${fId}"`);
  if (fLoc) parts.push(`location~"${fLoc}"`);
  if (activeStockFilter !== 'all') parts.push(`type=${activeStockFilter}`);
  return parts.length ? parts.join(', ') : 'all';
}

function renderStocks() {
  const tbody = document.getElementById('stockTableBody');
  if (!tbody) return;
  const filtered = currentlyFilteredStocks();
  document.getElementById('stockTotalCount').textContent = data.stocks.length;
  const countEl = document.getElementById('flipAllCount');
  if (countEl) countEl.textContent = filtered.length;
  const flipAllBtn = document.getElementById('flipAllBtn');
  if (flipAllBtn) {
    flipAllBtn.disabled = filtered.length === 0;
    // Restore label in case a previous bulk-flip left it as "Flipping…"
    flipAllBtn.innerHTML = `↻ Flip all in current filter (<span id="flipAllCount">${filtered.length}</span>)`;
  }
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-3);">No stocks match the current filter</td></tr>'; return; }
  const warnDays = data.settings.flipWarnDays, critDays = data.settings.flipCritDays;
  tbody.innerHTML = filtered.map(s => {
    const days = s.flipDate ? Math.floor((Date.now() - new Date(s.flipDate).getTime()) / 86400000) : null;
    let flipStatus = '—', status = '<span class="badge b-active">OK</span>';
    if (days !== null) {
      if (days > critDays) { flipStatus = `<span style="color:var(--danger);">⚠ ${days}d</span>`; status = '<span class="badge b-danger">FLIP NOW</span>'; }
      else if (days > warnDays) { flipStatus = `<span style="color:var(--warn);">${days}d</span>`; status = '<span class="badge b-warn">Soon</span>'; }
      else flipStatus = `<span style="color:var(--ok);">${days}d</span>`;
    }
    return `<tr data-record-id="${s._id}"><td class="row-check-col can-edit-only"><input type="checkbox" class="row-check" data-coll="stocks" data-id="${s._id}" onchange="bulkToggleRow('stocks', '${s._id}', this.checked)" ${bulkSel.stocks.has(s._id) ? 'checked' : ''}></td><td><strong>${s.id}</strong>${s.name ? '<br><span style="font-size:11px;color:var(--text-muted);">' + s.name + '</span>' : ''}</td>
      <td style="font-family:monospace; font-size:12px;">${s.genotype || '—'}</td><td>${s.type || '—'}</td><td>${s.source || '—'}</td>
      <td style="font-family:monospace; font-size:12px;">${s.location || '—'}</td><td>${flipStatus}</td><td>${status}</td>
      <td style="white-space:nowrap;"><button class="action-btn edit-btn" title="Mark flipped today" onclick="markFlipped('${s._id}')">↻</button><button class="action-btn edit-btn" title="Edit" onclick="editStock('${s._id}')">✏️</button><button class="action-btn delete" title="Delete" onclick="deleteStock('${s._id}')">🗑</button></td></tr>`;
  }).join('');
}

window.addCross = async function() {
  const cross = {
    id: document.getElementById('crossId').value.trim(),
    gen: document.getElementById('crossGen').value,
    date: document.getElementById('crossDate').value,
    female: document.getElementById('crossFemale').value.trim(),
    male: document.getElementById('crossMale').value.trim(),
    container: document.getElementById('crossContainer').value,
    nFemales: parseInt(document.getElementById('crossNFemales').value) || 0,
    nMales: parseInt(document.getElementById('crossNMales').value) || 0,
    temp: parseFloat(document.getElementById('crossTemp').value) || 25,
    hypothesis: document.getElementById('crossHypothesis').value.trim(),
    status: 'active'
  };
  if (!cross.id) { flagField('crossId', 'Cross ID is required'); return; }
  try {
    await dbAdd('crosses', cross);
    logActivity('create', 'Crosses', `Added cross "${cross.id}" (${cross.gen}): ${cross.female} × ${cross.male}`);
    captureDefaults('cross', ['crossContainer', 'crossNFemales', 'crossNMales', 'crossTemp', 'crossGen']);
    ['crossId','crossFemale','crossMale','crossHypothesis'].forEach(id => document.getElementById(id).value = '');
    toast('Cross added', { tone: 'success' });
  } catch (e) {
    console.error('addCross failed', e);
    toast('Save failed: ' + (e && e.message || 'unknown'), { tone: 'error', ttl: 5000 });
    setSyncStatus('offline');
  }
};
window.filterCrosses = function(filter, el) { activeCrossFilter = filter; document.querySelectorAll('#crosses .filter-chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); renderCrosses(); };
window.toggleCrossStatus = async function(id) {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const c = data.crosses.find(x => x._id === id);
  const ns = c.status === 'active' ? 'complete' : 'active';
  await dbUpdate('crosses', id, { status: ns });
  logActivity('edit', 'Crosses', `Cross "${c.id}" → ${ns}`);
};
window.deleteCross = async function(id) {
  const c = data.crosses.find(x => x._id === id); if (!c) return;
  await deleteWithUndo({ coll: 'crosses', id, label: `cross "${c.id}"`, module: 'Crosses' });
};
window.editCross = function(id) {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const c = data.crosses.find(x => x._id === id); if (!c) return;
  openEditModal({
    title: `Edit cross ${c.id}`,
    values: c,
    fields: [
      { key: 'id', label: 'Cross ID', required: true },
      { key: 'gen', label: 'Generation', type: 'select', options: ['P', 'F1', 'F2', 'F3'] },
      { key: 'date', label: 'Date started', type: 'date' },
      { key: 'female', label: '♀ Female genotype' },
      { key: 'male', label: '♂ Male genotype' },
      { key: 'container', label: 'Container', type: 'select', options: ['vial', 'bottle'] },
      { key: 'nFemales', label: '# females', type: 'number' },
      { key: 'nMales', label: '# males', type: 'number' },
      { key: 'temp', label: 'Temperature (°C)', type: 'number' },
      { key: 'hypothesis', label: 'Hypothesis', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'complete'] }
    ],
    onSave: async (updates) => {
      await dbUpdate('crosses', id, updates);
      logActivity('edit', 'Crosses', `Edited cross "${updates.id || c.id}"`);
      toast('Cross updated', { tone: 'success' });
    }
  });
};
function renderCrosses() {
  const tbody = document.getElementById('crossTableBody');
  if (!tbody) return;
  let filtered = data.crosses.filter(c => {
    if (activeCrossFilter === 'all') return true;
    if (activeCrossFilter === 'active' || activeCrossFilter === 'complete') return c.status === activeCrossFilter;
    return c.gen === activeCrossFilter;
  });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-3);">No crosses</td></tr>'; return; }
  tbody.innerHTML = filtered.map(c => {
    const day = c.date ? Math.floor((Date.now() - new Date(c.date).getTime()) / 86400000) : 0;
    return `<tr data-record-id="${c._id}"><td class="row-check-col can-edit-only"><input type="checkbox" class="row-check" data-coll="crosses" data-id="${c._id}" onchange="bulkToggleRow('crosses', '${c._id}', this.checked)" ${bulkSel.crosses.has(c._id) ? 'checked' : ''}></td><td><strong>${c.id}</strong></td><td><span class="badge b-${c.gen.toLowerCase()}">${c.gen}</span></td>
      <td style="font-family:monospace; font-size:11px;">${c.female || '?'} <span style="color:var(--text-muted);">×</span> ${c.male || '?'}</td>
      <td>${c.date ? new Date(c.date).toLocaleDateString() : '—'}</td><td><strong>Day ${day}</strong></td>
      <td>${c.temp || 25}°C</td><td><span class="badge b-${c.status === 'active' ? 'active' : 'done'}">${c.status}</span></td>
      <td style="white-space:nowrap;"><button class="action-btn edit-btn" title="Toggle status" onclick="toggleCrossStatus('${c._id}')">✓</button><button class="action-btn edit-btn" title="Edit" onclick="editCross('${c._id}')">✏️</button><button class="action-btn delete" title="Delete" onclick="deleteCross('${c._id}')">🗑</button></td></tr>`;
  }).join('');
}

window.addVirgin = async function() {
  const v = {
    date: document.getElementById('virginDate').value,
    time: document.getElementById('virginTime').value,
    session: document.getElementById('virginSession').value,
    source: document.getElementById('virginSource').value.trim(),
    females: parseInt(document.getElementById('virginFemales').value) || 0,
    males: parseInt(document.getElementById('virginMales').value) || 0,
    container: document.getElementById('virginContainer').value.trim(),
    temp: document.getElementById('virginTemp').value,
    notes: document.getElementById('virginNotes').value.trim()
  };
  if (!v.date) { flagField('virginDate', 'Date is required'); return; }
  try {
    await dbAdd('virgins', v);
    logActivity('create', 'Virgins', `Logged ${v.females}♀ ${v.males}♂ from "${v.source}" (${v.session})`);
    captureDefaults('virgin', ['virginSource', 'virginContainer', 'virginTemp', 'virginSession']);
    document.getElementById('virginFemales').value = 0;
    document.getElementById('virginMales').value = 0;
    document.getElementById('virginNotes').value = '';
    toast('Collection logged', { tone: 'success' });
  } catch (e) {
    console.error('addVirgin failed', e);
    toast('Save failed: ' + (e && e.message || 'unknown'), { tone: 'error', ttl: 5000 });
    setSyncStatus('offline');
  }
};
window.deleteVirgin = async function(id) {
  const v = data.virgins.find(x => x._id === id); if (!v) return;
  await deleteWithUndo({ coll: 'virgins', id, label: `collection from ${new Date(v.date).toLocaleDateString()}`, module: 'Virgins' });
};
window.editVirgin = function(id) {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const v = data.virgins.find(x => x._id === id); if (!v) return;
  const tempOpts = ['', ...(data.settings.temps || []).map(t => ({ value: t.value, label: t.label }))];
  openEditModal({
    title: 'Edit virgin collection',
    values: v,
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'time' },
      { key: 'session', label: 'Session', type: 'select', options: ['AM', 'PM'] },
      { key: 'source', label: 'Source' },
      { key: 'females', label: '♀ Virgins', type: 'number' },
      { key: 'males', label: '♂ Males', type: 'number' },
      { key: 'container', label: 'Container' },
      { key: 'temp', label: 'Storage temp', type: 'select', options: tempOpts },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    onSave: async (updates) => {
      await dbUpdate('virgins', id, updates);
      logActivity('edit', 'Virgins', `Edited collection from ${new Date(updates.date || v.date).toLocaleDateString()}`);
      toast('Collection updated', { tone: 'success' });
    }
  });
};
function renderVirgins() {
  const tbody = document.getElementById('virginTableBody');
  if (!tbody) return;
  const sorted = [...data.virgins].sort((a,b) => (b.created||0) - (a.created||0));
  if (sorted.length === 0) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--text-3);">No collections</td></tr>';
  else tbody.innerHTML = sorted.map(v => `<tr data-record-id="${v._id}"><td class="row-check-col can-edit-only"><input type="checkbox" class="row-check" data-coll="virgins" data-id="${v._id}" onchange="bulkToggleRow('virgins', '${v._id}', this.checked)" ${bulkSel.virgins.has(v._id) ? 'checked' : ''}></td><td>${new Date(v.date).toLocaleDateString()}</td><td style="font-family:monospace;">${v.time || '—'}</td>
      <td><span class="badge ${v.session === 'AM' ? 'b-f1' : 'b-f2'}">${v.session}</span></td><td>${v.source || '—'}</td>
      <td><span class="badge b-female">${v.females}</span></td><td><span class="badge b-male">${v.males}</span></td>
      <td>${v.container || '—'}</td><td>${v.temp}°C</td>
      <td style="white-space:nowrap;"><button class="action-btn edit-btn" title="Edit" onclick="editVirgin('${v._id}')">✏️</button><button class="action-btn delete" title="Delete" onclick="deleteVirgin('${v._id}')">🗑</button></td></tr>`).join('');
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
  const td = document.getElementById('virginsTodayDetail'), tw = document.getElementById('virginsWeek'), ta = document.getElementById('virginsAll');
  if (td) td.textContent = data.virgins.filter(v => v.date === today).reduce((s,v) => s + v.females + v.males, 0);
  if (tw) tw.textContent = data.virgins.filter(v => v.date >= weekAgo).reduce((s,v) => s + v.females + v.males, 0);
  if (ta) ta.textContent = data.virgins.reduce((s,v) => s + v.females + v.males, 0);
}

window.adjustCounter = function(i, delta) { const inp = document.getElementById(`counter-${i}`); inp.value = Math.max(0, parseInt(inp.value) + delta); };
window.addPhenoCategory = function() { const n = prompt('Category:'); if (n && n.trim()) { phenoCategories.push(n.trim()); renderPhenoCounters(); } };
window.removeCategory = function(i) { if (phenoCategories.length <= 1) { toast('Keep one'); return; } phenoCategories.splice(i, 1); renderPhenoCounters(); };
window.resetCounters = function() { phenoCategories = [...data.settings.defaultPhenos]; renderPhenoCounters(); };
function renderPhenoCounters() {
  const cont = document.getElementById('phenoCounters');
  if (!cont) return;
  cont.innerHTML = phenoCategories.map((cat, i) => {
    const n = (i % 8) + 1;
    return `<div class="phenotype-counter" style="--cat-bg:var(--cat-${n}-bg); --cat-fg:var(--cat-${n}-fg);">
      <label style="text-transform:none; letter-spacing:0;">${escapeHtml(cat)}</label>
      <div class="counter-controls"><button class="counter-btn" onclick="adjustCounter(${i}, -1)">−</button>
      <input type="number" id="counter-${i}" value="0" min="0" style="background:transparent;border:none;box-shadow:none;text-align:center;color:var(--cat-fg, var(--text-bright));width:60px;font-size:24px;font-weight:700;padding:0;">
      <button class="counter-btn" onclick="adjustCounter(${i}, 1)">+</button></div>
      <button class="action-btn delete" onclick="removeCategory(${i})" style="font-size:10px; color:var(--cat-fg, var(--text-muted)); opacity:0.65;">remove</button>
    </div>`;
  }).join('');
}
window.savePhenotype = async function() {
  // If counter inputs aren't on the page yet (user opened the tab but never
  // touched the counters), render them now so the read below can't throw.
  if (!document.getElementById('counter-0') && document.getElementById('phenoCounters')) {
    renderPhenoCounters();
  }
  const counts = {};
  let total = 0;
  phenoCategories.forEach((cat, i) => {
    const el = document.getElementById(`counter-${i}`);
    const v = el ? (parseInt(el.value) || 0) : 0;
    counts[cat] = v; total += v;
  });
  const p = { vial: document.getElementById('phenoVial').value.trim(), gen: document.getElementById('phenoGen').value, date: document.getElementById('phenoDate').value, counts, total, notes: document.getElementById('phenoNotes').value.trim() };
  if (!p.vial) { flagField('phenoVial', 'Vial/Cross ID is required'); return; }
  if (total === 0) { toast('Enter at least one count above', { tone: 'error' }); return; }
  try {
    await dbAdd('phenotypes', p);
    logActivity('create', 'Phenotyping', `Scored "${p.vial}" (${p.gen}), n=${total}`);
    captureDefaults('pheno', ['phenoGen']);
    resetCounters();
    document.getElementById('phenoNotes').value = '';
    toast('Saved', { tone: 'success' });
  } catch (e) {
    console.error('savePhenotype failed', e);
    toast('Save failed: ' + (e && e.message || 'unknown'), { tone: 'error', ttl: 5000 });
    setSyncStatus('offline');
  }
};
window.deletePheno = async function(id) {
  const p = data.phenotypes.find(x => x._id === id); if (!p) return;
  await deleteWithUndo({ coll: 'phenotypes', id, label: `scoring of "${p.vial}"`, module: 'Phenotyping' });
};
window.editPheno = function(id) {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const p = data.phenotypes.find(x => x._id === id); if (!p) return;
  openEditModal({
    title: `Edit scoring of "${p.vial}"`,
    values: p,
    fields: [
      { key: 'vial', label: 'Vial/Cross ID', required: true },
      { key: 'gen', label: 'Generation', type: 'select', options: ['P', 'F1', 'F2', 'F3'] },
      { key: 'date', label: 'Scoring date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ],
    onSave: async (updates) => {
      await dbUpdate('phenotypes', id, updates);
      logActivity('edit', 'Phenotyping', `Edited scoring of "${updates.vial || p.vial}"`);
      toast('Scoring updated', { tone: 'success' });
    }
  });
};
function renderPhenotypes() {
  const tbody = document.getElementById('phenoTableBody');
  if (!tbody) return;
  const sorted = [...data.phenotypes].sort((a,b) => (b.created||0) - (a.created||0));
  if (sorted.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-3);">No data</td></tr>'; return; }
  tbody.innerHTML = sorted.map(p => {
    const summary = Object.entries(p.counts).filter(([_,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(' • ');
    return `<tr data-record-id="${p._id}"><td class="row-check-col can-edit-only"><input type="checkbox" class="row-check" data-coll="phenotypes" data-id="${p._id}" onchange="bulkToggleRow('phenotypes', '${p._id}', this.checked)" ${bulkSel.phenotypes.has(p._id) ? 'checked' : ''}></td><td>${new Date(p.date).toLocaleDateString()}</td><td><strong>${p.vial}</strong></td>
      <td><span class="badge b-${p.gen.toLowerCase()}">${p.gen}</span></td><td style="font-size:11px;">${summary}</td>
      <td><strong>${p.total}</strong></td><td style="font-size:11px; color:var(--text-muted);">${(p.notes || '').substring(0, 30)}</td>
      <td style="white-space:nowrap;"><button class="action-btn edit-btn" title="Edit" onclick="editPheno('${p._id}')">✏️</button><button class="action-btn delete" title="Delete" onclick="deletePheno('${p._id}')">🗑</button></td></tr>`;
  }).join('');
}
window.quickChiSquare = function() {
  const counts = phenoCategories.map((_, i) => parseInt(document.getElementById(`counter-${i}`).value) || 0);
  const nonZero = counts.filter(c => c > 0);
  if (nonZero.length < 2) { toast('Need 2+ categories'); return; }
  const total = nonZero.reduce((a,b) => a+b, 0);
  const expected = total / nonZero.length;
  let chi = 0;
  nonZero.forEach(o => { chi += Math.pow(o - expected, 2) / expected; });
  const df = nonZero.length - 1;
  const critical = [3.84, 5.99, 7.81, 9.49, 11.07][df-1] || 12;
  const sig = chi > critical;
  document.getElementById('chiResult').innerHTML = `<div class="chi-result"><h4 style="color:var(--text-bright); margin-bottom:8px;">📐 Chi-square (equal ratio)</h4>
    <div class="chi-value">χ² = ${chi.toFixed(3)}</div><div class="chi-detail">df = ${df} | critical (α=0.05) = ${critical} | n = ${total}</div>
    <div class="significance ${sig ? 'sig-fail' : 'sig-pass'}">${sig ? '✗ Significant deviation' : '✓ No significant deviation'}</div></div>`;
};

window.addNote = async function() {
  const n = { date: document.getElementById('noteDate').value, title: document.getElementById('noteTitle').value.trim(), hypothesis: document.getElementById('noteHypothesis').value.trim(), methods: document.getElementById('noteMethods').value.trim(), results: document.getElementById('noteResults').value.trim(), conclusion: document.getElementById('noteConclusion').value.trim(), tags: document.getElementById('noteTags').value.trim() };
  if (!n.title) { flagField('noteTitle', 'Title is required'); return; }
  if (!n.date) { flagField('noteDate', 'Date is required'); return; }
  try {
    await dbAdd('notes', n);
    logActivity('create', 'Notebook', `Added entry "${n.title}"`);
    ['noteTitle','noteHypothesis','noteMethods','noteResults','noteConclusion','noteTags'].forEach(id => document.getElementById(id).value = '');
    toast('Saved', { tone: 'success' });
  } catch (e) {
    console.error('addNote failed', e);
    toast('Save failed: ' + (e && e.message || 'unknown'), { tone: 'error', ttl: 5000 });
    setSyncStatus('offline');
  }
};
window.deleteNote = async function(id) {
  const n = data.notes.find(x => x._id === id); if (!n) return;
  await deleteWithUndo({ coll: 'notes', id, label: `entry "${n.title}"`, module: 'Notebook' });
};
window.editNote = function(id) {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const n = data.notes.find(x => x._id === id); if (!n) return;
  openEditModal({
    title: `Edit "${n.title}"`,
    values: n,
    fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'title', label: 'Title', required: true },
      { key: 'hypothesis', label: '📝 Hypothesis', type: 'textarea' },
      { key: 'methods', label: '🧪 Methods', type: 'textarea' },
      { key: 'results', label: '👀 Results', type: 'textarea' },
      { key: 'conclusion', label: '💭 Conclusions', type: 'textarea' },
      { key: 'tags', label: '🏷️ Tags' }
    ],
    onSave: async (updates) => {
      await dbUpdate('notes', id, updates);
      logActivity('edit', 'Notebook', `Edited entry "${updates.title || n.title}"`);
      toast('Entry updated', { tone: 'success' });
    }
  });
};
function renderNotes() {
  const list = document.getElementById('notesList');
  if (!list) return;
  const search = document.getElementById('noteSearch')?.value.toLowerCase() || '';
  const sorted = [...data.notes].sort((a,b) => (b.created||0) - (a.created||0));
  let filtered = sorted.filter(n => !search || `${n.title} ${n.hypothesis} ${n.methods} ${n.results} ${n.conclusion} ${n.tags}`.toLowerCase().includes(search));
  if (filtered.length === 0) { list.innerHTML = '<div class="empty-state"><div class="icon">📓</div><p>No entries</p></div>'; return; }
  list.innerHTML = filtered.map(n => `<div class="note-entry" data-record-id="${n._id}"><div class="note-header"><div class="note-title">${n.title}</div><div class="note-date">${new Date(n.date).toLocaleDateString()}${n.createdBy ? ' • ' + n.createdBy : ''}</div></div>
      ${n.hypothesis ? `<div class="note-section"><strong>Hypothesis</strong><div>${n.hypothesis}</div></div>` : ''}
      ${n.methods ? `<div class="note-section"><strong>Methods</strong><div>${n.methods}</div></div>` : ''}
      ${n.results ? `<div class="note-section"><strong>Results</strong><div>${n.results}</div></div>` : ''}
      ${n.conclusion ? `<div class="note-section"><strong>Conclusions</strong><div>${n.conclusion}</div></div>` : ''}
      ${n.tags ? `<div style="margin-top:8px;">${n.tags.split(',').map(t => `<span class="badge b-wt" style="margin-right:4px;">#${t.trim()}</span>`).join('')}</div>` : ''}
      <div style="text-align:right; margin-top:8px;"><button class="action-btn edit-btn" onclick="editNote('${n._id}')">✏️ Edit</button> <button class="action-btn delete" onclick="deleteNote('${n._id}')">🗑 Delete</button></div></div>`).join('');
}

window.handleProtocolFile = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 800 * 1024) { alert('File too large (max 800KB for cloud sync). Compress the PDF or store a link instead.'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = ev => { pendingProtocolFile = { name: file.name, type: file.type, size: file.size, data: ev.target.result }; document.getElementById('protocolFileInfo').innerHTML = `✓ Attached: <strong>${file.name}</strong> (${(file.size/1024).toFixed(0)} KB)`; };
  reader.readAsDataURL(file);
};
window.openProtocolModal = function(id) {
  if (id && !canEdit()) { toast('No permission to edit'); return; }
  editingProtocolIdx = id || null;
  pendingProtocolFile = null;
  document.getElementById('protocolModalTitle').textContent = id ? 'Edit protocol' : 'Add protocol';
  document.getElementById('protocolFile').value = '';
  if (id) {
    const p = data.protocols.find(x => x._id === id);
    document.getElementById('protocolName').value = p.name || '';
    document.getElementById('protocolCategory').value = p.category || '';
    document.getElementById('protocolDuration').value = p.duration || '';
    document.getElementById('protocolMaterials').value = p.materials || '';
    document.getElementById('protocolSteps').value = p.steps || '';
    document.getElementById('protocolNotes').value = p.notes || '';
    document.getElementById('protocolFileInfo').innerHTML = p.file ? `📎 Current: <strong>${p.file.name}</strong>` : '';
  } else {
    ['protocolName','protocolCategory','protocolDuration','protocolMaterials','protocolSteps','protocolNotes'].forEach(idd => document.getElementById(idd).value = '');
    document.getElementById('protocolFileInfo').innerHTML = '';
  }
  document.getElementById('protocolModal').classList.remove('hidden');
};
window.closeProtocolModal = function() { document.getElementById('protocolModal').classList.add('hidden'); editingProtocolIdx = null; pendingProtocolFile = null; };
window.saveProtocol = async function() {
  const p = { name: document.getElementById('protocolName').value.trim(), category: document.getElementById('protocolCategory').value.trim() || 'general', duration: document.getElementById('protocolDuration').value.trim(), materials: document.getElementById('protocolMaterials').value.trim(), steps: document.getElementById('protocolSteps').value.trim(), notes: document.getElementById('protocolNotes').value.trim() };
  if (!p.name) { flagField('protocolName', 'Protocol name is required'); return; }
  try {
    if (editingProtocolIdx) {
      const existing = data.protocols.find(x => x._id === editingProtocolIdx);
      if (pendingProtocolFile) p.file = pendingProtocolFile;
      else if (existing.file) p.file = existing.file;
      await dbUpdate('protocols', editingProtocolIdx, p);
      logActivity('edit', 'Protocols', `Edited protocol "${p.name}"`);
    } else {
      if (pendingProtocolFile) p.file = pendingProtocolFile;
      await dbAdd('protocols', p);
      logActivity('create', 'Protocols', `Added protocol "${p.name}"${p.file ? ' with file ' + p.file.name : ''}`);
    }
    closeProtocolModal();
    toast('Saved to cloud', { tone: 'success' });
  } catch (e) {
    console.error('saveProtocol failed', e);
    toast('Save failed: ' + (e && e.message || 'unknown'), { tone: 'error', ttl: 5000 });
    setSyncStatus('offline');
  }
};
window.deleteProtocol = async function(id) {
  const p = data.protocols.find(x => x._id === id); if (!p) return;
  await deleteWithUndo({ coll: 'protocols', id, label: `protocol "${p.name}"`, module: 'Protocols' });
};
window.downloadProtocolFile = function(id) {
  const p = data.protocols.find(x => x._id === id);
  if (!p.file) return;
  const a = document.createElement('a');
  a.href = p.file.data; a.download = p.file.name; a.click();
};
window.loadDefaultProtocols = async function() {
  if (data.protocols.length > 0) {
    const ok = await confirmDialog({ title: 'Add default protocols?', body: `You already have ${data.protocols.length} protocols. This appends ${defaultProtocols.length} starter templates.`, confirmLabel: 'Add' });
    if (!ok) return;
  }
  for (const p of defaultProtocols) { await dbAdd('protocols', { ...p }); }
  logActivity('create', 'Protocols', `Loaded ${defaultProtocols.length} default protocols`);
  toast(`Added ${defaultProtocols.length} protocols`);
};
window.filterProtocols = function(filter, el) { activeProtocolFilter = filter; document.querySelectorAll('#protocolFilters .filter-chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); renderProtocols(); };
function renderProtocolFilters() {
  const cont = document.getElementById('protocolFilters');
  if (!cont) return;
  const cats = ['all', ...new Set(data.protocols.map(p => p.category))];
  cont.innerHTML = cats.map(c => `<div class="filter-chip ${c === activeProtocolFilter ? 'active' : ''}" onclick="filterProtocols('${c}', this)">${c === 'all' ? 'All' : c}</div>`).join('');
}
function renderProtocols() {
  const list = document.getElementById('protocolsList');
  if (!list) return;
  renderProtocolFilters();
  const search = document.getElementById('protocolSearch')?.value.toLowerCase() || '';
  let filtered = data.protocols.filter(p => {
    if (activeProtocolFilter !== 'all' && p.category !== activeProtocolFilter) return false;
    if (search && !`${p.name} ${p.category} ${p.materials} ${p.steps} ${p.notes}`.toLowerCase().includes(search)) return false;
    return true;
  });
  if (filtered.length === 0) { list.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>No protocols. Click "Load defaults" or add your own.</p></div>'; return; }
  list.innerHTML = filtered.map(p => {
    const fileIcon = p.file ? (p.file.name.endsWith('.pdf') ? '📄' : '📝') : '';
    return `<div class="protocol-card" data-record-id="${p._id}"><div class="protocol-header"><div><div class="protocol-title">${p.name}</div><div class="protocol-meta">${p.category} ${p.duration ? '• ' + p.duration : ''}</div></div>
      <div><button class="action-btn edit-btn" onclick="openProtocolModal('${p._id}')">✏️</button><button class="action-btn delete" onclick="deleteProtocol('${p._id}')">🗑</button></div></div>
      ${p.materials ? `<div style="margin-bottom:8px;"><strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Materials</strong><div class="protocol-body">${p.materials}</div></div>` : ''}
      ${p.steps ? `<div style="margin-bottom:8px;"><strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Steps</strong><div class="protocol-body">${p.steps}</div></div>` : ''}
      ${p.notes ? `<div><strong style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Notes</strong><div class="protocol-body">${p.notes}</div></div>` : ''}
      ${p.file ? `<div class="file-attach" onclick="downloadProtocolFile('${p._id}')">${fileIcon} ${p.file.name} <span style="color:var(--text-muted); font-size:11px;">(${(p.file.size/1024).toFixed(0)} KB) — click to download</span></div>` : ''}</div>`;
  }).join('');
}

window.filterLogs = function(filter, el) { activeLogFilter = filter; document.querySelectorAll('#logFilters .filter-chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); renderLogs(); };
function renderLogFilters() {
  const cont = document.getElementById('logFilters');
  if (!cont) return;
  const filters = ['all', 'create', 'edit', 'delete', 'login'];
  cont.innerHTML = filters.map(f => `<div class="filter-chip ${f === activeLogFilter ? 'active' : ''}" onclick="filterLogs('${f}', this)">${f === 'all' ? 'All' : f}</div>`).join('');
}
async function deleteLogDocs(logs) {
  setSyncStatus('syncing');
  let ok = 0;
  for (const l of logs) {
    try { await deleteDoc(doc(db, 'logs', l._id)); ok++; } catch (e) { console.error('log delete failed', e); }
  }
  setSyncStatus('synced');
  return ok;
}
window.purgeOldLogsManual = async function() {
  if (!currentProfile || currentProfile.role !== 'super_admin') { toast('Only Super Admin can clear logs'); return; }
  const cutoff = Date.now() - 30 * 86400000;
  const oldLogs = data.logs.filter(l => l.timestamp < cutoff);
  if (oldLogs.length === 0) { toast('No logs older than 30 days'); return; }
  const ok = await confirmDialog({ title: 'Clear old logs?', body: `${oldLogs.length} log entr${oldLogs.length === 1 ? 'y' : 'ies'} older than 30 days will be permanently deleted.`, confirmLabel: `Delete ${oldLogs.length}`, danger: true });
  if (!ok) return;
  const n = await deleteLogDocs(oldLogs);
  toast(`Deleted ${n} old log${n === 1 ? '' : 's'}`);
};
window.clearAllLogs = async function() {
  if (!currentProfile || currentProfile.role !== 'super_admin') { toast('Only Super Admin can clear logs'); return; }
  if (data.logs.length === 0) { toast('No logs to delete'); return; }
  const ok1 = await confirmDialog({ title: 'Delete the entire activity log?', body: `${data.logs.length} entries will be permanently erased. This wipes the audit history for every user.`, confirmLabel: 'Continue', danger: true });
  if (!ok1) return;
  const ok2 = await confirmDialog({ title: 'Last chance', body: 'There is no undo for this. Type-of-thought required: are you really sure?', confirmLabel: 'Yes, wipe all logs', danger: true });
  if (!ok2) return;
  const n = await deleteLogDocs([...data.logs]);
  toast(`Deleted all ${n} logs`);
};
function renderLogs() {
  if (!currentProfile || currentProfile.role !== 'super_admin') return;
  const tbody = document.getElementById('logTableBody');
  if (!tbody) return;
  const search = document.getElementById('logSearch')?.value.toLowerCase() || '';
  let filtered = data.logs.filter(l => {
    if (activeLogFilter !== 'all' && l.action !== activeLogFilter) return false;
    if (search && !`${l.user} ${l.module} ${l.action} ${l.details}`.toLowerCase().includes(search)) return false;
    return true;
  });
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('logTotal').textContent = data.logs.length;
  document.getElementById('logToday').textContent = data.logs.filter(l => new Date(l.timestamp).toISOString().split('T')[0] === today).length;
  document.getElementById('logCreates').textContent = data.logs.filter(l => l.action === 'create').length;
  document.getElementById('logDeletes').textContent = data.logs.filter(l => l.action === 'delete').length;
  renderLogFilters();
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-3);">No log entries</td></tr>'; return; }
  tbody.innerHTML = filtered.slice(0, 500).map(l => {
    const d = new Date(l.timestamp);
    return `<tr><td style="font-family:monospace; font-size:12px;">${d.toLocaleDateString()} ${d.toLocaleTimeString()}</td>
      <td><strong>${l.user}</strong></td><td>${roleBadge(l.role)}</td>
      <td><span class="badge b-${l.action === 'create' ? 'create' : l.action === 'edit' ? 'edit' : l.action === 'delete' ? 'delete' : 'user'}">${l.action}</span></td>
      <td>${l.module}</td><td style="font-size:12px; color:var(--text-3);">${l.details}</td></tr>`;
  }).join('');
}
window.exportLogs = function() {
  const wb = XLSX.utils.book_new();
  const wsData = data.logs.map(l => ({ 'Date': new Date(l.timestamp).toLocaleDateString(), 'Time': new Date(l.timestamp).toLocaleTimeString(), 'User': l.user, 'Role': l.role, 'Action': l.action, 'Module': l.module, 'Details': l.details }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), 'Activity Log');
  XLSX.writeFile(wb, `flylab-log-${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('Log exported');
};

window.changeUserRole = async function(uid, role) {
  if (!canManageRoles()) { toast('Only Super Admin can change roles'); return; }
  await updateDoc(doc(db, 'users', uid), { role });
  logActivity('edit', 'users', `Changed role to ${role}`);
  toast('Role updated');
};
function roleBadge(r) {
  if (r === 'super_admin') return '<span class="badge b-admin">⭐ Super</span>';
  if (r === 'admin') return '<span class="badge b-admin">🛡️ Admin</span>';
  return '<span class="badge b-user">Regular</span>';
}
function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody || !data.users) return;
  tbody.innerHTML = data.users.map(u => {
    const actionCount = data.logs.filter(l => l.user === u.name).length;
    return `<tr><td><strong>${u.name}</strong>${u.email === currentProfile.email ? ' <span style="color:var(--info); font-size:11px; font-weight:600;">(you)</span>' : ''}</td>
      <td style="font-size:12px;">${u.email}</td>
      <td><select onchange="changeUserRole('${u._id}', this.value)" style="width:auto; padding:4px 8px;">
        <option value="regular" ${u.role==='regular'?'selected':''}>Regular</option>
        <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
        <option value="super_admin" ${u.role==='super_admin'?'selected':''}>Super Admin</option>
      </select></td>
      <td>${u.created ? new Date(u.created).toLocaleDateString() : '—'}</td><td>${actionCount}</td><td></td></tr>`;
  }).join('');
}

function refreshDashboard() {
  const sc = document.getElementById('stockCount'), cc = document.getElementById('crossCount'), vt = document.getElementById('virginToday'), fa = document.getElementById('flipAlert');
  if (sc) sc.textContent = data.stocks.length;
  if (cc) cc.textContent = data.crosses.filter(c => c.status === 'active').length;
  const today = new Date().toISOString().split('T')[0];
  if (vt) vt.textContent = data.virgins.filter(v => v.date === today).reduce((s,v) => s + v.females + v.males, 0);
  const flipsDue = data.stocks.filter(s => s.flipDate && (Date.now() - new Date(s.flipDate).getTime()) / 86400000 > data.settings.flipWarnDays);
  if (fa) fa.textContent = flipsDue.length;
  const flipList = document.getElementById('flipList');
  if (flipList) flipList.innerHTML = flipsDue.length === 0 ? '<div class="empty-state"><p>✓ All current</p></div>' : flipsDue.slice(0, 5).map(s => { const days = Math.floor((Date.now() - new Date(s.flipDate).getTime()) / 86400000); return `<li class="task-item"><span class="task-time" style="color:var(--warn);">${days}d</span><span class="task-desc"><strong>${s.id}</strong> — ${s.genotype || s.name || ''}</span><span class="task-priority">Flip!</span></li>`; }).join('');
  const activeCrossList = document.getElementById('activeCrossList');
  if (activeCrossList) { const active = data.crosses.filter(c => c.status === 'active').slice(0, 5); activeCrossList.innerHTML = active.length === 0 ? '<div class="empty-state"><p>No active crosses</p></div>' : active.map(c => { const day = c.date ? Math.floor((Date.now() - new Date(c.date).getTime()) / 86400000) : 0; return `<li class="task-item"><span class="task-time">Day ${day}</span><span class="task-desc"><strong>${c.id}</strong> (${c.gen}) — ${c.female} × ${c.male}</span></li>`; }).join(''); }
  renderSectionOverview();
  renderVirginsWeekChart();
  renderDashboardSparklines();
  renderNextAction();
  checkAlerts();
}

// 7-day sparkline data series for each stat card
function renderDashboardSparklines() {
  const days = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  // Active crosses: cumulative count of crosses still active each day
  const crossesPerDay = days.map(key => (data.crosses || []).filter(c =>
    c.date && c.date <= key && (c.status === 'active' || (c.completedAt && c.completedAt.split('T')[0] > key))
  ).length);
  // Virgins per day total (♀+♂)
  const virginsPerDay = days.map(key => (data.virgins || []).filter(v => v.date === key).reduce((s, v) => s + (+v.females || 0) + (+v.males || 0), 0));
  // Flips per day: number of stocks whose flipDate matches that day
  const flipsPerDay = days.map(key => (data.stocks || []).filter(s => s.flipDate === key).length);
  // Stocks count is mostly monotonic — show its arrival curve
  const stockOrder = (data.stocks || []).filter(s => s.created).map(s => new Date(s.created).toISOString().split('T')[0]);
  const stocksPerDay = days.map(key => stockOrder.filter(d => d <= key).length);

  const ss = document.getElementById('sparkStocks');
  const sc = document.getElementById('sparkCrosses');
  const sv = document.getElementById('sparkVirgins');
  const sf = document.getElementById('sparkFlips');
  if (ss) ss.innerHTML = buildSparkline(stocksPerDay);
  if (sc) sc.innerHTML = buildSparkline(crossesPerDay);
  if (sv) sv.innerHTML = buildSparkline(virginsPerDay);
  if (sf) sf.innerHTML = buildSparkline(flipsPerDay);
}

// Garden dashboard — pastel tile per stock type, with click-through to filtered Stocks list
function renderSectionOverview() {
  const cont = document.getElementById('sectionOverview');
  if (!cont) return;
  const types = [...(data.settings.stockTypes || [])];
  const warnDays = data.settings.flipWarnDays;
  const isDue = (s) => s.flipDate && (Date.now() - new Date(s.flipDate).getTime()) / 86400000 > warnDays;
  const tiles = types.map((t, i) => {
    const items = data.stocks.filter(s => s.type === t);
    return { type: t, label: t, count: items.length, due: items.filter(isDue).length, idx: (i % 8) + 1 };
  });
  const untyped = data.stocks.filter(s => !s.type);
  if (untyped.length > 0) {
    tiles.push({ type: '', label: 'Untyped', count: untyped.length, due: untyped.filter(isDue).length, idx: 8 });
  }
  if (tiles.length === 0) {
    cont.innerHTML = '<div class="empty-state" style="padding:1rem; grid-column:1/-1;"><p>No stock types configured yet</p></div>';
    return;
  }
  cont.innerHTML = tiles.map(t => {
    const sub = t.due > 0
      ? `<span class="sec-tile-sub" style="color:var(--danger);">${t.due} due</span>`
      : `<span class="sec-tile-sub">on shelf</span>`;
    return `<div class="sec-tile" data-type="${escapeHtml(t.type)}" style="--cat-bg:var(--cat-${t.idx}-bg); --cat-fg:var(--cat-${t.idx}-fg);">
      <div class="sec-tile-label">${escapeHtml(t.label)}</div>
      <div class="sec-tile-count">${t.count}</div>
      ${sub}
    </div>`;
  }).join('');
  cont.querySelectorAll('.sec-tile').forEach(el => {
    el.addEventListener('click', () => jumpToStockType(el.dataset.type));
  });
}

// Click a Section Overview tile → switch to Stocks tab + apply the type filter
function jumpToStockType(type) {
  activeStockFilter = type || 'all';
  const tabBtn = document.querySelector('.sidebar .tab-btn[data-tab="stocks"]');
  if (tabBtn) tabBtn.click();
  if (typeof window.renderStockFilters === 'function') window.renderStockFilters();
  if (typeof window.renderStocks === 'function') window.renderStocks();
}
window.jumpToStockType = jumpToStockType;

// Garden dashboard — pure-CSS bar chart of virgin yield for the last 7 days
function renderVirginsWeekChart() {
  const cont = document.getElementById('virginsWeekChart');
  if (!cont) return;
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    const total = data.virgins.filter(v => v.date === key).reduce((s, v) => s + (+v.females || 0) + (+v.males || 0), 0);
    days.push({ key, label, total, isToday: i === 0 });
  }
  const max = Math.max(...days.map(d => d.total));
  if (max === 0) {
    cont.innerHTML = '<div class="empty-state" style="padding:1rem;"><p>No virgins collected this week</p></div>';
    return;
  }
  const bars = days.map(d => {
    const h = d.total === 0 ? 4 : Math.max(8, Math.round((d.total / max) * 100));
    return `<div class="mini-bar ${d.isToday ? 'is-today' : ''}" style="height:${h}%;" title="${d.label}: ${d.total}"></div>`;
  }).join('');
  const labels = days.map(d => `<span class="${d.isToday ? 'is-today' : ''}">${escapeHtml(d.label)}</span>`).join('');
  cont.innerHTML = `<div class="mini-bars">${bars}</div><div class="mini-bar-labels">${labels}</div>`;
}

window.toggleExportMenu = function() { document.getElementById('exportDropdown').classList.toggle('hidden'); };
document.addEventListener('click', e => { if (!e.target.closest('.export-menu')) document.getElementById('exportDropdown')?.classList.add('hidden'); });
window.exportXLSX = function() {
  const wb = XLSX.utils.book_new();
  if (data.stocks.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.stocks.map(s => ({ 'Stock ID': s.id, 'Name': s.name, 'Genotype': s.genotype, 'Type': s.type, 'Source': s.source, 'Location': s.location, 'Chromosome': s.chrom, 'Last Flip': s.flipDate, 'Notes': s.notes }))), 'Stocks');
  if (data.crosses.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.crosses.map(c => ({ 'Cross ID': c.id, 'Gen': c.gen, 'Date': c.date, 'Female': c.female, 'Male': c.male, 'Container': c.container, '#F': c.nFemales, '#M': c.nMales, 'Temp': c.temp, 'Hypothesis': c.hypothesis, 'Status': c.status }))), 'Crosses');
  if (data.virgins.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.virgins.map(v => ({ 'Date': v.date, 'Time': v.time, 'Session': v.session, 'Source': v.source, 'Females': v.females, 'Males': v.males, 'Container': v.container, 'Temp': v.temp, 'Notes': v.notes }))), 'Virgins');
  if (data.phenotypes.length) { const cats = [...new Set(data.phenotypes.flatMap(p => Object.keys(p.counts)))]; XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.phenotypes.map(p => { const r = { 'Date': p.date, 'Vial': p.vial, 'Gen': p.gen }; cats.forEach(c => r[c] = p.counts[c] || 0); r['Total'] = p.total; r['Notes'] = p.notes; return r; })), 'Phenotypes'); }
  if (data.notes.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.notes.map(n => ({ 'Date': n.date, 'Title': n.title, 'Hypothesis': n.hypothesis, 'Methods': n.methods, 'Results': n.results, 'Conclusion': n.conclusion, 'Tags': n.tags }))), 'Notebook');
  if (data.protocols.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.protocols.map(p => ({ 'Name': p.name, 'Category': p.category, 'Duration': p.duration, 'Materials': p.materials, 'Steps': p.steps, 'Notes': p.notes, 'File': p.file ? p.file.name : '' }))), 'Protocols');
  if (currentProfile.role === 'super_admin' && data.logs.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.logs.map(l => ({ 'Date': new Date(l.timestamp).toLocaleDateString(), 'Time': new Date(l.timestamp).toLocaleTimeString(), 'User': l.user, 'Role': l.role, 'Action': l.action, 'Module': l.module, 'Details': l.details }))), 'Activity Log');
  if (wb.SheetNames.length === 0) { toast('No data'); return; }
  XLSX.writeFile(wb, `flylab-data-${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('Excel downloaded');
};
