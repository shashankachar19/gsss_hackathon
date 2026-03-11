import { useMemo, useState } from "react";
import {
  FileText,
  LayoutGrid,
  Search,
  Settings,
  Shield,
} from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import ThreatTable from "./components/ThreatTable.jsx";
import ActionPanel from "./components/ActionPanel.jsx";

function decodeJwtProfile(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState(null);

  const stats = useMemo(
    () => [
      { label: "Indicators Found", value: "18,492" },
      { label: "System Uptime", value: "99.98%" },
      { label: "Threat Level", value: "High" },
    ],
    []
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] bg-cyber-grid text-slate-200 flex items-center justify-center px-6">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-md border border-white/10 rounded-sm clip-corner p-6 text-center">
          <div className="mx-auto h-12 w-12 border border-emerald-400/40 bg-white/5 rounded-sm clip-corner flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <Shield className="h-6 w-6 text-emerald-300" />
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.35em] text-emerald-300">
            RESTRICTED ACCESS: AUTH REQUIRED
          </p>
          <div className="mt-6 flex justify-center">
            <GoogleLogin
              onSuccess={(credentialResponse) => {
                const profile = decodeJwtProfile(credentialResponse.credential || "");
                if (profile) {
                  setUser(profile);
                }
              }}
              onError={() => {
                setUser(null);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] bg-cyber-grid text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[72px_1fr]">
          <aside className="bg-white/5 backdrop-blur-md border border-white/10 rounded-sm clip-corner py-6 flex flex-col items-center gap-6">
            <div className="h-9 w-9 border border-emerald-400/40 bg-white/5 rounded-sm clip-corner flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Shield className="h-4 w-4 text-emerald-300" />
            </div>
            <button className="h-9 w-9 border border-white/10 bg-white/5 rounded-sm clip-corner flex items-center justify-center hover:border-emerald-400/60 transition">
              <LayoutGrid className="h-4 w-4 text-slate-200" />
            </button>
            <button className="h-9 w-9 border border-white/10 bg-white/5 rounded-sm clip-corner flex items-center justify-center hover:border-emerald-400/60 transition">
              <FileText className="h-4 w-4 text-slate-200" />
            </button>
            <button className="h-9 w-9 border border-white/10 bg-white/5 rounded-sm clip-corner flex items-center justify-center hover:border-emerald-400/60 transition">
              <Settings className="h-4 w-4 text-slate-200" />
            </button>
          </aside>

          <main className="space-y-6">
            <nav className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Threat Intel</p>
                <h1 className="text-lg font-semibold">Cyber-Grid Operations</h1>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 border border-white/10 bg-white/5 px-3 py-2 rounded-sm clip-corner">
                  <Search className="h-4 w-4 text-emerald-300" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Filter by value or type..."
                    className="w-48 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  {user?.name || user?.email}
                </div>
              </div>
            </nav>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {stats.map((card) => (
                <div
                  key={card.label}
                  className="bg-white/5 backdrop-blur-md border border-emerald-400/40 rounded-sm clip-corner p-4 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                >
                  <p className="text-xs uppercase tracking-widest text-slate-400">{card.label}</p>
                  <p className="mt-2 text-2xl text-emerald-200 font-semibold">{card.value}</p>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ThreatTable refreshToken={refreshToken} searchQuery={searchQuery} />
              </div>
              <ActionPanel onIngestComplete={() => setRefreshToken((n) => n + 1)} />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
