# 💒 Wedding Budget Tracker — Firebase Setup Guide

Follow these steps to get your app live with real-time collaboration.

---

## Step 1: Create a Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Create a project"** (or "Add project")
3. Name it `wedding-budget` (or anything you like)
4. Disable Google Analytics (optional, not needed) → Click **"Create project"**
5. Wait for it to finish, then click **"Continue"**

---

## Step 2: Enable Authentication

1. In the Firebase console sidebar, click **Build → Authentication**
2. Click **"Get started"**
3. Under **Sign-in method** tab, enable these two providers:

### Email/Password:
- Click **Email/Password** → Toggle **Enable** → Click **Save**

### Google:
- Click **Google** → Toggle **Enable**
- Enter a **support email** (your email)
- Click **Save**

---

## Step 3: Create Realtime Database

1. In the sidebar, click **Build → Realtime Database**
2. Click **"Create Database"**
3. Choose a location (pick the closest to you) → Click **"Next"**
4. Select **"Start in test mode"** → Click **"Enable"**

### Set Security Rules:
After creating the database, click the **"Rules"** tab and paste this:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "weddings": {
      "$weddingId": {
        ".read": "auth != null && root.child('weddings').child($weddingId).child('members').child(auth.uid).exists()",
        ".write": "auth != null && root.child('weddings').child($weddingId).child('members').child(auth.uid).exists()"
      }
    },
    "invites": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Click **"Publish"**.

---

## Step 4: Get Your Firebase Config

1. In the Firebase console, click the **⚙ gear icon** (top-left) → **Project settings**
2. Scroll down to **"Your apps"** section
3. Click the **web icon** `</>` to add a web app
4. Name it `wedding-budget` → Click **"Register app"**
5. You'll see a config object like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "wedding-budget-xxxxx.firebaseapp.com",
  databaseURL: "https://wedding-budget-xxxxx-default-rtdb.firebaseio.com",
  projectId: "wedding-budget-xxxxx",
  storageBucket: "wedding-budget-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Copy these values and paste them into **`src/firebase.js`**, replacing the placeholder values.

---

## Step 5: Deploy to Vercel

1. Push the project to a **new GitHub repo**:
   - Make sure files are at the **root** of the repo (not in a subfolder)
   - The repo should contain: `index.html`, `package.json`, `src/`, etc.

2. Go to **https://vercel.com/new**
3. Import your GitHub repo
4. Vercel auto-detects Vite — just click **"Deploy"**

---

## Step 6: Add Vercel URL to Firebase

After Vercel gives you a URL (e.g. `wedding-budget-tracker.vercel.app`):

1. Go back to **Firebase Console → Authentication → Settings**
2. Click the **"Authorized domains"** tab
3. Click **"Add domain"**
4. Add your Vercel domain: `wedding-budget-tracker.vercel.app`

This allows Google sign-in to work on your deployed site.

---

## Step 7: Invite Your Girlfriend 💑

1. Sign in to the app
2. Go to the **"Team"** tab
3. Enter her email and click **"Send Invite"**
4. When she signs up or signs in with that email, she'll automatically join your wedding budget
5. Everything syncs in real time — you'll both see changes instantly!

---

## That's it! 🎉

You now have a collaborative wedding budget tracker with:
- ✅ Real-time sync between you and your partner
- ✅ Google + Email/Password sign-in
- ✅ All data stored in Firebase
- ✅ Free hosting on Vercel
