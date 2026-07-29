import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { Sparkles, RefreshCw, Download, Package, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Warehouse, ChevronRight } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

const PIE_COLORS = ["#F59E0B","#10B981","#3B82F6","#EF4444","#A855F7","#EC4899","#06B6D4","#84CC16","#F97316","#FACC15"];

const CATEGORIES = [
    { id: "overview",   label: "Overview",   icon: Sparkles },
    { id: "inventory",  label: "Inventory",  icon: Package },
    { id: "inbound",    label: "Inbound",    icon: ArrowDownToLine },
    { id: "outbound",   label: "Outbound",   icon: ArrowUpFromLine },
    { id: "movement",   label: "Movement",   icon: ArrowLeftRight },
    { id: "warehouse",  label: "Warehouse",  icon: Warehouse },
];

const SUB_REPORTS = {
    inventory: [
        { id: "stock-on-hand", label: "Stock On Hand" },
        { id: "expiry",        label: "Batch / Lot Expiry" },
    ],
    inbound: [
        { id: "grn",              label: "Goods Receipt (GRN)" },
        { id: "pending-receipts", label: "Pending Receipts" },
    ],
    outbound: [
        { id: "shipments",        label: "Shipment Report" },
        { id: "pick-performance", label: "Pick Performance" },
    ],
    movement: [
        { id: "stock-movement",          label: "Stock Movement" },
        { id: "inventory-transactions",  label: "Inventory Transactions" },
        { id: "location-transfers",      label: "Location Transfers" },
    ],
    warehouse: [
        { id: "bin-utilization",    label: "Bin Utilization" },
        { id: "warehouse-capacity", label: "Warehouse Capacity" },
        { id: "location-occupancy", label: "Location Occupancy" },
        { id: "empty-locations",    label: "Empty Locations" },
    ],
};

function exportCSV(rows, filename) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = filename + ".csv";
    a.click();
}

function ReportShell({ title, subtitle, onExport, loading, children }) {
    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="font-mono text-[10px] tracking-[0.2em] text-amber-400 uppercase">// REPORT</div>
                    <h2 className="text-xl font-bold mt-0.5">{title}</h2>
                    {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                </div>
                {onExport && (
                    <button onClick={onExport} className="flex items-center gap-2 px-3 py-2 border border-white/10 hover:border-amber-500/40 text-xs text-gray-400 hover:text-amber-400 transition-colors">
                        <Download size={12} /> Export CSV
                    </button>
                )}
            </div>
            {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-600 font-mono text-xs animate-pulse">
                    // LOADING DATA...
                </div>
            ) : children}
        </div>
    );
}

function FilterBar({ children }) {
    return (
        <div className="flex flex-wrap gap-3 p-4 bg-[#111317] border border-white/10 text-xs">
            {children}
        </div>
    );
}

function FilterInput({ label, type = "text", value, onChange, placeholder }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className="bg-[#090a0c] border border-white/10 px-3 py-1.5 text-xs font-mono min-w-[140px] focus:border-amber-500/40 outline-none" />
        </label>
    );
}

function FilterSelect({ label, value, onChange, options }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
            <select value={value} onChange={e => onChange(e.target.value)}
                className="bg-[#090a0c] border border-white/10 px-3 py-1.5 text-xs font-mono min-w-[140px] focus:border-amber-500/40 outline-none">
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </label>
    );
}

