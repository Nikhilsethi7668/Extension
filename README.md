# Facebook Marketplace Vehicle Listing System

Complete Chrome Extension with AI-powered image editing, multi-user management, and centralized admin control.

## 🚀 Features

### Chrome Extension
- **Multi-Site Scraper**: Autotrader, Cars.com, CarGurus
- **Auto-Fill Agent**: Facebook Marketplace form filling with human-like typing
- **AI Image Editing**: Gemini-powered enhancements; batch edits supported
- **Queue Management**: Local queue for multiple listings
- **Post Verification**: Redundant checks to handle false positives

### Backend System
- **Multi-User Infrastructure**: Track all users with unique `user_id`
- **Comprehensive Logging**: user_id, fb_profile_name, vehicle_vin, listing_url, image_edit_prompts, browser metadata
- **Firebase Integration**: Firestore + Firebase Storage
- **Gemini API**: AI image editing and description generation
- **JWT Authentication**: Token-based auth with roles
- **RESTful API**: Endpoints for extension + admin dashboard

### Admin Dashboard
- **Real-Time Monitoring**: Live feed of posts and activities
- **User Management**: Activate/deactivate users, view history
- **Activity Logs**: Filtering and search
- **Analytics**: Charts for post volume and success rates
- **Responsive UI**: React + MUI

## 📁 Project Structure

```
facebookmark/
├── chrome-extension/
│   ├── manifest.json
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── content/
│   │   ├── autotrader-scraper.js
│   │   ├── cars-scraper.js
│   │   ├── cargurus-scraper.js
│   │   ├── facebook-autofill.js
│   │   └── facebook-profile-extractor.js
│   ├── background/
│   │   └── service-worker.js
│   └── utils/
│       ├── browser-metadata.js
│       └── image-editor.js
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   └── README.md
└── admin-dashboard/
    ├── src/
    │   ├── AdminDashboard.jsx
    │   └── index.jsx
    ├── public/
    │   └── index.html
    ├── package.json
    └── README.md
```

## 🛠️ Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env
# fill FIREBASE_* GEMINI_API_KEY JWT_SECRET
npm start
```

### Chrome Extension
1) Open `chrome://extensions`
2) Enable Developer Mode
3) Load unpacked → select `chrome-extension` folder

### Admin Dashboard
```bash
cd admin-dashboard
npm install
# set API_URL in src/AdminDashboard.jsx
npm start
```

## 🔑 Auth
- Create admin user via backend `/api/auth/register` with `role: "admin"`
- Login in admin dashboard with admin credentials
- Extension users authenticate via popup or API

## 📊 Logging Payload (example)
```json
{
  "user_id": "salesperson1",
  "fb_profile_name": "John Doe",
  "vehicle_vin": "1HGBH41JXMN109186",
  "listing_url": "https://facebook.com/marketplace/item/123",
  "image_edit_prompts": ["Remove background", "Enhance lighting"],
  "action": "post_completed",
  "success": true,
  "browserMetadata": {
    "browserFingerprint": "abc123",
    "screenResolution": "1920x1080",
    "timezone": "America/New_York",
    "cpuCores": 8
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🤖 AI Image Editing
- Uses Gemini API
- Sample prompts: "Remove background", "Enhance lighting", "Studio background", "Blur background"
- Batch endpoint `/api/ai/batch-edit-images`

## 🔒 Security
- JWT auth with roles (admin/user)
- Password hashing (bcrypt)
- CORS configured per environment
- Input validation; planned rate limiting

## 🧭 Admin Dashboard Views
- Dashboard: metrics + last 7 days chart + recent activity
- Users: activate/deactivate, view per-user logs
- Logs: filterable activity table

## 🛠️ Troubleshooting
- Backend connection: check API_URL, JWT_SECRET, Firebase creds
- Scraping issues: site DOM changes; update selectors
- Facebook auto-fill: ensure MutationObserver triggers and delays are not too short
- Gemini errors: verify GEMINI_API_KEY and quota

## 📄 License
Proprietary - Internal use only
