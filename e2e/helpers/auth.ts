import { signDevJwt } from "@adrianhall/cloudflare-auth";
import type { Browser, BrowserContext } from "@playwright/test";

/**
 * The Cloudflare Access JWT header name.
 *
 * Both `developerAuthentication` (dev) and `cloudflareAccess` (production)
 * middleware read this header to validate the user's identity. Setting it on
 * every request in the browser context simulates a logged-in Cloudflare Access
 * session without requiring a real Access deployment.
 */
const JWT_HEADER = "CF-Access-Jwt-Assertion";

/**
 * Creates a Playwright `BrowserContext` where every request carries a signed
 * development JWT for the given email address.
 *
 * Uses `signDevJwt` from `@adrianhall/cloudflare-auth` to mint a token that
 * the Worker's `cloudflareAccess` middleware accepts in development mode. The
 * token is injected via `extraHTTPHeaders` so all pages and API calls within
 * the context are automatically authenticated.
 *
 * @param browser - The Playwright `Browser` instance (provided by the test
 *   fixture as `{ browser }`).
 * @param email - The email address to embed in the JWT `email` claim. This
 *   becomes the authenticated user's identity in the Worker.
 * @returns A `Promise` resolving to an authenticated `BrowserContext`.
 *
 * @example
 * ```ts
 * test("dashboard loads", async ({ browser }) => {
 *   const context = await createAuthenticatedContext(browser, "sasha@example.com");
 *   const page = await context.newPage();
 *   await page.goto("/");
 *   await context.close();
 * });
 * ```
 */
export async function createAuthenticatedContext(browser: Browser, email: string): Promise<BrowserContext> {
	// signDevJwt signature: (email: string, options?) => Promise<string>
	const token = await signDevJwt(email);

	return browser.newContext({
		extraHTTPHeaders: {
			[JWT_HEADER]: token,
		},
	});
}

/**
 * Creates an unauthenticated Playwright `BrowserContext` with no auth headers.
 *
 * Requests from this context do not carry any Cloudflare Access JWT header or
 * cookie, so the Worker's `developerAuthentication` middleware redirects them
 * to the dev login form at `/_auth/login`.
 *
 * Use this to test that protected routes correctly reject unauthenticated
 * access and redirect to the login page.
 *
 * @param browser - The Playwright `Browser` instance.
 * @returns A `Promise` resolving to a plain (unauthenticated) `BrowserContext`.
 *
 * @example
 * ```ts
 * test("unauthenticated redirects", async ({ browser }) => {
 *   const context = await createUnauthenticatedContext(browser);
 *   const page = await context.newPage();
 *   await page.goto("/");
 *   await expect(page).toHaveURL(/_auth\/login/);
 *   await context.close();
 * });
 * ```
 */
export async function createUnauthenticatedContext(browser: Browser): Promise<BrowserContext> {
	return browser.newContext();
}
