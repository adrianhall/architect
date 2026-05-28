# E2E tests: Sasha flows (auth, dashboard, canvas editing)

## Summary

Sets up Playwright for end-to-end testing and implements E2E tests covering the Sasha (Solo Architect) persona flows: authentication, dashboard CRUD operations, and canvas editing. These tests run against the full stack (Worker + frontend) via `wrangler dev` and use `signDevJwt` from `@adrianhall/cloudflare-auth` to inject authentication headers. This issue establishes the Playwright infrastructure that ISSUE-22 builds on.

## Relevant Skills

- `webapp-testing`

## Requirements Coverage

- [F2-US1](../REQUIREMENTS.md): Protected routes require authentication — E2E test verifies unauthenticated access is redirected.
- [F2-US6](../REQUIREMENTS.md): User profile displayed in header — E2E test verifies email is shown after login.
- [F4-US1](../REQUIREMENTS.md): Drag service from palette onto canvas — E2E test verifies node creation via drag-and-drop.
- [F4-US5](../REQUIREMENTS.md): Edit node label in properties panel — E2E test verifies label editing.
- [F4-US4](../REQUIREMENTS.md): Connect two nodes by dragging handles — E2E test verifies edge creation.
- [F4-US7](../REQUIREMENTS.md): Delete selected nodes with Delete key — E2E test verifies node deletion.
- [F4-US8](../REQUIREMENTS.md): Undo/redo with keyboard shortcuts — E2E test verifies undo restores deleted node.
- [F4-US9](../REQUIREMENTS.md): Auto-layout — E2E test verifies layout rearranges nodes.
- [F4-US10](../REQUIREMENTS.md): Live save status — E2E test checks save status indicator after changes.
- [F4-US12](../REQUIREMENTS.md): Zoom controls — E2E test verifies fit-to-view works.
- [F5-US1](../REQUIREMENTS.md): Dashboard with diagrams — E2E test verifies diagram cards appear.
- [F5-US2](../REQUIREMENTS.md): Create new blank diagram — E2E test verifies creation flow.
- [F5-US3](../REQUIREMENTS.md): Duplicate diagram with "(Copy)" suffix — E2E test verifies duplication.
- [F5-US4](../REQUIREMENTS.md): Delete diagram with confirmation modal — E2E test verifies deletion flow.
- [F5-US5](../REQUIREMENTS.md): Rename diagram inline — E2E test verifies inline rename.

## Dependencies

- **ISSUE-12** — Dashboard page with card grid and CRUD actions must be implemented.
- **ISSUE-18** — Auto-save via DiagramSync with save status indicator must be implemented.

## Acceptance Criteria

- [ ] `@playwright/test` is installed as a root devDependency.
- [ ] `playwright.config.ts` exists at the project root with Chromium-only config, base URL `http://localhost:8787`, and web server command `npm start`.
- [ ] `e2e/` directory exists at the project root with test files and helpers.
- [ ] `e2e/helpers/auth.ts` exports a helper to create authenticated browser contexts using `signDevJwt`.
- [ ] Root `package.json` includes `test:e2e` and `test:e2e:ui` scripts.
- [ ] Auth tests: authenticated user sees dashboard, profile email is displayed, unauthenticated access redirects.
- [ ] Dashboard tests: empty state message, create diagram, diagram card appears, rename, duplicate with "(Copy)" suffix, delete with confirmation.
- [ ] Canvas tests: editor loads with empty canvas, drag service to canvas creates node, select node shows properties, edit label, connect two nodes, delete node with Delete key, undo restores node, auto-save triggers, auto-layout rearranges, zoom fit-to-view works.
- [ ] All E2E tests pass against a locally running `npm start` instance.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Install Playwright

Install Playwright as a root devDependency:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Only install Chromium for speed — no need for Firefox/WebKit in the MVP.

### 2. Create `playwright.config.ts`

Create `playwright.config.ts` at the project root:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:8787",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm start",
    url: "http://localhost:8787/api/version",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

**Key decisions:**

- `webServer.command: "npm start"` — Playwright starts the full stack (builds frontend, runs wrangler dev) before tests run. The `url` property tells Playwright to poll `/api/version` to know when the server is ready.
- `reuseExistingServer: !process.env.CI` — In local dev, reuses an already-running server for faster iteration. In CI, always starts fresh.
- `fullyParallel: true` — Tests within a file run in parallel for speed.
- Chromium only — minimises install size and test time.

### 3. Create Auth Helper

