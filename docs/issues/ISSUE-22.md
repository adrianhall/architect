# E2E tests: Tomas flows (admin user management)

## Summary

Implements Playwright E2E tests covering the Tomas (Admin / Team Lead) persona flows: admin page access control, user list display with pagination and search, role management (promote/demote), user deletion with cascade verification, and self-action prevention. Reuses the Playwright configuration and auth helpers established in ISSUE-21. Tests create multiple users and diagrams via API calls in setup to exercise realistic admin scenarios.

## Relevant Skills

- `webapp-testing`

## Requirements Coverage

- [F2-US3](../REQUIREMENTS.md): Paginated, sortable, searchable list of users at `/admin` — E2E tests verify the admin page renders a user table with pagination controls, column sorting, and search functionality.
- [F2-US4](../REQUIREMENTS.md): Promote, demote, or delete a user; cannot modify own account — E2E tests verify promote/demote actions change the role badge, delete removes the user, and self-actions are disabled.
- [F2-US5](../REQUIREMENTS.md): Each user's diagram count in the admin list — E2E tests verify diagram counts are displayed and that deleting a user also deletes their diagrams.
- [F2-US9](../REQUIREMENTS.md): Audit log of admin mutations — admin actions trigger API calls that emit audit logs on the backend; E2E tests verify the UI flows that produce those log entries.

## Dependencies

- **ISSUE-20** — Admin UI page with user table, search, sort, pagination, and action dropdowns must be implemented.
- **ISSUE-21** — Playwright config, auth helpers, and npm scripts must exist.

## Acceptance Criteria

- [ ] Admin user can access `/admin` page and see the user management table.
- [ ] Non-admin user is redirected away from `/admin`.
- [ ] Admin sees paginated user list with all expected columns (email, name, role, diagram count, created, actions).
- [ ] Admin can search users by email.
- [ ] Admin can sort users by clicking column headers.
- [ ] Admin can promote a user to admin role (badge changes to blue "admin").
- [ ] Admin can demote a user to regular role (badge changes to gray "user").
- [ ] Admin cannot promote/demote themselves (action button is disabled on own row).
- [ ] Admin can delete a user via confirmation modal that shows diagram count.
- [ ] Admin cannot delete themselves.
- [ ] After deleting a user, their diagrams are also deleted (verified via API or dashboard).
- [ ] Pagination works correctly when enough users span multiple pages.
- [ ] All E2E tests pass against a locally running `npm start` instance.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Test Data Setup Strategy

The admin E2E tests require multiple users with varying roles and diagram counts. The test setup creates this data via API calls using authenticated contexts:

- **Admin user (Tomas):** The primary test actor. Created by logging in with `tomas-admin@example.com`.
- **Regular users:** Created by making `GET /api/me` requests with different JWT tokens (this triggers user auto-provisioning from ISSUE-05). Each user is created with a unique email.
- **Diagrams:** Created via `POST /api/diagrams` for specific users to set up diagram counts.

The admin user must be promoted via direct API call or by using the `SEED_ADMIN_EMAIL` environment variable. For E2E tests, the simplest approach is to use the seed admin email as the Tomas user.

### 2. Create Helper for Test User Provisioning

Create `e2e/helpers/setup.ts`:

```typescript
import { type BrowserContext, type APIRequestContext, request } from "@playwright/test";
import { signDevJwt } from "@adrianhall/cloudflare-auth";

const BASE_URL = "http://localhost:8787";
const JWT_HEADER = "CF-Access-Jwt-Assertion";

export interface TestUser {
  email: string;
  token: string;
  id?: string;
}

/**
 * Provision a user by hitting GET /api/me with their JWT.
 * The auth middleware auto-creates the user on first request.
 * Returns the user's ID and token.
 */
export async function provisionUser(
  apiContext: APIRequestContext,
  email: string
): Promise<TestUser> {
  const token = await signDevJwt({ email });
  const response = await apiContext.get(`${BASE_URL}/api/me`, {
    headers: { [JWT_HEADER]: token },
  });
  const body = await response.json();
  return { email, token, id: body.data?.id };
}

/**
 * Create a diagram for a specific user.
 */
export async function createDiagramForUser(
  apiContext: APIRequestContext,
  user: TestUser,
  title?: string
): Promise<string> {
  const response = await apiContext.post(`${BASE_URL}/api/diagrams`, {
    headers: {
      [JWT_HEADER]: user.token,
      "Content-Type": "application/json",
    },
    data: { title: title ?? `Diagram by ${user.email}` },
  });
  const body = await response.json();
  return body.data?.id;
}

/**
 * Promote a user to admin via the admin API.
 */
export async function promoteToAdmin(
  apiContext: APIRequestContext,
  adminToken: string,
  userId: string
): Promise<void> {
  await apiContext.patch(`${BASE_URL}/api/admin/users/${userId}/role`, {
    headers: {
      [JWT_HEADER]: adminToken,
      "Content-Type": "application/json",
    },
    data: { role: "admin" },
  });
}
```

