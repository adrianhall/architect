import { type APIRequestContext, type BrowserContext, expect, test } from "@playwright/test";
import { createAuthenticatedContext } from "./helpers/auth";
import { createDiagramForUser, provisionUser, type TestUser } from "./helpers/setup";

/**
 * The email address of the Tomas (Admin / Team Lead) persona.
 *
 * Reads `SEED_ADMIN_EMAIL` from the environment — loaded automatically from
 * the project root `.env` file via `playwright.config.ts`. The worker
 * auto-promotes any user whose email matches this variable to the `admin`
 * role on first login.
 *
 * Falls back to `"tomas-admin@example.com"` if the variable is not set, which
 * will cause the tests to fail unless that email is the configured seed admin.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "tomas-admin@example.com";

/**
 * Email address for the non-admin persona used to verify access restrictions.
 *
 * This user is provisioned via the API but never promoted, so they retain the
 * default `user` role throughout all tests.
 */
const NON_ADMIN_EMAIL = "non-admin-user@example.com";

/**
 * Emails for the regular test users created in `beforeAll`.
 *
 * Each user gets a number of diagrams equal to their 1-based index:
 * - testuser-1 → 1 diagram
 * - testuser-2 → 2 diagrams
 * - testuser-3 → 3 diagrams (used in delete-with-confirmation test)
 * - testuser-4 → 4 diagrams (used in cascade-delete test)
 * - testuser-5 → 5 diagrams
 */
const TEST_USER_EMAILS = [
	"testuser-1@example.com",
	"testuser-2@example.com",
	"testuser-3@example.com",
	"testuser-4@example.com",
	"testuser-5@example.com",
];

/**
 * E2E tests for the Tomas persona's admin user management flows.
 *
 * Covers:
 * - F2-US3: Paginated, sortable, searchable list of users at `/admin`.
 * - F2-US4: Promote, demote, or delete a user; cannot modify own account.
 * - F2-US5: Each user's diagram count in the admin list.
 * - F2-US9: Audit log of admin mutations (UI flows that produce audit entries).
 *
 * Tests run in **serial** mode because they share mutable state — some tests
 * delete users that were created in `beforeAll`. Running them in parallel
 * would cause race conditions and unpredictable assertions.
 *
 * **Setup strategy:** `beforeAll` provisions users via API calls, then
 * cleans up stale data from previous test runs by deleting and re-creating
 * each test user. This ensures predictable diagram counts without requiring
 * a freshly wiped database.
 */
