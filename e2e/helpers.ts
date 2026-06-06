/**
 * e2e/helpers.ts
 *
 * Shared utilities for HomeStream E2E tests.
 *
 * Key helpers:
 *   - login()           — authenticate via the login gate
 *   - logout()          — sign out via header menu
 *   - skipSetupIfNeeded() — bypass setup wizard if already complete
 *   - waitForApp()      — wait for the React app to be ready
 *   - selectProfile()   — pick a profile from the "Who's watching?" screen
 */

import { type Page, expect } from '@playwright/test';

/**
 * Default test credentials — matches ADMIN_PASSWORD env var in dev.
 *
 * IMPORTANT: use `|| 'homestream'` not `?? 'homestream'`.
 * In CI, e2e.yml sets E2E_PASSWORD to '' (empty string) when the secret
 * is not configured. `??` only catches null/undefined — it would leave
 * TEST_PASSWORD as '' and break any test that tries to submit a password.
 * `||` catches the empty-string case and falls back to 'homestream'.
 */
export const TEST_PASSWORD = process.env.E2E_PASSWORD || 'homestream';

/**
 * Wait for the React app shell to be mounted and auth check to resolve.
 *
 * The AuthGate renders `null` while `authenticated === null` (checking).
 * We must wait for it to resolve before asserting anything — otherwise all
 * tests fail because the DOM is blank.
 *
 * Strategy: wait for ANY of the known post-auth-check selectors to appear:
 *   - [data-testid="login-gate"]  → password required, not yet logged in
 *   - [data-testid="app-ready"]   → app is ready (authenticated)
 *   - nav                         → header nav (authenticated)
 *   - main                        → main content area (authenticated)
 *   - h1                          → any page heading (authenticated)
 *   - input[type="password"]      → login gate without testid
 *   - [data-setup-wizard]         → setup wizard is showing
 *
 * Falls back gracefully — if none appear within 12s, we continue anyway
 * so individual tests can make their own assertions.
 */
export async function waitForApp(page: Page) {
  // Step 1: wait for #root to be in the DOM
  await page.waitForSelector('#root', { state: 'attached', timeout: 8_000 }).catch(() => {});

  // Step 2: wait for auth check to resolve — any meaningful content
  const POST_AUTH_SELECTORS = [
    '[data-testid="login-gate"]',
    '[data-testid="app-ready"]',
    'nav',
    'main',
    'h1',
    'input[type="password"]',
    '[data-setup-wizard]',
    'header',
  ].join(', ');

  await page.waitForSelector(POST_AUTH_SELECTORS, {
    state: 'visible',
    timeout: 6_000,
  }).catch(() => {
    // Timed out — app may be in an unexpected state; let the test assert
  });

  // Step 3: tiny tick for React state to fully settle after selector appears
  await page.waitForTimeout(100);
}

/**
 * Navigate to the app root and handle the setup wizard or login gate
 * automatically so tests can start from a known authenticated state.
 */
export async function login(page: Page, password = TEST_PASSWORD) {
  await page.goto('/');
  await waitForApp(page);

  // If setup wizard is showing, skip it
  await skipSetupIfNeeded(page);

  // If login gate is showing, authenticate
  const passwordInput = page.locator('input[type="password"]').first();
  if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await passwordInput.fill(password);
    await page.keyboard.press('Enter');
    // Wait for login to complete — either home page or profile selector
    await page.waitForURL(url => !url.pathname.includes('/setup'), { timeout: 8_000 });
    await waitForApp(page);
  }

  // If profile selector is showing, pick the first profile
  await selectFirstProfileIfNeeded(page);
}

/**
 * If the setup wizard is visible, click through it or navigate away.
 * In test environments, setup should already be marked complete via env var.
 */
export async function skipSetupIfNeeded(page: Page) {
  const url = page.url();
  if (url.includes('/setup')) {
    // Navigate directly to home — setup complete flag should be set in test env
    await page.goto('/');
    await waitForApp(page);
  }
}

/**
 * If the "Who's watching?" profile selector is showing, click the first profile.
 */
export async function selectFirstProfileIfNeeded(page: Page) {
  // Look for the profiles page heading
  const heading = page.getByText("Who's watching?");
  if (await heading.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Click the first profile avatar/button
    const firstProfile = page.locator('[data-testid="profile-card"]').first();
    if (await firstProfile.isVisible({ timeout: 1000 }).catch(() => false)) {
      await firstProfile.click();
    } else {
      // Fallback: click any button that isn't "Add Profile"
      const profileBtn = page.locator('button').filter({ hasNotText: 'Add Profile' }).first();
      await profileBtn.click({ timeout: 3000 }).catch(() => {});
    }
    await waitForApp(page);
  }
}

/**
 * Navigate to a page and wait for it to be ready.
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await waitForApp(page);
}

/**
 * Assert that the current URL matches the expected path.
 */
export async function assertOnPage(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/') + '.*'));
}

/**
 * Wait for a toast notification to appear (Sonner toasts).
 */
export async function waitForToast(page: Page, textOrPattern?: string | RegExp) {
  const toastSelector = '[data-sonner-toast]';
  await page.waitForSelector(toastSelector, { timeout: 8_000 });
  if (textOrPattern) {
    const toast = page.locator(toastSelector).filter({ hasText: textOrPattern });
    await expect(toast.first()).toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Check if the app is in an authenticated state by looking for nav elements
 * that only appear when logged in.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  // The header nav only renders when authenticated
  const nav = page.locator('nav, header').first();
  return nav.isVisible({ timeout: 2000 }).catch(() => false);
}
