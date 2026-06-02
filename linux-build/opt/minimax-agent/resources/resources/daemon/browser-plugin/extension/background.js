/**
 * Mavis Browser Bridge — Multi-profile background service worker.
 *
 * Vendored from opencode-browser (MIT), modified for Mavis multi-profile support.
 *
 * Changes from upstream:
 * 1. Multi-profile router: maintains Map<profile, NativePort> instead of single global port
 * 2. Profile management via chrome.storage.local + popup UI
 * 3. All messages to/from broker include `profile` field for routing
 * 4. Reconnect logic per-profile with independent retry counters
 * 5. Badge shows aggregate connection status across all profiles
 *
 * All upstream browser tool handlers (22 tools) are preserved unchanged.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const HOST_NAME_PREFIX = "com.mavis.browser_"
const KEEPALIVE_ALARM = "keepalive"
const PERMISSION_HINT = "Click the Mavis Browser Bridge extension icon and approve requested permissions."
const OPTIONAL_RUNTIME_PERMISSIONS = ["nativeMessaging", "downloads", "debugger"]
const OPTIONAL_RUNTIME_ORIGINS = ["<all_urls>"]
const STORAGE_KEY_PROFILES = "mavis_profiles"

const runtimeManifest = chrome.runtime.getManifest()
const declaredOptionalPermissions = new Set(runtimeManifest.optional_permissions || [])
const declaredOptionalOrigins = new Set(runtimeManifest.optional_host_permissions || [])

// ═══════════════════════════════════════════════════════════════════════════
// Multi-profile connection state
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Per-profile connection state.
 * @typedef {Object} ProfileConnection
 * @property {chrome.runtime.Port|null} port - NM port
 * @property {boolean} connected - current connection status
 * @property {number} connectionAttempts - retry counter
 */

/** @type {Map<string, {port: chrome.runtime.Port|null, connected: boolean, connectionAttempts: number}>} */
const profileConnections = new Map()

let nativePermissionHintLogged = false

// ═══════════════════════════════════════════════════════════════════════════
// Profile management (chrome.storage.local)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get known profiles from storage. Returns at least ['default'].
 * @returns {Promise<string[]>}
 */
async function getKnownProfiles() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_PROFILES)
    const profiles = result[STORAGE_KEY_PROFILES]
    if (Array.isArray(profiles) && profiles.length > 0) return profiles
  } catch {}
  return ["default"]
}

/**
 * Save profiles to storage.
 * @param {string[]} profiles
 */
async function saveProfiles(profiles) {
  await chrome.storage.local.set({ [STORAGE_KEY_PROFILES]: profiles })
}

/**
 * Add a profile. Returns { added, profiles, connected }.
 * @param {string} profileName
 * @returns {Promise<{added: boolean, profiles: string[], connected: boolean}>}
 */
async function addProfile(profileName) {
  const sanitized = profileName.toLowerCase().replace(/[^a-z0-9]/g, "_")
  if (!sanitized) return { added: false, profiles: await getKnownProfiles(), connected: false }

  const profiles = await getKnownProfiles()
  if (profiles.includes(sanitized)) {
    const conn = profileConnections.get(sanitized)
    return { added: false, profiles, connected: conn?.connected ?? false }
  }

  profiles.push(sanitized)
  await saveProfiles(profiles)

  // Try connecting immediately
  const connected = await connectProfile(sanitized)
  return { added: true, profiles, connected }
}

/**
 * Remove a profile.
 * @param {string} profileName
 * @returns {Promise<{removed: boolean, profiles: string[]}>}
 */
async function removeProfile(profileName) {
  const sanitized = profileName.toLowerCase().replace(/[^a-z0-9]/g, "_")
  const profiles = await getKnownProfiles()
  const idx = profiles.indexOf(sanitized)
  if (idx === -1) return { removed: false, profiles }

  profiles.splice(idx, 1)
  await saveProfiles(profiles)
  disconnectProfile(sanitized)
  return { removed: true, profiles }
}

/**
 * Get connection status for all profiles.
 * @returns {{profile: string, connected: boolean}[]}
 */
function getProfileStatuses() {
  const statuses = []
  for (const [profile, conn] of profileConnections) {
    statuses.push({ profile, connected: conn.connected })
  }
  return statuses
}

// ═══════════════════════════════════════════════════════════════════════════
// Permission checks (unchanged from upstream)
// ═══════════════════════════════════════════════════════════════════════════

async function hasPermissions(query) {
  if (!chrome.permissions?.contains) return true
  try {
    return await chrome.permissions.contains(query)
  } catch {
    return false
  }
}

async function hasNativeMessagingPermission() {
  return await hasPermissions({ permissions: ["nativeMessaging"] })
}

async function hasDebuggerPermission() {
  return await hasPermissions({ permissions: ["debugger"] })
}

async function hasDownloadsPermission() {
  return await hasPermissions({ permissions: ["downloads"] })
}

async function hasHostAccessPermission() {
  return await hasPermissions({ origins: ["<all_urls>"] })
}