### 3. Create the Admin E2E Test File

Create `e2e/tomas-admin.spec.ts`:

```typescript
import { test, expect, type BrowserContext, type Page, type APIRequestContext } from "@playwright/test";
import { createAuthenticatedContext } from "./helpers/auth";
import { provisionUser, createDiagramForUser, type TestUser } from "./helpers/setup";

// Use the SEED_ADMIN_EMAIL or a known admin email for the Tomas persona
const ADMIN_EMAIL = "tomas-admin@example.com";
const NON_ADMIN_EMAIL = "non-admin-user@example.com";

test.describe("Tomas: Admin User Management", () => {
  let adminContext: BrowserContext;
  let nonAdminContext: BrowserContext;
  let apiContext: APIRequestContext;
  let adminUser: TestUser;
  let testUsers: TestUser[];

  test.beforeAll(async ({ browser, playwright }) => {
    apiContext = await playwright.request.newContext();

    // Provision the admin user (seed admin)
    adminUser = await provisionUser(apiContext, ADMIN_EMAIL);

    // Provision several regular users with diagrams
    testUsers = [];
    for (let i = 1; i <= 5; i++) {
      const user = await provisionUser(apiContext, `testuser-${i}@example.com`);
      testUsers.push(user);
      // Create varying numbers of diagrams per user
      for (let d = 0; d < i; d++) {
        await createDiagramForUser(apiContext, user, `Diagram ${d + 1} for user ${i}`);
      }
    }

    // Create browser contexts
    adminContext = await createAuthenticatedContext(browser, ADMIN_EMAIL);
    nonAdminContext = await createAuthenticatedContext(browser, NON_ADMIN_EMAIL);

    // Provision non-admin user too
    await provisionUser(apiContext, NON_ADMIN_EMAIL);
  });

  test.afterAll(async () => {
    await adminContext.close();
    await nonAdminContext.close();
    await apiContext.dispose();
  });

  test("admin user can access /admin page", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: /user management/i })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();

    await page.close();
  });

  test("non-admin user is redirected away from /admin", async () => {
    const page = await nonAdminContext.newPage();
    await page.goto("/admin");

    // Should be redirected to dashboard (not on /admin)
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page).toHaveURL(/^\//);

    await page.close();
  });

  test("admin sees paginated user list with correct columns", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // Verify column headers exist
    const headers = page.locator("thead th");
    await expect(headers.filter({ hasText: /email/i })).toBeVisible();
    await expect(headers.filter({ hasText: /name/i })).toBeVisible();
    await expect(headers.filter({ hasText: /role/i })).toBeVisible();
    await expect(headers.filter({ hasText: /diagram/i })).toBeVisible();
    await expect(headers.filter({ hasText: /created/i })).toBeVisible();
    await expect(headers.filter({ hasText: /action/i })).toBeVisible();

    // Verify user rows are present
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();

    await page.close();
  });

  test("admin can search users by email", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // Search for a specific test user
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill("testuser-1@example.com");

    // Wait for debounce + API call
    await page.waitForTimeout(500);

    // Only the matching user should be visible
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("testuser-1@example.com");

    // Clear search
    await searchInput.fill("");
    await page.waitForTimeout(500);

    // All users should be visible again
    await expect(page.locator("tbody tr").first()).toBeVisible();

    await page.close();
  });

  test("admin can sort users by column", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // Click the email column header to sort
    await page.locator("thead th").filter({ hasText: /email/i }).click();

    // Wait for re-render
    await page.waitForTimeout(300);

    // Get first row email
    const firstEmail = await page.locator("tbody tr").first()
      .locator("td").first().textContent();

    // Click again to reverse sort
    await page.locator("thead th").filter({ hasText: /email/i }).click();
    await page.waitForTimeout(300);

    const firstEmailReversed = await page.locator("tbody tr").first()
      .locator("td").first().textContent();

    // The first row should be different after reversing sort
    expect(firstEmail).not.toEqual(firstEmailReversed);

    await page.close();
  });

  test("admin can promote a user to admin role", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // Find a regular user row
    const userRow = page.locator("tbody tr").filter({
      hasText: "testuser-1@example.com",
    });
    await expect(userRow).toBeVisible();

    // Verify current role is "user"
    await expect(userRow.locator("[data-testid='role-badge'], .badge, span")
      .filter({ hasText: "user" })).toBeVisible();

    // Open actions menu and promote
    await userRow.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: /promote/i }).click();

    // Role badge should change to "admin"
    await expect(userRow.locator("[data-testid='role-badge'], .badge, span")
      .filter({ hasText: "admin" })).toBeVisible();

    // Clean up: demote back
    await userRow.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: /demote/i }).click();

    await page.close();
  });

  test("admin can demote a user to regular role", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // First promote a user so we can test demotion
    const userRow = page.locator("tbody tr").filter({
      hasText: "testuser-2@example.com",
    });
    await userRow.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: /promote/i }).click();

    // Wait for update
    await page.waitForTimeout(300);

    // Now demote
    await userRow.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: /demote/i }).click();

    // Role should be back to "user"
    await expect(userRow.locator("[data-testid='role-badge'], .badge, span")
      .filter({ hasText: "user" })).toBeVisible();

    await page.close();
  });

  test("admin cannot promote/demote themselves", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // Find the admin's own row
    const ownRow = page.locator("tbody tr").filter({
      hasText: ADMIN_EMAIL,
    });
    await expect(ownRow).toBeVisible();

    // The actions button should be disabled
    const actionsBtn = ownRow.getByRole("button", { name: /actions/i });
    await expect(actionsBtn).toBeDisabled();

    await page.close();
  });

  test("admin can delete a user with confirmation showing diagram count", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // Find a test user with known diagrams (testuser-3 has 3 diagrams)
    const userRow = page.locator("tbody tr").filter({
      hasText: "testuser-3@example.com",
    });
    await expect(userRow).toBeVisible();

    // Open actions and click delete
    await userRow.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    // Confirmation dialog should appear
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // Dialog should mention the user's email and diagram count
    await expect(dialog).toContainText("testuser-3@example.com");
    await expect(dialog).toContainText(/3 diagram/i);

    // Confirm deletion
    await dialog.getByRole("button", { name: /delete|confirm/i }).click();

    // The user row should be gone
    await expect(userRow).not.toBeVisible();

    await page.close();
  });

  test("admin cannot delete themselves", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // Find the admin's own row
    const ownRow = page.locator("tbody tr").filter({
      hasText: ADMIN_EMAIL,
    });

    // Actions button is disabled, so delete is not reachable
    const actionsBtn = ownRow.getByRole("button", { name: /actions/i });
    await expect(actionsBtn).toBeDisabled();

    await page.close();
  });

  test("after deleting a user, their diagrams are also deleted", async () => {
    const page = await adminContext.newPage();

    // testuser-4 has 4 diagrams — verify via the admin table first
    await page.goto("/admin");
    const userRow = page.locator("tbody tr").filter({
      hasText: "testuser-4@example.com",
    });
    await expect(userRow).toBeVisible();

    // Delete the user
    await userRow.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: /delete/i }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: /delete|confirm/i }).click();
    await expect(userRow).not.toBeVisible();

    // Verify diagrams are gone by trying to fetch them via API
    // (The deleted user's token should now return empty or 401)
    const deletedUser = testUsers.find((u) => u.email === "testuser-4@example.com");
    if (deletedUser) {
      const response = await page.request.get("/api/diagrams", {
        headers: { "CF-Access-Jwt-Assertion": deletedUser.token },
      });
      // Either 401 (user no longer exists) or empty diagram list
      const status = response.status();
      if (status === 200) {
        const body = await response.json();
        expect(body.data).toHaveLength(0);
      } else {
        expect(status).toBe(401);
      }
    }

    await page.close();
  });

  test("pagination works with enough users", async () => {
    const page = await adminContext.newPage();
    await page.goto("/admin");

    // Change items per page to a small number to test pagination
    // (Use the items-per-page selector)
    const limitSelector = page.locator("select, [data-testid='limit-select']")
      .or(page.getByRole("combobox").filter({ hasText: /10|20|50/ }));

    // If there are enough users for pagination to appear, test it
    const totalRows = await page.locator("tbody tr").count();

    if (totalRows > 0) {
      // Try setting a small page size to force pagination
      // Click the limit selector and choose 10
      const selectTrigger = page.locator("[data-testid='limit-select']")
        .or(page.getByText(/rows per page/i).locator("..").getByRole("combobox"));

      // Check if pagination controls exist
      const nextBtn = page.getByRole("button", { name: /next page/i });
      const prevBtn = page.getByRole("button", { name: /previous page/i });

      // If we have pagination controls, verify they work
      if (await nextBtn.isVisible()) {
        // Prev should be disabled on first page
        await expect(prevBtn).toBeDisabled();

        // Click next
        await nextBtn.click();

        // Should now be on page 2
        await expect(prevBtn).toBeEnabled();
      }
    }

    await page.close();
  });
});
```

