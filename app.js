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
let phenoCategories = [...defaultSettings.defaultPhenos];
let currentUser = null;
let currentProfile = null;
let activeStockFilter = 'all', activeCrossFilter = 'all', activeProtocolFilter = 'all', activeLogFilter = 'all';
let editingProtocolIdx = -1;
let pendingProtocolFile = null;
let authMode = 'login';
let unsubscribers = [];

const THEMES = [
  { id: 'warm-dark', name: 'Rose Quartz', swatches: ['#f7f4f5', '#c98a9b', '#2c2429'] },
  { id: 'warm-light', name: 'Sky Mist', swatches: ['#f2f5f7', '#6fa3c0', '#232a30'] },
  { id: 'cool-dark', name: 'Sage Paper', swatches: ['#f3f6f2', '#7faa84', '#262d26'] },
  { id: 'midnight', name: 'Lavender', swatches: ['#f5f4f8', '#9a8fc4', '#28252e'] }
];
function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('flyLabTheme', id);
  renderThemePicker();
}
window.applyTheme = applyTheme;
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

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

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
  if (confirm('Log out?')) {
    await logActivity('logout', 'system', `${currentProfile.name} logged out`);
    unsubscribers.forEach(u => u());
    unsubscribers = [];
    await signOut(auth);
  }
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
  subscribeAll();
  setToday();
  logActivity('login', 'system', `${currentProfile.name} logged in`);
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
  if (rt.length === 0) { cont.innerHTML = '<p style="color:#666; font-size:13px;">No recurring tasks yet</p>'; return; }
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
  if (!canDelete()) { toast('No permission to delete'); return; }
  await dbDelete('calTasks', id);
  logActivity('delete', 'Calendar', `Removed a task`);
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
    legend.innerHTML = rt.map(t => `<div style="display:flex; align-items:center; gap:6px; font-size:12px; color:#aaa;"><span style="width:12px; height:12px; border-radius:50%; background:${t.color}; display:inline-block;"></span>${t.name}</div>`).join('');
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
  cont.innerHTML = `<p style="font-size:12px; color:#888; margin-bottom:10px;">${done}/${tasks.length} completed</p>` + tasks.map(t => {
    const c = t.color || colorForTask(t.task);
    return `
    <li class="task-item" style="border-left:4px solid ${c}; ${t.done ? 'opacity:0.55;' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleCalTask('${t._id}')" style="width:20px; height:20px; cursor:pointer; flex:none;">
      <span class="task-desc" style="${t.done ? 'text-decoration:line-through;' : ''}">${t.task}</span>
      ${t.createdBy ? `<span style="font-size:11px; color:#666;">${t.createdBy}</span>` : ''}
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
    <div class="setting-row"><div style="display:flex; gap:8px; align-items:center; flex:1;">
      <input type="time" value="${s.time}" onchange="updateSchedule(${i}, 'time', this.value)" style="width:110px;">
      <input type="text" value="${s.desc}" onchange="updateSchedule(${i}, 'desc', this.value)">
      <select onchange="updateSchedule(${i}, 'priority', this.value)" style="width:120px;"><option value="" ${!s.priority?'selected':''}>Normal</option><option value="critical" ${s.priority==='critical'?'selected':''}>Critical</option></select>
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
      <input type="number" step="0.1" value="${t.value}" onchange="updateTemp(${i}, 'value', this.value)" style="width:80px;"><span style="color:#888;">°C</span>
      <input type="text" value="${t.label}" onchange="updateTemp(${i}, 'label', this.value)">
    </div><button class="action-btn delete" onclick="removeTemp(${i})">🗑</button></div>`).join('');
}

