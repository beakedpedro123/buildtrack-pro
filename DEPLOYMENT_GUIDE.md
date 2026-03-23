# BuildTrack Pro - Backend Deployment Guide

This guide walks you through deploying the BuildTrack Pro backend server so your iOS app can access your employee data.

## Overview

Your app currently works in the sandbox with all your data. To make it work on your employees' iOS devices, you need to:

1. Deploy the backend server to a public hosting service
2. Update the app to point to your deployed backend
3. Rebuild and resubmit to the App Store

## Step 1: Choose a Hosting Service

We recommend **Railway** (easiest) or **Render** (also free tier). Both support Node.js and MySQL.

### Option A: Railway (Recommended)

1. Go to https://railway.app
2. Sign up with GitHub (or email)
3. Create a new project
4. Click "Deploy from GitHub repo"
5. Connect your GitHub account and select this repository
6. Railway will auto-detect the Node.js app and deploy it

### Option B: Render

1. Go to https://render.com
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect your GitHub repo
5. Set build command: `npm run build`
6. Set start command: `npm start`
7. Add environment variables (see Step 2)

## Step 2: Set Up Database

Your app uses MySQL. Both Railway and Render offer managed MySQL:

### Railway:
1. In your Railway project, click "New"
2. Select "MySQL"
3. Railway will auto-create a database and set `DATABASE_URL` env var

### Render:
1. Create a new MySQL database
2. Copy the connection string
3. Add as `DATABASE_URL` environment variable in your Web Service

## Step 3: Get Your Backend URL

After deployment, you'll get a public URL like:
- Railway: `https://buildtrack-pro-production.up.railway.app`
- Render: `https://buildtrack-pro.onrender.com`

**Save this URL** — you'll need it in Step 4.

## Step 4: Update the App Configuration

Once your backend is deployed, update the app to point to it:

1. In the sandbox, I'll update the app's environment variable:
   ```
   EXPO_PUBLIC_API_BASE_URL=https://your-backend-url.com
   ```

2. Rebuild the app:
   ```bash
   eas build --platform ios --profile production
   ```

3. Submit to App Store:
   ```bash
   eas submit --platform ios
   ```

## Step 5: Invite Your Team to TestFlight

Once the build is submitted to App Store Connect:

1. Go to https://appstoreconnect.apple.com
2. Navigate to BuildTrack Pro → TestFlight
3. Click "Internal Testing"
4. Add your employees' email addresses
5. They'll receive TestFlight invitations

## Troubleshooting

### "Database connection failed"
- Verify `DATABASE_URL` is set correctly in your hosting service
- Check that the database is running and accessible

### "App can't connect to backend"
- Verify the backend URL is correct in `EXPO_PUBLIC_API_BASE_URL`
- Check that CORS is enabled (it is by default in your server)
- Test the URL in your browser: `https://your-backend-url.com/api/health`

### "Build failed after updating API URL"
- Clear cache: `rm -rf node_modules .expo && npm install`
- Try again: `eas build --platform ios --profile production`

## Database Export (If Needed)

Your current database is in the sandbox. To export it:

```bash
# In the sandbox
npm run db:push  # Ensures schema is up to date

# Export data (if using MySQL directly)
mysqldump -u root -p construction_manager > backup.sql
```

Then import into your deployed database.

## Next Steps

1. Choose a hosting service (Railway or Render)
2. Deploy the backend
3. Get your backend URL
4. Tell me the URL and I'll update the app
5. Rebuild and submit to App Store
6. Invite your team to TestFlight

**Questions?** Let me know and I'll help you through any step!
