# Validation report

Tested **10 October 2026 (Singapore)** with Node.js **22.23.0**, Playwright **1.62.1**, and Google Chrome for Testing **149.0.7827.55** on macOS ARM64. Browser tests used a disposable profile and generated local WebM media; no personal Chrome profile or account was used.

## Automated results

- **10 unit tests passed:** speed bounds/precision, hostname privacy, fallback precedence, corrupt storage, simultaneous writes, iframe message authorization, worker restart state recovery, navigation/close cleanup, command actions, and clearing preferences.
- **25 browser scenarios passed:** immediate 2.7× application; preserved active/paused states and volume; SPA replacement; source metadata changes; new videos; exact 1.35×; open/late-attached shadow roots; cross-origin and related srcdoc frames; inactive tabs; remembered 3.5× and temporary 2.75×; different-site fallback; full navigation; worker suspension; reset; endpoints; bounded correction/conflict warning; avoiding unrelated retries; recovering control; invalid input; privacy/storage shape; immediate popup closure; and browser restart persistence.
- **Static validation passed:** Manifest V3, narrow API permission set, referenced runtime files, JavaScript syntax, PNG icon sizes, and no inline popup scripts/handlers.
- **Visual QA:** light and dark popup, exact-speed display, selected presets, website/default controls, restriction status, and expanded shortcut settings. Chrome naturally scrolls expanded settings when the popup exceeds its available height.

## Live services

A separate anonymous smoke check on a public **YouTube watch page** verified active video playback with `playbackRate = 2.7` and `defaultPlaybackRate = 2.7`, advancing media time, and Reset back to 1×. Streaming transitions, playlists, Shorts and signed-in playback still require the manual checklist. The optional smoke command is `node tools/youtube-smoke.mjs`; unlike the local integration suite, it intentionally accesses the public YouTube website.

**Netflix and institution-specific Canvas players have not been tested with authenticated accounts.** Generic HTML5 videos and permitted cross-origin embeds cover their underlying standard-video integration, but cannot establish compatibility with every service/player version. See [TESTING.md](TESTING.md) before publishing service-specific claims.

## Reproduce

```sh
npm test
npm run check
node tests/browser.mjs
npm run package
```

Playwright and a compatible Chromium/Chrome for Testing installation are development-only prerequisites for the browser suite. The extension’s runtime and the standard-library packaging/icon tools have no dependencies. Local screenshots are generated at `tests/artifacts/`; test profiles are deleted on completion.
