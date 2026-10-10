# Architecture and edge cases

## Preference flow

The module service worker is the sole preference writer. Runtime messages, shortcuts, and tab lifecycle events enter a promise queue, avoiding read/modify/write races between popups and frames. Durable state lives in `chrome.storage.local`; ephemeral tab overrides and a monotonically increasing revision live in `chrome.storage.session`. Worker termination loses only its queue, not committed state. Content scripts cannot write settings, and iframe-supplied tab IDs cannot override Chrome’s trusted `sender.tab` identity.

The worker resolves settings against the **top-level hostname**, then sends one context to every frame in a tab. New frame scripts request the same context. A mutation saves once and broadcasts once; frames never rebroadcast settings. A lower revision is discarded, preventing stale initialization responses from overriding a newer user request. Unrelated settings changes do not reset a blocked player’s correction budget. An explicit speed request permits retries in the initiating tab, even when its numeric value is unchanged.

Global mode uses the saved global rate. Site mode resolves temporary same-tab overrides, saved exact-hostname overrides, then the global fallback. Temporary overrides clear on cross-site navigation or tab close. Saving a hostname override removes ephemeral overrides for that hostname and synchronizes other same-site tabs. Switching Global/Site preserves saved website overrides. Neither URLs nor media-source identifiers enter storage.

## Content lifecycle

Static scripts run at `document_start` in every permitted matching frame; related-origin fallback covers eligible blank/blob/data frames. Scripts are idempotent in each isolated world. On-demand injection activates pre-existing documents after installation. The content script performs an initial element traversal and watches only child-list mutations. It batches added subtrees and prunes detached videos/roots; it does not continually scan the document or poll playback rates. Open shadow roots have their own child-list observer. A pointer event’s composed path, visibility return, pageshow, and popup probes provide opportunities to discover late-attached open roots.

Each video holds a small record of media listeners, reset attempts, and at most one correction timer. Setting a rate already equal to the target is a no-op. `loadedmetadata` and `emptied` reapply after source changes; `play`/`playing` ensure late player activation is covered. `ratechange` corrects a site reset after 80 ms. Four corrections within two seconds trip the per-video guard. Exceptions or synchronous rejection trip it immediately. A blocked video continues playing under its player’s control; no DRM or player internals are modified.

## Status and popup

Player reports include only counts, the requested rate, and current playing rates. A debounced notification tells an open popup that its tab changed. One-off extension messages avoid stale subscriptions after worker suspension. The popup gathers reports from all accessible frames using isolated-world scripting on demand. If a child frame prevents a complete probe, a top-frame fallback can still report controllable videos and disclose partial access. Counts are not saved. Missing video elements are reported as “not found yet,” rather than claiming a player is permanently unsupported.

The popup optimistically updates controls and debounces continuous input by 75 ms. Each request is sent directly to the worker queue so closing a popup does not strand mutations behind UI-side promises. Speed comparisons and increments normalize floating-point artifacts to six decimal places. Native slider ticks do not change the precision stored for custom numeric input. Invalid values are rejected independently by both popup and worker.

## Known boundaries

- Hostname scope intentionally differs from domain/eTLD+1 scope; separate subdomains can have different saved preferences.
- All connected videos receive rates, including paused/hidden previews. They are never activated, paused, sought or unmuted. This avoids switching playback state merely to identify an “active” player.
- Closed shadow roots and roots attached with no observable trigger cannot be found immediately by isolated DOM observation.
- Documents in browser back/forward cache refresh preferences on `pageshow`. Sleeping/inactive tabs refresh when visible; newly created videos always resolve the current saved context.
- Chrome-protected pages, denied host access, sandboxed/opaque embed restrictions, proprietary APIs, player caps and native video fullscreen overlays remain browser/player limitations.
- A worker can terminate before an in-flight operation commits; the popup only labels a preference saved after the storage promises succeed. Browser shutdown during a write is not an atomic transaction across the two storage areas.
- Platform-specific streaming service internals are not patched. No remote code, MAIN-world injection, prototype patching or network interception is used.
