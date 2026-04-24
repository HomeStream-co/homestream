/**
 * Test stub for the #airo/secrets module.
 *
 * The real module is a production runtime that reads secrets from the
 * Airo platform. In tests we just return empty strings so server handlers
 * that import getSecret() can be loaded without crashing.
 *
 * Individual tests that need specific secret values should vi.mock() the
 * relevant store (configStore, etc.) directly rather than relying on this stub.
 */
export function getSecret(name: string): string {
  // Return empty string for all secrets in test environment.
  // Tests that need specific values mock configStore instead.
  void name;
  return '';
}
