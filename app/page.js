"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { site } from "../lib/config";
import Countdown from "../components/Countdown";
import Petals from "../components/Petals";

/* ------------------------------------------------------------------ */
/*  Media helpers (the Drive listing itself runs on the server:        */
/*  app/api/media/route.js -> lib/drive.js)                            */
/* ------------------------------------------------------------------ */

const CACHE_KEY = "gallery-cache-v1";
const PAGE_SIZE = 12; // tiles rendered per page
const EAGER_COUNT = 4; // first tiles load immediately, the rest are lazy
const MAX_RETRIES = 2;

// Grid and lightbox placeholder share the same default width so the browser reuses the cached thumbnail.
// If thumbnails are blank/slow, try: `https://lh3.googleusercontent.com/d/${id}=w${w}` (unofficial)
const thumbUrl = (id, w = 480) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const fullUrl = (id, w = 1600) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const videoEmbedUrl = (id) => `https://drive.google.com/file/d/${id}/preview`;
const downloadUrl = (id) => `https://drive.google.com/uc?export=download&id=${id}`;

const withAttempt = (url, attempt) => (attempt ? `${url}${url.includes("?") ? "&" : "?"}r=${attempt}` : url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask our own API route for the list, with retries for flaky / slow connections
async function getMedia(signal) {
  let lastError = "Unknown error";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("/api/media", { signal });
      const data = await res.json().catch(() => null);
      if (res.ok) return { items: data?.items || [], error: null };
      lastError = data?.error || `Gallery request failed (${res.status})`;
      if (res.status >= 400 && res.status < 500) break; // not worth retrying
    } catch (err) {
      if (err.name === "AbortError") return { items: [], error: null, aborted: true };
      lastError = err.message;
    }
    if (attempt < MAX_RETRIES) await sleep(800 * (attempt + 1));
  }
  return { items: [], error: `Could not load the gallery: ${lastError}` };
}

