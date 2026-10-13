# Native capture scope

The fixture may use Chromium's test-only `--auto-select-tab-capture-source-by-title` switch with a unique owned source tab. This flag limits automatic selection to tabs, unlike the broader desktop-source selector. Primary reference: [Chromium switch definition](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/common/chrome_switches.h).

Do not select an entire screen, a private browser tab or use fake display media. Instrument the original getDisplayMedia only to record invocation/activation/settings and stop status. Assert the actual returned track's displaySurface is browser. Fake microphone input may provide deterministic audio; it is separate from the actual display capture acceptance. Close the source tab to trigger native capture-ended behavior.
