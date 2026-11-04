# Engagement website (Next.js)

## 1. Prepare Google Drive
1. Put all photos and videos in one Drive folder.
2. Share the folder: **Anyone with the link → Viewer** (needed so images and videos can display).
3. Copy the folder ID from its URL: `drive.google.com/drive/folders/<FOLDER_ID>`.

## 2. Get an API key
Google Cloud Console → new project → enable **Google Drive API** → Credentials → **Create API key**.

## 3. Run
```bash
npm install
cp .env.example .env.local   # fill in GOOGLE_API_KEY and DRIVE_FOLDER_ID
npm run dev                  # http://localhost:3000
```

## 4. Personalize
Edit names, dates and your story in `lib/config.js`.

## 5. Deploy
Push to GitHub, import into Vercel, add the same two environment variables.
New uploads appear automatically within an hour (`revalidate` in `app/page.js`).
