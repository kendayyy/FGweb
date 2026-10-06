# Codex design review — presence panel token mismatch

Actual mobile screenshot `screenshots/t16_fe_1791227495898_unl9gd/390x844-presence.png` shows the online panel. Its CSS is not connected to existing shared tokens: `--fg-surface-card`, `--fg-text-primary`, `--fg-border-subtle`, `--fg-surface-nested`, `--fg-surface-input`, `--fg-brand-accent`, etc. are undefined in the frozen shared token system. All color/font/border fallback values must be replaced with the existing approved semantic/component tokens in apps/web/src/styles/tokens.css (read-only reference). No shared theme edit or redesign.

Examples: panel background var(--bg-panel), text var(--text-main), muted var(--text-quiet), raised var(--bg-raised), border var(--border-color), focus var(--color-focus), action var(--color-action), online var(--color-online), error var(--color-danger), warning var(--color-warning), font var(--font-family), radius var(--radius-sm)/var(--radius-md), touch var(--min-hit-target). Use derived color-mix where needed rather than unrelated rgba literals. Verify computed palette/fonts/controls on actual built UI, with visible online users at all four viewports.

This is a mandatory T16-FE design compliance correction, within the owned presence.css file. No change to the approved design baseline needed.
