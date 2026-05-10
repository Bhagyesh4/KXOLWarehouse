import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import Barcode from "react-barcode";
import { api } from "../lib/api";
import { Printer, ArrowLeft } from "lucide-react";

export default function PrintPalletLabels() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.get(`/inbound/${id}/grn`)
            .then((r) => setData(r.data))
            .catch(() => setError("Could not load order data."));
    }, [id]);

    if (error) return <div className="p-12 text-center text-red-500 font-mono">{error}</div>;
    if (!data) return <div className="p-12 text-center text-gray-500 font-mono">Loading labels…</div>;

    const items = data.items || [];
    const itemsWithBarcode = items.filter((it) => it.barcode);

    return (
        <div className="bg-gray-100 min-h-screen">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; margin: 0; }
                    .label-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 4mm;
                        padding: 6mm;
                    }
                    .label-card {
                        break-inside: avoid;
                        page-break-inside: avoid;
                        border: 1.5px solid #000;
                        background: white;
                    }
                    @page {
                        size: A4;
                        margin: 8mm;
                    }
                }
                @media screen {
                    .label-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 380px);
                        gap: 16px;
                        padding: 24px;
                        justify-content: center;
                    }
                }
                .label-card svg {
                    display: block;
                    margin: 0 auto;
                }
            `}</style>

            {/* Top toolbar */}
            <div className="no-print bg-[#090a0c] text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => window.history.back()}
                        className="text-gray-400 hover:text-white"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                            // PALLET LABELS
                        </div>
                        <div className="font-bold">{data.po_number} — {itemsWithBarcode.length} label{itemsWithBarcode.length !== 1 ? "s" : ""}</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-400 font-mono">
                        2 labels per row · A4
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 text-sm font-bold uppercase tracking-wider"
                    >
                        <Printer size={14} /> Print Labels
                    </button>
                </div>
            </div>

            {itemsWithBarcode.length === 0 ? (
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="text-center">
                        <div className="font-mono text-gray-400 mb-2">No pallet barcodes found.</div>
                        <div className="text-sm text-gray-500">Barcodes are auto-generated when a Purchase Order is created.</div>
                    </div>
                </div>
            ) : (
                <div className="label-grid">
                    {itemsWithBarcode.map((it, i) => (
                        <PalletLabel key={i} item={it} order={data} index={i} total={itemsWithBarcode.length} />
                    ))}
                </div>
            )}
        </div>
    );
}

function PalletLabel({ item, order, index, total }) {
    const sku = item.sku || {};
    const loc = item.location || {};

    return (
        <div
            className="label-card bg-white border border-gray-300"
            style={{ fontFamily: "monospace" }}
        >
            {/* Header band */}
            <div
                style={{
                    background: "#0d0e12",
                    color: "#f59e0b",
                    padding: "6px 10px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div style={{ fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                    WAREHOUSE OS · COLD STORAGE
                </div>
                <div style={{ fontSize: "9px", color: "#9ca3af", letterSpacing: "0.1em" }}>
                    PLT {index + 1}/{total}
                </div>
            </div>

            {/* Barcode section */}
            <div style={{ padding: "10px 8px 4px", textAlign: "center", background: "white" }}>
                <Barcode
                    value={item.barcode}
                    format="CODE128"
                    width={1.6}
                    height={52}
                    fontSize={11}
                    margin={4}
                    displayValue={true}
                    background="white"
                    lineColor="#000000"
                />
            </div>

            {/* Label body */}
            <div style={{ padding: "6px 10px 10px", borderTop: "1px solid #e5e7eb" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                    <tbody>
                        <LabelRow label="PO" value={order.po_number} bold />
                        <LabelRow label="Supplier" value={order.supplier} />
                        <LabelRow label="SKU" value={sku.sku_code || item.sku_id} bold accent />
                        <LabelRow label="Description" value={sku.name || "—"} />
                        <LabelRow label="Target Rack" value={loc.code || item.location_id} bold accent />
                        <LabelRow label="Qty" value={item.qty} bold />
                        {item.batch_no && <LabelRow label="Batch / Lot" value={item.batch_no} />}
                        {item.manufacture_date && <LabelRow label="MFG Date" value={item.manufacture_date} />}
                        {item.expiry_date && <LabelRow label="Expiry Date" value={item.expiry_date} bold accent={isNearExpiry(item.expiry_date)} />}
                    </tbody>
                </table>

                {/* Status box */}
                <div
                    style={{
                        marginTop: "8px",
                        border: "1.5px dashed #9ca3af",
                        borderRadius: "2px",
                        padding: "4px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}
                >
                    <div
                        style={{
                            width: "14px",
                            height: "14px",
                            border: "2px solid #000",
                            borderRadius: "2px",
                            flexShrink: 0,
                        }}
                    />
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#374151" }}>
                        Putaway Confirmed · Operator Signature
                    </div>
                </div>

                <div style={{ marginTop: "6px", fontSize: "8px", color: "#9ca3af", textAlign: "right" }}>
                    Generated {new Date().toLocaleString()} · Warehouse OS
                </div>
            </div>
        </div>
    );
}

function LabelRow({ label, value, bold, accent }) {
    return (
        <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
            <td
                style={{
                    padding: "3px 0",
                    color: "#6b7280",
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    width: "34%",
                    verticalAlign: "top",
                    paddingRight: "6px",
                }}
            >
                {label}
            </td>
            <td
                style={{
                    padding: "3px 0",
                    fontWeight: bold ? "700" : "400",
                    color: accent ? "#d97706" : "#111827",
                    fontSize: "10px",
                }}
            >
                {value || "—"}
            </td>
        </tr>
    );
}

function isNearExpiry(dateStr) {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const today = new Date();
    const diffDays = (expiry - today) / (1000 * 60 * 60 * 24);
    return diffDays < 90;
}
