{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "{{worker_name}}",
  "main": "src/index.ts",
  "compatibility_date": "2025-05-26",
  "account_id": "{{account_id}}",
  "assets": {
    "directory": "public",
    "binding": "ASSETS",
    "run_worker_first": true,
    "not_found_handling": "single-page-application"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "{{d1_database_name}}",
      "database_id": "{{d1_database_id}}"
    }
  ],
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "{{CLOUDFLARE_TEAM_DOMAIN}}",
    "SEED_ADMIN_EMAIL": "{{SEED_ADMIN_EMAIL}}"
  },
  "observability": {
    "enabled": true
  }
}
