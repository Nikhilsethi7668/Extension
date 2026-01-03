// instagram-ad-poster.js
(function() {
    'use strict';

    console.log('Instagram Ad Poster script loaded');

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function findAndClick(selector, description) {
        console.log(`Looking for ${description}...`);
        const element = document.querySelector(selector);
        if (element) {
            console.log(`Found ${description}, clicking...`);
            element.click();
            return true;
        }
        return false;
    }

    async function findByTextAndClick(tag, text, description) {
        console.log(`Looking for ${description} by text "${text}"...`);
        const elements = document.querySelectorAll(tag);
        for (const el of elements) {
            if (el.textContent.trim() === text || el.innerText.trim() === text) {
                console.log(`Found ${description}, clicking...`);
                el.click();
                return true;
            }
        }
        return false;
    }
    
    // Specifically finds the "Ad" option which might be complex HTML
    async function findAdOption() {
        console.log("Looking for 'Ad' menu option...");
        
        // Strategy 1: Look for specific structure provided in snippet
        // The user snippet showed a span with "Ad" inside a complex div structure
        const spans = document.querySelectorAll('span');
        for (const span of spans) {
            if (span.textContent.trim() === 'Ad') {
                // Walk up to the clickable anchor or role="button"
                const clickable = span.closest('a') || span.closest('[role="button"]') || span.closest('[role="link"]');
                if (clickable) {
                    console.log("Found 'Ad' option, clicking...");
                    clickable.click();
                    return true;
                }
            }
        }
        
        // Strategy 2: aria-label="Ad"
        const ariaAd = document.querySelector('[aria-label="Ad"]');
        if (ariaAd) {
             console.log("Found 'Ad' option by aria-label, clicking...");
             ariaAd.click();
             return true;
        }

        return false;
    }

    async function runAutomation() {
        try {
            // Step 1: Click "New post"
            // Look for SVG title "New post" or aria-label
            let newPostFound = false;
            
            // Try SVG title first
            const titles = document.querySelectorAll('svg title');
            for (const title of titles) {
                if (title.textContent === 'New post') {
                    const btn = title.closest('[role="button"]') || title.closest('div[aria-selected]');
                    if (btn) {
                        btn.click();
                        newPostFound = true;
                        break;
                    }
                }
            }

            if (!newPostFound) {
                 // Try aria-label
                 const btn = document.querySelector('[aria-label="New post"]');
                 if (btn) {
                     btn.click();
                     newPostFound = true;
                 }
            }

            if (!newPostFound) {
                // Fallback: Try looking for the "plus" icon wrapper class from user snippet if generic fails, 
                // but generic is safer. Let's try one more generic approach.
                // The snippet has `class="x9f619 xxk0z11 xii2z7h x11xpdln x19c4wfv xvy4d1p"`
                console.warn('Could not find "New post" button by accessible names.');
                alert('Could not find "New post" button. Please check if you are on the right page.');
                return;
            }

            // Wait for menu to open
            await sleep(1000);

            // Step 2: Click "Ad"
            const adFound = await findAdOption();
            if (!adFound) {
                 console.warn('Could not find "Ad" option in menu.');
                 alert('Could not find "Ad" option. Please make sure the "New post" menu opened.');
                 return;
            }
            
            // Wait for next menu/dialog
            await sleep(1000);

            // Step 3: Click "Run an ad that won't show on profile"
            // This is text content inside a span/div
            let finalOptionFound = false;
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                // Check direct text node or simple children
                if (el.textContent.includes("Run an ad that won't show on profile")) {
                     // Check if this is the deepest element or clickable
                     // We want the clickable container usually
                     const clickable = el.closest('[role="button"]') || el.closest('[role="link"]') || el.closest('div[class*="x1i10hfl"]'); // fallback to a known interactive class part if accessible roles fail
                     
                     // If we found a clickable container, use it. If not, click the text element itself as fallback.
                     (clickable || el).click();
                     finalOptionFound = true;
                     console.log("Found 'Run an ad...' option, clicking...");
                     break;
                }
            }

            if (!finalOptionFound) {
                console.warn('Could not find "Run an ad..." option.');
                alert('Could not find the "Run an ad that won\'t show on profile" option.');
                return;
            }
            
            console.log('Automation sequence completed successfully.');

        } catch (error) {
            console.error('Error in Instagram Ad Poster automation:', error);
            alert('An error occurred during automation: ' + error.message);
        }
    }

    runAutomation();
})();
