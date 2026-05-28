# Service catalog: data, shared types, API, icon serving + tests

## Summary

Creates the Cloudflare service catalog: shared TypeScript types for catalog services, categories, and edge types; a `catalog/services.json` data file defining all Cloudflare services organized by category; SVG icons copied from `../cloudflare-docs/src/icons` (with placeholder fallbacks); and a `GET /api/catalog` endpoint that returns the full catalog. The shared types are exported from `src/shared/src/index.ts` so both the worker and frontend can consume them.

## Relevant Skills

- `cloudflare`
- `workers-best-practices`
- `typescript-advanced-types`

## Requirements Coverage

- [F3-US1](../REQUIREMENTS.md): Each service rendered with the correct icon, category colour, and connection handles - this issue defines the catalog data (typeId, officialName, category, iconPath) and category colours (blue, green, orange, gray) that the frontend will consume.
- [F3-US2](../REQUIREMENTS.md): Add a new service to the catalog without code changes - services are defined in `catalog/services.json`; adding a service is a data-only change (add entry + icon file).
- [F3-US4](../REQUIREMENTS.md): Documentation link in properties panel - each service entry includes `docUrl` pointing to the official Cloudflare docs.

## Acceptance Criteria

- [ ] `src/shared/src/catalog.ts` exports `CatalogService`, `CatalogCategory`, and `EdgeType` TypeScript types.
- [ ] `src/shared/src/index.ts` re-exports all catalog types.
- [ ] `catalog/services.json` contains service definitions for all listed Cloudflare services (minimum 27 services across 4 categories).
- [ ] Every service entry has all required fields: `typeId`, `officialName`, `shortName`, `category`, `iconPath`, `docUrl`.
- [ ] `typeId` values are lowercase-kebab-case and unique.
- [ ] Categories are defined with correct colours: blue (Developer Platform), green (Zero Trust), orange (CDN/Application), gray (non-Cloudflare).
- [ ] SVG icons exist in `catalog/icons/` for each service (real icons from cloudflare-docs or placeholder SVGs).
- [ ] `GET /api/catalog` returns 200 with `{ data: { services: [...], categories: [...], edgeTypes: [...] } }`.
- [ ] `GET /api/catalog` includes all 4 edge types: `data-flow`, `binding`, `trigger`, `dependency`.
- [ ] `GET /api/catalog` requires authentication (returns 401 without auth).
- [ ] Catalog types can be imported by both the worker and frontend packages via `@architect/shared`.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Define Shared Catalog Types

Create `src/shared/src/catalog.ts` with the following types:

```typescript
/** A single Cloudflare service in the catalog */
export interface CatalogService {
  /** Unique identifier, lowercase-kebab-case (e.g. "workers", "d1", "r2") */
  typeId: string;
  /** Official product name (e.g. "Cloudflare Workers") */
  officialName: string;
  /** Short display name for canvas nodes (e.g. "Workers") */
  shortName: string;
  /** Category ID this service belongs to */
  category: string;
  /** Relative path to SVG icon within catalog/icons/ (e.g. "workers.svg") */
  iconPath: string;
  /** URL to official Cloudflare documentation */
  docUrl: string;
}

/** A service category with display metadata */
export interface CatalogCategory {
  /** Unique identifier (e.g. "developer-platform") */
  id: string;
  /** Human-readable label (e.g. "Developer Platform") */
  label: string;
  /** Display colour for this category (hex value) */
  color: string;
}

/** An edge type for connections between nodes */
export interface EdgeType {
  /** Unique identifier (e.g. "data-flow") */
  id: string;
  /** Human-readable label (e.g. "Data Flow") */
  label: string;
  /** Visual style hint for rendering */
  style: "solid" | "dashed" | "dotted" | "animated";
}

/** The full catalog response shape */
export interface CatalogData {
  services: CatalogService[];
  categories: CatalogCategory[];
  edgeTypes: EdgeType[];
}
```

### 2. Update Shared Index

Update `src/shared/src/index.ts` to re-export catalog types:

```typescript
export * from "./catalog";
// ... existing re-exports (diagram, api, user, etc.)
```

### 3. Create catalog/services.json

Create `catalog/services.json` with the following structure:

```json
{
  "categories": [
    { "id": "developer-platform", "label": "Developer Platform", "color": "#2563eb" },
    { "id": "zero-trust", "label": "Zero Trust", "color": "#16a34a" },
    { "id": "cdn-application", "label": "CDN / Application", "color": "#ea580c" },
    { "id": "other", "label": "Other", "color": "#6b7280" }
  ],
  "services": [
    ...
  ],
  "edgeTypes": [
    { "id": "data-flow", "label": "Data Flow", "style": "solid" },
    { "id": "binding", "label": "Binding", "style": "dashed" },
    { "id": "trigger", "label": "Trigger", "style": "dotted" },
    { "id": "dependency", "label": "Dependency", "style": "animated" }
  ]
}
```

**Required services (minimum set):**