function SummaryCard({ label, value, sub, color = "amber" }) {
    const c = { amber: "text-amber-400", emerald: "text-emerald-400", blue: "text-blue-400", red: "text-red-400", gray: "text-gray-400" };
    return (
        <div className="bg-[#181a20] border border-white/10 p-4">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{label}</div>
            <div className={`text-2xl font-bold font-mono ${c[color]}`}>{value ?? "—"}</div>
            {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
        </div>
    );
}

function DataTable({ cols, rows, emptyMsg = "No data" }) {
    if (!rows.length) return <div className="text-center py-12 text-gray-600 font-mono text-xs">{emptyMsg}</div>;
    return (
        <div className="overflow-x-auto border border-white/10">
            <table className="w-full text-xs">
                <thead className="bg-[#111317]">
                    <tr>
                        {cols.map((c, i) => (
                            <th key={i} className={`py-2.5 px-3 text-[10px] uppercase tracking-widest text-gray-500 font-medium ${c.right ? "text-right" : "text-left"} whitespace-nowrap`}>
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02]">
                            {cols.map((c, j) => {
                                const val = c.render ? c.render(row) : (row[c.key] ?? "—");
                                return (
                                    <td key={j} className={`py-2 px-3 ${c.mono ? "font-mono" : ""} ${c.right ? "text-right" : ""} ${c.className || ""}`}>
                                        {val}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="px-3 py-2 border-t border-white/5 text-[10px] text-gray-600 font-mono">{rows.length} rows</div>
        </div>
    );
}

function fmt(ts) { return ts ? ts.slice(0, 16).replace("T", " ") : "—"; }
function fmtDate(d) { return d ? d.slice(0, 10) : "—"; }

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewPanel() {
    const [top, setTop] = useState([]);
    const [cats, setCats] = useState([]);
    const [insights, setInsights] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        Promise.all([api.get("/reports/top-skus"), api.get("/reports/category-distribution")])
            .then(([a, b]) => { setTop(a.data); setCats(b.data); });
    }, []);

    return (
        <div className="space-y-5">
            <div className="border border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-transparent p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-500/20 flex items-center justify-center text-amber-400"><Sparkles size={18} /></div>
                        <div>
                            <div className="font-mono text-[10px] tracking-[0.2em] text-amber-400 uppercase">// AI OPS ANALYST</div>
                            <h3 className="font-semibold mt-0.5">AI Operations Intelligence</h3>
                        </div>
                    </div>
                    <button onClick={async () => { setBusy(true); try { const r = await api.post("/reports/ai-insights"); setInsights(r.data.insights); } catch { setInsights("AI service unavailable."); } finally { setBusy(false); } }} disabled={busy}
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60">
                        <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                        {busy ? "Analyzing..." : insights ? "Regenerate" : "Generate Report"}
                    </button>
                </div>
                {insights ? (
                    <pre className="font-mono text-xs text-gray-200 whitespace-pre-wrap leading-relaxed bg-[#090a0c]/40 border border-white/5 p-4">{insights}</pre>
                ) : (
                    <div className="font-mono text-xs text-gray-500 italic">// Click "Generate Report" to summon analyst output...</div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[#181a20] border border-white/10 p-5">
                    <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase mb-1">// TOP MOVING SKUs</div>
                    <h3 className="font-semibold mb-4">Movement Volume</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={top.map(t => ({ name: t.sku.sku_code, moved: t.moved }))} layout="vertical" margin={{ left: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis type="number" stroke="#6b7280" fontSize={10} tick={{ fontFamily: "monospace" }} />
                                <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={10} tick={{ fontFamily: "monospace" }} width={90} />
                                <Tooltip contentStyle={{ background: "#111317", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "monospace", fontSize: 11 }} />
                                <Bar dataKey="moved" fill="#F59E0B" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-[#181a20] border border-white/10 p-5">
                    <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase mb-1">// CATEGORY DISTRIBUTION</div>
                    <h3 className="font-semibold mb-4">SKU Mix</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={cats} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2} label={e => e.category} labelLine={false}>
                                    {cats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#0a0a0c" />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: "#111317", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "monospace", fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-[#181a20] border border-white/10 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-[#111317]">
                        <tr>
                            {["Rank","SKU","Name","Category","Units Moved"].map((h,i) => (
                                <th key={i} className={`py-2.5 px-4 text-[10px] uppercase tracking-widest text-gray-500 ${i===4?"text-right":"text-left"}`}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {top.map((t, i) => (
                            <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                                <td className="py-2.5 px-4 font-mono text-amber-400">#{i+1}</td>
                                <td className="py-2.5 px-4 font-mono">{t.sku.sku_code}</td>
                                <td className="py-2.5 px-4">{t.sku.name}</td>
                                <td className="py-2.5 px-4 text-gray-400">{t.sku.category}</td>
                                <td className="py-2.5 px-4 font-mono text-right">{t.moved}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Stock On Hand ─────────────────────────────────────────────────────────────
function StockOnHand() {
    const [view, setView] = useState("sku");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.get(`/reports/stock-on-hand?view=${view}`); setRows(r.data); }
        finally { setLoading(false); }
    }, [view]);

    useEffect(() => { load(); }, [load]);

    const colsBySku = [
        { key: "sku_code", label: "SKU Code", mono: true, className: "text-amber-400" },
        { key: "sku_name", label: "Name" },
        { key: "category", label: "Category", className: "text-gray-400" },
        { key: "unit", label: "Unit", mono: true },
        { key: "total_qty", label: "Qty On Hand", mono: true, right: true, className: "text-amber-400" },
        { key: "locations", label: "Locations", mono: true, right: true },
        { key: "earliest_expiry", label: "Earliest Expiry", mono: true, render: r => fmtDate(r.earliest_expiry) || "—" },
    ];
    const colsByLoc = [
        { key: "location", label: "Location", mono: true, className: "text-amber-400" },
        { key: "zone", label: "Zone", mono: true },
        { key: "zone_name", label: "Zone Name" },
        { key: "sku_code", label: "SKU", mono: true },
        { key: "sku_name", label: "Name" },
        { key: "batch_no", label: "Batch", mono: true, render: r => r.batch_no || "—" },
        { key: "expiry_date", label: "Expiry", mono: true, render: r => fmtDate(r.expiry_date) || "—" },
        { key: "qty", label: "Qty", mono: true, right: true, className: "text-amber-400" },
    ];
    const colsByBatch = [
        { key: "sku_code", label: "SKU", mono: true, className: "text-amber-400" },
        { key: "sku_name", label: "Name" },
        { key: "batch_no", label: "Batch No", mono: true },
        { key: "manufacture_date", label: "Mfg Date", mono: true, render: r => fmtDate(r.manufacture_date) || "—" },
        { key: "expiry_date", label: "Expiry Date", mono: true, render: r => fmtDate(r.expiry_date) || "—" },
        { key: "bag_color", label: "Color", render: r => r.bag_color || "—" },
        { key: "qty", label: "Qty", mono: true, right: true, className: "text-amber-400" },
        { key: "location_count", label: "Locations", mono: true, right: true },
    ];
    const colsMap = { sku: colsBySku, location: colsByLoc, batch: colsByBatch };

    return (
        <ReportShell title="Stock On Hand" subtitle="Current on-hand inventory" onExport={() => exportCSV(rows, `stock-on-hand-${view}`)} loading={loading}>
            <FilterBar>
                {[["sku","By SKU"],["location","By Location"],["batch","By Batch/Lot"]].map(([v,l]) => (
                    <button key={v} onClick={() => setView(v)}
                        className={`px-3 py-1.5 text-xs font-mono border transition-colors ${view===v ? "border-amber-500 text-amber-400 bg-amber-500/10" : "border-white/10 text-gray-400 hover:border-white/30"}`}>
                        {l}
                    </button>
                ))}
            </FilterBar>
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Total SKUs" value={view==="sku" ? rows.length : "—"} />
                <SummaryCard label="Total Qty" value={rows.reduce((s,r) => s + (Number(r.total_qty||r.qty||0)), 0).toLocaleString()} color="emerald" />
                <SummaryCard label="Records" value={rows.length} color="blue" />
            </div>
            <DataTable cols={colsMap[view]} rows={rows} emptyMsg="No stock on hand" />
        </ReportShell>
    );
}

// ─── Expiry Report ─────────────────────────────────────────────────────────────
function ExpiryReport() {
    const [days, setDays] = useState(30);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.get(`/reports/expiry?days=${days}`); setRows(r.data); }
        finally { setLoading(false); }
    }, [days]);

    useEffect(() => { load(); }, [load]);

    const daysDiff = (d) => {
        if (!d) return null;
        const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
        return diff;
    };

    const cols = [
        { key: "sku_code", label: "SKU", mono: true, className: "text-amber-400" },
        { key: "sku_name", label: "Name" },
        { key: "batch_no", label: "Batch", mono: true, render: r => r.batch_no || "—" },
        { key: "location", label: "Location", mono: true },
        { key: "expiry_date", label: "Expiry Date", mono: true, render: r => fmtDate(r.expiry_date) },
        {
            label: "Status", render: r => {
                const d = daysDiff(r.expiry_date);
                if (d === null) return "—";
                if (d < 0) return <span className="text-red-400 font-mono font-bold">EXPIRED ({Math.abs(d)}d ago)</span>;
                if (d <= 30) return <span className="text-red-400 font-mono">⚠ {d}d left</span>;
                if (d <= 60) return <span className="text-amber-400 font-mono">⚡ {d}d left</span>;
                return <span className="text-emerald-400 font-mono">{d}d left</span>;
            }
        },
        { key: "qty", label: "Qty", mono: true, right: true, className: "text-amber-400" },
    ];

    const label = days === 0 ? "Expired Items" : `Expiring within ${days} days`;

    return (
        <ReportShell title="Batch / Lot Expiry" subtitle={label} onExport={() => exportCSV(rows, `expiry-${days}d`)} loading={loading}>
            <FilterBar>
                {[[0,"Expired"],[30,"30 Days"],[60,"60 Days"],[90,"90 Days"]].map(([v,l]) => (
                    <button key={v} onClick={() => setDays(v)}
                        className={`px-3 py-1.5 text-xs font-mono border transition-colors ${days===v ? "border-amber-500 text-amber-400 bg-amber-500/10" : "border-white/10 text-gray-400 hover:border-white/30"}`}>
                        {l}
                    </button>
                ))}
            </FilterBar>
            <div className="grid grid-cols-2 gap-3">
                <SummaryCard label={days === 0 ? "Expired Batches" : "Affected Batches"} value={rows.length} color={rows.length > 0 ? "red" : "emerald"} />
                <SummaryCard label="Total Qty at Risk" value={rows.reduce((s,r) => s + Number(r.qty||0), 0).toLocaleString()} color={rows.length > 0 ? "red" : "emerald"} />
            </div>
            <DataTable cols={cols} rows={rows} emptyMsg={days === 0 ? "No expired stock" : `No items expiring within ${days} days`} />
        </ReportShell>
    );
}

// ─── GRN ───────────────────────────────────────────────────────────────────────
function GRNReport() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (dateFrom) p.set("date_from", dateFrom);
            if (dateTo) p.set("date_to", dateTo);
            const r = await api.get(`/reports/grn?${p}`);
            setRows(r.data);
        } finally { setLoading(false); }
    }, [dateFrom, dateTo]);

    useEffect(() => { load(); }, []);

    const cols = [
        { key: "po_number", label: "PO Number", mono: true, className: "text-amber-400" },
        { key: "vendor_name", label: "Vendor / Supplier" },
        { key: "created_at", label: "Received Date", mono: true, render: r => fmt(r.completed_at || r.created_at) },
        { key: "expected_date", label: "Expected Date", mono: true, render: r => fmtDate(r.expected_date) },
        { key: "line_count", label: "Lines", mono: true, right: true },
        { key: "total_qty", label: "Total Qty", mono: true, right: true, className: "text-emerald-400" },
        { key: "created_by", label: "Received By", className: "text-gray-400" },
    ];

    return (
        <ReportShell title="Goods Receipt Report (GRN)" subtitle="Completed inbound receipts" onExport={() => exportCSV(rows, "grn")} loading={loading}>
            <FilterBar>
                <FilterInput label="From Date" type="date" value={dateFrom} onChange={setDateFrom} />
                <FilterInput label="To Date" type="date" value={dateTo} onChange={setDateTo} />
                <button onClick={load} className="self-end px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold">Apply</button>
            </FilterBar>
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Total GRNs" value={rows.length} />
                <SummaryCard label="Total Lines" value={rows.reduce((s,r) => s + Number(r.line_count||0), 0)} color="blue" />
                <SummaryCard label="Total Qty Received" value={rows.reduce((s,r) => s + Number(r.total_qty||0), 0).toLocaleString()} color="emerald" />
            </div>
            <DataTable cols={cols} rows={rows} emptyMsg="No completed receipts" />
        </ReportShell>
    );
}

// ─── Pending Receipts ──────────────────────────────────────────────────────────
function PendingReceipts() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        api.get("/reports/pending-receipts").then(r => setRows(r.data)).finally(() => setLoading(false));
    }, []);

    const cols = [
        { key: "po_number", label: "PO Number", mono: true, className: "text-amber-400" },
        { key: "vendor_name", label: "Vendor / Supplier" },
        { key: "expected_date", label: "Expected Date", mono: true, render: r => fmtDate(r.expected_date) },
        {
            label: "Status", render: r => r.timeliness === "overdue"
                ? <span className="text-red-400 font-mono font-bold">OVERDUE</span>
                : <span className="text-emerald-400 font-mono">On Time</span>
        },
        { key: "line_count", label: "Lines", mono: true, right: true },
        { key: "expected_qty", label: "Expected Qty", mono: true, right: true, className: "text-amber-400" },
        { key: "created_by", label: "Created By", className: "text-gray-400" },
    ];

    const overdue = rows.filter(r => r.timeliness === "overdue").length;

    return (
        <ReportShell title="Pending Receipts" subtitle="Purchase orders awaiting receiving" onExport={() => exportCSV(rows, "pending-receipts")} loading={loading}>
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Pending POs" value={rows.length} color="amber" />
                <SummaryCard label="Overdue" value={overdue} color={overdue > 0 ? "red" : "emerald"} />
                <SummaryCard label="On Time" value={rows.length - overdue} color="emerald" />
            </div>
            <DataTable cols={cols} rows={rows} emptyMsg="No pending purchase orders" />
        </ReportShell>
    );
}

// ─── Shipments ─────────────────────────────────────────────────────────────────
function ShipmentsReport() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [status, setStatus] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (dateFrom) p.set("date_from", dateFrom);
            if (dateTo) p.set("date_to", dateTo);
            if (status) p.set("status", status);
            const r = await api.get(`/reports/shipments?${p}`);
            setRows(r.data);
        } finally { setLoading(false); }
    }, [dateFrom, dateTo, status]);

    useEffect(() => { load(); }, []);

    const STATUS_COLORS = { pending: "text-gray-400", picking: "text-blue-400", packing: "text-amber-400", shipped: "text-emerald-400" };

    const cols = [
        { key: "so_number", label: "SO Number", mono: true, className: "text-amber-400" },
        { key: "customer_name", label: "Customer" },
        { key: "status", label: "Status", render: r => <span className={`font-mono uppercase text-[10px] ${STATUS_COLORS[r.status]||"text-gray-400"}`}>{r.status}</span> },
        { key: "created_at", label: "Date", mono: true, render: r => fmt(r.created_at) },
        { key: "line_count", label: "Lines", mono: true, right: true },
        { key: "total_qty", label: "Total Qty", mono: true, right: true, className: "text-amber-400" },
        { key: "created_by", label: "Created By", className: "text-gray-400" },
    ];

    const shipped = rows.filter(r => r.status === "shipped");

    return (
        <ReportShell title="Shipment Report" subtitle="Outbound sales orders" onExport={() => exportCSV(rows, "shipments")} loading={loading}>
            <FilterBar>
                <FilterInput label="From Date" type="date" value={dateFrom} onChange={setDateFrom} />
                <FilterInput label="To Date" type="date" value={dateTo} onChange={setDateTo} />
                <FilterSelect label="Status" value={status} onChange={setStatus}
                    options={[{value:"",label:"All Statuses"},{value:"pending",label:"Pending"},{value:"picking",label:"Picking"},{value:"packing",label:"Packing"},{value:"shipped",label:"Shipped"}]} />
                <button onClick={load} className="self-end px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold">Apply</button>
            </FilterBar>
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Total Orders" value={rows.length} />
                <SummaryCard label="Shipped" value={shipped.length} color="emerald" />
                <SummaryCard label="Total Qty" value={rows.reduce((s,r) => s + Number(r.total_qty||0), 0).toLocaleString()} color="blue" />
            </div>
            <DataTable cols={cols} rows={rows} emptyMsg="No shipments found" />
        </ReportShell>
    );
}

// ─── Pick Performance ──────────────────────────────────────────────────────────
function PickPerformance() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        api.get("/reports/pick-performance").then(r => setRows(r.data)).finally(() => setLoading(false));
    }, []);

    const avgAccuracy = rows.length ? (rows.reduce((s,r) => s + Number(r.accuracy_pct||0), 0) / rows.length).toFixed(1) : "—";

    const cols = [
        { key: "so_number", label: "SO Number", mono: true, className: "text-amber-400" },
        { key: "customer_name", label: "Customer" },
        { key: "sku_code", label: "SKU", mono: true },
        { key: "sku_name", label: "Name" },
        { key: "ordered_qty", label: "Ordered", mono: true, right: true },
        { key: "picked_qty", label: "Picked", mono: true, right: true, className: "text-emerald-400" },
        {
            label: "Accuracy", right: true, render: r => {
                const p = Number(r.accuracy_pct || 0);
                return <span className={`font-mono font-bold ${p >= 100 ? "text-emerald-400" : p >= 80 ? "text-amber-400" : "text-red-400"}`}>{p}%</span>;
            }
        },
        { key: "status", label: "Status", render: r => <span className="font-mono text-[10px] text-gray-400 uppercase">{r.status}</span> },
    ];

    return (
        <ReportShell title="Pick List Performance" subtitle="Picked vs ordered quantity accuracy" onExport={() => exportCSV(rows, "pick-performance")} loading={loading}>
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Order Lines" value={rows.length} />
                <SummaryCard label="Avg Accuracy" value={avgAccuracy !== "—" ? `${avgAccuracy}%` : "—"} color={Number(avgAccuracy) >= 95 ? "emerald" : "amber"} />
                <SummaryCard label="Fully Picked" value={rows.filter(r => Number(r.accuracy_pct) >= 100).length} color="emerald" />
            </div>
            <DataTable cols={cols} rows={rows} emptyMsg="No pick data available" />
        </ReportShell>
    );
}