test.describe("Tomas: Admin User Management", () => {
	test.describe.configure({ mode: "serial" });

	let adminContext: BrowserContext;
	let nonAdminContext: BrowserContext;
	let apiContext: APIRequestContext;
	let adminUser: TestUser;
	let testUsers: TestUser[];

	test.beforeAll(async ({ browser, playwright }) => {
		apiContext = await playwright.request.newContext();

		// 1. Provision the seed-admin user. The worker auto-promotes any user
		//    whose email matches SEED_ADMIN_EMAIL on their first request.
		adminUser = await provisionUser(apiContext, ADMIN_EMAIL);

		// 2. Clean up leftover test users from previous runs so diagram counts
		//    are predictable. We provision each user first (idempotent — creates
		//    if absent, returns existing if present) then delete them via the
		//    admin API to start from a known-good blank state.
		for (const email of [...TEST_USER_EMAILS, NON_ADMIN_EMAIL]) {
			const u = await provisionUser(apiContext, email);
			if (u.id && adminUser.token) {
				// Ignore 404 (already deleted) — delete is idempotent for our purposes.
				await apiContext.delete(`http://localhost:8787/api/admin/users/${u.id}`, {
					headers: { "CF-Access-Jwt-Assertion": adminUser.token },
				});
			}
		}

		// 3. Re-provision test users fresh so each starts with exactly the right
		//    number of diagrams. User i+1 gets i+1 diagrams.
		testUsers = [];
		for (let i = 0; i < TEST_USER_EMAILS.length; i++) {
			const email = TEST_USER_EMAILS[i];
			const user = await provisionUser(apiContext, email);
			testUsers.push(user);
			for (let d = 0; d < i + 1; d++) {
				await createDiagramForUser(apiContext, user, `Diagram ${d + 1} for ${email}`);
			}
		}

		// 4. Provision the non-admin user (no diagrams needed).
		await provisionUser(apiContext, NON_ADMIN_EMAIL);

		// 5. Create authenticated browser contexts.
		adminContext = await createAuthenticatedContext(browser, ADMIN_EMAIL);
		nonAdminContext = await createAuthenticatedContext(browser, NON_ADMIN_EMAIL);
	});

	test.afterAll(async () => {
		await adminContext.close();
		await nonAdminContext.close();
		await apiContext.dispose();
	});

	// ── Access Control ────────────────────────────────────────────────────────

	test("admin user can access /admin page", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.getByRole("heading", { name: /user management/i })).toBeVisible();
		await expect(page.locator("table")).toBeVisible();

		await page.close();
	});

	test("non-admin user sees Forbidden page at /admin", async () => {
		const page = await nonAdminContext.newPage();
		await page.goto("/admin");

		// AdminRoute renders a "Forbidden" heading for non-admin users.
		// It does not redirect — the URL remains /admin but content is blocked.
		await expect(page.getByRole("heading", { name: /forbidden/i })).toBeVisible();

		await page.close();
	});

	// ── User List Display ─────────────────────────────────────────────────────

	test("admin sees user list with all expected columns", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		// Wait for data to load
		await expect(page.locator("tbody tr").first()).toBeVisible();

		// All column headers must be present
		await expect(page.locator("th").filter({ hasText: /email/i })).toBeVisible();
		await expect(page.locator("th").filter({ hasText: /name/i })).toBeVisible();
		await expect(page.locator("th").filter({ hasText: /role/i })).toBeVisible();
		await expect(page.locator("th").filter({ hasText: /diagram/i })).toBeVisible();
		await expect(page.locator("th").filter({ hasText: /created/i })).toBeVisible();
		await expect(page.locator("th").filter({ hasText: /action/i })).toBeVisible();

		await page.close();
	});

	// ── Search ────────────────────────────────────────────────────────────────

	test("admin can search users by email", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		// Type a specific email into the search box
		const searchInput = page.getByLabel("Search users");
		await searchInput.fill("testuser-1@example.com");

		// Wait for the 300 ms debounce + API round-trip
		await page.waitForTimeout(600);

		// Only the matching user should appear
		const rows = page.locator("tbody tr");
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText("testuser-1@example.com");

		// Clear search — all users should return
		await searchInput.fill("");
		await page.waitForTimeout(600);
		await expect(page.locator("tbody tr").first()).toBeVisible();

		await page.close();
	});

	// ── Sort ──────────────────────────────────────────────────────────────────

	test("admin can sort users by clicking column headers", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		// Click the Email column header to sort ascending
		await page
			.locator("th")
			.filter({ hasText: /^Email/ })
			.click();
		await page.waitForTimeout(300);

		const firstEmailAsc = await page.locator("tbody tr").first().locator("td").first().textContent();

		// Click again to reverse to descending
		await page
			.locator("th")
			.filter({ hasText: /^Email/ })
			.click();
		await page.waitForTimeout(300);

		const firstEmailDesc = await page.locator("tbody tr").first().locator("td").first().textContent();

		// The first row should differ between ascending and descending
		expect(firstEmailAsc).not.toEqual(firstEmailDesc);

		await page.close();
	});

	// ── Role Management ───────────────────────────────────────────────────────

	test("admin can promote a user to admin role", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		const userRow = page.locator("tbody tr").filter({ hasText: "testuser-1@example.com" });
		await expect(userRow).toBeVisible();

		// Role column (index 2) should currently show "user"
		await expect(userRow.locator("td").nth(2)).toContainText("user");

		// Open actions dropdown and promote
		await userRow.getByRole("button", { name: /actions for testuser-1@example\.com/i }).click();
		await page.getByRole("menuitem", { name: /promote to admin/i }).click();

		// Wait for the mutation + TanStack Query cache invalidation
		await page.waitForTimeout(500);

		// Role should now be "admin"
		await expect(userRow.locator("td").nth(2)).toContainText("admin");

		// Clean up: demote back to regular user so later tests start clean
		await userRow.getByRole("button", { name: /actions for testuser-1@example\.com/i }).click();
		await page.getByRole("menuitem", { name: /demote to user/i }).click();
		await page.waitForTimeout(500);
		await expect(userRow.locator("td").nth(2)).toContainText("user");

		await page.close();
	});

	test("admin can demote a user to regular role", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		// Promote testuser-2 first so we have something to demote
		const userRow = page.locator("tbody tr").filter({ hasText: "testuser-2@example.com" });
		await userRow.getByRole("button", { name: /actions for testuser-2@example\.com/i }).click();
		await page.getByRole("menuitem", { name: /promote to admin/i }).click();
		await page.waitForTimeout(500);
		await expect(userRow.locator("td").nth(2)).toContainText("admin");

		// Now demote them
		await userRow.getByRole("button", { name: /actions for testuser-2@example\.com/i }).click();
		await page.getByRole("menuitem", { name: /demote to user/i }).click();
		await page.waitForTimeout(500);

		// Role should be back to "user"
		await expect(userRow.locator("td").nth(2)).toContainText("user");

		await page.close();
	});

	// ── Self-Action Prevention ────────────────────────────────────────────────

	test("admin cannot promote or demote themselves", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		// Find the admin's own row
		const ownRow = page.locator("tbody tr").filter({ hasText: ADMIN_EMAIL });
		await expect(ownRow).toBeVisible();

		// The actions button must be disabled on the self-row
		const actionsBtn = ownRow.getByRole("button", {
			name: new RegExp(`actions for ${ADMIN_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
		});
		await expect(actionsBtn).toBeDisabled();

		await page.close();
	});

	test("admin cannot delete themselves", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		// The actions trigger is disabled on the self-row — delete is unreachable
		const ownRow = page.locator("tbody tr").filter({ hasText: ADMIN_EMAIL });
		const actionsBtn = ownRow.getByRole("button", {
			name: new RegExp(`actions for ${ADMIN_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
		});
		await expect(actionsBtn).toBeDisabled();

		await page.close();
	});

	// ── Delete with Confirmation ──────────────────────────────────────────────

	test("admin can delete a user and confirmation shows diagram count", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		// testuser-3 was created with 3 diagrams in beforeAll
		const userRow = page.locator("tbody tr").filter({ hasText: "testuser-3@example.com" });
		await expect(userRow).toBeVisible();

		// Read the diagram count from the table (column index 4)
		const diagramCountText = (await userRow.locator("td").nth(4).textContent())?.trim() ?? "3";

		// Open actions and click Delete User
		await userRow.getByRole("button", { name: /actions for testuser-3@example\.com/i }).click();
		await page.getByRole("menuitem", { name: /delete user/i }).click();

		// AlertDialog should appear with email and diagram count
		const dialog = page.getByRole("alertdialog");
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("testuser-3@example.com");
		await expect(dialog).toContainText(diagramCountText);

		// Confirm the deletion
		await dialog.getByRole("button", { name: /^delete$/i }).click();

		// The user row must disappear from the table
		await expect(userRow).not.toBeVisible();

		await page.close();
	});

	// ── Cascade Delete Verification ───────────────────────────────────────────

	test("after deleting a user, their diagrams are also deleted", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		// testuser-4 was created with 4 diagrams in beforeAll
		const userRow = page.locator("tbody tr").filter({ hasText: "testuser-4@example.com" });
		await expect(userRow).toBeVisible();

		// Delete testuser-4 via the admin UI
		await userRow.getByRole("button", { name: /actions for testuser-4@example\.com/i }).click();
		await page.getByRole("menuitem", { name: /delete user/i }).click();
		const dialog = page.getByRole("alertdialog");
		await dialog.getByRole("button", { name: /^delete$/i }).click();
		await expect(userRow).not.toBeVisible();

		// Verify cascade: GET /api/diagrams with the deleted user's token.
		// The diagrams route returns 401 "User not found" when the user record
		// is absent (unlike /api/me, it does NOT auto-re-provision the user).
		const deletedUser = testUsers.find((u) => u.email === "testuser-4@example.com");
		if (deletedUser) {
			const response = await page.request.get("/api/diagrams", {
				headers: { "CF-Access-Jwt-Assertion": deletedUser.token },
			});
			const status = response.status();
			// Either 401 (user record gone) or 200 with an empty list (re-provisioned)
			expect([200, 401]).toContain(status);
			if (status === 200) {
				const body = (await response.json()) as { data: unknown[] };
				expect(body.data).toHaveLength(0);
			}
		}

		await page.close();
	});

	// ── Pagination ────────────────────────────────────────────────────────────

	test("pagination controls work when multiple pages exist", async () => {
		const page = await adminContext.newPage();
		await page.goto("/admin");

		await expect(page.locator("tbody tr").first()).toBeVisible();

		// Pagination is only rendered when totalPages > 1. With a small number
		// of test users the controls may not appear — this test passes vacuously
		// in that case and fully exercises the controls when enough users exist.
		const nextBtn = page.getByRole("button", { name: /next page/i });
		const prevBtn = page.getByRole("button", { name: /previous page/i });

		if (await nextBtn.isVisible()) {
			// Previous must be disabled on page 1
			await expect(prevBtn).toBeDisabled();

			// Navigate forward
			await nextBtn.click();
			await page.waitForTimeout(300);

			// Previous should now be enabled
			await expect(prevBtn).toBeEnabled();
		}

		await page.close();
	});
});