Developer Platform (category: `developer-platform`):

| typeId | officialName | shortName | iconPath | docUrl |
|--------|-------------|-----------|----------|--------|
| `workers` | Cloudflare Workers | Workers | `workers.svg` | `https://developers.cloudflare.com/workers/` |
| `pages` | Cloudflare Pages | Pages | `pages.svg` | `https://developers.cloudflare.com/pages/` |
| `d1` | Cloudflare D1 | D1 | `d1.svg` | `https://developers.cloudflare.com/d1/` |
| `kv` | Workers KV | KV | `kv.svg` | `https://developers.cloudflare.com/kv/` |
| `r2` | Cloudflare R2 | R2 | `r2.svg` | `https://developers.cloudflare.com/r2/` |
| `queues` | Cloudflare Queues | Queues | `queues.svg` | `https://developers.cloudflare.com/queues/` |
| `durable-objects` | Durable Objects | Durable Objects | `durable-objects.svg` | `https://developers.cloudflare.com/durable-objects/` |
| `workflows` | Cloudflare Workflows | Workflows | `workflows.svg` | `https://developers.cloudflare.com/workflows/` |
| `hyperdrive` | Hyperdrive | Hyperdrive | `hyperdrive.svg` | `https://developers.cloudflare.com/hyperdrive/` |
| `vectorize` | Vectorize | Vectorize | `vectorize.svg` | `https://developers.cloudflare.com/vectorize/` |
| `workers-ai` | Workers AI | Workers AI | `workers-ai.svg` | `https://developers.cloudflare.com/workers-ai/` |
| `browser-rendering` | Browser Rendering | Browser Rendering | `browser-rendering.svg` | `https://developers.cloudflare.com/browser-rendering/` |
| `email-workers` | Email Workers | Email Workers | `email-routing.svg` | `https://developers.cloudflare.com/email-routing/email-workers/` |
| `pipelines` | Pipelines | Pipelines | `pipelines.svg` | `https://developers.cloudflare.com/pipelines/` |
| `containers` | Containers | Containers | `containers.svg` | `https://developers.cloudflare.com/containers/` |

Zero Trust (category: `zero-trust`):

| typeId | officialName | shortName | iconPath | docUrl |
|--------|-------------|-----------|----------|--------|
| `access` | Cloudflare Access | Access | `access.svg` | `https://developers.cloudflare.com/cloudflare-one/policies/access/` |
| `tunnel` | Cloudflare Tunnel | Tunnel | `tunnel.svg` | `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/` |
| `gateway` | Cloudflare Gateway | Gateway | `gateway.svg` | `https://developers.cloudflare.com/cloudflare-one/policies/gateway/` |
| `warp` | Cloudflare WARP | WARP | `warp.svg` | `https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/` |

CDN / Application (category: `cdn-application`):

| typeId | officialName | shortName | iconPath | docUrl |
|--------|-------------|-----------|----------|--------|
| `cdn` | Cloudflare CDN | CDN | `cdn.svg` | `https://developers.cloudflare.com/cache/` |
| `dns` | Cloudflare DNS | DNS | `dns.svg` | `https://developers.cloudflare.com/dns/` |
| `load-balancing` | Load Balancing | Load Balancing | `load-balancing.svg` | `https://developers.cloudflare.com/load-balancing/` |
| `waf` | Web Application Firewall | WAF | `waf.svg` | `https://developers.cloudflare.com/waf/` |
| `ddos-protection` | DDoS Protection | DDoS Protection | `ddos-protection.svg` | `https://developers.cloudflare.com/ddos-protection/` |
| `argo-smart-routing` | Argo Smart Routing | Argo | `argo-smart-routing.svg` | `https://developers.cloudflare.com/argo-smart-routing/` |
| `stream` | Cloudflare Stream | Stream | `stream.svg` | `https://developers.cloudflare.com/stream/` |
| `images` | Cloudflare Images | Images | `images.svg` | `https://developers.cloudflare.com/images/` |

### 4. Copy or Create SVG Icons

**If `../cloudflare-docs/src/icons` exists:**

Copy matching SVG files into `catalog/icons/`. The cloudflare-docs repo uses icon filenames that may not match 1:1 with typeIds, so a manual mapping may be needed. Use a script or do it manually:

```bash
# Example (actual filenames may vary)
cp ../cloudflare-docs/src/icons/workers.svg catalog/icons/workers.svg
# etc.
```

**If `../cloudflare-docs` is not available:**

Create simple placeholder SVGs for each service. Each placeholder should be a minimal valid SVG with the service's short name as text and the category color as the fill:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="8" fill="#2563eb" fill-opacity="0.1"/>
  <text x="24" y="28" text-anchor="middle" font-family="system-ui, sans-serif"
    font-size="8" font-weight="600" fill="#2563eb">Workers</text>
