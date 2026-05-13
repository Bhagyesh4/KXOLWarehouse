import { useState } from "react";
import { api, formatErr } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Trash2, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";

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
