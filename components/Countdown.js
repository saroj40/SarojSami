"use client";
import { useEffect, useState } from "react";

export default function Countdown({ target }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <div className="countdown" style={{ minHeight: 90 }} />;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return <p className="married">Today we begin our forever.</p>;
  const s = Math.floor(diff / 1000);
  const parts = [["days", Math.floor(s / 86400)], ["hours", Math.floor((s % 86400) / 3600)], ["minutes", Math.floor((s % 3600) / 60)], ["seconds", s % 60]];
  return (
    <div className="countdown" role="timer">
      {parts.map(([label, n]) => (
        <div key={label}><strong>{String(n).padStart(2, "0")}</strong><span>{label}</span></div>
      ))}
    </div>
  );
}
