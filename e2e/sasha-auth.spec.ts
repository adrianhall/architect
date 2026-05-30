import { expect, test } from "@playwright/test";
import { createAuthenticatedContext, createUnauthenticatedContext } from "./helpers/auth";

/**
 * Email address used for the Sasha (Solo Architect) persona in auth tests.
 *
 * A dedicated email is used so that auth tests are isolated from dashboard
 * and canvas tests; each persona email gets its own user record in the local
 * D1 database.
 */
const TEST_EMAIL = "sasha@example.com";

/**
 * E2E tests for the Sasha persona's authentication flows.
 *
 * Covers:
 * - F2-US1: Protected routes require authentication — unauthenticated access
 *   is redirected to the dev login page.
 * - F2-US6: User profile displayed in header — the authenticated user's email
 *   is shown in the app shell header after login.
 */
test.describe("Sasha: Authentication", () => {
	test("authenticated user sees dashboard", async ({ browser }) => {
		const context = await createAuthenticatedContext(browser, TEST_EMAIL);
		const page = await context.newPage();

		await page.goto("/");
		// Dashboard should be visible — look for the "Dashboard" heading
		await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

		await context.close();
	});

	test("user profile email is displayed in header", async ({ browser }) => {
		const context = await createAuthenticatedContext(browser, TEST_EMAIL);
		const page = await context.newPage();

		await page.goto("/");
		// The AppShell renders the signed-in user's email in the header
		await expect(page.getByText(TEST_EMAIL)).toBeVisible();

		await context.close();
	});

	test("unauthenticated access redirects to login", async ({ browser }) => {
		const context = await createUnauthenticatedContext(browser);
		const page = await context.newPage();

		await page.goto("/");
		// developerAuthentication middleware redirects to /_auth/login
		await expect(page).toHaveURL(/_auth\/login/);

		await context.close();
	});
});
