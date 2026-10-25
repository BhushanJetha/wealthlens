# Handoff: WealthLens — full app UI/UX (v2)

## Overview
Complete redesign of WealthLens (repo: BhushanJetha/wealthlens): a personal-finance app for UAE + India users covering expenses, income, budgets, goals, investments, loans, cards, insurance, tax, FX/NRI tools, family members, Learn (courses, videos, articles, calculators), market news and AI assistance. Desktop (1240×860 app frame) and mobile (390×820) layouts for every screen.

## About the Design Files
The files in this bundle are **design references built in HTML** — prototypes showing intended look and behaviour, **not production code to copy**. Recreate them inside the existing WealthLens codebase (inspect the repo first: framework, routing, Tailwind config, `lib/nav.ts`, layout components) using its established patterns and libraries. If a piece has no equivalent yet, pick the idiomatic approach for that stack.

Open `WealthLens UI v2 (standalone).html` in a browser to explore. The source is `WealthLens UI v2.dc.html` (needs `support.js` beside it). Use the top bar to switch Desktop/Mobile, Normal/Empty/Loading/Error, UAE/India/Consolidated and Week/Month/Year; the left rail lists every screen. All numbers are **sample data**.

## Fidelity
**High-fidelity.** Final colours, type, spacing, radii, shadows and interactions. Recreate pixel-accurately with the codebase's components. Illustrations/photos/videos are placeholders (striped boxes) — supply real assets.

## Screen inventory (rail order)
**Start:** Sign in, Register (live password strength), Forgot password (+sent state), Reset password, Onboarding (4 steps: region → data source → goals → summary).
**Money:** Home, Expenses, **Spending analysis** (new), Income, Transfers, Reports, FX optimizer, Import (statements/Excel/bill photo/voice/message), Bills & subscriptions.
**Wealth:** Net worth, Debt vs equity, Investments (overview + 9 sub-pages: Mutual funds, Stocks, ETF, FD, Gold, NPS, PPF/EPF, LIC), Loans (overview + Home, Car, Personal, Gold, Card), Credit cards, Bank accounts, Insurance.
**Plan:** Budgets, Goals (My goals / Suggested), Cash-flow forecast, Tax planner.
**Insights:** Financial health, NRI toolkit, Money mindset, Market news.
**Learn:** Courses (9 modules × 3 lessons), Lesson, Videos, Articles, Article reader, Calculators (SIP, Lump sum, Loan EMI, Goal planner, FD).
**Details & overlays:** Loan detail, Goal detail, Notifications, Search (Ctrl+K), Add/Edit modal (per page), Voice-entry modal, Settings & family.
**Mobile-only:** More hub, AI advisor.

## Layout & navigation
- **Desktop shell:** left sidebar 220px (navy `#141A3D`), top bar 60px (white), optional section-tab row, content area on `#F5F4FC` with 24–28px padding, optional right AI panel 330px. Sections: Home · Money · Wealth · Plan · Insights · Learn · Settings. Each section has a tab row (see `TABS` in the file).
- **Mobile shell:** status bar, scrollable content on `#F3F1FB` (16px side padding), bottom tab bar 66px: Home · Money · Wealth · Plan · More. Learn, Insights, AI advisor, Notifications and Search live under More / header icons.
- **Holder switcher (family):** pills Family · Aarav · Priya · Meera · Aanya in the top bar (desktop) or a strip at the top of every mobile screen. Every page rescales to the selected holder; "Family" shows a share bar by member. Add forms include "Held in the name of".
- **Global filters:** Region (UAE·AED / India·INR / Consolidated) and Period (Week/Month/Year) drive every figure.

## Key screen specs
**Home:** greeting + actions (Add transaction, Upload statement, Speak it) · 4 tinted KPI tiles (balance, income, expenses, savings) · weekly AI review banner (gradient) · net-worth hero card (gradient, white line chart, assets/liabilities/savings rate) · Needs attention list (4 rows with action links) · financial health ring (72/100 + 4 sub-scores) · goals mini bars · 30-day cash-flow line · news for holdings · Learn picks.
**Generic data page (Expenses, Income, Budgets, Net worth, Loans, Cards, etc.):** header + CTA · insight banner with "Explain this page" · AI action pills · 4 tinted KPIs · main chart (bars or line+benchmark) · breakdown card (donut + coloured progress rows) · table · Learn strip.
**Spending analysis:** compare-with toggle (vs last month / vs same month last year) · 4 KPIs · budget vs actual per category (red when over) + budget-used ring with days left, safe-to-spend, projected finish · grouped bars this vs comparison · "What changed" movers list · cumulative spend line (this, last month, budget pace, projection) · big purchases list with % of spend · insights list + "Analyse my spending" AI button.
**Goals:** violet gradient hero (saved vs target + overall ring) · tabs My goals / Suggested · goal cards (icon, saved/target, progress, % · monthly, date, On track/Behind chip) · Money tip card · contributions bars · suggested-goal cards (AI tag, cost, Add). Goal detail: milestones + contribution history.
**Investments:** sub-page chips · value card with 1M/3M/6M/1Y/ALL range and benchmark line · allocation donut with targets · 4 KPIs · portfolio rows (icon, weight bar, value, return; tap → sub-page) · AI check-up card · upcoming SIPs · "Explore investment options" banner.
**Learn:** hub with progress banner, 3 learning paths, calculator shortcuts, 9 module cards; lesson = 3 steps (takeaways → interactive calculator → quiz) with related video/article/calculator links; Videos = player + chapters + grid; Article = TOC, body, "idea to keep", AI read buttons; Calculators = sliders → live results + chart + "Explain my result" + "what if…" prompt.
**News:** index ticker (5), topic chips (All, My holdings, Mutual funds, Stocks, Economy, UAE), featured + list, each tagged "Affects · <holding>", AI daily brief, holdings movers.

