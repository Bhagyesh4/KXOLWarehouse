import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronUp, Users, Truck, ShoppingCart, PackageCheck } from "lucide-react";

const TODAY = new Date().toISOString().slice(0, 10);

const STATUS_COLORS = {
    draft:     "text-gray-400 bg-gray-400/10 border-gray-400/20",
    confirmed: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    received:  "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    shipped:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    cancelled: "text-red-400 bg-red-400/10 border-red-400/20",
};

const PURCHASE_STATUSES = ["draft", "confirmed", "received", "cancelled"];
const SALE_STATUSES     = ["draft", "confirmed", "shipped", "cancelled"];

function fmt(n) {
    return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Contact Form Modal ───────────────────────────────────────────────────────
function ContactModal({ title, initial, onSave, onClose }) {
    const [form, setForm] = useState(
        initial || { code: "", name: "", contact_person: "", email: "", phone: "", address: "", city: "", country: "", notes: "" }
    );
    const [saving, setSaving] = useState(false);

    const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

    async function submit(e) {
        e.preventDefault();
        if (!form.code.trim() || !form.name.trim()) { toast.error("Code and Name are required"); return; }
        setSaving(true);
        try { await onSave(form); }
        finally { setSaving(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-[#181a20] border border-white/10 w-full max-w-lg rounded-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <span className="font-semibold text-sm">{title}</span>
                    <button onClick={onClose}><X size={16} className="text-gray-400 hover:text-white" /></button>
                </div>
                <form onSubmit={submit} className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Code *</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm font-mono uppercase"
                                value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="CUST-001" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Name *</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Company Name" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Contact Person</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.contact_person || ""} onChange={(e) => set("contact_person", e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Email</label>
                            <input type="email" className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Phone</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">City</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs text-gray-400 mb-1">Address</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Country</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.country || ""} onChange={(e) => set("country", e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Notes</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-white/10 hover:border-white/30 rounded-sm">Cancel</button>
                        <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-sm disabled:opacity-50">
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Order Form Modal ─────────────────────────────────────────────────────────
function OrderModal({ title, type, parties, skus, onSave, onClose }) {
    const isP = type === "purchase";
    const partyKey = isP ? "vendor_id" : "customer_id";
    const priceKey = isP ? "unit_cost" : "unit_price";

    const [form, setForm] = useState({ [partyKey]: "", order_date: TODAY, expected_date: "", notes: "" });
    const [items, setItems] = useState([{ sku_id: "", qty: 1, [priceKey]: "" }]);
    const [saving, setSaving] = useState(false);

    const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

    const setItem = (i, k, v) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
    const addItem  = () => setItems((p) => [...p, { sku_id: "", qty: 1, [priceKey]: "" }]);
    const delItem  = (i) => setItems((p) => p.filter((_, idx) => idx !== i));

    const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it[priceKey]) || 0), 0);

    async function submit(e) {
        e.preventDefault();
        if (!form[partyKey]) { toast.error(isP ? "Select a vendor" : "Select a customer"); return; }
        if (items.some((it) => !it.sku_id || !it.qty || !it[priceKey])) { toast.error("Fill all line items"); return; }
        setSaving(true);
        try { await onSave({ ...form, items: items.map((it) => ({ ...it, qty: Number(it.qty), [priceKey]: Number(it[priceKey]) })) }); }
        finally { setSaving(false); }
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-[#181a20] border border-white/10 w-full max-w-2xl rounded-sm max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                    <span className="font-semibold text-sm">{title}</span>
                    <button onClick={onClose}><X size={16} className="text-gray-400 hover:text-white" /></button>
                </div>
                <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-xs text-gray-400 mb-1">{isP ? "Vendor" : "Customer"} *</label>
                            <select className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form[partyKey]} onChange={(e) => setF(partyKey, e.target.value)}>
                                <option value="">— select —</option>
                                {parties.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Order Date *</label>
                            <input type="date" className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.order_date} onChange={(e) => setF("order_date", e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Expected Date</label>
                            <input type="date" className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.expected_date} onChange={(e) => setF("expected_date", e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs text-gray-400 mb-1">Notes</label>
                            <input className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-3 py-2 text-sm"
                                value={form.notes} onChange={(e) => setF("notes", e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400 uppercase tracking-widest">Line Items</span>
                            <button type="button" onClick={addItem} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                                <Plus size={12} /> Add Line
                            </button>
                        </div>
                        <div className="space-y-2">
                            {items.map((it, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-5">
                                        <select className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-2 py-1.5 text-xs"
                                            value={it.sku_id} onChange={(e) => setItem(i, "sku_id", e.target.value)}>
                                            <option value="">— SKU —</option>
                                            {skus.map((s) => <option key={s.id} value={s.id}>{s.sku_code} — {s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <input type="number" min="1" placeholder="Qty"
                                            className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-2 py-1.5 text-xs text-center"
                                            value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} />
                                    </div>
                                    <div className="col-span-3">
                                        <input type="number" min="0" step="0.01" placeholder={isP ? "Unit Cost" : "Unit Price"}
                                            className="w-full bg-[#090a0c] border border-white/10 rounded-sm px-2 py-1.5 text-xs text-right"
                                            value={it[priceKey]} onChange={(e) => setItem(i, priceKey, e.target.value)} />
                                    </div>
                                    <div className="col-span-1 text-right text-xs text-gray-500 font-mono">
                                        {fmt((Number(it.qty) || 0) * (Number(it[priceKey]) || 0))}
                                    </div>
                                    <div className="col-span-1 text-right">
                                        {items.length > 1 && (
                                            <button type="button" onClick={() => delItem(i)}><X size={12} className="text-gray-500 hover:text-red-400" /></button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end mt-3 pt-3 border-t border-white/10">
                            <span className="text-sm font-semibold">Total: <span className="text-amber-400 font-mono">${fmt(total)}</span></span>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-white/10 hover:border-white/30 rounded-sm">Cancel</button>
                        <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-sm disabled:opacity-50">
                            {saving ? "Saving…" : "Create Order"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Order Detail Drawer ──────────────────────────────────────────────────────
function OrderDetail({ order, type, statuses, onStatusChange, onClose }) {
    const isP = type === "purchase";
    const [updating, setUpdating] = useState(false);

    async function changeStatus(s) {
        setUpdating(true);
        try {
            await api.put(`/${isP ? "purchases" : "sales"}/${order.id}/status`, { status: s });
            toast.success("Status updated");
            onStatusChange(order.id, s);
        } catch (e) {
            toast.error(e.response?.data?.detail || "Failed to update status");
        } finally {
            setUpdating(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-end p-4">
            <div className="bg-[#181a20] border border-white/10 w-full max-w-md h-full max-h-[95vh] flex flex-col rounded-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                    <div>
                        <div className="font-mono text-xs text-gray-500 uppercase">{isP ? "Purchase Order" : "Sales Order"}</div>
                        <div className="font-bold">{order.po_number || order.so_number}</div>
                    </div>
                    <button onClick={onClose}><X size={16} className="text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div className="text-xs text-gray-500">{isP ? "Vendor" : "Customer"}</div>
                            <div className="font-medium">{order.vendor_name || order.customer_name}</div>
                            <div className="font-mono text-xs text-gray-500">{order.vendor_code || order.customer_code}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Status</div>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs border font-mono ${STATUS_COLORS[order.status] || ""}`}>
                                {order.status}
                            </span>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Order Date</div>
                            <div>{order.order_date}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Expected Date</div>
                            <div>{order.expected_date || "—"}</div>
                        </div>
                        {order.notes && (
                            <div className="col-span-2">
                                <div className="text-xs text-gray-500">Notes</div>
                                <div className="text-sm text-gray-300">{order.notes}</div>
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Line Items</div>
                        <div className="space-y-1">
                            {(order.items || []).map((it, i) => (
                                <div key={i} className="flex items-center justify-between bg-[#090a0c] px-3 py-2 rounded-sm">
                                    <div>
                                        <div className="font-mono text-xs text-amber-400">{it.sku_code}</div>
                                        <div className="text-xs text-gray-400">{it.sku_name}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-gray-400">{it.qty} × ${fmt(isP ? it.unit_cost : it.unit_price)}</div>
                                        <div className="text-sm font-semibold font-mono">${fmt(isP ? it.total_cost : it.total_price)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
                            <span className="text-sm text-gray-400">Total</span>
                            <span className="text-lg font-bold font-mono text-amber-400">${fmt(order.total_amount)}</span>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">Update Status</div>
                        <div className="flex flex-wrap gap-2">
                            {statuses.map((s) => (
                                <button key={s} disabled={updating || order.status === s}
                                    onClick={() => changeStatus(s)}
                                    className={`px-3 py-1.5 text-xs rounded-sm border transition-colors
                                        ${order.status === s
                                            ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
                                            : "border-white/10 text-gray-400 hover:border-white/30 hover:text-white"
                                        } disabled:opacity-40`}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Customers Tab ────────────────────────────────────────────────────────────
function CustomersTab({ customers, onAdd, onEdit, onDelete }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-500 uppercase tracking-widest">
                    {customers.length} customer{customers.length !== 1 ? "s" : ""}
                </span>
                <button onClick={onAdd}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-sm">
                    <Plus size={14} /> Add Customer
                </button>
            </div>
            {customers.length === 0 ? (
                <div className="text-center py-16 text-gray-600">No customers yet — add your first one</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-widest">
                                <th className="text-left py-2 pr-4">Code</th>
                                <th className="text-left py-2 pr-4">Name</th>
                                <th className="text-left py-2 pr-4">Contact</th>
                                <th className="text-left py-2 pr-4">City</th>
                                <th className="text-right py-2 pr-4">Orders</th>
                                <th className="text-right py-2 pr-4">Total Sales</th>
                                <th className="py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map((c) => (
                                <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <td className="py-3 pr-4 font-mono text-amber-400 text-xs">{c.code}</td>
                                    <td className="py-3 pr-4 font-medium">{c.name}</td>
                                    <td className="py-3 pr-4 text-gray-400 text-xs">
                                        <div>{c.contact_person || "—"}</div>
                                        <div>{c.email || ""}</div>
                                    </td>
                                    <td className="py-3 pr-4 text-gray-400">{c.city || "—"}</td>
                                    <td className="py-3 pr-4 text-right text-gray-400">{c.order_count}</td>
                                    <td className="py-3 pr-4 text-right font-mono text-emerald-400">${fmt(c.total_sales)}</td>
                                    <td className="py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button onClick={() => onEdit(c)} className="text-gray-500 hover:text-amber-400 transition-colors">
                                                <Pencil size={13} />
                                            </button>
                                            <button onClick={() => onDelete(c)} className="text-gray-500 hover:text-red-400 transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Vendors Tab ──────────────────────────────────────────────────────────────
function VendorsTab({ vendors, onAdd, onEdit, onDelete }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-500 uppercase tracking-widest">
                    {vendors.length} vendor{vendors.length !== 1 ? "s" : ""}
                </span>
                <button onClick={onAdd}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-sm">
                    <Plus size={14} /> Add Vendor
                </button>
            </div>
            {vendors.length === 0 ? (
                <div className="text-center py-16 text-gray-600">No vendors yet — add your first one</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-widest">
                                <th className="text-left py-2 pr-4">Code</th>
                                <th className="text-left py-2 pr-4">Name</th>
                                <th className="text-left py-2 pr-4">Contact</th>
                                <th className="text-left py-2 pr-4">City</th>
                                <th className="text-right py-2 pr-4">POs</th>
                                <th className="text-right py-2 pr-4">Total Purchases</th>
                                <th className="py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map((v) => (
                                <tr key={v.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <td className="py-3 pr-4 font-mono text-amber-400 text-xs">{v.code}</td>
                                    <td className="py-3 pr-4 font-medium">{v.name}</td>
                                    <td className="py-3 pr-4 text-gray-400 text-xs">
                                        <div>{v.contact_person || "—"}</div>
                                        <div>{v.email || ""}</div>
                                    </td>
                                    <td className="py-3 pr-4 text-gray-400">{v.city || "—"}</td>
                                    <td className="py-3 pr-4 text-right text-gray-400">{v.order_count}</td>
                                    <td className="py-3 pr-4 text-right font-mono text-blue-400">${fmt(v.total_purchases)}</td>
                                    <td className="py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button onClick={() => onEdit(v)} className="text-gray-500 hover:text-amber-400 transition-colors">
                                                <Pencil size={13} />
                                            </button>
                                            <button onClick={() => onDelete(v)} className="text-gray-500 hover:text-red-400 transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Orders Table ─────────────────────────────────────────────────────────────
function OrdersTab({ orders, type, parties, skus, onAdd, onDelete, onStatusChange }) {
    const isP = type === "purchase";
    const [detail, setDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(null);

    async function openDetail(order) {
        setLoadingDetail(order.id);
        try {
            const r = await api.get(`/${isP ? "purchases" : "sales"}/${order.id}`);
            setDetail(r.data);
        } catch {
            toast.error("Failed to load order detail");
        } finally {
            setLoadingDetail(null);
        }
    }

    function handleStatusChange(id, status) {
        setDetail((d) => d ? { ...d, status } : d);
        onStatusChange(id, status);
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-500 uppercase tracking-widest">
                    {orders.length} order{orders.length !== 1 ? "s" : ""}
                </span>
                <button onClick={onAdd}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-sm">
                    <Plus size={14} /> New {isP ? "Purchase" : "Sales"} Order
                </button>
            </div>
            {orders.length === 0 ? (
                <div className="text-center py-16 text-gray-600">No {isP ? "purchase" : "sales"} orders yet</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/10 text-xs text-gray-500 uppercase tracking-widest">
                                <th className="text-left py-2 pr-4">{isP ? "PO #" : "SO #"}</th>
                                <th className="text-left py-2 pr-4">{isP ? "Vendor" : "Customer"}</th>
                                <th className="text-left py-2 pr-4">Date</th>
                                <th className="text-left py-2 pr-4">Status</th>
                                <th className="text-right py-2 pr-4">Items</th>
                                <th className="text-right py-2 pr-4">Total</th>
                                <th className="py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((o) => (
                                <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                                    onClick={() => openDetail(o)}>
                                    <td className="py-3 pr-4 font-mono text-amber-400 text-xs">
                                        {loadingDetail === o.id ? <span className="text-gray-500">Loading…</span> : (o.po_number || o.so_number)}
                                    </td>
                                    <td className="py-3 pr-4">
                                        <div className="font-medium">{o.vendor_name || o.customer_name}</div>
                                        <div className="font-mono text-xs text-gray-500">{o.vendor_code || o.customer_code}</div>
                                    </td>
                                    <td className="py-3 pr-4 text-gray-400">{o.order_date}</td>
                                    <td className="py-3 pr-4">
                                        <span className={`px-2 py-0.5 rounded text-xs border font-mono ${STATUS_COLORS[o.status] || ""}`}>
                                            {o.status}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4 text-right text-gray-400">{o.item_count}</td>
                                    <td className="py-3 pr-4 text-right font-mono font-semibold">${fmt(o.total_amount)}</td>
                                    <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        {(o.status === "draft" || o.status === "cancelled") && (
                                            <button onClick={() => onDelete(o)} className="text-gray-500 hover:text-red-400 transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {detail && (
                <OrderDetail
                    order={detail}
                    type={type}
                    statuses={isP ? PURCHASE_STATUSES : SALE_STATUSES}
                    onStatusChange={handleStatusChange}
                    onClose={() => setDetail(null)}
                />
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
    { key: "customers", label: "Customers",  icon: Users },
    { key: "vendors",   label: "Vendors",    icon: Truck },
    { key: "purchases", label: "Purchases",  icon: PackageCheck },
    { key: "sales",     label: "Sales",      icon: ShoppingCart },
];

export default function Customers() {
    const [tab, setTab]           = useState("customers");
    const [customers, setCustomers] = useState([]);
    const [vendors, setVendors]   = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [sales, setSales]       = useState([]);
    const [skus, setSkus]         = useState([]);

    const [contactModal, setContactModal] = useState(null);
    const [orderModal, setOrderModal]     = useState(null);

    async function load() {
        try {
            const [c, v, p, s, sk] = await Promise.all([
                api.get("/customers"),
                api.get("/vendors"),
                api.get("/purchases"),
                api.get("/sales"),
                api.get("/inventory/skus"),
            ]);
            setCustomers(c.data);
            setVendors(v.data);
            setPurchases(p.data);
            setSales(s.data);
            setSkus(sk.data);
        } catch {
            toast.error("Failed to load data");
        }
    }

    useEffect(() => { load(); }, []);

    // ── Summary stats ──
    const stats = useMemo(() => ({
        customers: customers.length,
        vendors:   vendors.length,
        totalSales: customers.reduce((s, c) => s + Number(c.total_sales || 0), 0),
        totalPurchases: vendors.reduce((s, v) => s + Number(v.total_purchases || 0), 0),
    }), [customers, vendors]);

    // ── Contact (Customer/Vendor) CRUD ──
    function openAdd(type) { setContactModal({ type, editing: null }); }
    function openEdit(type, rec) { setContactModal({ type, editing: rec }); }

    async function saveContact(form) {
        const { type, editing } = contactModal;
        const url = `/${type}s`;
        try {
            if (editing) {
                await api.put(`${url}/${editing.id}`, form);
                toast.success(`${type === "customer" ? "Customer" : "Vendor"} updated`);
            } else {
                await api.post(url, form);
                toast.success(`${type === "customer" ? "Customer" : "Vendor"} added`);
            }
            setContactModal(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Save failed");
            throw e;
        }
    }

    async function deleteContact(type, rec) {
        if (!window.confirm(`Delete ${rec.name}?`)) return;
        try {
            await api.delete(`/${type}s/${rec.id}`);
            toast.success("Deleted");
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Delete failed");
        }
    }

    // ── Order CRUD ──
    async function saveOrder(type, form) {
        try {
            const r = await api.post(`/${type}`, form);
            toast.success(`Order ${r.data.po_number || r.data.so_number} created`);
            setOrderModal(null);
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Save failed");
            throw e;
        }
    }

    async function deleteOrder(type, order) {
        if (!window.confirm(`Delete order ${order.po_number || order.so_number}?`)) return;
        try {
            await api.delete(`/${type}/${order.id}`);
            toast.success("Order deleted");
            load();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Delete failed");
        }
    }

    function handleOrderStatusChange(type, id, status) {
        if (type === "purchases") {
            setPurchases((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
        } else {
            setSales((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
        }
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div>
                <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                    // CUSTOMERS & VENDORS // CRM
                </div>
                <h1 className="text-3xl font-bold tracking-tight mt-1">Customers & Vendors</h1>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: "Customers",       value: stats.customers,              color: "text-amber-400" },
                    { label: "Vendors",          value: stats.vendors,                color: "text-blue-400" },
                    { label: "Total Sales",      value: `$${fmt(stats.totalSales)}`,  color: "text-emerald-400" },
                    { label: "Total Purchases",  value: `$${fmt(stats.totalPurchases)}`, color: "text-purple-400" },
                ].map((s) => (
                    <div key={s.label} className="bg-[#181a20] border border-white/10 p-4">
                        <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">{s.label}</div>
                        <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Tab Bar */}
            <div className="bg-[#181a20] border border-white/10">
                <div className="flex border-b border-white/10">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
                                ${tab === key
                                    ? "border-amber-500 text-amber-400"
                                    : "border-transparent text-gray-500 hover:text-gray-300"}`}>
                            <Icon size={14} /> {label}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {tab === "customers" && (
                        <CustomersTab
                            customers={customers}
                            onAdd={() => openAdd("customer")}
                            onEdit={(c) => openEdit("customer", c)}
                            onDelete={(c) => deleteContact("customer", c)}
                        />
                    )}
                    {tab === "vendors" && (
                        <VendorsTab
                            vendors={vendors}
                            onAdd={() => openAdd("vendor")}
                            onEdit={(v) => openEdit("vendor", v)}
                            onDelete={(v) => deleteContact("vendor", v)}
                        />
                    )}
                    {tab === "purchases" && (
                        <OrdersTab
                            orders={purchases}
                            type="purchase"
                            parties={vendors}
                            skus={skus}
                            onAdd={() => setOrderModal({ type: "purchases" })}
                            onDelete={(o) => deleteOrder("purchases", o)}
                            onStatusChange={(id, s) => handleOrderStatusChange("purchases", id, s)}
                        />
                    )}
                    {tab === "sales" && (
                        <OrdersTab
                            orders={sales}
                            type="sale"
                            parties={customers}
                            skus={skus}
                            onAdd={() => setOrderModal({ type: "sales" })}
                            onDelete={(o) => deleteOrder("sales", o)}
                            onStatusChange={(id, s) => handleOrderStatusChange("sales", id, s)}
                        />
                    )}
                </div>
            </div>

            {/* Contact Modal */}
            {contactModal && (
                <ContactModal
                    title={`${contactModal.editing ? "Edit" : "Add"} ${contactModal.type === "customer" ? "Customer" : "Vendor"}`}
                    initial={contactModal.editing}
                    onSave={saveContact}
                    onClose={() => setContactModal(null)}
                />
            )}

            {/* Order Modal */}
            {orderModal && (
                <OrderModal
                    title={`New ${orderModal.type === "purchases" ? "Purchase" : "Sales"} Order`}
                    type={orderModal.type === "purchases" ? "purchase" : "sale"}
                    parties={orderModal.type === "purchases" ? vendors : customers}
                    skus={skus}
                    onSave={(form) => saveOrder(orderModal.type, form)}
                    onClose={() => setOrderModal(null)}
                />
            )}
        </div>
    );
}
