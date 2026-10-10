# Manual compatibility checklist

Use Chrome 119+, load the unpacked extension, allow site access on the parent site **and embed hosts**, and open Chrome’s extension error panel. Treat a reported player restriction as an expected limitation rather than overriding protections.

## YouTube

- [ ] Play a regular video; enter **2.7×** and confirm the video speeds up immediately. Confirm `document.querySelector('video').playbackRate` in DevTools if needed.
- [ ] Click another video, then Next in a playlist; keep **2.7×** across SPA navigation and replacement/source changes.
- [ ] Open Shorts, scroll between at least three, and verify only the currently playing Short continues playing; paused elements stay paused.
- [ ] Test a third-party page embedding YouTube. Verify the parent website’s preference applies inside the permitted frame.
- [ ] Reset to **1×**; test the three shortcuts with focus on the video and on another part of the page.

## Netflix (signed-in account required)

- [ ] Play an episode/movie and request **4×**. Verify the actual media rate if accessible.
- [ ] If Netflix rejects or resets 4×, check that Tempo shows a restriction message and stops repeated corrections. Try **2×**.
- [ ] Switch episodes/titles and verify the selected preference reapplies when supported.
- [ ] Test fullscreen. The optional badge can be hidden in native video fullscreen; rate control should remain functional when permitted.
- [ ] Reset to **1×** and confirm normal playback. Check audio/video behavior at high speeds separately.

## Canvas LMS (institution account required)

- [ ] Play a native lecture video and select **3.5×**.
- [ ] Open a lesson with a third-party embed, such as a permitted Panopto/Kaltura/Studio/YouTube player; request **3.5×** and confirm inside the frame.
- [ ] Change lessons and courses without a full reload; confirm persistence.
- [ ] Choose Per website, enable Remember, close/reopen Chrome, and confirm the institution hostname keeps its override.
- [ ] Restrict an embed host in Chrome Site access and confirm Tempo describes missing/inaccessible control gracefully.

## Generic and embedded players

- [ ] Run the local fixture described in README. Set **1.35×**, then add/replace videos and change their sources.
- [ ] Add a cross-origin frame, dynamically replace it, and nest another frame; all permitted players should use the top website’s setting.
- [ ] Create a related `about:blank`/`srcdoc` frame with a video; confirm rate control where Chrome permits injection.
- [ ] Add an open shadow-root player. Detach its host, then add a new host; no obsolete listeners should keep reporting removed videos.
- [ ] Keep one video playing and another paused. Set **2.75×**; both rates change, and their play/pause, time and volume states stay intact.
- [ ] Toggle the fixture’s rate-resetting player. Confirm a warning, bounded retries, and recovery after disabling the reset and requesting the speed again.

## Settings, resilience and accessibility

- [ ] Global mode: change the rate and check an inactive tab, then newly opened sites.
- [ ] Per website: save an override, edit the default, and check another hostname. Embedded frames must follow the parent hostname.
- [ ] Disable Remember, change speed, navigate within the same site, then navigate to another hostname. Temporary scope must behave as documented.
- [ ] Test **0.5×**, **5×**, all presets, precise values, rapid slider/step actions, invalid inputs, Reset and clearing site preferences.
- [ ] Immediately close the popup after an input change; reopen and verify the last valid preference was committed.
- [ ] Stop the worker in Chrome’s extension inspector, then use a shortcut or reopen the popup; preferences remain correct.
- [ ] Use back/forward navigation and return to an inactive tab; inspect rates after visibility restoration.
- [ ] Edit shortcuts at `chrome://extensions/shortcuts`; assigned keys appear in the popup, and unbound commands say Unassigned.
- [ ] Use the popup by keyboard; check focus outlines, field labels and live status. Check light/dark themes and reduced-motion settings.
- [ ] Inspect extension traffic/storage: no remote requests, full URLs, media identifiers, viewing history or playback positions.
- [ ] Idle a page with no videos and a paused video. Confirm no repeating rate writes or polling timer.

Record the Chrome version, service/player version when available, test date, and any rate caps before publishing a compatibility claim.