// ─── Stock Movement ────────────────────────────────────────────────────────────
function StockMovement() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [movType, setMovType] = useState("");
    const [skuSearch, setSkuSearch] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (dateFrom) p.set("date_from", dateFrom);
            if (dateTo) p.set("date_to", dateTo);
            if (movType) p.set("mov_type", movType);
            if (skuSearch.trim()) p.set("sku_search", skuSearch.trim());
            const r = await api.get(`/reports/stock-movement?${p}`);
            setRows(r.data);
        } finally { setLoading(false); }
    }, [dateFrom, dateTo, movType, skuSearch]);

    useEffect(() => { load(); }, []);

    const TYPE_STYLE = { inbound: "text-emerald-400", outbound: "text-red-400", transfer: "text-blue-400" };

    const cols = [
        { label: "Type", render: r => <span className={`font-mono text-[10px] uppercase font-bold ${TYPE_STYLE[r.type]||"text-gray-400"}`}>{r.type}</span> },
        { key: "sku_code", label: "SKU", mono: true, className: "text-amber-400" },
        { key: "sku_name", label: "Name" },
        { key: "location", label: "Location", mono: true, className: "text-gray-400" },
        { key: "qty", label: "Qty", mono: true, right: true, className: "text-amber-400" },
        { key: "ref", label: "Ref", mono: true, render: r => r.ref?.slice(0,20)||"—" },
        { key: "batch_no", label: "Batch", mono: true, render: r => r.batch_no || "—" },
        { key: "timestamp", label: "Time", mono: true, render: r => fmt(r.timestamp) },
    ];

    const inCount = rows.filter(r => r.type==="inbound").reduce((s,r) => s + Number(r.qty||0), 0);
    const outCount = rows.filter(r => r.type==="outbound").reduce((s,r) => s + Number(r.qty||0), 0);
    const xferCount = rows.filter(r => r.type==="transfer").length;

    return (
        <ReportShell title="Stock Movement Report" subtitle="All inbound, outbound and transfer movements" onExport={() => exportCSV(rows, "stock-movement")} loading={loading}>
            <FilterBar>
                <FilterInput label="From Date" type="date" value={dateFrom} onChange={setDateFrom} />
                <FilterInput label="To Date" type="date" value={dateTo} onChange={setDateTo} />
                <FilterSelect label="Type" value={movType} onChange={setMovType}
                    options={[{value:"",label:"All Types"},{value:"inbound",label:"Inbound"},{value:"outbound",label:"Outbound"},{value:"transfer",label:"Transfer"}]} />
                <FilterInput label="Product" value={skuSearch} onChange={setSkuSearch} placeholder="SKU code or name…" />
                <button onClick={load} className="self-end px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold">Apply</button>
            </FilterBar>
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Inbound Qty" value={inCount.toLocaleString()} color="emerald" />
                <SummaryCard label="Outbound Qty" value={outCount.toLocaleString()} color="red" />
                <SummaryCard label="Transfers" value={xferCount} color="blue" />
            </div>
            <DataTable cols={cols} rows={rows} emptyMsg="No movement data" />
        </ReportShell>
    );
}

