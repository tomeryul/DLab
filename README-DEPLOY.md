# 🪰 FlyLab Pro — מדריך הפיכה לאפליקציה (PWA)

האפליקציה שלך מוכנה לעבוד כאפליקציה בטלפון (PWA). יש בחבילה:

- `index.html` — האפליקציה (עם service worker רשום + meta tags ל-iOS)
- `manifest.json` — מגדיר שם, אייקון, צבעים
- `sw.js` — service worker (תמיכה אופליין + התקנה)
- `icon-192.png`, `icon-512.png`, `icon-maskable.png`, `apple-touch-icon.png` — אייקונים
- `firebase.json` — הגדרות Firebase Hosting

⚠️ **חשוב:** PWA עובד רק מעל `https://` (או localhost). פתיחת הקובץ ישירות (`file://`) לא תרשום service worker ולא תאפשר התקנה. חייבים להעלות לאחסון.

---

## אפשרות א' — Firebase Hosting (מומלץ, כבר יש לך Firebase)

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
   - "What do you want to use as your public directory?" → הקלד נקודה: `.`
   - "Configure as a single-page app?" → **No** (כבר יש firebase.json שלנו)
   - "Overwrite index.html?" → **No**
4. העלה:
   ```
   firebase deploy --only hosting
   ```

בסיום תקבל כתובת כמו `https://flylab-c1f97.web.app`. זהו — האפליקציה באוויר.

---

## אפשרות ב' — כל אחסון סטטי אחר

אפשר גם להעלות את כל הקבצים ל-Netlify (גרירה לחלון), Vercel, GitHub Pages, וכו'. כל אחד מהם נותן https אוטומטי.

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

אחרי שתשנה משהו ב-`index.html`:
1. שנה את השורה `const CACHE = 'flylab-shell-v1';` ב-`sw.js` ל-`v2`, `v3` וכו' (כדי שהדפדפן ימשוך את הגרסה החדשה)
2. הרץ שוב `firebase deploy --only hosting`
