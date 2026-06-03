import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Plus, X, ArrowRight, Printer, ScanLine } from "lucide-react";
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

export default function Outbound() {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [skus, setSkus] = useState([]);
    const [open, setOpen] = useState(false);

    const canCreate = user?.role === "admin" || user?.role === "manager";

    const load = async () => {
        const [a, b] = await Promise.all([api.get("/outbound"), api.get("/inventory/skus")]);
        setOrders(a.data);
        setSkus(b.data);
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
                                    <div className="text-xs text-gray-500 mb-2">{o.customer}</div>
                                    <div className="space-y-1 mb-3">
                                        {o.items.slice(0, 3).map((it, i) => (
                                            <div key={i} className="flex justify-between text-[11px] font-mono py-0.5 border-b border-white/5">
                                                <span className="truncate text-gray-400">{skuMap[it.sku_id]?.sku_code || "—"}</span>
                                                <span>{it.qty}</span>
                                            </div>
                                        ))}
                                        {o.items.length > 3 && (
                                            <div className="text-[10px] text-gray-500">+{o.items.length - 3} more</div>
                                        )}
                                    </div>
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
                    onClose={() => setOpen(false)}
                    onSaved={() => {
                        setOpen(false);
                        load();
                    }}
                />
            )}
        </div>
    );
}

function NewOutboundModal({ skus, onClose, onSaved }) {
    const [form, setForm] = useState({
        so_number: `SO-${new Date().getFullYear()}-${Math.floor(2000 + Math.random() * 9000)}`,
        customer: "",
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
            setErr(er.response?.data?.detail || er.message);
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
                        <Field label="Customer" value={form.customer} onChange={(v) => setForm({ ...form, customer: v })} testid="new-outbound-customer" />
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
