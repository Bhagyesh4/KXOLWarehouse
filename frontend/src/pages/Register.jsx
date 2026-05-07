import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
    const { register } = useAuth();
    const nav = useNavigate();
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        role: "operator",
    });
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        const r = await register(form);
        setBusy(false);
        if (r.ok) nav("/");
        else setErr(r.error);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#090a0c] bg-grid p-6">
            <div className="w-full max-w-md bg-[#111317] border border-white/10 p-8">
                <div className="font-mono text-[11px] tracking-[0.3em] text-amber-400 uppercase mb-2">
                    // PROVISION USER
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-6">
                    Create your account
                </h2>

                <form onSubmit={submit} className="space-y-4">
                    <Field
                        label="Full Name"
                        testid="register-name-input"
                        value={form.name}
                        onChange={(v) => setForm({ ...form, name: v })}
                    />
                    <Field
                        label="Email"
                        type="email"
                        testid="register-email-input"
                        value={form.email}
                        onChange={(v) => setForm({ ...form, email: v })}
                    />
                    <Field
                        label="Password"
                        type="password"
                        testid="register-password-input"
                        value={form.password}
                        onChange={(v) => setForm({ ...form, password: v })}
                    />

                    <div>
                        <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                            Role
                        </label>
                        <div className="grid grid-cols-3 gap-2 mt-1">
                            {["operator", "manager", "admin"].map((r) => (
                                <button
                                    type="button"
                                    key={r}
                                    onClick={() => setForm({ ...form, role: r })}
                                    data-testid={`register-role-${r}`}
                                    className={`px-3 py-2 text-xs uppercase tracking-wider border transition-colors ${
                                        form.role === r
                                            ? "border-amber-500 bg-amber-500/10 text-amber-400"
                                            : "border-white/10 text-gray-400 hover:border-white/30"
                                    }`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    {err && (
                        <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono">
                            ✕ {err}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        data-testid="register-submit-btn"
                        className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold tracking-wider uppercase text-sm py-3 transition-colors disabled:opacity-60"
                    >
                        {busy ? "Creating..." : "Create Account"}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-500">
                    Already have an account?{" "}
                    <Link to="/login" className="text-amber-400 hover:text-amber-300">
                        Sign in
                    </Link>
                </div>
            </div>
        </div>
    );
}

function Field({ label, type = "text", value, onChange, testid }) {
    return (
        <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                {label}
            </label>
            <input
                data-testid={testid}
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required
                className="w-full mt-1 bg-[#090a0c] border border-white/10 px-3 py-2.5 font-mono text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
        </div>
    );
}