</svg>
```

These placeholders are functional and can be replaced with official icons later.

**Important:** Icons are committed to the repository (per MVP_PLAN.md Section 11: "Icons are committed"). They do not depend on the cloudflare-docs repo at runtime.

### 5. Create the Catalog API Route

Create `src/worker/src/routes/catalog.ts`:

```typescript
import { Hono } from "hono";
import catalogData from "../../../../catalog/services.json";
import type { CatalogData } from "@architect/shared";

const app = new Hono();

app.get("/", (c) => {
  const data: CatalogData = {
    services: catalogData.services,
    categories: catalogData.categories,
    edgeTypes: catalogData.edgeTypes,
  };
  return c.json({ data });
});

export default app;
```

**JSON import:** The `catalog/services.json` file is imported at build time. Ensure the worker's `tsconfig.json` has `"resolveJsonModule": true` and that the import path resolves correctly. If the path doesn't resolve cleanly, consider adding a path alias in tsconfig or adjusting the relative path.

**Alternative approach:** If JSON imports cause issues with the Workers bundler, read the file at build time and inline it, or use a simpler approach: define the catalog data as a TypeScript constant in a `.ts` file instead of `.json`.

### 6. Mount the Catalog Route

In `src/worker/src/index.ts`:

```typescript
import catalog from "./routes/catalog";

// After auth middleware is applied
app.route("/api/catalog", catalog);
```

The catalog route requires authentication (applied globally for `/api/*` routes).

### 7. TypeScript Configuration

Ensure the shared package's `tsconfig.json` exports the catalog types properly. The worker and frontend packages should be able to import from `@architect/shared`:

```typescript
import type { CatalogService, CatalogCategory, EdgeType, CatalogData } from "@architect/shared";
```

If the shared package uses TypeScript project references, ensure the catalog.ts file is included in the build.

## Testing

### Shared Package Tests

Create `src/shared/src/__tests__/catalog.test.ts` (or `src/shared/src/catalog.test.ts`) to validate the catalog data and types:

1. **All services have required fields**
   - Import `catalog/services.json`. For each service entry, assert that `typeId`, `officialName`, `shortName`, `category`, `iconPath`, and `docUrl` are present and are non-empty strings.

2. **All typeIds are unique**
   - Collect all `typeId` values. Assert the set size equals the array length.

3. **All typeIds are lowercase-kebab-case**
   - Assert each `typeId` matches `/^[a-z][a-z0-9-]*$/`.

4. **All categories referenced by services exist**
   - Collect category IDs from `categories` array. For each service, assert its `category` is in the set.

5. **Categories have correct colours**
   - Assert `developer-platform` has blue (`#2563eb`), `zero-trust` has green (`#16a34a`), `cdn-application` has orange (`#ea580c`), `other` has gray (`#6b7280`).

6. **All 4 edge types are present**
   - Assert edge types array contains entries with ids: `data-flow`, `binding`, `trigger`, `dependency`.

7. **Edge types have valid styles**
   - Assert each edge type's `style` is one of: `solid`, `dashed`, `dotted`, `animated`.

8. **Minimum service count**
   - Assert at least 27 services are defined (15 developer-platform + 4 zero-trust + 8 cdn-application).

9. **docUrl values are valid URLs**
   - Assert each `docUrl` starts with `https://`.

### Worker API Tests

Create `src/worker/src/test/catalog.test.ts`:

1. **GET /api/catalog returns 200 with correct structure**
   - Make authenticated GET request. Assert 200.
   - Assert response has `data.services` (array), `data.categories` (array), `data.edgeTypes` (array).

2. **GET /api/catalog returns all services**
   - Assert `data.services.length >= 27`.

3. **GET /api/catalog services have required fields**
   - For the first few services, assert all required fields are present.

4. **GET /api/catalog returns all 4 edge types**
   - Assert `data.edgeTypes` has length 4.
   - Assert IDs include `data-flow`, `binding`, `trigger`, `dependency`.

5. **GET /api/catalog returns all categories with correct colors**
   - Find each category by id, assert color matches expected value.

6. **GET /api/catalog requires auth**
   - Make request without auth token. Assert 401.

### Manual Tests

After deploying locally with `npm start`:

```bash
# Set auth token
TOKEN="<dev-jwt-token>"
AUTH="Authorization: Bearer $TOKEN"

# Get full catalog
curl -s http://localhost:8787/api/catalog \
  -H "$AUTH" | jq .

# Check service count
curl -s http://localhost:8787/api/catalog \
  -H "$AUTH" | jq '.data.services | length'

# Check categories
curl -s http://localhost:8787/api/catalog \
  -H "$AUTH" | jq '.data.categories'

# Check edge types
curl -s http://localhost:8787/api/catalog \
  -H "$AUTH" | jq '.data.edgeTypes'

# Verify a specific service
curl -s http://localhost:8787/api/catalog \
  -H "$AUTH" | jq '.data.services[] | select(.typeId == "workers")'

# Without auth (should 401)
curl -s http://localhost:8787/api/catalog -w "\nHTTP Status: %{http_code}\n"
```
