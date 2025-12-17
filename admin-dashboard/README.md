# Admin Dashboard

React-based admin control panel for the Vehicle Listing System.

## Features

- **Real-time Dashboard**: Live feed of all user posts and activity
- **User Management**: Activate/deactivate users, view post history
- **Activity Logs**: Comprehensive audit trail with filtering
- **Analytics**: Charts showing post volume, success rates, AI usage
- **Responsive Design**: Works on desktop and mobile

## Setup

1. Install dependencies:
```bash
cd admin-dashboard
npm install
```

2. Configure API endpoint:
Edit `src/AdminDashboard.jsx` and set `API_URL` to your backend URL (default: `http://localhost:3001/api`)

3. Start development server (uses PORT=3002 via .env):
```bash
npm start
```

4. Build for production:
```bash
npm run build
```

## Admin Access

Login with an admin account created in the backend:
- User ID: Your admin userId
- Password: Set in backend

## Components

- **DashboardView**: Overview with stats and charts
- **UsersView**: User table with status controls
- **LogsView**: Activity log viewer with filtering
- **LoginPage**: Authentication

## Auto-refresh

Dashboard data refreshes every 30 seconds automatically.
