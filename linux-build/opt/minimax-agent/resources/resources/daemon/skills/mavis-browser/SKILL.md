---
name: mavis-browser
description: >-
  Drive the user's real Chrome browser (logged-in sites, persistent cookies, installed extensions) via `mavis browser tool` CLI.
  Default browser for normal browsing — public pages, SPAs, login-state pages, and any interactive flow.
  Lightweight read-only / pure-search tasks should still try `web_search` / `webfetch` first; reach for this skill when a JS-heavy SPA, anti-bot wall, or interactive action makes those insufficient.
  Do NOT load for development / testing / CI automation — use the playwright MCP for that.
requiresBeta: browserBridge
descriptions:
  zh-Hans: "驱动用户真实 Chrome 浏览器，适用于登录态网页、复杂 SPA、反爬页面和交互式浏览流程。"
---

# Mavis Browser

Operate a real Chrome browser instance — the user's actual profile with their cookies, logins,
extensions, and bookmarks — via the `mavis browser tool` CLI.

This skill is the **agent-facing** entry. Implementation/architecture details for daemon
maintainers live in the `browser-broker-guide` developer skill.

## When to load this skill

`mavis-browser` drives the user's **real Chrome instance** — their actual profile with cookies,
logins, saved passwords, extensions, bookmarks. It is the default browser for normal product
work: public pages, SPAs, login-state pages, interactive flows, anything the user might do
themselves. The playwright MCP, by contrast, spins up an isolated headless / fresh-profile
browser; that's the right tool for development / testing / CI automation, not for everyday
browsing.

| Use this skill | Use playwright MCP instead |
| --- | --- |
| Public pages, SPAs, JS-heavy sites | Development / unit-test fixtures |
| Pages requiring the user to be logged in | E2E / acceptance test scripts |
| Acting on user's email / dashboard / SaaS | CI automation / regression suites |
| Triggering installed extension features | Headless screenshot pipelines |
| Persistent browser state matters (cookies, OAuth) | One-shot stateless automation |
| Interactive flows the user would do themselves | Test rigs that need a fresh / isolated profile |

For lightweight read-only or pure-search tasks (e.g. "what does this Wikipedia page say?",
"summarize this blog post"), prefer `web_search` / `webfetch` first — they are cheaper and
faster. Fall back to `mavis-browser` when the page is a JS-heavy SPA, behind an anti-bot
wall, or the user clearly wants you to act on their actual session. This **fail-fast
fallback** keeps the cheap path in play without giving up on real browsing when it matters.

If the user mentioned their browser, account, "my Chrome", "登录态", or named a specific SaaS
they're already logged into — you want this skill.

## Prerequisites the user has set up

Verify with `mavis browser status` before invoking tools (one-time per session is enough):

