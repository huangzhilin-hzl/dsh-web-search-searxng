/**
 * SearXNG-backed `WebSearchProvider` for the DSH web capability seam (`ctx.web`).
 *
 * One plain HTTP GET per search: no auxiliary model request, no API key, no
 * third-party SaaS. Deliberately dependency-free — this package lives outside
 * the profile tree, so importing `@deepseek-ai/*` modules would not resolve.
 *
 * @module dsh-web-search-searxng/provider
 */

/** Stable id this provider registers under; `web.searchProvider` selects it. */
export const SEARXNG_PROVIDER_ID = 'searxng'

/** Default endpoint of a local SearXNG instance (`docker-compose up` in this repo). */
export const SEARXNG_DEFAULT_BASE_URL = 'http://127.0.0.1:8888'

/** Default per-request time budget; SearXNG aggregates several engines per query. */
export const SEARXNG_DEFAULT_TIMEOUT_MS = 20_000

/** Attribution header sent on every request. */
const USER_AGENT = 'dsh-web-search-searxng/0.1.0'

/**
 * @typedef {object} SearxngOptions
 * @property {string} baseURL - SearXNG origin, no trailing slash required.
 * @property {string} [language] - e.g. `zh-CN`; omitted lets SearXNG use its default (`all`).
 * @property {number} [safesearch] - 0 off / 1 moderate / 2 strict.
 * @property {number} [timeoutMs] - request budget when the caller passes no signal.
 */

/**
 * Search through one SearXNG instance.
 *
 * Failure policy: an HTTP error, an unparseable body, or a response whose
 * engines all failed throws with the engine list attached — the empty-but-200
 * case is exactly the failure mode that looks like "no results" to a caller.
 */
export class SearxngSearchProvider {
  /**
   * @param {SearxngOptions} options
   */
  constructor(options = {}) {
    /** @type {string} */
    this.id = SEARXNG_PROVIDER_ID
    this.baseURL = String(options.baseURL ?? SEARXNG_DEFAULT_BASE_URL).replace(/\/+$/u, '')
    this.language = options.language
    this.safesearch = options.safesearch ?? 0
    this.timeoutMs = options.timeoutMs ?? SEARXNG_DEFAULT_TIMEOUT_MS
  }

  /**
   * Cheap local check only — the seam documents that `available()` must not
   * make network calls, so a stopped container surfaces at search time.
   * @returns {boolean}
   */
  available() {
    return this.baseURL.length > 0
  }

  /**
   * Run one search.
   * @param {{ query: string, maxResults?: number }} request
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ content?: string, sources: Array<{url: string, title?: string, snippet?: string, publishedAt?: string}>, truncated: boolean }>}
   */
  async search(request, signal) {
    const url = new URL(`${this.baseURL}/search`)
    url.searchParams.set('q', request.query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('safesearch', String(this.safesearch))
    if (this.language !== undefined && this.language.length > 0) {
      url.searchParams.set('language', this.language)
    }

    const timeout = AbortSignal.timeout(this.timeoutMs)
    const composed = signal === undefined ? timeout : AbortSignal.any([signal, timeout])

    let response
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: composed,
      })
    } catch (error) {
      throw new Error(
        `SearXNG request failed (${url.origin}): ${String(error)}. `
        + 'If this is ECONNREFUSED, the container is down: '
        + '`docker ps --filter name=searxng` / `colima start`.',
        { cause: error },
      )
    }

    if (!response.ok) {
      throw new Error(`SearXNG returned HTTP ${response.status} for ${url.origin}/search`)
    }

    let payload
    try {
      payload = await response.json()
    } catch (error) {
      throw new Error(`SearXNG returned a non-JSON body (${url.origin})`, { cause: error })
    }

    const results = Array.isArray(payload?.results) ? payload.results : []
    /** @type {Array<{url: string, title?: string, snippet?: string, publishedAt?: string}>} */
    const sources = []
    const seen = new Set()
    for (const item of results) {
      if (typeof item?.url !== 'string' || item.url.length === 0 || seen.has(item.url)) continue
      seen.add(item.url)
      sources.push({
        url: item.url,
        ...typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {},
        ...typeof item.content === 'string' && item.content.length > 0 ? { snippet: item.content } : {},
        ...typeof item.publishedDate === 'string' && item.publishedDate.length > 0
          ? { publishedAt: item.publishedDate }
          : {},
      })
    }

    const unresponsive = Array.isArray(payload?.unresponsive_engines) ? payload.unresponsive_engines : []
    if (sources.length === 0 && unresponsive.length > 0) {
      // Rate limiting is the common case and it self-heals, though not always
      // quickly: SearXNG suspends a throttled engine for ~180s, while the
      // upstream quota itself can take considerably longer to reset.
      const throttled = unresponsive.some(([, reason]) =>
        /too many requests|suspend|rate.?limit/iu.test(String(reason)))
      throw new Error(
        `SearXNG returned no usable results; failing engines: ${JSON.stringify(unresponsive)}. `
        + (throttled
          ? 'Upstream engines are rate-limited. SearXNG retries them after a ~180s cooldown, but the '
            + 'upstream quota can take much longer to reset, so an immediate retry usually fails again. '
            + 'Search again later, or keep several independent engines enabled so one throttled '
            + 'upstream cannot empty the result set.'
          : 'Check `docker logs --tail 40 searxng` and the engine whitelist in settings.yml.'),
      )
    }

    const answers = Array.isArray(payload?.answers)
      ? payload.answers.filter(answer => typeof answer === 'string' && answer.length > 0)
      : []
    const answer = answers.length > 0 ? answers.join('\n') : undefined

    // `truncated` is the seam's own bookkeeping: it trims `sources` to the
    // request's maxResults, so the provider reports what it produced.
    return {
      ...answer === undefined ? {} : { content: answer },
      sources,
      truncated: false,
    }
  }
}
