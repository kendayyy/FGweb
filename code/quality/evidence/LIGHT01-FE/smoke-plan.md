# Smoke themes and Classic integration — 07/10/2026

Authorization: user requests “rồi giờ dùng toggles vùa cài vào bộ chọn sáng/tối build hai bản dark and light tôi chọn”. Both smoke reference images are approved. This supersedes the pending selector mockup request with an actual implementation request.

One owner checkpoint: LIGHT01-FE. Preserve three preferences, existing providers/session/socket/drafts. Classic's animated SVG is extracted as a reusable decorative icon; its original standalone button API remains. FG's existing accessible menu trigger uses that icon without nested buttons or binary preference behavior. System retains its stored label and uses the effective theme for the icon. No global Tailwind reset or shadcn palette; only utilities for the upstream animation.

Approved palette surfaces: light smoke #CFD3D6/#C8CDD1/#D8DCE0/#BDC4CA, dark charcoal #1F252C/#212830/#2B333D/#303A46/#252E38. Inter and blue actions retained. Links/focus/control outlines may be darkened in light mode to meet measured contrast; decorative dividers use a separate soft token. Reduced motion honors device preference.

Before code: record strict gate result, verify all predecessors remain PASS and frozen outputs outside owner paths retain hashes; review exact docs delta, preserve original evidence, record approved baseline migration and reference image hashes. No checker changes or historical output hashes rewritten. The stock gate's historical owned-output mismatch is reported independently from reviewed owner resume audit.

RED: real ThemeSwitcher DOM interaction distinguishes System from its effective icon, returns focus, and keeps exactly one interactive trigger. Real headed browser checks rendered Classic state under manual/device theme disagreement and reduced motion. Preserve all original tests and assertions. Then implementation, targeted tests, full web component suite sequentially, lint/typecheck/build, headed E2E at1440/1280/390/360 and measured contrast.

Out of scope: logo/sidebar integration remains GAME-LOGO-FE after this checkpoint. Backend/contracts/database and user credentials unchanged. Real app preview uses existing main services; isolated E2E uses real API/PG/Redis and cleans its own test schema. No fake production content. No task PASS from bitmap approval or partial tests; actual new app appearance review remains pending.
