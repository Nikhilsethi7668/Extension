/**
 * Human-Mimicry Form Filler for Facebook Marketplace
 * 
 * This content script runs on Facebook Marketplace's "Create Listing" page.
 * It simulates human typing with randomized delays to avoid bot detection.
 * 
 * Features:
 * - Randomized typing speed (50-200ms per character)
 * - Proper React event triggering (input, change, blur)
 * - Mouse movement simulation
 * - Natural pauses between fields
 * - Clipboard paste detection avoidance
 */

// Configuration
const CONFIG = {
  typingSpeedMin: 50,  // Minimum delay between characters (ms)
  typingSpeedMax: 200, // Maximum delay between characters (ms)
  fieldDelayMin: 500,  // Minimum delay between fields (ms)
  fieldDelayMax: 1500, // Maximum delay between fields (ms)
  errorRate: 0.02      // 2% chance of typo that gets corrected
}

// Utility: Random delay
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Utility: Wait for specified time
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Simulate human typing with typos and corrections
async function humanType(element: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
  element.focus()
  
  // Clear existing value slowly
  while (element.value.length > 0) {
    element.value = element.value.slice(0, -1)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(randomDelay(30, 80))
  }

  // Type each character
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    
    // Simulate occasional typo
    if (Math.random() < CONFIG.errorRate && i < text.length - 1) {
      // Type wrong character
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1)
      element.value += wrongChar
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: wrongChar }))
      await sleep(randomDelay(100, 200))
      
      // Backspace to correct
      element.value = element.value.slice(0, -1)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
      await sleep(randomDelay(50, 100))
    }
    
    // Type correct character
    element.value += char
    
    // Trigger React-friendly events
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new InputEvent('input', { 
      bubbles: true, 
      inputType: 'insertText', 
      data: char 
    }))
    
    // Random delay between characters
    await sleep(randomDelay(CONFIG.typingSpeedMin, CONFIG.typingSpeedMax))
  }
  
  // Trigger change and blur events
  element.dispatchEvent(new Event('change', { bubbles: true }))
  element.dispatchEvent(new Event('blur', { bubbles: true }))
  
  console.log(`✅ Typed: ${text.substring(0, 30)}...`)
}

// Find input by multiple selectors
function findInput(...selectors: string[]): HTMLInputElement | HTMLTextAreaElement | null {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
    if (element) {
      console.log(`✅ Found element: ${selector}`)
      return element
    }
  }
  console.warn(`⚠️ Could not find element with selectors: ${selectors.join(', ')}`)
  return null
}

// Simulate mouse movement to element
async function moveMouseToElement(element: HTMLElement): Promise<void> {
  const rect = element.getBoundingClientRect()
  const mouseEvent = new MouseEvent('mouseover', {
    bubbles: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  })
  element.dispatchEvent(mouseEvent)
  await sleep(randomDelay(100, 300))
}

// Click element naturally
async function clickElement(element: HTMLElement): Promise<void> {
  await moveMouseToElement(element)
  element.click()
  await sleep(randomDelay(200, 400))
}

// Main form filling function
async function fillFacebookMarketplaceForm(vehicleData: {
  title: string
  price: number
  description: string
  mileage: number
  year: number
  vin: string
  images?: string[]
}): Promise<boolean> {
  try {
    console.log('🚀 Starting form fill with vehicle data:', vehicleData)
    
    // Wait for page to fully load
    await sleep(1000)
    
    // Title field (multiple possible selectors)
    const titleInput = findInput(
      'input[aria-label="Title"]',
      'input[placeholder*="Title"]',
      'input[name="title"]',
      'input[type="text"][class*="title"]'
    )
    
    if (titleInput) {
      await moveMouseToElement(titleInput)
      await clickElement(titleInput)
      await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
      await humanType(titleInput, vehicleData.title)
    }
    
    // Price field
    await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
    const priceInput = findInput(
      'input[aria-label="Price"]',
      'input[placeholder*="Price"]',
      'input[name="price"]',
      'input[type="number"]'
    )
    
    if (priceInput) {
      await moveMouseToElement(priceInput)
      await clickElement(priceInput)
      await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
      await humanType(priceInput, vehicleData.price.toString())
    }
    
    // Description field
    await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
    const descriptionInput = findInput(
      'textarea[aria-label="Description"]',
      'textarea[placeholder*="Description"]',
      'textarea[name="description"]',
      'div[contenteditable="true"][aria-label*="Description"]'
    ) as HTMLTextAreaElement
    
    if (descriptionInput) {
      await moveMouseToElement(descriptionInput)
      await clickElement(descriptionInput)
      await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
      await humanType(descriptionInput, vehicleData.description)
    }
    
    // Mileage field
    await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
    const mileageInput = findInput(
      'input[aria-label="Mileage"]',
      'input[placeholder*="Mileage"]',
      'input[name="mileage"]'
    )
    
    if (mileageInput) {
      await moveMouseToElement(mileageInput)
      await clickElement(mileageInput)
      await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
      await humanType(mileageInput, vehicleData.mileage.toString())
    }
    
    // Year field
    await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
    const yearInput = findInput(
      'input[aria-label="Year"]',
      'input[placeholder*="Year"]',
      'input[name="year"]'
    )
    
    if (yearInput) {
      await moveMouseToElement(yearInput)
      await clickElement(yearInput)
      await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
      await humanType(yearInput, vehicleData.year.toString())
    }
    
    // VIN field (if available)
    await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
    const vinInput = findInput(
      'input[aria-label="VIN"]',
      'input[placeholder*="VIN"]',
      'input[name="vin"]'
    )
    
    if (vinInput) {
      await moveMouseToElement(vinInput)
      await clickElement(vinInput)
      await sleep(randomDelay(CONFIG.fieldDelayMin, CONFIG.fieldDelayMax))
      await humanType(vinInput, vehicleData.vin)
    }
    
    console.log('✅ Form filling complete!')
    return true
    
  } catch (error) {
    console.error('❌ Error filling form:', error)
    return false
  }
}

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Received message:', request)
  
  if (request.action === 'FILL_FACEBOOK_FORM') {
    fillFacebookMarketplaceForm(request.vehicle)
      .then(success => {
        sendResponse({ success, message: success ? 'Form filled successfully' : 'Form filling failed' })
      })
      .catch(error => {
        sendResponse({ success: false, message: error.message })
      })
    
    // Return true to indicate async response
    return true
  }
  
  if (request.action === 'PING') {
    sendResponse({ success: true, message: 'Content script is active' })
  }
})

// Inject a visual indicator that the extension is active
const indicator = document.createElement('div')
indicator.id = 'autobridge-indicator'
indicator.innerHTML = `
  <div style="
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 8px;
  ">
    <span style="
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      animation: pulse 2s infinite;
    "></span>
    AutoBridge Ready
  </div>
  <style>
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
`
document.body.appendChild(indicator)

// Remove indicator after 5 seconds
setTimeout(() => {
  indicator.style.transition = 'opacity 0.5s'
  indicator.style.opacity = '0'
  setTimeout(() => indicator.remove(), 500)
}, 5000)

console.log('🚀 AutoBridge Human-Mimicry Content Script Loaded')

export {}
