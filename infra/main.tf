data "dotenv" "env" {
  filename = "../.env"
}

locals {
  account_id     = data.dotenv.env.env.CLOUDFLARE_ACCOUNT_ID
  worker_name    = data.dotenv.env.env.TF_VAR_worker_name
  team_domain    = data.dotenv.env.env.CLOUDFLARE_TEAM_DOMAIN
  admin_email    = data.dotenv.env.env.SEED_ADMIN_EMAIL
  idp_id         = data.dotenv.env.env.CLOUDFLARE_IDP_ID
  workers_domain = data.dotenv.env.env.CLOUDFLARE_WORKERS_DOMAIN
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

# Access policy — allow any user who authenticates through the configured IdP.
# Standalone account-level resource; embedding policies in the application is deprecated.
resource "cloudflare_zero_trust_access_policy" "allow_idp" {
  account_id = local.account_id
  name       = "${local.worker_name} - Allow IdP users"
  decision   = "allow"

  include = [{
    login_method = {
      id = local.idp_id
    }
  }]
}

# Access application — protects the Worker on its workers.dev subdomain.
# Links to the policy via the `policies` attribute (separate resource pattern).
resource "cloudflare_zero_trust_access_application" "app" {
  account_id                = local.account_id
  name                      = local.worker_name
  domain                    = "${local.worker_name}.${local.workers_domain}"
  type                      = "self_hosted"
  session_duration          = "24h"
  allowed_idps              = [local.idp_id]
  auto_redirect_to_identity = true

  policies = [{
    id         = cloudflare_zero_trust_access_policy.allow_idp.id
    precedence = 1
  }]
}