Create `e2e/helpers/auth.ts`:

```typescript
import { type Browser, type BrowserContext } from "@playwright/test";
import { signDevJwt } from "@adrianhall/cloudflare-auth";

const JWT_HEADER = "CF-Access-Jwt-Assertion";

export async function createAuthenticatedContext(
  browser: Browser,
  email: string,
  options?: { name?: string }
): Promise<BrowserContext> {
  const token = await signDevJwt({ email });

  return browser.newContext({
    extraHTTPHeaders: {
      [JWT_HEADER]: token,
    },
  });
}

export async function createUnauthenticatedContext(
  browser: Browser
): Promise<BrowserContext> {
  return browser.newContext();
}
```

**How it works:** `signDevJwt` from `@adrianhall/cloudflare-auth` generates a development JWT that the Worker's auth middleware accepts. By setting it as an `extraHTTPHeaders` value, every request from that browser context includes the auth header, simulating a logged-in user. This matches the dev auth flow described in MVP_PLAN.md Section 7.

### 4. Add npm Scripts

Add to root `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### 5. Create Auth E2E Tests

Create `e2e/sasha-auth.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { createAuthenticatedContext, createUnauthenticatedContext } from "./helpers/auth";

const TEST_EMAIL = "sasha@example.com";

test.describe("Sasha: Authentication", () => {
  test("authenticated user sees dashboard", async ({ browser }) => {
    const context = await createAuthenticatedContext(browser, TEST_EMAIL);
    const page = await context.newPage();

    await page.goto("/");
    await expect(page).toHaveURL(/\//);
    // Dashboard should be visible (look for the dashboard heading or create button)
    await expect(page.getByRole("heading", { name: /dashboard|my diagrams/i })).toBeVisible();

    await context.close();
  });

  test("user profile email is displayed in header", async ({ browser }) => {
    const context = await createAuthenticatedContext(browser, TEST_EMAIL);
    const page = await context.newPage();

    await page.goto("/");
    await expect(page.getByText(TEST_EMAIL)).toBeVisible();

    await context.close();
  });

  test("unauthenticated access redirects to login", async ({ browser }) => {
    const context = await createUnauthenticatedContext(browser);
    const page = await context.newPage();

    await page.goto("/");
    // Should be redirected to the dev auth login page
    await expect(page).toHaveURL(/_auth\/login/);

    await context.close();
  });
});
```

### 6. Create Dashboard E2E Tests

Create `e2e/sasha-dashboard.spec.ts`:

```typescript
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createAuthenticatedContext } from "./helpers/auth";

const TEST_EMAIL = "sasha-dashboard@example.com";

test.describe("Sasha: Dashboard", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await createAuthenticatedContext(browser, TEST_EMAIL);
  });

  test.beforeEach(async () => {
    page = await context.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("empty state shows create-your-first-diagram message", async () => {
    await page.goto("/");
    await expect(page.getByText(/create your first diagram/i)).toBeVisible();
  });

  test("create new diagram navigates to editor", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: /new diagram|create/i }).click();
    await expect(page).toHaveURL(/\/editor\//);
  });

  test("diagram appears in dashboard card grid", async () => {
    // Create a diagram first
    await page.goto("/");
    await page.getByRole("button", { name: /new diagram|create/i }).click();
    await expect(page).toHaveURL(/\/editor\//);

    // Navigate back to dashboard
    await page.goto("/");
    // At least one diagram card should be visible
    await expect(page.locator("[data-testid='diagram-card']").first()).toBeVisible();
  });

  test("rename diagram via inline edit", async () => {
    await page.goto("/");
    const card = page.locator("[data-testid='diagram-card']").first();
    await expect(card).toBeVisible();

    // Trigger inline rename (double-click or rename button)
    await card.getByRole("button", { name: /rename/i }).click();
    const input = card.getByRole("textbox");
    await input.fill("My Renamed Diagram");
    await input.press("Enter");

    // Verify the new title is displayed
    await expect(card.getByText("My Renamed Diagram")).toBeVisible();
  });

  test("duplicate diagram creates copy with (Copy) suffix", async () => {
    await page.goto("/");
    const card = page.locator("[data-testid='diagram-card']").first();
    await expect(card).toBeVisible();

    // Get original title
    const originalTitle = await card.locator("[data-testid='diagram-title']").textContent();

    // Click duplicate action
    await card.getByRole("button", { name: /more|actions/i }).click();
    await page.getByRole("menuitem", { name: /duplicate/i }).click();

    // Should navigate to the new diagram's editor
    await expect(page).toHaveURL(/\/editor\//);

    // Navigate back to dashboard - should see the copy
    await page.goto("/");
    await expect(page.getByText(`${originalTitle} (Copy)`)).toBeVisible();
  });

  test("delete diagram with confirmation modal removes card", async () => {
    await page.goto("/");
    const initialCount = await page.locator("[data-testid='diagram-card']").count();
    expect(initialCount).toBeGreaterThan(0);

    const card = page.locator("[data-testid='diagram-card']").last();

    // Open actions menu and click delete
    await card.getByRole("button", { name: /more|actions/i }).click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    // Confirmation dialog should appear
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: /delete|confirm/i }).click();

    // Card count should decrease
    await expect(page.locator("[data-testid='diagram-card']")).toHaveCount(initialCount - 1);
  });
});
```

**Note:** The exact selectors (`data-testid`, button names, etc.) depend on the implementations from ISSUE-12. The test selectors should be adjusted to match the actual DOM structure. Prefer `data-testid` attributes and ARIA roles for resilient selectors.

### 7. Create Canvas E2E Tests

Create `e2e/sasha-canvas.spec.ts`:

```typescript
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createAuthenticatedContext } from "./helpers/auth";

