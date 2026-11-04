"use client";

import { useCallback, useEffect, useState } from "react";
import { fullUrl, thumbUrl, videoEmbedUrl, downloadUrl } from "../lib/driveUrls";

const MAX_RETRIES = 2;

function LightboxImage({ item, neighbors }) {
  // Start with the thumbnail (usually cached from the grid), then swap to full size
  const [src, setSrc] = useState(() => thumbUrl(item.id));
  const [status, setStatus] = useState("loading"); // loading | loaded | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const base = fullUrl(item.id);
    const url = attempt ? `${base}${base.includes("?") ? "&" : "?"}r=${attempt}` : base;

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

  // Preload neighbours only after this image is done
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

export default function Lightbox({ items, index, onClose, onChange }) {
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const prev = useCallback(() => hasPrev && onChange(index - 1), [hasPrev, index, onChange]);
  const next = useCallback(() => hasNext && onChange(index + 1), [hasNext, index, onChange]);

  // Keyboard controls + scroll lock
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
        <span className="g-lb-count">
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
