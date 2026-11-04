import { NextResponse } from "next/server";
import { getMedia } from "../../../lib/drive";

// Runs on the server at request time, so GOOGLE_API_KEY / DRIVE_FOLDER_ID are read at runtime
// (no NEXT_PUBLIC_ prefix needed, and the key never reaches the browser).
export const dynamic = "force-dynamic";

export async function GET() {
  const { items, error } = await getMedia();

  if (error) {
    return NextResponse.json({ items: [], error }, { status: 500 });
  }

  return NextResponse.json(
    { items },
    {
      headers: {
        // Vercel's CDN keeps the list for 1 hour and serves stale for a day while refreshing
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
