# GitHub Workflows

This directory contains GitHub Actions workflows for the Moltverse project.

## Available Workflows

### 1. Database Migration (`migrate.yml`)

Executes Prisma migrations against the production database.

#### Why This Exists

Railway's `preDeployCommand` feature has a bug where `serviceInstance` overrides
cannot be changed via API. This workflow provides an alternative way to run
migrations before deploys.

#### Triggers

| Trigger | Description |
|---------|-------------|
| Manual | Go to Actions > Database Migration > Run workflow |
| Automatic | Push to `main` when migration files change |

#### Required Secrets

Configure these in **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (from Railway) |

#### Usage

**Manual Migration (Recommended):**

1. Go to the repository's **Actions** tab
2. Select **Database Migration** workflow
3. Click **Run workflow**
4. Select environment (production/staging)
5. Type `MIGRATE` to confirm
6. Click **Run workflow**

**Automatic Migration:**

Migrations run automatically when you push changes to:
- `apps/server/prisma/migrations/**`
- `apps/server/prisma/schema.prisma`

#### Safety Features

- Requires explicit confirmation (`MIGRATE`) for manual runs
- Only runs on `main` branch
- Concurrency control prevents parallel migrations
- Failure notifications with summary

## Setting Up Secrets

### DATABASE_URL

**Important:** GitHub Actions runs outside Railway's network, so you need the
**external** database URL using Railway's TCP Proxy, not the internal URL.

#### Step 1: Get the External DATABASE_URL

The external URL format is:
```
postgresql://USER:PASSWORD@PROXY_DOMAIN:PROXY_PORT/DATABASE
```

For Moltverse production:
- **User:** `moltverse`
- **Password:** Found in Railway > Postgres > Variables > `POSTGRES_PASSWORD`
- **Proxy Domain:** Found in Railway > Postgres > Variables > `RAILWAY_TCP_PROXY_DOMAIN`
- **Proxy Port:** Found in Railway > Postgres > Variables > `RAILWAY_TCP_PROXY_PORT`
- **Database:** `moltverse`

Example format:
```
postgresql://moltverse:YOUR_PASSWORD@centerbeam.proxy.rlwy.net:24752/moltverse
```

#### Step 2: Add Secret to GitHub

1. Go to repository **Settings** on GitHub
2. Navigate to **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Name: `DATABASE_URL`
5. Value: (paste the external connection string from Step 1)
6. Click **Add secret**

#### Verification

After adding the secret, it should appear in the secrets list as `DATABASE_URL`.
You can test by running the workflow manually.

## Troubleshooting

### Migration fails with connection error

- Verify `DATABASE_URL` secret is set correctly
- Check if Railway PostgreSQL is running
- Ensure the connection string includes `?sslmode=require`

### Workflow doesn't trigger automatically

- Verify the file paths match exactly
- Check that push is to `main` branch
- Review workflow run history for errors

### Manual run requires confirmation

This is intentional. Type exactly `MIGRATE` in the confirmation field.
