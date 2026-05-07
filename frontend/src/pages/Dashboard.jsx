import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
    Package,
    DollarSign,
    AlertTriangle,
    Activity,
    Boxes,
    ArrowDownToLine,
    ArrowUpFromLine,
    TrendingUp,
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";

const formatCurrency = (n) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(n || 0);

export default function Dashboard() {
    const [s, setS] = useState(null);
    const [moves, setMoves] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const [a, b] = await Promise.all([
                    api.get("/dashboard/summary"),
                    api.get("/dashboard/movements?days=14"),
                ]);
                setS(a.data);
                setMoves(b.data);
            } catch (e) {
                console.error(e);
            }
        })();
    }, []);

    if (!s) {
        return (
            <div className="font-mono text-amber-400 text-sm tracking-widest">
                SCANNING TELEMETRY...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                    // OPERATIONS // OVERVIEW
                </div>
                <h1 className="text-3xl font-bold tracking-tight mt-1">
                    Command Dashboard
                </h1>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi
                    icon={Package}
                    label="Total SKUs"
                    value={s.total_skus}
                    sub={`${s.total_locations} bins active`}
                    testid="kpi-total-skus"
                />
                <Kpi
                    icon={DollarSign}
                    label="Stock Value"
                    value={formatCurrency(s.stock_value)}
                    sub="On-hand inventory"
                    accent="emerald"
                    testid="kpi-stock-value"
                />
                <Kpi
                    icon={AlertTriangle}
                    label="Low Stock"
                    value={s.low_stock}
                    sub={`${s.out_of_stock} out of stock`}
                    accent="red"
                    testid="kpi-low-stock"
                />
                <Kpi
                    icon={Boxes}
                    label="Utilization"
                    value={`${s.utilization}%`}
                    sub={`${s.pending_inbound} inbound · ${s.pending_outbound} outbound`}
                    accent="amber"
                    testid="kpi-utilization"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-[#181a20] border border-white/10 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="font-mono text-[10px] tracking-[0.2em] text-gray-500 uppercase">
                                // STOCK MOVEMENT // 14d
                            </div>
                            <h3 className="text-lg font-semibold">
                                Inbound vs Outbound
                            </h3>
                        </div>
                        <TrendingUp size={18} className="text-amber-400" />
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={moves}>
                                <defs>
                                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                                        <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="date"
                                    stroke="#6b7280"
                                    fontSize={10}
                                    tick={{ fontFamily: "JetBrains Mono" }}
                                    tickFormatter={(d) => d.slice(5)}
                                />
                                <YAxis stroke="#6b7280" fontSize={10} tick={{ fontFamily: "JetBrains Mono" }} />
                                <Tooltip
                                    contentStyle={{
                                        background: "#111317",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        fontFamily: "JetBrains Mono",
                                        fontSize: 11,
                                    }}
                                />
                                <Area type="monotone" dataKey="inbound" stroke="#10B981" fill="url(#g1)" strokeWidth={2} />
                                <Area type="monotone" dataKey="outbound" stroke="#F59E0B" fill="url(#g2)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-[#181a20] border border-white/10 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="font-mono text-[10px] tracking-[0.2em] text-gray-500 uppercase">
                                // ACTIVITY // LIVE
                            </div>
                            <h3 className="text-lg font-semibold">Recent Movements</h3>
                        </div>
                        <Activity size={18} className="text-emerald-400" />
                    </div>
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {s.recent_movements.length === 0 && (
                            <div className="text-sm text-gray-500">No movements yet.</div>
                        )}
                        {s.recent_movements.map((m, i) => (
                            <div
                                key={i}
                                data-testid={`movement-${i}`}
                                className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0"
                            >
                                <div
                                    className={`w-7 h-7 flex items-center justify-center shrink-0 ${
                                        m.type === "in"
                                            ? "bg-emerald-500/10 text-emerald-400"
                                            : "bg-amber-500/10 text-amber-400"
                                    }`}
                                >
                                    {m.type === "in" ? (
                                        <ArrowDownToLine size={14} />
                                    ) : (
                                        <ArrowUpFromLine size={14} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">
                                        {m.sku?.sku_code} · {m.sku?.name}
                                    </div>
                                    <div className="font-mono text-[11px] text-gray-500">
                                        {m.location?.code} · {m.qty} units · {m.ref}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatRow
                    icon={ArrowDownToLine}
                    label="Inbound Today"
                    value={s.inbound_today}
                    color="emerald"
                />
                <StatRow
                    icon={ArrowUpFromLine}
                    label="Outbound Today"
                    value={s.outbound_today}
                    color="amber"
                />
            </div>
        </div>
    );
}

function Kpi({ icon: Icon, label, value, sub, accent = "amber", testid }) {
    const colorMap = {
        amber: "text-amber-400",
        emerald: "text-emerald-400",
        red: "text-red-400",
    };
    return (
        <div className="bg-[#181a20] border border-white/10 p-5 kpi-glow transition-shadow" data-testid={testid}>
            <div className="flex items-start justify-between mb-3">
                <div className="font-mono text-[10px] tracking-[0.15em] text-gray-500 uppercase">
                    {label}
                </div>
                <Icon size={16} className={colorMap[accent]} />
            </div>
            <div className="font-mono text-3xl font-semibold tracking-tight text-white">
                {value}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">{sub}</div>
        </div>
    );
}

function StatRow({ icon: Icon, label, value, color }) {
    const cm = { emerald: "text-emerald-400 bg-emerald-500/10", amber: "text-amber-400 bg-amber-500/10" };
    return (
        <div className="bg-[#181a20] border border-white/10 p-4 flex items-center gap-4">
            <div className={`w-10 h-10 flex items-center justify-center ${cm[color]}`}>
                <Icon size={18} />
            </div>
            <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-gray-500">
                    {label}
                </div>
                <div className="font-mono text-2xl font-semibold">{value}</div>
            </div>
        </div>
    );
}
