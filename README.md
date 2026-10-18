# ClearFeed TV

ClearFeed for the YouTube app on Samsung (Tizen) TVs, 2017 and newer.

It runs *inside* the TV's own YouTube app through [TizenBrew](https://github.com/reisxd/TizenBrew) and:

- hides videos that match your four word filters (hateful, materialism, degrading, religious)
- hides everything from creators on your blocklist, and single videos you've blocked
- **refuses searches** that contain a blocked word, or switches searching off entirely
- stops a blocked video playing even if it's opened directly (autoplay, "up next", a link)
- blanks a blocked creator's channel page
- optionally hides all Shorts
- keeps a log of what it hid: press the **blue** button on the remote to see it

All the lists live in one `settings.json` file in your GitHub repository. Edit it there and every TV picks up the change within a few minutes. The same file will feed the ClearFeed hub for your computers later.

## How it works

The YouTube app on a Samsung TV is a web page (`youtube.com/tv`). TizenBrew launches that page with the TV's developer debugger attached and injects `dist/userScript.js` into it. The script watches the data YouTube sends to the page, removes blocked items before they're drawn, and intercepts search requests before they leave the TV.

## Set-up (about 20 minutes)

### 1. Put the module on GitHub

1. Create a **public** repository on GitHub called `clearfeed-tv` and upload the contents of this folder to it (the `dist` folder must be included).
2. Open `dist/userScript.js` and `src/00-config.js`, find the single line containing `CHANGE-ME`, and replace `CHANGE-ME` with your GitHub username. Commit.
3. Edit `settings.json` to taste (see *Settings* below). Commit.

The module is now served at `https://cdn.jsdelivr.net/gh/YOUR-USERNAME/clearfeed-tv/package.json`, which is what TizenBrew reads.

### 2. Put the TV into Developer Mode

1. On the TV open **Apps**, then type `12345` on the remote. A *Developer mode* box appears.
2. Switch Developer mode **On** and set **Host PC IP** to your computer's IP address. OK, then restart the TV (hold the power button).

### 3. Install TizenBrew

Download **TizenBrew Installer** for your computer from https://github.com/reisxd/TizenBrewInstaller/releases/latest, run it and click *Install TizenBrew*. It finds the TV on your network. On 2023+ TVs (Tizen 7 and newer) it will ask you to sign in with a Samsung account to create a certificate; follow the prompts.

Then go back into the Developer mode box on the TV and change **Host PC IP** to `127.0.0.1`. Restart the TV again. (This lets TizenBrew attach the debugger to itself; it's the step people most often miss.)

### 4. Add ClearFeed as a module

1. Open **TizenBrew** from the TV's apps and press the **green** button on the remote to open the module manager.
2. Choose **Add GitHub Module** and enter `YOUR-USERNAME/clearfeed-tv`.
3. ClearFeed now appears as a tile on the TizenBrew home screen. Select it and the YouTube app opens with ClearFeed running. A toast says *ClearFeed is on*.
4. In the module manager, switch on **Autolaunch** for ClearFeed so it starts whenever TizenBrew opens.

To check it's working, search for something on your `blockedSearches` list: you should get a *Search blocked* screen instead of results.

## Settings

`settings.json` keys:

| Key | What it does |
|---|---|
| `categories` | Turn each of the four word filters on or off |
| `extraWords` | Your own words per category, added to the built-in lists |
| `disabledWords` | Built-in words to switch off (e.g. `"haul"` if it over-blocks) |
| `alwaysAllow` | Phrases that never trigger a filter (e.g. `"book haul"`) |
| `blockedCreators` | Channel links, `@handles`, channel IDs (`UC…`) or exact channel names |
| `blockedVideos` | Video links or 11-character video IDs |
| `blockedSearches` | Words or phrases; any search containing one is refused |
| `blockAllSearches` | `true` switches searching off completely (YouTube Kids style) |
| `trustedCreators` | Never filtered, whatever the title says |
| `hideShorts` | Remove Shorts shelves and the Shorts tab |
| `showToasts` | Show the small "Hidden 3 videos" messages |
| `refreshMinutes` | How often the TV re-reads this file |

Changes reach the TV within `refreshMinutes` plus GitHub's ~5-minute cache, or immediately on the next launch.

## Important limits

- **Someone can still open the plain YouTube app.** ClearFeed only runs when YouTube is launched *through TizenBrew*. Use Samsung's app lock (Settings → General → System Manager → Smart Hub → Lock apps) to PIN-protect the normal YouTube app, so the only unlocked route is the ClearFeed tile. Keep YouTube blocked in NextDNS for any other devices.
- **Developer mode must stay on.** If the TV is factory-reset or developer mode is switched off, ClearFeed stops silently. The welcome toast on launch is your confirmation it's running.
- **Word filters are blunt.** They judge titles and channel names only. They will miss some videos and hide some harmless ones. Tune with `disabledWords` and `alwaysAllow`.
- **Thumbnails aren't checked.** The AI picture check from the browser extension isn't on the TV yet; that's planned to run through the hub so your API key never has to be typed on the TV.
- **YouTube changes its app.** An update to the TV YouTube app may break the filtering until this module is adjusted. TizenTube, which uses the same technique, has been maintained through these changes since 2023.
- **Legally** this is for your own TV. It doesn't remove ads or alter YouTube's business; it hides content from your own screen.

## Developing

- `node build.js` rebuilds `dist/userScript.js` from `src/`.
- `node test/run.js` runs the tests against mock YouTube TV data (no browser needed).
- `src/` is written in plain ES2015 so it runs on the TV's older browser engine (Chrome 47 and up).

## Files

- `package.json` tells TizenBrew what this is (`packageType: mods`, website `youtube.com/tv`)
- `settings.json` your shared settings
- `src/00-config.js` defaults and remote-settings sync
- `src/10-filters.js` word lists and matching
- `src/20-inspect.js` reading YouTube's data objects
- `src/30-ui.js` toasts, modals and the hidden-items log
- `src/40-hooks.js` the JSON, search-request and navigation hooks
- `src/90-main.js` start-up