// ─── Inventory Transactions ────────────────────────────────────────────────────
function InventoryTransactions() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (dateFrom) p.set("date_from", dateFrom);
            if (dateTo) p.set("date_to", dateTo);
            const r = await api.get(`/reports/inventory-transactions?${p}`);
            setRows(r.data);
        } finally { setLoading(false); }
    }, [dateFrom, dateTo]);

    useEffect(() => { load(); }, []);

    const TYPE_STYLE = { inbound: "text-emerald-400", outbound: "text-red-400" };

    const cols = [
        { label: "Type", render: r => <span className={`font-mono text-[10px] uppercase font-bold ${TYPE_STYLE[r.type]||"text-gray-400"}`}>{r.type}</span> },
        { key: "timestamp", label: "Timestamp", mono: true, render: r => fmt(r.timestamp) },
        { key: "sku_code", label: "SKU", mono: true, className: "text-amber-400" },
        { key: "sku_name", label: "Name" },
        { key: "location", label: "Location", mono: true },
        { key: "zone", label: "Zone", mono: true, className: "text-gray-400" },
        { key: "qty", label: "Qty", mono: true, right: true, className: "text-amber-400" },
        { key: "ref", label: "Ref", mono: true, render: r => r.ref?.slice(0,20)||"—" },
        { key: "batch_no", label: "Batch", mono: true, render: r => r.batch_no || "—" },
    ];

    return (
        <ReportShell title="Inventory Transaction Report" subtitle="Complete audit trail of all stock movements" onExport={() => exportCSV(rows, "inventory-transactions")} loading={loading}>
            <FilterBar>
                <FilterInput label="From Date" type="date" value={dateFrom} onChange={setDateFrom} />
                <FilterInput label="To Date" type="date" value={dateTo} onChange={setDateTo} />
                <button onClick={load} className="self-end px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold">Apply</button>
            </FilterBar>
            <SummaryCard label="Total Transactions" value={rows.length} />
            <DataTable cols={cols} rows={rows} emptyMsg="No transactions found" />
        </ReportShell>
    );
}

