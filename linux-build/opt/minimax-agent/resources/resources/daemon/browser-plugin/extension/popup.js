/**
 * Mavis Browser Bridge — Popup UI for multi-profile management.
 *
 * Communicates with background.js via chrome.runtime.sendMessage to:
 * - List known profiles and their connection statuses
 * - Add new profiles (test connection via connectNative)
 * - Remove profiles
 * - Reconnect individual or all profiles
 */

const profileListEl = document.getElementById("profileList")
const newProfileInput = document.getElementById("newProfileInput")
const addProfileBtn = document.getElementById("addProfileBtn")
const reconnectAllBtn = document.getElementById("reconnectAllBtn")
const statusMsgEl = document.getElementById("statusMsg")
const headerBadge = document.getElementById("headerBadge")

function showStatus(msg, isError) {
  statusMsgEl.textContent = msg
  statusMsgEl.style.color = isError ? "#dc2626" : "#6b7280"
  if (msg) setTimeout(() => { if (statusMsgEl.textContent === msg) statusMsgEl.textContent = "" }, 3000)
}

function updateHeaderBadge(statuses) {
  const total = statuses.length
  const connected = statuses.filter((s) => s.connected).length

  if (total === 0) {
    headerBadge.textContent = "no profiles"
    headerBadge.className = "badge badge-off"
  } else if (connected === total) {
    headerBadge.textContent = `${connected} connected`
    headerBadge.className = "badge badge-ok"
  } else if (connected > 0) {
    headerBadge.textContent = `${connected}/${total} connected`
    headerBadge.className = "badge badge-partial"
  } else {
    headerBadge.textContent = "offline"
    headerBadge.className = "badge badge-off"
  }
}

function renderProfiles(profiles, statuses) {
  profileListEl.innerHTML = ""
  const statusMap = new Map()
  for (const s of statuses) statusMap.set(s.profile, s.connected)

  if (profiles.length === 0) {
    profileListEl.innerHTML = '<li class="empty">No profiles configured</li>'
    updateHeaderBadge([])
    return
  }

  for (const profile of profiles) {
    const connected = statusMap.get(profile) || false
    const li = document.createElement("li")
    li.className = "profile-item"
    li.innerHTML = `
      <span class="profile-name">
        <span class="dot ${connected ? "dot-green" : "dot-red"}"></span>
        ${escapeHtml(profile)}
      </span>
      <span class="profile-actions">
        <button class="btn-sm" data-action="reconnect" data-profile="${escapeAttr(profile)}">↻</button>
        <button class="btn-sm btn-danger" data-action="remove" data-profile="${escapeAttr(profile)}">✕</button>
      </span>
    `
    profileListEl.appendChild(li)
  }

  updateHeaderBadge(statuses)
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

function refreshProfiles() {
  chrome.runtime.sendMessage({ action: "getProfiles" }, (response) => {
    if (response) renderProfiles(response.profiles || [], response.statuses || [])
  })
}

// Add profile
addProfileBtn.addEventListener("click", () => {
  const name = newProfileInput.value.trim()
  if (!name) { showStatus("Enter a profile name", true); return }

  addProfileBtn.disabled = true
  showStatus("Connecting...")

  chrome.runtime.sendMessage({ action: "addProfile", profile: name }, (result) => {
    addProfileBtn.disabled = false
    if (!result) { showStatus("Failed to communicate with background", true); return }

    if (result.added) {
      if (result.connected) {
        showStatus(`Profile "${name}" added and connected`)
      } else {
        showStatus(`Profile "${name}" added but not connected — run: mavis browser install`, true)
      }
      newProfileInput.value = ""
    } else {
      showStatus(`Profile "${name}" already exists`)
    }
    refreshProfiles()
  })
})

newProfileInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addProfileBtn.click()
})

// Profile actions (reconnect, remove) via event delegation
profileListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]")
  if (!btn) return

  const action = btn.dataset.action
  const profile = btn.dataset.profile

  if (action === "reconnect") {
    chrome.runtime.sendMessage({ action: "reconnectProfile", profile }, (result) => {
      if (result?.connected) showStatus(`Reconnected to ${profile}`)
      else showStatus(`Failed to reconnect to ${profile}`, true)
      refreshProfiles()
    })
  }

  if (action === "remove") {
    chrome.runtime.sendMessage({ action: "removeProfile", profile }, () => {
      showStatus(`Removed profile "${profile}"`)
      refreshProfiles()
    })
  }
})

// Reconnect all
reconnectAllBtn.addEventListener("click", () => {
  showStatus("Reconnecting all...")
  chrome.runtime.sendMessage({ action: "reconnectAll" }, () => {
    showStatus("Reconnected")
    refreshProfiles()
  })
})

// Initial load
refreshProfiles()
