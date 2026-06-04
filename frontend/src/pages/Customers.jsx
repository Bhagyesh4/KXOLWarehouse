import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Users, Truck } from "lucide-react";

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
                                <th className="text-left py-2 pr-4">Contact Person</th>
                                <th className="text-left py-2 pr-4">Email</th>
                                <th className="text-left py-2 pr-4">Phone</th>
                                <th className="text-left py-2 pr-4">City</th>
                                <th className="text-left py-2 pr-4">Country</th>
                                <th className="py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map((c) => (
                                <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <td className="py-3 pr-4 font-mono text-amber-400 text-xs">{c.code}</td>
                                    <td className="py-3 pr-4 font-medium">{c.name}</td>
                                    <td className="py-3 pr-4 text-gray-400">{c.contact_person || "—"}</td>
                                    <td className="py-3 pr-4 text-gray-400 text-xs">{c.email || "—"}</td>
                                    <td className="py-3 pr-4 text-gray-400">{c.phone || "—"}</td>
                                    <td className="py-3 pr-4 text-gray-400">{c.city || "—"}</td>
                                    <td className="py-3 pr-4 text-gray-400">{c.country || "—"}</td>
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
                                <th className="text-left py-2 pr-4">Contact Person</th>
                                <th className="text-left py-2 pr-4">Email</th>
                                <th className="text-left py-2 pr-4">Phone</th>
                                <th className="text-left py-2 pr-4">City</th>
                                <th className="text-left py-2 pr-4">Country</th>
                                <th className="py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map((v) => (
                                <tr key={v.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <td className="py-3 pr-4 font-mono text-amber-400 text-xs">{v.code}</td>
                                    <td className="py-3 pr-4 font-medium">{v.name}</td>
                                    <td className="py-3 pr-4 text-gray-400">{v.contact_person || "—"}</td>
                                    <td className="py-3 pr-4 text-gray-400 text-xs">{v.email || "—"}</td>
                                    <td className="py-3 pr-4 text-gray-400">{v.phone || "—"}</td>
                                    <td className="py-3 pr-4 text-gray-400">{v.city || "—"}</td>
                                    <td className="py-3 pr-4 text-gray-400">{v.country || "—"}</td>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
    { key: "customers", label: "Customers", icon: Users },
    { key: "vendors",   label: "Vendors",   icon: Truck },
];

export default function Customers() {
    const [tab, setTab]             = useState("customers");
    const [customers, setCustomers] = useState([]);
    const [vendors, setVendors]     = useState([]);
    const [modal, setModal]         = useState(null);

    async function load() {
        try {
            const [c, v] = await Promise.all([api.get("/customers"), api.get("/vendors")]);
            setCustomers(c.data);
            setVendors(v.data);
        } catch {
            toast.error("Failed to load data");
        }
    }

    useEffect(() => { load(); }, []);

    async function saveContact(form) {
        const { type, editing } = modal;
        const url = `/${type}s`;
        try {
            if (editing) {
                await api.put(`${url}/${editing.id}`, form);
                toast.success(`${type === "customer" ? "Customer" : "Vendor"} updated`);
            } else {
                await api.post(url, form);
                toast.success(`${type === "customer" ? "Customer" : "Vendor"} added`);
            }
            setModal(null);
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
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#181a20] border border-white/10 p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Customers</div>
                    <div className="text-2xl font-bold font-mono text-amber-400">{customers.length}</div>
                </div>
                <div className="bg-[#181a20] border border-white/10 p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Vendors</div>
                    <div className="text-2xl font-bold font-mono text-blue-400">{vendors.length}</div>
                </div>
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
                            onAdd={() => setModal({ type: "customer", editing: null })}
                            onEdit={(c) => setModal({ type: "customer", editing: c })}
                            onDelete={(c) => deleteContact("customer", c)}
                        />
                    )}
                    {tab === "vendors" && (
                        <VendorsTab
                            vendors={vendors}
                            onAdd={() => setModal({ type: "vendor", editing: null })}
                            onEdit={(v) => setModal({ type: "vendor", editing: v })}
                            onDelete={(v) => deleteContact("vendor", v)}
                        />
                    )}
                </div>
            </div>

            {/* Contact Modal */}
            {modal && (
                <ContactModal
                    title={`${modal.editing ? "Edit" : "Add"} ${modal.type === "customer" ? "Customer" : "Vendor"}`}
                    initial={modal.editing}
                    onSave={saveContact}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    );
}
