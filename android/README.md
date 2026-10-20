# ClearFeed Manager (Android)

A native Android app (phase 1 of the ClearFeed Android work) that talks to
the same Cloudflare Worker hub as the TV module and Chrome extension.

It lets you, from your phone:

- View the shared Activity log (`GET /log`)
- View and edit the shared block list — creators and videos (`GET/POST /block`, `GET /settings`)
- Toggle Earn it / Breaks / Block all searches (`GET/PUT /settings`)

It does **not** filter YouTube on the phone itself (that's a later phase) —
it's a remote control for the hub, so a block made here shows up on the TV
and in Chrome within a few seconds, same as the other direction.

## How the APK gets built

This project has no compiled output checked in. A GitHub Actions workflow
(`.github/workflows/android-build.yml`) builds the debug APK automatically
every time the `android/` folder changes on `main`/`master`, using GitHub's
own runners (which have normal internet access to the Android SDK and
Google's Maven repo). You do not need Android Studio or any Android tooling
on your own machine.

To get the APK:

1. Push/commit this `android/` folder (and the `.github/workflows/android-build.yml`
   file, which must sit at the very top of the repo, not inside `android/`)
   to the `Clearfeed` repo on GitHub.
2. Open the repo on GitHub → **Actions** tab. A run named
   "Build ClearFeed Manager APK" should start automatically (or trigger it
   manually with the "Run workflow" button).
3. Wait for the green check (a couple of minutes).
4. Click the finished run → scroll to **Artifacts** → download
   `clearfeed-manager-debug-apk` (a .zip containing `app-debug.apk`).
5. Unzip it, copy `app-debug.apk` onto your Android phone (e.g. email it to
   yourself, or use a cloud drive), and tap it to install. Android will ask
   you to allow installing from this source once — allow it for that app.

## First run

On first launch it asks for:

- **Hub URL** — `https://clearfeed-hub.awadh7us.workers.dev`
- **Admin key** — the `admin-...` key (not the device key), so the app can
  edit settings and the block list, not just read them.
- **Device name** — shown in the Activity log, e.g. "Phone".

That's stored locally on the phone only.
