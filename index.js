/**
 * Register a SearXNG-backed provider in `ctx.web` as `searxng`.
 *
 * This plugin adds no tool: `web_search` already exists in `@deepseek-ai/dsh-tool-web`
 * and simply needs a provider it can use. Selecting this one is a config change on
 * the `web` row (`searchProvider: searxng`), not a code change.
 *
 * @module dsh-web-search-searxng
 */

import {
  SearxngSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_DEFAULT_TIMEOUT_MS,
  SEARXNG_PROVIDER_ID,
} from './provider.js'

export {
  SearxngSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_DEFAULT_TIMEOUT_MS,
  SEARXNG_PROVIDER_ID,
} from './provider.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-searxng'

/** The web seam this provider registers into. */
export const inject = ['web']

/**
 * Register the provider. All values are optional and defaulted here rather than
 * in a schemastery `Config`: this package is intentionally dependency-free.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [config]
 * @param {string} [config.baseURL] - SearXNG origin; defaults to http://127.0.0.1:8888.
 * @param {string} [config.language] - forwarded as SearXNG's `language`.
 * @param {number} [config.safesearch] - 0 / 1 / 2.
 * @param {number} [config.timeoutMs] - per-request budget.
 */
export function apply(ctx, config = {}) {
  ctx.web.registerSearchProvider(new SearxngSearchProvider({
    baseURL: config.baseURL ?? SEARXNG_DEFAULT_BASE_URL,
    language: config.language,
    safesearch: config.safesearch,
    timeoutMs: config.timeoutMs ?? SEARXNG_DEFAULT_TIMEOUT_MS,
  }))
}
