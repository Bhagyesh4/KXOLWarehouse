import { useEffect, useState } from "react";
import Barcode from "react-barcode";
import { api } from "../lib/api";
import { Search, Plus, X, Trash2, Edit3, ScanLine } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Scanner from "../components/Scanner";

const BAG_COLOR_HEX = { Green: "#22c55e", White: "#e5e7eb", Yellow: "#eab308" };

export default function Inventory() {
    const { user } = useAuth();
    const [skus, setSkus] = useState([]);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [view, setView] = useState(null);
    const [stockDetail, setStockDetail] = useState([]);
    const [scanOpen, setScanOpen] = useState(false);

    const canEdit = user?.role === "admin" || user?.role === "manager";
    const canDelete = user?.role === "admin";

    const load = async () => {
        const r = await api.get(`/inventory/skus${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        setSkus(r.data);
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, [q]);

    const onSave = async (form) => {
        if (editing) await api.put(`/inventory/skus/${editing.id}`, form);
        else await api.post("/inventory/skus", form);
        setOpen(false);
        setEditing(null);
        load();
    };

    const onDelete = async (id) => {
        if (!confirm("Delete this SKU?")) return;
        await api.delete(`/inventory/skus/${id}`);
        load();
    };

    const openView = async (sku) => {
        setView(sku);
        const r = await api.get(`/inventory/skus/${sku.id}/stock`);
        setStockDetail(r.data);
    };

    const status = (s) => {
        if (s.total_stock <= 0) return { label: "Out of Stock", cls: "border-red-500/40 text-red-400 bg-red-500/10" };
        if (s.total_stock <= s.reorder_level) return { label: "Low Stock", cls: "border-amber-500/40 text-amber-400 bg-amber-500/10" };
        return { label: "In Stock", cls: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" };
    };

    return (
        <div className="space-y-5">
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                        // CATALOG // SKU MASTER
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight mt-1">
                        Inventory Master
                    </h1>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            data-testid="sku-search-input"
                            placeholder="Search SKU or name..."
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            className="bg-[#090a0c] border border-white/10 pl-9 pr-3 py-2 font-mono text-sm w-72 focus:border-amber-500 focus:outline-none"
                        />
                    </div>
                    <button
                        data-testid="scan-btn"
                        onClick={() => setScanOpen(true)}
                        className="flex items-center gap-2 border border-white/10 hover:border-amber-500/40 hover:text-amber-400 text-gray-300 px-4 py-2 text-sm font-bold uppercase tracking-wider"
                    >
                        <ScanLine size={14} /> Scan
                    </button>
                    {canEdit && (
                        <button
                            data-testid="add-sku-btn"
                            onClick={() => {
                                setEditing(null);
                                setOpen(true);
                            }}
                            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-sm font-bold uppercase tracking-wider"
                        >
                            <Plus size={14} /> Add SKU
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-[#181a20] border border-white/10 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-[#111317] text-[10px] uppercase tracking-[0.15em] text-gray-500">
                        <tr>
                            <th className="text-left py-3 px-4">SKU</th>
                            <th className="text-left py-3 px-4">Name</th>
                            <th className="text-left py-3 px-4">Category</th>
                            <th className="text-left py-3 px-4">Bag Color</th>
                            <th className="text-right py-3 px-4">Unit Price</th>
                            <th className="text-right py-3 px-4">On Hand</th>
                            <th className="text-right py-3 px-4">Reorder</th>
                            <th className="text-center py-3 px-4">Status</th>
                            <th className="text-right py-3 px-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {skus.map((s, i) => {
                            const st = status(s);
                            return (
                                <tr
                                    key={s.id}
                                    data-testid={`sku-row-${i}`}
                                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                                    onClick={() => openView(s)}
                                >
                                    <td className="py-3 px-4 font-mono text-amber-400">{s.sku_code}</td>
                                    <td className="py-3 px-4">{s.name}</td>
                                    <td className="py-3 px-4 text-gray-400">{s.category}</td>
                                    <td className="py-3 px-4 text-gray-400">
                                        {s.bag_color ? (
                                            <span className="inline-flex items-center gap-2">
                                                <span
                                                    className="inline-block w-2.5 h-2.5 rounded-full border border-white/30"
                                                    style={{ backgroundColor: BAG_COLOR_HEX[s.bag_color] || "#6b7280" }}
                                                />
                                                {s.bag_color}
                                            </span>
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono">${s.unit_price.toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-mono">{s.total_stock}</td>
                                    <td className="py-3 px-4 text-right font-mono text-gray-500">{s.reorder_level}</td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border ${st.cls}`}>
                                            {st.label}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex justify-end gap-2">
                                            {canEdit && (
                                                <button
                                                    onClick={() => {
                                                        setEditing(s);
                                                        setOpen(true);
                                                    }}
                                                    data-testid={`edit-sku-${i}`}
                                                    className="text-gray-400 hover:text-amber-400"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    onClick={() => onDelete(s.id)}
                                                    data-testid={`delete-sku-${i}`}
                                                    className="text-gray-400 hover:text-red-400"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {skus.length === 0 && (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-gray-500">
                                    No SKUs found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {open && (
                <SkuFormModal
                    onClose={() => {
                        setOpen(false);
                        setEditing(null);
                    }}
                    onSave={onSave}
                    initial={editing}
                />
            )}

            {view && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setView(null)}>
                    <div className="bg-[#181a20] border border-white/10 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-white/10">
                            <div>
                                <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                                    SKU DETAIL
                                </div>
                                <h3 className="text-xl font-bold tracking-tight mt-1">{view.name}</h3>
                            </div>
                            <button onClick={() => setView(null)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-5">
                            <div>
                                <div className="text-[10px] uppercase tracking-widest text-gray-500">SKU Code</div>
                                <div className="font-mono text-amber-400 text-lg">{view.sku_code}</div>
                                <div className="mt-4 bg-white p-3 rounded-sm">
                                    <Barcode value={view.sku_code} height={60} fontSize={12} background="#fff" />
                                </div>
                            </div>
                            <div className="space-y-2 font-mono text-sm">
                                <Detail label="Category" value={view.category} />
                                <Detail
                                    label="Bag Color"
                                    value={
                                        view.bag_color ? (
                                            <span className="inline-flex items-center gap-2">
                                                <span
                                                    className="inline-block w-2.5 h-2.5 rounded-full border border-white/30"
                                                    style={{ backgroundColor: BAG_COLOR_HEX[view.bag_color] || "#6b7280" }}
                                                />
                                                {view.bag_color}
                                            </span>
                                        ) : (
                                            "—"
                                        )
                                    }
                                />
                                <Detail label="Weight per Bag" value={view.weight_per_bag != null ? view.weight_per_bag : "—"} />
                                <Detail label="Bags per Pallet" value={view.bags_per_pallet != null ? view.bags_per_pallet : "—"} />
                                <Detail label="Dimensions" value={view.dimensions || "—"} />
                                <Detail label="Unit" value={view.unit} />
                                <Detail label="Unit Price" value={`$${view.unit_price.toFixed(2)}`} />
                                <Detail label="On Hand" value={view.total_stock} />
                                <Detail label="Reorder Level" value={view.reorder_level} />
                            </div>
                        </div>
                        <div className="p-5 border-t border-white/10">
                            <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                                STOCK BY LOCATION
                            </div>
                            {stockDetail.length === 0 ? (
                                <div className="text-sm text-gray-500">No stock placed.</div>
                            ) : (
                                <div className="space-y-1">
                                    {stockDetail.map((row, i) => (
                                        <div key={i} className="flex justify-between font-mono text-sm border-b border-white/5 py-1.5">
                                            <span className="text-amber-400">{row.location.code}</span>
                                            <span>{row.qty} units</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {scanOpen && (
                <Scanner
                    onScan={(code) => {
                        setQ(code);
                        setScanOpen(false);
                        // Try open the SKU detail if exact match
                        setTimeout(async () => {
                            try {
                                const r = await api.get(
                                    `/inventory/skus?q=${encodeURIComponent(code)}`
                                );
                                const exact = r.data.find((s) => s.sku_code === code);
                                if (exact) openView(exact);
                            } catch {}
                        }, 200);
                    }}
                    onClose={() => setScanOpen(false)}
                />
            )}
        </div>
    );
}

function Detail({ label, value }) {
    return (
        <div className="flex justify-between border-b border-white/5 py-1">
            <span className="text-gray-500 text-xs uppercase tracking-widest">{label}</span>
            <span>{value}</span>
        </div>
    );
}

function SkuFormModal({ onClose, onSave, initial }) {
    const [f, setF] = useState(
        initial || {
            sku_code: "",
            name: "",
            category: "",
            bag_color: "",
            weight_per_bag: "",
            bags_per_pallet: "",
            dimensions: "",
            unit: "EA",
            unit_price: 0,
            reorder_level: 10,
        }
    );
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setErr("");

        if (!f.bag_color) return setErr("Bag Color is required");
        const weight = parseFloat(f.weight_per_bag);
        if (!(weight > 0)) return setErr("Weight per Bag must be greater than 0");
        const bags = Number(f.bags_per_pallet);
        if (!Number.isInteger(bags) || bags <= 0)
            return setErr("Bags per Pallet must be a whole number greater than 0");
        if (!f.dimensions || !f.dimensions.trim()) return setErr("Dimensions cannot be empty");

        setBusy(true);
        try {
            await onSave({
                ...f,
                weight_per_bag: weight,
                bags_per_pallet: bags,
                dimensions: f.dimensions.trim(),
                unit_price: parseFloat(f.unit_price) || 0,
                reorder_level: parseInt(f.reorder_level) || 0,
            });
        } catch (er) {
            setErr(er.response?.data?.detail || er.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#181a20] border border-white/10 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <h3 className="font-bold tracking-tight">
                        {initial ? "Edit SKU" : "Add New SKU"}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={submit} className="p-5 space-y-3">
                    <FormField label="SKU Code" value={f.sku_code} onChange={(v) => setF({ ...f, sku_code: v })} disabled={!!initial} testid="form-sku-code" />
                    <FormField label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} testid="form-sku-name" />
                    <FormField label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} testid="form-sku-category" />
                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Bag Color" type="select" options={["Green", "White", "Yellow"]} colorMap={BAG_COLOR_HEX} placeholder="Select color" value={f.bag_color} onChange={(v) => setF({ ...f, bag_color: v })} testid="form-sku-bag-color" />
                        <FormField label="Weight per Bag" type="number" step="0.01" min="0" value={f.weight_per_bag} onChange={(v) => setF({ ...f, weight_per_bag: v })} testid="form-sku-weight" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Bags per Pallet" type="number" min="0" value={f.bags_per_pallet} onChange={(v) => setF({ ...f, bags_per_pallet: v })} testid="form-sku-bags" />
                        <FormField label="Dimensions" value={f.dimensions} onChange={(v) => setF({ ...f, dimensions: v })} testid="form-sku-dimensions" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <FormField label="Unit" value={f.unit} onChange={(v) => setF({ ...f, unit: v })} testid="form-sku-unit" />
                        <FormField label="Unit Price" type="number" value={f.unit_price} onChange={(v) => setF({ ...f, unit_price: v })} testid="form-sku-price" />
                        <FormField label="Reorder Level" type="number" value={f.reorder_level} onChange={(v) => setF({ ...f, reorder_level: v })} testid="form-sku-reorder" />
                    </div>
                    {err && <div className="text-xs text-red-400 font-mono">{err}</div>}
                    <button
                        type="submit"
                        disabled={busy}
                        data-testid="form-sku-submit"
                        className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold tracking-wider uppercase text-sm py-2.5 disabled:opacity-60"
                    >
                        {busy ? "Saving..." : initial ? "Update SKU" : "Create SKU"}
                    </button>
                </form>
            </div>
        </div>
    );
}

function FormField({ label, value, onChange, type = "text", disabled, testid, options, placeholder, step, min, colorMap }) {
    const cls =
        "w-full mt-1 bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none disabled:opacity-60";
    return (
        <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                {label}
            </label>
            {type === "select" ? (
                <div className="relative">
                    {colorMap && value && (
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white/30"
                            style={{ backgroundColor: colorMap[value] || "#6b7280" }}
                        />
                    )}
                    <select
                        data-testid={testid}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                        required
                        className={`${cls} ${colorMap && value ? "pl-8" : ""}`}
                    >
                        <option value="" disabled>
                            {placeholder || "Select..."}
                        </option>
                        {(options || []).map((opt) => (
                            <option
                                key={opt}
                                value={opt}
                                style={colorMap ? { color: colorMap[opt] || "#e5e7eb" } : undefined}
                            >
                                {opt}
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <input
                    data-testid={testid}
                    type={type}
                    step={step}
                    min={min}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    required
                    className={cls}
                />
            )}
        </div>
    );
}
