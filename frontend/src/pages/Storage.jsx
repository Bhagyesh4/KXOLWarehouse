import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Snowflake, Layers, Package2, ArrowRight, X } from "lucide-react";

export default function Storage() {
    const [zones, setZones] = useState([]);
    const [activeZone, setActiveZone] = useState(null);
    const [lanes, setLanes] = useState([]);
    const [filterRow, setFilterRow] = useState("ALL");
    const [filterType, setFilterType] = useState("ALL");
    const [openLane, setOpenLane] = useState(null);
    const [skus, setSkus] = useState({});
    const [stockMap, setStockMap] = useState({});

    useEffect(() => {
        (async () => {
            const z = await api.get("/storage/zones");
            setZones(z.data);
            const cold1 = z.data.find((x) => x.zone === "COLD-1");
            setActiveZone(cold1?.zone || z.data[0]?.zone);
            const sk = await api.get("/inventory/skus");
            const map = {};
            sk.data.forEach((s) => (map[s.id] = s));
            setSkus(map);
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

    return (
        <div className="space-y-5">
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                        // STORAGE // DRIVE-IN RACKING
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight mt-1">
                        Warehouse Storage
                    </h1>
                </div>
                {activeZoneInfo && !activeZoneInfo.placeholder && (
                    <div className="flex items-center gap-3 border border-cyan-500/30 bg-cyan-500/5 px-4 py-2">
                        <Snowflake className="text-cyan-400" size={18} />
                        <div>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">
                                Temperature
                            </div>
                            <div className="font-mono text-cyan-400 text-lg font-semibold">
                                {activeZoneInfo.temperature}°C
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Zone selector */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {zones.map((z) => {
                    const pct = z.capacity ? Math.round((z.occupied / z.capacity) * 100) : 0;
                    const active = activeZone === z.zone;
                    return (
                        <button
                            key={z.zone}
                            onClick={() => setActiveZone(z.zone)}
                            data-testid={`zone-${z.zone}`}
                            className={`text-left p-4 border transition-colors ${
                                active
                                    ? "border-amber-500 bg-amber-500/5"
                                    : "border-white/10 bg-[#181a20] hover:border-amber-500/40"
                            } ${z.placeholder ? "opacity-60" : ""}`}
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                                        {z.zone}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-0.5">{z.name}</div>
                                </div>
                                {z.temperature !== null && z.temperature !== undefined && (
                                    <div
                                        className={`font-mono text-[10px] px-1.5 py-0.5 ${
                                            z.temperature < 0
                                                ? "bg-cyan-500/10 text-cyan-400"
                                                : "bg-amber-500/10 text-amber-400"
                                        }`}
                                    >
                                        {z.temperature}°C
                                    </div>
                                )}
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
                        </button>
                    );
                })}
            </div>

            {activeZoneInfo?.placeholder && (
                <div className="bg-[#181a20] border border-dashed border-white/15 p-12 text-center">
                    <Package2 size={32} className="mx-auto text-gray-600 mb-3" />
                    <div className="font-mono text-[11px] uppercase tracking-widest text-amber-400 mb-1">
                        // ZONE NOT CONFIGURED
                    </div>
                    <div className="text-gray-400 text-sm">
                        Upload a blueprint for <span className="text-white font-mono">{activeZoneInfo.zone}</span> to provision storage.
                    </div>
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
                        {["ALL", "A", "B", "C"].map((t) => (
                            <FilterChip
                                key={t}
                                active={filterType === t}
                                onClick={() => setFilterType(t)}
                                label={t === "ALL" ? "ALL" : `Type ${t}`}
                                testid={`filter-type-${t}`}
                            />
                        ))}
                    </div>

                    {/* Drive-In Rack Visualization */}
                    <div className="bg-[#181a20] border border-white/10 p-5">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                            <div>
                                <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                                    // DRIVE-IN LANES // LIFO // 4 LEVELS DEEP
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
                                                    {rowLanes.length} lanes · Type {rowLanes[0]?.rack_type} · {rowLanes[0]?.weight_capacity_kg.toLocaleString()}kg/lane
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

            {openLane && (
                <LaneDrawer
                    lane={openLane}
                    onClose={() => setOpenLane(null)}
                    skus={skus}
                />
            )}
        </div>
    );
}

function Stat({ label, value, color = "text-white", mono }) {
    return (
        <div className="bg-[#181a20] border border-white/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
            <div className={`${mono ? "font-mono" : ""} text-2xl font-semibold mt-1 ${color}`}>{value}</div>
        </div>
    );
}

function FilterChip({ active, onClick, label, testid }) {
    return (
        <button
            onClick={onClick}
            data-testid={testid}
            className={`px-3 py-1 text-xs font-mono uppercase tracking-wider border transition-colors ${
                active
                    ? "border-amber-500 bg-amber-500/10 text-amber-400"
                    : "border-white/10 text-gray-400 hover:border-white/30"
            }`}
        >
            {label}
        </button>
    );
}

function LaneCard({ lane, onClick }) {
    const pct = lane.total_slots ? Math.round((lane.filled_slots / lane.total_slots) * 100) : 0;
    return (
        <button
            onClick={onClick}
            data-testid={`lane-${lane.row}-${lane.lane_number}`}
            className="text-left bg-[#0d0e12] border border-white/10 hover:border-amber-500/50 transition-colors p-3 group"
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">
                        Lane
                    </div>
                    <div className="font-mono text-amber-400 font-bold">L{String(lane.lane_number).padStart(2, "0")}</div>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 bg-white/5 text-gray-400">
                        TYPE {lane.rack_type}
                    </span>
                </div>
                <ArrowRight size={14} className="text-gray-600 group-hover:text-amber-400 transition-colors" />
            </div>

            {/* Visual: levels stacked, depth across (drive-in shows entry on left) */}
            <div className="space-y-1 mb-2">
                {/* Render top-down (Level 4 → Level 1) */}
                {[...Array(lane.levels)].map((_, idx) => {
                    const level = lane.levels - idx;
                    const slots = lane.bins.filter((b) => b.level === level);
                    return (
                        <div key={level} className="flex gap-0.5 items-center">
                            <div className="w-5 font-mono text-[8px] text-gray-600 text-right">
                                LV{level}
                            </div>
                            {slots.map((s) => (
                                <div
                                    key={s.id}
                                    className={`flex-1 h-4 ${
                                        s.occupied
                                            ? "bg-emerald-500/70 border border-emerald-500"
                                            : "bg-white/5 border border-white/10"
                                    }`}
                                    title={s.code}
                                />
                            ))}
                        </div>
                    );
                })}
                <div className="flex gap-0.5 items-center mt-1">
                    <div className="w-5"></div>
                    <div className="flex-1 flex justify-between font-mono text-[8px] text-gray-600">
                        <span>← AISLE ENTRY</span>
                        <span>DEPTH {lane.depth} →</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-gray-400">
                    {lane.filled_slots}/{lane.total_slots} pallets
                </span>
                <span className={pct < 40 ? "text-emerald-400" : pct < 80 ? "text-amber-400" : "text-red-400"}>
                    {pct}%
                </span>
            </div>
        </button>
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
        </div>
    );
}

function LaneDrawer({ lane, onClose, skus }) {
    const [contents, setContents] = useState([]);
    useEffect(() => {
        (async () => {
            // fetch stock at each location of this lane
            const out = await Promise.all(
                lane.bins.map(async (b) => {
                    if (!b.occupied) return { bin: b, sku: null };
                    const r = await api.get(`/storage/locations?zone=COLD-1`);
                    // we need stock per location; query stock collection via existing endpoint
                    return { bin: b };
                })
            );
            // Better: fetch /inventory/skus and find stock map - use a single query through movements
            // Use inventory/skus/{id}/stock endpoints would be expensive - load all stock once
            const allSkus = Object.values(skus);
            const stockByLoc = {};
            for (const sku of allSkus) {
                try {
                    const r = await api.get(`/inventory/skus/${sku.id}/stock`);
                    r.data.forEach((row) => {
                        stockByLoc[row.location.id] = { sku, qty: row.qty };
                    });
                } catch {}
            }
            setContents(
                lane.bins.map((b) => ({
                    bin: b,
                    item: stockByLoc[b.id] || null,
                }))
            );
        })();
        // eslint-disable-next-line
    }, [lane]);

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
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                            // LANE INSPECTION
                        </div>
                        <h3 className="text-xl font-bold tracking-tight mt-1">
                            ROW {lane.row} · LANE L{String(lane.lane_number).padStart(2, "0")}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 grid grid-cols-2 gap-3 border-b border-white/10">
                    <Detail label="Rack Type" value={lane.rack_type} />
                    <Detail label="Levels" value={lane.levels} />
                    <Detail label="Depth (positions)" value={lane.depth} />
                    <Detail label="Total Slots" value={lane.total_slots} />
                    <Detail label="Weight Capacity" value={`${lane.weight_capacity_kg.toLocaleString()} kg`} />
                    <Detail
                        label="Occupied"
                        value={`${lane.filled_slots} / ${lane.total_slots}`}
                    />
                </div>

                <div className="p-5">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                        // PALLET CONTENTS // LIFO ORDER
                    </div>
                    <div className="space-y-1">
                        {contents.length === 0 ? (
                            <div className="text-sm text-gray-500">Loading contents...</div>
                        ) : (
                            contents.map((c, i) => (
                                <div
                                    key={i}
                                    className={`flex items-center gap-3 px-3 py-2 border ${
                                        c.item ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/5"
                                    }`}
                                >
                                    <div className="w-3 h-3 shrink-0">
                                        <Layers
                                            size={12}
                                            className={c.item ? "text-emerald-400" : "text-gray-600"}
                                        />
                                    </div>
                                    <div className="font-mono text-[10px] text-amber-400 w-44 shrink-0">
                                        {c.bin.code}
                                    </div>
                                    {c.item ? (
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm truncate">
                                                {c.item.sku.name}
                                            </div>
                                            <div className="font-mono text-[10px] text-gray-500">
                                                {c.item.sku.sku_code} · {c.item.qty} pallet
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="font-mono text-[10px] text-gray-600 uppercase">
                                            Empty slot
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
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
