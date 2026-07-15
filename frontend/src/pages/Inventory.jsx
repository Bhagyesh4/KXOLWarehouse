import { useEffect, useRef, useState } from "react";
import Barcode from "react-barcode";
import { api, formatErr } from "../lib/api";
import { Search, Plus, X, Trash2, Edit3, ScanLine, Download, Upload } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Scanner from "../components/Scanner";

const BAG_COLOR_HEX = { Green: "#22c55e", White: "#e5e7eb", Yellow: "#eab308" };
const BAG_COLORS = ["Green", "White", "Yellow"];
const UNSPECIFIED = "Unspecified";

export default function Inventory() {
    const { user } = useAuth();
    const [skus, setSkus] = useState([]);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [view, setView] = useState(null);
    const [stockDetail, setStockDetail] = useState([]);
    const [scanOpen, setScanOpen] = useState(false);
    const [colorFilter, setColorFilter] = useState(null);
    const [stockByColor, setStockByColor] = useState([]);

    const canEdit = user?.role === "admin" || user?.role === "manager";
    const canDelete = user?.role === "admin";

    const fileRef = useRef(null);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [msg, setMsg] = useState(null);

    const onExport = async () => {
        setExporting(true);
        setMsg(null);
        try {
            const res = await api.get("/inventory/skus/export", { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement("a");
            a.href = url;
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            a.download = `skus_${today}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            setMsg({ type: "error", text: formatErr(e.response?.data?.detail) || "Export failed" });
        } finally {
            setExporting(false);
        }
    };

    const onImportFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setImporting(true);
        setImportResult(null);
        setMsg(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await api.post("/inventory/skus/import", fd);
            setImportResult(res.data);
            load();
        } catch (er) {
            setMsg({ type: "error", text: formatErr(er.response?.data?.detail) || "Import failed" });
        } finally {
            setImporting(false);
        }
    };

    const load = async () => {
        const [skuRes, colorRes] = await Promise.all([
            api.get(`/inventory/skus${q ? `?q=${encodeURIComponent(q)}` : ""}`),
            api.get("/inventory/stock-by-color"),
        ]);
        setSkus(skuRes.data);
        setStockByColor(colorRes.data);
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

    const normColor = (c) => (BAG_COLORS.includes(c) ? c : UNSPECIFIED);

    // Map each SKU to the set of bag colors it actually holds on-hand, derived
    // from real stock (not the SKU's default color).
    const skuColors = (() => {
        const map = {};
        for (const r of stockByColor) {
            if (!(r.on_hand > 0)) continue;
            const key = normColor(r.bag_color);
            (map[r.sku_id] = map[r.sku_id] || new Set()).add(key);
        }
        return map;
    })();

    // On-hand units + distinct SKU count per actual bag color.
    const breakdown = (() => {
        const groups = {};
        for (const c of [...BAG_COLORS, UNSPECIFIED]) groups[c] = { count: 0, onHand: 0, skus: new Set() };
        for (const r of stockByColor) {
            if (!(r.on_hand > 0)) continue;
            const g = groups[normColor(r.bag_color)];
            g.onHand += r.on_hand;
            g.skus.add(r.sku_id);
        }
        for (const c of Object.keys(groups)) groups[c].count = groups[c].skus.size;
        return groups;
    })();

    const visibleSkus = colorFilter
        ? skus.filter((s) => skuColors[s.id]?.has(colorFilter))
        : skus;

    // Colors shown in a SKU's row. When the SKU has stock on hand we show the
    // actual stock colors (empty when that stock is unspecified). Only when the
    // SKU has no stock at all do we fall back to its catalog default color.
    const rowColors = (s) => {
        const set = skuColors[s.id];
        if (set) return [...set].filter((c) => c !== UNSPECIFIED);
        return BAG_COLORS.includes(s.bag_color) ? [s.bag_color] : [];
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
                    <button
                        data-testid="export-skus-btn"
                        onClick={onExport}
                        disabled={exporting}
                        className="flex items-center gap-2 border border-white/10 hover:border-amber-500/40 hover:text-amber-400 text-gray-300 px-4 py-2 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                        <Download size={14} /> {exporting ? "Exporting…" : "Export"}
                    </button>
                    {canEdit && (
                        <>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx,.xlsm"
                                onChange={onImportFile}
                                className="hidden"
                                data-testid="import-skus-input"
                            />
                            <button
                                data-testid="import-skus-btn"
                                onClick={() => fileRef.current?.click()}
                                disabled={importing}
                                className="flex items-center gap-2 border border-white/10 hover:border-amber-500/40 hover:text-amber-400 text-gray-300 px-4 py-2 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
                            >
                                <Upload size={14} /> {importing ? "Importing…" : "Import"}
                            </button>
                        </>
                    )}
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

            {msg && (
                <div
                    data-testid="inventory-msg"
                    className={`border px-4 py-2 text-sm flex items-center justify-between ${
                        msg.type === "error"
                            ? "border-red-500/40 bg-red-500/10 text-red-300"
                            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    }`}
                >
                    <span>{msg.text}</span>
                    <button onClick={() => setMsg(null)} className="text-gray-400 hover:text-white">
                        <X size={14} />
                    </button>
                </div>
            )}

            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
                        Inventory by Bag Color
                    </div>
                    {colorFilter && (
                        <button
                            data-testid="clear-color-filter"
                            onClick={() => setColorFilter(null)}
                            className="font-mono text-[10px] uppercase tracking-wider text-amber-400 hover:text-amber-300"
                        >
                            All Categories
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[...BAG_COLORS, UNSPECIFIED]
                        .filter((c) => c !== UNSPECIFIED || breakdown[c].count > 0)
                        .map((c) => {
                            const g = breakdown[c];
                            const active = colorFilter === c;
                            return (
                                <button
                                    key={c}
                                    data-testid={`color-card-${c}`}
                                    onClick={() => setColorFilter(active ? null : c)}
                                    className={`text-left bg-[#181a20] border p-3 transition-colors ${
                                        active ? "border-amber-500/60" : "border-white/10 hover:border-white/25"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span
                                            className="inline-block w-3 h-3 rounded-full border border-white/30"
                                            style={{ backgroundColor: BAG_COLOR_HEX[c] || "#6b7280" }}
                                        />
                                        <span className="font-mono text-xs uppercase tracking-wider text-gray-300">
                                            {c}
                                        </span>
                                    </div>
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <div className="text-2xl font-bold leading-none">{g.onHand}</div>
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">
                                                Units on hand
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono text-sm text-amber-400">{g.count}</div>
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500">
                                                SKUs
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
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
                        {visibleSkus.map((s, i) => {
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
                                        {rowColors(s).length ? (
                                            <span className="inline-flex items-center gap-3 flex-wrap">
                                                {rowColors(s).map((c) => (
                                                    <span key={c} className="inline-flex items-center gap-2">
                                                        <span
                                                            className="inline-block w-2.5 h-2.5 rounded-full border border-white/30"
                                                            style={{ backgroundColor: BAG_COLOR_HEX[c] || "#6b7280" }}
                                                        />
                                                        {c}
                                                    </span>
                                                ))}
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
                        {visibleSkus.length === 0 && (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-gray-500">
                                    {colorFilter ? `No SKUs with bag color "${colorFilter}".` : "No SKUs found."}
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

            {importResult && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    onClick={() => setImportResult(null)}
                >
                    <div
                        data-testid="import-result-modal"
                        className="bg-[#181a20] border border-white/10 max-w-lg w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-5 border-b border-white/10">
                            <div>
                                <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                                    IMPORT COMPLETE
                                </div>
                                <h3 className="text-xl font-bold tracking-tight mt-1">Excel Import Summary</h3>
                            </div>
                            <button onClick={() => setImportResult(null)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5">
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="bg-[#111317] border border-emerald-500/30 p-3 text-center">
                                    <div className="text-2xl font-bold text-emerald-400">{importResult.created}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Created</div>
                                </div>
                                <div className="bg-[#111317] border border-amber-500/30 p-3 text-center">
                                    <div className="text-2xl font-bold text-amber-400">{importResult.updated}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Updated</div>
                                </div>
                                <div className="bg-[#111317] border border-red-500/30 p-3 text-center">
                                    <div className="text-2xl font-bold text-red-400">{importResult.errors.length}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">Errors</div>
                                </div>
                            </div>
                            {importResult.errors.length > 0 && (
                                <div>
                                    <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                                        Skipped Rows
                                    </div>
                                    <div className="max-h-56 overflow-y-auto space-y-1">
                                        {importResult.errors.map((er, i) => (
                                            <div
                                                key={i}
                                                className="flex gap-3 font-mono text-xs border-b border-white/5 py-1.5"
                                            >
                                                <span className="text-gray-500 shrink-0">Row {er.row}</span>
                                                {er.sku_code ? (
                                                    <span className="text-amber-400 shrink-0">{er.sku_code}</span>
                                                ) : null}
                                                <span className="text-red-300">{er.error}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {importResult.errors.length === 0 && (
                                <div className="text-sm text-emerald-300">All rows imported successfully.</div>
                            )}
                        </div>
                        <div className="p-5 border-t border-white/10 flex justify-end">
                            <button
                                onClick={() => setImportResult(null)}
                                className="bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-sm font-bold uppercase tracking-wider"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
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

        const weight = parseFloat(f.weight_per_bag);
        if (!(weight > 0)) return setErr("Weight per Bag must be greater than 0");
        const bags = Number(f.bags_per_pallet);
        if (!Number.isInteger(bags) || bags <= 0)
            return setErr("Bags per Pallet must be a whole number greater than 0");
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
                        <FormField label="Weight per Bag" type="number" step="0.01" min="0" value={f.weight_per_bag} onChange={(v) => setF({ ...f, weight_per_bag: v })} testid="form-sku-weight" />
                        <FormField label="Bags per Pallet" type="number" min="0" value={f.bags_per_pallet} onChange={(v) => setF({ ...f, bags_per_pallet: v })} testid="form-sku-bags" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Unit" value={f.unit} onChange={(v) => setF({ ...f, unit: v })} testid="form-sku-unit" />
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

function FormField({ label, value, onChange, type = "text", disabled, testid, options, placeholder, step, min, colorMap, optional }) {
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
                        required={!optional}
                        className={`${cls} ${colorMap && value ? "pl-8" : ""}`}
                    >
                        <option value="" disabled={!optional}>
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
                    required={!optional}
                    className={cls}
                />
            )}
        </div>
    );
}
