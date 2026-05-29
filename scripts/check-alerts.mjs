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

function computeAlerts(stocks, virgins, settings) {
  const out = [];
  const critDays = settings.flipCritDays || 14;

  // 1. Flip overdue — stock past flipCritDays since last flip
  for (const s of stocks) {
    if (!s.flipDate) continue;
    const days = Math.floor((Date.now() - new Date(s.flipDate).getTime()) / 86400000);
    if (days > critDays) {
      out.push({
        key: `flip-${s._id}`,
        title: '🔥 Flip overdue',
        body: `${s.id || 'Stock'} is ${days} days since last flip.`,
        cooldownHours: FLIP_COOLDOWN_HRS,
        meta: { type: 'flip', stockId: s._id }
      });
    }
  }

  // 2. Virgin window closes in <VIRGIN_LEAD_MIN min
  const winHrs = settings.virginWindow25 || 12;
  for (const v of virgins) {
    if (!v.date || !v.time) continue;
    const collected = new Date(`${v.date}T${v.time}`);
    if (isNaN(+collected)) continue;
    const closesAt = collected.getTime() + winHrs * 3600 * 1000;
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

  return out;
}

async function fetchEverything() {
  const [stocksSnap, virginsSnap, usersSnap, settingsSnap] = await Promise.all([
    db.collection('stocks').get(),
    db.collection('virgins').get(),
    db.collection('users').get(),
    db.doc('config/settings').get()
  ]);
  return {
    stocks:   stocksSnap.docs.map(d => ({ _id: d.id, ...d.data() })),
    virgins:  virginsSnap.docs.map(d => ({ _id: d.id, ...d.data() })),
    users:    usersSnap.docs.map(d => ({ uid: d.id, ...d.data() })),
    settings: settingsSnap.exists ? settingsSnap.data() : {}
  };
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
    notification: { title: alert.title, body: alert.body },
    data: {
      tag: alert.key,
      type: String(alert.meta?.type || ''),
      stockId: String(alert.meta?.stockId || ''),
      virginId: String(alert.meta?.virginId || '')
    },
    webpush: {
      notification: {
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: alert.key,
        requireInteraction: true
      },
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
