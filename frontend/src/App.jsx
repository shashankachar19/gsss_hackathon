import { useState } from "react";
import { FileText, LayoutGrid, Settings, Shield } from "lucide-react";
import { useGoogleLogin } from "@react-oauth/google";
import ThreatTable from "./components/ThreatTable.jsx";

export default function App() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setAuthError("");
      try {
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
          },
        });
        if (!res.ok) {
          throw new Error("Failed to fetch profile");
        }
        const profile = await res.json();
        setUser({
          name: profile.name,
          email: profile.email,
          picture: profile.picture,
        });
      } catch (err) {
        setAuthError("Authentication failed. Please try again.");
      }
    },
    onError: () => {
      setAuthError("Authentication failed. Please try again.");
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] bg-cyber-grid text-slate-200 flex items-center justify-center px-6 relative overflow-hidden">
        <div className="absolute -top-40 -left-32 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative w-full max-w-2xl bg-white/5 backdrop-blur-md border border-white/10 rounded-none clip-corner p-8">
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.3em] text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)] whitespace-nowrap">
                Threat Intelligence Feed Aggregator
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-100">
                Restricted Console
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                This environment is secured for authorized analysts only. Authenticate to unlock
                live indicators, ingest pipelines, and community intelligence workflows.
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]" />
                Security posture: hardened
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-none p-6 flex flex-col items-center justify-center gap-4">
              <div className="h-12 w-12 border border-emerald-400/40 bg-white/5 rounded-none clip-corner flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <Shield className="h-6 w-6 text-emerald-300" />
              </div>
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-300 text-center">
                Auth Required
              </p>
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => login()}
                  className="inline-flex items-center justify-center gap-3 border border-emerald-400/40 bg-emerald-500/10 px-5 py-3 text-sm tracking-widest uppercase text-emerald-200 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:bg-emerald-500/20 transition-transform duration-150 active:scale-95"
                >
                  <span className="font-semibold">Sign in with Google</span>
                </button>
                {authError && (
                  <p className="text-xs text-rose-300">{authError}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a0c] bg-cyber-grid text-slate-200">
      <div className="w-full h-full p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[72px_1fr]">
          <aside className="bg-white/5 backdrop-blur-md border border-white/10 rounded-sm clip-corner py-6 flex flex-col items-center gap-6">
            <div className="h-9 w-9 border border-emerald-400/40 bg-white/5 rounded-sm clip-corner flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Shield className="h-4 w-4 text-emerald-300" />
            </div>
            <button className="h-9 w-9 border border-white/10 bg-white/5 rounded-sm clip-corner flex items-center justify-center hover:border-emerald-400/60 transition-transform duration-150 active:scale-95">
              <LayoutGrid className="h-4 w-4 text-slate-200" />
            </button>
            <button className="h-9 w-9 border border-white/10 bg-white/5 rounded-sm clip-corner flex items-center justify-center hover:border-emerald-400/60 transition-transform duration-150 active:scale-95">
              <FileText className="h-4 w-4 text-slate-200" />
            </button>
            <button className="h-9 w-9 border border-white/10 bg-white/5 rounded-sm clip-corner flex items-center justify-center hover:border-emerald-400/60 transition-transform duration-150 active:scale-95">
              <Settings className="h-4 w-4 text-slate-200" />
            </button>
          </aside>

          <main className="flex-1 w-full h-full space-y-6">
            <nav className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Threat Intelligence Feed Aggregator</p>
                <h1 className="text-lg font-semibold">Threat Intelligence Feed Aggregator</h1>
              </div>
              <div className="text-xs text-slate-400">
                {user?.name || user?.email}
              </div>
            </nav>

            <section className="grid grid-cols-1">
              <ThreatTable refreshToken={refreshToken} onIngestComplete={() => setRefreshToken((n) => n + 1)} />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
