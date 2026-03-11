import { useEffect, useState } from "react";

const monoStyle = {
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

export default function ThreatTable({ refreshToken, searchQuery }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData(signal) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("http://localhost:8000/api/indicators", { signal });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const data = await res.json();
      const items = Array.isArray(data)
        ? data
        : data.indicators || data.items || [];
      setRows(items);
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err.message || "Failed to load indicators");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [refreshToken]);

  const filteredRows = rows.filter((row) => {
    if (!searchQuery) {
      return true;
    }
    const valueMatch = String(row?.value || "")
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const typeMatch = String(row?.type || "")
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return valueMatch || typeMatch;
  });

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-sm clip-corner p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-slate-400">Indicators</h2>
        <span className="text-xs text-emerald-300">Live Feed</span>
      </div>

      {loading && (
        <div className="mt-4 text-xs text-slate-400">Loading indicators...</div>
      )}

      {error && (
        <div className="mt-4 text-xs text-rose-300">{error}</div>
      )}

      {!loading && !error && (
        <div className="mt-4 max-h-[420px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-slate-400 sticky top-0 bg-[#0b0b0e]">
              <tr>
                <th className="py-2">Type</th>
                <th className="py-2">Value</th>
                <th className="py-2">Source</th>
                <th className="py-2">Confidence</th>
                <th className="py-2">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <tr
                  key={`${row.value || "row"}-${idx}`}
                  className="bg-slate-900/60 border border-white/5 hover:border-emerald-400/70 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] transition"
                >
                  <td className="py-2 px-2 text-slate-200">{row.type || "-"}</td>
                  <td className="py-2 px-2 text-emerald-200" style={monoStyle}>
                    {row.value || "-"}
                  </td>
                  <td className="py-2 px-2 text-slate-300">{row.source || "-"}</td>
                  <td className="py-2 px-2 text-slate-300">
                    {row.confidence ?? "-"}
                  </td>
                  <td className="py-2 px-2 text-slate-400">
                    {Array.isArray(row.tags) && row.tags.length ? row.tags.join(", ") : "-"}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-slate-500">
                    No indicators found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
