data "dotenv" "env" {
  filename = "../.env"
}

locals {
  account_id  = data.dotenv.env.env.CLOUDFLARE_ACCOUNT_ID
  worker_name = data.dotenv.env.env.TF_VAR_worker_name
  team_domain = data.dotenv.env.env.CLOUDFLARE_TEAM_DOMAIN
  admin_email = data.dotenv.env.env.SEED_ADMIN_EMAIL
}

provider "cloudflare" {
  api_token = data.dotenv.env.env.CLOUDFLARE_API_TOKEN
}

# Worker registration — Wrangler handles code deployment separately.
# Using cloudflare_worker (not cloudflare_workers_script) per v5 provider.
resource "cloudflare_worker" "app" {
  account_id = local.account_id
  name       = local.worker_name
}

# D1 database — read_replication block is required to avoid drift on every apply.
resource "cloudflare_d1_database" "main" {
  account_id = local.account_id
  name       = "${local.worker_name}-db"

  read_replication = {
    mode = "auto"
  }
}
