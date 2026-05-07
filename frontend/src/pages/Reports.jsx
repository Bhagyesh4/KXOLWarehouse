import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Sparkles, RefreshCw } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";

const PIE_COLORS = ["#F59E0B", "#10B981", "#3B82F6", "#EF4444", "#A855F7", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#FACC15"];

export default function Reports() {
    const [top, setTop] = useState([]);
    const [cats, setCats] = useState([]);
    const [insights, setInsights] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        const [a, b] = await Promise.all([api.get("/reports/top-skus"), api.get("/reports/category-distribution")]);
        setTop(a.data);
        setCats(b.data);
    };

    useEffect(() => {
        load();
    }, []);

    const generateInsights = async () => {
        setBusy(true);
        try {
            const r = await api.post("/reports/ai-insights");
            setInsights(r.data.insights);
        } catch (e) {
            setInsights("Failed to generate insights.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <div className="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
                    // ANALYTICS // INTELLIGENCE
                </div>
                <h1 className="text-3xl font-bold tracking-tight mt-1">Reports & Analytics</h1>
            </div>

            {/* AI Insights */}
            <div className="border border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-transparent p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-amber-500/20 flex items-center justify-center text-amber-400">
                            <Sparkles size={18} />
                        </div>
                        <div>
                            <div className="font-mono text-[10px] tracking-[0.2em] text-amber-400 uppercase">
                                // CLAUDE SONNET 4.5 // OPS ANALYST
                            </div>
                            <h3 className="font-semibold mt-0.5">AI Operations Intelligence</h3>
                        </div>
                    </div>
                    <button
                        onClick={generateInsights}
                        disabled={busy}
                        data-testid="generate-insights-btn"
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                    >
                        <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                        {busy ? "Analyzing..." : insights ? "Regenerate" : "Generate Report"}
                    </button>
                </div>
                <div className={`relative ${busy ? "scanning" : ""}`}>
                    {insights ? (
                        <pre data-testid="ai-insights-text" className="font-mono text-xs text-gray-200 whitespace-pre-wrap leading-relaxed bg-[#090a0c]/40 border border-white/5 p-4">
                            {insights}
                        </pre>
                    ) : (
                        <div className="font-mono text-xs text-gray-500 italic">
                            // Click "Generate Report" to summon analyst output...
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top moving SKUs */}
                <div className="bg-[#181a20] border border-white/10 p-5">
                    <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                        // TOP MOVING SKUs
                    </div>
                    <h3 className="font-semibold mt-1 mb-4">Movement Volume</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={top.map((t) => ({ name: t.sku.sku_code, moved: t.moved }))} layout="vertical" margin={{ left: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis type="number" stroke="#6b7280" fontSize={10} tick={{ fontFamily: "JetBrains Mono" }} />
                                <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={10} tick={{ fontFamily: "JetBrains Mono" }} width={100} />
                                <Tooltip
                                    contentStyle={{
                                        background: "#111317",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        fontFamily: "JetBrains Mono",
                                        fontSize: 11,
                                    }}
                                />
                                <Bar dataKey="moved" fill="#F59E0B" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category distribution */}
                <div className="bg-[#181a20] border border-white/10 p-5">
                    <div className="font-mono text-[10px] tracking-widest text-gray-500 uppercase">
                        // CATEGORY DISTRIBUTION
                    </div>
                    <h3 className="font-semibold mt-1 mb-4">SKU Mix</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={cats}
                                    dataKey="count"
                                    nameKey="category"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={100}
                                    innerRadius={50}
                                    paddingAngle={2}
                                    label={(e) => e.category}
                                    labelLine={false}
                                >
                                    {cats.map((_, i) => (
                                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#0a0a0c" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background: "#111317",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        fontFamily: "JetBrains Mono",
                                        fontSize: 11,
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Top SKUs table */}
            <div className="bg-[#181a20] border border-white/10 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-[#111317] text-[10px] uppercase tracking-[0.15em] text-gray-500">
                        <tr>
                            <th className="text-left py-3 px-4">Rank</th>
                            <th className="text-left py-3 px-4">SKU</th>
                            <th className="text-left py-3 px-4">Name</th>
                            <th className="text-left py-3 px-4">Category</th>
                            <th className="text-right py-3 px-4">Units Moved</th>
                        </tr>
                    </thead>
                    <tbody>
                        {top.map((t, i) => (
                            <tr key={i} data-testid={`top-sku-row-${i}`} className="border-b border-white/5 hover:bg-white/5">
                                <td className="py-2.5 px-4 font-mono text-amber-400">#{i + 1}</td>
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
