import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Printer } from "lucide-react";

export default function PrintGRN() {
    const { id } = useParams();
    const [data, setData] = useState(null);

    useEffect(() => {
        api.get(`/inbound/${id}/grn`).then((r) => setData(r.data));
    }, [id]);

    if (!data) return <div className="p-12 text-center text-gray-500">Loading...</div>;

    const lineWeight = (it) =>
        it.sku?.weight_per_bag != null ? Number(it.sku.weight_per_bag) * (it.qty || 0) : null;
    const totalWeight = data.items.reduce((sum, it) => sum + (lineWeight(it) || 0), 0);
    const fmtKg = (n) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;

    return (
        <div className="bg-white text-black min-h-screen">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                    @page { size: A4; margin: 15mm; }
                }
                @media screen {
                    .doc { box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
                }
            `}</style>

            <div className="no-print bg-[#090a0c] text-white p-4 flex items-center justify-between">
                <div className="font-mono text-sm">// GRN — {data.po_number}</div>
                <button
                    onClick={() => window.print()}
                    data-testid="print-btn"
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-sm font-bold uppercase tracking-wider"
                >
                    <Printer size={14} /> Print / Save PDF
                </button>
            </div>

            <div className="doc max-w-4xl mx-auto bg-white p-12 my-6">
                <div className="flex items-start justify-between border-b-2 border-black pb-4 mb-6">
                    <div>
                        <div className="text-xs uppercase tracking-[0.3em] text-gray-500">FrostCore</div>
                        <h1 className="text-3xl font-bold mt-1">GOODS RECEIPT NOTE</h1>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-2xl font-bold">{data.po_number}</div>
                        <div className="text-xs text-gray-500 mt-1">
                            Status: <span className="font-semibold uppercase">{data.status}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-8">
                    <Field label="Supplier" value={data.supplier} />
                    <Field label="Expected Date" value={data.expected_date} />
                    <Field
                        label={data.status === "completed" ? "Received Date" : "Created"}
                        value={(data.completed_at || data.created_at || "").slice(0, 10)}
                    />
                </div>

                <div>
                    <div className="font-mono text-xs uppercase tracking-wider mb-2 border-b border-black pb-1">
                        ITEMS RECEIVED
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b-2 border-black">
                                <th className="text-left py-2 font-mono text-xs uppercase">SKU</th>
                                <th className="text-left py-2 font-mono text-xs uppercase">Description</th>
                                <th className="text-left py-2 font-mono text-xs uppercase">Bag</th>
                                <th className="text-left py-2 font-mono text-xs uppercase">Location</th>
                                <th className="text-left py-2 font-mono text-xs uppercase">Batch</th>
                                <th className="text-left py-2 font-mono text-xs uppercase">Expiry</th>
                                <th className="text-right py-2 font-mono text-xs uppercase">Qty</th>
                                <th className="text-right py-2 font-mono text-xs uppercase">Weight</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.items.map((it, i) => (
                                <tr key={i} className="border-b border-gray-300">
                                    <td className="py-2 font-mono">{it.sku?.sku_code}</td>
                                    <td className="py-2">{it.sku?.name}</td>
                                    <td className="py-2 font-mono text-xs">
                                        {it.bag_color || it.sku?.bag_color || "—"}
                                        {it.sku?.bags_per_pallet != null && (
                                            <span className="text-gray-500"> · {it.sku.bags_per_pallet}/plt</span>
                                        )}
                                    </td>
                                    <td className="py-2 font-mono text-xs">{it.location?.code}</td>
                                    <td className="py-2 font-mono text-xs">{it.batch_no || "—"}</td>
                                    <td className="py-2 font-mono text-xs">{it.expiry_date || "—"}</td>
                                    <td className="py-2 text-right font-mono">{it.qty}</td>
                                    <td className="py-2 text-right font-mono">
                                        {lineWeight(it) != null ? fmtKg(lineWeight(it)) : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-black font-bold">
                                <td className="py-2 font-mono text-xs uppercase" colSpan={6}>
                                    Total Weight
                                </td>
                                <td className="py-2 text-right font-mono">
                                    {data.items.reduce((s, it) => s + (it.qty || 0), 0)}
                                </td>
                                <td className="py-2 text-right font-mono">{fmtKg(totalWeight)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="grid grid-cols-2 gap-12 mt-16">
                    <div>
                        <div className="border-t border-black pt-2 text-xs uppercase tracking-widest">
                            Received By
                        </div>
                        <div className="text-sm mt-12 text-gray-500">Signature</div>
                    </div>
                    <div>
                        <div className="border-t border-black pt-2 text-xs uppercase tracking-widest">
                            Quality Check
                        </div>
                        <div className="text-sm mt-12 text-gray-500">Signature</div>
                    </div>
                </div>

                <div className="mt-8 text-[10px] text-gray-400 text-center">
                    Generated {new Date().toLocaleString()} · FrostCore
                </div>
            </div>
        </div>
    );
}

function Field({ label, value }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
            <div className="font-semibold mt-0.5">{value || "—"}</div>
        </div>
    );
}