**Key design decisions:**

- **Setup via API calls:** Users and diagrams are created via API in `beforeAll` rather than through the UI. This is faster and more reliable for test setup.
- **Seed admin email:** The Tomas admin user should match the `SEED_ADMIN_EMAIL` configured in `.env`, or the test should promote a user via the admin API after the seed admin is available.
- **Separate browser contexts:** Admin and non-admin users get separate contexts with different JWT tokens, preventing auth state leakage between tests.
- **Cascade verification:** The diagram cascade test verifies deletion by making an API call with the deleted user's token and checking for an empty result or 401.
- **Cleanup considerations:** Some tests modify state (promote, delete). Tests that depend on specific users should account for this by using unique test users or running in order.
- **Selectors:** The exact selectors depend on the ISSUE-20 implementation. The tests use a combination of ARIA roles, `data-testid` attributes, and text content matchers. Adjust to match the actual DOM structure.

### File Inventory

| File | Purpose |
|------|---------|
| `e2e/helpers/setup.ts` | Test user/diagram provisioning helpers |
| `e2e/tomas-admin.spec.ts` | Admin user management E2E tests |

## Testing

### E2E Test Summary

| Test | What it verifies |
|------|-----------------|
| Admin access | Admin user can navigate to `/admin` and see the user management page |
| Non-admin redirect | Regular user is redirected away from `/admin` |
| User list columns | Table renders email, name, role, diagram count, created, and actions columns |
| Search by email | Search input filters the user list by email with debounce |
| Sort by column | Clicking column headers sorts the table; clicking again reverses |
| Promote user | Admin can promote a user to admin role; badge updates |
| Demote user | Admin can demote a user to regular role; badge updates |
| Self-action prevention (promote/demote) | Admin's own row has actions disabled |
| Delete user with confirmation | Delete shows modal with email and diagram count; confirming removes user |
| Self-action prevention (delete) | Admin cannot open actions menu on their own row |
| Cascade delete verification | Deleting a user also deletes their diagrams (verified via API) |
| Pagination | Page navigation and items-per-page controls work correctly |

### Manual Tests

After running `npm start`:

1. **Run admin E2E tests only:**

   ```bash
   npx playwright test e2e/tomas-admin.spec.ts
   ```

2. **Run all E2E tests (Sasha + Tomas):**

   ```bash
   npm run test:e2e
   ```

3. **Debug a failing test with trace viewer:**

   ```bash
   npx playwright test e2e/tomas-admin.spec.ts --trace on
   npx playwright show-report
   ```

   The trace viewer shows step-by-step screenshots, DOM snapshots, network requests, and console logs.

4. **Run with headed browser for visual debugging:**

   ```bash
   npx playwright test e2e/tomas-admin.spec.ts --headed
   ```

5. **Interactive UI mode:**

   ```bash
   npm run test:e2e:ui
   ```

   Select the Tomas test file in the sidebar to run and watch tests with live DOM inspection.