// Remember the last good list so repeat visits show instantly, even on a slow connection
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.items) ? parsed.items : null;
  } catch {
    return null;
  }
}
function writeCache(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items }));
  } catch {
    /* storage full or unavailable: ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

const fmt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function formatDuration(ms) {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function MediaTile({ item, onOpen, priority = false }) {
  const isVideo = item.type === "video";
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : isVideo ? "16 / 9" : "4 / 5";

  const [status, setStatus] = useState("loading"); // loading | loaded | error
  const [attempt, setAttempt] = useState(0);
  const imgRef = useRef(null);
  const timerRef = useRef(null);

  const src = withAttempt(thumbUrl(item.id), attempt);

  // Image may finish before React attaches onLoad (cached / fast): don't leave the skeleton stuck
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) setStatus("loaded");
  }, [src]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleError = useCallback(() => {
    if (attempt < MAX_RETRIES) {
      timerRef.current = setTimeout(() => setAttempt((a) => a + 1), 1000 * (attempt + 1));
    } else {
      setStatus("error");
    }
  }, [attempt]);

  const retry = (e) => {
    e.stopPropagation();
    setStatus("loading");
    setAttempt(0);
  };

  return (
    <button type="button" className="g-tile" style={{ aspectRatio: ratio }} onClick={onOpen} aria-label={isVideo ? `Play video ${item.name}` : `Open photo ${item.name}`}>
      {status !== "loaded" && (
        <div className={`g-skeleton${status === "error" ? " is-error" : ""}`}>
          {status === "error" && (
            <span role="button" tabIndex={0} onClick={retry} onKeyDown={(e) => e.key === "Enter" && retry(e)}>
              Tap to retry
            </span>
          )}
        </div>
      )}

      {status !== "error" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          key={attempt}
          src={src}
          alt={isVideo ? `Video thumbnail: ${item.name}` : item.name}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus("loaded")}
          onError={handleError}
          style={{ opacity: status === "loaded" ? 1 : 0 }}
          className="g-img"
        />
      )}

      {isVideo && status !== "error" && (
        <>
          <span className="g-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          {item.durationMs ? <span className="g-duration">{formatDuration(item.durationMs)}</span> : null}
        </>
      )}
    </button>
  );
}

function LightboxImage({ item, neighbors }) {
  // Start with the cached grid thumbnail (blurred), swap to full size when it arrives
  const [src, setSrc] = useState(() => thumbUrl(item.id));
  const [status, setStatus] = useState("loading"); // loading | loaded | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const url = withAttempt(fullUrl(item.id), attempt);

    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (cancelled) return;
      setSrc(url);
      setStatus("loaded");
    };
    img.onerror = () => {
      if (cancelled) return;
      if (attempt < MAX_RETRIES) {
        timer = setTimeout(() => setAttempt((a) => a + 1), 1000 * (attempt + 1));
      } else {
        setStatus("error");
      }
    };
    img.src = url;

    return () => {
      cancelled = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
    };
  }, [item.id, attempt]);

  // Preload neighbours only after the current image is done
  useEffect(() => {
    if (status !== "loaded") return;
    neighbors.forEach((n) => {
      if (n?.type === "image") {
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.src = fullUrl(n.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, item.id]);

  const retry = () => {
    setStatus("loading");
    setAttempt(0);
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={item.name} referrerPolicy="no-referrer" decoding="async" className={`g-lb-img${status === "loaded" ? "" : " is-loading"}`} />
      {status === "loading" && <div className="g-lb-spinner" aria-label="Loading" />}
      {status === "error" && (
        <button type="button" className="g-lb-btn" onClick={retry} style={{ position: "absolute" }}>
          Couldn’t load. Tap to retry
        </button>
      )}
    </>
  );
}

function LightboxVideo({ item }) {
  const [ready, setReady] = useState(false);
  return (
    <>
      <iframe src={videoEmbedUrl(item.id)} title={item.name} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen loading="lazy" className="g-lb-video" onLoad={() => setReady(true)} />
      {!ready && <div className="g-lb-spinner" aria-label="Loading" />}
    </>
  );
}

function Lightbox({ items, index, onClose, onChange }) {
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const prev = useCallback(() => hasPrev && onChange(index - 1), [hasPrev, index, onChange]);
  const next = useCallback(() => hasNext && onChange(index + 1), [hasNext, index, onChange]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [onClose, prev, next]);

  if (!item) return null;

  const neighbors = [items[index + 1], items[index - 1]];

  return (
    <div className="g-lightbox" role="dialog" aria-modal="true" aria-label={item.name} onClick={onClose}>
      <div className="g-lb-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          {index + 1} / {items.length}
        </span>
        <div className="g-lb-actions">
          <a href={downloadUrl(item.id)} target="_blank" rel="noopener noreferrer" className="g-lb-btn">
            Download
          </a>
          <button type="button" className="g-lb-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>

      {hasPrev && (
        <button
          type="button"
          className="g-lb-nav g-lb-prev"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Previous"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          className="g-lb-nav g-lb-next"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Next"
        >
          ›
        </button>
      )}

      <div className="g-lb-stage" onClick={(e) => e.stopPropagation()}>
        {item.type === "video" ? <LightboxVideo key={item.id} item={item} /> : <LightboxImage key={item.id} item={item} neighbors={neighbors} />}
      </div>
    </div>
  );
}

function Gallery({ items = [] }) {
  const [filter, setFilter] = useState("all");
  const [activeIndex, setActiveIndex] = useState(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const counts = useMemo(
    () => ({
      all: items.length,
      image: items.filter((i) => i.type === "image").length,
      video: items.filter((i) => i.type === "video").length,
    }),
    [items],
  );
  const visible = useMemo(() => (filter === "all" ? items : items.filter((i) => i.type === filter)), [items, filter]);
  // Render a page at a time so a slow connection isn't flooded with requests
  const shown = useMemo(() => visible.slice(0, limit), [visible, limit]);

  const close = useCallback(() => setActiveIndex(null), []);

  // If the lightbox moves past what's rendered, reveal that tile in the grid too
  const handleChange = useCallback((next) => {
    setActiveIndex(next);
    setLimit((l) => (next >= l ? next + 1 : l));
  }, []);

  if (!items.length) return null;

  const tabs = [
    { key: "all", label: "All" },
    { key: "image", label: "Photos" },
    { key: "video", label: "Videos" },
  ];

  return (
    <div className="g-wrap">
      {counts.image > 0 && counts.video > 0 && (
        <div className="g-tabs" role="tablist" aria-label="Filter gallery">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={filter === t.key}
              className={`g-tab${filter === t.key ? " is-active" : ""}`}
              onClick={() => {
                setFilter(t.key);
                setActiveIndex(null);
                setLimit(PAGE_SIZE);
              }}
            >
              {t.label} <span>{counts[t.key]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="g-grid">
        {shown.map((item, i) => (
          <MediaTile key={item.id} item={item} priority={i < EAGER_COUNT} onOpen={() => setActiveIndex(i)} />
        ))}
      </div>

      {limit < visible.length && (
        <button type="button" className="g-more" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          Load more ({visible.length - limit} left)
        </button>
      )}

      {activeIndex !== null && <Lightbox items={visible} index={activeIndex} onClose={close} onChange={handleChange} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles (kept here so this file is self-contained)                  */
/* ------------------------------------------------------------------ */

const galleryCss = `
.g-wrap{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:0 16px}
.g-tabs{display:flex;justify-content:center;gap:8px;margin-bottom:24px;flex-wrap:wrap}
.g-tab{padding:8px 18px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;cursor:pointer;opacity:.6;transition:opacity .2s,background .2s}
.g-tab span{opacity:.7;margin-left:4px;font-size:.85em}
.g-tab:hover{opacity:.9}
.g-tab.is-active{opacity:1;background:rgba(128,128,128,.15)}
.g-grid{column-count:2;column-gap:12px}
@media(min-width:700px){.g-grid{column-count:3}}
@media(min-width:1000px){.g-grid{column-count:4}}
.g-tile{position:relative;display:block;width:100%;margin:0 0 12px;padding:0;border:0;border-radius:10px;overflow:hidden;cursor:pointer;background:rgba(128,128,128,.15);break-inside:avoid;transition:transform .25s ease,box-shadow .25s ease;aspect-ratio:4/3}
.g-tile:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.2)}
.g-tile:focus-visible{outline:3px solid #fff;outline-offset:-3px}
.g-tile img,.g-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:opacity .3s ease}
.g-skeleton{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:rgba(128,128,128,.9);background:linear-gradient(90deg,rgba(128,128,128,.12) 25%,rgba(128,128,128,.22) 50%,rgba(128,128,128,.12) 75%);background-size:200% 100%;animation:g-shimmer 1.2s infinite linear}
.g-skeleton.is-error{animation:none;background:rgba(128,128,128,.15)}
.g-skeleton.is-error span{padding:6px 12px;border:1px solid currentColor;border-radius:999px;cursor:pointer}
@keyframes g-shimmer{to{background-position:-200% 0}}
.g-play{position:absolute;inset:0;margin:auto;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);pointer-events:none}
.g-duration{position:absolute;right:8px;bottom:8px;padding:2px 8px;border-radius:6px;font-size:12px;color:#fff;background:rgba(0,0,0,.65)}
.g-more{display:block;margin:24px auto 0;padding:10px 24px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;cursor:pointer;opacity:.8;transition:opacity .2s,background .2s}
.g-more:hover{opacity:1;background:rgba(128,128,128,.15)}
.g-lightbox{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.92);animation:g-fade .2s ease}
@keyframes g-fade{from{opacity:0}to{opacity:1}}
.g-lb-bar{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 18px;color:#fff;z-index:2}
.g-lb-actions{display:flex;gap:8px}
.g-lb-btn{padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:14px;cursor:pointer;text-decoration:none}
.g-lb-btn:hover{background:rgba(255,255,255,.15)}
.g-lb-stage{position:relative;width:100%;height:100%;padding:64px 56px 24px;display:flex;align-items:center;justify-content:center}
.g-lb-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;transition:opacity .3s ease,filter .3s ease}
.g-lb-img.is-loading{filter:blur(12px);opacity:.85}
.g-lb-video{width:min(100%,1100px);aspect-ratio:16/9;max-height:100%;border:0;border-radius:8px;background:#000}
.g-lb-spinner{position:absolute;top:50%;left:50%;width:36px;height:36px;margin:-18px 0 0 -18px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:g-spin .8s linear infinite;pointer-events:none}
@keyframes g-spin{to{transform:rotate(360deg)}}
.g-lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:0;font-size:28px;line-height:1;color:#fff;background:rgba(255,255,255,.15);cursor:pointer;z-index:2}
.g-lb-nav:hover{background:rgba(255,255,255,.3)}
.g-lb-prev{left:10px}
.g-lb-next{right:10px}
@media(max-width:600px){.g-lb-stage{padding:64px 8px 16px}.g-lb-nav{display:none}}
@media(prefers-reduced-motion:reduce){.g-skeleton,.g-lb-spinner,.g-lightbox{animation:none}.g-tile,.g-img,.g-lb-img{transition:none}}
`;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [heroSrc, setHeroSrc] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    // 1. Show the cached list immediately (instant on repeat visits)
    const cached = readCache();
    if (cached?.length) {
      setItems(cached);
      setLoading(false);
    }

    // 2. Refresh from the server in the background
    getMedia(controller.signal).then((res) => {
      if (res.aborted) return;
      if (res.error) {
        // keep showing cached photos if we have them, only surface the error otherwise
        if (!cached?.length) setError(res.error);
      } else {
        setItems(res.items);
        setError(null);
        if (res.items.length) writeCache(res.items);
      }
      setLoading(false);
    });

    return () => controller.abort();
  }, []);

  // Use background.jpg from the Drive folder if it exists, otherwise the first image
  const cover = useMemo(() => items.find((i) => i.name.toLowerCase() === "background.jpg") || items.find((i) => i.type === "image"), [items]);

  // Keep the background photo out of the gallery
  const galleryItems = useMemo(() => items.filter((i) => i.id !== cover?.id || items.length === 1), [items, cover]);

  // Load the hero image in the background; show it once it has actually arrived
  useEffect(() => {
    if (!cover) return;
    let cancelled = false;
    const url = fullUrl(cover.id, 1400);
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => !cancelled && setHeroSrc(url);
    img.src = url;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [cover]);

  return (
    <main>
      <style>{galleryCss}</style>

      <section className="hero">
        {heroSrc && <div className="hero-bg" style={{ backgroundImage: `url(${heroSrc})` }} />}
        <Petals />
        <div className="hero-inner">
          <p className="date">{fmt(site.engagementDate)}</p>
          <h1>
            <span>{site.partnerOne}</span>
            <i>and</i>
            <span>{site.partnerTwo}</span>
          </h1>
          <p className="tagline">{site.tagline}</p>
          <a className="scroll" href="#story">
            Our story
          </a>
        </div>
      </section>
      <section id="story" className="story">
        <h2>How it began</h2>
        {site.story}
        {/* {site.story.map((p, i) => (
          <p key={i}>{p}</p>
        ))} */}
      </section>

      {site.weddingDate && (
        <section className="count">
          <h2>Until we marry</h2>
          <Countdown target={site.weddingDate} />
          <p className="small">{fmt(site.weddingDate)}</p>
        </section>
      )}

      <section id="gallery" className="gallery">
        <h2>The day we said yes</h2>
        {loading && <p className="notice">Loading photos and videos…</p>}
        {error && <p className="notice">{error}</p>}
        {!loading && !error && items.length === 0 && <p className="notice">No photos found yet. Upload some to your Drive folder and refresh.</p>}
        <Gallery items={galleryItems} />
      </section>

      <footer>
        <p>{site.thanks}</p>
        <p className="sig">
          {site.partnerOne} &amp; {site.partnerTwo}
        </p>
      </footer>
    </main>
  );
}