window.updateStockType = function(i, value) { data.settings.stockTypes[i] = value; populateSelects(); };
window.addStockType = function() { const n = prompt('New stock type:'); if (n) { data.settings.stockTypes.push(n); renderStockTypes(); populateSelects(); renderStockFilters(); } };
window.removeStockType = function(i) { if (confirm('Remove?')) { data.settings.stockTypes.splice(i, 1); renderStockTypes(); populateSelects(); renderStockFilters(); } };
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
  cont.innerHTML = types.map(t => `<div class="filter-chip ${t === activeStockFilter ? 'active' : ''}" onclick="filterStocks('${t}', this)" ${t === 'flip-due' ? 'style="color:#e8b14e;"' : ''}>${t === 'all' ? 'All' : t === 'flip-due' ? '⚠ Flip due' : t}</div>`).join('');
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
  if (!stock.id) { toast('Stock ID required'); return; }
  await dbAdd('stocks', stock);
  logActivity('create', 'Stocks', `Added stock "${stock.id}" (${stock.genotype})`);
  ['stockId','stockGenotype','stockName','stockSource','stockLocation','stockNotes'].forEach(id => document.getElementById(id).value = '');
  toast('Stock added');
};
window.deleteStock = async function(id) {
  if (!canDelete()) { toast('No permission to delete'); return; }
  const s = data.stocks.find(x => x._id === id);
  if (confirm('Delete this stock?')) { await dbDelete('stocks', id); logActivity('delete', 'Stocks', `Deleted stock "${s.id}"`); }
};
window.markFlipped = async function(id) {
  if (!canEdit()) { toast('No permission to edit'); return; }
  const s = data.stocks.find(x => x._id === id);
  await dbUpdate('stocks', id, { flipDate: new Date().toISOString().split('T')[0] });
  logActivity('edit', 'Stocks', `Flipped stock "${s.id}"`);
  toast('Flipped today');
};
function renderStocks() {
  const tbody = document.getElementById('stockTableBody');
  if (!tbody) return;
  const search = document.getElementById('stockSearch')?.value.toLowerCase() || '';
  const warnDays = data.settings.flipWarnDays, critDays = data.settings.flipCritDays;
  let filtered = data.stocks.filter(s => {
    if (search && !`${s.id} ${s.genotype} ${s.name}`.toLowerCase().includes(search)) return false;
    if (activeStockFilter === 'all') return true;
    if (activeStockFilter === 'flip-due') { if (!s.flipDate) return false; return (Date.now() - new Date(s.flipDate).getTime()) / 86400000 > warnDays; }
    return s.type === activeStockFilter;
  });
  document.getElementById('stockTotalCount').textContent = data.stocks.length;
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#666;">No stocks</td></tr>'; return; }
  tbody.innerHTML = filtered.map(s => {
    const days = s.flipDate ? Math.floor((Date.now() - new Date(s.flipDate).getTime()) / 86400000) : null;
    let flipStatus = '—', status = '<span class="badge b-active">OK</span>';
    if (days !== null) {
      if (days > critDays) { flipStatus = `<span style="color:#d95b5b;">⚠ ${days}d</span>`; status = '<span class="badge b-danger">FLIP NOW</span>'; }
      else if (days > warnDays) { flipStatus = `<span style="color:#e8b14e;">${days}d</span>`; status = '<span class="badge b-warn">Soon</span>'; }
      else flipStatus = `<span style="color:#7dd85d;">${days}d</span>`;
    }
    return `<tr><td><strong>${s.id}</strong>${s.name ? '<br><span style="font-size:11px;color:#888;">' + s.name + '</span>' : ''}</td>
      <td style="font-family:monospace; font-size:12px;">${s.genotype || '—'}</td><td>${s.type || '—'}</td><td>${s.source || '—'}</td>
      <td style="font-family:monospace; font-size:12px;">${s.location || '—'}</td><td>${flipStatus}</td><td>${status}</td>
      <td><button class="action-btn edit-btn" onclick="markFlipped('${s._id}')">↻</button><button class="action-btn delete" onclick="deleteStock('${s._id}')">🗑</button></td></tr>`;
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
  if (!cross.id) { toast('Cross ID required'); return; }
  await dbAdd('crosses', cross);
  logActivity('create', 'Crosses', `Added cross "${cross.id}" (${cross.gen}): ${cross.female} × ${cross.male}`);
  ['crossId','crossFemale','crossMale','crossHypothesis'].forEach(id => document.getElementById(id).value = '');
  toast('Cross added');
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
  if (!canDelete()) { toast('No permission to delete'); return; }
  const c = data.crosses.find(x => x._id === id);
  if (confirm('Delete this cross?')) { await dbDelete('crosses', id); logActivity('delete', 'Crosses', `Deleted cross "${c.id}"`); }
};
function renderCrosses() {
  const tbody = document.getElementById('crossTableBody');
  if (!tbody) return;
  let filtered = data.crosses.filter(c => {
    if (activeCrossFilter === 'all') return true;
    if (activeCrossFilter === 'active' || activeCrossFilter === 'complete') return c.status === activeCrossFilter;
    return c.gen === activeCrossFilter;
  });
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#666;">No crosses</td></tr>'; return; }
  tbody.innerHTML = filtered.map(c => {
    const day = c.date ? Math.floor((Date.now() - new Date(c.date).getTime()) / 86400000) : 0;
    return `<tr><td><strong>${c.id}</strong></td><td><span class="badge b-${c.gen.toLowerCase()}">${c.gen}</span></td>
      <td style="font-family:monospace; font-size:11px;">${c.female || '?'} <span style="color:#888;">×</span> ${c.male || '?'}</td>
      <td>${c.date ? new Date(c.date).toLocaleDateString() : '—'}</td><td><strong>Day ${day}</strong></td>
      <td>${c.temp || 25}°C</td><td><span class="badge b-${c.status === 'active' ? 'active' : 'done'}">${c.status}</span></td>
      <td><button class="action-btn edit-btn" onclick="toggleCrossStatus('${c._id}')">✓</button><button class="action-btn delete" onclick="deleteCross('${c._id}')">🗑</button></td></tr>`;
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
  if (!v.date) { toast('Date required'); return; }
  await dbAdd('virgins', v);
  logActivity('create', 'Virgins', `Logged ${v.females}♀ ${v.males}♂ from "${v.source}" (${v.session})`);
  document.getElementById('virginFemales').value = 0;
  document.getElementById('virginMales').value = 0;
  document.getElementById('virginNotes').value = '';
  toast('Collection logged');
};
window.deleteVirgin = async function(id) {
  if (!canDelete()) { toast('No permission to delete'); return; }
  const v = data.virgins.find(x => x._id === id);
  if (confirm('Delete?')) { await dbDelete('virgins', id); logActivity('delete', 'Virgins', `Deleted collection from ${new Date(v.date).toLocaleDateString()}`); }
};
function renderVirgins() {
  const tbody = document.getElementById('virginTableBody');
  if (!tbody) return;
  const sorted = [...data.virgins].sort((a,b) => (b.created||0) - (a.created||0));
  if (sorted.length === 0) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem; color:#666;">No collections</td></tr>';
  else tbody.innerHTML = sorted.map(v => `<tr><td>${new Date(v.date).toLocaleDateString()}</td><td style="font-family:monospace;">${v.time || '—'}</td>
      <td><span class="badge ${v.session === 'AM' ? 'b-f1' : 'b-f2'}">${v.session}</span></td><td>${v.source || '—'}</td>
      <td><span class="badge b-female">${v.females}</span></td><td><span class="badge b-male">${v.males}</span></td>
      <td>${v.container || '—'}</td><td>${v.temp}°C</td>
      <td><button class="action-btn delete" onclick="deleteVirgin('${v._id}')">🗑</button></td></tr>`).join('');
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
  cont.innerHTML = phenoCategories.map((cat, i) => `<div class="phenotype-counter"><label style="text-transform:none; letter-spacing:0;">${cat}</label>
    <div class="counter-controls"><button class="counter-btn" onclick="adjustCounter(${i}, -1)">−</button>
    <input type="number" id="counter-${i}" value="0" min="0" style="background:transparent;border:none;box-shadow:none;text-align:center;color:var(--text-bright);width:60px;font-size:24px;font-weight:700;padding:0;">
    <button class="counter-btn" onclick="adjustCounter(${i}, 1)">+</button></div>
    <button class="action-btn delete" onclick="removeCategory(${i})" style="font-size:10px;">remove</button></div>`).join('');
}
window.savePhenotype = async function() {
  const counts = {};
  let total = 0;
  phenoCategories.forEach((cat, i) => { const v = parseInt(document.getElementById(`counter-${i}`).value) || 0; counts[cat] = v; total += v; });
  const p = { vial: document.getElementById('phenoVial').value.trim(), gen: document.getElementById('phenoGen').value, date: document.getElementById('phenoDate').value, counts, total, notes: document.getElementById('phenoNotes').value.trim() };
  if (!p.vial || total === 0) { toast('Vial ID and counts required'); return; }
  await dbAdd('phenotypes', p);
  logActivity('create', 'Phenotyping', `Scored "${p.vial}" (${p.gen}), n=${total}`);
  resetCounters();
  document.getElementById('phenoNotes').value = '';
  toast('Saved');
};
window.deletePheno = async function(id) {
  if (!canDelete()) { toast('No permission to delete'); return; }
  const p = data.phenotypes.find(x => x._id === id);
  if (confirm('Delete?')) { await dbDelete('phenotypes', id); logActivity('delete', 'Phenotyping', `Deleted scoring of "${p.vial}"`); }
};
function renderPhenotypes() {
  const tbody = document.getElementById('phenoTableBody');
  if (!tbody) return;
  const sorted = [...data.phenotypes].sort((a,b) => (b.created||0) - (a.created||0));
  if (sorted.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#666;">No data</td></tr>'; return; }
  tbody.innerHTML = sorted.map(p => {
    const summary = Object.entries(p.counts).filter(([_,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(' • ');
    return `<tr><td>${new Date(p.date).toLocaleDateString()}</td><td><strong>${p.vial}</strong></td>
      <td><span class="badge b-${p.gen.toLowerCase()}">${p.gen}</span></td><td style="font-size:11px;">${summary}</td>
      <td><strong>${p.total}</strong></td><td style="font-size:11px; color:#888;">${(p.notes || '').substring(0, 30)}</td>
      <td><button class="action-btn delete" onclick="deletePheno('${p._id}')">🗑</button></td></tr>`;
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
  if (!n.date || !n.title) { toast('Date and title required'); return; }
  await dbAdd('notes', n);
  logActivity('create', 'Notebook', `Added entry "${n.title}"`);
  ['noteTitle','noteHypothesis','noteMethods','noteResults','noteConclusion','noteTags'].forEach(id => document.getElementById(id).value = '');
  toast('Saved');
};
window.deleteNote = async function(id) {
  if (!canDelete()) { toast('No permission to delete'); return; }
  const n = data.notes.find(x => x._id === id);
  if (confirm('Delete entry?')) { await dbDelete('notes', id); logActivity('delete', 'Notebook', `Deleted entry "${n.title}"`); }
};
function renderNotes() {
  const list = document.getElementById('notesList');
  if (!list) return;
  const search = document.getElementById('noteSearch')?.value.toLowerCase() || '';
  const sorted = [...data.notes].sort((a,b) => (b.created||0) - (a.created||0));
  let filtered = sorted.filter(n => !search || `${n.title} ${n.hypothesis} ${n.methods} ${n.results} ${n.conclusion} ${n.tags}`.toLowerCase().includes(search));
  if (filtered.length === 0) { list.innerHTML = '<div class="empty-state"><div class="icon">📓</div><p>No entries</p></div>'; return; }
  list.innerHTML = filtered.map(n => `<div class="note-entry"><div class="note-header"><div class="note-title">${n.title}</div><div class="note-date">${new Date(n.date).toLocaleDateString()}${n.createdBy ? ' • ' + n.createdBy : ''}</div></div>
      ${n.hypothesis ? `<div class="note-section"><strong>Hypothesis</strong><div>${n.hypothesis}</div></div>` : ''}
      ${n.methods ? `<div class="note-section"><strong>Methods</strong><div>${n.methods}</div></div>` : ''}
      ${n.results ? `<div class="note-section"><strong>Results</strong><div>${n.results}</div></div>` : ''}
      ${n.conclusion ? `<div class="note-section"><strong>Conclusions</strong><div>${n.conclusion}</div></div>` : ''}
      ${n.tags ? `<div style="margin-top:8px;">${n.tags.split(',').map(t => `<span class="badge b-wt" style="margin-right:4px;">#${t.trim()}</span>`).join('')}</div>` : ''}
      <div style="text-align:right; margin-top:8px;"><button class="action-btn delete" onclick="deleteNote('${n._id}')">🗑 Delete</button></div></div>`).join('');
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
  if (!p.name) { toast('Name required'); return; }
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
  toast('Saved to cloud');
};
window.deleteProtocol = async function(id) {
  if (!canDelete()) { toast('No permission to delete'); return; }
  const p = data.protocols.find(x => x._id === id);
  if (confirm('Delete this protocol?')) { await dbDelete('protocols', id); logActivity('delete', 'Protocols', `Deleted protocol "${p.name}"`); }
};
window.downloadProtocolFile = function(id) {
  const p = data.protocols.find(x => x._id === id);
  if (!p.file) return;
  const a = document.createElement('a');
  a.href = p.file.data; a.download = p.file.name; a.click();
};
window.loadDefaultProtocols = async function() {
  if (data.protocols.length > 0 && !confirm('Add default protocols?')) return;
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
    return `<div class="protocol-card"><div class="protocol-header"><div><div class="protocol-title">${p.name}</div><div class="protocol-meta">${p.category} ${p.duration ? '• ' + p.duration : ''}</div></div>
      <div><button class="action-btn edit-btn" onclick="openProtocolModal('${p._id}')">✏️</button><button class="action-btn delete" onclick="deleteProtocol('${p._id}')">🗑</button></div></div>
      ${p.materials ? `<div style="margin-bottom:8px;"><strong style="font-size:11px; color:#888; text-transform:uppercase;">Materials</strong><div class="protocol-body">${p.materials}</div></div>` : ''}
      ${p.steps ? `<div style="margin-bottom:8px;"><strong style="font-size:11px; color:#888; text-transform:uppercase;">Steps</strong><div class="protocol-body">${p.steps}</div></div>` : ''}
      ${p.notes ? `<div><strong style="font-size:11px; color:#888; text-transform:uppercase;">Notes</strong><div class="protocol-body">${p.notes}</div></div>` : ''}
      ${p.file ? `<div class="file-attach" onclick="downloadProtocolFile('${p._id}')">${fileIcon} ${p.file.name} <span style="color:#888; font-size:11px;">(${(p.file.size/1024).toFixed(0)} KB) — click to download</span></div>` : ''}</div>`;
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
  if (!confirm(`Delete ${oldLogs.length} log${oldLogs.length === 1 ? '' : 's'} older than 30 days? This cannot be undone.`)) return;
  const n = await deleteLogDocs(oldLogs);
  toast(`Deleted ${n} old log${n === 1 ? '' : 's'}`);
};
window.clearAllLogs = async function() {
  if (!currentProfile || currentProfile.role !== 'super_admin') { toast('Only Super Admin can clear logs'); return; }
  if (data.logs.length === 0) { toast('No logs to delete'); return; }
  if (!confirm(`Delete ALL ${data.logs.length} logs? This permanently erases the entire activity history and cannot be undone.`)) return;
  if (!confirm('Are you absolutely sure? This wipes the whole log.')) return;
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
  if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#666;">No log entries</td></tr>'; return; }
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
    return `<tr><td><strong>${u.name}</strong>${u.email === currentProfile.email ? ' <span style="color:#4a9eff;">(you)</span>' : ''}</td>
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
  if (flipList) flipList.innerHTML = flipsDue.length === 0 ? '<div class="empty-state"><p>✓ All current</p></div>' : flipsDue.slice(0, 5).map(s => { const days = Math.floor((Date.now() - new Date(s.flipDate).getTime()) / 86400000); return `<li class="task-item"><span class="task-time" style="color:#e8b14e;">${days}d</span><span class="task-desc"><strong>${s.id}</strong> — ${s.genotype || s.name || ''}</span><span class="task-priority">Flip!</span></li>`; }).join('');
  const activeCrossList = document.getElementById('activeCrossList');
  if (activeCrossList) { const active = data.crosses.filter(c => c.status === 'active').slice(0, 5); activeCrossList.innerHTML = active.length === 0 ? '<div class="empty-state"><p>No active crosses</p></div>' : active.map(c => { const day = c.date ? Math.floor((Date.now() - new Date(c.date).getTime()) / 86400000) : 0; return `<li class="task-item"><span class="task-time">Day ${day}</span><span class="task-desc"><strong>${c.id}</strong> (${c.gen}) — ${c.female} × ${c.male}</span></li>`; }).join(''); }
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
