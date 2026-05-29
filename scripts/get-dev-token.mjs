#!/usr/bin/env node
// get-dev-token.mjs — Mint a dev JWT for a given email address.
//
// Uses signDevJwt() from @adrianhall/cloudflare-auth (the same function used
// by the Vitest integration tests).  The resulting token is accepted by the
// cloudflareAccess middleware in local dev without going through the PIN form.
//
// Usage:
//   node scripts/get-dev-token.mjs <email>
//   node scripts/get-dev-token.mjs dev@example.com
//
// Outputs the raw JWT string on stdout (no newline), so it can be captured:
//   TOKEN=$(node scripts/get-dev-token.mjs dev@example.com)

import { signDevJwt } from "@adrianhall/cloudflare-auth";

const email = process.argv[2];

if (!email) {
	process.stderr.write("Usage: node scripts/get-dev-token.mjs <email>\n");
	process.exit(1);
}

const token = await signDevJwt(email);
process.stdout.write(token);