async function requestOptionalPermissionsFromClick() {
  if (!chrome.permissions?.contains || !chrome.permissions?.request) {
    return { granted: true, requested: false, permissions: [], origins: [] }
  }

  const permissions = []
  for (const permission of OPTIONAL_RUNTIME_PERMISSIONS) {
    if (!declaredOptionalPermissions.has(permission)) continue
    const granted = await hasPermissions({ permissions: [permission] })
    if (!granted) permissions.push(permission)
  }

  const origins = []
  for (const origin of OPTIONAL_RUNTIME_ORIGINS) {
    if (!declaredOptionalOrigins.has(origin)) continue
    const granted = await hasPermissions({ origins: [origin] })
    if (!granted) origins.push(origin)
  }

  if (!permissions.length && !origins.length) {
    return { granted: true, requested: false, permissions, origins }
  }

  try {
    const granted = await chrome.permissions.request({ permissions, origins })
    return { granted, requested: true, permissions, origins }
  } catch (error) {
    return {
      granted: false,
      requested: true,
      permissions,
      origins,
      error: error?.message || String(error),
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Debugger state management (unchanged from upstream)
// ═══════════════════════════════════════════════════════════════════════════

const debuggerState = new Map()
const MAX_LOG_ENTRIES = 1000

async function ensureDebuggerAvailable() {
  if (!chrome.debugger?.attach) {
    return { ok: false, reason: "Debugger API unavailable in this build." }
  }
  const granted = await hasDebuggerPermission()
  if (!granted) {
    return { ok: false, reason: `Debugger permission not granted. ${PERMISSION_HINT}` }
  }
  return { ok: true }
}

async function ensureDownloadsAvailable() {
  if (!chrome.downloads) {
    throw new Error(`Downloads API unavailable in this build. ${PERMISSION_HINT}`)
  }
  const granted = await hasDownloadsPermission()
  if (!granted) {
    throw new Error(`Downloads permission not granted. ${PERMISSION_HINT}`)
  }
}

async function ensureDebuggerAttached(tabId) {
  const availability = await ensureDebuggerAvailable()
  if (!availability.ok) {
    return {
      attached: false,
      unavailableReason: availability.reason,
      consoleMessages: [],
      pageErrors: [],
    }
  }

  if (debuggerState.has(tabId)) return debuggerState.get(tabId)

  const state = { attached: false, consoleMessages: [], pageErrors: [] }
  debuggerState.set(tabId, state)

  try {
    await chrome.debugger.attach({ tabId }, "1.3")
    await chrome.debugger.sendCommand({ tabId }, "Runtime.enable")
    state.attached = true
  } catch (e) {
    console.warn("[Mavis] Failed to attach debugger:", e.message || e)
  }

  return state
}

if (chrome.debugger?.onEvent) {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    const state = debuggerState.get(source.tabId)
    if (!state) return

    if (method === "Runtime.consoleAPICalled") {
      if (state.consoleMessages.length >= MAX_LOG_ENTRIES) state.consoleMessages.shift()
      state.consoleMessages.push({
        type: params.type,
        text: params.args.map((a) => a.value ?? a.description ?? "").join(" "),
        timestamp: Date.now(),
        source: params.stackTrace?.callFrames?.[0]?.url,
        line: params.stackTrace?.callFrames?.[0]?.lineNumber,
      })
    }

    if (method === "Runtime.exceptionThrown") {
      if (state.pageErrors.length >= MAX_LOG_ENTRIES) state.pageErrors.shift()
      state.pageErrors.push({
        message: params.exceptionDetails.text,
        source: params.exceptionDetails.url,
        line: params.exceptionDetails.lineNumber,
        column: params.exceptionDetails.columnNumber,
        stack: params.exceptionDetails.exception?.description,
        timestamp: Date.now(),
      })
    }
  })
}

if (chrome.debugger?.onDetach) {
  chrome.debugger.onDetach.addListener((source) => {
    if (debuggerState.has(source.tabId)) {
      debuggerState.get(source.tabId).attached = false
    }
  })
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (debuggerState.has(tabId)) {
    if (chrome.debugger?.detach) chrome.debugger.detach({ tabId }).catch(() => {})
    debuggerState.delete(tabId)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Multi-profile NM connection management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connect to a specific profile's native host.
 * @param {string} profile - sanitized profile name
 * @returns {Promise<boolean>} whether connection succeeded
 */
async function connectProfile(profile) {
  const hostName = HOST_NAME_PREFIX + profile
  let conn = profileConnections.get(profile)
  if (!conn) {
    conn = { port: null, connected: false, connectionAttempts: 0 }
    profileConnections.set(profile, conn)
  }

  // Disconnect existing
  if (conn.port) {
    try { conn.port.disconnect() } catch {}
    conn.port = null
  }

  const nativeMessagingAllowed = await hasNativeMessagingPermission()
  if (!nativeMessagingAllowed) {
    conn.connected = false
    updateBadge()
    if (!nativePermissionHintLogged) {
      nativePermissionHintLogged = true
      console.log(`[Mavis] Native messaging permission not granted. ${PERMISSION_HINT}`)
    }
    return false
  }

  nativePermissionHintLogged = false

  try {
    const port = chrome.runtime.connectNative(hostName)

    port.onMessage.addListener((message) => {
      handleMessage(message, profile).catch((e) => {
        console.error(`[Mavis][${profile}] Message handler error:`, e)
      })
    })

    port.onDisconnect.addListener(() => {
      conn.connected = false
      conn.port = null
      updateBadge()

      const err = chrome.runtime.lastError
      if (err?.message) {
        conn.connectionAttempts++
        if (conn.connectionAttempts === 1) {
          console.log(`[Mavis][${profile}] Native host not available. Run: mavis browser install`)
        } else if (conn.connectionAttempts % 20 === 0) {
          console.log(`[Mavis][${profile}] Still waiting for native host...`)
        }
      }
    })

    conn.port = port
    conn.connected = true
    conn.connectionAttempts = 0
    updateBadge()
    return true
  } catch (e) {
    conn.connected = false
    updateBadge()
    console.error(`[Mavis][${profile}] connectNative failed:`, e)
    return false
  }
}

/**
 * Disconnect a specific profile.
 * @param {string} profile
 */
function disconnectProfile(profile) {
  const conn = profileConnections.get(profile)
  if (!conn) return
  if (conn.port) {
    try { conn.port.disconnect() } catch {}
    conn.port = null
  }
  conn.connected = false
  profileConnections.delete(profile)
  updateBadge()
}

/**
 * Connect all known profiles.
 */
async function connectAllProfiles() {
  const profiles = await getKnownProfiles()
  await Promise.all(profiles.map((p) => connectProfile(p)))
}

/**
 * Reconnect any disconnected profiles.
 */
async function reconnectDisconnected() {
  const profiles = await getKnownProfiles()
  for (const profile of profiles) {
    const conn = profileConnections.get(profile)
    if (!conn || !conn.connected) {
      await connectProfile(profile)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Badge — shows aggregate status
// ═══════════════════════════════════════════════════════════════════════════

function updateBadge() {
  let anyConnected = false
  let total = 0
  let connectedCount = 0
  for (const [, conn] of profileConnections) {
    total++
    if (conn.connected) {
      anyConnected = true
      connectedCount++
    }
  }

  if (anyConnected) {
    const text = total > 1 ? String(connectedCount) : "ON"
    chrome.action.setBadgeText({ text })
    chrome.action.setBadgeBackgroundColor({ color: connectedCount === total ? "#22c55e" : "#f59e0b" })
  } else {
    chrome.action.setBadgeText({ text: "" })
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Message send — route to specific profile's NM port
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a message to a specific profile's native host.
 * @param {string} profile
 * @param {object} message
 * @returns {boolean}
 */
function sendToProfile(profile, message) {
  const conn = profileConnections.get(profile)
  if (!conn?.port) return false
  try {
    conn.port.postMessage(message)
    return true
  } catch {
    return false
  }
}

/**
 * Find which profile sent a message, based on the NM port reference.
 * @param {chrome.runtime.Port} port
 * @returns {string|null}
 */
function findProfileByPort(port) {
  for (const [profile, conn] of profileConnections) {
    if (conn.port === port) return profile
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Message handling — request from broker (via native host), dispatched by profile
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle an incoming message from a specific profile's native host.
 * @param {object} message
 * @param {string} profile
 */
async function handleMessage(message, profile) {
  if (!message || typeof message !== "object") return

  if (message.type === "tool_request") {
    await handleToolRequest(message, profile)
  } else if (message.type === "ping") {
    sendToProfile(profile, { type: "pong", profile })
  }
}

/**
 * Handle a tool_request from the broker, execute tool, send response back
 * to the same profile's native host.
 * @param {object} request
 * @param {string} profile
 */
async function handleToolRequest(request, profile) {
  const { id, tool, args } = request

  try {
    const result = await executeTool(tool, args || {})
    sendToProfile(profile, { type: "tool_response", id, result, profile })
  } catch (error) {
    sendToProfile(profile, {
      type: "tool_response",
      id,
      error: { content: error?.message || String(error) },
      profile,
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool execution — 21 tools (19 upstream + press_key + network_requests)
// ═══════════════════════════════════════════════════════════════════════════

async function executeTool(toolName, args) {
  const tools = {
    get_active_tab: toolGetActiveTab,
    get_tabs: toolGetTabs,
    open_tab: toolOpenTab,
    close_tab: toolCloseTab,
    navigate: toolNavigate,
    click: toolClick,
    type: toolType,
    select: toolSelect,
    screenshot: toolScreenshot,
    snapshot: toolSnapshot,
    query: toolQuery,
    scroll: toolScroll,
    wait: toolWait,
    download: toolDownload,
    list_downloads: toolListDownloads,
    set_file_input: toolSetFileInput,
    highlight: toolHighlight,
    console: toolConsole,
    errors: toolErrors,
    press_key: toolPressKey,
    network_requests: toolNetworkRequests,
  }

  const fn = tools[toolName]
  if (!fn) throw new Error(`Unknown tool: ${toolName}`)
  return await fn(args)
}

// ═══════════════════════════════════════════════════════════════════════════
// Page interaction helpers (unchanged from upstream)
// ═══════════════════════════════════════════════════════════════════════════

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab found")
  return tab
}

async function getTabById(tabId) {
  return tabId ? await chrome.tabs.get(tabId) : await getActiveTab()
}

async function runInPage(tabId, command, args) {
  const hasHostAccess = await hasHostAccessPermission()
  if (!hasHostAccess) {
    throw new Error(`Site access permission not granted. ${PERMISSION_HINT}`)
  }

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: pageOps,
      args: [command, args || {}],
      world: "ISOLATED",
    })
    return result[0]?.result
  } catch (error) {
    const message = error?.message || String(error)
    if (message.includes("Cannot access contents of the page")) {
      throw new Error(`Site access permission not granted for this page. ${PERMISSION_HINT}`)
    }
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// pageOps — injected into page context (unchanged from upstream)
// ═══════════════════════════════════════════════════════════════════════════

async function pageOps(command, args) {
  const options = args || {}
  const MAX_DEPTH = 6
  const DEFAULT_TIMEOUT_MS = 2000

  function safeString(value) {
    return typeof value === "string" ? value : ""
  }

  function normalizeSelectorList(selector) {
    if (Array.isArray(selector)) {
      return selector.map((s) => safeString(s).trim()).filter(Boolean)
    }
    if (typeof selector !== "string") return []
    const parts = selector.split(",").map((s) => s.trim()).filter(Boolean)
    return parts.length ? parts : [selector.trim()].filter(Boolean)
  }

  function stripQuotes(value) {
    return safeString(value).replace(/^['"]|['"]$/g, "")
  }

  function normalizeText(value) {
    return safeString(value).replace(/\s+/g, " ").trim().toLowerCase()
  }

  function matchesText(value, target) {
    if (!target) return false
    const normTarget = normalizeText(target)
    if (!normTarget) return false
    const normValue = normalizeText(value)
    return normValue === normTarget || normValue.includes(normTarget)
  }

  function normalizeLocatorKey(key) {
    if (key === "css") return "css"
    if (key === "label" || key === "field") return "label"
    if (key === "aria" || key === "aria-label") return "aria"
    if (key === "placeholder") return "placeholder"
    if (key === "name") return "name"
    if (key === "role") return "role"
    if (key === "text") return "text"
    if (key === "id") return "id"
    return null
  }

  function parseLocator(raw) {
    const trimmed = safeString(raw).trim()
    if (!trimmed) return { kind: "css", value: "", raw: "" }
    const match = trimmed.match(/^([a-zA-Z_-]+)\s*(=|:)\s*(.+)$/)
    if (match) {
      const key = match[1].toLowerCase()
      const kind = normalizeLocatorKey(key)
      if (kind) return { kind, value: stripQuotes(match[3]), raw: trimmed }
    }
    return { kind: "css", value: trimmed, raw: trimmed }
  }

  function isVisible(el) {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const style = window.getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
    return true
  }

  function deepQuerySelectorAll(sel, rootDoc) {
    const out = []
    const seen = new Set()
    function addAll(nodeList) {
      for (const el of nodeList) {
        if (!el || seen.has(el)) continue
        seen.add(el)
        out.push(el)
      }
    }
    function walkRoot(root, depth) {
      if (!root || depth > MAX_DEPTH) return
      try { addAll(root.querySelectorAll(sel)) } catch { return }
      const tree = root.querySelectorAll ? root.querySelectorAll("*") : []
      for (const el of tree) {
        if (el.shadowRoot) walkRoot(el.shadowRoot, depth + 1)
      }
      const frames = root.querySelectorAll ? root.querySelectorAll("iframe") : []
      for (const frame of frames) {
        try {
          const doc = frame.contentDocument
          if (doc) walkRoot(doc, depth + 1)
        } catch {}
      }
    }
    walkRoot(rootDoc || document, 0)
    return out
  }

  function getAriaLabelledByText(el) {
    const ids = safeString(el?.getAttribute?.("aria-labelledby")).split(/\s+/).filter(Boolean)
    if (!ids.length) return ""
    const parts = []
    for (const id of ids) {
      const ref = document.getElementById(id)
      if (ref) parts.push(ref.innerText || ref.textContent || "")
    }
    return parts.join(" ")
  }

  function findByAttribute(attr, target, allowedTags) {
    if (!target) return []
    const nodes = deepQuerySelectorAll(`[${attr}]`, document)
    return nodes.filter((el) => {
      if (Array.isArray(allowedTags) && allowedTags.length && !allowedTags.includes(el.tagName)) return false
      return matchesText(el.getAttribute(attr), target)
    })
  }

  function findByLabelText(target) {
    if (!target) return []
    const results = []
    const seen = new Set()
    const labels = deepQuerySelectorAll("label", document)
    for (const label of labels) {
      if (!matchesText(label.innerText || label.textContent || "", target)) continue
      const control = label.control || label.querySelector("input, textarea, select")
      if (control && !seen.has(control)) { seen.add(control); results.push(control) }
    }
    const labelled = deepQuerySelectorAll("[aria-labelledby]", document)
    for (const el of labelled) {
      if (!matchesText(getAriaLabelledByText(el), target)) continue
      if (!seen.has(el)) { seen.add(el); results.push(el) }
    }
    return results
  }

  function findByRole(target) {
    if (!target) return []
    const nodes = deepQuerySelectorAll("[role]", document)
    return nodes.filter((el) => matchesText(el.getAttribute("role"), target))
  }

  function findByName(target) {
    return findByAttribute("name", target)
  }

  function findByText(target) {
    if (!target) return []
    const results = []
    const seen = new Set()
    const candidates = deepQuerySelectorAll(
      "button, a, label, option, summary, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='option'], [role='listitem'], [role='row'], [tabindex]",
      document
    )
    for (const el of candidates) {
      if (!matchesText(el.innerText || el.textContent || "", target)) continue
      if (!seen.has(el)) { seen.add(el); results.push(el) }
    }
    const generic = deepQuerySelectorAll("div, span, li, article", document)
    for (const el of generic) {
      if (!matchesText(el.innerText || el.textContent || "", target)) continue
      const style = window.getComputedStyle(el)
      const likelyInteractive = !!el.getAttribute("onclick") || !!el.getAttribute("role") || el.tabIndex >= 0 || style.cursor === "pointer"
      if (!likelyInteractive) continue
      if (!seen.has(el)) { seen.add(el); results.push(el) }
    }
    const inputs = deepQuerySelectorAll("input[type='button'], input[type='submit'], input[type='reset']", document)
    for (const el of inputs) {
      if (!matchesText(el.value || "", target)) continue
      if (!seen.has(el)) { seen.add(el); results.push(el) }
    }
    return results
  }

  function resolveLocator(locator) {
    if (locator.kind === "css") {
      const value = safeString(locator.value)
      if (!value) return []
      return deepQuerySelectorAll(value, document)
    }
    if (locator.kind === "label") return findByLabelText(locator.value)
    if (locator.kind === "aria") return findByAttribute("aria-label", locator.value)
    if (locator.kind === "placeholder") return findByAttribute("placeholder", locator.value, ["INPUT", "TEXTAREA"])
    if (locator.kind === "name") return findByName(locator.value)
    if (locator.kind === "role") return findByRole(locator.value)
    if (locator.kind === "text") return findByText(locator.value)
    if (locator.kind === "id") {
      const idValue = safeString(locator.value).trim()
      if (!idValue) return []
      const escaped = window.CSS && window.CSS.escape ? window.CSS.escape(idValue) : idValue.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
      return deepQuerySelectorAll(`#${escaped}`, document)
    }
    return []
  }

  function resolveMatchesOnce(selectors, index) {
    for (const sel of selectors) {
      const locator = parseLocator(sel)
      if (!locator.value) continue
      const matches = resolveLocator(locator)
      if (!matches.length) continue
      const visible = matches.filter(isVisible)
      const chosen = visible[index] || matches[index] || null
      return { selectorUsed: locator.raw, matches, chosen }
    }
    return { selectorUsed: selectors[0] || "", matches: [], chosen: null }
  }

  async function resolveMatches(selectors, index, timeoutMs, pollMs) {
    let match = resolveMatchesOnce(selectors, index)
    if (timeoutMs > 0) {
      const start = Date.now()
      while (!match.matches.length && Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs))
        match = resolveMatchesOnce(selectors, index)
      }
    }
    return match
  }

  function clickElement(el) {
    try { el.scrollIntoView({ block: "center", inline: "center" }) } catch {}
    const rect = el.getBoundingClientRect()
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1)
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1)
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }
    try {
      el.dispatchEvent(new MouseEvent("mouseover", opts))
      el.dispatchEvent(new MouseEvent("mousemove", opts))
      el.dispatchEvent(new MouseEvent("mousedown", opts))
      el.dispatchEvent(new MouseEvent("mouseup", opts))
      el.dispatchEvent(new MouseEvent("click", opts))
    } catch {}
    try { el.click() } catch {}
  }

  function setNativeValue(el, value) {
    const tag = el.tagName
    if (tag === "INPUT" || tag === "TEXTAREA") {
      const proto = tag === "INPUT" ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
      if (setter) setter.call(el, value)
      else el.value = value
      return true
    }
    return false
  }

  function setSelectValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set
    if (setter) setter.call(el, value)
    else el.value = value
  }

  function getInputValues() {
    const out = []
    document.querySelectorAll("input, textarea").forEach((el) => {
      try {
        const name = el.getAttribute("aria-label") || el.getAttribute("name") || el.id || el.className || el.tagName
        const value = el.value
        if (value != null && String(value).trim()) out.push(`${name}: ${value}`)
      } catch {}
    })
    return out.join("\n")
  }

  function getPseudoText() {
    const out = []
    const elements = Array.from(document.querySelectorAll("*"))
    for (let i = 0; i < elements.length && out.length < 2000; i++) {
      const el = elements[i]
      try {
        const style = window.getComputedStyle(el)
        if (style.display === "none" || style.visibility === "hidden") continue
        const before = window.getComputedStyle(el, "::before").content
        const after = window.getComputedStyle(el, "::after").content
        const pushContent = (content) => {
          if (!content) return
          const c = String(content)
          if (!c || c === "none" || c === "normal") return
          const unquoted = c.replace(/^"|"$/g, "").replace(/^'|'$/g, "")
          if (unquoted && unquoted !== "none" && unquoted !== "normal") out.push(unquoted)
        }
        pushContent(before)
        pushContent(after)
      } catch {}
    }
    return out.join("\n")
  }

  function buildMatches(text, pattern, flags) {
    if (!pattern) return []
    try {
      const re = new RegExp(pattern, flags || "")
      const found = []
      let m
      while ((m = re.exec(text)) && found.length < 50) {
        found.push(m[0])
        if (!re.global) break
      }
      return found
    } catch {
      return []
    }
  }

  function getPageText(limit, pattern, flags) {
    const parts = []
    const bodyText = safeString(document.body?.innerText || "")
    if (bodyText.trim()) parts.push(bodyText)
    const inputValues = getInputValues()
    if (inputValues) parts.push(inputValues)
    const pseudo = getPseudoText()
    if (pseudo) parts.push(pseudo)
    const text = parts.filter(Boolean).join("\n\n").slice(0, Math.max(0, limit))
    return {
      url: location.href,
      title: document.title,
      text,
      matches: buildMatches(text, pattern, flags),
    }
  }

  const mode = typeof options.mode === "string" && options.mode ? options.mode : "text"
  const selectors = normalizeSelectorList(options.selector)
  const index = Number.isFinite(options.index) ? options.index : 0
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const pollMs = Number.isFinite(options.pollMs) ? options.pollMs : 200
  const limit = Number.isFinite(options.limit) ? options.limit : mode === "page_text" ? 20000 : 50
  const pattern = typeof options.pattern === "string" ? options.pattern : null
  const flags = typeof options.flags === "string" ? options.flags : "i"

  if (command === "click") {
    const match = await resolveMatches(selectors, index, timeoutMs, pollMs)
    if (!match.chosen) return { ok: false, error: `Element not found for selectors: ${selectors.join(", ")}` }
    clickElement(match.chosen)
    return { ok: true, selectorUsed: match.selectorUsed }
  }

  if (command === "type") {
    const text = options.text
    const shouldClear = !!options.clear
    const match = await resolveMatches(selectors, index, timeoutMs, pollMs)
    if (!match.chosen) return { ok: false, error: `Element not found for selectors: ${selectors.join(", ")}` }
    try { match.chosen.scrollIntoView({ block: "center", inline: "center" }) } catch {}
    try { match.chosen.focus() } catch {}
    const tag = match.chosen.tagName
    const isTextInput = tag === "INPUT" || tag === "TEXTAREA"
    if (isTextInput) {
      if (shouldClear) setNativeValue(match.chosen, "")
      setNativeValue(match.chosen, (match.chosen.value || "") + text)
      match.chosen.dispatchEvent(new Event("input", { bubbles: true }))
      match.chosen.dispatchEvent(new Event("change", { bubbles: true }))
      return { ok: true, selectorUsed: match.selectorUsed }
    }
    if (match.chosen.isContentEditable) {
      if (shouldClear) match.chosen.textContent = ""
      try { document.execCommand("insertText", false, text) } catch { match.chosen.textContent = (match.chosen.textContent || "") + text }
      match.chosen.dispatchEvent(new Event("input", { bubbles: true }))
      return { ok: true, selectorUsed: match.selectorUsed }
    }
    return { ok: false, error: `Element is not typable: ${match.selectorUsed} (${tag.toLowerCase()})` }
  }

  if (command === "select") {
    const value = typeof options.value === "string" ? options.value : null
    const label = typeof options.label === "string" ? options.label : null
    const optionIndex = Number.isFinite(options.optionIndex) ? options.optionIndex : null
    const match = await resolveMatches(selectors, index, timeoutMs, pollMs)
    if (!match.chosen) return { ok: false, error: `Element not found for selectors: ${selectors.join(", ")}` }
    const tag = match.chosen.tagName
    if (tag !== "SELECT") return { ok: false, error: `Element is not a select: ${match.selectorUsed} (${tag.toLowerCase()})` }
    if (value === null && label === null && optionIndex === null) return { ok: false, error: "value, label, or optionIndex is required" }
    const selectEl = match.chosen
    const optionList = Array.from(selectEl.options || [])
    let option = null
    if (value !== null) option = optionList.find((opt) => opt.value === value)
    if (!option && label !== null) { const target = label.trim(); option = optionList.find((opt) => (opt.label || opt.textContent || "").trim() === target) }
    if (!option && optionIndex !== null) option = optionList[optionIndex]
    if (!option) return { ok: false, error: "Option not found" }
    try { selectEl.scrollIntoView({ block: "center", inline: "center" }) } catch {}
    try { selectEl.focus() } catch {}
    setSelectValue(selectEl, option.value)
    option.selected = true
    selectEl.dispatchEvent(new Event("input", { bubbles: true }))
    selectEl.dispatchEvent(new Event("change", { bubbles: true }))
    return { ok: true, selectorUsed: match.selectorUsed, value: selectEl.value, label: (option.label || option.textContent || "").trim() }
  }

  if (command === "set_file_input") {
    const rawFiles = Array.isArray(options.files) ? options.files : options.files ? [options.files] : []
    if (!rawFiles.length) return { ok: false, error: "files is required" }
    const match = await resolveMatches(selectors, index, timeoutMs, pollMs)
    if (!match.chosen) return { ok: false, error: `Element not found for selectors: ${selectors.join(", ")}` }
    const tag = match.chosen.tagName
    if (tag !== "INPUT" || match.chosen.type !== "file") return { ok: false, error: `Element is not a file input: ${match.selectorUsed} (${tag.toLowerCase()})` }
    function decodeBase64(value) {
      const raw = safeString(value)
      const b64 = raw.includes(",") ? raw.split(",").pop() : raw
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    }
    const dt = new DataTransfer()
    const names = []
    for (const fileInfo of rawFiles) {
      const name = safeString(fileInfo?.name) || "upload.bin"
      const mimeType = safeString(fileInfo?.mimeType) || "application/octet-stream"
      const base64 = safeString(fileInfo?.base64)
      if (!base64) return { ok: false, error: "file.base64 is required" }
      const bytes = decodeBase64(base64)
      const file = new File([bytes], name, { type: mimeType, lastModified: Date.now() })
      dt.items.add(file)
      names.push(name)
    }
    try { match.chosen.scrollIntoView({ block: "center", inline: "center" }) } catch {}
    try { match.chosen.focus() } catch {}
    try { match.chosen.files = dt.files } catch { try { Object.defineProperty(match.chosen, "files", { value: dt.files, writable: false }) } catch { return { ok: false, error: "Failed to set file input" } } }
    match.chosen.dispatchEvent(new Event("input", { bubbles: true }))
    match.chosen.dispatchEvent(new Event("change", { bubbles: true }))
    return { ok: true, selectorUsed: match.selectorUsed, count: dt.files.length, names }
  }

  if (command === "scroll") {
    const scrollX = Number.isFinite(options.x) ? options.x : 0
    const scrollY = Number.isFinite(options.y) ? options.y : 0
    if (selectors.length) {
      const match = await resolveMatches(selectors, index, timeoutMs, pollMs)
      if (!match.chosen) return { ok: false, error: `Element not found for selectors: ${selectors.join(", ")}` }
      if (scrollX || scrollY) {
        try {
          if (typeof match.chosen.scrollBy === "function") match.chosen.scrollBy({ left: scrollX, top: scrollY, behavior: "smooth" })
          else { match.chosen.scrollLeft = Number(match.chosen.scrollLeft || 0) + scrollX; match.chosen.scrollTop = Number(match.chosen.scrollTop || 0) + scrollY }
        } catch { match.chosen.scrollLeft = Number(match.chosen.scrollLeft || 0) + scrollX; match.chosen.scrollTop = Number(match.chosen.scrollTop || 0) + scrollY }
        return { ok: true, selectorUsed: match.selectorUsed, elementScroll: { x: scrollX, y: scrollY } }
      }
      try { match.chosen.scrollIntoView({ behavior: "smooth", block: "center" }) } catch {}
      return { ok: true, selectorUsed: match.selectorUsed }
    }
    window.scrollBy(scrollX, scrollY)
    return { ok: true }
  }

  if (command === "highlight") {
    const duration = Number.isFinite(options.duration) ? options.duration : 3000
    const color = typeof options.color === "string" ? options.color : "#ff0000"
    const showInfo = !!options.showInfo
    const match = await resolveMatches(selectors, index, timeoutMs, pollMs)
    if (!match.chosen) return { ok: false, error: `Element not found for selectors: ${selectors.join(", ")}` }
    const el = match.chosen
    const rect = el.getBoundingClientRect()
    const existing = document.getElementById("__opc_highlight_overlay")
    if (existing) existing.remove()
    const overlay = document.createElement("div")
    overlay.id = "__opc_highlight_overlay"
    overlay.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;border:3px solid ${color};box-shadow:0 0 10px ${color};pointer-events:none;z-index:2147483647;transition:opacity 0.3s;`
    if (showInfo) {
      const info = document.createElement("div")
      info.style.cssText = `position:absolute;top:-25px;left:0;background:${color};color:white;padding:2px 8px;font-size:12px;font-family:monospace;border-radius:3px;white-space:nowrap;`
      info.textContent = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}`
      overlay.appendChild(info)
    }
    document.body.appendChild(overlay)
    setTimeout(() => { overlay.style.opacity = "0"; setTimeout(() => overlay.remove(), 300) }, duration)
    return { ok: true, selectorUsed: match.selectorUsed, highlighted: true, tag: el.tagName, id: el.id || null }
  }

  if (command === "query") {
    if (mode === "page_text") {
      if (selectors.length && timeoutMs > 0) await resolveMatches(selectors, index, timeoutMs, pollMs)
      return { ok: true, value: getPageText(limit, pattern, flags) }
    }
    if (!selectors.length) return { ok: false, error: "Selector is required" }
    const match = await resolveMatches(selectors, index, timeoutMs, pollMs)
    if (mode === "exists") return { ok: true, selectorUsed: match.selectorUsed, value: { exists: match.matches.length > 0, count: match.matches.length } }
    if (!match.chosen) return { ok: false, error: `No matches for selectors: ${selectors.join(", ")}` }
    if (mode === "text") return { ok: true, selectorUsed: match.selectorUsed, value: (match.chosen.innerText || match.chosen.textContent || "").trim() }
    if (mode === "value") return { ok: true, selectorUsed: match.selectorUsed, value: typeof match.chosen.value === "string" ? match.chosen.value : String(match.chosen.value ?? "") }
    if (mode === "attribute") return { ok: true, selectorUsed: match.selectorUsed, value: options.attribute ? match.chosen.getAttribute(options.attribute) : null }
    if (mode === "property") { if (!options.property) return { ok: false, error: "property is required" }; return { ok: true, selectorUsed: match.selectorUsed, value: match.chosen[options.property] } }
    if (mode === "html") return { ok: true, selectorUsed: match.selectorUsed, value: match.chosen.outerHTML }
    if (mode === "list") {
      const maxItems = Math.min(Math.max(1, limit), 200)
      const items = match.matches.slice(0, maxItems).map((el) => ({ text: (el.innerText || el.textContent || "").trim().slice(0, 200), tag: (el.tagName || "").toLowerCase(), ariaLabel: el.getAttribute ? el.getAttribute("aria-label") : null }))
      return { ok: true, selectorUsed: match.selectorUsed, value: { items, count: match.matches.length } }
    }
    return { ok: false, error: `Unknown mode: ${mode}` }
  }

  if (command === "press_key") {
    const key = typeof options.key === "string" ? options.key : ""
    if (!key) return { ok: false, error: "key is required" }
    const rawModifiers = Array.isArray(options.modifiers)
      ? options.modifiers.map((m) => safeString(m).toLowerCase())
      : []
    const has = (name) => rawModifiers.includes(name)
    const ctrlKey = has("ctrl") || has("control")
    const altKey = has("alt") || has("option")
    const shiftKey = has("shift")
    const metaKey = has("meta") || has("cmd") || has("command")

    let target = document.activeElement
    let selectorUsed = null
    if (selectors.length) {
      const match = await resolveMatches(selectors, index, timeoutMs, pollMs)
      if (!match.chosen) {
        return { ok: false, error: `Element not found for selectors: ${selectors.join(", ")}` }
      }
      target = match.chosen
      selectorUsed = match.selectorUsed
      try { target.focus() } catch {}
    }
    if (!target || target === document) target = document.body || document.documentElement

    function keyToCode(k) {
      if (k.length === 1) {
        const upper = k.toUpperCase()
        if (/^[A-Z]$/.test(upper)) return `Key${upper}`
        if (/^[0-9]$/.test(k)) return `Digit${k}`
        if (k === " ") return "Space"
        return ""
      }
      if (/^Arrow(Up|Down|Left|Right)$/.test(k)) return k
      if (/^F(?:[1-9]|1[0-2])$/.test(k)) return k
      if (k === "Enter" || k === "Backspace" || k === "Tab" || k === "Escape" || k === "Delete" || k === "Home" || k === "End" || k === "PageUp" || k === "PageDown" || k === "Insert" || k === "Space") {
        return k === "Space" ? "Space" : k
      }
      return k
    }
    const code = keyToCode(key)
    const eventInit = { key, code, ctrlKey, altKey, shiftKey, metaKey, bubbles: true, cancelable: true, view: window }

    function dispatchKeyEvent(type) {
      try { target.dispatchEvent(new KeyboardEvent(type, eventInit)) } catch {}
    }

    const tag = target?.tagName
    const isInput = tag === "INPUT" || tag === "TEXTAREA"
    const isEditable = target?.isContentEditable
    const isTextField = isInput || isEditable
    const noModifiers = !ctrlKey && !altKey && !metaKey

    if (isTextField && noModifiers) {
      if (key === "Backspace") {
        dispatchKeyEvent("keydown")
        try {
          if (isInput) {
            const start = target.selectionStart ?? target.value.length
            const end = target.selectionEnd ?? start
            if (end === start && start > 0) {
              const newVal = target.value.slice(0, start - 1) + target.value.slice(end)
              setNativeValue(target, newVal)
              try { target.setSelectionRange(start - 1, start - 1) } catch {}
            } else if (end > start) {
              const newVal = target.value.slice(0, start) + target.value.slice(end)
              setNativeValue(target, newVal)
              try { target.setSelectionRange(start, start) } catch {}
            }
            target.dispatchEvent(new Event("input", { bubbles: true }))
            target.dispatchEvent(new Event("change", { bubbles: true }))
          } else if (isEditable) {
            try { document.execCommand("delete", false) } catch {}
          }
        } catch {}
        dispatchKeyEvent("keyup")
        return { ok: true, selectorUsed, key, modifiers: rawModifiers }
      }

      if (key === "Enter") {
        dispatchKeyEvent("keydown")
        if (tag === "TEXTAREA") {
          try {
            const start = target.selectionStart ?? target.value.length
            const end = target.selectionEnd ?? start
            const newVal = target.value.slice(0, start) + "\n" + target.value.slice(end)
            setNativeValue(target, newVal)
            try { target.setSelectionRange(start + 1, start + 1) } catch {}
            target.dispatchEvent(new Event("input", { bubbles: true }))
          } catch {}
        } else if (isInput) {
          // Single-line input: emulate browser's "Enter submits form" behavior.
          // Prefer requestSubmit() — it runs constraint validation, fires the
          // 'submit' event, and triggers navigation (matches what real Enter
          // keypresses do). Fall back to submit() on browsers that don't yet
          // support requestSubmit().
          try {
            const form = target.form
            if (form) {
              if (typeof form.requestSubmit === "function") {
                try { form.requestSubmit() } catch { try { form.submit() } catch {} }
              } else {
                try { form.submit() } catch {}
              }
            }
          } catch {}
        } else if (isEditable) {
          try { document.execCommand("insertLineBreak", false) } catch {}
        }
        dispatchKeyEvent("keyup")
        return { ok: true, selectorUsed, key, modifiers: rawModifiers }
      }

      if (key.length === 1) {
        // Single character — insert at cursor position
        dispatchKeyEvent("keydown")
        dispatchKeyEvent("keypress")
        try {
          if (isInput) {
            const start = target.selectionStart ?? target.value.length
            const end = target.selectionEnd ?? start
            const newVal = target.value.slice(0, start) + key + target.value.slice(end)
            setNativeValue(target, newVal)
            try { target.setSelectionRange(start + 1, start + 1) } catch {}
            target.dispatchEvent(new Event("input", { bubbles: true }))
          } else if (isEditable) {
            try { document.execCommand("insertText", false, key) } catch {}
          }
        } catch {}
        dispatchKeyEvent("keyup")
        return { ok: true, selectorUsed, key, modifiers: rawModifiers }
      }
    }

    // Fallback for non-text targets, modified keys, or special keys without input mutation
    dispatchKeyEvent("keydown")
    if (key.length === 1 && noModifiers) dispatchKeyEvent("keypress")
    dispatchKeyEvent("keyup")
    return { ok: true, selectorUsed, key, modifiers: rawModifiers }
  }

  return { ok: false, error: `Unknown command: ${String(command)}` }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool implementations (unchanged from upstream)
// ═══════════════════════════════════════════════════════════════════════════

async function toolGetActiveTab() {
  const tab = await getActiveTab()
  return { tabId: tab.id, content: { tabId: tab.id, url: tab.url, title: tab.title } }
}

async function toolOpenTab({ url, active = false }) {
  const createOptions = {}
  if (typeof url === "string" && url.trim()) createOptions.url = url.trim()
  if (typeof active === "boolean") createOptions.active = active
  const tab = await chrome.tabs.create(createOptions)
  return { tabId: tab.id, content: { tabId: tab.id, url: tab.url, active: tab.active } }
}

async function toolCloseTab({ tabId }) {
  if (!Number.isFinite(tabId)) throw new Error("tabId is required")
  await chrome.tabs.remove(tabId)
  return { tabId, content: { tabId, closed: true } }
}

async function toolNavigate({ url, tabId }) {
  if (!url) throw new Error("URL is required")
  const tab = await getTabById(tabId)
  await chrome.tabs.update(tab.id, { url })
  await new Promise((resolve) => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(listener); resolve() }
    }
    chrome.tabs.onUpdated.addListener(listener)
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve() }, 30000)
  })
  return { tabId: tab.id, content: `Navigated to ${url}` }
}

async function toolClick({ selector, tabId, index = 0, timeoutMs, pollMs }) {
  if (!selector) throw new Error("Selector is required")
  const tab = await getTabById(tabId)
  const result = await runInPage(tab.id, "click", { selector, index, timeoutMs, pollMs })
  if (!result?.ok) throw new Error(result?.error || "Click failed")
  return { tabId: tab.id, content: `Clicked ${result.selectorUsed || selector}` }
}

async function toolType({ selector, text, tabId, clear = false, index = 0, timeoutMs, pollMs }) {
  if (!selector) throw new Error("Selector is required")
  if (text === undefined) throw new Error("Text is required")
  const tab = await getTabById(tabId)
  const result = await runInPage(tab.id, "type", { selector, text, clear, index, timeoutMs, pollMs })
  if (!result?.ok) throw new Error(result?.error || "Type failed")
  return { tabId: tab.id, content: `Typed "${text}" into ${result.selectorUsed || selector}` }
}

async function toolSelect({ selector, value, label, optionIndex, tabId, index = 0, timeoutMs, pollMs }) {
  if (!selector) throw new Error("Selector is required")
  if (value === undefined && label === undefined && optionIndex === undefined) throw new Error("value, label, or optionIndex is required")
  const tab = await getTabById(tabId)
  const result = await runInPage(tab.id, "select", { selector, value, label, optionIndex, index, timeoutMs, pollMs })
  if (!result?.ok) throw new Error(result?.error || "Select failed")
  const valueText = result.value ? String(result.value) : ""
  const labelText = result.label ? String(result.label) : ""
  const summary = labelText && valueText && labelText !== valueText ? `${labelText} (${valueText})` : labelText || valueText
  return { tabId: tab.id, content: `Selected ${summary || "option"} in ${result.selectorUsed || selector}` }
}

async function toolScreenshot({ tabId }) {
  const tab = await getTabById(tabId)
  const png = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" })
  return { tabId: tab.id, content: png }
}

async function toolSnapshot({ tabId }) {
  const tab = await getTabById(tabId)
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      function safeText(s) { return typeof s === "string" ? s : "" }
      function isVisible(el) {
        if (!el) return false
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return false
        const style = window.getComputedStyle(el)
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
        return true
      }
      function pseudoText(el) {
        try {
          const before = window.getComputedStyle(el, "::before").content
          const after = window.getComputedStyle(el, "::after").content
          const norm = (v) => { const s = safeText(v); if (!s || s === "none") return ""; return s.replace(/^"|"$/g, "") }
          return { before: norm(before), after: norm(after) }
        } catch { return { before: "", after: "" } }
      }
      function getName(el) {
        const aria = el.getAttribute("aria-label"); if (aria) return aria
        const alt = el.getAttribute("alt"); if (alt) return alt
        const title = el.getAttribute("title"); if (title) return title
        const placeholder = el.getAttribute("placeholder"); if (placeholder) return placeholder
        const txt = safeText(el.innerText); if (txt.trim()) return txt.slice(0, 200)
        const pt = pseudoText(el); const combo = `${pt.before} ${pt.after}`.trim(); if (combo) return combo.slice(0, 200)
        return ""
      }
      function build(el, depth = 0, uid = 0) {
        if (!el || depth > 12) return { nodes: [], nextUid: uid }
        const nodes = []
        if (!isVisible(el)) return { nodes: [], nextUid: uid }
        const isInteractive = ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("onclick") || el.getAttribute("role") === "button" || el.isContentEditable
        const name = getName(el)
        const pt = pseudoText(el)
        const shouldInclude = isInteractive || name.trim() || pt.before || pt.after
        if (shouldInclude) {
          const node = { uid: `e${uid}`, role: el.getAttribute("role") || el.tagName.toLowerCase(), name, tag: el.tagName.toLowerCase() }
          if (pt.before) node.before = pt.before
          if (pt.after) node.after = pt.after
          if (el.href) node.href = el.href
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") { node.type = el.type; node.value = el.value; if (el.readOnly) node.readOnly = true; if (el.disabled) node.disabled = true }
          if (el.id) node.selector = `#${el.id}`
          else if (el.className && typeof el.className === "string") { const cls = el.className.trim().split(/\s+/).slice(0, 2).join("."); if (cls) node.selector = `${el.tagName.toLowerCase()}.${cls}` }
          nodes.push(node); uid++
        }
        if (el.shadowRoot) { const r = build(el.shadowRoot.host, depth + 1, uid); uid = r.nextUid }
        for (const child of el.children) { const r = build(child, depth + 1, uid); nodes.push(...r.nodes); uid = r.nextUid }
        return { nodes, nextUid: uid }
      }
      function getAllLinks() {
        const links = []; const seen = new Set()
        document.querySelectorAll("a[href]").forEach((a) => {
          const href = a.href
          if (href && !seen.has(href) && !href.startsWith("javascript:")) { seen.add(href); links.push({ href, text: a.innerText?.trim().slice(0, 100) || a.getAttribute("aria-label") || "" }) }
        })
        return links.slice(0, 200)
      }
      let pageText = ""
      try { pageText = safeText(document.body?.innerText || "").slice(0, 20000) } catch {}
      const built = build(document.body).nodes.slice(0, 800)
      return { url: location.href, title: document.title, text: pageText, nodes: built, links: getAllLinks() }
    },
    world: "ISOLATED",
  })
  return { tabId: tab.id, content: JSON.stringify(result[0]?.result, null, 2) }
}

