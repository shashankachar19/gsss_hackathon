import { useState } from "react";
import { Zap } from "lucide-react";

export default function ActionPanel({ onIngestComplete }) {
  const [ingesting, setIngesting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleIngest() {
    setIngesting(true);
    setMessage("");
    try {
      const res = await fetch("http://localhost:8000/api/ingest", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || "Ingest failed");
      }
      setMessage(data?.message || "Ingest complete.");
      if (onIngestComplete) {
        onIngestComplete();
      }
    } catch (err) {
      setMessage(err.message || "Ingest failed");
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-none p-5">
      <h2 className="text-sm uppercase tracking-widest text-slate-400">Actions</h2>

      <div className="mt-4 grid gap-3">
        <button
          type="button"
          onClick={handleIngest}
          disabled={ingesting}
          className="flex items-center justify-between border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-xs tracking-[0.2em] text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)] transition hover:bg-emerald-500/20 disabled:opacity-60"
        >
          <span>{ingesting ? "SCANNING..." : "INGEST"}</span>
          <Zap className={ingesting ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
        </button>
      </div>

      {message && <p className="mt-3 text-xs text-slate-400">{message}</p>}
    </div>
  );
}
