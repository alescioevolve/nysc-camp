# Turning on the Supabase pilot (Batch C Stream II)

Until these steps are done, the app runs exactly as before: corps members see the Stream II
programme from the GitHub copy and officials sign in with access codes.

## 1. Supabase project
1. supabase.com → New project. Name it `camp-companion` and pick an EU region (London or Frankfurt). Keep the database password.
2. **Authentication → Sign In / Providers → Email:** turn off "Allow new users to sign up". Keep Email enabled.
3. **Authentication → Email Templates → Magic Link:** set the body to
   `Your Camp Companion sign-in code is {{ .Token }}. It expires in 1 hour.`
4. **Authentication → SMTP Settings** (Gmail): host `smtp.gmail.com`, port `465`, username = the Gmail address,
   password = a Gmail app password (myaccount.google.com/apppasswords), sender name `Camp Companion`.
5. **Authentication → URL Configuration:** Site URL `https://camp-companion-nysc.vercel.app/private-admin/`.

## 2. Database (runs automatically from GitHub)
Repo **nysc-camp → Settings → Secrets and variables → Actions**, add:
- `SUPABASE_ACCESS_TOKEN`: from supabase.com/dashboard/account/tokens
- `SUPABASE_DB_PASSWORD`: the database password
- `SUPABASE_PROJECT_REF`: the ID in the project URL (`https://<ref>.supabase.co`)

Then **Actions → Database → Run workflow**. This creates the tables and role rules, and loads Stream II
(camp, units and the provisional programme). Later database changes apply on every push.

## 3. Vercel environment variables
Project → Settings → Environment Variables (Production), then redeploy:
- `SUPABASE_URL`: `https://<ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: Settings → API → service_role (secret, never share)
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: the push keys (the public one is in `config.js`)

## 4. Switch the site on
Put the Project URL and the **anon** key into `config.js` (`supabaseUrl`, `supabaseAnon`) and push.

## 5. First official
Supabase → Authentication → Users → Add user → Create new user (your email, auto-confirm). Then in the SQL editor:
```sql
insert into officials (camp_id, name, email, role, expires_at)
values ('rivers-2026-c2', 'Your Name', 'you@example.com', 'director', '2026-11-25 23:59+01');
```
Sign in at /private-admin/ with that email. From People, add Mr. Musa (Deputy) and everyone else by pasting a list.

## Tests
```
cd tests && npm i && node db.test.js && node officials.test.js && node live.test.js
python3 -m http.server 8791   # from the repo root, in another terminal
node e2e-admin.js              # needs Playwright
```
