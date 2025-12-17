// facebook-profile-extractor.js
// Extracts Facebook profile information from the page

(function() {
  'use strict';

  console.log('Facebook Profile Extractor loaded');

  // Listen for profile extraction requests
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getFacebookProfile') {
      try {
        const profile = extractFacebookProfile();
        sendResponse({ success: true, ...profile });
      } catch (error) {
        console.error('Profile extraction error:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });

  /**
   * Extract Facebook profile information from DOM
   * @returns {Object} Profile data
   */
  function extractFacebookProfile() {
    const profile = {
      profileName: null,
      profileId: null,
      profileUrl: null,
      isLoggedIn: false
    };

    // Check if user is logged in
    const loggedInIndicators = [
      document.querySelector('[aria-label="Account"]'),
      document.querySelector('[data-pagelet="LeftRail"]'),
      document.cookie.includes('c_user=')
    ];

    profile.isLoggedIn = loggedInIndicators.some(indicator => !!indicator);

    if (!profile.isLoggedIn) {
      return profile;
    }

    try {
      // Method 1: Extract from profile link in navigation
      const profileLink = document.querySelector('a[href*="/profile.php"], a[aria-label*="Profile"]');
      if (profileLink) {
        profile.profileUrl = profileLink.href;
        
        // Extract profile ID from URL
        const urlMatch = profileLink.href.match(/profile\.php\?id=(\d+)/);
        if (urlMatch) {
          profile.profileId = urlMatch[1];
        }
        
        // Get profile name from aria-label or text
        profile.profileName = profileLink.getAttribute('aria-label') || 
                             profileLink.textContent.trim();
      }

      // Method 2: Extract from account menu
      const accountMenu = document.querySelector('[aria-label="Account"]');
      if (accountMenu && !profile.profileName) {
        const nameElement = accountMenu.querySelector('[dir="auto"]');
        if (nameElement) {
          profile.profileName = nameElement.textContent.trim();
        }
      }

      // Method 3: Extract from meta tags
      if (!profile.profileName) {
        const metaTag = document.querySelector('meta[property="og:title"]');
        if (metaTag) {
          profile.profileName = metaTag.content;
        }
      }

      // Method 4: Extract ID from cookies
      if (!profile.profileId) {
        const cookies = document.cookie.split(';');
        const userCookie = cookies.find(c => c.trim().startsWith('c_user='));
        if (userCookie) {
          profile.profileId = userCookie.split('=')[1];
        }
      }

      // Method 5: Extract from page source (last resort)
      if (!profile.profileName || !profile.profileId) {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent;
          
          if (!profile.profileId && text.includes('"USER_ID":"')) {
            const match = text.match(/"USER_ID":"(\d+)"/);
            if (match) profile.profileId = match[1];
          }
          
          if (!profile.profileName && text.includes('"NAME":"')) {
            const match = text.match(/"NAME":"([^"]+)"/);
            if (match) profile.profileName = match[1];
          }
        }
      }

    } catch (error) {
      console.error('Error extracting profile:', error);
    }

    return profile;
  }

})();
