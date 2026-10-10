# Tempo — Video Speed

A dependency-free Chrome Extension (Manifest V3) for controlling standard HTML5 **video** playback from **0.5× to 5×**. It includes exact numeric entry, seven presets, shortcuts, global preferences, website overrides, and support for permitted embedded frames.

## Install in Chrome

1. Use Chrome **119 or newer**. Download/extract the release ZIP, or use this project directory directly. No build or dependency installation is required.
2. Open **`chrome://extensions`** in Chrome.
3. Turn on **Developer mode** in the upper-right corner.
4. Click **Load unpacked**, then select the directory containing **`manifest.json`**. Select the cloned or extracted project directory itself, rather than `src`.
5. Pin **Tempo — Video Speed** from Chrome’s extensions menu.
6. Open a video website and click Tempo. Choose a preset, move the slider, or enter a precise value such as **2.7**, **1.35**, or **3.5**. The change applies without reloading the video.

The popup and shortcuts can also activate videos in already-open accessible pages. After reloading the extension during development, refresh your video tabs if an old content-script context remains. For `file://` videos, enable **Allow access to file URLs** on the extension’s details page. Incognito operation is opt-in through Chrome and has not been separately verified.

## Controls and preferences

- **Slider:** 0.5×–5× in 0.1× steps. The numeric field supports up to six decimal places; custom values are independent of the slider’s tick rounding.
- **− / +:** decrease/increase by exactly 0.1×, clamped at the endpoints.
- **Presets:** 1×, 1.25×, 1.5×, 2×, 3×, 4×, and 5×.
- **Reset:** immediately requests 1×.
- **Global:** changing speed saves the global default and applies it to all accessible open websites, including inactive tabs.
- **Per website:** an existing saved hostname override takes priority over the global default. The **Default for other websites** field edits that fallback.
- **Remember this website:** saves the currently requested speed for the top-level hostname, including embedded players hosted elsewhere. Subsequent changes update that override across other open tabs on the same website. Disabling it removes the saved override and keeps the current speed temporarily in this tab.
- **Without Remember:** changes are temporary to this tab. They survive same-site navigation and worker suspension, but clear on cross-site navigation, tab close, or browser restart. The footer says **Tab only**. An untouched website simply follows the global default.
- **Shortcuts & settings:** shows the shortcuts actually assigned by Chrome, a badge setting, and a control to clear all saved website and temporary preferences. Clearing those preferences immediately restores the global fallback in per-website mode.

Website keys are exact hostnames: `canvas.school.edu` and `video.school.edu` are distinct, while HTTP/HTTPS and ports share a hostname preference. All local files share the `local-files` preference. The global/site choice is itself saved. Existing site overrides remain stored while Global mode is selected.

## Keyboard shortcuts

| Action | Windows / Linux / ChromeOS | macOS |
| --- | --- | --- |
| Increase by 0.1× | Alt + Shift + ↑ | Option + Shift + ↑ |
| Decrease by 0.1× | Alt + Shift + ↓ | Option + Shift + ↓ |
| Reset to 1× | Alt + Shift + ← | Option + Shift + ← |

Open **`chrome://extensions/shortcuts`**, or click **Customize keyboard shortcuts** in Tempo, to configure them. Chrome or the operating system can reserve a combination; the popup displays **Unassigned** if Chrome did not bind it. Shortcuts target the active tab and use the selected preference mode. An optional badge appears for about one second over the largest visible playing video in each frame. Native video-element fullscreen can hide this overlay; speed control still works.

## Player behavior and limitations

Tempo changes `playbackRate` and `defaultPlaybackRate` on connected `<video>` elements. It never calls `play()`, `pause()`, seeks, changes volume, or changes audio-only elements. All detected videos receive the requested rate so paused secondary players are ready when activated. Playing videos are identified separately for status and the shortcut badge; background/previews keep their existing play/pause state.

New/replaced videos, source-change media events, SPA transitions, permitted cross-origin frames, related `about:blank`/`blob:` frames, and discoverable open shadow roots are supported. A root attached later to an existing host without observable page changes is discovered on a relevant pointer interaction, when the page becomes visible, or when the popup probes it. Closed shadow roots are inaccessible. Detached videos and shadow roots release their listeners and observers.

