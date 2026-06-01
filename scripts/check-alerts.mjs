/* ============================================================
   FlyLab Pro — periodic alert scanner
   Runs on GitHub Actions every 5 minutes. Reads stocks +
   virgins + users + config/settings from Firestore, picks new
   alerts (with cooldown via /notifLedger), and sends FCM Web
   Push to every registered device token.
   ============================================================ */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const FLIP_COOLDOWN_HRS = 12;
const VIRGIN_COOLDOWN_HRS = 1;
const VIRGIN_LEAD_MIN = 30;        // notify this long before the window closes
const SCHEDULE_WINDOW_MIN = 15;    // grace window after a scheduled slot
const LOCAL_TZ = 'Asia/Jerusalem'; // schedule times are stored as local HH:MM
const FLIP_DAY_START_MIN = 7 * 60;  // 07:00 — earliest local time to push flip reminders
const FLIP_DAY_END_MIN = 17 * 60;   // 17:00 — latest local time to push flip reminders

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    console.error('FIREBASE_SERVICE_ACCOUNT secret is empty.');
    process.exit(1);
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    console.error('FIREBASE_SERVICE_ACCOUNT secret is not valid JSON:', e.message);
    process.exit(1);
  }
  if (!parsed.project_id) {
    console.error('Service account JSON is missing project_id — wrong file?');
    process.exit(1);
  }
  return parsed;
}

initializeApp({ credential: cert(readServiceAccount()) });
const db = getFirestore();
const fcm = getMessaging();

function nowInLocalTZ(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: LOCAL_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map(x => [x.type, x.value]));
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10)
  };
}

// Convert a wall-clock date+time captured in LOCAL_TZ (e.g. '2026-05-29','08:00')
// into the UTC milliseconds for that moment. Without this, new Date('YYYY-MM-DDTHH:MM')
// is interpreted in the runner's timezone (UTC on GitHub Actions), so a virgin
// collected at 08:00 Israel time would be read as 08:00 UTC — a 2–3 hour drift
// depending on IDT/IST. DST is handled implicitly via Intl.
function localTZToUTCms(dateStr, timeStr) {
  const [y, mo, d] = String(dateStr).split('-').map(Number);
  const [h, mi]    = String(timeStr).split(':').map(Number);
  if ([y, mo, d, h, mi].some(n => !Number.isFinite(n))) return NaN;
  const fakeUTC = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: LOCAL_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(fakeUTC)).map(x => [x.type, x.value]));
  const tzAsIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return fakeUTC - (tzAsIfUTC - fakeUTC);
}

function computeAlerts(stocks, virgins, settings) {
  const out = [];
  const local = nowInLocalTZ();
  const flipInWakingHours = local.minutes >= FLIP_DAY_START_MIN && local.minutes < FLIP_DAY_END_MIN;

  // 1. Flip overdue — each stock list (Stock A / B / Weekly) gets its own
  // critical-days threshold. Only push during local waking hours (07:00–17:00);
  // overnight overdue stocks are picked up at the next 07:00 tick.
  if (flipInWakingHours) {
    for (const s of stocks) {
      if (!s.flipDate) continue;
      const days = Math.floor((Date.now() - new Date(s.flipDate).getTime()) / 86400000);
      const critDays = critDaysFor(settings, s._source || 'stocks');
      if (days > critDays) {
        out.push({
          key: `flip-${s._source || 'stocks'}-${s._id}`,
          title: '🔥 Flip overdue',
          body: `${s.id || 'Stock'} is ${days} days since last flip.`,
          cooldownHours: FLIP_COOLDOWN_HRS,
          meta: { type: 'flip', stockId: s._id, source: s._source || 'stocks' }
        });
      }
    }
  }

  // 2. Virgin window closes in <VIRGIN_LEAD_MIN min
  const winHrs = settings.virginWindow25 || 12;
  for (const v of virgins) {
    if (!v.date || !v.time) continue;
    const collectedMs = localTZToUTCms(v.date, v.time);
    if (!Number.isFinite(collectedMs)) continue;
    const closesAt = collectedMs + winHrs * 3600 * 1000;
    const minsLeft = (closesAt - Date.now()) / 60000;
    if (minsLeft > 0 && minsLeft <= VIRGIN_LEAD_MIN) {
      out.push({
        key: `vw-${v._id}`,
        title: '⏰ Virgin window closing',
        body: `${v.source || 'A collection'} closes in ${Math.round(minsLeft)} min.`,
        cooldownHours: VIRGIN_COOLDOWN_HRS,
        meta: { type: 'virgin', virginId: v._id }
      });
    }
  }

  // 3. Daily schedule — fire once per day per slot when local clock catches up
  const schedule = Array.isArray(settings.schedule) ? settings.schedule : [];
  schedule.forEach((s, idx) => {
    if (!s || !s.time || !s.desc) return;
    const m = String(s.time).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return;
    const schedMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const delta = local.minutes - schedMin;
    if (delta < 0 || delta > SCHEDULE_WINDOW_MIN) return;
    const isCrit = s.priority === 'critical';
    out.push({
      key: `sched-${local.ymd}-${idx}-${s.time}`,
      title: isCrit ? `🚨 ${s.time} — Critical` : `🗓 ${s.time} — Reminder`,
      body: s.desc,
      cooldownHours: 23,
      meta: { type: 'schedule', idx, time: s.time }
    });
  });

  return out;
}

