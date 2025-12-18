/**
 * Background Service Worker for AutoBridge Extension
 * Handles API communication and message routing between sidepanel and content scripts
 */

import type { PlasmoMessaging } from "@plasmohq/messaging"

const API_URL = process.env.PLASMO_PUBLIC_API_URL || "https://autobridge-backend.dchatpar.workers.dev/api"

// Handle side panel opening
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error))

// Listen for messages from sidepanel and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request)

  // Forward form fill requests to active tab
  if (request.action === "FILL_FACEBOOK_FORM") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          sendResponse(response)
        })
      } else {
        sendResponse({ success: false, message: "No active tab found" })
      }
    })
    return true // Keep channel open for async response
  }

  // API proxy requests
  if (request.action === "API_CALL") {
    handleApiCall(request.endpoint, request.method, request.data, request.token)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ success: false, message: error.message }))
    return true
  }

  return false
})

// API call helper
async function handleApiCall(
  endpoint: string,
  method: string = "GET",
  data: any = null,
  token: string = ""
): Promise<any> {
  const url = `${API_URL}${endpoint}`
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` })
    }
  }

  if (data && (method === "POST" || method === "PATCH" || method === "PUT")) {
    options.body = JSON.stringify(data)
  }

  const response = await fetch(url, options)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.message || `API error: ${response.status}`)
  }

  return result
}

// Notification helper
function showNotification(title: string, message: string) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "/icon.png",
    title,
    message
  })
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    showNotification(
      "AutoBridge Installed",
      "Click the extension icon to open the side panel and get started!"
    )
  }
})

console.log("AutoBridge background service worker loaded")

export {}
