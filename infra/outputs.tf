output "account_id" {
  value = local.account_id
}

output "worker_name" {
  value = cloudflare_worker.app.name
}

output "d1_database_id" {
  value = cloudflare_d1_database.main.id
}

output "d1_database_name" {
  value = cloudflare_d1_database.main.name
}

output "CLOUDFLARE_TEAM_DOMAIN" {
  value = local.team_domain
}

output "SEED_ADMIN_EMAIL" {
  value     = local.admin_email
  sensitive = true
}