async function toolGetTabs() {
  const tabs = await chrome.tabs.query({})
  const out = tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, active: t.active, windowId: t.windowId }))
  return { content: JSON.stringify(out, null, 2) }
}

async function toolQuery({ tabId, selector, mode = "text", attribute, property, limit, index = 0, timeoutMs, pollMs, pattern, flags }) {
  if (!selector && mode !== "page_text") throw new Error("selector is required")
  const tab = await getTabById(tabId)
  const result = await runInPage(tab.id, "query", { selector, mode, attribute, property, limit, index, timeoutMs, pollMs, pattern, flags })
  if (!result?.ok) throw new Error(result?.error || "Query failed")
  if (mode === "list" || mode === "property" || mode === "exists" || mode === "page_text") return { tabId: tab.id, content: JSON.stringify(result, null, 2) }
  return { tabId: tab.id, content: typeof result.value === "string" ? result.value : JSON.stringify(result.value) }
}

async function toolScroll({ x = 0, y = 0, selector, tabId, timeoutMs, pollMs }) {
  const tab = await getTabById(tabId)
  const result = await runInPage(tab.id, "scroll", { x, y, selector, timeoutMs, pollMs })
  if (!result?.ok) throw new Error(result?.error || "Scroll failed")
  return { tabId: tab.id, content: `Scrolled ${result.selectorUsed ? `to ${result.selectorUsed}` : `by (${x}, ${y})`}` }
}

