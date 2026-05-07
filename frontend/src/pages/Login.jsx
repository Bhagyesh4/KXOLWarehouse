import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Warehouse, ArrowRight } from "lucide-react";

export default function Login() {
    const { login } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState("admin@wms.com");
    const [password, setPassword] = useState("Admin123!");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    const handle = async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        const r = await login(email, password);
        setBusy(false);
        if (r.ok) nav("/");
        else setErr(r.error);
    };

    const quick = (em, pw) => {
        setEmail(em);
        setPassword(pw);
    };

    return (
        <div className="min-h-screen flex bg-[#090a0c] text-gray-100">
            <div
                className="hidden lg:flex flex-1 relative overflow-hidden border-r border-white/10"
                style={{
                    backgroundImage:
                        "url('https://images.unsplash.com/photo-1776625834126-fa4409d4282b?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-[#090a0c]/95 via-[#090a0c]/70 to-amber-900/30" />
                <div className="relative z-10 p-12 flex flex-col justify-between w-full">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500 flex items-center justify-center text-black">
                            <Warehouse size={22} strokeWidth={2.5} />
                        </div>
                        <div>
                            <div className="text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                                Warehouse OS
                            </div>
                            <div className="font-bold tracking-tight">
                                CONTROL CENTER
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="font-mono text-[11px] tracking-widest text-amber-400 mb-3">
                            // OPERATIONAL INTELLIGENCE
                        </div>
                        <h1 className="text-5xl font-bold tracking-tight mb-4 leading-tight">
                            Move freight at the
                            <br />
                            speed of decisions.
                        </h1>
                        <p className="text-gray-400 max-w-md leading-relaxed">
                            Tactical inventory, inbound, outbound and storage
                            telemetry — engineered for high-throughput warehouse
                            floors.
                        </p>
                    </div>
                    <div className="font-mono text-[10px] tracking-widest text-gray-500">
                        SECURED // BCRYPT × JWT × HTTPS
                    </div>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-md">
                    <div className="mb-8">
                        <div className="font-mono text-[11px] tracking-[0.3em] text-amber-400 uppercase mb-2">
                            // ACCESS TERMINAL
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight">
                            Sign in to your console
                        </h2>
                        <p className="text-sm text-gray-500 mt-2">
                            Authenticate to access live operations.
                        </p>
                    </div>

                    <form onSubmit={handle} className="space-y-4">
                        <div>
                            <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                                Email
                            </label>
                            <input
                                data-testid="login-email-input"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full mt-1 bg-[#090a0c] border border-white/10 px-3 py-2.5 font-mono text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                                Password
                            </label>
                            <input
                                data-testid="login-password-input"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full mt-1 bg-[#090a0c] border border-white/10 px-3 py-2.5 font-mono text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                required
                            />
                        </div>

                        {err && (
                            <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono">
                                ✕ {err}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            data-testid="login-submit-btn"
                            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-black font-bold tracking-wider uppercase text-sm py-3 transition-colors disabled:opacity-60"
                        >
                            {busy ? "Authenticating..." : "Sign In"}
                            <ArrowRight size={16} />
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/10">
                        <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-3">
                            Quick Access
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { r: "Admin", e: "admin@wms.com", p: "Admin123!" },
                                { r: "Manager", e: "manager@wms.com", p: "Manager123!" },
                                { r: "Operator", e: "operator@wms.com", p: "Operator123!" },
                            ].map((q) => (
                                <button
                                    key={q.r}
                                    type="button"
                                    onClick={() => quick(q.e, q.p)}
                                    data-testid={`quick-${q.r.toLowerCase()}-btn`}
                                    className="border border-white/10 px-2 py-2 text-xs uppercase tracking-wider text-gray-400 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
                                >
                                    {q.r}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-6 text-center text-sm text-gray-500">
                        New here?{" "}
                        <Link
                            to="/register"
                            className="text-amber-400 hover:text-amber-300"
                        >
                            Create an account
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
