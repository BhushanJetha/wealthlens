# Authentication Setup (Supabase)

How signup/login is wired and the dashboard settings that must be configured.
Keep this in sync when deploying.

## 1. Signup → profile trigger

A new `auth.users` row fires `public.handle_new_user()` (migration
`018_fix_signup_trigger.sql`), which creates the matching `public.profiles`
row. The function is `SECURITY DEFINER`, sets `search_path = public`, and has an
`EXCEPTION` handler so a profile-insert failure **never** aborts signup. The app
also upserts the profile on first dashboard load (`app/dashboard/layout.tsx`) as
a fallback.

> If signup ever fails with **"Database error saving new user"**, re-run
> migration 018 in the Supabase SQL editor. That error means the trigger threw.

## 2. Email rate limit ("email rate limit exceeded")

Supabase's **built-in email sender is rate-limited to ~2–4 emails/hour** and is
for testing only. Repeated test signups exhaust it.

### Development — disable email confirmation (current setup)
Dashboard → **Authentication → Providers → Email** → turn **"Confirm email" OFF**.
- No confirmation email is sent, so the limit is never hit.
- `signUp()` returns an active session; the signup page detects `data.session`
  and redirects straight to `/dashboard` (no "check your email" screen).

### Production — custom SMTP + confirmation ON
1. Dashboard → **Authentication → Emails → SMTP Settings** → enable **Custom SMTP**
   (Resend / Amazon SES / SendGrid / Mailgun).
2. Re-enable **Confirm email**.
3. Raise limits under **Authentication → Rate Limits** (only effective with custom SMTP).

## 3. Google OAuth

Client code is in `app/auth/{login,signup}/page.tsx` (`signInWithOAuth`) and the
callback in `app/api/auth/callback/route.ts` (`exchangeCodeForSession`). To make
Google work:

1. Dashboard → **Authentication → Providers → Google** → enable, paste **Client ID
   + Secret** from Google Cloud Console (OAuth credentials).
2. Dashboard → **Authentication → URL Configuration** → add app origins to
   **Redirect URLs** (e.g. `http://localhost:3000/**` and the production domain).
3. Google Cloud Console → OAuth client → **Authorized redirect URIs** must include
   `https://<project-ref>.supabase.co/auth/v1/callback`.

If Google bounces to `/auth/login?error=auth_error`, it's usually one of the
above, or the signup trigger (see §1). Check **Logs → Postgres** for a
`handle_new_user failed` warning.