// ─── Location Transfers ────────────────────────────────────────────────────────
function LocationTransfers() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (dateFrom) p.set("date_from", dateFrom);
            if (dateTo) p.set("date_to", dateTo);
            const r = await api.get(`/reports/location-transfers?${p}`);
            setRows(r.data);
        } finally { setLoading(false); }
    }, [dateFrom, dateTo]);

    useEffect(() => { load(); }, []);

    const cols = [
        { key: "sku_code", label: "SKU", mono: true, className: "text-amber-400" },
        { key: "sku_name", label: "Name" },
        { key: "pallet_code", label: "Pallet", mono: true, render: r => r.pallet_code || "—" },
        { key: "from_code", label: "From", mono: true, className: "text-red-400" },
        { key: "to_code", label: "To", mono: true, className: "text-emerald-400" },
        { key: "qty", label: "Qty", mono: true, right: true, className: "text-amber-400" },
        { key: "bag_color", label: "Color", render: r => r.bag_color || "—" },
        { key: "status", label: "Status", render: r => <span className={`font-mono text-[10px] uppercase ${r.status==="confirmed"?"text-emerald-400":"text-amber-400"}`}>{r.status}</span> },
        { key: "transferred_by", label: "By", className: "text-gray-400" },
        { key: "transferred_at", label: "Time", mono: true, render: r => fmt(r.transferred_at) },
    ];

    return (
        <ReportShell title="Location Transfer Report" subtitle="Bin-to-bin pallet movements" onExport={() => exportCSV(rows, "location-transfers")} loading={loading}>
            <FilterBar>
                <FilterInput label="From Date" type="date" value={dateFrom} onChange={setDateFrom} />
                <FilterInput label="To Date" type="date" value={dateTo} onChange={setDateTo} />
                <button onClick={load} className="self-end px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold">Apply</button>
            </FilterBar>
            <DataTable cols={cols} rows={rows} emptyMsg="No transfers found" />
        </ReportShell>
    );
}