## Interactions & behaviour
- Navigation by screen id; section/tab highlight follows the current screen.
- Charts animate on every data change: bars scaleY from bottom (0.7s cubic-bezier(.2,.8,.2,1), 50ms stagger), lines draw via stroke-dashoffset (1.1s ease), progress bars grow width (0.8s ease), cards fade-up 6px (0.45s).
- Modals: centred 460px on desktop, bottom sheet on mobile; toast pill bottom-centre for 2.2s after save.
- Page states: Empty (dashed card + CTA + "Import a statement"), Loading (pulsing skeleton blocks, 1.3s), Error (red card + Retry).
- Quiz: pick an option → correct turns green, wrong red.
- Loan simulator / calculators: sliders update results live.
- Password strength: 4 bars from length ≥8, ≥12, mixed case, digit+symbol.

## AI features (need a real backend)
The prototype calls `window.claude.complete(prompt)` with a hard-coded context. In production replace with a server route (e.g. `/api/ai/*`) that builds context from the signed-in user's real records and calls the Anthropic API. Features: Ask AI chat (+ suggested questions), Explain this page, per-page AI action pills, weekly review, Explain it simpler (lessons), video summary/quiz, article summarise/explain/"what it means for me", calculator explain + what-if, portfolio check-up, funding plan, spending analysis. Replies are capped around 90 words, plain language, end with one next step. Add a "not financial advice" line.

## State (prototype → suggested)
screen, device, view (region), period, holder, mode (normal/empty/loading/error), step/region/dataSel/goalsSel (onboarding), mod/lessonIdx/quiz, calc values per calculator, vid, art, newsF, gtab, invRange, anCmp, sub (sub-tab), modal, notif, search, advisor, chat[], explainText/Title/Busy. Per-page data: categories, budgets, transactions, holdings, loans, goals, insurance, tax, news, learn content — all currently inline sample data; replace with API data. Holder scaling is fake (50/28/14/8%) — replace with real per-holder records.

## Design tokens
**Colour** — primary violet `#6A55E8` (dark `#5640D6`, tint `#F0EDFF`, border `#DAD3FF`, light `#B9ABFF`); ink `#0F172A`; slate text `#334155`/`#64748B`/`#94A3B8`; borders `#ECEEF6`/`#E2E8F0`; track `#F1F0F8`; app bg `#F5F4FC`, mobile bg `#F3F1FB`; page wash gradient `#E4EDFB → #EFEAFB → #E3F4EC`; sidebar navy `#141A3D` (text `#B9C0E6`, muted `#9AA3D0`); positive `#2FB67C` (text `#1E8F5F`, tint `#E7F7EF`); negative `#E4573D`/`#D9482F` (tint `#FDECE8`); amber `#F29A2E` (tint `#FFF2E2`, text `#B96A0B`); sky `#3B8EF0` (tint `#E7F1FE`); pink `#EC5B8C` (tint `#FDECF2`); teal `#0891B2`; purple `#A855D8`. KPI tints: lavender `#F1EEFF`, mint `#E7F7EF`, peach `#FFF2E2`, sky `#E7F1FE`.
**Gradients** — hero `linear-gradient(135deg,#2A2370 0%,#5B47E0 62%,#8A6CF0 100%)`; active nav `linear-gradient(135deg,#7B63F5,#5B47E0)`; promo `#7B63F5 → #B06AF0`; auth panel `#171447 → #3A2F9E → #5B47E0`.
**Type** — Inter 400/500/600/700, tabular numbers for money. Page title 24/700 (mobile 22); KPI value 24/700 (mobile 18); hero value 34/700; card title 14–15/600; body 13–13.5; label 11–12 (uppercase labels 11/600, +.05em).
**Radius** — cards 20 (mobile 18), tiles 20/16, buttons/inputs 9–12, chips 99, app frame 26, phone 46.
**Shadow** — cards `0 1px 2px rgba(30,30,80,.04), 0 10px 26px rgba(60,60,140,.07)`; hero `0 14px 34px rgba(76,60,190,.28)`; modal `0 24px 60px rgba(15,23,42,.3)`.
**Spacing** — content padding 24–28; grid gaps 14–16; card padding 18–24.
**Charts** — palette for categories: `#6A55E8, #2FB67C, #F29A2E, #3B8EF0, #EC5B8C, #94A3B8`; donut stroke 5–5.5 on r=15.9155; benchmark dashed `#94A3B8`; budget pace dotted `#2FB67C`.

## Assets
No external images. Icons are simple glyph characters and inline SVG paths in the prototype — replace with the codebase's icon set. Photos, illustrations, video thumbnails and article images are striped placeholders.

## Files
- `WealthLens UI v2 (standalone).html` — open in any browser (AI buttons won't work offline).
- `WealthLens UI v2.dc.html` + `support.js` — editable source; the class at the bottom holds all sample data and logic.
- `WealthLens UI.dc.html` — the earlier indigo version (reference only).
- `github.md` — mapping of screens to repo files.

## Suggested build order for Claude Code
1. Read the repo, then tokens → Tailwind theme. 2. App shell (sidebar, tab rows, mobile bar, holder + region + period filters). 3. Shared components (KPI tile, card, donut, bars, line chart, progress row, modal, toast, states). 4. Data pages in the order Home → Expenses → Investments → Goals → Loans → Analysis. 5. Auth + onboarding. 6. Learn + News. 7. AI routes. 8. Remaining pages.
