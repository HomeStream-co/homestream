/**
 * airo-secrets-shim.ts
 *
 * Dev-environment shim for the #airo/secrets platform module.
 *
 * In production, #airo/secrets is provided by the platform runtime and
 * getSecret() reads from the encrypted secret store. In dev (Vite SSR
 * module runner), the module can't be resolved because the platform
 * runtime isn't present — so vite.config.ts aliases #airo/secrets to
 * this file, which reads from process.env instead.
 *
 * The platform injects all secrets as environment variables at runtime,
 * so process.env is the correct source in both dev and production.
 *
 * This file is ONLY used in the dev server. The production build
 * externalizes #airo/secrets so the real platform module is used.
 */

export function getSecret(name: string): string | undefined {
  return process.env[name] || undefined;
}