// ─── Bin Utilization ──────────────────────────────────────────────────────────
function BinUtilization() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        api.get("/reports/bin-utilization").then(r => setData(r.data)).finally(() => setLoading(false));
    }, []);

    if (!data) return null;
    const { summary, zones } = data;

    const cols = [
        { key: "zone", label: "Zone", mono: true, className: "text-amber-400" },
        { key: "zone_name", label: "Zone Name" },
        { key: "total", label: "Total Bins", mono: true, right: true },
        { key: "occupied", label: "Occupied", mono: true, right: true, className: "text-amber-400" },
        { key: "empty", label: "Empty", mono: true, right: true, className: "text-emerald-400" },
        {
            label: "Utilization %", right: true, render: r => {
                const p = Number(r.pct || 0);
                return (
                    <div className="flex items-center gap-2 justify-end">
                        <div className="w-20 h-1.5 bg-white/5">
                            <div className={`h-full ${p > 80 ? "bg-red-500" : p > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${p}%` }} />
                        </div>
                        <span className="font-mono text-xs">{p}%</span>
                    </div>
                );
            }
        },
    ];

    return (
        <ReportShell title="Bin Utilization Report" subtitle="Occupied vs available storage bins" onExport={() => exportCSV(zones, "bin-utilization")} loading={loading}>
            <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="Total Bins" value={summary.total} />
                <SummaryCard label="Occupied" value={summary.occupied} color="amber" />
                <SummaryCard label="Empty" value={summary.empty} color="emerald" />
                <SummaryCard label="Utilization" value={`${summary.pct || 0}%`} color={Number(summary.pct) > 80 ? "red" : "blue"} />
            </div>
            <DataTable cols={cols} rows={zones} emptyMsg="No location data" />
        </ReportShell>
    );
}

