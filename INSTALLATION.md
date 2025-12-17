# Installation Guide

## Quick Start

Follow these steps to get your Vehicle Auto-Lister extension up and running.

## Prerequisites

- Google Chrome browser (version 88 or higher)
- Node.js (version 16 or higher)
- Firebase account (free tier works)
- Text editor (VS Code recommended)

## Step 1: Download & Setup Extension Files

1. Download or clone the extension files to your computer
2. Create placeholder icon files in the `icons/` folder:
   - icon16.png (16x16 pixels)
   - icon32.png (32x32 pixels)
   - icon48.png (48x48 pixels)
   - icon128.png (128x128 pixels)

   **Note**: You can use any vehicle or marketplace-themed icons, or generate them using online tools.

## Step 2: Load Extension in Chrome

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Select the `facebookmark` folder
6. The extension icon should appear in your Chrome toolbar

## Step 3: Setup Firebase Backend

### Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"**
3. Enter project name (e.g., "vehicle-auto-lister")
4. Disable Google Analytics (optional)
5. Click **"Create project"**

### Enable Firestore

1. In Firebase Console, click **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in production mode"**
4. Select your preferred location
5. Click **"Enable"**

### Create Firestore Collections

In Firestore, create these collections:

**Collection: `users`**
- Click "Start collection"
- Collection ID: `users`
- Add first document manually:
  - Document ID: `admin` (or your preferred admin ID)
  - Fields:
    ```
    email: "admin@example.com"
    passwordHash: [generate using bcrypt - see below]
    role: "admin"
    status: "active"
    createdAt: [current timestamp]
    postCount: 0
    permissions: []
    ```

**Collection: `activityLogs`**
- Click "Start collection"
- Collection ID: `activityLogs`
- Let it auto-create (will populate when extension is used)

### Generate Password Hash

Use this Node.js script to generate a password hash:

```javascript
const bcrypt = require('bcrypt');
const password = 'your-secure-password';
bcrypt.hash(password, 10).then(hash => console.log(hash));
```

Or use an online bcrypt generator (search "bcrypt generator online").

### Get Firebase Credentials

1. In Firebase Console, click the gear icon ⚙️ > **"Project settings"**
2. Go to **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Download the JSON file
5. Save the following from the JSON file:
   - `project_id`
   - `client_email`
   - `private_key`

## Step 4: Setup Backend Server

### Install Dependencies

```bash
cd backend
npm install
```

### Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file with your credentials:
   ```env
   PORT=3000
   NODE_ENV=development
   
   # Generate a random string for JWT secret
   JWT_SECRET=your-super-secret-random-string-here
   
   # Firebase credentials from JSON file
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"
   FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
   ```

### Start the Server

```bash
npm start
```

You should see: `Server running on port 3001`

### Test the Server

Open your browser and visit: `http://localhost:3001/api/users`

If you see an authentication error, the server is working!

## Step 5: Connect Extension to Backend

1. Open `popup/popup.js` in your text editor
2. Find the `API_CONFIG` object (around line 5)
3. Update the `baseUrl`:
   ```javascript
    const API_CONFIG = {
       baseUrl: 'http://localhost:3001/api', // For local development
     // OR for production:
     // baseUrl: 'https://your-deployed-backend.herokuapp.com/api',
     endpoints: {
       // ... rest of config
     }
   };
   ```
4. Save the file
5. Go to `chrome://extensions/` and click the refresh icon on your extension

## Step 6: Test the Extension

### Login Test

1. Click the extension icon in Chrome toolbar
2. Enter credentials:
   - User ID: `admin` (or whatever you set in Firestore)
   - Password: [the password you hashed]
3. Click **"Login"**
4. Status should change to "Active"

### Scraping Test

1. Navigate to any vehicle listing on:
   - [Autotrader.com](https://www.autotrader.com)
   - [Cars.com](https://www.cars.com)
   - [CarGurus.com](https://www.cargurus.com)
2. Click the extension icon
3. Click **"Scrape Current Page"**
4. Verify that vehicle data appears

### Facebook Test (Optional)

**Warning**: Test carefully to avoid Facebook account issues.

1. Scrape a vehicle
2. Fill in posting configuration
3. Click **"Add to Queue"** (safer than posting immediately)
4. Review the queue
5. When ready, navigate to Facebook Marketplace manually
6. Click **"Post to Facebook"** to test auto-fill

## Step 7: Create Additional Users

### Via Backend API

Use Postman, Insomnia, or curl:

```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "userId": "user1",
    "password": "SecurePassword123",
    "email": "user1@example.com",
    "role": "user"
  }'
```

### Via Firestore Console

1. Go to Firestore Console
2. Select `users` collection
3. Click **"Add document"**
4. Fill in user fields (remember to hash the password first!)

## Troubleshooting

### Extension won't load
- Make sure all required files are present
- Check for syntax errors in JSON files
- Ensure icon files exist in `icons/` folder

### Backend won't start
- Verify Node.js is installed: `node --version`
- Check that all dependencies installed: `npm install`
- Ensure `.env` file exists and has correct values
- Check Firebase credentials are properly formatted

### Can't login
- Verify user exists in Firestore `users` collection
- Ensure password hash is correct
- Check backend server is running
- Verify API URL in `popup.js` is correct
- Check browser console for errors (F12 > Console)

### Scraping doesn't work
- Make sure you're on a vehicle detail page (not search results)
- Check browser console for errors
- Website structure may have changed (update selectors)
- Try refreshing the page and scraping again

### Facebook auto-fill fails
- Facebook's structure changes frequently
- DOM detection may need adjustment
- Facebook may detect automation (use carefully)
- Try filling fields manually if auto-fill fails

## Next Steps

1. **Customize the UI**: Edit `popup/popup.html` and `popup/popup.css`
2. **Add AI Integration**: Configure OpenAI or Gemini API in backend
3. **Deploy Backend**: Use Heroku, AWS, or other hosting service
4. **Add More Features**: Extend scrapers, add new sites, improve auto-fill
5. **Create User Documentation**: Help users understand features

## Production Deployment

### Deploy Backend to Heroku

```bash
# Install Heroku CLI
# Login to Heroku
heroku login

# Create new app
heroku create vehicle-auto-lister

# Set environment variables
heroku config:set JWT_SECRET=your-secret
heroku config:set FIREBASE_PROJECT_ID=your-id
# ... set all other env vars

# Deploy
git init
git add .
git commit -m "Initial commit"
heroku git:remote -a vehicle-auto-lister
git push heroku main
```

### Update Extension for Production

1. Update `API_CONFIG.baseUrl` in `popup/popup.js` to production URL
2. Reload extension in Chrome
3. Test all features with production backend

### Publish to Chrome Web Store

1. Create developer account ($5 fee)
2. Prepare extension package (zip all files)
3. Create store listing with screenshots
4. Submit for review (usually 1-3 days)

## Support

If you encounter issues:
1. Check browser console for errors (F12)
2. Check backend logs
3. Review Firebase permissions
4. Verify all credentials are correct
5. Search GitHub issues or create a new one

---

**Congratulations!** Your Vehicle Auto-Lister extension is now installed and ready to use.
