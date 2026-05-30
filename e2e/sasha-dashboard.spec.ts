import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { createAuthenticatedContext } from "./helpers/auth";

/**
 * Email address used for the Sasha persona's dashboard tests.
 *
 * A unique email isolates this test suite's data from auth and canvas tests.
 * All diagrams created here belong to this user only.
 */
const TEST_EMAIL = "sasha-dashboard@example.com";

/**
 * E2E tests for the Sasha persona's dashboard flows.
 *
 * Tests run serially because they build on each other's state:
 * - The empty-state test assumes no prior diagrams for this email.
 * - Subsequent tests depend on a diagram created by the "create" test.
 *
 * Covers:
 * - F5-US1: Dashboard with diagrams — cards appear after creation.
 * - F5-US2: Create new blank diagram — navigates to editor.
 * - F5-US3: Duplicate diagram — copy gets "(Copy)" suffix.
 * - F5-US4: Delete diagram with confirmation modal.
 * - F5-US5: Rename diagram inline.
 */
test.describe("Sasha: Dashboard", () => {
	// Serial mode: each test depends on state left by the previous test.
	test.describe.configure({ mode: "serial" });

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
		await page.getByRole("button", { name: /new diagram/i }).click();
		await expect(page).toHaveURL(/\/editor\//);
	});

	test("diagram appears in dashboard card grid", async () => {
		await page.goto("/");
		// At least one diagram card should be visible after creating one
		await expect(page.locator("[data-testid='diagram-card']").first()).toBeVisible();
	});

	test("rename diagram via inline edit", async () => {
		await page.goto("/");
		const card = page.locator("[data-testid='diagram-card']").first();
		await expect(card).toBeVisible();

		// Open actions dropdown and click Rename
		await card.getByRole("button", { name: /diagram actions/i }).click();
		await page.getByRole("menuitem", { name: /rename/i }).click();

		// The rename input should now be visible inside the card
		const input = card.getByRole("textbox", { name: /rename diagram/i });
		await input.fill("My Renamed Diagram");
		await input.press("Enter");

		// Verify the new title is displayed on the card
		await expect(card.getByText("My Renamed Diagram")).toBeVisible();
	});

	test("duplicate diagram creates copy with (Copy) suffix", async () => {
		await page.goto("/");
		const card = page.locator("[data-testid='diagram-card']").first();
		await expect(card).toBeVisible();

		// Get original title from the card
		const originalTitle = await card.locator("[data-testid='diagram-title']").textContent();

		// Open actions dropdown and click Duplicate
		await card.getByRole("button", { name: /diagram actions/i }).click();
		await page.getByRole("menuitem", { name: /duplicate/i }).click();

		// Duplicate navigates to the new diagram's editor
		await expect(page).toHaveURL(/\/editor\//);

		// Navigate back to dashboard — should see the copy with "(Copy)" suffix
		await page.goto("/");
		await expect(page.getByText(`${originalTitle} (Copy)`)).toBeVisible();
	});

	test("delete diagram with confirmation modal removes card", async () => {
		await page.goto("/");
		const cards = page.locator("[data-testid='diagram-card']");
		// Wait for TanStack Query to fetch and render cards before counting —
		// page.goto() resolves on DOM load, but card rendering requires the API
		// response which arrives asynchronously after the initial render.
		await expect(cards.first()).toBeVisible();
		const initialCount = await cards.count();
		expect(initialCount).toBeGreaterThan(0);

		// Open actions dropdown on the last card and click Delete
		const card = cards.last();
		await card.getByRole("button", { name: /diagram actions/i }).click();
		await page.getByRole("menuitem", { name: /delete/i }).click();

		// The AlertDialog confirmation dialog should appear
		await expect(page.getByRole("alertdialog")).toBeVisible();
		// Click the destructive "Delete" button inside the dialog
		await page.getByRole("button", { name: /^delete$/i }).click();

		// Card count should decrease by one
		await expect(cards).toHaveCount(initialCount - 1);
	});
});
