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

  function buildItems() {
    cmdkItems = [];
    document.querySelectorAll('.sidebar .tab-btn').forEach(function (btn) {
      if (btn.offsetParent === null) return; // skip hidden (admin) tabs
      var ico = btn.querySelector('.nav-ico');
      cmdkItems.push({ tab: btn.dataset.tab, label: TITLES[btn.dataset.tab] || btn.dataset.tab, icon: ico ? ico.textContent : '•', btn: btn });
    });
  }

  function paint(filter) {
    var list = document.getElementById('cmdkList');
    var f = (filter || '').toLowerCase();
    var shown = cmdkItems.filter(function (it) { return it.label.toLowerCase().indexOf(f) !== -1; });
    if (shown.length === 0) { list.innerHTML = '<div class="cmdk-empty">No matching sections</div>'; cmdkActive = 0; return; }
    if (cmdkActive >= shown.length) cmdkActive = 0;
    list.innerHTML = shown.map(function (it, i) {
      return '<div class="cmdk-item' + (i === cmdkActive ? ' active' : '') + '" data-tab="' + it.tab + '"><span class="nav-ico">' + it.icon + '</span><span>' + it.label + '</span></div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.cmdk-item'), function (row) {
      row.addEventListener('click', function () { go(row.getAttribute('data-tab')); });
    });
  }

  function visibleItems() {
    var f = (document.getElementById('cmdkInput').value || '').toLowerCase();
    return cmdkItems.filter(function (it) { return it.label.toLowerCase().indexOf(f) !== -1; });
  }

  function go(tab) {
    var target = document.querySelector('.sidebar .tab-btn[data-tab="' + tab + '"]');
    if (target) target.click();
    window.closeCmdK();
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
})();
