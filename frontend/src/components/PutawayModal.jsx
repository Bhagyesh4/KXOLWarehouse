import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, formatErr } from "../lib/api";
import Scanner from "./Scanner";
import {
    X,
    CheckCircle2,
    Camera,
    MapPin,
    Package,
    ScanBarcode,
    ClipboardCheck,
    Printer,
} from "lucide-react";

export default function PutawayModal({ order, skuMap, locMap, onClose, onComplete }) {
    const [items, setItems] = useState(order.items.map((it) => ({ ...it })));
    const [scanning, setScanning] = useState(false);
    const [manualBarcode, setManualBarcode] = useState("");
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);

    const confirmedCount = items.filter((it) => it.putaway_confirmed).length;
    const allConfirmed = confirmedCount === items.length;

    const handleScan = useCallback(
        async (barcode) => {
            if (busy) return;
            setBusy(true);
            setMessage(null);
            try {
                const res = await api.post(`/inbound/${order.id}/putaway-scan`, {
                    barcode: barcode.trim(),
                });
                setItems((prev) =>
                    prev.map((it, i) =>
                        i === res.data.item_index
                            ? { ...it, putaway_confirmed: true }
                            : it
                    )
                );
                setMessage({
                    type: "success",
                    text: `✓ Pallet confirmed in ${locMap[items[res.data.item_index]?.location_id]?.code || "rack"}`,
                });
                if (res.data.all_confirmed) {
                    setTimeout(() => onComplete && onComplete(), 1200);
                }
            } catch (err) {
                setMessage({
                    type: "error",
                    text: formatErr(err.response?.data?.detail) || "Scan failed — check barcode and try again",
                });
            } finally {
                setBusy(false);
            }
        },
        [order.id, busy, onComplete, locMap, items]
    );

    const handleManualSubmit = (e) => {
        e.preventDefault();
        if (manualBarcode.trim()) {
            handleScan(manualBarcode.trim());
            setManualBarcode("");
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-[#181a20] border border-amber-500/30 max-w-2xl w-full max-h-[92vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                            // PUTAWAY TASK
                        </div>
                        <h3 className="text-lg font-bold mt-0.5">{order.po_number}</h3>
                        <div className="text-xs text-gray-500">{order.supplier}</div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="font-mono text-3xl font-bold leading-none">
                                <span className="text-amber-400">{confirmedCount}</span>
                                <span className="text-gray-600 text-xl">/{items.length}</span>
                            </div>
                            <div className="font-mono text-[10px] text-gray-500 uppercase mt-0.5">
                                Pallets Placed
                            </div>
                        </div>
                        <Link
                            to={`/print/labels/${order.id}`}
                            target="_blank"
                            title="Print pallet labels"
                            className="flex flex-col items-center gap-0.5 text-amber-400 hover:text-amber-300 px-2 py-1 border border-amber-500/30 hover:border-amber-500/60 transition-colors"
                        >
                            <Printer size={16} />
                            <span className="font-mono text-[9px] uppercase tracking-wider">Labels</span>
                        </Link>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-white/5 shrink-0">
                    <div
                        className="h-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${(confirmedCount / items.length) * 100}%` }}
                    />
                </div>

                {/* Scan controls */}
                <div className="px-5 py-4 border-b border-white/10 space-y-3 shrink-0">
                    {message && (
                        <div
                            className={`px-3 py-2.5 text-sm font-mono border ${
                                message.type === "success"
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                    : "border-red-500/40 bg-red-500/10 text-red-400"
                            }`}
                        >
                            {message.text}
                        </div>
                    )}
                    <button
                        onClick={() => setScanning(true)}
                        disabled={allConfirmed}
                        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-black px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors"
                    >
                        <Camera size={15} /> Scan Barcode
                    </button>
                    <form onSubmit={handleManualSubmit} className="flex gap-2">
                        <input
                            value={manualBarcode}
                            onChange={(e) => setManualBarcode(e.target.value)}
                            placeholder="Enter barcode manually (e.g. PLT-PO-2025-0001-P01)"
                            className="flex-1 bg-[#0d0e12] border border-white/10 px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                        />
                        <button
                            type="submit"
                            disabled={busy || !manualBarcode.trim() || allConfirmed}
                            className="bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-40 transition-colors"
                        >
                            Confirm
                        </button>
                    </form>
                </div>

                {/* Items list */}
                <div className="overflow-y-auto flex-1 p-5 space-y-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
                        Pallet List
                    </div>
                    {items.map((it, i) => (
                        <div
                            key={i}
                            className={`border p-4 transition-all ${
                                it.putaway_confirmed
                                    ? "border-emerald-500/40 bg-emerald-500/5"
                                    : "border-white/10 bg-[#0d0e12]"
                            }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        {it.putaway_confirmed ? (
                                            <CheckCircle2
                                                size={16}
                                                className="text-emerald-400 shrink-0"
                                            />
                                        ) : (
                                            <div className="w-4 h-4 border-2 border-gray-600 rounded-full shrink-0" />
                                        )}
                                        <span className="font-mono text-amber-400 text-sm font-semibold">
                                            {skuMap[it.sku_id]?.sku_code || it.sku_id}
                                        </span>
                                        <span className="text-xs text-gray-500 truncate">
                                            {skuMap[it.sku_id]?.name}
                                        </span>
                                    </div>
                                    <div className="ml-6 grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                                        <div className="flex items-center gap-1.5 text-gray-400">
                                            <MapPin size={10} className="text-amber-400 shrink-0" />
                                            <span className="text-gray-500">Target Rack:</span>{" "}
                                            <span className="text-white font-semibold">
                                                {locMap[it.location_id]?.code || "—"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-gray-400">
                                            <Package size={10} className="shrink-0" />
                                            <span className="text-gray-500">Qty:</span>{" "}
                                            <span className="text-white">{it.qty}</span>
                                        </div>
                                        {it.batch_no && (
                                            <div className="text-gray-500">
                                                Batch:{" "}
                                                <span className="text-gray-300">{it.batch_no}</span>
                                            </div>
                                        )}
                                        {it.expiry_date && (
                                            <div className="text-gray-500">
                                                Exp:{" "}
                                                <span className="text-gray-300">{it.expiry_date}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Barcode label */}
                                <div className="shrink-0 text-right">
                                    <div className="font-mono text-[10px] text-gray-500 uppercase mb-1">
                                        Pallet Barcode
                                    </div>
                                    <div className="font-mono text-xs bg-black/40 px-2.5 py-1.5 border border-white/10 tracking-wider text-white inline-flex items-center gap-1.5">
                                        <ScanBarcode size={11} className="text-amber-400" />
                                        {it.barcode || "—"}
                                    </div>
                                    {it.putaway_confirmed && (
                                        <div className="font-mono text-[10px] text-emerald-400 mt-1 uppercase tracking-widest">
                                            ✓ Placed
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer — all confirmed */}
                {allConfirmed && (
                    <div className="px-5 py-4 border-t border-white/10 shrink-0">
                        <div className="flex items-center justify-center gap-2 text-emerald-400 font-mono text-sm mb-3">
                            <ClipboardCheck size={16} />
                            All pallets placed — inventory updated automatically
                        </div>
                        <button
                            onClick={() => { onComplete && onComplete(); onClose(); }}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold tracking-wider uppercase text-sm py-3 transition-colors"
                        >
                            Done — View Updated Orders
                        </button>
                    </div>
                )}
            </div>

            {scanning && (
                <Scanner
                    onScan={(code) => {
                        handleScan(code);
                        setScanning(false);
                    }}
                    onClose={() => setScanning(false)}
                />
            )}
        </div>
    );
}
