/* ===== v5 shell interactions (sidebar / drawer / command palette) ===== */
(function () {
  var TITLES = { dashboard:'Dashboard', calendar:'Calendar', stocks:'Stocks', crosses:'Crosses', virgins:'Virgins', phenotype:'Phenotyping', notebook:'Lab notebook', protocols:'Protocols', settings:'Settings', logs:'Activity log', users:'Team members' };

  // ---- Drawer (mobile / tablet) ----
  window.toggleNav = function () { document.body.classList.toggle('nav-open'); };
  window.closeNav  = function () { document.body.classList.remove('nav-open'); };

  // ---- Collapse rail (desktop), persisted ----
  window.toggleCollapse = function () {
    document.body.classList.toggle('nav-collapsed');
    try { localStorage.setItem('flyLabNavCollapsed', document.body.classList.contains('nav-collapsed') ? '1' : '0'); } catch (e) {}
    var b = document.getElementById('collapseBtn'); if (b) b.textContent = document.body.classList.contains('nav-collapsed') ? '›' : '‹';
  };
  try {
    if (localStorage.getItem('flyLabNavCollapsed') === '1') {
      document.body.classList.add('nav-collapsed');
      var cb = document.getElementById('collapseBtn'); if (cb) cb.textContent = '›';
    }
  } catch (e) {}

  // ---- Update topbar title + close drawer on any sidebar nav click ----
  document.querySelectorAll('.sidebar .tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = TITLES[btn.dataset.tab] || 'FlyLab Pro';
      var el = document.getElementById('pageTitle'); if (el) el.textContent = t;
      window.closeNav();
    });
  });

  // ============ Command palette (Ctrl/Cmd + K) ============
  var cmdkActive = 0, cmdkItems = [];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function buildItems() {
    cmdkItems = [];
    // 1. Tabs first
    document.querySelectorAll('.sidebar .tab-btn').forEach(function (btn) {
      if (btn.offsetParent === null) return; // skip hidden (admin) tabs
      var ico = btn.querySelector('.nav-ico');
      cmdkItems.push({
        kind: 'tab',
        tab: btn.dataset.tab,
        label: TITLES[btn.dataset.tab] || btn.dataset.tab,
        sub: 'Tab',
        icon: ico ? ico.textContent : '•',
        search: (TITLES[btn.dataset.tab] || btn.dataset.tab).toLowerCase()
      });
    });
    // 2. Records from in-memory data (populated by app.js)
    var data = window.__flyLabData;
    if (!data) return;
    (data.stocks || []).forEach(function (s) {
      var name = s.name ? ' — ' + s.name : '';
      cmdkItems.push({ kind: 'record', tab: 'stocks', recordId: s._id, label: s.id + name, sub: 'Stock · ' + (s.type || 'untyped'), icon: '🧬', search: (s.id + ' ' + (s.name || '') + ' ' + (s.genotype || '') + ' ' + (s.type || '')).toLowerCase() });
    });
    (data.crosses || []).forEach(function (c) {
      cmdkItems.push({ kind: 'record', tab: 'crosses', recordId: c._id, label: c.id + ' (' + (c.gen || '?') + ')', sub: 'Cross · ' + (c.female || '?') + ' × ' + (c.male || '?'), icon: '⚗️', search: (c.id + ' ' + (c.gen || '') + ' ' + (c.female || '') + ' ' + (c.male || '')).toLowerCase() });
    });
    (data.notes || []).forEach(function (n) {
      cmdkItems.push({ kind: 'record', tab: 'notebook', recordId: n._id, label: n.title || '(untitled)', sub: 'Note · ' + (n.date || ''), icon: '📓', search: ((n.title || '') + ' ' + (n.tags || '') + ' ' + (n.hypothesis || '')).toLowerCase() });
    });
    (data.protocols || []).forEach(function (p) {
      cmdkItems.push({ kind: 'record', tab: 'protocols', recordId: p._id, label: p.name, sub: 'Protocol · ' + (p.category || 'uncategorized'), icon: '📋', search: ((p.name || '') + ' ' + (p.category || '') + ' ' + (p.materials || '')).toLowerCase() });
    });
  }

  function paint(filter) {
    var list = document.getElementById('cmdkList');
    var f = (filter || '').toLowerCase().trim();
    var shown;
    if (!f) {
      // Default: tabs only, to keep the empty state tidy
      shown = cmdkItems.filter(function (it) { return it.kind === 'tab'; });
    } else {
      shown = cmdkItems.filter(function (it) { return it.search.indexOf(f) !== -1; }).slice(0, 30);
    }
    if (shown.length === 0) { list.innerHTML = '<div class="cmdk-empty">No matches for "' + escapeHtml(filter) + '"</div>'; cmdkActive = 0; return; }
    if (cmdkActive >= shown.length) cmdkActive = 0;
    list.innerHTML = shown.map(function (it, i) {
      var sub = it.sub ? '<span class="cmdk-sub">' + escapeHtml(it.sub) + '</span>' : '';
      return '<div class="cmdk-item' + (i === cmdkActive ? ' active' : '') + '" data-idx="' + i + '"><span class="nav-ico">' + it.icon + '</span><span class="cmdk-label">' + escapeHtml(it.label) + sub + '</span></div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.cmdk-item'), function (row) {
      row.addEventListener('click', function () { goItem(shown[+row.getAttribute('data-idx')]); });
    });
  }

  function visibleItems() {
    var f = (document.getElementById('cmdkInput').value || '').toLowerCase().trim();
    if (!f) return cmdkItems.filter(function (it) { return it.kind === 'tab'; });
    return cmdkItems.filter(function (it) { return it.search.indexOf(f) !== -1; }).slice(0, 30);
  }

  function goItem(item) {
    if (!item) return;
    var target = document.querySelector('.sidebar .tab-btn[data-tab="' + item.tab + '"]');
    if (target) target.click();
    window.closeCmdK();
    if (item.kind === 'record' && item.recordId) {
      // Wait a tick for the tab to render
      setTimeout(function () {
        var row = document.querySelector('[data-record-id="' + item.recordId + '"]');
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.add('row-highlight');
          setTimeout(function () { row.classList.remove('row-highlight'); }, 1500);
        }
      }, 80);
    }
  }

  window.openCmdK = function () {
    buildItems();
    cmdkActive = 0;
    var bg = document.getElementById('cmdk');
    bg.classList.remove('hidden');
    var inp = document.getElementById('cmdkInput');
    inp.value = '';
    paint('');
    setTimeout(function () { inp.focus(); }, 30);
  };
  window.closeCmdK = function () { document.getElementById('cmdk').classList.add('hidden'); };

  document.getElementById('cmdkInput').addEventListener('input', function (e) { cmdkActive = 0; paint(e.target.value); });
  document.getElementById('cmdkInput').addEventListener('keydown', function (e) {
    var shown = visibleItems();
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdkActive = Math.min(cmdkActive + 1, shown.length - 1); paint(e.target.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkActive = Math.max(cmdkActive - 1, 0); paint(e.target.value); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[cmdkActive]) go(shown[cmdkActive].tab); }
    else if (e.key === 'Escape') { e.preventDefault(); window.closeCmdK(); }
  });
  document.getElementById('cmdk').addEventListener('click', function (e) { if (e.target.id === 'cmdk') window.closeCmdK(); });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      var open = !document.getElementById('cmdk').classList.contains('hidden');
      if (open) window.closeCmdK(); else window.openCmdK();
    }
  });

  // ============ Page-level keyboard shortcuts ============
  // Skip when the user is typing in a field; skip when modals/cmdk are open.
  function isTyping(e) {
    var t = e.target;
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }
  function anyModalOpen() {
    return !document.getElementById('cmdk').classList.contains('hidden')
      || document.querySelector('.modal-bg:not(.hidden):not(.modal-leaving)') !== null;
  }
  function activeTab() {
    var btn = document.querySelector('.sidebar .tab-btn.active');
    return btn ? btn.dataset.tab : 'dashboard';
  }
  function clickTab(tab) {
    var b = document.querySelector('.sidebar .tab-btn[data-tab="' + tab + '"]');
    if (b) b.click();
  }
  var GOTO = { d: 'dashboard', k: 'calendar', s: 'stocks', c: 'crosses', v: 'virgins', p: 'phenotype', n: 'notebook', r: 'protocols', t: 'settings' };
  var gPending = false, gTimer = null;

  document.addEventListener('keydown', function (e) {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (anyModalOpen()) {
        // Close the topmost modal-bg, if any
        var openModals = document.querySelectorAll('.modal-bg:not(.hidden):not(.modal-leaving)');
        if (openModals.length) {
          var last = openModals[openModals.length - 1];
          last.classList.add('modal-leaving');
          setTimeout(function () { last.remove(); }, 180);
          e.preventDefault();
        }
      }
      var dd = document.getElementById('exportDropdown');
      if (dd && !dd.classList.contains('hidden')) dd.classList.add('hidden');
      return;
    }
    if (anyModalOpen()) return;
    // "g" then letter → go-to-tab
    if (gPending) {
      gPending = false; clearTimeout(gTimer);
      var dest = GOTO[e.key.toLowerCase()];
      if (dest) { e.preventDefault(); clickTab(dest); }
      return;
    }
    if (e.key === 'g' || e.key === 'G') {
      gPending = true;
      gTimer = setTimeout(function () { gPending = false; }, 900);
      return;
    }
    // "n" → click the primary + Add button in the current tab
    if (e.key === 'n' || e.key === 'N') {
      var tab = document.getElementById(activeTab());
      var primary = tab && tab.querySelector('.btn-primary');
      if (primary) { e.preventDefault(); primary.click(); primary.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    // "/" → focus the search bar in the current tab
    if (e.key === '/') {
      var tab2 = document.getElementById(activeTab());
      var s = tab2 && tab2.querySelector('.search-bar input');
      if (s) { e.preventDefault(); s.focus(); s.select && s.select(); }
      return;
    }
  });
})();
