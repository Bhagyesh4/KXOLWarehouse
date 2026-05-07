import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

export default function Storage() {
    const [locs, setLocs] = useState([]);
    const [zones, setZones] = useState([]);
    const [activeZone, setActiveZone] = useState(null);
    const [hover, setHover] = useState(null);

    useEffect(() => {
        (async () => {
            const [a, b] = await Promise.all([api.get("/storage/locations"), api.get("/storage/zones")]);
            setLocs(a.data);
            setZones(b.data);
            if (b.data.length) setActiveZone(b.data[0].zone);
        })();
    }, []);

    const visibleLocs = useMemo(
        () => locs.filter((l) => !activeZone || l.zone === activeZone),
        [locs, activeZone]
    );

    // group by rack
    const racks = useMemo(() => {
        const m = {};
        visibleLocs.forEach((l) => {
            (m[l.rack] = m[l.rack] || []).push(l);
        });
        Object.values(m).forEach((bins) => bins.sort((a, b) => a.bin.localeCompare(b.bin)));
        return Object.entries(m).sort(([a], [b]) => parseInt(a) - parseInt(b));
    }, [visibleLocs]);

    const cellColor = (occ, cap) => {
        const pct = cap ? occ / cap : 0;
        if (pct === 0) return "bg-transparent border-white/10 text-gray-500";
        if (pct < 0.4) return "bg-emerald-500/40 border-emerald-500/60 text-white";
        if (pct < 0.8) return "bg-amber-500/50 border-amber-500/70 text-black";
        if (pct <= 1) return "bg-red-500/60 border-red-500/80 text-white";
        return "bg-red-700 border-red-700 text-white";
    };

    return (
        <div className="space-y-5">
            <div>
                <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                    // STORAGE // OCCUPANCY HEATMAP
                </div>
                <h1 className="text-3xl font-bold tracking-tight mt-1">Warehouse Storage</h1>
            </div>

            {/* Zone summary cards */}
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
                            }`}
                        >
                            <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                                Zone {z.zone}
                            </div>
                            <div className="font-mono text-2xl font-semibold mt-1">{pct}%</div>
                            <div className="font-mono text-[10px] text-gray-500 mt-1">
                                {z.occupied}/{z.capacity} units · {z.bins} bins
                            </div>
                            <div className="mt-2 h-1 bg-white/5">
                                <div
                                    className={`h-full ${pct < 40 ? "bg-emerald-500" : pct < 80 ? "bg-amber-500" : "bg-red-500"}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Heatmap */}
            <div className="bg-[#181a20] border border-white/10 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                            // ZONE {activeZone || "—"} // RACKS × BINS
                        </div>
                        <h3 className="font-semibold mt-1">Bin-Level Heatmap</h3>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
                        <Legend cls="bg-transparent border border-white/20" label="Empty" />
                        <Legend cls="bg-emerald-500/40 border border-emerald-500/60" label="< 40%" />
                        <Legend cls="bg-amber-500/50 border border-amber-500/70" label="< 80%" />
                        <Legend cls="bg-red-500/60 border border-red-500/80" label="≥ 80%" />
                    </div>
                </div>

                <div className="space-y-3">
                    {racks.map(([rack, bins]) => (
                        <div key={rack} className="flex items-center gap-3">
                            <div className="w-12 font-mono text-xs text-gray-500 shrink-0">R{rack}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {bins.map((b) => (
                                    <div
                                        key={b.id}
                                        data-testid={`bin-${b.code}`}
                                        onMouseEnter={() => setHover(b)}
                                        onMouseLeave={() => setHover(null)}
                                        className={`w-14 h-14 border flex flex-col items-center justify-center text-[10px] font-mono cursor-pointer transition-transform hover:scale-110 ${cellColor(
                                            b.occupied,
                                            b.capacity
                                        )}`}
                                    >
                                        <span className="opacity-70">{b.bin}</span>
                                        <span className="font-semibold">{b.occupied}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {hover && (
                    <div className="mt-5 border border-amber-500/40 bg-amber-500/5 p-3 font-mono text-xs">
                        <span className="text-amber-400 font-semibold">{hover.code}</span>
                        <span className="text-gray-500 ml-3">
                            CAP: {hover.capacity} · OCCUPIED: {hover.occupied} · UTIL:{" "}
                            {Math.round((hover.occupied / hover.capacity) * 100)}%
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function Legend({ cls, label }) {
    return (
        <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 ${cls}`} />
            <span className="text-gray-500">{label}</span>
        </div>
    );
}
