import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Printer } from "lucide-react";

export default function PrintPickList() {
    const { id } = useParams();
    const [data, setData] = useState(null);

    useEffect(() => {
        api.get(`/outbound/${id}/picklist`).then((r) => setData(r.data));
    }, [id]);

    if (!data) return <div className="p-12 text-center text-gray-500">Loading...</div>;

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
                <div className="font-mono text-sm">// PICK LIST — {data.so_number}</div>
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
                        <div className="text-xs uppercase tracking-[0.3em] text-gray-500">Warehouse OS</div>
                        <h1 className="text-3xl font-bold mt-1">PICK LIST</h1>
                        <div className="text-xs text-gray-500 mt-1">FEFO order — pick soonest expiry first</div>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-2xl font-bold">{data.so_number}</div>
                        <div className="text-xs text-gray-500 mt-1">
                            Status: <span className="font-semibold uppercase">{data.status}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8">
                    <Field label="Customer" value={data.customer} />
                    <Field label="Created" value={(data.created_at || "").slice(0, 10)} />
                </div>

                <div className="space-y-6">
                    {data.items.map((it, i) => (
                        <div key={i} className="border border-black p-4">
                            <div className="flex justify-between items-start mb-3 pb-2 border-b border-gray-300">
                                <div>
                                    <div className="font-mono text-xs text-gray-500 uppercase">
                                        Item {i + 1}
                                    </div>
                                    <div className="font-mono font-bold">{it.sku?.sku_code}</div>
                                    <div className="text-sm">{it.sku?.name}</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-xs text-gray-500 uppercase">
                                        Total Qty
                                    </div>
                                    <div className="font-mono text-2xl font-bold">{it.qty}</div>
                                </div>
                            </div>

                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="text-left py-1 px-2 font-mono text-xs uppercase">#</th>
                                        <th className="text-left py-1 px-2 font-mono text-xs uppercase">Pick From</th>
                                        <th className="text-left py-1 px-2 font-mono text-xs uppercase">Batch</th>
                                        <th className="text-left py-1 px-2 font-mono text-xs uppercase">Expiry</th>
                                        <th className="text-right py-1 px-2 font-mono text-xs uppercase">Qty</th>
                                        <th className="text-center py-1 px-2 font-mono text-xs uppercase">✓</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {it.pick_locations.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-2 px-2 text-center text-red-600 italic">
                                                No stock available
                                            </td>
                                        </tr>
                                    ) : (
                                        it.pick_locations.map((p, j) => (
                                            <tr key={j} className="border-b border-gray-200">
                                                <td className="py-1 px-2 font-mono">{j + 1}</td>
                                                <td className="py-1 px-2 font-mono">{p.location?.code}</td>
                                                <td className="py-1 px-2 font-mono text-xs">{p.batch_no || "—"}</td>
                                                <td className="py-1 px-2 font-mono text-xs">{p.expiry_date || "—"}</td>
                                                <td className="py-1 px-2 text-right font-mono">{p.qty}</td>
                                                <td className="py-1 px-2 text-center">☐</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-12 mt-16">
                    <div>
                        <div className="border-t border-black pt-2 text-xs uppercase tracking-widest">
                            Picked By
                        </div>
                        <div className="text-sm mt-12 text-gray-500">Signature</div>
                    </div>
                    <div>
                        <div className="border-t border-black pt-2 text-xs uppercase tracking-widest">
                            Verified By
                        </div>
                        <div className="text-sm mt-12 text-gray-500">Signature</div>
                    </div>
                </div>

                <div className="mt-8 text-[10px] text-gray-400 text-center">
                    Generated {new Date().toLocaleString()} · Warehouse OS Control Center
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
