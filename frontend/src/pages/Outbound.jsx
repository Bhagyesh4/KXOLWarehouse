import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatErr } from "../lib/api";
import { Plus, X, ArrowRight, Printer, ScanLine, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Scanner from "../components/Scanner";

const FLOW = ["pending", "picking", "packing", "shipped"];
const FLOW_LABEL = {
    pending: "Pending",
    picking: "Picking",
    packing: "Packing",
    shipped: "Shipped",
};
const FLOW_COLOR = {
    pending: "border-gray-500/30 text-gray-300",
    picking: "border-blue-500/30 text-blue-400",
    packing: "border-amber-500/30 text-amber-400",
    shipped: "border-emerald-500/30 text-emerald-400",
};

const BAG_COLOR_HEX = { Green: "#22c55e", White: "#e5e7eb", Yellow: "#eab308" };

function BagMeta({ sku }) {
    if (!sku || (!sku.bag_color && sku.bags_per_pallet == null)) return null;
    return (
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 font-mono">
            {sku.bag_color && (
                <span className="flex items-center gap-1">
                    <span
                        className="inline-block w-2 h-2 rounded-full border border-white/20"
                        style={{ backgroundColor: BAG_COLOR_HEX[sku.bag_color] || "#6b7280" }}
                    />
                    {sku.bag_color}
                </span>
            )}
            {sku.bags_per_pallet != null && <span>{sku.bags_per_pallet} bags/plt</span>}
        </div>
    );
}

export default function Outbound() {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [skus, setSkus] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [open, setOpen] = useState(false);
    const [pickOrder, setPickOrder] = useState(null);

    const canCreate = user?.role === "admin" || user?.role === "manager";

    const load = async () => {
        const [a, b, c] = await Promise.all([api.get("/outbound"), api.get("/inventory/skus"), api.get("/customers")]);
        setOrders(a.data);
        setSkus(b.data);
        setCustomers(c.data);
        return a.data;
    };

    useEffect(() => {
        load();
    }, []);

    const advance = async (id) => {
        await api.post(`/outbound/${id}/advance`);
        load();
    };

    const skuMap = Object.fromEntries(skus.map((s) => [s.id, s]));
    const grouped = FLOW.reduce((acc, st) => {
        acc[st] = orders.filter((o) => o.status === st);
        return acc;
    }, {});

    return (
        <div className="space-y-5">
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                        // OUTBOUND // FULFILLMENT
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight mt-1">
                        Outbound Operations
                    </h1>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setOpen(true)}
                        data-testid="new-outbound-btn"
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-sm font-bold uppercase tracking-wider"
                    >
                        <Plus size={14} /> New Sales Order
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {FLOW.map((st) => (
                    <div key={st} className="bg-[#181a20] border border-white/10">
                        <div className={`flex items-center justify-between px-4 py-3 border-b border-white/10 ${FLOW_COLOR[st]}`}>
                            <div className="font-mono text-xs uppercase tracking-[0.2em]">
                                {FLOW_LABEL[st]}
                            </div>
                            <div className="font-mono text-sm">{grouped[st].length}</div>
                        </div>
                        <div className="p-3 space-y-3 max-h-[700px] overflow-y-auto">
                            {grouped[st].length === 0 && (
                                <div className="text-xs text-gray-500 p-3 text-center">Empty</div>
                            )}
                            {grouped[st].map((o, idx) => (
                                <div key={o.id} data-testid={`outbound-card-${st}-${idx}`} className="border border-white/10 p-3 hover:border-amber-500/40 transition-colors">
                                    <div className="font-mono text-amber-400 font-semibold text-sm">{o.so_number}</div>
                                    <div className="text-xs text-gray-500 mb-2">{o.customer_name || o.customer || "—"}</div>
                                    <div className="space-y-1 mb-3">
                                        {o.items.slice(0, 3).map((it, i) => {
                                            const picked = it.picked_qty || 0;
                                            const done = picked >= it.qty;
                                            const showPick = st === "pending" || st === "picking";
                                            return (
                                                <div key={i} className="py-0.5 border-b border-white/5">
                                                    <div className="flex justify-between text-[11px] font-mono">
                                                        <span className="truncate text-gray-400">{skuMap[it.sku_id]?.sku_code || "—"}</span>
                                                        <span className="flex items-center gap-1">
                                                            {showPick && (
                                                                <span className={done ? "text-emerald-400" : picked > 0 ? "text-amber-400" : "text-gray-600"}>
                                                                    {picked}/
                                                                </span>
                                                            )}
                                                            <span>{it.qty}</span>
                                                            {showPick && done && <Check size={11} className="text-emerald-400" />}
                                                        </span>
                                                    </div>
                                                    <BagMeta sku={skuMap[it.sku_id]} />
                                                </div>
                                            );
                                        })}
                                        {o.items.length > 3 && (
                                            <div className="text-[10px] text-gray-500">+{o.items.length - 3} more</div>
                                        )}
                                    </div>
                                    {(st === "pending" || st === "picking") && (
                                        <button
                                            onClick={() => setPickOrder(o)}
                                            data-testid={`pick-scan-${st}-${idx}`}
                                            className="w-full flex items-center justify-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/40 text-blue-400 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors mb-1.5"
                                        >
                                            <ScanLine size={12} /> Scan to Pick
                                        </button>
                                    )}
                                    {st !== "shipped" && (
                                        <button
                                            onClick={() => advance(o.id)}
                                            data-testid={`advance-${st}-${idx}`}
                                            className="w-full flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
                                        >
                                            Advance <ArrowRight size={12} />
                                        </button>
                                    )}
                                    {(st === "picking" || st === "packing" || st === "shipped" || st === "pending") && (
                                        <Link
                                            to={`/print/pick/${o.id}`}
                                            target="_blank"
                                            data-testid={`print-pick-${st}-${idx}`}
                                            className="mt-1.5 w-full flex items-center justify-center gap-1 border border-white/10 text-gray-400 hover:text-amber-400 hover:border-amber-500/40 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors"
                                        >
                                            <Printer size={11} /> Pick List
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {open && (
                <NewOutboundModal
                    skus={skus}
                    customers={customers}
                    onClose={() => setOpen(false)}
                    onSaved={() => {
                        setOpen(false);
                        load();
                    }}
                />
            )}

            {pickOrder && (
                <PickScanModal
                    order={pickOrder}
                    skus={skus}
                    onClose={() => setPickOrder(null)}
                    onPicked={async () => {
                        const fresh = await load();
                        const updated = fresh.find((o) => o.id === pickOrder.id);
                        if (updated) setPickOrder(updated);
                    }}
                />
            )}
        </div>
    );
}

function NewOutboundModal({ skus, customers, onClose, onSaved }) {
    const [form, setForm] = useState({
        so_number: `SO-${new Date().getFullYear()}-${Math.floor(2000 + Math.random() * 9000)}`,
        customer: "",
        customer_id: "",
        items: [{ sku_id: "", qty: 1 }],
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [scanOpen, setScanOpen] = useState(false);
    const [scanMsg, setScanMsg] = useState("");

    const handleScan = (code) => {
        setScanOpen(false);
        const match = skus.find((s) => s.sku_code === code);
        if (!match) {
            setScanMsg("");
            setErr(`No SKU found for barcode: ${code}`);
            return;
        }
        setErr("");
        setScanMsg(`Added ${match.sku_code} · ${match.name}`);
        setForm((prev) => {
            const items = [...prev.items];
            const existingIdx = items.findIndex((it) => it.sku_id === match.id);
            if (existingIdx >= 0) {
                items[existingIdx] = {
                    ...items[existingIdx],
                    qty: (parseInt(items[existingIdx].qty) || 0) + 1,
                };
                return { ...prev, items };
            }
            const emptyIdx = items.findIndex((it) => !it.sku_id);
            if (emptyIdx >= 0) {
                items[emptyIdx] = { ...items[emptyIdx], sku_id: match.id, qty: items[emptyIdx].qty || 1 };
                return { ...prev, items };
            }
            return { ...prev, items: [...items, { sku_id: match.id, qty: 1 }] };
        });
    };

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
            const items = form.items.filter((i) => i.sku_id && i.qty > 0).map((i) => ({ ...i, qty: parseInt(i.qty) }));
            if (!items.length) throw new Error("Add at least one item.");
            await api.post("/outbound", { ...form, items });
            onSaved();
        } catch (er) {
            setErr(formatErr(er.response?.data?.detail) || er.message);
        } finally {
            setBusy(false);
        }
    };

    const addRow = () =>
        setForm({ ...form, items: [...form.items, { sku_id: "", qty: 1 }] });
    const updateRow = (i, k, v) => {
        const items = [...form.items];
        items[i] = { ...items[i], [k]: v };
        setForm({ ...form, items });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-[#181a20] border border-white/10 max-w-2xl w-full my-8" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                            NEW OUTBOUND
                        </div>
                        <h3 className="text-lg font-bold mt-1">Create Sales Order</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={submit} className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="SO Number" value={form.so_number} onChange={(v) => setForm({ ...form, so_number: v })} testid="new-outbound-so" />
                        <div>
                            <label className="block text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold mb-1.5">
                                Customer
                            </label>
                            <select
                                data-testid="new-outbound-customer"
                                value={form.customer_id}
                                onChange={(e) => {
                                    const c = customers.find((x) => x.id === e.target.value);
                                    setForm({ ...form, customer_id: e.target.value, customer: c ? c.name : "" });
                                }}
                                className="w-full bg-[#090a0c] border border-white/10 px-2 py-2 text-sm font-mono"
                            >
                                <option value="">— Select Customer —</option>
                                {customers.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="border border-cyan-500/30 bg-cyan-500/5 p-3 flex items-start gap-2">
                        <Printer size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                        <div className="text-[11px] text-gray-300 leading-relaxed">
                            <span className="text-cyan-400 font-mono">FEFO ENABLED:</span> The pick-list will
                            automatically suggest pallets ordered by soonest expiry first. Print it after creation
                            to give floor staff specific bin coordinates.
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                                Items
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setScanOpen(true)}
                                    data-testid="outbound-scan-btn"
                                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                                >
                                    <ScanLine size={13} /> Scan
                                </button>
                                <button type="button" onClick={addRow} className="text-xs text-amber-400 hover:text-amber-300">
                                    + Add Row
                                </button>
                            </div>
                        </div>
                        {scanMsg && (
                            <div className="mb-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-mono text-emerald-300">
                                ✓ {scanMsg}
                            </div>
                        )}
                        <div className="space-y-2">
                            {form.items.map((it, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2">
                                    <select
                                        data-testid={`outbound-item-sku-${i}`}
                                        value={it.sku_id}
                                        onChange={(e) => updateRow(i, "sku_id", e.target.value)}
                                        className="col-span-9 bg-[#090a0c] border border-white/10 px-2 py-2 text-xs font-mono"
                                    >
                                        <option value="">— Select SKU —</option>
                                        {skus.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.sku_code} · {s.name} (stock: {s.total_stock})
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        data-testid={`outbound-item-qty-${i}`}
                                        type="number"
                                        min="1"
                                        value={it.qty}
                                        onChange={(e) => updateRow(i, "qty", e.target.value)}
                                        className="col-span-3 bg-[#090a0c] border border-white/10 px-2 py-2 text-xs font-mono"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {err && <div className="text-xs text-red-400 font-mono">{err}</div>}
                    <button
                        type="submit"
                        disabled={busy}
                        data-testid="submit-outbound-btn"
                        className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold tracking-wider uppercase text-sm py-2.5 disabled:opacity-60"
                    >
                        {busy ? "Creating..." : "Create Sales Order"}
                    </button>
                </form>
            </div>
            {scanOpen && (
                <div onClick={(e) => e.stopPropagation()}>
                    <Scanner onScan={handleScan} onClose={() => setScanOpen(false)} />
                </div>
            )}
        </div>
    );
}

function PickScanModal({ order, skus, onClose, onPicked }) {
    const [scanOpen, setScanOpen] = useState(false);
    const [manual, setManual] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");
    const skuMap = Object.fromEntries(skus.map((s) => [s.id, s]));

    const submitBarcode = async (code) => {
        const barcode = (code || "").trim();
        if (!barcode || busy) return;
        setBusy(true);
        setErr("");
        setMsg("");
        try {
            const { data } = await api.post(`/outbound/${order.id}/pick-scan`, { barcode });
            if (data.fully_picked) {
                setMsg(`✓ ${data.sku_code} picked (${data.picked_qty}/${data.ordered_qty}). Order fully picked — moved to Packing.`);
            } else {
                setMsg(`✓ ${data.sku_code} picked (${data.picked_qty}/${data.ordered_qty}).`);
            }
            setManual("");
            await onPicked();
        } catch (er) {
            setErr(formatErr(er.response?.data?.detail) || er.message);
        } finally {
            setBusy(false);
        }
    };

    const handleScan = (code) => {
        setScanOpen(false);
        submitBarcode(code);
    };

    const fullyPicked = order.status === "packing";

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-[#181a20] border border-white/10 max-w-lg w-full my-8" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-blue-400">
                            SCAN TO PICK
                        </div>
                        <h3 className="text-lg font-bold mt-1">
                            {order.so_number} <span className="text-gray-500 text-sm font-normal">· {order.customer}</span>
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="border border-blue-500/30 bg-blue-500/5 p-3 text-[11px] text-gray-300 leading-relaxed">
                        Scan or enter the barcode of an <span className="text-blue-400 font-mono">inbounded pallet</span> to
                        pick it against this order. Once every line is fully picked, the order automatically moves to
                        <span className="text-amber-400 font-mono"> Packing</span>.
                    </div>

                    <div className="space-y-1.5">
                        {order.items.map((it, i) => {
                            const picked = it.picked_qty || 0;
                            const done = picked >= it.qty;
                            return (
                                <div key={i} className="flex items-center justify-between border border-white/10 px-3 py-2">
                                    <span className="font-mono text-xs text-gray-300">{skuMap[it.sku_id]?.sku_code || it.sku_id}</span>
                                    <span className="flex items-center gap-1.5 font-mono text-xs">
                                        <span className={done ? "text-emerald-400" : picked > 0 ? "text-amber-400" : "text-gray-500"}>
                                            {picked}/{it.qty}
                                        </span>
                                        {done && <Check size={13} className="text-emerald-400" />}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {msg && (
                        <div className="border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-mono text-emerald-300">
                            {msg}
                        </div>
                    )}
                    {err && (
                        <div className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-mono text-red-400">
                            {err}
                        </div>
                    )}

                    {!fullyPicked && (
                        <>
                            <button
                                type="button"
                                onClick={() => setScanOpen(true)}
                                data-testid="pick-open-camera-btn"
                                className="w-full flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/40 text-blue-400 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
                            >
                                <ScanLine size={14} /> Open Camera Scanner
                            </button>

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    submitBarcode(manual);
                                }}
                                className="flex gap-2"
                            >
                                <input
                                    value={manual}
                                    onChange={(e) => setManual(e.target.value)}
                                    placeholder="Enter pallet barcode (e.g. PLT-PO-2026-1234-P01)"
                                    data-testid="pick-manual-input"
                                    className="flex-1 bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={busy || !manual.trim()}
                                    data-testid="pick-manual-submit"
                                    className="bg-blue-500 hover:bg-blue-600 text-black font-bold uppercase text-xs px-4 disabled:opacity-50"
                                >
                                    {busy ? "..." : "Pick"}
                                </button>
                            </form>
                        </>
                    )}

                    {fullyPicked && (
                        <div className="border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-center text-amber-400 font-mono text-xs uppercase tracking-wider">
                            Fully picked — now in Packing
                        </div>
                    )}
                </div>
            </div>
            {scanOpen && (
                <div onClick={(e) => e.stopPropagation()}>
                    <Scanner onScan={handleScan} onClose={() => setScanOpen(false)} />
                </div>
            )}
        </div>
    );
}

function Field({ label, value, onChange, testid }) {
    return (
        <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                {label}
            </label>
            <input
                data-testid={testid}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required
                className="w-full mt-1 bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
            />
        </div>
    );
}
