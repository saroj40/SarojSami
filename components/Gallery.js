"use client";

import { useCallback, useMemo, useState } from "react";
import MediaTile from "./MediaTile";
import Lightbox from "./Lightbox";
import "./gallery.css";

const PAGE_SIZE = 12;
const EAGER_COUNT = 4; // first tiles load right away, the rest are lazy

export default function Gallery({ items = [] }) {
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

  // Only render a page at a time so a slow connection isn't flooded with requests
  const shown = useMemo(() => visible.slice(0, limit), [visible, limit]);

  const close = useCallback(() => setActiveIndex(null), []);

  // If the user navigates in the lightbox past what's rendered, reveal that tile too.
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
  const showTabs = counts.image > 0 && counts.video > 0;

  return (
    <div className="g-wrap">
      {showTabs && (
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
