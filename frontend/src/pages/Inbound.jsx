import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
    ArrowDownToLine,
    Plus,
    X,
    CheckCircle2,
    Printer,
    ClipboardList,
    ScanBarcode,
    Tag,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import PutawayModal from "../components/PutawayModal";

export default function Inbound() {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [skus, setSkus] = useState([]);
    const [locs, setLocs] = useState([]);
    const [open, setOpen] = useState(false);
    const [putawayOrder, setPutawayOrder] = useState(null);

    const canCreate = user?.role === "admin" || user?.role === "manager";

    const load = async () => {
        const [a, b, c] = await Promise.all([
            api.get("/inbound"),
            api.get("/inventory/skus"),
            api.get("/storage/locations"),
        ]);
        setOrders(a.data);
        setSkus(b.data);
        setLocs(c.data);
    };

    useEffect(() => {
        load();
    }, []);

    const receive = async (id) => {
        await api.post(`/inbound/${id}/receive`);
        load();
    };

    const grouped = {
        pending: orders.filter((o) => o.status === "pending"),
        completed: orders.filter((o) => o.status === "completed"),
    };

    const skuMap = Object.fromEntries(skus.map((s) => [s.id, s]));
    const locMap = Object.fromEntries(locs.map((l) => [l.id, l]));

    return (
        <div className="space-y-5">
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                        // INBOUND // GOODS RECEIVING
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight mt-1">
                        Inbound Operations
                    </h1>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setOpen(true)}
                        data-testid="new-inbound-btn"
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-sm font-bold uppercase tracking-wider"
                    >
                        <Plus size={14} /> New Purchase Order
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Column
                    title="Pending"
                    count={grouped.pending.length}
                    color="amber"
                    items={grouped.pending}
                    skuMap={skuMap}
                    locMap={locMap}
                    onReceive={receive}
                    onPutaway={(order) => setPutawayOrder(order)}
                    canReceive
                    userRole={user?.role}
                />
                <Column
                    title="Completed"
                    count={grouped.completed.length}
                    color="emerald"
                    items={grouped.completed}
                    skuMap={skuMap}
                    locMap={locMap}
                    userRole={user?.role}
                />
            </div>

            {open && (
                <NewInboundModal
                    skus={skus}
                    locs={locs}
                    onClose={() => setOpen(false)}
                    onSaved={() => {
                        setOpen(false);
                        load();
                    }}
                />
            )}

            {putawayOrder && (
                <PutawayModal
                    order={putawayOrder}
                    skuMap={skuMap}
                    locMap={locMap}
                    onClose={() => setPutawayOrder(null)}
                    onComplete={() => {
                        setPutawayOrder(null);
                        load();
                    }}
                />
            )}
        </div>
    );
}