async function fetchEverything() {
  // Three parallel stocks collections — tag each loaded doc with its source
  // so computeAlerts can pick the right flip threshold per source.
  const [stocksSnap, stocks2Snap, weeklySnap, virginsSnap, usersSnap, settingsSnap] = await Promise.all([
    db.collection('stocks').get(),
    db.collection('stocks2').get(),
    db.collection('weekly').get(),
    db.collection('virgins').get(),
    db.collection('users').get(),
    db.doc('config/settings').get()
  ]);
  const tag = (snap, src) => snap.docs.map(d => ({ _id: d.id, _source: src, ...d.data() }));
  return {
    stocks: [
      ...tag(stocksSnap, 'stocks'),
      ...tag(stocks2Snap, 'stocks2'),
      ...tag(weeklySnap, 'weekly')
    ],
    virgins:  virginsSnap.docs.map(d => ({ _id: d.id, ...d.data() })),
    users:    usersSnap.docs.map(d => ({ uid: d.id, ...d.data() })),
    settings: settingsSnap.exists ? settingsSnap.data() : {}
  };
}

// Per-source flip critical-days lookup, mirroring the client's getFlipDays().
function critDaysFor(settings, source) {
  const slot = (settings.flipPerSource && settings.flipPerSource[source]) || {};
  return Number.isFinite(+slot.crit) ? +slot.crit : (+settings.flipCritDays || 14);
}

function allTokensWithOwner(users) {
  // Returns [{ uid, token }, ...] so we can map a dead token back to its owner doc
  const out = [];
  for (const u of users) {
    for (const t of u.fcmTokens || []) {
      if (t) out.push({ uid: u.uid, token: t });
    }
  }
  return out;
}

async function pruneDeadTokens(deadByUid) {
  for (const [uid, dead] of Object.entries(deadByUid)) {
    if (dead.length === 0) continue;
    const ref = db.doc(`users/${uid}`);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const current = snap.data().fcmTokens || [];
    const filtered = current.filter(t => !dead.includes(t));
    if (filtered.length !== current.length) {
      await ref.update({ fcmTokens: filtered });
      console.log(`Pruned ${current.length - filtered.length} dead token(s) from users/${uid}`);
    }
  }
}

async function processAlert(alert, owners) {
  const ledgerRef = db.doc(`notifLedger/${alert.key}`);
  const ledger = await ledgerRef.get();
  if (ledger.exists) {
    const last = ledger.data().sentAt || 0;
    if (Date.now() - last < alert.cooldownHours * 3600 * 1000) {
      return { skipped: true };
    }
  }
  const tokens = owners.map(o => o.token);
  if (tokens.length === 0) return { skipped: true, reason: 'no-tokens' };

  const result = await fcm.sendEachForMulticast({
    tokens,
    // Data-only message: forces firebase-messaging-sw.js's onBackgroundMessage
    // handler to fire on every platform (Chrome auto-handles top-level
    // `notification:` fields, but iOS PWA silently drops them — keeping the
    // payload data-only is the portable path).
    data: {
      title: alert.title,
      body: alert.body,
      tag: alert.key,
      type: String(alert.meta?.type || ''),
      stockId: String(alert.meta?.stockId || ''),
      virginId: String(alert.meta?.virginId || '')
    },
    webpush: {
      headers: { Urgency: 'high' },
      fcmOptions: { link: '/' }
    }
  });

  // Track dead tokens by owner so we can prune them once at the end
  const deadByUid = {};
  result.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code || '';
    if (code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument') {
      const owner = owners[i];
      if (!deadByUid[owner.uid]) deadByUid[owner.uid] = [];
      deadByUid[owner.uid].push(owner.token);
    }
  });

  await ledgerRef.set({
    sentAt: Date.now(),
    title: alert.title,
    type: alert.meta?.type || 'unknown',
    successCount: result.successCount,
    failureCount: result.failureCount
  });

  return {
    skipped: false,
    successCount: result.successCount,
    failureCount: result.failureCount,
    deadByUid
  };
}

async function main() {
  const startedAt = Date.now();
  const { stocks, virgins, users, settings } = await fetchEverything();
  const owners = allTokensWithOwner(users);
  console.log(`Loaded ${stocks.length} stocks, ${virgins.length} virgins, ${owners.length} device token(s)`);

  if (owners.length === 0) {
    console.log('No devices registered for push — nothing to do.');
    return;
  }

  const alerts = computeAlerts(stocks, virgins, settings);
  console.log(`Computed ${alerts.length} candidate alert(s)`);

  let sent = 0, skipped = 0, deadAcc = {};
  for (const alert of alerts) {
    try {
      const result = await processAlert(alert, owners);
      if (result.skipped) { skipped++; continue; }
      sent++;
      console.log(`Sent ${alert.key} → ${result.successCount} ok / ${result.failureCount} failed`);
      for (const [uid, list] of Object.entries(result.deadByUid || {})) {
        deadAcc[uid] = (deadAcc[uid] || []).concat(list);
      }
    } catch (e) {
      console.error(`Failed to process ${alert.key}:`, e.message);
    }
  }

  await pruneDeadTokens(deadAcc);

  const ms = Date.now() - startedAt;
  console.log(`Done in ${ms}ms — sent=${sent} skipped=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Cron failed:', err); process.exit(1); });
