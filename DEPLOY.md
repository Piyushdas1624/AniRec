# 🚀 Deploying AniRec AI to Render.com

## Architecture
- **Single service**: Backend (Express) serves the frontend (Vite/React) from the same domain
- **Database**: SQLite via `better-sqlite3` stored on a persistent disk
- **No separate frontend deploy needed** — everything runs from one Render Web Service

---

## Option A: One-Click Deploy (Blueprint)

1. Push your code to a **GitHub/GitLab repository**
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
3. Connect your repository
4. Render will detect the `render.yaml` file and set everything up automatically
5. After deploy, set the `CORS_ORIGIN` environment variable to your Render URL (e.g., `https://anirec-ai.onrender.com`)

---

## Option B: Manual Deploy

### Step 1: Create a Web Service
1. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Web Service**
2. Connect your GitHub/GitLab repository
3. Configure:
   - **Name**: `anirec-ai` (or your choice)
   - **Region**: Oregon (or closest)
   - **Runtime**: Node
   - **Build Command**: 
     ```
     cd frontend && npm install && npm run build && cd ../backend && npm install && npm run build
     ```
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Free (or paid for better performance)

### Step 2: Add Environment Variables
In the Render dashboard under **Environment**:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `JWT_SECRET` | *(click "Generate" for a random secure string)* |
| `JWT_EXPIRES_IN` | `7d` |
| `DB_PATH` | `./data/anime-recommender.db` |
| `CORS_ORIGIN` | `https://your-app-name.onrender.com` |

### Step 3: Add Persistent Disk (Important!)
Since SQLite stores data in a file, you need a **persistent disk**:

1. In Render service settings → **Disks**
2. **Name**: `anirec-data`
3. **Mount Path**: `/opt/render/project/src/backend/data`
4. **Size**: 1 GB (plenty for SQLite)

> ⚠️ **Without a persistent disk, your database will be wiped on every redeploy!**
> The free plan does NOT include persistent disks. You need at least the **Starter** plan ($7/mo).

### Step 4: Deploy!
Click **Create Web Service**. Render will:
1. Clone your repo
2. Build the frontend (`npm run build` in `/frontend`)
3. Build the backend (`tsc` in `/backend`)
4. Start the backend (`node dist/index.js`)
5. The backend serves both the API (`/api/*`) and the frontend (`/*`)

---

## After Deployment

### Your URLs
- **App**: `https://your-app-name.onrender.com`
- **API Health**: `https://your-app-name.onrender.com/api/health`

### Using Your Existing SQLite Data
If you already have a local `anime-recommender.db` file with your data:

1. **Before first deploy**: Include it in your repo at `backend/data/anime-recommender.db`
2. **After deploy**: Use the Render Shell to upload it:
   ```bash
   # In Render Shell
   ls /opt/render/project/src/backend/data/
   ```

### Google OAuth (Antigravity)
The OAuth popup uses `postMessage` to communicate back to the parent window. 
Make sure your Render URL matches the origin — the `oauth-callback.html` is served 
from the same domain so it should work automatically.

---

## Free Plan Limitations
- **Spin down after 15 min of inactivity** (cold start takes ~30s)
- **No persistent disk** (data lost on redeploy)
- **750 hours/month** free

For a persistent database on the free plan, consider switching to **Render PostgreSQL** (free tier available with 1GB storage).

---

## Troubleshooting

### "Cannot find module" errors
Make sure the build command runs `npm install` for BOTH frontend and backend.

### Database errors
Ensure `DB_PATH` is set correctly and points to the persistent disk mount path.

### CORS errors
Set `CORS_ORIGIN` to your exact Render URL (e.g., `https://anirec-ai.onrender.com`).
In production mode, if the frontend is served from the backend, CORS should work automatically.

### OAuth "window closed" errors  
These were caused by Google's Cross-Origin-Opener-Policy headers. The fix is already in the code — the popup handler no longer polls `popup.closed` (which COOP blocks).
