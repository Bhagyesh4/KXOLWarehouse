import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatErr } from "../lib/api";
import {
    ArrowDownToLine,
    Plus,
    X,
    CheckCircle2,
    Printer,
    ClipboardList,
    ScanBarcode,
    Tag,
    Warehouse,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import PutawayModal from "../components/PutawayModal";

const BAG_COLOR_HEX = { Green: "#22c55e", White: "#e5e7eb", Yellow: "#eab308" };

function BagMeta({ sku, color }) {
    const bagColor = color || sku?.bag_color;
    const bagsPerPallet = sku?.bags_per_pallet;
    if (!bagColor && bagsPerPallet == null) return null;
    return (
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 font-mono">
            {bagColor && (
                <span className="flex items-center gap-1">
                    <span
                        className="inline-block w-2 h-2 rounded-full border border-white/20"
                        style={{ backgroundColor: BAG_COLOR_HEX[bagColor] || "#6b7280" }}
                    />
                    {bagColor}
                </span>
            )}
            {bagsPerPallet != null && <span>{bagsPerPallet} bags/plt</span>}
        </div>
    );
}

export default function Inbound() {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [skus, setSkus] = useState([]);
    const [locs, setLocs] = useState([]);
    const [zones, setZones] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [open, setOpen] = useState(false);
    const [putawayOrder, setPutawayOrder] = useState(null);

    const canCreate = user?.role === "admin" || user?.role === "manager";

    const load = async () => {
        const [a, b, c, d, e] = await Promise.all([
            api.get("/inbound"),
            api.get("/inventory/skus"),
            api.get("/storage/locations"),
            api.get("/storage/zones"),
            api.get("/vendors"),
        ]);
        setOrders(a.data);
        setSkus(b.data);
        setLocs(c.data);
        setZones(d.data);
        setVendors(e.data);
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
                <NewInboundFlow
                    zones={zones}
                    skus={skus}
                    locs={locs}
                    vendors={vendors}
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
                                    <div className="text-xs text-gray-500">
                                        {o.vendor_name || o.supplier || "—"}
                                    </div>
                                </div>
                                <div className="font-mono text-[10px] text-gray-500">
                                    ETA: {o.expected_date}
                                </div>
                            </div>

                            <div className="space-y-1 mb-3">
                                {o.items.map((it, i) => (
                                    <div
                                        key={i}
                                        className="border-b border-white/5 py-1"
                                    >
                                        <div className="flex justify-between text-xs font-mono">
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
                                        <BagMeta sku={skuMap[it.sku_id]} color={it.bag_color} />
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

/* ─── New Inbound Flow: Warehouse → Location → Purchase Order ─── */
function NewInboundFlow({ zones, skus, locs, vendors, onClose, onSaved }) {
    const [step, setStep] = useState("warehouse");
    const [zone, setZone] = useState(null);
    const [location, setLocation] = useState(null);

    const selectZone = (z) => {
        if (zone?.zone !== z.zone) setLocation(null);
        setZone(z);
    };

    if (step === "warehouse")
        return (
            <WarehouseStep
                zones={zones}
                selected={zone}
                onSelect={selectZone}
                onClose={onClose}
                onNext={() => zone && setStep("location")}
            />
        );

    if (step === "location")
        return (
            <LocationStep
                zone={zone}
                locs={locs}
                selected={location}
                onSelect={setLocation}
                onClose={onClose}
                onBack={() => setStep("warehouse")}
                onConfirm={() => location && setStep("form")}
            />
        );

    return (
        <NewInboundModal
            skus={skus}
            vendors={vendors}
            zone={zone}
            location={location}
            onBack={() => setStep("location")}
            onClose={onClose}
            onSaved={onSaved}
        />
    );
}

function FlowShell({ maxW = "max-w-2xl", onClose, children }) {
    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
            onClick={onClose}
        >
            <div
                className={`bg-[#181a20] border border-white/10 ${maxW} w-full my-8`}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

function FlowHeader({ step, title, subtitle, onClose }) {
    return (
        <div className="flex items-center justify-between p-5 border-b border-white/10">
            <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                    NEW INBOUND // STEP {step} OF 3
                </div>
                <h3 className="text-lg font-bold mt-1">{title}</h3>
                {subtitle && (
                    <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
                )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
                <X size={18} />
            </button>
        </div>
    );
}

/* Step 1 — pick the destination warehouse (zone). */
function WarehouseStep({ zones, selected, onSelect, onClose, onNext }) {
    const active = (zones || []).filter((z) => !z.placeholder);
    return (
        <FlowShell onClose={onClose}>
            <FlowHeader
                step="1"
                title="Select Warehouse"
                subtitle="Choose the destination warehouse for this purchase order."
                onClose={onClose}
            />
            <div className="p-5">
                {active.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-8 font-mono">
                        No active warehouses available. Configure a zone in Storage first.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {active.map((z) => {
                            const isSel = selected?.zone === z.zone;
                            const pct = z.capacity
                                ? Math.round((z.occupied / z.capacity) * 100)
                                : 0;
                            return (
                                <button
                                    key={z.zone}
                                    type="button"
                                    onClick={() => onSelect(z)}
                                    data-testid={`wh-zone-${z.zone}`}
                                    className={`text-left p-4 border transition-colors ${
                                        isSel
                                            ? "border-amber-500 bg-amber-500/5"
                                            : "border-white/10 bg-[#0d0e12] hover:border-amber-500/40"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase flex items-center gap-1.5">
                                                <Warehouse size={11} className="text-amber-400" />
                                                {z.zone}
                                            </div>
                                            <div className="text-sm text-white mt-0.5 truncate">
                                                {z.name}
                                            </div>
                                        </div>
                                        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                                            Active
                                        </span>
                                    </div>
                                    <div className="mt-3 flex items-center gap-3 font-mono text-[10px] text-gray-500">
                                        <span>{z.bins} slots</span>
                                        <span>{pct}% full</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="flex gap-2 p-5 border-t border-white/10">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!selected}
                    data-testid="wh-continue-btn"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Continue →
                </button>
            </div>
        </FlowShell>
    );
}

/* Step 2 — pick the exact location from the interactive rack layout. */
function LocationStep({ zone, locs, selected, onSelect, onClose, onBack, onConfirm }) {
    const zoneLocs = (locs || []).filter((l) => l.zone === zone.zone);

    // Group locations into rows → lanes for an interactive rack layout.
    const byRow = {};
    zoneLocs.forEach((l) => {
        const row = l.row_label || "?";
        const lane = l.lane_number ?? 0;
        byRow[row] = byRow[row] || {};
        byRow[row][lane] = byRow[row][lane] || [];
        byRow[row][lane].push(l);
    });
    const rows = Object.keys(byRow).sort();

    return (
        <FlowShell maxW="max-w-4xl" onClose={onClose}>
            <FlowHeader
                step="2"
                title={`Select Location — ${zone.name}`}
                subtitle="Click a bin on the rack layout to choose the exact storage location."
                onClose={onClose}
            />
            <div className="p-5 max-h-[55vh] overflow-y-auto space-y-6">
                {zoneLocs.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-8 font-mono">
                        No locations configured for this warehouse.
                    </div>
                ) : (
                    rows.map((row) => {
                        const lanes = Object.keys(byRow[row])
                            .map(Number)
                            .sort((a, b) => a - b);
                        return (
                            <div key={row}>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 bg-amber-500 text-black flex items-center justify-center font-bold text-sm">
                                        {row}
                                    </div>
                                    <div className="font-mono text-xs font-semibold">ROW {row}</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {lanes.map((lane) => {
                                        const bins = byRow[row][lane];
                                        const levels = [...new Set(bins.map((b) => b.level || 1))].sort((a, b) => b - a);
                                        const positions = [...new Set(bins.map((b) => b.position || 1))].sort((a, b) => a - b);
                                        const lookup = {};
                                        bins.forEach((b) => {
                                            lookup[`${b.level || 1}-${b.position || 1}`] = b;
                                        });
                                        return (
                                            <div key={lane} className="border border-white/10 bg-[#0d0e12] p-3">
                                                <div className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                                                    LANE L{String(lane).padStart(2, "0")}
                                                </div>
                                                <div className="space-y-1">
                                                    {levels.map((lv) => (
                                                        <div key={lv} className="flex items-center gap-1">
                                                            <span className="w-7 shrink-0 font-mono text-[9px] text-gray-600">
                                                                LV{lv}
                                                            </span>
                                                            <div className="flex gap-1 flex-wrap">
                                                                {positions.map((pos) => {
                                                                    const loc = lookup[`${lv}-${pos}`];
                                                                    if (!loc)
                                                                        return <span key={pos} className="w-9 h-7" />;
                                                                    const occupied = (loc.occupied || 0) > 0;
                                                                    const isSel = selected?.id === loc.id;
                                                                    return (
                                                                        <button
                                                                            key={pos}
                                                                            type="button"
                                                                            title={loc.code}
                                                                            onClick={() => onSelect(loc)}
                                                                            data-testid={`loc-cell-${loc.code}`}
                                                                            className={`w-9 h-7 flex items-center justify-center font-mono text-[10px] border transition-colors ${
                                                                                isSel
                                                                                    ? "border-amber-500 bg-amber-500/30 text-amber-200 ring-1 ring-amber-500"
                                                                                    : occupied
                                                                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:border-amber-500/50"
                                                                                      : "border-white/10 bg-white/5 text-gray-500 hover:border-amber-500/50 hover:text-amber-400"
                                                                            }`}
                                                                        >
                                                                            P{String(pos).padStart(2, "0")}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}

                {zoneLocs.length > 0 && (
                    <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest pt-1">
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-white/5 border border-white/10" />
                            <span className="text-gray-500">Empty</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-emerald-500/10 border border-emerald-500/40" />
                            <span className="text-gray-500">Occupied</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 bg-amber-500/30 border border-amber-500" />
                            <span className="text-amber-400">Selected</span>
                        </span>
                    </div>
                )}
            </div>

            {selected && (
                <div className="px-5 py-3 border-t border-white/10 bg-amber-500/5">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400 mb-1">
                        // SELECTED LOCATION
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
                        <span className="text-amber-400 font-bold" data-testid="selected-loc-code">
                            {selected.code}
                        </span>
                        <span className="text-gray-500">Row {selected.row_label || "—"}</span>
                        <span className="text-gray-500">
                            Lane L{String(selected.lane_number ?? 0).padStart(2, "0")}
                        </span>
                        <span className="text-gray-500">Level {selected.level ?? "—"}</span>
                        <span className="text-gray-500">Pos {selected.position ?? "—"}</span>
                        <span className={(selected.occupied || 0) > 0 ? "text-emerald-400" : "text-gray-500"}>
                            {selected.occupied || 0}/{selected.capacity ?? "—"} pallets
                        </span>
                    </div>
                </div>
            )}

            <div className="flex gap-2 p-5 border-t border-white/10">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white"
                >
                    ← Back
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={!selected}
                    data-testid="loc-confirm-btn"
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm py-2.5 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Confirm Location →
                </button>
            </div>
        </FlowShell>
    );
}

function NewInboundModal({ skus, vendors, zone, location, onBack, onClose, onSaved }) {
    const [form, setForm] = useState({
        po_number: `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        supplier: "",
        vendor_id: "",
        expected_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        items: [
            {
                sku_id: "",
                qty: 1,
                bag_color: "",
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
            if (!location?.id) throw new Error("No location selected.");
            const items = form.items
                .filter((i) => i.sku_id && i.qty > 0)
                .map((i) => ({ ...i, qty: parseInt(i.qty), location_id: location.id }));
            if (!items.length) throw new Error("Add at least one item.");
            await api.post("/inbound", { ...form, items });
            onSaved();
        } catch (er) {
            setErr(formatErr(er.response?.data?.detail) || er.message);
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
                    bag_color: "",
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

    const selectSku = (i, skuId) => {
        const sku = skus.find((s) => s.id === skuId);
        const items = [...form.items];
        const row = { ...items[i], sku_id: skuId };
        if (!row.bag_color && sku?.bag_color) row.bag_color = sku.bag_color;
        items[i] = row;
        setForm({ ...form, items });
    };

    const removeRow = (i) => {
        setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
    };

    return (
        <div className="fixed inset-0 md:left-64 z-40 bg-[#181a20] overflow-y-auto">
            <div className="min-h-full flex flex-col">
                <div className="sticky top-0 z-10 bg-[#111317] flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                            NEW INBOUND // STEP 3 OF 3
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
                <form onSubmit={submit} className="flex-1 p-6 space-y-5">
                    <div className="border border-amber-500/30 bg-amber-500/5 p-3" data-testid="po-destination">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400 mb-1.5">
                            // DESTINATION (LOCKED)
                        </div>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
                            <span className="text-gray-500 flex items-center gap-1.5">
                                <Warehouse size={11} className="text-amber-400" />
                                Warehouse <span className="text-white">{zone?.name}</span>
                                <span className="text-gray-600">({zone?.zone})</span>
                            </span>
                            <span className="text-gray-500">
                                Location <span className="text-amber-400 font-bold">{location?.code}</span>
                            </span>
                            <button
                                type="button"
                                onClick={onBack}
                                className="text-amber-400 hover:text-amber-300 underline ml-auto"
                            >
                                Change
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <Field
                            label="PO Number"
                            value={form.po_number}
                            onChange={(v) => setForm({ ...form, po_number: v })}
                            testid="new-inbound-po"
                        />
                        <div>
                            <label className="block text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold mb-1.5">
                                Vendor
                            </label>
                            <select
                                data-testid="new-inbound-vendor"
                                value={form.vendor_id}
                                onChange={(e) => {
                                    const v = vendors.find((x) => x.id === e.target.value);
                                    setForm({ ...form, vendor_id: e.target.value, supplier: v ? v.name : "" });
                                }}
                                className="w-full bg-[#090a0c] border border-white/10 px-3 py-2 text-sm font-mono"
                            >
                                <option value="">— Select Vendor —</option>
                                {vendors.map((v) => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        </div>
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
                                                selectSku(i, e.target.value)
                                            }
                                            className="col-span-8 bg-[#090a0c] border border-white/10 px-2 py-2 text-xs font-mono"
                                        >
                                            <option value="">— Select SKU —</option>
                                            {skus.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.sku_code} · {s.name}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            data-testid={`inbound-item-qty-${i}`}
                                            type="number"
                                            min="1"
                                            value={it.qty}
                                            onChange={(e) => updateRow(i, "qty", e.target.value)}
                                            placeholder="Qty"
                                            className="col-span-3 bg-[#090a0c] border border-white/10 px-2 py-2 text-xs font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeRow(i)}
                                            className="col-span-1 text-gray-500 hover:text-red-400"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <div className="relative">
                                            {it.bag_color && (
                                                <span
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white/30"
                                                    style={{ backgroundColor: BAG_COLOR_HEX[it.bag_color] || "#6b7280" }}
                                                />
                                            )}
                                            <select
                                                data-testid={`inbound-item-bag-color-${i}`}
                                                value={it.bag_color || ""}
                                                onChange={(e) =>
                                                    updateRow(i, "bag_color", e.target.value)
                                                }
                                                className={`w-full bg-[#090a0c] border border-white/10 px-2 py-1.5 text-xs font-mono ${it.bag_color ? "pl-6" : ""}`}
                                            >
                                                <option value="">— Bag Color —</option>
                                                {Object.keys(BAG_COLOR_HEX).map((c) => (
                                                    <option key={c} value={c} style={{ color: BAG_COLOR_HEX[c] }}>
                                                        {c}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <input
                                            data-testid={`inbound-item-batch-${i}`}
                                            value={it.batch_no}
                                            onChange={(e) =>
                                                updateRow(i, "batch_no", e.target.value)
                                            }
                                            placeholder="Batch / Lot No."
                                            className="bg-[#090a0c] border border-white/10 px-2 py-1.5 text-xs font-mono"
                                        />
                                        <label className="flex flex-col gap-1">
                                            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Manufacturing Date</span>
                                            <input
                                                data-testid={`inbound-item-mfg-${i}`}
                                                type="date"
                                                value={it.manufacture_date}
                                                onChange={(e) =>
                                                    updateRow(i, "manufacture_date", e.target.value)
                                                }
                                                className="bg-[#090a0c] border border-white/10 px-2 py-1.5 text-xs font-mono"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Expiry Date</span>
                                            <input
                                                data-testid={`inbound-item-exp-${i}`}
                                                type="date"
                                                value={it.expiry_date}
                                                onChange={(e) =>
                                                    updateRow(i, "expiry_date", e.target.value)
                                                }
                                                className="bg-[#090a0c] border border-white/10 px-2 py-1.5 text-xs font-mono"
                                            />
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {err && <div className="text-xs text-red-400 font-mono">{err}</div>}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onBack}
                            disabled={busy}
                            className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white disabled:opacity-60"
                        >
                            ← Back
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            data-testid="submit-inbound-btn"
                            className="flex-[2] bg-amber-500 hover:bg-amber-600 text-black font-bold tracking-wider uppercase text-sm py-2.5 disabled:opacity-60"
                        >
                            {busy ? "Creating..." : "Create Purchase Order"}
                        </button>
                    </div>
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
