# Lift Log (Erika's copy)

A simple workout log for one person to use on an iPhone and for family to view. It is an installable web app (PWA) with big text, big buttons, and a number keypad.

This is a **separate app** built from the original Lift Log. It has its own website address, its own saved data on the phone, its own sign-in, and its own OneDrive file, so it never mixes with the original (see "Using both apps on one phone" below).

- **Log a workout:** pick Lower Body, Upper Body, Full Body or Physical Therapy, tap Start, enter the numbers, tap Finish.
- **Build your own workouts:** Settings, **Edit my workouts**. Add, remove, reorder and rename exercises whenever the plan changes (for example when physical therapy changes).
- **Three ways to count an exercise:** weight and reps, reps only (bodyweight or bands), or a timed hold in seconds.
- **Weekly streak:** work out 5 times in a week (Monday to Sunday) and a streak starts; every following week in a row with 5 workouts adds one. It shows on the Workout and Summary screens.
- **History and Summary:** fix old workouts, see workouts per week, and charts for each exercise (weight, reps, or seconds, whichever fits).
- **Works with no signal.** Everything saves on the phone first.
- **OneDrive sync:** a background copy goes to one file in a OneDrive folder, so family can see the same log.

It is a static website: there is no server to run or pay for.

---

## 1. Run it on your computer

You need **Node.js 20 or newer** (check with `node -v`).

```bash
cd ~/Projects/Erika-Lift-Log
npm install        # first time only
npm run dev        # test copy at http://localhost:5173
npm test           # runs the automatic tests
npm run build      # builds the real site into the "dist" folder
npm run preview    # serves the built site at http://localhost:4173
```

Keep this folder **out of OneDrive / iCloud synced folders**: `node_modules` has tens of thousands of files and chokes sync.

Do not run this and the original Lift Log's `npm run dev` at the same time: both want port 5173. (Stop one first, or start this one with `npm run dev -- --port 5175`. Microsoft sign-in only works on the addresses listed in step 3, so use 5173 or 4173 when testing sign-in.)

---

## 2. Put it on the internet (free): GitHub Pages

GitHub Pages hosts the site for free with https (needed for installing and sign-in). The workflow in `.github/workflows/deploy.yml` runs the tests, builds the site, and publishes it every time you push to `main`. It works out the website address from the repository name, so nothing needs editing.

**One-time setup**

1. On GitHub, click **New repository**. Name it exactly **`Erika-Lift-Log`** (capital letters matter, they become part of the address), choose **Public**, and leave "Add a README" and the other boxes **unticked**. (Free GitHub Pages needs a public repository. The repository holds only code: workouts live in OneDrive, and the Microsoft client ID is public by design.)
2. In the new repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Put the finished work on `main` and send it up. This folder was built on a branch called `erika-app`:

   ```bash
   cd ~/Projects/Erika-Lift-Log
   git status                      # should say "nothing to commit"
   git checkout main
   git merge erika-app
   git remote add origin https://github.com/addkap/Erika-Lift-Log.git
   git push -u origin main
   ```

4. Open the repository's **Actions** tab. When **Deploy to GitHub Pages** shows a green tick (about a minute), the site is live at:

   **`https://addkap.github.io/Erika-Lift-Log/`**

   (If the first run failed because Pages was not switched on yet, do step 2, then open the failed run and click **Re-run all jobs**.)

**Updating the app later:** make changes, then `git add -A`, `git commit -m "what changed"`, `git push`. The site updates by itself. Phones pick up the new version the next time the app is opened (close it fully and open it again once or twice).

---

## 3. Set up OneDrive sync

