import { useEffect, useState } from "react";
import { api, formatErr } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import {
    Trash2,
    ShieldAlert,
    CheckCircle2,
    Loader2,
    Users,
    UserPlus,
} from "lucide-react";

const ROLES = ["admin", "manager", "operator"];

const ROLE_BADGE = {
    admin: "bg-red-500/10 text-red-400 border-red-500/30",
    manager: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    operator: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
};

export default function Admin() {
    const { user } = useAuth();
    const [confirm, setConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    if (user?.role !== "admin") {
        return (
            <div className="flex items-center justify-center h-64 text-gray-500">
                Access restricted to administrators.
            </div>
        );
    }

    const handlePurge = async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await api.post("/admin/purge-data");
            setResult({ ok: true, message: res.data.message });
            toast.success("Data purged successfully");
            setConfirm(false);
        } catch (err) {
            const msg = formatErr(err.response?.data?.detail);
            setResult({ ok: false, message: msg });
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Admin Settings</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Restricted to administrators only.
                </p>
            </div>

            <UserManagement currentUser={user} />

            {/* Danger Zone */}
            <div className="border border-red-500/30 bg-red-950/10 p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <ShieldAlert size={20} className="text-red-400" />
                    <h2 className="text-base font-semibold text-red-400 uppercase tracking-wider">
                        Danger Zone
                    </h2>
                </div>

                <div className="border-t border-red-500/20 pt-4 flex items-start justify-between gap-6">
                    <div>
                        <div className="text-sm font-medium text-gray-200">
                            Purge All Transactional Data
                        </div>
                        <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                            Permanently deletes all SKUs, stock, movements, inbound and outbound
                            orders. Zones, locations, and user accounts are preserved. This
                            cannot be undone.
                        </div>
                    </div>
                    <button
                        onClick={() => { setConfirm(true); setResult(null); }}
                        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold uppercase tracking-wider transition-colors"
                    >
                        <Trash2 size={14} /> Purge Data
                    </button>
                </div>

                {/* Inline confirmation */}
                {confirm && (
                    <div className="border border-red-500/40 bg-red-950/30 p-4 space-y-3">
                        <p className="text-sm text-red-300 font-medium">
                            Are you sure? This will permanently delete:
                        </p>
                        <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                            <li>All SKUs and stock records</li>
                            <li>All stock movements history</li>
                            <li>All inbound and outbound orders</li>
                            <li>All shuttle movement logs</li>
                        </ul>
                        <p className="text-xs text-gray-500">
                            Zones, locations (bins) and user accounts will be kept intact.
                        </p>
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={handlePurge}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-wider transition-colors"
                            >
                                {loading
                                    ? <><Loader2 size={13} className="animate-spin" /> Purging…</>
                                    : <><Trash2 size={13} /> Yes, Purge Everything</>
                                }
                            </button>
                            <button
                                onClick={() => setConfirm(false)}
                                disabled={loading}
                                className="px-4 py-2 border border-white/10 text-xs text-gray-400 hover:text-gray-200 hover:border-white/20 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className={`flex items-start gap-2 p-3 text-sm ${result.ok ? "bg-emerald-950/30 border border-emerald-500/30 text-emerald-400" : "bg-red-950/30 border border-red-500/30 text-red-400"}`}>
                        {result.ok && <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
                        {result.message}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── User Management ────────────────────────────────────── */
function UserManagement({ currentUser }) {
    const [users, setUsers] = useState([]);
    const [loadingList, setLoadingList] = useState(true);
    const [form, setForm] = useState({ name: "", email: "", password: "", role: "operator" });
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const loadUsers = async () => {
        try {
            const res = await api.get("/admin/users");
            setUsers(res.data);
        } catch (err) {
            toast.error(formatErr(err.response?.data?.detail) || "Failed to load users");
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.email.trim() || !form.password) {
            toast.error("Name, email and password are required");
            return;
        }
        if (form.password.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }
        setCreating(true);
        try {
            await api.post("/admin/users", {
                name: form.name.trim(),
                email: form.email.trim(),
                password: form.password,
                role: form.role,
            });
            toast.success("User created");
            setForm({ name: "", email: "", password: "", role: "operator" });
            await loadUsers();
        } catch (err) {
            toast.error(formatErr(err.response?.data?.detail) || "Failed to create user");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (u) => {
        setDeletingId(u.id);
        try {
            await api.delete(`/admin/users/${u.id}`);
            toast.success("User removed");
            await loadUsers();
        } catch (err) {
            toast.error(formatErr(err.response?.data?.detail) || "Failed to remove user");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="border border-white/10 bg-[#181a20] p-6 space-y-5">
            <div className="flex items-center gap-3">
                <Users size={20} className="text-amber-400" />
                <h2 className="text-base font-semibold uppercase tracking-wider">
                    User Management
                </h2>
            </div>

            {/* Create user form */}
            <form onSubmit={handleCreate} className="border-t border-white/10 pt-4 space-y-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Create New User
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                        label="Full Name"
                        value={form.name}
                        onChange={(v) => setForm({ ...form, name: v })}
                        placeholder="Jane Doe"
                    />
                    <Field
                        label="Email"
                        type="email"
                        value={form.email}
                        onChange={(v) => setForm({ ...form, email: v })}
                        placeholder="jane@wms.com"
                    />
                    <Field
                        label="Password"
                        type="password"
                        value={form.password}
                        onChange={(v) => setForm({ ...form, password: v })}
                        placeholder="Min. 6 characters"
                    />
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">
                            Role
                        </label>
                        <select
                            value={form.role}
                            onChange={(e) => setForm({ ...form, role: e.target.value })}
                            className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none capitalize"
                        >
                            {ROLES.map((r) => (
                                <option key={r} value={r} className="capitalize">
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-xs font-bold uppercase tracking-wider transition-colors"
                >
                    {creating
                        ? <><Loader2 size={13} className="animate-spin" /> Creating…</>
                        : <><UserPlus size={14} /> Create User</>
                    }
                </button>
            </form>

            {/* User list */}
            <div className="border-t border-white/10 pt-4 space-y-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Existing Users {users.length > 0 && `(${users.length})`}
                </div>
                {loadingList ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                        <Loader2 size={14} className="animate-spin" /> Loading users…
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4">No users found.</div>
                ) : (
                    <div className="space-y-2">
                        {users.map((u) => {
                            const isSelf = u.id === currentUser?.id;
                            return (
                                <div
                                    key={u.id}
                                    className="flex items-center justify-between gap-3 border border-white/10 bg-[#090a0c] px-4 py-3"
                                    data-testid={`user-row-${u.email}`}
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-gray-200 truncate">
                                            {u.name}
                                            {isSelf && (
                                                <span className="ml-2 text-[10px] text-gray-500 uppercase tracking-wider">
                                                    (you)
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 truncate">{u.email}</div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span
                                            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 border ${ROLE_BADGE[u.role] || "bg-white/5 text-gray-400 border-white/10"}`}
                                        >
                                            {u.role}
                                        </span>
                                        <button
                                            onClick={() => handleDelete(u)}
                                            disabled={isSelf || deletingId === u.id}
                                            title={isSelf ? "You cannot remove your own account" : "Remove user"}
                                            className="flex items-center justify-center w-8 h-8 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-500 disabled:cursor-not-allowed transition-colors"
                                            data-testid={`delete-user-${u.email}`}
                                        >
                                            {deletingId === u.id
                                                ? <Loader2 size={15} className="animate-spin" />
                                                : <Trash2 size={15} />
                                            }
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Field ──────────────────────────────────────────────── */
function Field({ label, value, onChange, type = "text", placeholder }) {
    return (
        <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">
                {label}
            </label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
        </div>
    );
}