async function toolWait({ ms = 1000, tabId }) {
  await new Promise((resolve) => setTimeout(resolve, ms))
  return { tabId, content: `Waited ${ms}ms` }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function normalizeDownloadTimeoutMs(value) { return clampNumber(value, 0, 60000, 60000) }

function waitForNextDownloadCreated(timeoutMs) {
  const timeout = normalizeDownloadTimeoutMs(timeoutMs)
  return new Promise((resolve, reject) => {
    const listener = (item) => { cleanup(); resolve(item) }
    const timer = timeout ? setTimeout(() => { cleanup(); reject(new Error("Timed out waiting for download to start")) }, timeout) : null
    function cleanup() { chrome.downloads.onCreated.removeListener(listener); if (timer) clearTimeout(timer) }
    chrome.downloads.onCreated.addListener(listener)
  })
}

async function getDownloadById(downloadId) {
  const items = await chrome.downloads.search({ id: downloadId })
  return items && items.length ? items[0] : null
}

async function waitForDownloadCompletion(downloadId, timeoutMs) {
  const timeout = normalizeDownloadTimeoutMs(timeoutMs)
  const pollMs = 200; const endAt = Date.now() + timeout
  while (true) {
    const item = await getDownloadById(downloadId)
    if (item && (item.state === "complete" || item.state === "interrupted")) return item
    if (!timeout || Date.now() >= endAt) return item
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

async function toolDownload({ url, selector, filename, conflictAction, saveAs = false, wait = false, downloadTimeoutMs, tabId, index = 0, timeoutMs, pollMs }) {
  const hasUrl = typeof url === "string" && url.trim()
  const hasSelector = typeof selector === "string" && selector.trim()
  await ensureDownloadsAvailable()
  if (!hasUrl && !hasSelector) throw new Error("url or selector is required")
  if (hasUrl && hasSelector) throw new Error("Provide either url or selector, not both")
  let downloadId = null
  if (hasUrl) {
    const options = { url: url.trim() }
    if (typeof filename === "string" && filename.trim()) options.filename = filename.trim()
    if (typeof conflictAction === "string" && conflictAction.trim()) options.conflictAction = conflictAction.trim()
    if (typeof saveAs === "boolean") options.saveAs = saveAs
    downloadId = await chrome.downloads.download(options)
  } else {
    const tab = await getTabById(tabId)
    const created = waitForNextDownloadCreated(downloadTimeoutMs)
    const clicked = await runInPage(tab.id, "click", { selector, index, timeoutMs, pollMs })
    if (!clicked?.ok) throw new Error(clicked?.error || "Click failed")
    const createdItem = await created
    downloadId = createdItem?.id
  }
  if (!Number.isFinite(downloadId)) throw new Error("Download did not start")
  if (!wait) { const item = await getDownloadById(downloadId); return { content: { downloadId, item } } }
  const item = await waitForDownloadCompletion(downloadId, downloadTimeoutMs)
  return { content: { downloadId, item } }
}

async function toolListDownloads({ limit = 20, state } = {}) {
  await ensureDownloadsAvailable()
  const limitValue = clampNumber(limit, 1, 200, 20)
  const query = { orderBy: ["-startTime"], limit: limitValue }
  if (typeof state === "string" && state.trim()) query.state = state.trim()
  const downloads = await chrome.downloads.search(query)
  const out = downloads.map((d) => ({ id: d.id, url: d.url, filename: d.filename, state: d.state, bytesReceived: d.bytesReceived, totalBytes: d.totalBytes, startTime: d.startTime, endTime: d.endTime, error: d.error, mime: d.mime }))
  return { content: JSON.stringify({ downloads: out }, null, 2) }
}

async function toolSetFileInput({ selector, tabId, index = 0, timeoutMs, pollMs, files }) {
  if (!selector) throw new Error("Selector is required")
  const tab = await getTabById(tabId)
  const result = await runInPage(tab.id, "set_file_input", { selector, index, timeoutMs, pollMs, files })
  if (!result?.ok) throw new Error(result?.error || "Failed to set file input")
  return { tabId: tab.id, content: JSON.stringify({ selector: result.selectorUsed || selector, ...result }, null, 2) }
}

async function toolHighlight({ selector, tabId, index = 0, duration, color, showInfo, timeoutMs, pollMs }) {
  if (!selector) throw new Error("Selector is required")
  const tab = await getTabById(tabId)
  const result = await runInPage(tab.id, "highlight", { selector, index, duration, color, showInfo, timeoutMs, pollMs })
  if (!result?.ok) throw new Error(result?.error || "Highlight failed")
  return { tabId: tab.id, content: JSON.stringify({ highlighted: true, tag: result.tag, id: result.id, selectorUsed: result.selectorUsed }) }
}

async function toolConsole({ tabId, clear = false, filter } = {}) {
  const tab = await getTabById(tabId)
  const state = await ensureDebuggerAttached(tab.id)
  if (!state.attached) return { tabId: tab.id, content: JSON.stringify({ error: state.unavailableReason || "Debugger not attached.", messages: [] }) }
  let messages = [...state.consoleMessages]
  if (filter && typeof filter === "string") messages = messages.filter((m) => m.type === filter.toLowerCase())
  if (clear) state.consoleMessages = []
  return { tabId: tab.id, content: JSON.stringify(messages, null, 2) }
}

async function toolErrors({ tabId, clear = false } = {}) {
  const tab = await getTabById(tabId)
  const state = await ensureDebuggerAttached(tab.id)
  if (!state.attached) return { tabId: tab.id, content: JSON.stringify({ error: state.unavailableReason || "Debugger not attached.", errors: [] }) }
  const errors = [...state.pageErrors]
  if (clear) state.pageErrors = []
  return { tabId: tab.id, content: JSON.stringify(errors, null, 2) }
}

// ═══════════════════════════════════════════════════════════════════════════
// press_key — keyboard event dispatch (delegates to pageOps)
// ═══════════════════════════════════════════════════════════════════════════

async function toolPressKey({ tabId, key, modifiers, selector, timeoutMs, pollMs } = {}) {
  if (typeof key !== "string" || !key.length) {
    return { error: "key is required" }
  }
  let tab
  try {
    tab = await getTabById(tabId)
  } catch (e) {
    return { error: e?.message || "Tab not found" }
  }
  const normalizedModifiers = Array.isArray(modifiers)
    ? modifiers.map((m) => String(m)).filter(Boolean)
    : []
  try {
    const result = await runInPage(tab.id, "press_key", {
      key,
      modifiers: normalizedModifiers,
      selector,
      timeoutMs,
      pollMs,
    })
    if (!result?.ok) return { error: result?.error || "press_key failed" }
    return {
      tabId: tab.id,
      content: JSON.stringify({
        key,
        modifiers: normalizedModifiers,
        selectorUsed: result.selectorUsed || null,
      }),
    }
  } catch (e) {
    return { error: e?.message || "press_key failed" }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// network_requests — passive per-tab HTTP request observation (chrome.webRequest)
// ═══════════════════════════════════════════════════════════════════════════

const NETWORK_BUFFER_MAX = 200
/** @type {Map<number, {requests: any[]}>} */
const networkBuffers = new Map()
/** @type {Map<string, {url: string, method: string, type: string, timestamp: number, tabId: number}>} */
const networkInFlight = new Map()

function getOrCreateNetworkBuffer(tabId) {
  let buf = networkBuffers.get(tabId)
  if (!buf) {
    buf = { requests: [] }
    networkBuffers.set(tabId, buf)
  }
  return buf
}

function pushNetworkEntry(tabId, entry) {
  if (typeof tabId !== "number" || tabId < 0) return
  const buf = getOrCreateNetworkBuffer(tabId)
  buf.requests.push(entry)
  if (buf.requests.length > NETWORK_BUFFER_MAX) {
    buf.requests.splice(0, buf.requests.length - NETWORK_BUFFER_MAX)
  }
}

if (chrome.webRequest) {
  try {
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (details.tabId < 0) return
        networkInFlight.set(details.requestId, {
          url: details.url,
          method: details.method,
          type: details.type,
          timestamp: details.timeStamp,
          tabId: details.tabId,
        })
      },
      { urls: ["<all_urls>"] },
    )

    chrome.webRequest.onCompleted.addListener(
      (details) => {
        if (details.tabId < 0) return
        const start = networkInFlight.get(details.requestId)
        const startTs = start?.timestamp ?? details.timeStamp
        pushNetworkEntry(details.tabId, {
          id: String(details.requestId),
          url: details.url,
          method: details.method,
          statusCode: details.statusCode,
          type: details.type,
          timestamp: startTs,
          completedAt: details.timeStamp,
          durationMs: details.timeStamp - startTs,
          error: null,
        })
        networkInFlight.delete(details.requestId)
      },
      { urls: ["<all_urls>"] },
    )

    chrome.webRequest.onErrorOccurred.addListener(
      (details) => {
        if (details.tabId < 0) return
        const start = networkInFlight.get(details.requestId)
        const startTs = start?.timestamp ?? details.timeStamp
        pushNetworkEntry(details.tabId, {
          id: String(details.requestId),
          url: details.url,
          method: details.method,
          statusCode: 0,
          type: details.type,
          timestamp: startTs,
          completedAt: details.timeStamp,
          durationMs: details.timeStamp - startTs,
          error: details.error || "Request failed",
        })
        networkInFlight.delete(details.requestId)
      },
      { urls: ["<all_urls>"] },
    )
  } catch {
    // webRequest permission missing or already registered — skip silently
  }
}

if (chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    networkBuffers.delete(tabId)
    // Also drain any in-flight requests for this tab. Normally onCompleted /
    // onErrorOccurred clears the entry, but chrome occasionally drops the
    // terminal event when a tab is closed mid-request, leaking the entry.
    for (const [requestId, info] of networkInFlight) {
      if (info.tabId === tabId) networkInFlight.delete(requestId)
    }
  })
}

async function toolNetworkRequests({ tabId, method, statusCodeRegex, urlRegex, clear } = {}) {
  let tab
  try {
    tab = await getTabById(tabId)
  } catch (e) {
    return { error: e?.message || "Tab not found" }
  }

  const buf = networkBuffers.get(tab.id) || { requests: [] }
  const original = buf.requests.slice()
  let entries = original

  if (typeof method === "string" && method.trim()) {
    const want = method.trim().toUpperCase()
    entries = entries.filter((e) => (e.method || "").toUpperCase() === want)
  }

  if (typeof statusCodeRegex === "string" && statusCodeRegex.length) {
    let re
    try {
      re = new RegExp(statusCodeRegex)
    } catch (err) {
      return { error: `Invalid statusCodeRegex: ${err?.message || String(err)}` }
    }
    entries = entries.filter((e) => re.test(String(e.statusCode ?? "")))
  }

  if (typeof urlRegex === "string" && urlRegex.length) {
    let re
    try {
      re = new RegExp(urlRegex)
    } catch (err) {
      return { error: `Invalid urlRegex: ${err?.message || String(err)}` }
    }
    entries = entries.filter((e) => re.test(String(e.url ?? "")))
  }

  // Newest-first ordering for human / agent readability.
  entries = entries.slice().reverse()

  const truncated = original.length >= NETWORK_BUFFER_MAX

  const snapshot = {
    tabId: tab.id,
    requests: entries,
    truncated,
    bufferSize: original.length,
    bufferMax: NETWORK_BUFFER_MAX,
  }

  if (clear === true) {
    buf.requests.length = 0
  }

  return { tabId: tab.id, content: JSON.stringify(snapshot, null, 2) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Popup / extension messaging — profile management via chrome.runtime.onMessage
// ═══════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.action) return false

  if (message.action === "getProfiles") {
    getKnownProfiles().then((profiles) => {
      sendResponse({ profiles, statuses: getProfileStatuses() })
    })
    return true // async sendResponse
  }

  if (message.action === "addProfile") {
    addProfile(message.profile || "").then((result) => {
      sendResponse(result)
    })
    return true
  }

  if (message.action === "removeProfile") {
    removeProfile(message.profile || "").then((result) => {
      sendResponse(result)
    })
    return true
  }

  if (message.action === "reconnectProfile") {
    const profile = (message.profile || "").toLowerCase().replace(/[^a-z0-9]/g, "_")
    connectProfile(profile).then((connected) => {
      sendResponse({ connected, statuses: getProfileStatuses() })
    })
    return true
  }

  if (message.action === "reconnectAll") {
    connectAllProfiles().then(() => {
      sendResponse({ statuses: getProfileStatuses() })
    })
    return true
  }

  return false
})

// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle — keepalive, startup, reconnect
// ═══════════════════════════════════════════════════════════════════════════

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.25 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    reconnectDisconnected().catch(() => {})
  }
})

chrome.runtime.onInstalled.addListener(() => connectAllProfiles().catch(() => {}))
chrome.runtime.onStartup.addListener(() => connectAllProfiles().catch(() => {}))

if (chrome.permissions?.onAdded) {
  chrome.permissions.onAdded.addListener(() => connectAllProfiles().catch(() => {}))
}

// Initial connection on service worker load
connectAllProfiles().catch(() => {})
