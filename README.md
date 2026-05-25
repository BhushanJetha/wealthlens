# 🔷 WealthLens — Personal Finance OS

A production-grade personal finance dashboard for managing UAE + India finances.  
Built with **Next.js 14 · Supabase · Tailwind · Claude AI · Gemini AI**.

---

## ✅ Feature Checklist
- 🔐 Email + Google OAuth login with AES-256 encrypted sensitive data
- 📊 7 dashboards: Overview, Expenses, Investments, Loans, Credit Cards, Insurance, Budgets & Goals
- 🌐 3-way global view toggle: UAE (AED) / India (INR) / Consolidated (INR normalized)
- 📄 Gemini AI parses bank/credit card PDF statements automatically
- 🛡️ Gemini AI reads insurance documents and extracts all policy details
- 🤖 Claude AI advisor with full read-only portfolio context
- 💰 Predictive cash flow engine (7-day & 30-day liquidity forecast)
- 📈 Real-time charts: Net worth, spending, allocation, amortization
- 🔒 Row-Level Security (RLS) — each user sees only their data
- ☁️ Deploys to Vercel in one command

---

## 🚀 Quick Setup (30 minutes)

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd wealthlens
npm install
```

### 2. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) → New project
2. **Dashboard → SQL Editor → New Query**
3. Paste & run the entire contents of `supabase/migrations/001_schema.sql`
4. Go to **Authentication → Providers → Google** → enable and add credentials

### 3. Get API Keys

| Key | Where to get |
|-----|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) |
| `ENCRYPTION_SECRET` | Run: `openssl rand -hex 32` |

### 4. Configure Environment
```bash
cp .env.example .env.local
# Fill in all values from step 3
```

### 5. Run Locally
```bash
npm run dev
# Open http://localhost:3000
```

### 6. Deploy to Vercel
```bash
npm install -g vercel
vercel
# Follow prompts — add all env vars when asked
```

---

## 🗂️ Project Structure
```
wealthlens/
├── app/
│   ├── auth/                    # Login, Signup, Forgot Password
│   │   ├── layout.tsx           # Auth card layout
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── dashboard/               # All 7 dashboard sections
│   │   ├── layout.tsx           # Sidebar + Topbar + ChatPanel
│   │   ├── page.tsx             # Executive Dashboard
│   │   ├── expenses/page.tsx
│   │   ├── investments/page.tsx
│   │   ├── loans/page.tsx
│   │   ├── cards/page.tsx
│   │   ├── insurance/page.tsx
│   │   ├── budgets/page.tsx
│   │   └── ingest/page.tsx      # Upload statements
│   └── api/
│       ├── auth/callback/       # OAuth redirect handler
│       ├── ai-advisor/          # Claude chat endpoint
│       ├── parse-statement/     # Gemini PDF parser
│       └── parse-insurance/     # Gemini insurance parser
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   ├── Topbar.tsx           # View selector + FX rate
│   │   └── ChatPanel.tsx        # AI advisor chat
│   ├── dashboard/               # Page-level client components
│   └── forms/                   # Add modals
├── lib/
│   ├── supabase/client.ts       # Browser Supabase client
│   ├── supabase/server.ts       # Server Supabase client
│   └── crypto/encrypt.ts        # AES-256 encryption
├── store/viewStore.ts            # Global view state (Zustand)
├── middleware.ts                 # Auth route protection
└── supabase/migrations/001_schema.sql  # Full DB schema
```

---

## 🔐 Security Architecture

| Layer | Implementation |
|-------|---------------|
| Authentication | Supabase Auth (email + Google OAuth) |
| Authorization | Row-Level Security on all 14 tables |
| Data encryption | AES-256-GCM for sensitive fields (account numbers) |
| File storage | Private Supabase buckets — per-user folder isolation |
| API routes | Server-side auth check on every endpoint |
| Transport | HTTPS enforced by Vercel |

---

## 🤖 AI Features

### Gemini (Google) — PDF Parsing
- Bank statement PDFs → extracts all transactions with categories
- Insurance document PDFs → extracts policy number, sum assured, expiry, premiums
- Supports: HDFC, SBI, ICICI, Axis, Emirates NBD, ADCB, FAB, Mashreq, and any standard bank PDF

### Claude (Anthropic) — Financial Advisor
- Full read-only access to your live portfolio data
- Answers natural language questions about budgets, investments, credit utilization
- UAE + India financial expertise (SEBI, DFSA, 80C, DEWS, etc.)

---

## 📊 Supported Banks (Statement Parsing)
India: HDFC, SBI, ICICI, Axis, Kotak, Standard Chartered  
UAE: Emirates NBD, ADCB, FAB, Mashreq, ENBD  
*Any standard PDF bank statement will work — Gemini extracts intelligently*

---

## 🛠️ Tech Stack
- **Frontend**: Next.js 14 App Router, React 18, Tailwind CSS, Recharts
- **Backend**: Next.js API Routes (serverless)
- **Database**: Supabase (PostgreSQL) with Row-Level Security
- **Auth**: Supabase Auth + Google OAuth
- **AI**: Anthropic Claude Sonnet + Google Gemini 1.5 Pro
- **Storage**: Supabase Storage (private buckets)
- **Deploy**: Vercel

---

## ❓ FAQ

**Q: Is my financial data safe?**  
A: Yes. Each user's data is isolated by Supabase RLS — no user can access another's data. Files are stored in private buckets accessible only to the owning user. Sensitive fields are AES-256 encrypted.

**Q: Can I use this without the AI features?**  
A: Yes — all dashboards work without AI keys. AI features (PDF parsing, chat advisor) require `GEMINI_API_KEY` and `ANTHROPIC_API_KEY`.

**Q: How accurate is the PDF parsing?**  
A: Gemini 1.5 Pro is excellent at structured extraction. Accuracy is 90-95% for standard bank PDFs. You can always review and edit parsed transactions before confirming.

**Q: Can I add manual transactions?**  
A: Yes — use the Expenses page's quick-add or the AI Ingest page for manual entry.
