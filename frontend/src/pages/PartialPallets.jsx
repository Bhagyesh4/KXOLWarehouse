import { useState, useEffect, useCallback } from "react";
import { api, formatErr } from "../lib/api";
import {
    PackageMinus, Clock, AlertTriangle, Package,
    TrendingDown, Layers, RefreshCw, X, ChevronDown,
    History, ShieldAlert, Search
} from "lucide-react";

const STATUS_LABELS = {
    partial: { label: "Partial Available", color: "text-amber-400 bg-amber-500/10 border border-amber-500/30" },
    damaged: { label: "Damaged", color: "text-red-400 bg-red-500/10 border border-red-500/30" },
    quality_hold: { label: "Quality Hold", color: "text-purple-400 bg-purple-500/10 border border-purple-500/30" },
};

function StatusBadge({ status }) {
    const s = STATUS_LABELS[status] || { label: status, color: "text-gray-400 bg-white/5" };
    return (
        <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded ${s.color}`}>
            {s.label}
        </span>
    );
}

function StatCard({ icon: Icon, label, value, sub, color = "text-amber-400" }) {
    return (
        <div className="bg-[#111317] border border-white/10 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <Icon size={14} className={color} strokeWidth={2} />
                <span className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">{label}</span>
            </div>
            <div className={`text-2xl font-bold tracking-tight ${color}`}>{value ?? "—"}</div>
            {sub && <div className="text-xs text-gray-500">{sub}</div>}
        </div>
    );
}

function HistoryModal({ stockId, barcode, onClose }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/partial-pallets/${stockId}/history`)
            .then(r => setRows(r.data))
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    }, [stockId]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-[#111317] border border-white/10 w-full max-w-3xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div>
                        <div className="text-xs uppercase tracking-[0.15em] text-gray-500 font-semibold">Movement History</div>
                        <div className="font-mono text-sm text-amber-400 mt-0.5">{barcode || stockId}</div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-100 transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-auto flex-1">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-gray-500 text-sm">Loading…</div>
                    ) : rows.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-gray-500 text-sm">No history recorded yet.</div>
                    ) : (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-white/10 bg-[#0d0f12]">
                                    {["Date & Time", "Type", "SO / Ref", "User", "Qty Picked", "Remaining"].map(h => (
                                        <th key={h} className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                                        <td className="px-4 py-2.5 font-mono text-gray-300">{r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}</td>
                                        <td className="px-4 py-2.5 text-gray-300 capitalize">{(r.transaction_type || "").replace(/_/g, " ")}</td>
                                        <td className="px-4 py-2.5 font-mono text-amber-400">{r.so_number || "—"}</td>
                                        <td className="px-4 py-2.5 text-gray-300">{r.user_name || "—"}</td>
                                        <td className="px-4 py-2.5 text-red-400 font-mono">-{r.qty_picked}</td>
                                        <td className="px-4 py-2.5 text-emerald-400 font-mono">{r.remaining_qty}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatusUpdateModal({ stockId, currentStatus, onClose, onUpdated }) {
    const [status, setStatus] = useState(currentStatus === "partial" ? "partial" : currentStatus);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const options = [
        { value: "partial", label: "Partial Available" },
        { value: "damaged", label: "Damaged" },
        { value: "quality_hold", label: "Quality Hold" },
    ];

    const save = async () => {
        setSaving(true);
        setErr("");
        try {
            await api.patch(`/partial-pallets/${stockId}/status`, { status });
            onUpdated();
            onClose();
        } catch (e) {
            setErr(formatErr(e.response?.data?.detail) || e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-[#111317] border border-white/10 w-full max-w-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div className="text-xs uppercase tracking-[0.15em] text-gray-500 font-semibold">Update Status</div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-100"><X size={16} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="space-y-2">
                        {options.map(o => (
                            <label key={o.value} className={`flex items-center gap-3 px-3 py-2.5 border cursor-pointer transition-colors ${status === o.value ? "border-amber-500/50 bg-amber-500/5 text-amber-400" : "border-white/10 text-gray-400 hover:border-white/20"}`}>
                                <input type="radio" value={o.value} checked={status === o.value} onChange={() => setStatus(o.value)} className="accent-amber-500" />
                                <span className="text-sm">{o.label}</span>
                            </label>
                        ))}
                    </div>
                    {err && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2">{err}</div>}
                    <button
                        onClick={save}
                        disabled={saving}
                        className="w-full bg-amber-500 text-black text-xs font-bold uppercase tracking-wider py-2.5 hover:bg-amber-400 transition-colors disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Update Status"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function PartialPallets() {
    const [dash, setDash] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    // Filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [batchFilter, setBatchFilter] = useState("");
    const [expiryBefore, setExpiryBefore] = useState("");

    // Modals
    const [historyFor, setHistoryFor] = useState(null); // { stockId, barcode }
    const [statusFor, setStatusFor] = useState(null);   // { stockId, currentStatus }

    const loadDash = useCallback(() => {
        api.get("/partial-pallets/dashboard").then(r => setDash(r.data)).catch(() => {});
    }, []);

    const loadRows = useCallback(() => {
        setLoading(true);
        setErr("");
        const params = {};
        if (statusFilter) params.status = statusFilter;
        if (batchFilter.trim()) params.batch_no = batchFilter.trim();
        if (expiryBefore) params.expiry_before = expiryBefore;
        api.get("/partial-pallets", { params })
            .then(r => setRows(r.data))
            .catch(e => setErr(formatErr(e.response?.data?.detail) || e.message))
            .finally(() => setLoading(false));
    }, [statusFilter, batchFilter, expiryBefore]);

    useEffect(() => { loadDash(); }, [loadDash]);
    useEffect(() => { loadRows(); }, [loadRows]);

    // Client-side search filter (barcode / SKU / product name)
    const filtered = rows.filter(r => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            (r.pallet_code || "").toLowerCase().includes(q) ||
            (r.sku_code || "").toLowerCase().includes(q) ||
            (r.sku_name || "").toLowerCase().includes(q)
        );
    });

    const refresh = () => { loadDash(); loadRows(); };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold mb-1">Inventory</div>
                    <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                        <PackageMinus size={20} className="text-amber-400" strokeWidth={2} />
                        Partial Pallet Management
                    </h1>
                </div>
                <button onClick={refresh} className="flex items-center gap-2 px-3 py-2 border border-white/10 text-xs text-gray-400 hover:text-amber-400 hover:border-amber-500/40 transition-colors uppercase tracking-wider">
                    <RefreshCw size={12} /> Refresh
                </button>
            </div>

            {/* Dashboard stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard icon={Layers} label="Partial Pallets" value={dash?.total_partial ?? "—"} />
                <StatCard icon={Package} label="Total Units" value={dash?.total_qty ?? "—"} color="text-blue-400" />
                <StatCard icon={PackageMinus} label="Products Affected" value={dash?.product_count ?? "—"} color="text-purple-400" />
                <StatCard
                    icon={Clock}
                    label="Oldest (Days)"
                    value={dash?.oldest_days != null ? `${dash.oldest_days}d` : "—"}
                    sub="since partial creation"
                    color={dash?.oldest_days > 30 ? "text-red-400" : "text-emerald-400"}
                />
                <StatCard
                    icon={AlertTriangle}
                    label="Near Expiry"
                    value={dash?.near_expiry_count ?? "—"}
                    sub="within 30 days"
                    color={dash?.near_expiry_count > 0 ? "text-red-400" : "text-emerald-400"}
                />
                <StatCard
                    icon={TrendingDown}
                    label="Avg Remaining"
                    value={dash?.utilization_pct != null ? `${dash.utilization_pct}%` : "—"}
                    sub="of original quantity"
                    color="text-amber-400"
                />
            </div>

            {/* Filter bar */}
            <div className="bg-[#111317] border border-white/10 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="relative">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Barcode / SKU / Product…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-[#0d0f12] border border-white/10 text-sm text-gray-100 placeholder-gray-600 px-3 py-2 pl-8 focus:outline-none focus:border-amber-500/50 transition-colors"
                        />
                    </div>
                    <div className="relative">
                        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="w-full appearance-none bg-[#0d0f12] border border-white/10 text-sm text-gray-100 px-3 py-2 focus:outline-none focus:border-amber-500/50 transition-colors"
                        >
                            <option value="">All Statuses</option>
                            <option value="partial">Partial Available</option>
                            <option value="damaged">Damaged</option>
                            <option value="quality_hold">Quality Hold</option>
                        </select>
                    </div>
                    <input
                        type="text"
                        placeholder="Batch / Lot Number…"
                        value={batchFilter}
                        onChange={e => setBatchFilter(e.target.value)}
                        className="bg-[#0d0f12] border border-white/10 text-sm text-gray-100 placeholder-gray-600 px-3 py-2 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] uppercase tracking-wider text-gray-600">Expiry Before</label>
                        <input
                            type="date"
                            value={expiryBefore}
                            onChange={e => setExpiryBefore(e.target.value)}
                            className="bg-[#0d0f12] border border-white/10 text-sm text-gray-100 px-3 py-2 focus:outline-none focus:border-amber-500/50 transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-[#111317] border border-white/10">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-white/10 bg-[#0d0f12]">
                                {[
                                    "Pallet Barcode", "Product", "SKU",
                                    "Batch / Lot", "Expiry", "Zone", "Location",
                                    "Original Qty", "Remaining", "UOM",
                                    "Status", "Last Pick", "Age (Days)", "Actions"
                                ].map(h => (
                                    <th key={h} className="px-3 py-3 text-left text-[10px] uppercase tracking-wider text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={14} className="px-4 py-12 text-center text-gray-500">Loading partial pallets…</td>
                                </tr>
                            ) : err ? (
                                <tr>
                                    <td colSpan={14} className="px-4 py-12 text-center text-red-400">{err}</td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={14} className="px-4 py-12 text-center text-gray-500">
                                        {rows.length === 0
                                            ? "No partial pallets found. Partial pallets appear here when outbound picks consume part of a full pallet."
                                            : "No results match your filters."}
                                    </td>
                                </tr>
                            ) : filtered.map(r => {
                                const pct = r.original_qty ? Math.round((r.qty / r.original_qty) * 100) : null;
                                const expDate = r.expiry_date ? new Date(r.expiry_date) : null;
                                const daysToExp = expDate ? Math.round((expDate - Date.now()) / 86400000) : null;
                                const expClass = daysToExp != null && daysToExp <= 30 ? "text-red-400" : "text-gray-300";
                                return (
                                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="px-3 py-2.5 font-mono text-amber-400 whitespace-nowrap">{r.pallet_code || "—"}</td>
                                        <td className="px-3 py-2.5 text-gray-200 max-w-[140px] truncate" title={r.sku_name}>{r.sku_name || "—"}</td>
                                        <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">{r.sku_code || "—"}</td>
                                        <td className="px-3 py-2.5 font-mono text-gray-400 whitespace-nowrap">{r.batch_no || "—"}</td>
                                        <td className={`px-3 py-2.5 font-mono whitespace-nowrap ${expClass}`}>{r.expiry_date || "—"}</td>
                                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{r.zone_name || r.zone || "—"}</td>
                                        <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">{r.location_code || "—"}</td>
                                        <td className="px-3 py-2.5 text-gray-400 text-right tabular-nums">{r.original_qty ?? "—"}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">
                                            <span className="text-emerald-400 font-semibold">{r.qty}</span>
                                            {pct != null && (
                                                <span className="text-gray-600 ml-1">({pct}%)</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-gray-400">{r.unit || "—"}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={r.pallet_status} /></td>
                                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                                            {r.partial_since ? new Date(r.partial_since).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-3 py-2.5 text-gray-400 text-right tabular-nums">
                                            {r.partial_age_days != null ? `${r.partial_age_days}d` : r.received_date ? `${Math.round((Date.now() - new Date(r.received_date)) / 86400000)}d` : "—"}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => setHistoryFor({ stockId: r.id, barcode: r.pallet_code })}
                                                    className="flex items-center gap-1 px-2 py-1 border border-white/10 text-gray-400 hover:text-amber-400 hover:border-amber-500/30 transition-colors text-[10px] uppercase tracking-wider"
                                                >
                                                    <History size={10} /> History
                                                </button>
                                                <button
                                                    onClick={() => setStatusFor({ stockId: r.id, currentStatus: r.pallet_status })}
                                                    className="flex items-center gap-1 px-2 py-1 border border-white/10 text-gray-400 hover:text-purple-400 hover:border-purple-500/30 transition-colors text-[10px] uppercase tracking-wider"
                                                >
                                                    <ShieldAlert size={10} /> Status
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-white/10 text-[10px] text-gray-600 uppercase tracking-wider">
                        {filtered.length} partial pallet{filtered.length !== 1 ? "s" : ""}
                        {filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ""}
                    </div>
                )}
            </div>

            {historyFor && (
                <HistoryModal
                    stockId={historyFor.stockId}
                    barcode={historyFor.barcode}
                    onClose={() => setHistoryFor(null)}
                />
            )}
            {statusFor && (
                <StatusUpdateModal
                    stockId={statusFor.stockId}
                    currentStatus={statusFor.currentStatus}
                    onClose={() => setStatusFor(null)}
                    onUpdated={refresh}
                />
            )}
        </div>
    );
}
