import { useEffect, useState } from "react";
import { api, formatErr } from "../lib/api";
import { ArrowLeftRight, Search, X, CheckCircle2, MapPin } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const BAG_COLOR_HEX = { Green: "#22c55e", White: "#e5e7eb", Yellow: "#eab308" };

export default function Transfer() {
    const { user } = useAuth();
    const canTransfer = user?.role === "admin" || user?.role === "manager";

    const [pallets, setPallets] = useState([]);
    const [locations, setLocations] = useState([]);
    const [history, setHistory] = useState([]);
    const [palletQ, setPalletQ] = useState("");
    const [locQ, setLocQ] = useState("");
    const [selectedPallet, setSelectedPallet] = useState(null);
    const [selectedDest, setSelectedDest] = useState(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const load = async () => {
        const [palletsRes, locsRes, histRes] = await Promise.all([
            api.get("/storage/pallets"),
            api.get("/storage/locations"),
            api.get("/storage/transfers?limit=50"),
        ]);
        setPallets(palletsRes.data);
        setLocations(locsRes.data);
        setHistory(histRes.data);
    };

    useEffect(() => { load(); }, []); // eslint-disable-line

    const filteredPallets = pallets.filter((p) => {
        if (!palletQ) return true;
        const q = palletQ.toLowerCase();
        return (
            p.pallet_code?.toLowerCase().includes(q) ||
            p.sku_code?.toLowerCase().includes(q) ||
            p.sku_name?.toLowerCase().includes(q) ||
            p.location_code?.toLowerCase().includes(q)
        );
    });

    const availDests = locations.filter((l) => {
        if (l.occupied >= l.capacity) return false;
        if (selectedPallet && l.id === selectedPallet.location_id) return false;
        if (!locQ) return true;
        const q = locQ.toLowerCase();
        return (
            l.code.toLowerCase().includes(q) ||
            (l.zone_name || l.zone).toLowerCase().includes(q)
        );
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const transfersToday = history.filter((h) => h.transferred_at?.startsWith(todayStr)).length;

    const doTransfer = async () => {
        if (!selectedPallet || !selectedDest || !canTransfer) return;
        setBusy(true);
        setMsg(null);
        try {
            await api.post("/storage/transfer", {
                stock_id: selectedPallet.id,
                to_location_id: selectedDest.id,
            });
            setMsg({
                type: "ok",
                text: `Pallet ${selectedPallet.pallet_code || selectedPallet.sku_code} moved from ${selectedPallet.location_code} → ${selectedDest.code}`,
            });
            setSelectedPallet(null);
            setSelectedDest(null);
            setPalletQ("");
            setLocQ("");
            await load();
        } catch (e) {
            setMsg({ type: "error", text: formatErr(e.response?.data?.detail) || "Transfer failed" });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                        // LOGISTICS // RELOCATION
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight mt-1">Pallet Transfer</h1>
                </div>
                <div className="text-right">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">Transfers Today</div>
                    <div className="text-2xl font-bold text-amber-400">{transfersToday}</div>
                </div>
            </div>

            {msg && (
                <div
                    className={`border px-4 py-2.5 text-sm flex items-center justify-between ${
                        msg.type === "ok"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-red-500/40 bg-red-500/10 text-red-300"
                    }`}
                >
                    <span>{msg.text}</span>
                    <button onClick={() => setMsg(null)} className="text-gray-400 hover:text-white ml-4">
                        <X size={14} />
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[#181a20] border border-white/10 flex flex-col">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                        <div>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">Step 1</div>
                            <div className="text-sm font-bold tracking-tight mt-0.5">Select Source Pallet</div>
                        </div>
                        {selectedPallet && (
                            <button onClick={() => { setSelectedPallet(null); setSelectedDest(null); }} className="text-gray-500 hover:text-white">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <div className="p-3 border-b border-white/10">
                        <div className="relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                placeholder="Search pallet code, SKU or location…"
                                value={palletQ}
                                onChange={(e) => setPalletQ(e.target.value)}
                                className="w-full bg-[#090a0c] border border-white/10 pl-8 pr-3 py-1.5 text-xs font-mono focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: "340px" }}>
                        {filteredPallets.length === 0 ? (
                            <div className="py-10 text-center text-sm text-gray-500">
                                {pallets.length === 0 ? "No pallets in storage" : "No results"}
                            </div>
                        ) : (
                            filteredPallets.map((p) => {
                                const sel = selectedPallet?.id === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            setSelectedPallet(sel ? null : p);
                                            setSelectedDest(null);
                                        }}
                                        className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                                            sel
                                                ? "bg-amber-500/10 border-l-2 border-l-amber-500"
                                                : "hover:bg-white/5"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-amber-400">
                                                        {p.pallet_code || "—"}
                                                    </span>
                                                    {p.bag_color && (
                                                        <span
                                                            className="inline-block w-2 h-2 rounded-full border border-white/30 shrink-0"
                                                            style={{ backgroundColor: BAG_COLOR_HEX[p.bag_color] || "#6b7280" }}
                                                        />
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-300 truncate mt-0.5">
                                                    {p.sku_code} · {p.sku_name}
                                                </div>
                                                <div className="flex flex-wrap gap-x-2 mt-0.5">
                                                    <span className="font-mono text-[10px] text-gray-500">{p.location_code}</span>
                                                    <span className="font-mono text-[10px] text-gray-600">·</span>
                                                    <span className="font-mono text-[10px] text-gray-500">{p.qty} units</span>
                                                    {p.expiry_date && (
                                                        <>
                                                            <span className="font-mono text-[10px] text-gray-600">·</span>
                                                            <span className="font-mono text-[10px] text-gray-500">exp {p.expiry_date}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {sel && <CheckCircle2 size={14} className="text-amber-400 shrink-0 mt-0.5" />}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className={`bg-[#181a20] border flex flex-col transition-opacity ${selectedPallet ? "border-white/10" : "border-white/5 opacity-50"}`}>
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                        <div>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">Step 2</div>
                            <div className="text-sm font-bold tracking-tight mt-0.5">Select Destination</div>
                        </div>
                        {selectedDest && (
                            <button onClick={() => setSelectedDest(null)} className="text-gray-500 hover:text-white">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <div className="p-3 border-b border-white/10">
                        <div className="relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                placeholder="Search by location code or zone…"
                                value={locQ}
                                onChange={(e) => setLocQ(e.target.value)}
                                disabled={!selectedPallet}
                                className="w-full bg-[#090a0c] border border-white/10 pl-8 pr-3 py-1.5 text-xs font-mono focus:border-amber-500 focus:outline-none disabled:opacity-50"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: "340px" }}>
                        {!selectedPallet ? (
                            <div className="py-10 text-center text-sm text-gray-500">Select a source pallet first</div>
                        ) : availDests.length === 0 ? (
                            <div className="py-10 text-center text-sm text-gray-500">No available locations</div>
                        ) : (
                            availDests.map((l) => {
                                const sel = selectedDest?.id === l.id;
                                const free = l.capacity - l.occupied;
                                return (
                                    <button
                                        key={l.id}
                                        onClick={() => setSelectedDest(sel ? null : l)}
                                        className={`w-full text-left px-4 py-3 border-b border-white/5 flex items-center gap-3 transition-colors ${
                                            sel
                                                ? "bg-amber-500/10 border-l-2 border-l-amber-500"
                                                : "hover:bg-white/5"
                                        }`}
                                    >
                                        <MapPin size={13} className="text-gray-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-mono text-xs text-amber-400">{l.code}</div>
                                            <div className="flex gap-2 mt-0.5">
                                                <span className="text-[10px] text-gray-400">{l.zone_name || l.zone}</span>
                                                <span className="text-[10px] text-gray-600">·</span>
                                                <span className="text-[10px] text-emerald-400">
                                                    {free} slot{free !== 1 ? "s" : ""} free
                                                </span>
                                            </div>
                                        </div>
                                        {sel && <CheckCircle2 size={14} className="text-amber-400 shrink-0" />}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {selectedPallet && selectedDest && (
                <div className="bg-[#111317] border border-amber-500/30 p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="text-center">
                            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-1">From</div>
                            <div className="font-mono text-sm text-white">{selectedPallet.location_code}</div>
                            <div className="font-mono text-[10px] text-amber-400 mt-0.5">
                                {selectedPallet.pallet_code || "—"}
                            </div>
                        </div>
                        <ArrowLeftRight size={18} className="text-amber-400 shrink-0" />
                        <div className="text-center">
                            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-1">To</div>
                            <div className="font-mono text-sm text-white">{selectedDest.code}</div>
                            <div className="font-mono text-[10px] text-gray-400 mt-0.5">
                                {selectedDest.zone_name || selectedDest.zone}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-1">SKU</div>
                            <div className="font-mono text-xs text-gray-300">{selectedPallet.sku_code}</div>
                        </div>
                        <div className="text-center">
                            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-1">Qty</div>
                            <div className="font-mono text-sm text-white">{selectedPallet.qty}</div>
                        </div>
                    </div>
                    <button
                        onClick={doTransfer}
                        disabled={busy || !canTransfer}
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
                    >
                        <ArrowLeftRight size={14} />
                        {busy ? "Transferring…" : "Execute Transfer"}
                    </button>
                </div>
            )}

            {!canTransfer && (
                <div className="border border-white/10 bg-white/5 px-4 py-2 text-xs text-gray-500 font-mono">
                    Operators can view transfer history but cannot execute transfers.
                </div>
            )}

            <div className="bg-[#181a20] border border-white/10">
                <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">Audit Log</div>
                        <div className="text-sm font-bold mt-0.5">Transfer History</div>
                    </div>
                    <div className="font-mono text-xs text-gray-500">{history.length} records</div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-[#111317] text-[10px] uppercase tracking-[0.15em] text-gray-500">
                            <tr>
                                <th className="text-left py-2.5 px-4">Pallet</th>
                                <th className="text-left py-2.5 px-4">SKU</th>
                                <th className="text-left py-2.5 px-4">From</th>
                                <th className="text-left py-2.5 px-4">To</th>
                                <th className="text-right py-2.5 px-4">Qty</th>
                                <th className="text-left py-2.5 px-4">By</th>
                                <th className="text-right py-2.5 px-4">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-10 text-center text-gray-500 text-sm">
                                        No transfers recorded yet
                                    </td>
                                </tr>
                            ) : (
                                history.map((h) => (
                                    <tr key={h.id} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="py-2.5 px-4 font-mono text-xs text-amber-400">
                                            {h.pallet_code || "—"}
                                        </td>
                                        <td className="py-2.5 px-4 font-mono text-xs">
                                            <div>{h.sku_code}</div>
                                            <div className="text-gray-500 text-[10px]">{h.sku_name}</div>
                                        </td>
                                        <td className="py-2.5 px-4 font-mono text-xs text-gray-300">{h.from_code}</td>
                                        <td className="py-2.5 px-4 font-mono text-xs text-emerald-400">{h.to_code}</td>
                                        <td className="py-2.5 px-4 text-right font-mono text-xs">{h.qty}</td>
                                        <td className="py-2.5 px-4 text-xs text-gray-400">
                                            {h.transferred_by_name || "—"}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-mono text-[10px] text-gray-500">
                                            {h.transferred_at
                                                ? new Date(h.transferred_at).toLocaleString()
                                                : "—"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
