## Links - URL Shortener with Node.js + SQLite

A URL shortening application with session-based authentication, SQLite storage, and code-based redirection.

### 1) Clone and install

```bash
git clone https://github.com/jabernalv/links-shortener.git
cd links-shortener

# Create .env with a strong secret
printf "SESSION_SECRET=%s\n" "$(openssl rand -base64 32)" > .env

# Optional (recommended)
echo "IP_HASH_SALT=$(openssl rand -base64 32)" >> .env

# Install dependencies and build CSS (for local dev)
pnpm install || npm install
pnpm build:css || npm run build:css

# Run locally (http://localhost:8085)
pnpm dev || npm run dev
```

### 2) Environment Variables and .env File

- The app uses `SESSION_SECRET` to sign session cookies (essential in production).
- `.gitignore` already excludes `.env` from the repository.

Create `.env` with a strong secret:

```bash
printf "SESSION_SECRET=%s\n" "$(openssl rand -base64 32)" > .env
```

You can reuse the same `.env` between restarts to avoid invalidating sessions. If you change `SESSION_SECRET`, current sessions will be invalidated and users will need to log in again.

Supported variables:

- `SESSION_SECRET` (required in production)
- `PORT` (optional, default 8085)
- `SQLITE_PATH` (optional, default `./data/data.sqlite`)
- `IP_HASH_SALT` (optional, salt for hashing IP addresses in metrics)

Recommended `.env` example:

```bash
SESSION_SECRET=put-a-strong-secret-here
IP_HASH_SALT=put-a-strong-salt-here
```

#### Important Note on Docker and `.env`

- `.env` is not copied to the image or used in the Dockerfile. Do not `COPY .env`.
- Always pass it at runtime with `--env-file .env` (or with Docker Compose using `env_file:`).
- Create `.env` once and reuse it between builds and restarts to keep the same `SESSION_SECRET`.
- If `SESSION_SECRET` changes, current sessions will be invalidated.
- `.env` is already in `.gitignore`; do not commit it.

### 3) Production Deployment/Update (Step-by-Step)

1. Update code:

```bash
git pull origin main
```

2. Stop running container:

```bash
docker stop links-shortener
```

3. Remove container:

```bash
docker rm links-shortener
```

4. Check existing images:

```bash
docker images
```

5. Remove old image:

```bash
docker rmi [links-shortener-image_ID]
```

6. Build new image:

```bash
docker build -t links-shortener-image .
```

7. Run new container:

```bash
docker run -d --name links-shortener \
  -p 8085:8085 \
  -v "$(pwd)/data:/app/data" \
  -e SQLITE_PATH=/app/data/links-shortener.sqlite \
  --env-file .env \
  --restart unless-stopped \
  links-shortener-image
```

Verify:

```bash
docker ps
docker logs -f links-shortener
```

Access:

- Setup: `http://<IP_HOST>:8085/setup`
- Login: `http://<IP_HOST>:8085/login`
- Manage: `/links`

### 4) Notes

- Use the same `SESSION_SECRET` for all instances to keep cookies valid.
- Sessions are in-memory; use `connect-sqlite3` or similar for persistence.

### 5) Access Container Shell

Default shell is `sh`:

```bash
docker exec -it links-shortener sh
```

Install bash if needed:

```bash
docker exec -it links-shortener sh -c "apk add --no-cache bash && exec bash"
```

### 6) SQLite Database Backups

Data is persisted via `./data:/app/data`. For backups:

**Option A (hot backup):**

```bash
sudo apt-get install -y sqlite3
mkdir -p backups
sqlite3 data/data.sqlite ".backup 'backups/data-$(date +%F-%H%M%S).sqlite'"
```

**Option B (cold copy):**

```bash
docker stop links-shortener
mkdir -p backups
cp data/data.sqlite backups/data-$(date +%F-%H%M%S).sqlite
docker start links-shortener
```

**Restore backup:**

```bash
docker stop links-shortener
cp backups/data-YYYY-MM-DD-HHMMSS.sqlite data/data.sqlite
docker start links-shortener
```

Tip: Use cron for daily backups and sync to external storage.

## Support

If this project helped you and you want to support my work:

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=jabernalw&button_colour=FFDD00&font_colour=000000&font_family=Poppins&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/jabernalw)