### How it works
- The phone's own storage is the source of truth. Logging never waits for OneDrive.
- In the background the app keeps **one file**, `erika-lift-log-data.json`, in the OneDrive folder you choose. It never opens, lists, changes or deletes any other file there. (The folder picker shows folder names only.) The original Lift Log's file, `lift-log-data.json`, is a different name and a different format, so the two apps cannot overwrite or import each other's data.
- Everyone opens the same site and signs in with their **own** Microsoft account. Every workout, exercise and workout list has an id and a last-changed time; when two copies differ, the newest change wins. Deletions are remembered so they sync too. Changes to your workout lists (Edit my workouts) sync the same way, so they follow you across devices.
- Before every upload the app re-reads the file. If someone else saved at the same moment, it merges their changes in and tries again, so nobody overwrites anybody.
- The bar under the header says **Synced**, **Not synced yet** (tap to sync), or **Tap to sync** (sign-in expired).
- Microsoft sign-ins for web apps expire after about 24 hours, and iPhones can block the quiet re-sign-in. When that happens nothing is lost: the bar says "Tap to sync", workouts keep saving on the phone, and one tap signs in and uploads everything waiting.
- If a phone loses its saved data, sign in and choose the folder again (Settings) and everything is pulled back from OneDrive. If the phone still remembers the folder and is signed in, it pulls on its own before showing the Workout page.

### The permission it asks for
One Microsoft Graph permission: **`Files.ReadWrite`**. For personal Microsoft accounts it covers the signed-in person's own OneDrive and folders shared with them. It is broader than "one folder" because Microsoft offers no narrower permission that reaches a shared folder on personal accounts. The app's code only touches `erika-lift-log-data.json`.

