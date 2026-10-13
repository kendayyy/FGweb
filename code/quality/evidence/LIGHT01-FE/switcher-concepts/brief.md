# FG theme selector concepts — preview before implementation

User07/10/2026: “tôi chốt bản dark và bản light mới nãy bạn có thiết kế gì cho bằng tất cả skill UI nút light and dark nhìn tốt hơn không tạo bản mockup cho tôi coi thử”. Both smoke-gray themes approved. Request now limited to improved selector concept, not runtime changes.

Reuse reviewed UI skill synthesis from ../mockups-v2/design-brief.md: UI/UX Pro Max clarity/accessibility; Design System semantic roles; Minimalist UI restraint; Redesign Existing Projects control audit; UI Styling consistent state/focus; imagegen/image-to-code image-first review. Other UI style skills assessed for hierarchy/spacing; no cinematic animation, font/stack swap, neon, glass, brutalist borders or unrelated landing sections. Project Inter, blue brand and app behavior take precedence. No service/API/dependency installation.

Shared constraints: Sáng/Tối/Hệ thống all retained, native menu/keyboard/focus semantics in implementation; hit areas at least44px, consistent icons18–20px, existing low-glare light/dark palettes, no binary switch dropping system. Labels show stored preference, not inferred device theme. State survives safe storage behavior; no auth/chat changes. Proposals do not prove runtime behavior or measured contrast.

1. Labeled compact pill with Sun/Moon/Monitor icon, active text and chevron; balanced subtly raised fill and fine border. Dropdown has icons/labels/checkmark and softly highlighted selected row. Desktop width120px; mobile icon44px opens same labeled menu. Recommended discoverability/space compromise.
2. Three-way segmented selector: Sun Sáng / Moon Tối / Monitor Hệ thống, all directly visible; selected segment subtly blue, others neutral. Approx300px desktop, icon-only grouped3×44px on mobile with accessible names/tooltip/current preference. Fast access, uses more header width.
3. Minimal icon button44–46px, shape rounded12px; icon/current preference tooltip, click opens same explicit three-option menu. Most compact; choices require opening menu. No unlabeled inaccessible two-mode toggle.

Each concept gets one horizontal focused image: light and dark variants side by side plus close-up state/menu and mobile header context. Generate fresh references, do not crop old full-app images. Keep user-approved app themes/layout unchanged elsewhere. Images are design proposals until user picks; no PASS/new task from visual approval.
