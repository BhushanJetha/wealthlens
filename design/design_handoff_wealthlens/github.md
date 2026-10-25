repo: BhushanJetha/wealthlens
branch: main

## Last sync
date: 2026-10-24T11:40:00Z

### Updated in this project
- Read nav structure, design tokens (globals.css, tailwind), sidebar, mobile tab bar, login, news API
- Built WealthLens UI.dc.html: auth, onboarding, app pages, Learn, News, mobile

## Screen map
| Project screen | Repo files |
|---|---|
| Sign in / Register / Onboarding | app/auth/login/page.tsx, app/auth/signup/page.tsx |
| App shell (sidebar, tabs, mobile bar) | lib/nav.ts, components/layout/Sidebar.tsx, components/layout/MobileTabBar.tsx |
| Home | components/dashboard/DashboardClient.tsx |
| Expenses / Budgets / Goals / Loans / Investments / Net worth / Cash-flow | components/dashboard/*Client.tsx, lib/nav.ts |
| Learn | components/dashboard/LearnClient.tsx, *LearnClient.tsx |
| Market news | app/api/market-news/route.ts |
| AI advisor | components/layout/ChatPanel.tsx, app/api/ai-advisor/route.ts |
| Bills, Tax planner | new (not in repo) |