// ─── Warehouse Capacity ────────────────────────────────────────────────────────
function WarehouseCapacity() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        api.get("/reports/warehouse-capacity").then(r => setData(r.data)).finally(() => setLoading(false));
    }, []);

    if (!data) return null;
    const { zones, totals } = data;

    const cols = [
        { key: "zone", label: "Zone", mono: true, className: "text-amber-400" },
        { key: "zone_name", label: "Zone Name" },
        { key: "total_locations", label: "Locations", mono: true, right: true },
        { key: "total_positions", label: "Total Positions", mono: true, right: true },
        { key: "occupied_positions", label: "Occupied", mono: true, right: true, className: "text-amber-400" },
        { key: "available_positions", label: "Available", mono: true, right: true, className: "text-emerald-400" },
        {
            label: "Capacity %", right: true, render: r => {
                const p = Number(r.utilization_pct || 0);
                return (
                    <div className="flex items-center gap-2 justify-end">
                        <div className="w-20 h-1.5 bg-white/5">
                            <div className={`h-full ${p > 80 ? "bg-red-500" : p > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(p,100)}%` }} />
                        </div>
                        <span className="font-mono text-xs">{p}%</span>
                    </div>
                );
            }
        },
    ];

    return (
        <ReportShell title="Warehouse Capacity Report" subtitle="Space utilization by zone" onExport={() => exportCSV(zones, "warehouse-capacity")} loading={loading}>
            <div className="grid grid-cols-4 gap-3">
                <SummaryCard label="Total Positions" value={totals?.total_positions?.toLocaleString()} />
                <SummaryCard label="Occupied" value={totals?.occupied_positions?.toLocaleString()} color="amber" />
                <SummaryCard label="Available" value={totals?.available_positions?.toLocaleString()} color="emerald" />
                <SummaryCard label="Overall Utilization" value={`${totals?.utilization_pct || 0}%`} color={Number(totals?.utilization_pct) > 80 ? "red" : "blue"} />
            </div>
            <DataTable cols={cols} rows={zones} emptyMsg="No capacity data" />
        </ReportShell>
    );
}

// ─── Location Occupancy ────────────────────────────────────────────────────────
function LocationOccupancy() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [zone, setZone] = useState("");
    const [zones, setZones] = useState([]);

    useEffect(() => {
        api.get("/storage/zones").then(r => setZones(r.data || []));
        load();
    }, []);

    const load = async (z = zone) => {
        setLoading(true);
        try {
            const p = z ? `?zone=${z}` : "";
            const r = await api.get(`/reports/location-occupancy${p}`);
            setRows(r.data);
        } finally { setLoading(false); }
    };

    const cols = [
        { key: "code", label: "Location", mono: true, className: "text-amber-400" },
        { key: "zone", label: "Zone", mono: true },
        { key: "zone_name", label: "Zone Name", className: "text-gray-400" },
        { key: "row_label", label: "Row", mono: true },
        { key: "lane_number", label: "Lane", mono: true, right: true },
        { key: "level", label: "Level", mono: true, right: true },
        { label: "Status", render: r => r.status === "occupied"
            ? <span className="text-amber-400 font-mono text-[10px] uppercase font-bold">OCCUPIED</span>
            : <span className="text-emerald-400 font-mono text-[10px] uppercase">empty</span>
        },
        { key: "sku_code", label: "SKU", mono: true, render: r => r.sku_code || "—" },
        { key: "sku_name", label: "Name", render: r => r.sku_name || "—" },
        { key: "qty", label: "Qty", mono: true, right: true, render: r => r.qty > 0 ? r.qty : "—" },
        { key: "expiry_date", label: "Expiry", mono: true, render: r => fmtDate(r.expiry_date) || "—" },
    ];

    const occupied = rows.filter(r => r.status === "occupied").length;

    return (
        <ReportShell title="Location Occupancy Report" subtitle="Rack-wise inventory layout" onExport={() => exportCSV(rows, "location-occupancy")} loading={loading}>
            <FilterBar>
                <FilterSelect label="Zone" value={zone} onChange={v => { setZone(v); load(v); }}
                    options={[{value:"",label:"All Zones"}, ...zones.map(z => ({value:z.zone, label:`${z.zone} — ${z.name||""}`}))]} />
            </FilterBar>
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Total Locations" value={rows.length} />
                <SummaryCard label="Occupied" value={occupied} color="amber" />
                <SummaryCard label="Empty" value={rows.length - occupied} color="emerald" />
            </div>
            <DataTable cols={cols} rows={rows} emptyMsg="No location data" />
        </ReportShell>
    );
}

