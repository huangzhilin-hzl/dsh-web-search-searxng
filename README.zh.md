# dsh-web-search-searxng

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

给 DeepSeek Harness 的 web 能力接缝（`ctx.web`）接一个 **[SearXNG](https://docs.searxng.org/)** 后端。

它注册一个 id 为 `searxng` 的 provider，**不新增任何工具**：`web_search` 由
`@deepseek-ai/dsh-tool-web` 注册，本包只是给它一个不需要第三方 API key 的实现。

English: [README.md](README.md)

## 为什么需要它

默认 provider（`deepseek-official`）只有两条认证路径：

1. DeepSeek **账号登录**，仅当会话模型的请求由 `deepseek-account` 路由服务时生效；
2. `DEEPSEEK_API_KEY`。

当模型由自建的 OpenAI 兼容网关提供服务时，第 1 条不成立，第 2 条未必配置，于是每次搜索都会
以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败。把同一个 `web_search` 工具指向本机的 SearXNG 实例，
就彻底去掉这个依赖。

## 依赖

- 一个运行中的 SearXNG 实例，且**开启 JSON 输出格式**（默认不开启）：

  ```yaml
  search:
    formats:
      - html
      - json
  ```

- Node.js >= 18（使用内置 `fetch`）。无运行时依赖。

## 安装

在目标 profile 中执行：

```bash
dsh plugin --profile web add link:/path/to/dsh-web-search-searxng
```

然后在该 profile 的 `cordis.patch.yml` 中加两条：

```yaml
- insert:
    - id: web-search-searxng
      name: dsh-web-search-searxng
      config:
        baseURL: http://127.0.0.1:8888
        timeoutMs: 20000

# 选中它。profile 层的 patch 是整段替换 config 而非深合并，
# 因此这一行要把该行需要的键都写出来。
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: searxng
    fetchProvider: http
```

## 配置项

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `baseURL` | `http://127.0.0.1:8888` | SearXNG 地址，允许结尾斜杠 |
| `language` | — | 透传 SearXNG 的 `language`（如 `zh-CN`）；不传则用默认 `all` |
| `safesearch` | `0` | `0` 关 / `1` 中 / `2` 严 |
| `timeoutMs` | `20000` | 单次请求预算 |

## 失败行为

| 情况 | 结果 |
| --- | --- |
| 实例不可达 | 抛错，带 origin 与 `docker ps` / `colima start` 提示 |
| HTTP 非 2xx | 抛错，带状态码与 origin |
| `200` 但结果为空**且**引擎报错 | 抛错，附 `unresponsive_engines` |
| `200` 且结果为空、无引擎报错 | 返回空 `sources`，属于真的没匹配 |

第三条是刻意设计：SearXNG 对“没有匹配结果”和“所有引擎都失败”返回的是同样形状的
`200` + 空结果，直接透传会让部署故障看起来像一次安静的空搜索。

## 引擎选择与限流

SearXNG 是元搜索前端：绝大多数引擎默认关闭，而哪些能用取决于你的网络。**只配两个引擎是不够的。**
Brave 或 Google 一旦限流，SearXNG 会把该引擎挂起约 180 秒（CAPTCHA 挂得更久），此时如果没有
存活引擎，结果就是空的。

至少保留两个走不同上游的引擎，例如：

```yaml
engines:
  - name: yandex
    disabled: false
  - name: 360search
    disabled: false
```

别猜，直接测——下面这条会列出某次查询失败的引擎：

```bash
curl -sG http://127.0.0.1:8888/search \
  --data-urlencode 'q=test' --data 'format=json' | jq .unresponsive_engines
```

provider 会把“限流”和“部署坏了”区分开：当结果为空且失败引擎提到限流时，报错会说明 SearXNG 约
180 秒后重试该引擎，但**上游配额本身可能更久才恢复**，因此立刻重试通常还是会失败——需要隔一段时间
再搜，或补一个兜底引擎。

## 示例实例

`examples/searxng/` 下有一份最小可用的 `docker-compose.yml` 与 `settings.yml`（已开启 JSON、
关闭 limiter）。复制后自行设置 `secret_key`，如网络需要再调整出站代理，然后
`docker compose up -d`。

## 卸载

删掉 `insert` 那条，并把 `web.searchProvider` 指回你想用的 provider 即可。包可以留着不删，
没有其他地方引用它。

## 许可证

[MIT](LICENSE)
