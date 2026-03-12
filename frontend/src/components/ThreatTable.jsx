import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlertCircle,
  ChevronDown,
  FileDown,
  FileText,
  ListFilter,
  ShieldAlert,
  X,
  Zap,
} from "lucide-react";

export default function ThreatTable({ refreshToken, onIngestComplete }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef(null);
  const filterRef = useRef(null);
  const [ingesting, setIngesting] = useState(false);
  const [activeThreat, setActiveThreat] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState({
    type: "ip",
    value: "",
    threat_level: "Medium",
    reason: "",
  });
  const [reportMessage, setReportMessage] = useState("");
  const [formError, setFormError] = useState(""); // <-- ADDED: Form specific error state
  const [notification, setNotification] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [filtersAnimate, setFiltersAnimate] = useState(false);
  const [downloadAnimate, setDownloadAnimate] = useState(false);
  const [reportAnimate, setReportAnimate] = useState(false);
  const [threatAnimate, setThreatAnimate] = useState(false);
  const [filters, setFilters] = useState({
    ipTypes: new Set(),
    valueQuery: "",
    reasonQuery: "",
    threatLevels: new Set(),
  });

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

  useEffect(() => {
    if (!activeThreat && !reportOpen) {
      return undefined;
    }
    function handleKey(event) {
      if (event.key === "Escape") {
        setActiveThreat(null);
        setReportOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [activeThreat, reportOpen]);

  useEffect(() => {
    if (!downloadOpen) {
      return undefined;
    }
    function handleClick(event) {
      if (downloadRef.current && !downloadRef.current.contains(event.target)) {
        setDownloadOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [downloadOpen]);

  useEffect(() => {
    if (!filtersOpen) {
      setFiltersAnimate(false);
      return undefined;
    }
    setTimeout(() => setFiltersAnimate(true), 0);
    function handleClick(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!downloadOpen) {
      setDownloadAnimate(false);
      return;
    }
    setTimeout(() => setDownloadAnimate(true), 0);
  }, [downloadOpen]);

  useEffect(() => {
    if (!reportOpen) {
      setReportAnimate(false);
      return;
    }
    setTimeout(() => setReportAnimate(true), 0);
  }, [reportOpen]);

  useEffect(() => {
    if (!activeThreat) {
      setThreatAnimate(false);
      return;
    }
    setTimeout(() => setThreatAnimate(true), 0);
  }, [activeThreat]);

  function triggerNotification(message, type = "success") {
    setNotification({ message, type });
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setNotification(null), 300);
    }, 3000);
  }

  function toggleFilterSet(key, value) {
    setFilters((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...prev, [key]: next };
    });
  }

  function updateFilterValue(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function handleIngest() {
    setIngesting(true);
    try {
      const res = await fetch("http://localhost:8000/api/ingest", { method: "POST" });
      if (!res.ok) {
        throw new Error("Ingest failed");
      }
      if (onIngestComplete) {
        onIngestComplete();
      }
    } catch (err) {
      setError(err.message || "Ingest failed");
    } finally {
      setIngesting(false);
    }
  }

  function handleExportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.text("Threat Intelligence Feed Aggregator Report", 40, 40);
    const body = rows.map((row) => [
      row?.type || "",
      row?.value || "",
      row?.threat_level || "",
      row?.reason || "",
    ]);
    autoTable(doc, {
      head: [["Type", "Value", "Level", "Reason"]],
      body,
      startY: 60,
      styles: { fontSize: 9, textColor: [30, 41, 59] },
      headStyles: { fillColor: [15, 23, 42], textColor: [226, 232, 240] },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    });
    doc.save("threat_report.pdf");
  }

  function downloadCsv() {
    const headers = ["Type", "Value", "Level", "Reason"];
    const rowsCsv = rows.map((row) => [
      row?.type || "",
      row?.value || "",
      row?.threat_level || "",
      row?.reason || "",
    ]);
    const csvLines = [headers, ...rowsCsv]
      .map((line) =>
        line
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csvLines], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "threat_report.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  function updateReportField(key, value) {
    setReportForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleReportSubmit(event) {
    event.preventDefault();
    setFormError(""); // <-- ADDED: Clear previous errors on submit

    try {
      const res = await fetch("http://127.0.0.1:8000/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportForm),
      });

      if (!res.ok) {
        let fallback = "Report failed. Please try again.";
        try {
          const data = await res.json();
          if (data?.detail) {
            fallback = data.detail;
          }
        } catch {}
        
        // <-- ADDED: Set error to show inside the form instead of firing a toast
        setFormError(fallback);
        return;
      }

      triggerNotification("Report submitted successfully.", "success");
      setReportOpen(false);
      setReportForm({ type: "ip", value: "", threat_level: "Medium", reason: "" });
    } catch (err) {
      // <-- ADDED: Catch network errors to the form state
      setFormError(err.message || "Report failed. Please try again.");
    }
  }

  const filteredRows = rows.filter((row) => {
    const ipTypeMatch =
      !filters.ipTypes.size || filters.ipTypes.has(row?.ip_type);
    const valueMatch = filters.valueQuery
      ? String(row?.value || "")
          .toLowerCase()
          .includes(filters.valueQuery.toLowerCase())
      : true;
    const reasonMatch = filters.reasonQuery
      ? String(row?.reason || "")
          .toLowerCase()
          .includes(filters.reasonQuery.toLowerCase())
      : true;
    const threatMatch =
      !filters.threatLevels.size ||
      filters.threatLevels.has(String(row?.threat_level || "Low"));
    return ipTypeMatch && valueMatch && reasonMatch && threatMatch;
  });

  const threatLevels = useMemo(
    () => filteredRows.map((row) => String(row?.threat_level || "Low")),
    [filteredRows]
  );

  function levelBadge(level) {
    const normalized = String(level || "Low").toLowerCase();
    if (normalized === "high") {
      return "text-rose-200 border-rose-500/70 shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse";
    }
    if (normalized === "medium") {
      return "text-amber-200 border-amber-400/70 shadow-[0_0_10px_rgba(251,191,36,0.3)]";
    }
    return "text-cyan-200 border-cyan-400/70 shadow-[0_0_10px_rgba(34,211,238,0.3)]";
  }

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-none p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-slate-400">Indicators</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleIngest}
            disabled={ingesting}
            className="flex items-center gap-2 border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs uppercase tracking-widest text-emerald-200 rounded-none shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-transform duration-200 ease-out active:scale-[0.97] disabled:opacity-60"
          >
            <Zap className={ingesting ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {ingesting ? "SCANNING" : "INGEST"}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="flex items-center gap-2 border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-widest text-slate-200 rounded-none hover:border-emerald-400/60 transition-transform duration-200 ease-out active:scale-[0.97]"
            >
              <ListFilter className="h-4 w-4 text-emerald-300" />
              Filter
            </button>
            {filtersOpen && (
              <>
                <div className={`fixed inset-0 z-40 transition-opacity duration-300 ease-out ${filtersAnimate ? "opacity-100" : "opacity-0"}`} />
                <div
                  className={`absolute right-0 mt-2 w-80 bg-white/5 backdrop-blur-md border border-white/20 rounded-none p-4 z-50 shadow-2xl transition-all duration-300 ease-out transform-gpu ${filtersAnimate ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-1 scale-[0.98]"}`}
                  ref={filterRef}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Filters</p>
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      className="text-slate-400 hover:text-slate-200 transition-transform duration-200 ease-out active:scale-[0.97]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-4 text-xs text-slate-300">
                    <div>
                      <p className="mb-2 uppercase tracking-widest text-slate-400">IP Type</p>
                      <div className="flex gap-2">
                        {"IPv4,IPv6".split(",").map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleFilterSet("ipTypes", value)}
                            className={`border px-3 py-1 uppercase tracking-widest rounded-none transition ${
                              filters.ipTypes.has(value)
                                ? "border-emerald-400/70 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                                : "border-white/10 text-slate-300"
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 uppercase tracking-widest text-slate-400">IP Address / Domain</p>
                      <input
                        type="text"
                        value={filters.valueQuery}
                        onChange={(event) => updateFilterValue("valueQuery", event.target.value)}
                        placeholder="Search IP or Domain"
                        className="w-full bg-black/30 border border-white/10 px-3 py-2 rounded-none text-xs text-slate-200 outline-none"
                      />
                    </div>

                    <div>
                      <p className="mb-2 uppercase tracking-widest text-slate-400">Reason</p>
                      <input
                        type="text"
                        value={filters.reasonQuery}
                        onChange={(event) => updateFilterValue("reasonQuery", event.target.value)}
                        placeholder="Search Reason"
                        className="w-full bg-black/30 border border-white/10 px-3 py-2 rounded-none text-xs text-slate-200 outline-none"
                      />
                    </div>

                    <div>
                      <p className="mb-2 uppercase tracking-widest text-slate-400">Level of Threat</p>
                      <div className="flex gap-2">
                        {"High,Medium,Low".split(",").map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleFilterSet("threatLevels", value)}
                            className={`border px-3 py-1 uppercase tracking-widest rounded-none transition ${
                              filters.threatLevels.has(value)
                                ? "border-emerald-400/70 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                                : "border-white/10 text-slate-300"
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="mt-4 w-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs uppercase tracking-widest text-emerald-200 rounded-none shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-transform duration-200 ease-out active:scale-[0.97]"
                  >
                    Apply Filters
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="relative" ref={downloadRef}>
            <button
              type="button"
              onClick={() => setDownloadOpen((open) => !open)}
              className="flex items-center gap-2 border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-widest text-slate-200 rounded-none hover:border-emerald-400/60 transition-transform duration-200 ease-out active:scale-[0.97]"
            >
              Export
              <ChevronDown className="h-4 w-4 text-emerald-300" />
            </button>
            {downloadOpen && (
              <div className={`absolute right-0 mt-2 w-48 bg-white/5 backdrop-blur-md border border-white/10 rounded-none p-2 z-20 text-xs text-slate-300 transition-all duration-300 ease-out transform-gpu ${downloadAnimate ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-1 scale-[0.98]"}`}>
                <button
                  type="button"
                  onClick={() => {
                    handleExportPdf();
                    setDownloadOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-500/10 transition-all duration-200 ease-out active:scale-[0.98] flex items-center gap-2"
                >
                  <FileText className="h-4 w-4 text-emerald-300" />
                  PDF (.pdf)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadCsv();
                    setDownloadOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-500/10 transition-all duration-200 ease-out active:scale-[0.98] flex items-center gap-2"
                >
                  <FileDown className="h-4 w-4 text-emerald-300" />
                  Excel (.csv)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-4 text-xs text-slate-400">Loading indicators...</div>
      )}

      {error && (
        <div className="mt-4 text-xs text-rose-300">{error}</div>
      )}

      {!loading && !error && (
        <div className="mt-4 max-h-[520px] w-full overflow-y-auto overflow-x-hidden">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="text-slate-400 sticky top-0 bg-[#0b0b0e] border-b border-white/10">
              <tr>
                <th className="w-16 py-2 px-2 uppercase tracking-widest border-r border-white/10">Sl.No</th>
                <th className="w-24 py-2 px-2 uppercase tracking-widest border-r border-white/10">IP Type</th>
                <th className="w-[32%] py-2 px-2 uppercase tracking-widest border-r border-white/10">IP Address / Domain</th>
                <th className="w-[36%] py-2 px-2 uppercase tracking-widest border-r border-white/10">Reason</th>
                <th className="w-40 py-2 px-2 uppercase tracking-widest">Level of Threat</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <tr
                  key={`${row.value || "row"}-${idx}`}
                  className="bg-slate-900/60 border-b border-white/10 transition-all duration-300 ease-out hover:bg-gray-800/50 hover:-translate-y-[1px] hover:shadow-md cursor-pointer"
                >
                  <td className="py-2 px-2 text-slate-400">{idx + 1}</td>
                  <td className="py-2 px-2 text-slate-200">{row.ip_type || "-"}</td>
                  <td className="py-2 px-2 text-emerald-200 font-mono">
                    {row.value ? (
                      <button
                        type="button"
                        onClick={() => setActiveThreat(row)}
                        className="text-emerald-200 hover:text-emerald-100 underline underline-offset-4"
                      >
                        {row.value}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-400">
                    {row.reason || "-"}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`inline-flex items-center border px-2 py-1 text-[11px] uppercase tracking-widest bg-white/5 ${levelBadge(threatLevels[idx])}`}
                    >
                      {threatLevels[idx]}
                    </span>
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

      <button
        type="button"
        onClick={() => {
          setReportMessage("");
          setFormError(""); // <-- ADDED: Clear form errors when opening new modal
          setReportOpen(true);
        }}
        className="w-full mt-4 py-3 border border-dashed border-emerald-500/30 bg-transparent hover:border-emerald-400/60 hover:bg-emerald-500/5 text-slate-400 hover:text-emerald-300 transition-all duration-300 ease-out text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <AlertCircle className="h-4 w-4" />
        Report Suspicious Indicator
      </button>

      {reportMessage && (
        <p className="mt-3 text-xs text-emerald-300">{reportMessage}</p>
      )}

      {/* <-- ADDED: z-[100] applied to the toast container so it overrides everything --> */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-[100] max-w-xs border px-4 py-3 text-xs uppercase tracking-widest backdrop-blur-sm transition-all duration-400 ease-out ${toastVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"} ${
            notification.type === "success"
              ? "border-emerald-500/60 bg-[#0c0c0e] text-emerald-200"
              : "border-rose-500/60 bg-[#0c0c0e] text-rose-200"
          }`}
        >
          {notification.message}
        </div>
      )}

      {reportOpen && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4 transition-opacity duration-300 ease-out ${reportAnimate ? "opacity-100" : "opacity-0"}`}
          onClick={() => setReportOpen(false)}
        >
          <div
            className={`w-full max-w-2xl bg-[#0c0c0e] border border-white/10 p-8 rounded-none relative transition-all duration-300 ease-out transform-gpu ${reportAnimate ? "opacity-100 scale-100" : "opacity-0 scale-[0.98]"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 transition-transform duration-200 ease-out active:scale-[0.97]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-emerald-300" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-mono">
                  COMMUNITY THREAT REPORT
                </p>
                <h3 className="text-2xl font-semibold text-emerald-200">
                  Suspicious Indicator
                </h3>
              </div>
            </div>

            <form onSubmit={handleReportSubmit} className="mt-6 space-y-4 text-sm text-slate-300">
              <div>
                <label className="text-xs uppercase tracking-widest text-slate-400">
                  Type
                </label>
                <select
                  value={reportForm.type}
                  onChange={(event) => updateReportField("type", event.target.value)}
                  className="mt-2 w-full bg-black/30 border border-white/10 px-3 py-2 rounded-none text-sm text-slate-200 outline-none"
                >
                  {"ip,domain".split(",").map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-slate-400">
                  Value
                </label>
                <input
                  type="text"
                  value={reportForm.value}
                  onChange={(event) => updateReportField("value", event.target.value)}
                  placeholder="e.g., 8.8.8.8 or example.com"
                  className="mt-2 w-full bg-black/30 border border-white/10 px-3 py-2 rounded-none text-sm text-slate-200 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-slate-400">
                  Threat Level
                </label>
                <select
                  value={reportForm.threat_level}
                  onChange={(event) => updateReportField("threat_level", event.target.value)}
                  className="mt-2 w-full bg-black/30 border border-white/10 px-3 py-2 rounded-none text-sm text-slate-200 outline-none"
                >
                  {"High,Medium,Low".split(",").map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-slate-400">
                  Reason
                </label>
                <textarea
                  value={reportForm.reason}
                  onChange={(event) => updateReportField("reason", event.target.value)}
                  placeholder="Describe why this indicator is suspicious"
                  rows={4}
                  className="mt-2 w-full bg-black/30 border border-white/10 px-3 py-2 rounded-none text-sm text-slate-200 outline-none"
                  required
                />
              </div>

              {/* <-- ADDED: Dynamic Red Error Box right above the buttons --> */}
              {formError && (
                <div className="p-3 border border-rose-500/50 bg-rose-500/10 text-rose-200 text-[11px] uppercase tracking-widest shadow-[0_0_15px_rgba(225,29,72,0.15)]">
                  ⚠ {formError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-widest text-slate-300 rounded-none hover:border-emerald-400/60 transition-transform duration-200 ease-out active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs uppercase tracking-widest text-emerald-200 rounded-none shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-transform duration-200 ease-out active:scale-[0.97]"
                >
                  Submit
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                COMMUNITY SANDBOX ACTIVE: This report is transmitted to an isolated database for vetting and will not affect the production feed until verified.
              </p>
            </form>
          </div>
        </div>
      )}

      {activeThreat && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4 transition-opacity duration-300 ease-out ${threatAnimate ? "opacity-100" : "opacity-0"}`}
          onClick={() => setActiveThreat(null)}
        >
          <div
            className={`w-full max-w-2xl bg-[#0c0c0e] border border-white/10 p-8 rounded-none relative transition-all duration-300 ease-out transform-gpu ${threatAnimate ? "opacity-100 scale-100" : "opacity-0 scale-[0.98]"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveThreat(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 transition-transform duration-200 ease-out active:scale-[0.97]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6 text-emerald-300" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Threat Name</p>
                <h3 className="text-2xl font-semibold text-emerald-200">
                  {activeThreat?.threat_level === "High"
                    ? "C2 Command Node"
                    : activeThreat?.threat_level === "Medium"
                    ? "Botnet Origin"
                    : "Automated Scanner"}
                </h3>
              </div>
            </div>

            <div className="mt-6 space-y-4 text-sm text-slate-300">
              <div>
                <h4 className="text-xs uppercase tracking-widest text-slate-400">Description</h4>
                <p className="mt-2">
                  {activeThreat?.reason || "Threat intelligence indicator"} indicates{" "}
                  {activeThreat?.threat_level === "High"
                    ? "a Persistent Advanced Threat node with verified malicious activity."
                    : activeThreat?.threat_level === "Medium"
                    ? "suspicious automated behavior consistent with coordinated botnet infrastructure."
                    : "automated scanning activity with low confidence indicators."}
                </p>
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-widest text-slate-400">Detailed Analysis</h4>
                <p className="mt-2">
                  This indicator was observed across multiple telemetry sources. The current risk posture
                  highlights {activeThreat?.threat_level === "High" ? "sustained C2 traffic" : "intermittent probe activity"} and should be
                  monitored closely for escalation patterns.
                </p>
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-widest text-slate-400">Threat History</h4>
                <p className="mt-2">
                  First detected in recent threat feeds with contextual enrichment from automated analysis
                  pipelines. Continued presence suggests{" "}
                  {activeThreat?.threat_level === "High"
                    ? "persistent actor infrastructure."
                    : activeThreat?.threat_level === "Medium"
                    ? "opportunistic scanning operations."
                    : "low-impact reconnaissance attempts."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}