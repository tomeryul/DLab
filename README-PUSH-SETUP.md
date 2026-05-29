# Background push notifications — setup

A free way to make FlyLab buzz your phone even when the app is fully closed — including iPhone PWA installed via "Add to Home Screen" (iOS 16.4+).

**Cost:** $0/month. No credit card. No Firebase Blaze.

**How it works:** GitHub Actions runs `scripts/check-alerts.mjs` every 5 minutes, scans Firestore for overdue flips + closing virgin windows, and sends FCM Web Push to every device you've opted in. The repo is public, so Actions minutes are unlimited.

---

## הוראות התקנה (Hebrew)

זמן משוער: 10 דקות.

### 1. צור VAPID Key ב-Firebase Console

- היכנס ל-[Firebase Console](https://console.firebase.google.com/) → הפרויקט `flylab-c1f97`
- ⚙ Project Settings → **Cloud Messaging**
- גלול ל-**Web configuration** → **Web Push certificates** → **Generate key pair**
- העתק את ה-**Public key** (מחרוזת base64 ארוכה).

### 2. הדבק את ה-VAPID Key ב-`app.js`

פתח את `app.js`, חפש את:
```js
const VAPID_KEY = "PASTE_YOUR_VAPID_PUBLIC_KEY_HERE";
```
והחלף את המחרוזת ב-Public Key שהעתקת בשלב 1.

### 3. הורד Service Account JSON

- Firebase Console → Project Settings → **Service accounts** → **Generate new private key**
- הקובץ יורד למחשב שלך. **שמור אותו פרטי** — אל תעלה אותו ל-GitHub!

### 4. הוסף אותו כ-GitHub Secret

- ב-`https://github.com/tomeryul/dlab` → **Settings** → **Secrets and variables** → **Actions**
- **New repository secret**:
  - **Name:** `FIREBASE_SERVICE_ACCOUNT`
  - **Value:** הדבק את **כל התוכן של קובץ ה-JSON** (כולל סוגריים מסולסלים)
- שמור.

### 5. עדכן את ה-Firestore Rules

ב-Firebase Console → Firestore → Rules, הוסף את הבלוק הבא ל-`match /databases/{database}/documents`:

```
// FCM cooldown ledger — only the cron (admin SDK) writes here
match /notifLedger/{docId} {
  allow read: if isSuperAdmin();
}
```

(ה-Cron משתמש ב-Firebase Admin SDK שעוקף את ה-Rules, אבל הבלוק הזה מתעד את הכוונה ומאפשר ל-Super Admin לבדוק את הלוג.)

לחץ **Publish**.

### 6. דחוף את הקוד

הקבצים החדשים (`scripts/`, `.github/workflows/`, `firebase-messaging-sw.js`, ההגדרות ב-`app.js`) צריכים להיות ב-main או ב-Testbranch. ברגע שהם שם, GitHub Actions תתחיל להריץ את ה-cron אוטומטית — ראה Actions tab כדי לוודא שזה רץ.

### 7. במכשיר — הוסף את האפליקציה למסך הבית

- **iPhone**: פתח את FlyLab ב-Safari → Share → **Add to Home Screen**. פתח את האייקון מהמסך הבית (לא דרך הדפדפן!) → Settings → Lab alerts → טוגל פעיל → אשר את ההרשאה.
- **Android Chrome**: גם דרך Add to Home Screen → אותו הזרימה.
- **Desktop Chrome/Edge/Firefox**: פשוט אישור ההרשאה מספיק; הטאב לא חייב להיות פתוח.

זהו. עכשיו אתה אמור לקבל buzz גם כשהאפליקציה סגורה.

---

## English

Estimated time: 10 minutes.

### 1. Create a VAPID key in the Firebase Console

- Go to [Firebase Console](https://console.firebase.google.com/) → project `flylab-c1f97`
- ⚙ Project Settings → **Cloud Messaging**
- Scroll to **Web configuration** → **Web Push certificates** → **Generate key pair**
- Copy the **Public key** (a long base64 string).

### 2. Paste the VAPID key into `app.js`

In `app.js`, find:
```js
const VAPID_KEY = "PASTE_YOUR_VAPID_PUBLIC_KEY_HERE";
```
Replace the string with your Public key.

### 3. Generate a Firebase service-account JSON

- Firebase Console → Project Settings → **Service accounts** → **Generate new private key**
- A JSON file downloads. **Keep it private** — never commit it to the repo.

### 4. Add it as a GitHub Secret

- In `https://github.com/tomeryul/dlab` → **Settings** → **Secrets and variables** → **Actions**
- **New repository secret**:
  - **Name:** `FIREBASE_SERVICE_ACCOUNT`
  - **Value:** paste the **entire JSON file contents** (including the curly braces)
- Save.

### 5. Update Firestore Rules

In Firebase Console → Firestore → Rules, add this block to your `match /databases/{database}/documents`:

```
// FCM cooldown ledger — only the cron (admin SDK) writes here
match /notifLedger/{docId} {
  allow read: if isSuperAdmin();
}
```

(The cron uses Firebase Admin SDK which bypasses rules, but this block documents intent and lets the Super Admin inspect the ledger.)

Click **Publish**.

### 6. Push the code

The new files (`scripts/`, `.github/workflows/`, `firebase-messaging-sw.js`, the `app.js` wiring) need to be in `main` or `Testbranch`. Once they are, GitHub Actions starts running the cron automatically — check the Actions tab to confirm.

### 7. On each device — install as a PWA

- **iPhone**: open FlyLab in Safari → Share → **Add to Home Screen**. Open the icon from the home screen (not the browser tab!) → Settings → Lab alerts → toggle on → approve the OS prompt.
- **Android Chrome**: same Add to Home Screen flow.
- **Desktop Chrome/Edge/Firefox**: just granting permission is enough; the tab doesn't have to stay open.

That's it. You should now get a buzz even when FlyLab is fully closed.

---

## How to verify it's working

1. **Watch the cron run**: GitHub repo → **Actions** tab → "Lab alerts cron". You should see runs every 5 minutes once the secret is set. Click a run to see its log — it prints `Sent flip-XXXX → 1 ok / 0 failed` when a push goes out.

2. **Smoke-test a flip alert**: add a stock with `flipDate` = ~20 days ago (depends on `flipCritDays` in your settings). Within 5 minutes the cron will fire and your registered devices should buzz.

3. **Smoke-test a virgin window**: log a virgin collection with the date/time set to ~`virginWindow25 - 0.4 hours` ago — so the window closes within the next 30 min. The cron will fire on its next tick.

4. **Inspect the ledger**: Firestore → `notifLedger` — every fired alert leaves a `sentAt` timestamp here. Delete a doc to force a re-fire on the next tick.

---

## Troubleshooting

- **The Actions tab says "Secret FIREBASE_SERVICE_ACCOUNT is empty"** — repeat step 4. Paste the entire JSON, no extra quotes.

- **Notifications never arrive on iPhone** — confirm: iOS 16.4+, app installed via Add to Home Screen, opened from the home-screen icon (not Safari tab), permission granted in the OS prompt. iOS Safari **does not** support background push for regular browser tabs.

- **Cron runs but devices don't receive anything** — open Firestore → `users/{your uid}` → check that `fcmTokens` is a non-empty array. If empty, your VAPID key probably isn't right; recheck step 2. If non-empty but you still don't see notifications, look at the Actions log — `failureCount > 0` usually means the token is invalid or the SW couldn't run.

- **Notifications repeat too often / not often enough** — `FLIP_COOLDOWN_HRS` and `VIRGIN_COOLDOWN_HRS` in `scripts/check-alerts.mjs` control the per-alert cooldown. Defaults: 12 hr for flips, 1 hr for virgin windows.

- **You want to pause alerts** — flip the toggle off in Settings → Lab alerts. The client stops, but the server-side cron will still run; the alerts simply won't reach a device that's not registered. To fully stop the cron, disable the workflow in the Actions tab.