If a player repeatedly resets a speed, Tempo makes at most four event-driven corrections in a two-second window, then stops fighting that player. A new media source or an explicit speed request retries control. The popup reports rejected/resetting players. Try a lower speed if a service enforces a cap. Other extensions or native player speed controls can conflict; while Tempo is active, it treats its selected preference as authoritative.

**Compatibility depends on the actual player and Chrome permissions.** YouTube’s standard video elements, Netflix’s standard media pipeline, and Canvas’s native or third-party HTML5 recordings are intended targets. An anonymous public YouTube watch-page check verified active playback at 2.7× and Reset to 1×. Authenticated production-player combinations, Shorts, and playlist/episode transitions have not been verified in this workspace. Proprietary players, inaccessible frames, closed shadow DOM, Chrome-protected pages, the Chrome Web Store, enterprise policies, or site restrictions may prevent control. Access to a parent website does not always grant access to a third-party embed if Chrome site access is restricted. Tempo does not bypass DRM, website protections, or browser restrictions. At very high rates, browsers may mute audio or drop frames; the extension preserves the browser’s pitch-correction setting.

## Privacy and permissions

Tempo makes **no network requests** and contains no analytics, remote code, fonts, libraries, backend, or tracking. Its local storage contains only the global preference, mode, indicator choice, and user-saved hostname → speed mappings. Browser-session storage holds only temporary tab ID → hostname/speed mappings and a revision counter. No titles, full URLs, watch history, video URLs, playback positions, or viewing statistics are saved or sent over the network. Player counts/rates exist only in transient messages for popup status.

| Permission | Reason |
| --- | --- |
| `storage` | Save local preferences; recover temporary settings after MV3 worker suspension. |
| `scripting` | Activate already-open accessible pages and read per-frame controller status on demand. |
| HTTP/HTTPS host access | Automatically detect videos and control third-party embedded frames across websites. |
| File host access | Optional local-file video support, gated by Chrome’s file-access toggle. |

Broad host access is inherent to automatic operation across websites and cross-origin embeds. Chrome may describe this as permission to read and change data on websites. You can restrict **Site access** in Chrome; automatic coverage is then limited to the hosts you permit. Tempo requests no history, cookies, `tabs`, network interception, or debugger permission. The tab API is used to resolve only the current hostname and route controls. Chrome documents [frame injection](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [local/session storage](https://developer.chrome.com/docs/extensions/reference/api/storage), and [configurable commands](https://developer.chrome.com/docs/extensions/reference/api/commands).

## Project structure

```text
manifest.json                 MV3 permissions, content frames, popup and commands
src/background.js             serialized preferences, tab routing and status probes
src/content.js                event-driven video controller and optional badge
src/settings.js               shared validation and preference resolution
src/popup.html / css / js      accessible light/dark popup
icons/                        16/32/48/128 px PNG icons and SVG source
tests/                        unit tests, browser tests and local fixture
tools/                        static checks, icon generator and ZIP packager
docs/                         architecture, manual checklist and validation report
dist/                         packaged runtime ZIP (generated)
```

## Development and verification

Runtime installation needs only Chrome. Development checks need Node.js 20+; packaging/icon regeneration uses Python 3’s standard library.

```sh
npm test
npm run check
python3 tools/generate_icons.py  # only needed when regenerating icons
npm run package
```

The optional integration suite uses Playwright and an isolated Chromium profile. Install development tooling separately, or use an existing Playwright installation:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser.mjs
```

You can set `PLAYWRIGHT_MODULE` to an absolute Playwright module path and `CHROMIUM_EXECUTABLE` to a compatible Chrome for Testing executable. The test suite serves fixtures only on loopback, uses generated local media, deletes its disposable browser profile, and retains screenshots under `tests/artifacts/`. Standard installed Chrome releases may reject command-line extension loading; Chrome for Testing is appropriate for this suite. The runtime has no dependencies.

For an interactive test fixture:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory tests
```

Visit `http://127.0.0.1:8765/fixture.html`, then click **Add cross-origin frame** to embed the `localhost` origin. See [the manual checklist](docs/TESTING.md), [architecture notes](docs/ARCHITECTURE.md), and [validation report](docs/VALIDATION.md).

The ZIP is a complete unpacked runtime package. Chrome Web Store submission still requires your store listing, screenshots, privacy disclosure, and final real-service QA; this project does not publish itself.