function PutawayProgress({ items }) {
    const total = items.length;
    const confirmed = items.filter((it) => it.putaway_confirmed).length;
    const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    return (
        <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
                <div className="font-mono text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    <ScanBarcode size={10} className="text-amber-400" />
                    Putaway Progress
                </div>
                <div className="font-mono text-[10px] text-amber-400">
                    {confirmed}/{total} pallets
                </div>
            </div>
            <div className="h-1 bg-white/5 w-full">
                <div
                    className={`h-full transition-all duration-500 ${
                        pct === 100 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function Column({ title, count, color, items, skuMap, locMap, onReceive, onPutaway, canReceive, userRole }) {
    const cm = {
        amber: "text-amber-400 border-amber-500/30",
        emerald: "text-emerald-400 border-emerald-500/30",
    };
    const isAdmin = userRole === "admin" || userRole === "manager";

    return (
        <div className="bg-[#181a20] border border-white/10">
            <div
                className={`flex items-center justify-between px-4 py-3 border-b border-white/10 ${cm[color]}`}
            >
                <div className="font-mono text-xs uppercase tracking-[0.2em]">{title}</div>
                <div className="font-mono text-sm">{count}</div>
            </div>
            <div className="p-3 space-y-3 max-h-[680px] overflow-y-auto">
                {items.length === 0 && (
                    <div className="text-sm text-gray-500 p-4 text-center">No orders.</div>
                )}
                {items.map((o, idx) => {
                    const hasBarcodes = o.items?.some((it) => it.barcode);
                    const allConfirmed =
                        hasBarcodes && o.items?.every((it) => it.putaway_confirmed);
                    return (
                        <div
                            key={o.id}
                            data-testid={`inbound-card-${idx}`}
                            className="border border-white/10 p-4 hover:border-amber-500/40 transition-colors"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="font-mono text-amber-400 font-semibold">
                                        {o.po_number}
                                    </div>
                                    <div className="text-xs text-gray-500">{o.supplier}</div>
                                </div>
                                <div className="font-mono text-[10px] text-gray-500">
                                    ETA: {o.expected_date}
                                </div>
                            </div>

                            <div className="space-y-1 mb-3">
                                {o.items.map((it, i) => (
                                    <div
                                        key={i}
                                        className="flex justify-between text-xs font-mono border-b border-white/5 py-1"
                                    >
                                        <span
                                            className={`truncate flex items-center gap-1.5 ${
                                                it.putaway_confirmed
                                                    ? "text-emerald-400"
                                                    : "text-gray-300"
                                            }`}
                                        >
                                            {it.putaway_confirmed && (
                                                <CheckCircle2 size={10} />
                                            )}
                                            {skuMap[it.sku_id]?.sku_code || "—"} →{" "}
                                            {locMap[it.location_id]?.code || "—"}
                                        </span>
                                        <span className="text-amber-400 ml-2">{it.qty}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Putaway progress bar (only for orders with barcodes) */}
                            {canReceive && hasBarcodes && (
                                <PutawayProgress items={o.items} />
                            )}

                            {canReceive && (
                                <div className="space-y-2">
                                    {/* Print Labels + Putaway Task row */}
                                    {!allConfirmed && (
                                        <div className="flex gap-2">
                                            <Link
                                                to={`/print/labels/${o.id}`}
                                                target="_blank"
                                                className="flex items-center justify-center gap-1.5 border border-amber-500/30 hover:border-amber-500/60 text-amber-400 hover:text-amber-300 py-2 px-3 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
                                                title="Print pallet barcode labels"
                                            >
                                                <Tag size={12} /> Labels
                                            </Link>
                                            <button
                                                onClick={() => onPutaway && onPutaway(o)}
                                                className="flex-1 flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
                                            >
                                                <ClipboardList size={13} /> Putaway Task
                                            </button>
                                        </div>
                                    )}

                                    {/* Admin/Manager: direct receive bypass */}
                                    {isAdmin && !allConfirmed && (
                                        <button
                                            onClick={() => onReceive(o.id)}
                                            data-testid={`receive-btn-${idx}`}
                                            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white py-2 text-xs font-bold uppercase tracking-wider transition-colors"
                                        >
                                            <CheckCircle2 size={13} /> Receive Without Scan
                                        </button>
                                    )}
                                </div>
                            )}

                            {!canReceive && o.status === "completed" && (
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono">
                                        ✓ Received
                                    </div>
                                    <Link
                                        to={`/print/grn/${o.id}`}
                                        target="_blank"
                                        data-testid={`print-grn-${idx}`}
                                        className="flex items-center gap-1 text-[10px] font-mono text-amber-400 hover:text-amber-300"
                                    >
                                        <Printer size={11} /> GRN
                                    </Link>
                                </div>
                            )}
                            {canReceive && o.status === "completed" && (
                                <Link
                                    to={`/print/grn/${o.id}`}
                                    target="_blank"
                                    data-testid={`print-grn-${idx}`}
                                    className="mt-2 flex items-center justify-center gap-2 border border-white/10 text-gray-400 hover:text-amber-400 hover:border-amber-500/40 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
                                >
                                    <Printer size={12} /> Print GRN
                                </Link>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function NewInboundModal({ skus, locs, onClose, onSaved }) {
    const [form, setForm] = useState({
        po_number: `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        supplier: "",
        expected_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        items: [
            {
                sku_id: "",
                qty: 1,
                location_id: "",
                batch_no: "",
                manufacture_date: "",
                expiry_date: "",
            },
        ],
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
            const items = form.items
                .filter((i) => i.sku_id && i.location_id && i.qty > 0)
                .map((i) => ({ ...i, qty: parseInt(i.qty) }));
            if (!items.length) throw new Error("Add at least one item.");
            await api.post("/inbound", { ...form, items });
            onSaved();
        } catch (er) {
            setErr(er.response?.data?.detail || er.message);
        } finally {
            setBusy(false);
        }
    };

    const addRow = () =>
        setForm({
            ...form,
            items: [
                ...form.items,
                {
                    sku_id: "",
                    qty: 1,
                    location_id: "",
                    batch_no: "",
                    manufacture_date: "",
                    expiry_date: "",
                },
            ],
        });

    const updateRow = (i, k, v) => {
        const items = [...form.items];
        items[i] = { ...items[i], [k]: v };
        setForm({ ...form, items });
    };

    const removeRow = (i) => {
        setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
            onClick={onClose}
        >
            <div
                className="bg-[#181a20] border border-white/10 max-w-2xl w-full my-8"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                            NEW INBOUND
                        </div>
                        <h3 className="text-lg font-bold mt-1">Create Purchase Order</h3>
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                            <ScanBarcode size={11} className="text-amber-400" />
                            Pallet barcodes are auto-generated for operator putaway
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={submit} className="p-5 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                        <Field
                            label="PO Number"
                            value={form.po_number}
                            onChange={(v) => setForm({ ...form, po_number: v })}
                            testid="new-inbound-po"
                        />
                        <Field
                            label="Supplier"
                            value={form.supplier}
                            onChange={(v) => setForm({ ...form, supplier: v })}
                            testid="new-inbound-supplier"
                        />
                        <Field
                            label="Expected Date"
                            type="date"
                            value={form.expected_date}
                            onChange={(v) => setForm({ ...form, expected_date: v })}
                            testid="new-inbound-date"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                                Items
                            </div>
                            <button
                                type="button"
                                onClick={addRow}
                                className="text-xs text-amber-400 hover:text-amber-300"
                            >
                                + Add Row
                            </button>
                        </div>
                        <div className="space-y-3">
                            {form.items.map((it, i) => (
                                <div
                                    key={i}
                                    className="bg-[#0d0e12] border border-white/5 p-2 space-y-1.5"
                                >
                                    <div className="grid grid-cols-12 gap-2">
                                        <select
                                            data-testid={`inbound-item-sku-${i}`}
                                            value={it.sku_id}
                                            onChange={(e) =>
                                                updateRow(i, "sku_id", e.target.value)
                                            }
                                            className="col-span-5 bg-[#090a0c] border border-white/10 px-2 py-2 text-xs font-mono"
                                        >
                                            <option value="">— Select SKU —</option>
                                            {skus.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.sku_code} · {s.name}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            data-testid={`inbound-item-loc-${i}`}
                                            value={it.location_id}
                                            onChange={(e) =>
                                                updateRow(i, "location_id", e.target.value)
                                            }
                                            className="col-span-4 bg-[#090a0c] border border-white/10 px-2 py-2 text-xs font-mono"
                                        >
                                            <option value="">— Bin/Rack —</option>
                                            {Object.entries(
                                                locs.reduce((acc, l) => {
                                                    const z = l.zone || "Other";
                                                    if (!acc[z]) acc[z] = [];
                                                    acc[z].push(l);
                                                    return acc;
                                                }, {})
                                            ).map(([zone, bins]) => (
                                                <optgroup key={zone} label={`── ${zone} ──`}>
                                                    {bins.map((l) => (
                                                        <option key={l.id} value={l.id}>
                                                            {l.code}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                        <input
                                            data-testid={`inbound-item-qty-${i}`}
                                            type="number"
                                            min="1"
                                            value={it.qty}
                                            onChange={(e) => updateRow(i, "qty", e.target.value)}
                                            placeholder="Qty"
                                            className="col-span-2 bg-[#090a0c] border border-white/10 px-2 py-2 text-xs font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeRow(i)}
                                            className="col-span-1 text-gray-500 hover:text-red-400"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <input
                                            data-testid={`inbound-item-batch-${i}`}
                                            value={it.batch_no}
                                            onChange={(e) =>
                                                updateRow(i, "batch_no", e.target.value)
                                            }
                                            placeholder="Batch / Lot No."
                                            className="bg-[#090a0c] border border-white/10 px-2 py-1.5 text-xs font-mono"
                                        />
                                        <input
                                            data-testid={`inbound-item-mfg-${i}`}
                                            type="date"
                                            value={it.manufacture_date}
                                            onChange={(e) =>
                                                updateRow(i, "manufacture_date", e.target.value)
                                            }
                                            placeholder="MFG"
                                            className="bg-[#090a0c] border border-white/10 px-2 py-1.5 text-xs font-mono"
                                        />
                                        <input
                                            data-testid={`inbound-item-exp-${i}`}
                                            type="date"
                                            value={it.expiry_date}
                                            onChange={(e) =>
                                                updateRow(i, "expiry_date", e.target.value)
                                            }
                                            placeholder="EXP"
                                            className="bg-[#090a0c] border border-white/10 px-2 py-1.5 text-xs font-mono"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {err && <div className="text-xs text-red-400 font-mono">{err}</div>}
                    <button
                        type="submit"
                        disabled={busy}
                        data-testid="submit-inbound-btn"
                        className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold tracking-wider uppercase text-sm py-2.5 disabled:opacity-60"
                    >
                        {busy ? "Creating..." : "Create Purchase Order"}
                    </button>
                </form>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type = "text", testid }) {
    return (
        <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                {label}
            </label>
            <input
                data-testid={testid}
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required
                className="w-full mt-1 bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
            />
        </div>
    );
}
