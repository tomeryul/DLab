# 🪰 FlyLab Pro — מדריך העלאה והפיכה לאפליקציה (PWA)

האפליקציה שלך מוכנה לעבוד כאפליקציה בטלפון (PWA). מבנה הקבצים:

```
flylab/
├── index.html          ← מבנה ה-HTML
├── styles.css          ← כל ה-CSS
├── manifest.json       ← שם, אייקון, צבעים
├── sw.js               ← service worker (אופליין + התקנה)
├── firebase.json       ← הגדרות Firebase Hosting (לא בשימוש ב-GitHub Pages)
├── icon-192.png, icon-512.png, icon-maskable.png, apple-touch-icon.png
└── js/
    ├── app.js          ← הלוגיקה הראשית (Firebase, CRUD, ייצוא)
    ├── shell.js        ← סיידבר / drawer / command palette
    └── sw-register.js  ← רישום ה-service worker
```

⚠️ **חשוב:** PWA עובד רק מעל `https://` (או localhost). פתיחת הקובץ ישירות (`file://`) לא תרשום service worker, וגם לא תטען את המודולים (`js/app.js`). חייבים להעלות לאחסון.

---

## אפשרות א' — GitHub Pages (מה שביקשת)

1. צור repo חדש ב-GitHub והעלה אליו את **כל** הקבצים שבתיקייה (כולל תיקיית `js/` והאייקונים), כשהם בשורש ה-repo.
2. ב-repo: **Settings → Pages → Source**: בחר branch `main` ותיקייה `/ (root)`, ואז **Save**.
3. אחרי דקה-שתיים האפליקציה תהיה זמינה בכתובת:
   ```
   https://USERNAME.github.io/REPO-NAME/
   ```

### ⚠️ שלב קריטי — Firebase Authorized Domains
בלי השלב הזה ההתחברות (login) **תיכשל** בכתובת החדשה.
בקונסולת Firebase של הפרויקט `flylab-c1f97`:
**Authentication → Settings → Authorized domains → Add domain**, והוסף:
```
USERNAME.github.io
```

הערה: הנתיבים בפרויקט יחסיים (`styles.css`, `js/app.js`, `./icon-192.png`), לכן הכל עובד גם בתת-נתיב של GitHub Pages ללא שינוי. ה-`firebase.json` פשוט מתעלמים ממנו ב-GitHub Pages.

---

## אפשרות ב' — Firebase Hosting (יש לך כבר Firebase)

פעם אחת בלבד, במחשב:

1. התקן Node.js (אם אין), ואז:
   ```
   npm install -g firebase-tools
   ```
2. התחבר לחשבון Google שלך:
   ```
   firebase login
   ```
3. בתיקייה שמכילה את כל הקבצים האלה, הרץ:
   ```
   firebase init hosting
   ```
   - בחר **Use an existing project** → `flylab-c1f97`
   - "public directory?" → הקלד נקודה: `.`
   - "Configure as a single-page app?" → **No** (כבר יש firebase.json שלנו)
   - "Overwrite index.html?" → **No**
4. העלה:
   ```
   firebase deploy --only hosting
   ```

בסיום תקבל כתובת כמו `https://flylab-c1f97.web.app`. הדומיין הזה כבר מורשה אוטומטית ב-Firebase Auth.

---

## אפשרות ג' — כל אחסון סטטי אחר

אפשר גם Netlify (גרירה לחלון), Vercel, וכו'. כולם נותנים https אוטומטי. גם שם — אם משתמשים ב-login, צריך להוסיף את הדומיין ל-Authorized domains ב-Firebase.

---

## 📲 התקנה בטלפון

**iPhone (Safari):**
1. פתח את הכתובת בספארי
2. לחץ על כפתור השיתוף (□↑)
3. בחר **"Add to Home Screen" / "הוסף למסך הבית"**
4. אייקון FlyLab Pro יופיע על המסך, נפתח במסך מלא בלי שורת הדפדפן

**Android (Chrome):**
1. פתח את הכתובת בכרום
2. תופיע הצעה אוטומטית "Install app" — או דרך תפריט ⋮ → **"Add to Home screen / Install app"**

---

## עדכון גרסה בעתיד

אחרי שתשנה משהו באחד מקבצי האפליקציה (`index.html`, `styles.css`, או קבצי `js/`):
1. שנה את השורה `const CACHE = 'flylab-shell-v1';` ב-`sw.js` ל-`v2`, `v3` וכו' — זה מכריח את הדפדפן למשוך את הגרסה החדשה ולנקות את המטמון הישן.
2. העלה מחדש (push ל-GitHub, או `firebase deploy --only hosting`).
