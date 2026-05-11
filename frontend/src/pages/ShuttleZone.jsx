import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import RackElevationSVG, { MultiLaneRackSVG } from "../components/RackElevationSVG";
import {
    Zap, ArrowRight, ArrowLeft, Package2, Thermometer,
    BarChart3, RefreshCw, AlertTriangle, CheckCircle2,
    ChevronDown, ChevronRight, Clock, Layers,
} from "lucide-react";
import { toast } from "sonner";

const LANES = [1, 2, 3, 4, 5, 6, 7];
const LEVELS = [
    { no: 0, label: "L00 (Ground)" },
    { no: 1, label: "L01" },
    { no: 2, label: "L02" },
    { no: 3, label: "L03" },
    { no: 4, label: "L04 (Top)" },
];

export default function ShuttleZone() {
    const { user } = useAuth();
    const [summary, setSummary] = useState(null);
    const [laneMatrix, setLaneMatrix] = useState([]);
    const [activeLane, setActiveLane] = useState(1);
    const [activeLevel, setActiveLevel] = useState(0);
    const [laneDetail, setLaneDetail] = useState([]);
    const [movements, setMovements] = useState([]);
    const [skus, setSkus] = useState([]);
    const [showInbound, setShowInbound] = useState(false);
    const [showOutbound, setShowOutbound] = useState(false);
    const [loading, setLoading] = useState(false);

    const isOp = ["admin", "manager", "operator"].includes(user?.role);
    const isAdmin = ["admin", "manager"].includes(user?.role);

    const reload = useCallback(async () => {
        try {
            const [sum, matrix, hist] = await Promise.all([
                api.get("/shuttle/summary"),
                api.get("/shuttle/lanes"),
                api.get("/shuttle/movements"),
            ]);
            setSummary(sum.data);
            setLaneMatrix(matrix.data);
            setMovements(hist.data);
        } catch (e) {
            toast.error("Failed to load shuttle data");
        }
    }, []);

    const reloadDetail = useCallback(async () => {
        try {
            const r = await api.get(`/shuttle/lanes/${activeLane}/${activeLevel}`);
            setLaneDetail(r.data);
        } catch (e) {
            toast.error("Failed to load lane detail");
        }
    }, [activeLane, activeLevel]);

    useEffect(() => {
        reload();
        api.get("/inventory/skus").then((r) => setSkus(r.data));
    }, [reload]);

    useEffect(() => {
        reloadDetail();
    }, [reloadDetail]);

    const matrixEntry = (lane, level) =>
        laneMatrix.find((e) => e.lane_no === lane && e.level_no === level);

    const d01 = laneDetail.find((d) => d.depth === 1);
    const canDispatch = d01?.occupied;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.3em] text-cyan-400 uppercase">
                        // SHUTTLE FIFO // DEEP LANE // COLD STORAGE
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight mt-1">Shuttle Zone A</h1>
                </div>
                <div className="flex items-center gap-3">
                    {summary && (
                        <div className="flex items-center gap-2 border border-cyan-500/30 bg-cyan-500/5 px-4 py-2">
                            <Thermometer size={16} className="text-cyan-400" />
                            <span className="font-mono text-cyan-400 font-semibold">{summary && "-22°C"}</span>
                        </div>
                    )}
                    <button
                        onClick={() => { reload(); reloadDetail(); }}
                        className="flex items-center gap-2 border border-white/10 text-gray-400 hover:text-white px-3 py-2 text-xs font-mono uppercase tracking-wider"
                    >
                        <RefreshCw size={13} /> Refresh
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <SummaryCard label="Total Slots" value={summary.total_bins.toLocaleString()} />
                    <SummaryCard label="Occupied" value={summary.occupied_bins.toLocaleString()} color="text-red-400" />
                    <SummaryCard label="Available" value={summary.empty_bins.toLocaleString()} color="text-emerald-400" />
                    <SummaryCard label="Utilization" value={`${summary.utilization_pct}%`} color="text-amber-400" />
                    <SummaryCard label="Configuration" value={`${summary.lanes}L × ${summary.levels}LV × ${summary.depth}D`} color="text-cyan-400" />
                </div>
            )}

            {/* Lane×Level Rack Elevation — interactive front view */}
            <div className="bg-[#181a20] border border-white/10 p-5">
                <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase mb-1">
                    // RACK FRONT ELEVATION — CLICK BAY TO INSPECT DEEP LANE
                </div>
                <div className="font-mono text-[9px] text-gray-600 mb-4">
                    7 lanes × 5 levels · 1000 kg UDL per beam · -22°C zone
                </div>
                <MultiLaneRackSVG
                    lanes={LANES}
                    levels={LEVELS}
                    matrixEntry={matrixEntry}
                    activeLane={activeLane}
                    activeLevel={activeLevel}
                    onCellClick={(ln, lv) => { setActiveLane(ln); setActiveLevel(lv); }}
                />
                <div className="flex items-center gap-5 mt-3 text-[10px] font-mono text-gray-600 flex-wrap">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 bg-emerald-500/22 border border-emerald-500/45 inline-block" /> Empty / Low
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 bg-amber-500/28 border border-amber-500/55 inline-block" /> 50–79%
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 bg-red-500/30 border border-red-500/60 inline-block" /> 80–100%
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border border-cyan-400 bg-cyan-400/15 inline-block" /> Selected
                    </span>
                    <span className="ml-auto text-[9px] text-gray-700">Lane numbers below · Level numbers left</span>
                </div>
            </div>

            {/* Deep Lane Visualization */}
            <div className="bg-[#181a20] border border-cyan-500/20">
                <div className="px-5 py-4 border-b border-cyan-500/15 flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <div className="font-mono text-[10px] tracking-widest text-cyan-400 uppercase">
                            // DEEP LANE VIEW // SZA-{String(activeLane).padStart(2, "0")}-L{String(activeLevel).padStart(2, "0")}
                        </div>
                        <h3 className="font-semibold mt-1 flex items-center gap-2">
                            <Zap size={16} className="text-cyan-400" />
                            Lane {activeLane} · {LEVELS.find((l) => l.no === activeLevel)?.label}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {isOp && (
                            <>
                                <button
                                    onClick={() => setShowInbound(true)}
                                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider"
                                >
                                    <ArrowLeft size={13} /> Inbound
                                </button>
                                <button
                                    onClick={() => setShowOutbound(true)}
                                    disabled={!canDispatch}
                                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-white/10 disabled:text-gray-600 text-black px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed"
                                >
                                    <ArrowRight size={13} /> Dispatch D01
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="p-5">
                    {/* Direction labels */}
                    <div className="flex items-center justify-between font-mono text-[10px] text-gray-600 mb-3 px-1">
                        <span className="text-amber-400">← DISPATCH FACE (D01)</span>
                        <span className="text-emerald-400">LOAD ENTRY (D50) →</span>
                    </div>

                    {/* Rack elevation — single level showing all 50 depth positions */}
                    {(() => {
                        const elevBins = laneDetail.map((slot) => {
                            const exp = slot.stock?.expiry_date;
                            const daysLeft = exp
                                ? Math.floor((new Date(exp) - Date.now()) / 86400000)
                                : null;
                            return {
                                level: 1,
                                position: slot.depth,
                                occupied: slot.occupied,
                                expiring: daysLeft !== null && daysLeft < 30,
                            };
                        });
                        return (
                            <RackElevationSVG
                                levels={1}
                                depth={50}
                                bins={elevBins}
                                weightCapacityKg={1000}
                                compact={false}
                                highlightDepth={1}
                            />
                        );
                    })()}

                    {/* Depth tick labels below */}
                    <div className="flex justify-between font-mono text-[8px] text-gray-600 mt-1 px-6">
                        <span>D01</span>
                        <span>D10</span>
                        <span>D20</span>
                        <span>D30</span>
                        <span>D40</span>
                        <span>D50</span>
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-3 font-mono text-[10px] text-gray-600 flex-wrap">
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 bg-amber-500/85 border border-amber-400 inline-block" /> D01 — Exit / Dispatch
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 bg-amber-600/60 border border-amber-600 inline-block" /> Occupied
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 bg-red-500/65 border border-red-400 inline-block" /> Expiring &lt;30d
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 bg-white/3 border border-white/7 inline-block" /> Empty
                        </span>
                    </div>

                    {/* Lane Stats */}
                    {(() => {
                        const e = matrixEntry(activeLane, activeLevel);
                        if (!e) return null;
                        return (
                            <div className="mt-4 grid grid-cols-4 gap-3">
                                <LaneStat label="Occupied" value={`${e.occupied}/50`} />
                                <LaneStat label="Available" value={e.empty} color="text-emerald-400" />
                                <LaneStat label="Utilization" value={`${e.utilization_pct}%`} color="text-amber-400" />
                                <LaneStat label="Next Load At" value={e.occupied < 50 ? `D${String(e.last_inbound_depth + 1).padStart(2, "0")}` : "FULL"} color="text-cyan-400" />
                            </div>
                        );
                    })()}
                </div>

                {/* Pallet Contents Table */}
                {laneDetail.some((d) => d.occupied) && (
                    <div className="border-t border-white/10 px-5 pb-5">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mt-4 mb-3">
                            // PALLET CONTENTS // FIFO ORDER — D01 = NEXT DISPATCH
                        </div>
                        <div className="space-y-1">
                            {laneDetail
                                .filter((d) => d.occupied)
                                .map((d) => {
                                    const exp = d.stock?.expiry_date;
                                    const daysLeft = exp ? Math.floor((new Date(exp) - Date.now()) / 86400000) : null;
                                    return (
                                        <div
                                            key={d.depth}
                                            className={`flex items-center gap-3 px-3 py-2 border ${
                                                d.depth === 1
                                                    ? "border-amber-500/40 bg-amber-500/5"
                                                    : "border-white/5 bg-[#0d0e12]"
                                            }`}
                                        >
                                            <div className={`font-mono text-[10px] w-10 shrink-0 ${d.depth === 1 ? "text-amber-400 font-bold" : "text-gray-500"}`}>
                                                D{String(d.depth).padStart(2, "0")}
                                                {d.depth === 1 && <div className="text-[8px]">EXIT</div>}
                                            </div>
                                            <div className="font-mono text-[10px] text-amber-400 w-36 shrink-0">
                                                {d.stock?.pallet_code || "—"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-semibold truncate">{d.stock?.sku_name}</div>
                                                <div className="font-mono text-[10px] text-gray-500">
                                                    {d.stock?.sku_code}
                                                    {d.stock?.batch_no ? ` · B/${d.stock.batch_no}` : ""}
                                                </div>
                                            </div>
                                            {daysLeft !== null && (
                                                <div className={`font-mono text-[10px] px-2 py-0.5 border shrink-0 ${
                                                    daysLeft < 30
                                                        ? "text-red-400 border-red-500/30 bg-red-500/10"
                                                        : daysLeft < 90
                                                          ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                                                          : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                                }`}>
                                                    EXP {exp} · {daysLeft}d
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </div>

            {/* Movement History */}
            <div className="bg-[#181a20] border border-white/10 p-5">
                <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase mb-4 flex items-center justify-between">
                    <span>// MOVEMENT HISTORY — INBOUND / OUTBOUND</span>
                    <span className="text-gray-600">{movements.length} records</span>
                </div>
                {movements.length === 0 ? (
                    <div className="text-sm text-gray-600 font-mono py-4 text-center">No movements recorded yet</div>
                ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                        {movements.map((m) => (
                            <div key={m.id} className="flex items-center gap-3 px-3 py-2 border border-white/5 text-xs">
                                <div className={`font-mono text-[10px] px-2 py-0.5 border shrink-0 ${
                                    m.movement_type === "inbound"
                                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                        : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                                }`}>
                                    {m.movement_type.toUpperCase()}
                                </div>
                                <div className="font-mono text-[10px] text-gray-500 shrink-0 w-32">
                                    Lane {String(m.lane_no).padStart(2, "0")} · L{String(m.level_no).padStart(2, "0")}
                                </div>
                                <div className="font-mono text-[10px] text-amber-400 w-28 shrink-0">
                                    {m.pallet_code || "—"}
                                </div>
                                <div className="font-mono text-[10px] text-gray-400 flex-1">
                                    {m.sku_code}
                                    {m.movement_type === "inbound" && m.to_depth && ` → D${String(m.to_depth).padStart(2, "0")}`}
                                    {m.movement_type === "outbound" && ` ← D01 dispatched`}
                                </div>
                                <div className="font-mono text-[10px] text-gray-600 shrink-0">
                                    {new Date(m.timestamp).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Inbound Modal */}
            {showInbound && (
                <InboundModal
                    skus={skus}
                    laneNo={activeLane}
                    levelNo={activeLevel}
                    matrixEntry={matrixEntry(activeLane, activeLevel)}
                    onClose={() => setShowInbound(false)}
                    onSaved={async () => {
                        setShowInbound(false);
                        await reload();
                        await reloadDetail();
                        toast.success("Pallet placed successfully");
                    }}
                />
            )}

            {/* Outbound Modal */}
            {showOutbound && d01 && (
                <OutboundModal
                    laneNo={activeLane}
                    levelNo={activeLevel}
                    d01={d01}
                    onClose={() => setShowOutbound(false)}
                    onDispatched={async (result) => {
                        setShowOutbound(false);
                        await reload();
                        await reloadDetail();
                        toast.success(`Dispatched ${result.dispatched?.pallet_code || "pallet"} · ${result.pallets_shifted} pallets shifted forward`);
                    }}
                />
            )}
        </div>
    );
}

/* ─── Inbound Modal ─────────────────────────────────────── */
function InboundModal({ skus, laneNo, levelNo, matrixEntry, onClose, onSaved }) {
    const [form, setForm] = useState({
        sku_id: "",
        batch_no: "",
        manufacture_date: "",
        expiry_date: "",
        pallet_code: "",
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const nextDepth = (matrixEntry?.last_inbound_depth || 0) + 1;
    const isFull = matrixEntry?.occupied >= 50;

    const submit = async (e) => {
        e.preventDefault();
        if (!form.sku_id) { setErr("Select a SKU"); return; }
        setBusy(true); setErr("");
        try {
            await api.post("/shuttle/inbound", {
                lane_no: laneNo,
                level_no: levelNo,
                sku_id: form.sku_id,
                batch_no: form.batch_no || null,
                manufacture_date: form.manufacture_date || null,
                expiry_date: form.expiry_date || null,
                pallet_code: form.pallet_code || null,
            });
            onSaved();
        } catch (er) {
            setErr(er.response?.data?.detail || er.message);
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#181a20] border border-emerald-500/30 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-emerald-500/20">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">// SHUTTLE INBOUND</div>
                        <h3 className="text-lg font-bold mt-1">
                            Load Pallet — Lane {laneNo} · L{String(levelNo).padStart(2, "0")}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>
                <div className="px-5 py-3 bg-emerald-500/5 border-b border-emerald-500/10 font-mono text-xs text-emerald-400">
                    {isFull
                        ? "⚠ Lane is FULL (50/50) — cannot load"
                        : `Smart load: pallet will be placed at D${String(nextDepth).padStart(2, "0")} (deepest available)`}
                </div>
                <form onSubmit={submit} className="p-5 space-y-4">
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">SKU *</label>
                        <select
                            value={form.sku_id}
                            onChange={(e) => setForm({ ...form, sku_id: e.target.value })}
                            required
                            className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                        >
                            <option value="">— Select SKU —</option>
                            {skus.map((s) => (
                                <option key={s.id} value={s.id}>{s.sku_code} · {s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Batch No</label>
                            <input value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                                placeholder="e.g. B2024-001"
                                className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Pallet Code</label>
                            <input value={form.pallet_code} onChange={(e) => setForm({ ...form, pallet_code: e.target.value })}
                                placeholder="Auto-generated if blank"
                                className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Manufacture Date</label>
                            <input type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })}
                                className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Expiry Date</label>
                            <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                                className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none" />
                        </div>
                    </div>
                    {err && <div className="text-xs text-red-400 font-mono border border-red-500/30 bg-red-500/10 p-3">{err}</div>}
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white">Cancel</button>
                        <button type="submit" disabled={busy || isFull}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-40">
                            {busy ? "Loading…" : "Load Pallet →"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ─── Outbound / Dispatch Modal ─────────────────────────── */
function OutboundModal({ laneNo, levelNo, d01, onClose, onDispatched }) {
    const [ref, setRef] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const dispatch = async () => {
        setBusy(true); setErr("");
        try {
            const r = await api.post("/shuttle/outbound", {
                lane_no: laneNo,
                level_no: levelNo,
                ref: ref || null,
            });
            onDispatched(r.data);
        } catch (er) {
            setErr(er.response?.data?.detail || er.message);
            setBusy(false);
        }
    };

    const stock = d01?.stock;
    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#181a20] border border-amber-500/30 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-amber-500/20">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">// SHUTTLE DISPATCH // FIFO D01</div>
                        <h3 className="text-lg font-bold mt-1">
                            Dispatch from Lane {laneNo} · L{String(levelNo).padStart(2, "0")}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400 mb-2">Pallet at D01 (FIFO — oldest pallet)</div>
                        <div className="grid grid-cols-2 gap-y-1 text-xs font-mono">
                            <span className="text-gray-500">Pallet Code</span><span className="text-amber-400">{stock?.pallet_code || "—"}</span>
                            <span className="text-gray-500">SKU</span><span>{stock?.sku_code}</span>
                            <span className="text-gray-500">Name</span><span className="text-gray-300">{stock?.sku_name}</span>
                            <span className="text-gray-500">Batch</span><span>{stock?.batch_no || "—"}</span>
                            <span className="text-gray-500">Expiry</span><span className={stock?.expiry_date && Math.floor((new Date(stock.expiry_date) - Date.now()) / 86400000) < 30 ? "text-red-400" : "text-gray-300"}>{stock?.expiry_date || "—"}</span>
                            <span className="text-gray-500">Received</span><span className="text-gray-400">{stock?.received_date ? new Date(stock.received_date).toLocaleDateString() : "—"}</span>
                        </div>
                    </div>
                    <div className="bg-[#0d0e12] border border-white/5 p-3 font-mono text-[10px] text-gray-500">
                        After dispatch, the shuttle will automatically shift all remaining pallets forward:
                        D02→D01, D03→D02, … preserving FIFO order.
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Order Reference (optional)</label>
                        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. SO-2024-001"
                            className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none" />
                    </div>
                    {err && <div className="text-xs text-red-400 font-mono border border-red-500/30 bg-red-500/10 p-3">{err}</div>}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white">Cancel</button>
                        <button onClick={dispatch} disabled={busy}
                            className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-60">
                            {busy ? "Dispatching…" : "Confirm Dispatch →"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Small helpers ─────────────────────────────────────── */
function SummaryCard({ label, value, color = "text-white" }) {
    return (
        <div className="bg-[#181a20] border border-white/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
            <div className={`font-mono text-xl font-semibold mt-1 ${color}`}>{value}</div>
        </div>
    );
}

function LaneStat({ label, value, color = "text-white" }) {
    return (
        <div className="border border-white/5 bg-[#0d0e12] p-3">
            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-600">{label}</div>
            <div className={`font-mono text-sm font-semibold mt-0.5 ${color}`}>{value}</div>
        </div>
    );
}