1. The Mavis daemon is running (it owns the broker socket)
2. The Chrome extension `Mavis Browser Bridge` is loaded (chrome://extensions, `Load unpacked`)
3. Native messaging manifest is installed for the current profile (`mavis browser install` did this)
4. The Chrome extension is connected to the daemon broker (popup shows green dot)

If `status` shows broker not connected → tell the user `mavis browser install` is needed first.
If extension shows red dot in popup → user must reload the extension.

Do NOT try to install or guide the user through install steps interactively unless they ask.

## Calling pattern — always single-tool, JSON-in JSON-out

```bash
mavis browser tool <tool_name> '<json-args>'
```

- stdout: response JSON on success (exit 0)
- stderr: error JSON on failure (exit 1)
- Timeout: 30s per call (broker default)
- Most tools run against the user's currently focused tab unless `tabId` is passed. Screenshot is
  special: it is backed by Chrome `captureVisibleTab` and captures the currently visible active
  tab/window; activate the target tab before screenshots.
- First successful call auto-claims a tab to your session

**Tool names are bare** (no `browser_` prefix) — they map 1-to-1 to the Chrome extension's
internal dispatch table. **Always parse stdout as JSON.** Do not eyeball the output or assume
shape — read fields.

## The 21 tools

> Tab management ops `status`, `list_claims`, `claim_tab`, `release_tab` are not "tools" — they
> live as separate broker ops, used via `mavis browser status` etc. The list below is the set
> the Chrome extension actually executes.

### Tab management (no tab needed)

| Tool | Args | Purpose |
| --- | --- | --- |
| `get_active_tab` | `{}` | Returns the currently-active tab's `{tabId, url, title}` |
| `get_tabs` | `{}` | List every open tab across all browser windows |
| `open_tab` | `{url?, active?}` | Open new tab in the background by default (`active:false`); pass `active:true` only when the user explicitly wants focus |

### Tab management (needs a claimed tab)

| Tool | Args | Purpose |
| --- | --- | --- |
| `close_tab` | `{tabId}` | Close the tab and release the claim |
| `navigate` | `{tabId?, url}` | Navigate the (default or explicit) tab to a URL |

### Page interaction

| Tool | Args | Purpose |
| --- | --- | --- |
| `click` | `{tabId?, selector, index?, timeoutMs?, pollMs?}` | Click an element by selector |
| `type` | `{tabId?, selector, text, clear?, index?, timeoutMs?, pollMs?}` | Type into an input/textarea/contenteditable |
| `select` | `{tabId?, selector, value? \| label? \| optionIndex?}` | Pick a `<select>` option |
| `scroll` | `{tabId?, selector?, x?, y?, timeoutMs?, pollMs?}` | Scroll the page or an element by an offset |
| `wait` | `{ms, tabId?}` | Sleep for `ms` (does nothing else; use `query` with `timeoutMs` for element-wait) |
| `press_key` | `{tabId?, key, modifiers?, selector?, timeoutMs?, pollMs?}` | Dispatch a single keyboard `key` (e.g. `Enter`, `Backspace`, `Escape`, `ArrowDown`, single chars like `X`) optionally with `modifiers: ["Ctrl"\|"Shift"\|"Cmd"\|"Alt"\|"Meta"]`; if `selector` is given, focuses that element first. For text-mutating keys (single chars / `Backspace` / `Enter` in textareas) the value is mutated via React-safe native setter so controlled inputs stay in sync |

### Reading

| Tool | Args | Purpose |
| --- | --- | --- |
| `query` | `{tabId?, selector?, mode: "text"\|"value"\|"attribute"\|"property"\|"html"\|"list"\|"exists"\|"page_text", attribute?, property?, limit?, timeoutMs?, pollMs?, pattern?, flags?}` | Extract data from the page |
| `screenshot` | `{tabId?}` | Returns screenshot content for the currently visible active tab/window (often a `data:image/png;base64,...` data URL, not raw base64); **prefer this for "show me" requests after activating the target tab** |
| `snapshot` | `{tabId?}` | Accessibility-tree snapshot (structured DOM); **prefer this for "find element to click" before issuing clicks** |

### Files / downloads

| Tool | Args | Purpose |
| --- | --- | --- |
| `download` | `{url? \| selector?, filename?, conflictAction?, saveAs?, wait?, downloadTimeoutMs?, tabId?}` | Trigger a download via Chrome downloads API; returns `{downloadId, item}` |
| `list_downloads` | `{limit?, state?}` | List recent downloads with state and local paths |
| `set_file_input` | `{tabId?, selector, files: [{name, mimeType, base64}, …]}` | Set value of `<input type=file>` |

### Debug / introspection

| Tool | Args | Purpose |
| --- | --- | --- |
| `highlight` | `{tabId?, selector, duration?, color?, showInfo?}` | Visually outline an element (debugging aid) |
| `console` | `{tabId?, clear?, filter?}` | Recent console log entries (requires debugger permission) |
| `errors` | `{tabId?, clear?}` | Page error / exception messages (requires debugger permission) |

### Network observation

| Tool | Args | Purpose |
| --- | --- | --- |
| `network_requests` | `{tabId?, method?, statusCodeRegex?, urlRegex?, clear?}` | List recent HTTP requests captured for the tab. Per-tab ring buffer (max 200; older entries dropped, response includes `truncated:true` and `bufferSize`). Each entry: `{id, url, method, statusCode, type, timestamp, completedAt, durationMs, error}`. `statusCode: 0` indicates a network error before any HTTP response (see the `error` field for the cause, e.g. `net::ERR_NAME_NOT_RESOLVED`). Filters: exact `method`, RegExp on `statusCodeRegex` (e.g. `^2\\d\\d$`), RegExp on `urlRegex`. `clear:true` returns the current snapshot **then** empties the buffer. Returns `{error}` (no throw) on bad regex / tab gone. Passive — uses `chrome.webRequest`, **no response body**; if you need bodies, intercept yourself with a real DevTools session |

## Common patterns

### Pattern: open page → wait → read → activate → screenshot

```bash
TAB=$(mavis browser tool open_tab '{"url":"https://gmail.com","active":true}' | jq -r '.tabId')
mavis browser tool query '{"tabId":'$TAB',"selector":"div[role=main]","mode":"exists","timeoutMs":10000}'
mavis browser tool query '{"tabId":'$TAB',"selector":".unread-count","mode":"text"}'
mavis browser tool screenshot '{"tabId":'$TAB'}' \
  | jq -r '.content | sub("^data:image/png;base64,"; "")' \
  | base64 -d > inbox.png
```

If you opened the page with `active:false`, activate or focus it before calling `screenshot`; the
screenshot result is whatever Chrome currently shows, not necessarily the background tab you pass.

### Pattern: snapshot → click via accessibility role

`snapshot` returns a structured DOM tree with roles/names. Use it to find the right
selector before clicking — much more reliable than guessing CSS:

```bash
mavis browser tool snapshot '{}' | jq '.content | fromjson | .nodes[] | select(.role=="button" and (.name|contains("Compose")))'
# → returns a `selector` you can hand to `click`
```

### Pattern: form fill with saved password manager

Real Chrome will autofill — just focus + click submit:

```bash
mavis browser tool navigate '{"url":"https://app.example.com/login"}'
mavis browser tool click '{"selector":"input[name=email]"}'    # triggers autofill prompt
mavis browser tool wait  '{"ms":500}'
mavis browser tool click '{"selector":"button[type=submit]"}'
```

### Pattern: handle multi-profile

Each Mavis daemon profile (e.g. `default`, `dev` worktree) has its own broker socket and its own
native host name (`com.mavis.browser_<profile>`). The Chrome extension can connect to multiple
profiles simultaneously — popup shows the list. Tools you call from a worktree daemon route to
that worktree's broker; main daemon's tabs are isolated. No cross-profile leakage.

To check which profile you're operating in: `mavis browser status` shows current profile.

## Tab claim semantics — important

- Calling any tool on an unclaimed tab auto-claims it for the current session
- Claim survives tab activity but releases on:
  - Explicit `release_tab` op (`mavis browser release …`) or `close_tab` tool
  - Worker session ending (auto-release)
  - **Root session ending → claim moves to "detached"** (NOT released; next root session can adopt)
- Two agents/sessions can NOT operate the same tab simultaneously — pass `force: true` when claiming
- Use `mavis browser status` to see what's claimed by whom

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Broker socket not found` | Daemon not running | `mavis start` |
| `Chrome extension is not connected` | Extension not loaded or disconnected | Open chrome://extensions, ensure `Mavis Browser Bridge` is enabled; popup → Reconnect |
| `Tab N is owned by another session` | Another agent owns the tab | Claim with `force: true`, or use a different tab |
| `Tab not found` | Tab was closed or `tabId` is stale | Use `get_tabs` to refresh, then re-claim |
| Screenshot shows the wrong page | Screenshot captures Chrome's currently active visible tab/window (`captureVisibleTab`) | Open/activate the target tab before screenshot; do not rely on a background `tabId` |
| `base64 -d` fails on screenshot output | Screenshot content may be a data URL | Strip the `data:image/png;base64,` prefix before decoding |
| Tool times out (30s) | Page navigation slow / element never appears | Add `wait` before, or pass `timeoutMs` to `query` |
| Auto-fill doesn't trigger | Chrome only autofills after user interaction in real Chrome | Use `click` on the field instead of `type` |
| `Permission denied` from native host | Extension manifest mismatched native host name | `mavis browser uninstall` then `mavis browser install` |

## Shortcut commands

```bash
mavis browser status         # broker state + connected hosts + claims
mavis browser tools          # list all 21 tools (also fallback when broker down)
mavis browser install        # one-time setup per profile (writes native messaging manifest)
mavis browser uninstall      # remove native messaging manifest for current profile
```

## What NOT to do

- ❌ Do not prefix tool names with `browser_` — that's the CLI command, not the tool name
- ❌ Do not assume the browser is ready — always `mavis browser status` first if you haven't checked this session
- ❌ Do not loop-poll without `wait` or `query` `timeoutMs` — wastes broker calls
- ❌ Do not call `release_tab` aggressively in root sessions — `detached` semantics keep state for the next root session
- ❌ Do not open foreground tabs unless the user explicitly asks — default to `open_tab {"active":false}` so you do not steal the user's current browser focus
- ❌ Do not try to install the extension yourself — it's a one-time user action via `mavis browser install` + chrome://extensions
