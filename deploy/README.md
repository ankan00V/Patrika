# Deploying Patrika

The whole stack runs on **one Linux server** with Docker Compose:

```
Internet ──https──► Caddy :443 ──► /api/*, /admin/queues ──► api (Express)
                      │                                         │
                      └──────────► everything else ──► web (Next.js)
                                                                │
        worker (BullMQ) ◄──► redis (AOF) · postgres · elasticsearch
```

- **Caddy** gets and renews a Let's Encrypt certificate automatically, so the site, Google login and the Slack
  callback all run on https.
- **api** and **worker** use the same image (`backend/Dockerfile`); the worker is a separate container, so it
  keeps sending while the API restarts and vice versa.
- Data lives in named Docker volumes (`pgdata`, `redisdata`, `esdata`), so redeploys and reboots don't lose
  scheduled emails. Every container has `restart: unless-stopped`, so the stack comes back after a reboot.

**Why one VM and not Vercel/Render/Railway?** The worker has to run all the time, and Ethereal only accepts
SMTP, which most free platforms block (Render free and Railway Hobby block ports 465/587). Vercel can host the
dashboard but not the worker, Redis or Elasticsearch.

**Server size:** 2 vCPU / 4 GB RAM / 30 GB disk (Elasticsearch alone wants about 1 GB). On Google Cloud that's
an **e2-medium**, which the free-trial credit covers. On Azure (also available through *Azure for Students*,
no card needed) a **B2s** is equivalent.

---

## 1. Create the server (Google Cloud)

1. <https://console.cloud.google.com> → **Compute Engine → VM instances → Create instance**.
2. Name `patrika`, region close to you (e.g. `asia-south1` Mumbai), machine type **e2-medium**.
3. **Boot disk → Change**: Ubuntu 24.04 LTS, **30 GB**.
4. **Networking → Firewall**: tick **Allow HTTP traffic** and **Allow HTTPS traffic**.
5. **Create**. Copy the **External IP**.
6. Make that IP permanent: **VPC network → IP addresses**, find it and click **Promote to static IP address**.
   Otherwise it changes when the VM restarts.

## 2. Get a domain name (free)

1. <https://www.duckdns.org> → sign in with GitHub or Google.
2. Add a subdomain, e.g. `patrika-ankan`, and set **current ip** to the VM's external IP → **update ip**.
3. Your site will be `https://patrika-ankan.duckdns.org`. That hostname is the `DOMAIN` below.

## 3. Install Docker on the server

Click **SSH** next to the VM in the console to open a terminal in the browser, then run:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

## 4. Get the code onto the server

The repository is private, so git needs a token:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new
   token**. Repository access: only `Patrika`. Permissions: **Contents: Read-only**. Copy the token.
2. On the server:

```bash
git clone https://github.com/ankan00V/Patrika.git
```

When git asks, the username is your GitHub username and the **password is the token**.

## 5. Configure

```bash
cd Patrika/deploy
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
nano .env
```

Fill in `.env` (paste with right-click; save with **Ctrl+O, Enter**, exit with **Ctrl+X**):

| Key | Value |
| --- | --- |
| `DOMAIN` | `patrika-ankan.duckdns.org` (no `https://`) |
| `JWT_SECRET` | the first random string |
| `POSTGRES_PASSWORD` | the second random string |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from your Google OAuth client |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | from your Slack app |

Then add the server's URLs to the OAuth apps:

- **Google** client → Authorized JavaScript origins `https://DOMAIN`, redirect URI
  `https://DOMAIN/api/auth/google/callback`. Under **Audience**, click **Publish app** so anyone (including
  reviewers) can sign in; with only the basic profile scopes no verification is needed. While the app is in
  *Testing*, only listed test users can sign in.
- **Slack** app → **OAuth & Permissions → Redirect URLs** `https://DOMAIN/api/slack/callback`. To let people
  from other workspaces connect, enable **Manage Distribution → Activate Public Distribution**.

## 6. Start it

```bash
docker compose up -d --build
```

The first build takes about 5–10 minutes. Then:

```bash
docker compose ps
docker compose logs -f api worker
```

You should see `Sender mailboxes ready`, `Created Elasticsearch index`, `API listening` and
`Email worker started`. Press **Ctrl+C** to stop following the logs (the app keeps running).

Open `https://DOMAIN`. The first request can take a few seconds while Caddy fetches the certificate.

## Everyday commands

Run these in `Patrika/deploy`.

| Task | Command |
| --- | --- |
| Deploy the latest code | `git pull && docker compose up -d --build` |
| Restart only the worker (restart demo) | `docker compose restart worker` |
| Stop / start everything (data is kept) | `docker compose down` then `docker compose up -d` |
| Logs | `docker compose logs -f api worker` |
| Sender mailbox logins (to open Ethereal) | `docker compose exec postgres psql -U patrika -c "select email, smtp_pass from senders"` |
| Delete everything, including data | `docker compose down -v` |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Browser shows a certificate error or Caddy logs `challenge failed` | DuckDNS must point at the VM's current external IP, and the HTTP/HTTPS firewall boxes must be ticked. Then `docker compose restart caddy`. |
| Build stops with `Killed` | The VM ran out of memory. Use a 4 GB machine, or add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. |
| Google: `redirect_uri_mismatch` | The redirect URI must be exactly `https://DOMAIN/api/auth/google/callback`. |
| Google: `access_denied` / "app not available" | Publish the app (Audience → Publish app), or add the account as a test user. |
| Emails stay *Scheduled* / fail with a timeout | The provider is blocking outbound SMTP (587). Google Cloud and Azure allow it; most free PaaS tiers don't. |
| Using Neon instead of the bundled Postgres | Set `DATABASE_URL` in `.env` to Neon's **direct** (non `-pooler`) connection string. |

When you no longer need the server, delete the VM (and its static IP) so it stops using credit.
