# Mom's Recipes - Setup Guide

## Overview

A personal recipe book app. You're the only editor (password-protected). Mom and anyone with the link can browse and read.

**Stack:** React + Vite, Supabase (free), Vercel (free)

---

## Step 1: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free, no credit card).
2. Click "New project". Pick any name and a database password (save it somewhere, though you won't need it day-to-day). Choose the region closest to you.
3. Wait about 30 seconds for the project to spin up.

### Create the recipes table

4. In your Supabase dashboard, click **SQL Editor** in the left sidebar.
5. Paste this and click **Run**:

```sql
create table recipes (
  id text primary key,
  name text not null default '',
  created_at text not null default '',
  mom_messages jsonb not null default '[]',
  call_notes jsonb not null default '[]',
  ingredients jsonb not null default '[]',
  method text not null default '',
  experiments jsonb not null default '[]'
);

-- Allow anyone to read recipes (mom can browse without logging in)
alter table recipes enable row level security;

create policy "Anyone can read recipes"
  on recipes for select
  using (true);

-- Allow anyone to insert/update/delete via the anon key
-- This is fine because edit mode is password-gated in the app
create policy "Anyone can insert recipes"
  on recipes for insert
  with check (true);

create policy "Anyone can update recipes"
  on recipes for update
  using (true);

create policy "Anyone can delete recipes"
  on recipes for delete
  using (true);
```

### Get your API keys

6. Go to **Settings > API** (in the left sidebar, near the bottom).
7. Copy two things:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon / public** key (the long string under "Project API keys")

---

## Step 2: Set up the code

1. Create a new GitHub repo (e.g. `moms-recipes`). Can be public or private.
2. Clone it locally and copy all the files from this project into it.
3. Create a `.env` file in the root (copy from `.env.example`):

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_EDIT_PASSWORD=your-secret-password
```

4. Test locally:
```bash
npm install
npm run dev
```

5. Open `http://localhost:5173` and make sure it loads. Try adding a recipe.
6. Commit and push everything to GitHub (except `.env` - it's gitignored).

---

## Step 3: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account (free).
2. Click **Add New > Project** and import your `moms-recipes` repo.
3. Under **Environment Variables**, add these three:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
   - `VITE_EDIT_PASSWORD` = whatever password you want for edit access
4. Click **Deploy**. Takes about 30 seconds.
5. Vercel gives you a URL like `moms-recipes.vercel.app`. That's your app!

Send that link to mom. She can browse on her phone. When you want to edit, click "+ New" or "Edit" and enter your password.

---

## Step 4: Keep Supabase awake (optional but recommended)

Free Supabase projects pause after 7 days of no activity. To prevent this:

### Option A: UptimeRobot (easiest)
1. Go to [uptimerobot.com](https://uptimerobot.com) and create a free account.
2. Add a new monitor:
   - Type: HTTP(s)
   - URL: `https://your-project-id.supabase.co/rest/v1/recipes?select=id&limit=1` 
   - Add a header: `apikey` = your Supabase anon key
   - Monitoring interval: every 5 minutes (or whatever)
3. Done. It pings your database regularly so it never pauses.

### Option B: GitHub Actions
Add this file to your repo at `.github/workflows/keepalive.yml`:

```yaml
name: Keep Supabase Alive
on:
  schedule:
    - cron: '0 0 */3 * *'  # Every 3 days
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase
        run: |
          curl -s "${{ secrets.SUPABASE_URL }}/rest/v1/recipes?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

Then in GitHub repo Settings > Secrets, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

## Day-to-day usage

- **Add a recipe:** Open the app, click "+ New", enter password, paste WhatsApp messages, add ingredients and method, save.
- **After a call with mom:** Open the recipe, click "Edit", add a call note with the date and what she said.
- **Log an experiment:** Open the recipe, click "Edit", add an experiment entry.
- **Mom browsing:** She just opens the link on her phone and scrolls through recipes. No login needed.

---

## Changing your edit password

Update `VITE_EDIT_PASSWORD` in Vercel (Settings > Environment Variables) and redeploy. Note: the password is bundled into the client-side code, so it's not truly secret from someone inspecting the page source. For a family recipe book this is fine. If you ever want real auth, we can add Supabase Auth later.