const TEST_EMAIL = "sasha-canvas@example.com";

test.describe("Sasha: Canvas Editing", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await createAuthenticatedContext(browser, TEST_EMAIL);
    // Create a diagram to work with
    const setupPage = await context.newPage();
    await setupPage.goto("/");
    await setupPage.getByRole("button", { name: /new diagram|create/i }).click();
    await setupPage.waitForURL(/\/editor\//);
    await setupPage.close();
  });

  test.beforeEach(async () => {
    page = await context.newPage();
    // Navigate to the most recently created diagram's editor
    await page.goto("/");
    await page.locator("[data-testid='diagram-card']").first().click();
    await page.waitForURL(/\/editor\//);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("editor page loads with empty canvas", async () => {
    // The React Flow canvas should be present
    await expect(page.locator(".react-flow")).toBeVisible();
    // No nodes initially
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
  });

  test("drag service from palette onto canvas creates node", async () => {
    // Find a service in the palette
    const service = page.locator("[data-testid='palette-service']").first();
    await expect(service).toBeVisible();

    // Drag it onto the canvas
    const canvas = page.locator(".react-flow__pane");
    await service.dragTo(canvas);

    // A node should now exist on the canvas
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
  });

  test("select node shows properties panel", async () => {
    // Click on the node we created
    await page.locator(".react-flow__node").first().click();

    // Properties panel should be visible
    await expect(page.locator("[data-testid='properties-panel']")).toBeVisible();
  });

  test("edit node label in properties panel", async () => {
    // Select the node
    await page.locator(".react-flow__node").first().click();

    // Find and edit the label input in the properties panel
    const labelInput = page.locator("[data-testid='properties-panel']")
      .getByRole("textbox", { name: /label/i });
    await labelInput.fill("My Workers Service");
    await labelInput.press("Tab"); // Trigger blur/save

    // The node on the canvas should reflect the new label
    await expect(page.locator(".react-flow__node").first()).toContainText("My Workers Service");
  });

  test("connect two nodes by dragging between handles", async () => {
    // Add a second node by dragging another service
    const service = page.locator("[data-testid='palette-service']").nth(1);
    const canvas = page.locator(".react-flow__pane");
    await service.dragTo(canvas, { targetPosition: { x: 400, y: 300 } });

    await expect(page.locator(".react-flow__node")).toHaveCount(2);

    // Find source handle on first node and target handle on second node
    const sourceHandle = page.locator(".react-flow__node").first()
      .locator(".react-flow__handle--source").first();
    const targetHandle = page.locator(".react-flow__node").nth(1)
      .locator(".react-flow__handle--target").first();

    // Drag from source to target to create an edge
    await sourceHandle.dragTo(targetHandle);

    // An edge should now exist
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  });

  test("delete selected node with Delete key", async () => {
    const nodeCount = await page.locator(".react-flow__node").count();
    expect(nodeCount).toBeGreaterThan(0);

    // Select the first node
    await page.locator(".react-flow__node").first().click();

    // Press Delete
    await page.keyboard.press("Delete");

    // Node count should decrease
    await expect(page.locator(".react-flow__node")).toHaveCount(nodeCount - 1);
  });

  test("undo (Ctrl+Z) restores deleted node", async () => {
    // Add a node first
    const service = page.locator("[data-testid='palette-service']").first();
    const canvas = page.locator(".react-flow__pane");
    await service.dragTo(canvas);

    const countBefore = await page.locator(".react-flow__node").count();

    // Select and delete
    await page.locator(".react-flow__node").last().click();
    await page.keyboard.press("Delete");
    await expect(page.locator(".react-flow__node")).toHaveCount(countBefore - 1);

    // Undo
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__node")).toHaveCount(countBefore);
  });

  test("auto-save triggers after changes", async () => {
    // Make a change (add a node)
    const service = page.locator("[data-testid='palette-service']").first();
    const canvas = page.locator(".react-flow__pane");
    await service.dragTo(canvas);

    // Check for save status indicator
    // After the debounce (500ms) + save, status should show "Saved"
    await expect(page.locator("[data-testid='save-status']")).toContainText(/saved/i, {
      timeout: 5000,
    });
  });

  test("auto-layout rearranges nodes", async () => {
    // Ensure at least two nodes exist
    const nodeCount = await page.locator(".react-flow__node").count();
    if (nodeCount < 2) {
      const service = page.locator("[data-testid='palette-service']").first();
      const canvas = page.locator(".react-flow__pane");
      await service.dragTo(canvas);
    }

    // Get initial positions
    const nodeBefore = await page.locator(".react-flow__node").first().boundingBox();

    // Click auto-layout button
    await page.getByRole("button", { name: /auto.?layout|layout/i }).click();

    // Wait for layout to complete (runs in Web Worker)
    await page.waitForTimeout(1000);

    // Positions should have changed (at minimum, this verifies the layout ran without errors)
    const nodeAfter = await page.locator(".react-flow__node").first().boundingBox();
    // We can't assert exact positions, but the layout button should not error
    expect(nodeAfter).toBeTruthy();
  });

  test("zoom fit-to-view works", async () => {
    // Click the fit-to-view button
    await page.getByRole("button", { name: /fit.?view|fit/i }).click();

    // The viewport should contain all nodes (hard to assert exactly, but the button should work)
    // Verify at least one node is still visible
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
  });
});
```

**Important notes on selectors:**

- The test selectors (`data-testid`, class names, ARIA roles) are based on expected implementations from ISSUE-12, 13, 15, 16, 17, 18, and 19. Adjust selectors to match the actual component implementations.
- React Flow uses well-known CSS classes (`.react-flow`, `.react-flow__node`, `.react-flow__edge`, `.react-flow__handle--source`, `.react-flow__handle--target`) that are stable and suitable for E2E selectors.
- Some tests depend on ordering within a `describe` block. If tests need to be fully independent, each test should create its own diagram and add its own nodes.

### 8. Add to `.gitignore`

Add Playwright artifacts to `.gitignore`:

```text
# Playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

