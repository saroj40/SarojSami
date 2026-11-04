"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { thumbUrl } from "../lib/driveUrls";

const MAX_RETRIES = 2;

function formatDuration(ms) {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function MediaTile({ item, onOpen, priority = false }) {
  const isVideo = item.type === "video";
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : isVideo ? "16 / 9" : "4 / 5";

  const [status, setStatus] = useState("loading"); // loading | loaded | error
  const [attempt, setAttempt] = useState(0);
  const imgRef = useRef(null);
  const timerRef = useRef(null);

  const base = thumbUrl(item.id, 480);
  const src = attempt ? `${base}${base.includes("?") ? "&" : "?"}r=${attempt}` : base;

  // If the image finished loading before React attached onLoad (cached / fast),
  // mark it loaded so the skeleton doesn't stay forever.
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
