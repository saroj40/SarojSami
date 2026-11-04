// Server-only helper: lists every photo and video in a public Google Drive folder
// (including subfolders) using the Drive API v3.
//
// Requirements (set in .env.local and in Vercel → Settings → Environment Variables):
//   1. DRIVE_FOLDER_ID  – the folder ID (a full folder URL also works)
//   2. GOOGLE_API_KEY   – a Google Cloud API key with the "Google Drive API" enabled
//   3. The folder must be shared as "Anyone with the link: Viewer"
//
// Run `npm i server-only` once.
import "server-only";

const API = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_DEPTH = 3;
const REVALIDATE = 3600; // seconds; new uploads can take up to this long to appear

const FIELDS = "nextPageToken, files(id,name,mimeType,createdTime,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))";

// Accepts a bare ID or a full Drive folder URL
export function parseFolderId(value = "") {
  const v = String(value).trim();
  const match = v.match(/folders\/([a-zA-Z0-9_-]+)/) || v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : v;
}

async function listFolder(folderId, key) {
  const files = [];
  let pageToken;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: FIELDS,
      pageSize: "1000",
      orderBy: "createdTime,name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      key,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${API}?${params}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message || `Google Drive API responded with ${res.status}`);
    }

    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

async function collect(folderId, key, depth = 0) {
  const files = await listFolder(folderId, key);
  const media = [];
  const subfolders = [];

  for (const f of files) {
    if (f.mimeType === FOLDER_MIME) {
      if (depth < MAX_DEPTH) subfolders.push(f.id);
      continue;
    }

    const isImage = f.mimeType?.startsWith("image/");
    const isVideo = f.mimeType?.startsWith("video/");
    if (!isImage && !isVideo) continue;

    const meta = isImage ? f.imageMediaMetadata : f.videoMediaMetadata;
    media.push({
      id: f.id,
      name: f.name,
      type: isImage ? "image" : "video",
      mimeType: f.mimeType,
      createdTime: f.createdTime,
      width: meta?.width || null,
      height: meta?.height || null,
      durationMs: isVideo && f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) : null,
    });
  }

  // Walk all subfolders at once instead of one by one
  const nested = await Promise.all(subfolders.map((id) => collect(id, key, depth + 1)));
  return media.concat(...nested);
}

export async function getMedia() {
  const folderId = parseFolderId(process.env.NEXT_PUBLIC_DRIVE_FOLDER_ID);
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  if (!folderId) return { items: [], error: "DRIVE_FOLDER_ID is not set." };
  if (!key) return { items: [], error: "GOOGLE_API_KEY is not set (needed to list the Drive folder)." };

  try {
    const items = await collect(folderId, key);
    // Chronological, stable order
    items.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { items, error: null };
  } catch (err) {
    console.error("[drive] failed to load media:", err);
    return { items: [], error: `Could not load the gallery: ${err.message}` };
  }
}
