import { useState } from "react";
import { FileText, LayoutGrid, Settings, Shield } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import ThreatTable from "./components/ThreatTable.jsx";

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
  const [user, setUser] = useState(null);

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
    <div className="min-h-screen w-full bg-[#0a0a0c] bg-cyber-grid text-slate-200">
      <div className="w-full h-full p-6">
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

          <main className="flex-1 w-full h-full space-y-6">
            <nav className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Threat Intel</p>
                <h1 className="text-lg font-semibold">Cyber-Grid Operations</h1>
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