// ─── Empty Locations ───────────────────────────────────────────────────────────
function EmptyLocations() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [zone, setZone] = useState("");
    const [zones, setZones] = useState([]);

    useEffect(() => {
        api.get("/storage/zones").then(r => setZones(r.data || []));
        load();
    }, []);

    const load = async (z = zone) => {
        setLoading(true);
        try {
            const p = z ? `?zone=${z}` : "";
            const r = await api.get(`/reports/empty-locations${p}`);
            setRows(r.data);
        } finally { setLoading(false); }
    };

    const cols = [
        { key: "code", label: "Location", mono: true, className: "text-emerald-400" },
        { key: "zone", label: "Zone", mono: true },
        { key: "zone_name", label: "Zone Name", className: "text-gray-400" },
        { key: "row_label", label: "Row", mono: true },
        { key: "lane_number", label: "Lane", mono: true, right: true },
        { key: "level", label: "Level", mono: true, right: true },
        { key: "capacity", label: "Capacity", mono: true, right: true },
        { key: "rack_type", label: "Rack Type", render: r => r.rack_type || "—" },
    ];

    return (
        <ReportShell title="Empty Location Report" subtitle="Available storage locations" onExport={() => exportCSV(rows, "empty-locations")} loading={loading}>
            <FilterBar>
                <FilterSelect label="Zone" value={zone} onChange={v => { setZone(v); load(v); }}
                    options={[{value:"",label:"All Zones"}, ...zones.map(z => ({value:z.zone, label:`${z.zone} — ${z.name||""}`}))]} />
            </FilterBar>
            <SummaryCard label="Available Locations" value={rows.length} color="emerald" sub="Ready to receive stock" />
            <DataTable cols={cols} rows={rows} emptyMsg="No empty locations found" />
        </ReportShell>
    );
}

// ─── Report map ────────────────────────────────────────────────────────────────
const REPORT_COMPONENTS = {
    "stock-on-hand":         StockOnHand,
    "expiry":                ExpiryReport,
    "grn":                   GRNReport,
    "pending-receipts":      PendingReceipts,
    "shipments":             ShipmentsReport,
    "pick-performance":      PickPerformance,
    "stock-movement":        StockMovement,
    "inventory-transactions":InventoryTransactions,
    "location-transfers":    LocationTransfers,
    "bin-utilization":       BinUtilization,
    "warehouse-capacity":    WarehouseCapacity,
    "location-occupancy":    LocationOccupancy,
    "empty-locations":       EmptyLocations,
};

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Reports() {
    const [cat, setCat] = useState("overview");
    const [subReport, setSubReport] = useState(null);

    const handleCat = (id) => {
        setCat(id);
        const subs = SUB_REPORTS[id];
        setSubReport(subs ? subs[0].id : null);
    };

    const ActiveReport = subReport ? REPORT_COMPONENTS[subReport] : null;

    return (
        <div className="space-y-5">
            <div>
                <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                    // ANALYTICS // INTELLIGENCE
                </div>
                <h1 className="text-3xl font-bold tracking-tight mt-1">Reports & Analytics</h1>
            </div>

            {/* Category Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-white/10 pb-0">
                {CATEGORIES.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => handleCat(id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px
                            ${cat === id
                                ? "border-amber-500 text-amber-400"
                                : "border-transparent text-gray-500 hover:text-gray-300"}`}>
                        <Icon size={13} /> {label}
                    </button>
                ))}
            </div>

            {/* Sub-Report Pills */}
            {SUB_REPORTS[cat] && (
                <div className="flex flex-wrap gap-2">
                    {SUB_REPORTS[cat].map(({ id, label }) => (
                        <button key={id} onClick={() => setSubReport(id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-colors
                                ${subReport === id
                                    ? "border-amber-500/60 text-amber-400 bg-amber-500/10"
                                    : "border-white/10 text-gray-400 hover:border-white/30 hover:text-gray-200"}`}>
                            <ChevronRight size={11} /> {label}
                        </button>
                    ))}
                </div>
            )}

            {/* Content */}
            <div className="bg-[#181a20] border border-white/10 p-5">
                {cat === "overview" && <OverviewPanel />}
                {ActiveReport && <ActiveReport key={subReport} />}
            </div>
        </div>
    );
}
