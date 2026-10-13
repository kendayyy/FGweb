# FG light redesign — preview only, 07/10/2026

User: “bạn thư dùng skill tất cả skill UI hiện có thiết kế lại giao diện light cho tôi nhìn vẫn chói quá tạo bản mockup cho tôi duyệt trước”. Supersedes acceptance of warm light appearance for this iteration; no new runtime changes or overall task PASS. Three separate Lobby raster concepts before implementation. Original app, approved references and historical test outputs retained.

## Skill review and synthesis

Read/reviewed UI skill family: design; design-system; ui-styling; ui-ux-pro-max; redesign-existing-projects; design-taste-frontend and v1; high-end-visual-design; minimalist-ui; industrial-brutalist-ui; gpt-taste; stitch-design-taste; image-to-code; imagegen-frontend-web; imagegen-frontend-mobile; built-in imagegen. Brainstorming bounded visual exploration; user explicitly requested concepts before approval/implementation.

- Primary: UI/UX Pro Max accessibility and hierarchy, Design System semantic roles, Redesign Existing Projects surface audit, Minimalist UI restraint, image-to-code image-first analysis, Imagegen/Frontend Web readable separate horizontal comps.
- Supporting: high-end visual design optical spacing and restrained hierarchy; design-taste consistency and no nested-box clutter; Stitch semantic color-role vocabulary; UI Styling consistent controls/focus.
- Context exceptions: preserve FG Inter, blue brand, chat/recruitment structure and existing functionality. Skill defaults requiring white panels, font replacement, hero/AIDA/GSAP, perpetual motion, brutalist red/black, mechanical borders or cinematic glass contradict this user's calm chat brief. They are assessed, not combined indiscriminately. v1 used for comparison, v2 preferred. Mobile image skill is scoped to native apps, so web mobile remains responsive FG rather than a new native app. No Figma/Stitch service used; no framework/library installed.
- UI/UX local design-system query `gaming chat muted light` returned dark neon gaming/marketing guidance; rejected. One narrower retry `community messaging calm neutral` returned calmer Swiss/minimal direction but wellness fonts/near-white surfaces and marketing IA; not accepted as FG source of truth. Only general guidance on legibility/hierarchy retained. No verified exact low-glare chat palette match found; palettes below are authored proposals, not externally validated accessibility or medical claims.
- Inspo not queried: its own tool instructions exclude projects with established design tokens; FG project conventions take precedence.

## Diagnosis

Previous light panels #F3F0EA still cover large bright areas; strong dark perimeter borders and blue links on many items make the shell visually busy. Repeating framed regions amplifies the grid. A color replacement alone did not satisfy the user.

## Shared design direction

Daily chat product, variance3/density6/motion1. Matte medium-light surfaces, no pure-white canvas/panels, reduced blue coverage, subtle decorative separators and readable charcoal type. Reserve firm contrast for controls/focus. No heavy shadow, gradients, light bloom, filter over the screenshot, or globally faded text. Keep text legible. Each concept uses one neutral family and muted blue brand accents. Headings22–24px, body14–16px, name weight600, metadata12px, body leading1.5–1.6; Inter/Vietnamese glyphs. Radius8–12px. Use avatar/message spacing rather than enclosing every message in a card.

Desktop retains approved fixed72px game-logo rail (SIDEBAR-COMPACT-APPROVED, no toggle), header selected game, main Lobby chat, separate recruiting/presence pane. Seven game choices remain. Logo shapes are illustrative references, not production asset verification. Do not add hero, charts, stats, paid plans or new features. Mockup data is illustrative only.

## Three proposed palettes

1. Smoke gray: canvas#CFD3D6, chat#C8CDD1, panels#D8DCE0, input#BDC4CA, selected#B7C5D4, text#29323B, muted#48545F, accent#315C9B. Recommended most neutral.
2. Sage gray: canvas#CDD1C6, chat#C4CABD, panels#D7DBD0, input#B9C2B2, selected#BCCBD1, text#28332D, muted#48554C, accent#365B85. Soft green tint, restrained blue.
3. Warm stone: canvas#CEC7BD, chat#C5BDB2, panels#D2CABF, input#BDB3A6, selected#BCC4CE, text#34312D, muted#565047, accent#3C5F8C. Distinctly darker than previous ivory.

Images communicate proposed hierarchy/surfaces. Hexes are intended target tokens, not a claim every generated pixel matches. Runtime text4.5/control-focus3 contrast, actual mobile and behavior tests required after choice. Do not mark LIGHT01-FE PASS from mockup approval.

Reference roles: actual warm app screenshot is the rejected appearance reference; approved dark compact sidebar image is a structural reference only. Neither is an edit target; generate fresh concepts.
