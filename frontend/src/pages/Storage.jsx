import { useEffect, useMemo, useState } from "react";
import { api, formatErr } from "../lib/api";
import {
    Snowflake,
    Layers,
    Package2,
    ArrowRight,
    ArrowLeft,
    X,
    Sparkles,
    ArrowLeftRight,
    MoveRight,
    CheckCircle2,
    Tag,
    Pencil,
    Trash2,
    Plus,
    AlertTriangle,
    PackagePlus,
    PackageMinus,
    Zap,
} from "lucide-react";
import ZoneProvisionModal from "../components/ZoneProvisionModal";
import RackElevationSVG from "../components/RackElevationSVG";
import ShuttleZone from "./ShuttleZone";
import { useAuth } from "../context/AuthContext";

const SHUTTLE_ZONE_CODE = "SHUTTLE_ZONE_A";

export default function Storage() {
    const { user } = useAuth();
    const [zones, setZones] = useState([]);
    const [activeZone, setActiveZone] = useState(null);
    const [lanes, setLanes] = useState([]);
    const [flowLanes, setFlowLanes] = useState([]);
    const [skus, setSkus] = useState([]);
    const [filterRow, setFilterRow] = useState("ALL");
    const [filterType, setFilterType] = useState("ALL");
    const [openLane, setOpenLane] = useState(null);
    const [provisionZone, setProvisionZone] = useState(null);
    const [addZoneModal, setAddZoneModal] = useState(false);
    const [editZone, setEditZone] = useState(null);
    const [deleteZone, setDeleteZone] = useState(null);

    const isAdmin = user?.role === "admin" || user?.role === "manager";
    const isSuperAdmin = user?.role === "admin";

    const reloadZones = async () => {
        const z = await api.get("/storage/zones");
        setZones(z.data);
    };

    const reloadFlowLanes = async () => {
        const r = await api.get("/storage/flow-lanes");
        setFlowLanes(r.data);
    };

    useEffect(() => {
        (async () => {
            const [z, fl, sk] = await Promise.all([
                api.get("/storage/zones"),
                api.get("/storage/flow-lanes"),
                api.get("/inventory/skus"),
            ]);
            setZones(z.data);
            setFlowLanes(fl.data);
            setSkus(sk.data);
            const cold1 = z.data.find((x) => x.zone === "COLD-1");
            setActiveZone(cold1?.zone || z.data[0]?.zone);
        })();
    }, []);

    useEffect(() => {
        if (!activeZone) return;
        (async () => {
            const r = await api.get(`/storage/lanes?zone=${activeZone}`);
            setLanes(r.data);
        })();
    }, [activeZone]);

    const filteredLanes = useMemo(() => {
        return lanes.filter((l) => {
            if (filterRow !== "ALL" && l.row !== filterRow) return false;
            if (filterType !== "ALL" && l.rack_type !== filterType) return false;
            return true;
        });
    }, [lanes, filterRow, filterType]);

    const stats = useMemo(() => {
        const total = lanes.reduce((a, l) => a + l.total_slots, 0);
        const filled = lanes.reduce((a, l) => a + l.filled_slots, 0);
        return { total, filled, util: total ? Math.round((filled / total) * 100) : 0 };
    }, [lanes]);

    const activeZoneInfo = zones.find((z) => z.zone === activeZone);

    const rackTypes = [...new Set(lanes.map((l) => l.rack_type).filter(Boolean))];

    return (
        <div className="space-y-5">
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                        // STORAGE // {activeZone === SHUTTLE_ZONE_CODE ? "SHUTTLE FIFO ZONE" : "RACK SYSTEMS"}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight mt-1">
                        Warehouse Storage
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    {activeZone !== SHUTTLE_ZONE_CODE && isAdmin && (
                        <button
                            onClick={() => setAddZoneModal(true)}
                            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-xs font-bold uppercase tracking-wider"
                        >
                            <Plus size={14} /> Add Zone
                        </button>
                    )}
                </div>
            </div>

            {/* Flow Rack System Panel */}
            {activeZone !== SHUTTLE_ZONE_CODE && flowLanes.length > 0 && (
                <FlowRackPanel
                    flowLanes={flowLanes}
                    skus={skus}
                    isAdmin={isAdmin}
                    onAssigned={reloadFlowLanes}
                    onLaneClick={(lane) => {
                        setActiveZone(lane.zone);
                        setOpenLane({ ...lane, rack_type: "flow_rack" });
                    }}
                />
            )}

            {/* Zone selector */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {zones.map((z) => {
                    const pct = z.capacity ? Math.round((z.occupied / z.capacity) * 100) : 0;
                    const active = activeZone === z.zone;
                    return (
                        <div
                            key={z.zone}
                            className={`relative text-left p-4 border transition-colors cursor-pointer ${
                                z.zone === SHUTTLE_ZONE_CODE
                                    ? active
                                        ? "border-cyan-500 bg-cyan-500/5"
                                        : "border-cyan-500/30 bg-[#181a20] hover:border-cyan-400/60"
                                    : active
                                        ? "border-amber-500 bg-amber-500/5"
                                        : "border-white/10 bg-[#181a20] hover:border-amber-500/40"
                            } ${z.placeholder ? "opacity-70" : ""}`}
                            onClick={() => setActiveZone(z.zone)}
                            data-testid={`zone-${z.zone}`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                                            {z.zone}
                                        </div>
                                        {z.zone === SHUTTLE_ZONE_CODE && (
                                            <Zap size={10} className="text-cyan-400 shrink-0" />
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-0.5 truncate">{z.name}</div>
                                </div>
                                <div className="flex items-center gap-1 ml-2 shrink-0">
                                    {isAdmin && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditZone(z); }}
                                            title="Edit zone"
                                            className="p-1 text-gray-600 hover:text-amber-400 transition-colors"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    )}
                                    {isSuperAdmin && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteZone(z); }}
                                            title="Delete zone"
                                            className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="font-mono text-2xl font-semibold mt-3">
                                {z.placeholder ? "—" : `${pct}%`}
                            </div>
                            <div className="font-mono text-[10px] text-gray-500 mt-1">
                                {z.placeholder
                                    ? "Awaiting blueprint"
                                    : `${z.occupied}/${z.capacity} pallets · ${z.bins} slots`}
                            </div>
                            {!z.placeholder && (
                                <div className="mt-2 h-1 bg-white/5">
                                    <div
                                        className={`h-full ${
                                            pct < 40
                                                ? "bg-emerald-500"
                                                : pct < 80
                                                  ? "bg-amber-500"
                                                  : "bg-red-500"
                                        }`}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {activeZone === SHUTTLE_ZONE_CODE ? (
                <ShuttleZone embedded />
            ) : <>

            {activeZoneInfo?.placeholder && (
                <div className="bg-[#181a20] border border-dashed border-white/15 p-12 text-center">
                    <Package2 size={32} className="mx-auto text-gray-600 mb-3" />
                    <div className="font-mono text-[11px] uppercase tracking-widest text-amber-400 mb-1">
                        // ZONE NOT CONFIGURED
                    </div>
                    <div className="text-gray-400 text-sm mb-5">
                        Upload a blueprint or configure manually for{" "}
                        <span className="text-white font-mono">{activeZoneInfo.zone}</span>.
                    </div>
                    <button
                        onClick={() => setProvisionZone(activeZoneInfo)}
                        data-testid="provision-zone-btn"
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-5 py-2.5 text-sm font-bold uppercase tracking-wider"
                    >
                        <Sparkles size={14} /> Provision Zone
                    </button>
                </div>
            )}

            {!activeZoneInfo?.placeholder && (
                <>
                    {/* Stats strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Stat label="Total Lanes" value={lanes.length} mono />
                        <Stat label="Pallet Slots" value={stats.total} mono />
                        <Stat label="Occupied" value={`${stats.filled} / ${stats.total}`} mono color="text-emerald-400" />
                        <Stat label="Utilization" value={`${stats.util}%`} mono color="text-amber-400" />
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1 text-[10px] tracking-widest text-gray-500 uppercase font-semibold">
                            Row:
                        </div>
                        {["ALL", "A", "B", "C"].map((r) => (
                            <FilterChip
                                key={r}
                                active={filterRow === r}
                                onClick={() => setFilterRow(r)}
                                label={r === "ALL" ? "ALL" : `Row ${r}`}
                                testid={`filter-row-${r}`}
                            />
                        ))}
                        <div className="ml-4 flex items-center gap-1 text-[10px] tracking-widest text-gray-500 uppercase font-semibold">
                            Type:
                        </div>
                        <FilterChip
                            active={filterType === "ALL"}
                            onClick={() => setFilterType("ALL")}
                            label="ALL"
                            testid="filter-type-ALL"
                        />
                        {rackTypes.map((t) => (
                            <FilterChip
                                key={t}
                                active={filterType === t}
                                onClick={() => setFilterType(t)}
                                label={t === "flow_rack" ? "FLOW RACK" : `Type ${t}`}
                                testid={`filter-type-${t}`}
                                highlight={t === "flow_rack"}
                            />
                        ))}
                    </div>

                    {/* Lane Layout */}
                    <div className="bg-[#181a20] border border-white/10 p-5">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                            <div>
                                <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                                    // RACK LAYOUT // {activeZone}
                                </div>
                                <h3 className="font-semibold mt-1">Lane Layout</h3>
                            </div>
                            <Legend />
                        </div>

                        <div className="space-y-6">
                            {["A", "B", "C"].map((row) => {
                                const rowLanes = filteredLanes.filter((l) => l.row === row);
                                if (!rowLanes.length) return null;
                                return (
                                    <div key={row}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-8 h-8 bg-amber-500 text-black flex items-center justify-center font-bold">
                                                {row}
                                            </div>
                                            <div>
                                                <div className="font-mono text-sm font-semibold">ROW {row}</div>
                                                <div className="font-mono text-[10px] text-gray-500 uppercase">
                                                    {rowLanes.length} lanes · {[...new Set(rowLanes.map(l => l.rack_type))].join(", ")} · {rowLanes[0]?.weight_capacity_kg.toLocaleString()}kg/lane
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {rowLanes.map((lane) => (
                                                <LaneCard
                                                    key={`${lane.row}-${lane.lane_number}`}
                                                    lane={lane}
                                                    onClick={() => setOpenLane(lane)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            </>}

            {openLane && (
                <LaneDrawer
                    lane={openLane}
                    skus={skus}
                    isAdmin={isAdmin}
                    activeZone={activeZone}
                    onClose={() => setOpenLane(null)}
                    onAssigned={() => {
                        reloadFlowLanes();
                        api.get(`/storage/lanes?zone=${activeZone}`).then(r => setLanes(r.data));
                    }}
                />
            )}

            {provisionZone && (
                <ZoneProvisionModal
                    zone={provisionZone}
                    onClose={() => setProvisionZone(null)}
                    onSaved={async () => {
                        await reloadZones();
                        await reloadFlowLanes();
                        setActiveZone(provisionZone.zone);
                        setProvisionZone(null);
                    }}
                />
            )}

            {addZoneModal && (
                <AddZoneModal
                    onClose={() => setAddZoneModal(false)}
                    onCreated={async (zone) => {
                        await reloadZones();
                        setAddZoneModal(false);
                        setProvisionZone(zone);
                    }}
                />
            )}

            {editZone && (
                <EditZoneModal
                    zone={editZone}
                    onClose={() => setEditZone(null)}
                    onSaved={async () => {
                        await reloadZones();
                        await reloadFlowLanes();
                        setEditZone(null);
                    }}
                />
            )}

            {deleteZone && (
                <DeleteZoneConfirm
                    zone={deleteZone}
                    onClose={() => setDeleteZone(null)}
                    onDeleted={async () => {
                        await reloadZones();
                        await reloadFlowLanes();
                        setDeleteZone(null);
                        setZones((prev) => {
                            const remaining = prev.filter((z) => z.zone !== deleteZone.zone);
                            setActiveZone(remaining[0]?.zone || null);
                            return remaining;
                        });
                    }}
                />
            )}
        </div>
    );
}

/* ─── View Tab Button ────────────────────────────────────── */
function TabButton({ active, onClick, icon: Icon, label, testid }) {
    return (
        <button
            onClick={onClick}
            data-testid={testid}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                active
                    ? "border-amber-500 text-amber-400"
                    : "border-transparent text-gray-500 hover:text-gray-200"
            }`}
        >
            <Icon size={14} /> {label}
        </button>
    );
}

/* ─── Add Zone Modal ─────────────────────────────────────── */
function AddZoneModal({ onClose, onCreated }) {
    const [form, setForm] = useState({ zone_code: "", zone_name: "" });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
            const code = form.zone_code.trim().toUpperCase();
            await api.post("/storage/zones", {
                zone_code: code,
                zone_name: form.zone_name.trim() || code,
            });
            onCreated({ zone: code, name: form.zone_name.trim() || code, placeholder: true });
        } catch (er) {
            setErr(formatErr(er.response?.data?.detail) || er.message);
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#181a20] border border-white/10 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">// NEW ZONE</div>
                        <h3 className="text-lg font-bold mt-1">Add Storage Zone</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
                </div>
                <form onSubmit={submit} className="p-5 space-y-4">
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Zone Code</label>
                        <input
                            value={form.zone_code}
                            onChange={(e) => setForm({ ...form, zone_code: e.target.value })}
                            placeholder="e.g. AMBIENT-2"
                            required
                            className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none uppercase"
                        />
                        <div className="text-[10px] text-gray-600 mt-1">Short identifier — used in all bin codes</div>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Zone Name</label>
                        <input
                            value={form.zone_name}
                            onChange={(e) => setForm({ ...form, zone_name: e.target.value })}
                            placeholder="e.g. Ambient Overflow"
                            className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
                        />
                    </div>
                    {err && <div className="text-xs text-red-400 font-mono border border-red-500/30 bg-red-500/10 p-3">{err}</div>}
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white">
                            Cancel
                        </button>
                        <button type="submit" disabled={busy} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-60">
                            {busy ? "Creating…" : "Create & Configure →"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ─── Edit Zone Modal ────────────────────────────────────── */
function EditZoneModal({ zone, onClose, onSaved }) {
    const [form, setForm] = useState({ zone_name: zone.name });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
            await api.put(`/storage/zones/${zone.zone}`, {
                zone_name: form.zone_name.trim(),
            });
            onSaved();
        } catch (er) {
            setErr(formatErr(er.response?.data?.detail) || er.message);
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#181a20] border border-white/10 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">// EDIT ZONE</div>
                        <h3 className="text-lg font-bold mt-1">Edit {zone.zone}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
                </div>
                <form onSubmit={submit} className="p-5 space-y-4">
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Zone Code</label>
                        <input value={zone.zone} disabled className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm opacity-50" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Zone Name</label>
                        <input
                            value={form.zone_name}
                            onChange={(e) => setForm({ ...form, zone_name: e.target.value })}
                            required
                            className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
                        />
                    </div>
                    {err && <div className="text-xs text-red-400 font-mono border border-red-500/30 bg-red-500/10 p-3">{err}</div>}
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white">
                            Cancel
                        </button>
                        <button type="submit" disabled={busy} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-60">
                            {busy ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ─── Delete Zone Confirm ────────────────────────────────── */
function DeleteZoneConfirm({ zone, onClose, onDeleted }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [confirmed, setConfirmed] = useState("");

    const doDelete = async () => {
        setBusy(true);
        setErr("");
        try {
            await api.delete(`/storage/zones/${zone.zone}`);
            onDeleted();
        } catch (er) {
            setErr(formatErr(er.response?.data?.detail) || er.message);
            setBusy(false);
        }
    };

    const canDelete = confirmed.trim().toUpperCase() === zone.zone;

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#181a20] border border-red-500/30 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-red-500/20">
                    <div className="flex items-center gap-3">
                        <AlertTriangle size={20} className="text-red-400" />
                        <div>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-red-400">// DANGER ZONE</div>
                            <h3 className="text-lg font-bold mt-1">Delete {zone.zone}</h3>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300 leading-relaxed">
                        This will permanently delete <strong className="text-white">{zone.name}</strong> and all{" "}
                        <strong className="text-white">{zone.bins || 0} bin records</strong> in this zone.
                        Stock must be cleared before deletion. This cannot be undone.
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">
                            Type <span className="text-white font-mono">{zone.zone}</span> to confirm
                        </label>
                        <input
                            value={confirmed}
                            onChange={(e) => setConfirmed(e.target.value)}
                            placeholder={zone.zone}
                            className="w-full bg-[#090a0c] border border-red-500/30 px-3 py-2 font-mono text-sm focus:border-red-500 focus:outline-none uppercase"
                        />
                    </div>
                    {err && <div className="text-xs text-red-400 font-mono border border-red-500/30 bg-red-500/10 p-3">{err}</div>}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white">
                            Cancel
                        </button>
                        <button
                            onClick={doDelete}
                            disabled={!canDelete || busy}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-40"
                        >
                            {busy ? "Deleting…" : "Delete Zone"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Flow Rack Panel ─────────────────────────────────────── */
function FlowRackPanel({ flowLanes, skus, isAdmin, onAssigned, onLaneClick }) {
    return (
        <div className="bg-[#181a20] border border-amber-500/30">
            <div className="px-5 py-4 border-b border-amber-500/20 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.25em] text-amber-400 uppercase">
                        // GRAVITY FLOW RACK // AUTO FIFO
                    </div>
                    <h3 className="font-semibold mt-1 flex items-center gap-2">
                        <ArrowLeftRight size={16} className="text-amber-400" />
                        Live Storage Lanes
                    </h3>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 border border-white/10 px-3 py-1.5">
                    <span className="text-emerald-400">LOAD REAR →</span>
                    <span className="text-gray-600">pallets slide forward</span>
                    <span className="text-amber-400">→ EXIT FRONT</span>
                </div>
            </div>

            <div className="p-4">
                <div className="text-[10px] font-mono text-gray-500 mb-3 flex items-center gap-1.5 uppercase tracking-widest">
                    <CheckCircle2 size={10} className="text-emerald-400" />
                    FIFO enforced mechanically — pallets automatically advance to exit
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {flowLanes.map((lane, i) => (
                        <FlowLaneCard
                            key={i}
                            lane={lane}
                            skus={skus}
                            isAdmin={isAdmin}
                            onAssigned={onAssigned}
                            onClick={() => onLaneClick(lane)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function FlowLaneCard({ lane, skus, isAdmin, onAssigned, onClick }) {
    const [assigning, setAssigning] = useState(false);
    const [selectedSku, setSelectedSku] = useState(lane.sku_assignment || "");
    const [busy, setBusy] = useState(false);

    const pct = lane.total_slots ? Math.round((lane.filled_slots / lane.total_slots) * 100) : 0;

    const handleAssign = async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
            await api.patch(
                `/storage/lanes/${lane.zone}/${lane.row}/${lane.lane_number}/assign-sku`,
                { sku_id: selectedSku || null }
            );
            onAssigned();
            setAssigning(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="border border-amber-500/20 bg-[#0d0e12] p-4 space-y-3">
            {/* Lane header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="font-mono text-[10px] text-gray-500 uppercase">Lane</div>
                    <div className="font-mono text-amber-400 font-bold">
                        {lane.zone}-{lane.row}-L{String(lane.lane_number).padStart(2, "0")}
                    </div>
                </div>
                <button
                    onClick={onClick}
                    className="font-mono text-[10px] text-gray-500 hover:text-amber-400 flex items-center gap-1 uppercase"
                >
                    Inspect <ArrowRight size={11} />
                </button>
            </div>

            {/* Flow conveyor diagram */}
            <FlowConveyor filled={lane.filled_slots} total={lane.total_slots / (lane.levels || 1)} levels={lane.levels} />

            {/* SKU assignment */}
            <div>
                {!assigning ? (
                    <div className="flex items-center justify-between">
                        <div>
                            {lane.sku ? (
                                <div>
                                    <div className="font-mono text-[9px] text-gray-500 uppercase mb-0.5">Dedicated SKU</div>
                                    <div className="font-mono text-xs text-amber-400 font-semibold">
                                        {lane.sku.sku_code}
                                    </div>
                                    <div className="text-[10px] text-gray-400">{lane.sku.name}</div>
                                </div>
                            ) : (
                                <div className="font-mono text-[10px] text-gray-600 italic">No SKU assigned</div>
                            )}
                        </div>
                        {isAdmin && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setAssigning(true); }}
                                className="text-[10px] font-mono text-gray-500 hover:text-amber-400 border border-white/10 hover:border-amber-500/40 px-2 py-1 uppercase tracking-wide flex items-center gap-1"
                            >
                                <Tag size={10} /> Assign
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <select
                            value={selectedSku}
                            onChange={(e) => setSelectedSku(e.target.value)}
                            className="w-full bg-[#090a0c] border border-white/10 px-2 py-1.5 text-xs font-mono focus:border-amber-500 focus:outline-none"
                        >
                            <option value="">— No assignment (mixed SKU) —</option>
                            {skus.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.sku_code} · {s.name}
                                </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <button
                                onClick={handleAssign}
                                disabled={busy}
                                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-bold uppercase tracking-wider py-1.5 disabled:opacity-60"
                            >
                                {busy ? "Saving…" : "Save"}
                            </button>
                            <button
                                onClick={() => { setAssigning(false); setSelectedSku(lane.sku_assignment || ""); }}
                                className="px-3 border border-white/10 text-gray-400 hover:text-white text-[10px] py-1.5"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="flex justify-between font-mono text-[10px]">
                <span className="text-gray-500">{lane.filled_slots}/{lane.total_slots} pallets</span>
                <span className={pct < 40 ? "text-emerald-400" : pct < 80 ? "text-amber-400" : "text-red-400"}>
                    {pct}% full
                </span>
            </div>
        </div>
    );
}

function FlowConveyor({ filled, total, levels }) {
    const depth = Math.round(total) || 4;
    const filledPerLevel = Math.round(filled / Math.max(levels, 1));
    return (
        <div>
            <div className="flex items-center gap-1 mb-1">
                <div className="font-mono text-[9px] text-gray-600 w-14 text-right shrink-0">LOAD →</div>
                <div className="flex-1 flex gap-0.5">
                    {[...Array(depth)].map((_, i) => {
                        const pos = depth - i;
                        const isLoaded = pos <= filledPerLevel;
                        return (
                            <div
                                key={i}
                                title={`Position P${String(pos).padStart(2, "0")} (${pos === 1 ? "EXIT/PICK" : pos === depth ? "LOAD" : "transit"})`}
                                className={`flex-1 h-5 border ${
                                    isLoaded
                                        ? "bg-emerald-500/70 border-emerald-500"
                                        : "bg-white/5 border-white/10"
                                } ${pos === 1 ? "border-l-amber-500 border-l-2" : ""}`}
                            />
                        );
                    })}
                </div>
                <div className="font-mono text-[9px] text-amber-400 w-10 shrink-0">→ EXIT</div>
            </div>
            <div className="flex items-center gap-1">
                <div className="w-14 shrink-0" />
                <div className="flex-1 flex justify-between font-mono text-[8px] text-gray-600">
                    <span>← P{String(depth).padStart(2, "0")} (rear)</span>
                    <span>P01 (front) →</span>
                </div>
            </div>
        </div>
    );
}

/* ─── Shared components ──────────────────────────────────── */
function Stat({ label, value, color = "text-white", mono }) {
    return (
        <div className="bg-[#181a20] border border-white/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
            <div className={`${mono ? "font-mono" : ""} text-2xl font-semibold mt-1 ${color}`}>{value}</div>
        </div>
    );
}

function FilterChip({ active, onClick, label, testid, highlight }) {
    return (
        <button
            onClick={onClick}
            data-testid={testid}
            className={`px-3 py-1 text-xs font-mono uppercase tracking-wider border transition-colors ${
                active
                    ? highlight
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                        : "border-amber-500 bg-amber-500/10 text-amber-400"
                    : highlight
                      ? "border-emerald-500/20 text-emerald-600 hover:border-emerald-500/50"
                      : "border-white/10 text-gray-400 hover:border-white/30"
            }`}
        >
            {label}
        </button>
    );
}

function LaneCard({ lane, onClick }) {
    const isFlow = lane.rack_type === "flow_rack";
    const pct = lane.total_slots ? Math.round((lane.filled_slots / lane.total_slots) * 100) : 0;
    const [palletBin, setPalletBin] = useState(null);

    const rackBins = lane.bins.map((b) => ({
        id: b.id,
        code: b.code,
        level: b.level,
        position: b.position,
        occupied: !!b.occupied,
        expiring: false,
    }));

    const borderCls = isFlow
        ? "border-amber-500/20 hover:border-amber-500/60"
        : "border-white/10 hover:border-amber-500/50";

    return (
        <div
            data-testid={`lane-${lane.row}-${lane.lane_number}`}
            className={`bg-[#0d0e12] border transition-colors p-3 ${borderCls}`}
        >
            {/* ── Header — click to open full lane drawer ── */}
            <button
                onClick={onClick}
                className="w-full text-left flex items-center justify-between mb-2 group"
            >
                <div className="flex items-center gap-2">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">Lane</div>
                    <div className="font-mono text-amber-400 font-bold">
                        L{String(lane.lane_number).padStart(2, "0")}
                    </div>
                    {isFlow ? (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            FLOW RACK
                        </span>
                    ) : (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 bg-white/5 text-gray-400">
                            TYPE {lane.rack_type}
                        </span>
                    )}
                </div>
                <ArrowRight size={14} className="text-gray-600 group-hover:text-amber-400 transition-colors" />
            </button>

            {/* ── Rack elevation drawing — click an occupied slot to see pallet detail ── */}
            <div className="mb-2 overflow-hidden">
                <RackElevationSVG
                    levels={lane.levels}
                    depth={lane.depth}
                    bins={rackBins}
                    weightCapacityKg={lane.weight_capacity_kg || 1000}
                    compact
                    onSlotClick={(bin) => setPalletBin(bin)}
                />
            </div>

            {/* ── Direction hint ── */}
            <div className="flex justify-between font-mono text-[8px] text-gray-600 mb-2 px-0.5">
                {isFlow ? (
                    <>
                        <span>LOAD REAR →</span>
                        <span className="text-amber-400">→ EXIT/PICK</span>
                    </>
                ) : (
                    <>
                        <span>← AISLE</span>
                        <span>DEPTH {lane.depth} →</span>
                    </>
                )}
            </div>

            {/* ── Stats ── */}
            <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-gray-400">{lane.filled_slots}/{lane.total_slots} pallets</span>
                <span className={pct < 40 ? "text-emerald-400" : pct < 80 ? "text-amber-400" : "text-red-400"}>
                    {pct}%
                </span>
            </div>

            {/* ── Single-pallet detail modal ── */}
            {palletBin && (
                <PalletDetailModal bin={palletBin} onClose={() => setPalletBin(null)} />
            )}
        </div>
    );
}

/* ─── Pallet Detail Modal ────────────────────────────────── */
function PalletDetailModal({ bin, onClose }) {
    const [data, setData] = useState(null);
    const [err, setErr]   = useState(null);

    useEffect(() => {
        setData(null);
        setErr(null);
        api.get(`/storage/bins/${bin.id}/pallet`)
            .then((r) => setData(r.data))
            .catch(() => setErr("Could not load pallet data."));
    }, [bin.id]);

    const item = data?.item;
    const binInfo = data?.bin ?? bin;

    const exp = item?.expiry_date;
    const daysLeft = exp ? Math.floor((new Date(exp) - Date.now()) / 86400000) : null;
    const expColor =
        daysLeft === null ? "text-gray-400"
        : daysLeft < 30   ? "text-red-400"
        : daysLeft < 90   ? "text-amber-400"
                          : "text-emerald-400";

    return (
        <div
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-[#181a20] border border-white/10 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#111317]">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                            // PALLET DETAIL
                        </div>
                        <div className="font-mono text-sm font-bold mt-0.5 text-white">
                            {binInfo.code}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {err && (
                        <div className="font-mono text-xs text-red-400 border border-red-500/30 bg-red-500/10 p-3">
                            {err}
                        </div>
                    )}

                    {!data && !err && (
                        <div className="font-mono text-xs text-gray-500 py-4 text-center">LOADING...</div>
                    )}

                    {data && !item && (
                        <div className="font-mono text-xs text-gray-500 py-4 text-center">Slot is empty.</div>
                    )}

                    {item && (
                        <>
                            {/* SKU */}
                            <div className="border border-white/8 bg-white/2 p-3 space-y-0.5">
                                <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500">SKU</div>
                                <div className="font-mono text-amber-400 font-bold text-sm">{item.sku?.sku_code}</div>
                                <div className="text-sm text-white">{item.sku?.name}</div>
                                {item.sku?.category && (
                                    <div className="font-mono text-[10px] text-gray-500">{item.sku.category}</div>
                                )}
                            </div>

                            {/* Pallet & batch */}
                            <div className="grid grid-cols-2 gap-2">
                                <PalletField label="Pallet Code"  value={item.pallet_code || "—"} />
                                <PalletField label="Batch No."    value={item.batch_no || "—"} />
                                <PalletField label="Qty"          value={`${item.qty ?? "—"} ${item.sku?.unit || ""}`} />
                                <PalletField label="Location"     value={binInfo.code} mono />
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-2">
                                <PalletField label="Received"     value={item.received_date || "—"} />
                                <PalletField label="Manufactured" value={item.manufacture_date || "—"} />
                                <div className="col-span-2 border border-white/8 bg-white/2 p-2.5">
                                    <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 mb-0.5">Expiry Date</div>
                                    <div className={`font-mono text-sm font-bold ${expColor}`}>
                                        {exp || "—"}
                                        {daysLeft !== null && (
                                            <span className="font-normal text-[11px] ml-2">
                                                ({daysLeft < 0 ? "EXPIRED" : `${daysLeft}d remaining`})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {item.inbound_ref && (
                                <PalletField label="Inbound Ref" value={item.inbound_ref} />
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-4">
                    <button
                        onClick={onClose}
                        className="w-full border border-white/10 hover:border-white/30 text-gray-400 hover:text-white font-mono text-xs uppercase tracking-widest py-2.5 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

function PalletField({ label, value, mono }) {
    return (
        <div className="border border-white/8 bg-white/2 p-2.5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-gray-500 mb-0.5">{label}</div>
            <div className={`${mono ? "font-mono" : ""} text-sm text-white`}>{value}</div>
        </div>
    );
}

function Legend() {
    return (
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-white/5 border border-white/10" />
                <span className="text-gray-500">Empty</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-emerald-500/70 border border-emerald-500" />
                <span className="text-gray-500">Loaded</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-amber-500/20 border border-amber-500/40" />
                <span className="text-amber-500">Flow Rack</span>
            </div>
        </div>
    );
}

/* ─── Lane Drawer ─────────────────────────────────────────── */
function LaneDrawer({ lane, skus, isAdmin, activeZone, onClose, onAssigned }) {
    const [contents, setContents] = useState(null);
    const [assigning, setAssigning] = useState(false);
    const [selectedSku, setSelectedSku] = useState(lane.sku_assignment || "");
    const [busy, setBusy] = useState(false);
    const [showInbound, setShowInbound] = useState(false);
    const [outboundTarget, setOutboundTarget] = useState(null); // {level, position, item, binCode}

    const isFlow = lane.rack_type === "flow_rack";
    const isDriveIn = !isFlow;

    const loadContents = () =>
        api.get(`/storage/lanes/${lane.row}/${lane.lane_number}/contents`).then((r) =>
            setContents(r.data)
        );

    useEffect(() => { loadContents(); }, [lane]); // eslint-disable-line

    const handleAssign = async () => {
        setBusy(true);
        try {
            await api.patch(
                `/storage/lanes/${activeZone}/${lane.row}/${lane.lane_number}/assign-sku`,
                { sku_id: selectedSku || null }
            );
            onAssigned();
            setAssigning(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-end p-0"
            onClick={onClose}
        >
            <div
                className="bg-[#181a20] border-l border-white/10 h-screen max-w-2xl w-full overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-[#111317] flex items-center justify-between p-5 border-b border-white/10 z-10">
                    <div>
                        <div className={`font-mono text-[10px] uppercase tracking-widest ${isFlow ? "text-emerald-400" : "text-amber-400"}`}>
                            {isFlow ? "// FLOW RACK LANE // FIFO" : "// DRIVE-IN RACK // LIFO"}
                        </div>
                        <h3 className="text-xl font-bold tracking-tight mt-1">
                            ROW {lane.row} · LANE L{String(lane.lane_number).padStart(2, "0")}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {isDriveIn && (
                            <>
                                <button
                                    onClick={() => setShowInbound(true)}
                                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                                >
                                    <PackagePlus size={13} /> Inbound
                                </button>
                                <button
                                    onClick={() => {
                                        const front = contents?.find((c) => c.item && c.bin?.position === 1);
                                        if (front) setOutboundTarget({ level: front.bin.level, position: front.bin.position, item: front.item, binCode: front.bin.code });
                                    }}
                                    disabled={!contents?.some((c) => c.item && c.bin?.position === 1)}
                                    className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-white/8 disabled:text-gray-600 text-black px-3 py-1.5 text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed"
                                >
                                    <PackageMinus size={13} /> Pick
                                </button>
                            </>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-white ml-1" data-testid="lane-drawer-close">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* FIFO explanation banner for flow rack */}
                {isFlow && (
                    <div className="mx-5 mt-4 border border-emerald-500/30 bg-emerald-500/5 p-4">
                        <div className="flex items-start gap-3">
                            <ArrowLeftRight size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400 mb-1">
                                    Gravity Flow Rack — Auto FIFO
                                </div>
                                <div className="text-xs text-gray-400 leading-relaxed">
                                    Pallets are <strong className="text-white">loaded from the rear</strong> and automatically
                                    slide forward on rollers to the <strong className="text-white">exit/pick face</strong>.
                                    The oldest pallet is always at the front — FIFO is enforced mechanically without
                                    operator intervention.
                                </div>
                                <div className="mt-2 flex items-center gap-2 font-mono text-[10px]">
                                    <span className="text-gray-600">REAR (load)</span>
                                    <MoveRight size={14} className="text-emerald-400" />
                                    <span className="text-gray-600">··· slides forward ···</span>
                                    <MoveRight size={14} className="text-amber-400" />
                                    <span className="text-amber-400">FRONT (pick)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* SKU assignment section for flow rack */}
                {isFlow && (
                    <div className="mx-5 mt-4 border border-white/10 p-4">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                            // DEDICATED SKU ASSIGNMENT
                        </div>
                        {!assigning ? (
                            <div className="flex items-center justify-between">
                                <div>
                                    {lane.sku_assignment ? (
                                        <div>
                                            <div className="font-mono text-xs text-gray-500 mb-0.5">Assigned SKU</div>
                                            <div className="font-mono text-amber-400 font-bold">
                                                {skus.find(s => s.id === lane.sku_assignment)?.sku_code || lane.sku_assignment}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {skus.find(s => s.id === lane.sku_assignment)?.name}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-500 italic">No SKU assigned — mixed product mode</div>
                                    )}
                                </div>
                                {isAdmin && (
                                    <button
                                        onClick={() => setAssigning(true)}
                                        className="flex items-center gap-1.5 text-xs font-mono border border-white/10 hover:border-amber-500/40 text-gray-400 hover:text-amber-400 px-3 py-2 uppercase tracking-wider transition-colors"
                                    >
                                        <Tag size={12} /> {lane.sku_assignment ? "Change" : "Assign SKU"}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <select
                                    value={selectedSku}
                                    onChange={(e) => setSelectedSku(e.target.value)}
                                    className="w-full bg-[#0d0e12] border border-white/10 px-3 py-2 text-sm font-mono focus:border-amber-500 focus:outline-none"
                                >
                                    <option value="">— No assignment (mixed SKU) —</option>
                                    {skus.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.sku_code} · {s.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAssign}
                                        disabled={busy}
                                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm py-2 uppercase tracking-wider disabled:opacity-60"
                                    >
                                        {busy ? "Saving…" : "Save Assignment"}
                                    </button>
                                    <button
                                        onClick={() => { setAssigning(false); setSelectedSku(lane.sku_assignment || ""); }}
                                        className="px-4 border border-white/10 text-gray-400 hover:text-white text-sm py-2"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="p-5 grid grid-cols-2 gap-3 border-b border-white/10">
                    <Detail label="Rack Type" value={isFlow ? "Flow Rack (FIFO)" : lane.rack_type} />
                    <Detail label="Levels" value={lane.levels} />
                    <Detail label="Depth (positions)" value={lane.depth} />
                    <Detail label="Total Slots" value={lane.total_slots} />
                    <Detail label="Weight Capacity" value={`${lane.weight_capacity_kg?.toLocaleString()} kg`} />
                    <Detail label="Occupied" value={`${lane.filled_slots} / ${lane.total_slots}`} />
                </div>

                <div className="p-5">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                        {isFlow
                            ? "// PALLET CONTENTS // POSITION P01 = EXIT FACE"
                            : "// PALLET CONTENTS // BY LEVEL × POSITION"}
                    </div>
                    <div className="space-y-1">
                        {contents === null ? (
                            <div className="text-sm text-gray-500 font-mono">SCANNING...</div>
                        ) : (
                            contents.map((c, i) => {
                                const exp = c.item?.expiry_date;
                                const daysLeft = exp
                                    ? Math.floor((new Date(exp).getTime() - Date.now()) / 86400000)
                                    : null;
                                const expClass =
                                    daysLeft === null
                                        ? ""
                                        : daysLeft < 30
                                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                                          : daysLeft < 90
                                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";

                                const pos = c.bin?.code?.split("-P")?.[1];
                                const isExit = pos === "01";
                                // Drive-in: aisle-face slot (P01) that has a pallet = pickable
                                const isPickable = isDriveIn && c.item && c.bin?.position === 1;
                                return (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-3 px-3 py-2 border ${
                                            c.item ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/5"
                                        } ${isPickable ? "border-l-2 border-l-amber-400" : ""}
                                        ${isFlow && isExit ? "border-l-2 border-l-amber-400" : ""}`}
                                    >
                                        <Layers
                                            size={12}
                                            className={c.item ? "text-emerald-400 shrink-0" : "text-gray-600 shrink-0"}
                                        />
                                        <div className="font-mono text-[10px] text-amber-400 w-44 shrink-0 flex items-center gap-1.5">
                                            {c.bin.code}
                                            {isPickable && (
                                                <span className="text-amber-400 text-[9px] bg-amber-500/10 px-1 border border-amber-500/30">
                                                    AISLE
                                                </span>
                                            )}
                                            {isFlow && isExit && (
                                                <span className="text-amber-400 text-[9px] bg-amber-500/10 px-1 border border-amber-500/30">
                                                    PICK
                                                </span>
                                            )}
                                        </div>
                                        {c.item ? (
                                            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm truncate">{c.item.sku.name}</div>
                                                    <div className="font-mono text-[10px] text-gray-500">
                                                        {c.item.sku.sku_code}
                                                        {c.item.batch_no && ` · BATCH ${c.item.batch_no}`}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {daysLeft !== null && (
                                                        <div className={`font-mono text-[10px] px-2 py-0.5 border ${expClass}`}>
                                                            EXP {exp} · {daysLeft}d
                                                        </div>
                                                    )}
                                                    {isPickable && (
                                                        <button
                                                            onClick={() => setOutboundTarget({
                                                                level: c.bin.level,
                                                                position: c.bin.position,
                                                                item: c.item,
                                                                binCode: c.bin.code,
                                                            })}
                                                            className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 font-mono text-[9px] uppercase tracking-wider px-2 py-1 transition-colors"
                                                        >
                                                            <PackageMinus size={10} /> Pick
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="font-mono text-[10px] text-gray-600 uppercase">Empty slot</div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Inbound Modal */}
                {showInbound && (
                    <LaneInboundModal
                        skus={skus}
                        zone={activeZone}
                        lane={lane}
                        onClose={() => setShowInbound(false)}
                        onSaved={async (result) => {
                            setShowInbound(false);
                            await loadContents();
                            onAssigned();
                        }}
                    />
                )}

                {/* Outbound Confirm */}
                {outboundTarget && (
                    <LaneOutboundConfirm
                        zone={activeZone}
                        lane={lane}
                        target={outboundTarget}
                        onClose={() => setOutboundTarget(null)}
                        onDispatched={async () => {
                            setOutboundTarget(null);
                            await loadContents();
                            onAssigned();
                        }}
                    />
                )}
            </div>
        </div>
    );
}

function Detail({ label, value }) {
    return (
        <div className="border border-white/5 p-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
            <div className="font-mono text-sm mt-1">{value}</div>
        </div>
    );
}

/* ─── Lane Inbound Modal ──────────────────────────────────── */
function LaneInboundModal({ skus, zone, lane, onClose, onSaved }) {
    const levelCount = lane.levels || 1;
    const levelOptions = Array.from({ length: levelCount }, (_, i) => i + 1);
    const [form, setForm] = useState({
        level: levelOptions[0],
        sku_id: "",
        batch_no: "",
        manufacture_date: "",
        expiry_date: "",
        pallet_code: "",
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [result, setResult] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.sku_id) { setErr("Select a SKU"); return; }
        setBusy(true); setErr("");
        try {
            const r = await api.post(
                `/storage/lanes/${zone}/${lane.row}/${lane.lane_number}/inbound`,
                {
                    level: Number(form.level),
                    sku_id: form.sku_id,
                    batch_no: form.batch_no || null,
                    manufacture_date: form.manufacture_date || null,
                    expiry_date: form.expiry_date || null,
                    pallet_code: form.pallet_code || null,
                }
            );
            setResult(r.data);
        } catch (er) {
            setErr(formatErr(er.response?.data?.detail) || er.message);
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#181a20] border border-emerald-500/30 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-emerald-500/20 bg-[#111317]">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">// INBOUND — DRIVE-IN RACK</div>
                        <h3 className="text-lg font-bold mt-1">
                            Load Pallet — ROW {lane.row} · L{String(lane.lane_number).padStart(2, "0")}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
                </div>

                {result ? (
                    <div className="p-6 space-y-4">
                        <div className="flex items-center gap-3 border border-emerald-500/30 bg-emerald-500/8 p-4">
                            <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                            <div>
                                <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">Pallet Placed</div>
                                <div className="text-sm font-semibold mt-0.5">{result.pallet_code}</div>
                                <div className="font-mono text-xs text-gray-400 mt-0.5">
                                    Bin: {result.bin_code} · Level {result.placed_at_level} · Position P{String(result.placed_at_position).padStart(2, "0")}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setResult(null); setForm({ ...form, batch_no: "", pallet_code: "", manufacture_date: "", expiry_date: "" }); }}
                                className="flex-1 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-mono text-xs uppercase tracking-wider py-2.5"
                            >
                                + Load Another
                            </button>
                            <button onClick={() => onSaved(result)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider py-2.5">
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={submit} className="p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Rack Level *</label>
                                <select
                                    value={form.level}
                                    onChange={(e) => setForm({ ...form, level: e.target.value })}
                                    className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                                >
                                    {levelOptions.map((l) => (
                                        <option key={l} value={l}>Level {l}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Pallet Code</label>
                                <input
                                    value={form.pallet_code}
                                    onChange={(e) => setForm({ ...form, pallet_code: e.target.value })}
                                    placeholder="Auto-generated"
                                    className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                                />
                            </div>
                        </div>
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
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Batch No</label>
                            <input
                                value={form.batch_no}
                                onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                                placeholder="e.g. B2025-001"
                                className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Manufacture Date</label>
                                <input
                                    type="date"
                                    value={form.manufacture_date}
                                    onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })}
                                    className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold block mb-1">Expiry Date</label>
                                <input
                                    type="date"
                                    value={form.expiry_date}
                                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                                    className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                                />
                            </div>
                        </div>
                        {err && (
                            <div className="font-mono text-xs text-red-400 border border-red-500/30 bg-red-500/10 p-3">{err}</div>
                        )}
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={onClose} className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white">
                                Cancel
                            </button>
                            <button type="submit" disabled={busy} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-60">
                                {busy ? "Loading…" : "Place Pallet →"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

/* ─── Lane Outbound Confirm ───────────────────────────────── */
function LaneOutboundConfirm({ zone, lane, target, onClose, onDispatched }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [dispatched, setDispatched] = useState(null);

    const exp = target.item?.expiry_date;
    const daysLeft = exp ? Math.floor((new Date(exp) - Date.now()) / 86400000) : null;

    const confirm = async () => {
        setBusy(true); setErr("");
        try {
            const r = await api.post(
                `/storage/lanes/${zone}/${lane.row}/${lane.lane_number}/outbound`,
                { level: target.level }
            );
            setDispatched(r.data.dispatched);
        } catch (er) {
            setErr(formatErr(er.response?.data?.detail) || er.message);
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#181a20] border border-amber-500/30 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-amber-500/20 bg-[#111317]">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">// OUTBOUND — DRIVE-IN RACK</div>
                        <h3 className="text-lg font-bold mt-1">Pick from Aisle Face</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
                </div>

                {dispatched ? (
                    <div className="p-5 space-y-4">
                        <div className="flex items-center gap-3 border border-emerald-500/30 bg-emerald-500/8 p-4">
                            <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                            <div>
                                <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">Pallet Dispatched</div>
                                <div className="text-sm font-semibold mt-0.5">{dispatched.pallet_code}</div>
                                <div className="font-mono text-xs text-gray-400">{dispatched.sku_code} · {dispatched.sku_name}</div>
                                <div className="font-mono text-xs text-gray-600 mt-0.5">From: {dispatched.bin_code}</div>
                            </div>
                        </div>
                        <button onClick={onDispatched} className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm uppercase tracking-wider py-2.5">
                            Done
                        </button>
                    </div>
                ) : (
                    <div className="p-5 space-y-4">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-1">Pallet to Dispatch</div>
                        <div className="border border-white/10 bg-[#0d0e12] p-4 space-y-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-mono text-amber-400 font-bold">{target.item?.pallet_code || "—"}</div>
                                    <div className="text-sm font-semibold mt-0.5">{target.item?.sku?.name}</div>
                                    <div className="font-mono text-xs text-gray-500">{target.item?.sku?.sku_code}
                                        {target.item?.batch_no && ` · BATCH ${target.item.batch_no}`}
                                    </div>
                                </div>
                                <div className="font-mono text-[10px] text-gray-500 text-right">
                                    <div>{target.binCode}</div>
                                    <div>Level {target.level} · P{String(target.position).padStart(2, "0")}</div>
                                </div>
                            </div>
                            {exp && (
                                <div className={`font-mono text-[10px] px-2 py-1 border inline-block ${
                                    daysLeft < 30 ? "text-red-400 border-red-500/30 bg-red-500/10"
                                    : daysLeft < 90 ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                                    : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                }`}>
                                    EXP {exp} · {daysLeft}d remaining
                                </div>
                            )}
                        </div>
                        {err && (
                            <div className="font-mono text-xs text-red-400 border border-red-500/30 bg-red-500/10 p-3">{err}</div>
                        )}
                        <div className="flex gap-2">
                            <button onClick={onClose} className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white">
                                Cancel
                            </button>
                            <button
                                onClick={confirm}
                                disabled={busy}
                                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-60"
                            >
                                {busy ? "Dispatching…" : "Confirm Dispatch →"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
