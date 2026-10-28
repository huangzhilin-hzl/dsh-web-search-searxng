# dsh-web-search-searxng

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [SearXNG](https://docs.searxng.org/)-backed `WebSearchProvider` for the DeepSeek Harness web
capability seam (`ctx.web`).

It registers a provider with the id `searxng` and adds no tool of its own: `web_search` is already
registered by `@deepseek-ai/dsh-tool-web`, and this package only gives it a backend that needs no
third-party API key.

## Why this exists

The default provider (`deepseek-official`) authenticates in one of two ways:

1. a DeepSeek **account sign-in**, used only when the session's model request is served by the
   `deepseek-account` provider route;
2. a `DEEPSEEK_API_KEY`.

When models are served through a self-hosted OpenAI-compatible gateway, (1) never applies and (2)
may not be configured, so every search fails with `WEB_PROVIDER_CREDENTIAL_MISSING`. Pointing the
same `web_search` tool at a local SearXNG instance removes that dependency entirely.

## Requirements

- A running SearXNG instance with the **JSON output format enabled** — it is off by default:

  ```yaml
  search:
    formats:
      - html
      - json
  ```

- Node's built-in `fetch` (Node.js >= 18). No runtime dependencies.

## Install

Inside the profile you want the provider in:

```bash
dsh plugin --profile web add link:/path/to/dsh-web-search-searxng
```

Then add two entries to that profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: web-search-searxng
      name: dsh-web-search-searxng
      config:
        baseURL: http://127.0.0.1:8888
        timeoutMs: 20000

# Select it. Profile patches replace a row's config rather than deep-merging,
# so restate every key the row needs.
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: searxng
    fetchProvider: http
```

## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `baseURL` | `http://127.0.0.1:8888` | SearXNG origin; a trailing slash is tolerated |
| `language` | — | Forwarded as SearXNG's `language` (e.g. `zh-CN`); omit for the default `all` |
| `safesearch` | `0` | `0` off, `1` moderate, `2` strict |
| `timeoutMs` | `20000` | Per-request budget |

## Failure behaviour

| Situation | Result |
| --- | --- |
| Instance unreachable | Throws with the origin and a `docker ps` / `colima start` hint |
| Non-2xx response | Throws with the status code and origin |
| `200` with zero results **and** failing engines | Throws, including `unresponsive_engines` |
| `200` with zero results and no engine errors | Returns an empty `sources` array — a genuine miss |

The third row is deliberate. SearXNG reports "no matching results" and "every engine failed" with
the same `200`/empty payload, so a passthrough makes a broken deployment look like a quiet miss.

## Example instance

`examples/searxng/` contains a minimal `docker-compose.yml` and `settings.yml` (JSON enabled,
limiter off). Copy them, set a `secret_key`, adjust the outbound proxy if your network needs one,
then `docker compose up -d`.

## Uninstall

Remove the `insert` entry and point `web.searchProvider` back at the provider you want. The package
can stay installed; nothing else references it.

## License

[MIT](LICENSE)