### Step A: Microsoft app registration
This app has **its own Microsoft app registration** (separate from the original Lift Log's). Its Application (client) ID, `103356ce-fabd-4cfe-9076-8753b3b9261e`, is already in `src/config.ts`; it is not a secret. Sign-in uses the personal-accounts address `https://login.microsoftonline.com/consumers`.

The registration must have these settings (Entra ID → App registrations → this app):
1. **Supported account types:** personal Microsoft accounts (see Troubleshooting if sign-in complains about a tenant).
2. **Authentication → Single-page application → Redirect URIs.** Each must match exactly, including `https`, the capital letters, and the final `/`:
   - `https://addkap.github.io/Erika-Lift-Log/` (the real site)
   - `http://localhost:5173/` (for `npm run dev`) and `http://localhost:4173/` (for `npm run preview`), only if you want to test sign-in on your computer
3. **API permissions:** Microsoft Graph, Delegated, **`Files.ReadWrite`** (leave `openid`, `profile` and `offline_access`). No admin approval is needed for personal accounts.

If sign-in ever says "redirect URI mismatch" or `invalid_request ... redirect_uri`, the address in the browser's address bar is not in that list exactly, or the client ID in `src/config.ts` belongs to a different registration. Compare character by character.

### Step B: Connect the folder
**The folder's owner (it is in their "My files")**
1. Settings → **Sign in with Microsoft**, and approve the permission screen.
2. Settings → **Choose the data folder** → tap **Use this folder** next to the folder (tap **Open** to look inside other folders). The app creates `erika-lift-log-data.json` there.

**Someone the folder is shared with (it is in "Shared with me")**
1. The owner opens the folder at <https://onedrive.live.com>, clicks **Share**, adds the person's Microsoft account with **Can edit**, and copies the link (it must be the link for the specific people chosen, with editing allowed).
2. The owner sends the link. In the app: Settings → **Sign in with Microsoft**, then **Choose the data folder**, paste the link under **A folder shared with me**, and tap **Use this link**.

Why a pasted link instead of a "Shared with me" list? Microsoft is retiring the API that lists shared items, and it would need a much broader permission.

### Settings and backup
- Settings shows who is signed in, the folder, the last sync time, and a **Sync now** button.
- **Export backup / Import backup** save and restore the same JSON format. Restoring merges; it never wipes what is on the phone. A backup from the original Lift Log is refused on purpose.

---

## 4. Put it on her iPhone (Home Screen app)

Do this after the site is live (step 2), because installing needs an https address.

1. On the iPhone, open **Safari** (not another browser) and go to `https://addkap.github.io/Erika-Lift-Log/`.
2. Tap the **Share** button (a square with an arrow pointing up, at the bottom of the screen).
3. Scroll down the menu and tap **Add to Home Screen**. (If you do not see it, tap **View More** first.)
4. Leave the name as **Lift Log** and tap **Add**.
5. Close Safari. From now on open the app **from the new icon on the Home Screen**. It opens full-screen with no browser bars.
6. Open the app from the icon, go to Settings, and sign in to OneDrive **inside the Home Screen app**.

Why this matters:
- **iOS can delete the saved data of websites that go unused for a while.** Apps installed on the Home Screen are exempt, so install it before logging real workouts.
- **The Home Screen app has its own storage, separate from Safari.** Do all logging and the OneDrive sign-in inside the Home Screen app, not in a Safari tab.
- Settings → **Phone storage** says **Protected** once the phone has agreed to keep the data.

---

## 5. First use: building her workouts

The app starts with four **empty** workouts: Lower Body, Upper Body, Full Body and Physical Therapy. On first open a welcome card has a **Build my workouts** button (it is also under Settings → **Edit my workouts**).

1. Tap a workout, then **Add an exercise → Create a new exercise**.
2. Type the name and choose how it is counted:
   - **Weight and reps**: machines and weights.
   - **Reps only (bodyweight or band)**: no weight box. Put the band colour or level in the notes.
   - **Timed hold (seconds)**: planks, wall sits, balance holds.
3. Set the recommended number of sets (from and to).
4. For weight and reps, choose whether the app should **suggest a heavier weight** (see the next section), how many pounds to add (decimals like 2.5 are fine), and the rep goal.
5. Add **notes** (for example physical therapy cues). They show on the exercise during a workout.
6. **Add to workout.** Use **Move up / Move down** to put the exercises in order.

Good to know:
- **Changes apply to future workouts only.** Past workouts keep the names and numbers they were saved with.
- **Remove** takes an exercise out of one workout. **Archive** (inside an exercise's Edit screen) hides it everywhere but keeps its history and charts; bring it back under **Archived exercises**. Nothing here ever deletes history.
- An exercise's counting type cannot change once it has saved workouts (so old data is never misread). Create a new exercise instead.
- You can rename any of the four workouts at the top of its screen. Past workouts keep the name they had when they were saved.
- **During a workout**, "Add another exercise" lets you add something for today only, or tick **Keep in this workout going forward** to add it to the list. If you skip or add exercises, a **Keep this list?** card offers to save today's list as the new default.

---

## How the weekly streak works
- A week runs **Monday to Sunday**. Every saved workout counts (Lower, Upper, Full Body and Physical Therapy; two on the same day count as two).
- The first week with **5 or more** workouts starts a streak of 1. Each following week in a row that also reaches 5 adds one.
- The **week in progress never breaks** a streak. Until it ends, the app shows the streak as it stood after last week and says how many more workouts keep it going; the moment she reaches 5 this week, this week counts.
- A **whole week under 5** ends the streak. The Summary also shows her best streak.
- It is worked out from saved workouts each time, so fixing a date or deleting a workout in History changes it. The number 5 is `STREAK_GOAL` in `src/lib/stats.ts`, and the rules are tested in `src/lib/stats.test.ts`.

## How the weight suggestion works
This applies to **weight and reps** exercises with the suggestion switched on. For an exercise in a saved workout, only the sets at the **heaviest weight** that day count (this ignores light warm-up sets).
- If the best set reached the **rep goal** (default **12**) **and** the average of those sets is at least **half a rep under the goal** (default **11.5**), the next suggestion is that weight plus the exercise's increment (default 5 lb).
- Otherwise the suggestion stays the same weight. It never goes down.
- With no history the weight is left blank.
- Each exercise has its own rep goal and increment, and the suggestion can be switched **off** (physical therapy exercises usually should): the app then keeps showing the same weight as last time.
- Reps-only and timed-hold exercises just show what you did last time.

Examples with the default goal: `12,12,11` goes up. `12,11` goes up. `12,10,10` stays. `14,9,9` stays.
Suggestions are worked out from saved history each time, never stored, so editing or deleting a past workout changes them automatically. The rule is tested in `src/lib/progression.test.ts`.

---

## Using both apps on one phone

This app and the original Lift Log are both hosted on `addkap.github.io`, and a browser shares storage between everything on one website. To keep them apart, **every name this app uses is different**, all listed in `src/appIdentity.ts`:

| | Lift Log | This app |
|---|---|---|
| Website path (and offline-app scope) | `/lift-log/` | `/Erika-Lift-Log/` |
| Saved workouts on the phone | `lift-log` | `erika-lift-log` |
| Other saved settings | unprefixed | all start with `erika-lift-log:` |
| Microsoft sign-in cache | `msal.*` | `erika-lift-log:msal.*` |
| OneDrive file | `lift-log-data.json` | `erika-lift-log-data.json` |

Even though the two apps use different Microsoft registrations, the sign-in library stores its tokens under fixed names, so it cannot rename its storage keys itself, so `src/installStorageNamespace.ts` runs first at start-up and gives this app a private copy of "localStorage". Signing in or out of one app does not touch the other. `src/appIdentity.test.ts` fails if any of these names ever matches Lift Log's.

One small thing is shared: Microsoft's library keeps a temporary encryption key in a browser-session cookie with a fixed name. Both apps reuse the same key, which is harmless.

---

## Checks to run before trusting it

**Works with no internet**
1. Open the deployed site once with internet.
2. Turn on Airplane Mode and reopen the app. It should load, show a yellow "Offline" notice, and let you log and finish a workout.
3. Turn Airplane Mode off. The bar under the header should change to "Synced" within a few seconds (once OneDrive is connected).

**Two-phone sync:** log a workout on one device; open the app on the other and tap the status bar. The workout should appear. Edit or delete one on either side and sync both. Change a workout list (Edit my workouts) on one phone and confirm it appears on the other.

**Both apps side by side:** with both installed on the same phone, sign in to OneDrive in one and confirm the other still says it needs signing in; log a workout in one and confirm it is not in the other's History.

## Troubleshooting
- **Microsoft says "redirect URI mismatch":** the address in the browser must be listed exactly under Authentication (step 3A), with `https`, the capital letters, and the final `/`.
- **Microsoft says the account "does not exist in tenant 'Microsoft Services'":** the app registration does not allow personal accounts. In the registration, **Authentication → Supported account types** must include personal Microsoft accounts. If you use the "any directory and personal" option, the manifest setting `api.requestedAccessTokenVersion` must be `2`. The app's `/consumers` sign-in address stays as it is.
- **"Tap to sync" every day:** normal for a phone that was not opened for more than about a day. Tap it and sign in.
- **Blank page on GitHub Pages:** check the Actions tab for a red run; the site address must end in `/Erika-Lift-Log/` (it follows the repository name, capital letters included).
- **The phone shows an old version:** close the app completely and open it again; the new version installs on the next open.
- **"That is not a data file from this app":** you picked a file from the original Lift Log. Each app only reads its own.

## Project map
- `src/appIdentity.ts` every storage and OneDrive name this app uses (and the test that they differ from Lift Log's)
- `src/lib/` rules and calculations: progression, draft editing, workout lists (`templates.ts`), statistics, dates (all unit tested)
- `src/store.ts`, `src/db.ts` local database (IndexedDB through Dexie)
- `src/sync/` OneDrive: sign-in (`auth.ts`), Graph calls (`graph.ts`), merge rules (`merge.ts`), sync engine (`engine.ts`)
- `src/pages/`, `src/components/` the screens (`EditWorkoutsPage.tsx` is "Edit my workouts")
- `src/config.ts` the Microsoft client ID
- `scripts/make-icons.mjs` redraws the app icons (`node scripts/make-icons.mjs`)
- `.github/workflows/deploy.yml` the free deploy