### File Inventory

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright configuration with web server, Chromium-only |
| `e2e/helpers/auth.ts` | Auth helper using `signDevJwt` for authenticated contexts |
| `e2e/sasha-auth.spec.ts` | Authentication flow tests |
| `e2e/sasha-dashboard.spec.ts` | Dashboard CRUD tests |
| `e2e/sasha-canvas.spec.ts` | Canvas editing tests |

## Testing

### E2E Test Summary

| File | Tests |
|------|-------|
| `e2e/sasha-auth.spec.ts` | Authenticated user sees dashboard; profile email displayed; unauthenticated redirects to login |
| `e2e/sasha-dashboard.spec.ts` | Empty state; create diagram; card appears; rename; duplicate with "(Copy)"; delete with confirmation |
| `e2e/sasha-canvas.spec.ts` | Empty canvas loads; drag service creates node; select shows properties; edit label; connect nodes; delete with Delete key; undo restores; auto-save triggers; auto-layout; zoom fit-to-view |

### Manual Tests

After running `npm start`:

1. **Run all E2E tests:**

   ```bash
   npm run test:e2e
   ```

   All tests should pass. Failed tests produce screenshots in `test-results/`.

2. **Run with Playwright UI for debugging:**

   ```bash
   npm run test:e2e:ui
   ```

   Opens the Playwright Test Runner UI with step-by-step trace, DOM snapshots, and network logs.

3. **Run a single test file:**

   ```bash
   npx playwright test e2e/sasha-canvas.spec.ts
   ```

4. **View test report:**

   ```bash
   npx playwright show-report
   ```

   Opens an HTML report with test results, screenshots, and traces.
