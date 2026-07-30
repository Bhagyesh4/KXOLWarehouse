import { useState } from "react";
import { api } from "../lib/api";
import { X, Upload, Sparkles, Plus, Trash2, Loader } from "lucide-react";

const DEFAULT_ROW = () => ({
    row: "A",
    rack_type: "A",
    lanes: 5,
    lane_start: 1,
    levels: 4,
    depth: 4,
    weight_kg: 8000,
});

export default function ZoneProvisionModal({ zone, onClose, onSaved }) {
    const [step, setStep] = useState("upload"); // upload | edit
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [blueprintImage, setBlueprintImage] = useState(null);
    const [config, setConfig] = useState({
        zone_code: zone.zone,
        zone_name: zone.name,
        rows: [DEFAULT_ROW()],
    });

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        setErr("");
        try {
            const fd = new FormData();
            fd.append("file", file);
            const r = await api.post("/storage/parse-blueprint", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            if (r.data.blueprint_image) setBlueprintImage(r.data.blueprint_image);
            const c = r.data.config;
            setConfig({
                zone_code: zone.zone,
                zone_name: c.zone_name || zone.name,
                rows: (c.rows && c.rows.length ? c.rows : [DEFAULT_ROW()]).map((r) => ({
                    row: r.row || "A",
                    rack_type: r.rack_type || "A",
                    lanes: r.lanes || 5,
                    lane_start: r.lane_start || 1,
                    levels: r.levels || 4,
                    depth: r.depth || 4,
                    weight_kg: r.weight_kg || 8000,
                })),
            });
            setStep("edit");
        } catch (er) {
            setErr(er.response?.data?.detail || er.message);
        } finally {
            setBusy(false);
        }
    };

    const skipUpload = () => setStep("edit");

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
            await api.post(`/storage/zones/${zone.zone}/provision`, config);
            onSaved();
        } catch (er) {
            setErr(er.response?.data?.detail || er.message);
        } finally {
            setBusy(false);
        }
    };

    const totalSlots = config.rows.reduce(
        (a, r) => a + r.lanes * r.levels * r.depth,
        0
    );

    const updateRow = (idx, k, v) => {
        const rows = [...config.rows];
        rows[idx] = { ...rows[idx], [k]: v };
        setConfig({ ...config, rows });
    };

    const addRow = () =>
        setConfig({
            ...config,
            rows: [...config.rows, { ...DEFAULT_ROW(), row: String.fromCharCode(65 + config.rows.length) }],
        });

    const removeRow = (idx) =>
        setConfig({ ...config, rows: config.rows.filter((_, i) => i !== idx) });

    return (
        <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
            onClick={onClose}
        >
            <div
                className="bg-[#181a20] border border-white/10 max-w-3xl w-full my-8"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                            // PROVISION ZONE
                        </div>
                        <h3 className="text-lg font-bold mt-1">
                            Configure {zone.zone} — {zone.name}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white" data-testid="provision-close">
                        <X size={20} />
                    </button>
                </div>

                {step === "upload" && (
                    <div className="p-8">
                        <div className="border-2 border-dashed border-white/10 p-10 text-center">
                            <Sparkles className="mx-auto text-amber-400 mb-3" size={28} />
                            <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400 mb-2">
                                // AI BLUEPRINT PARSER
                            </div>
                            <div className="text-sm text-gray-400 mb-4">
                                Upload a blueprint PDF — Claude will extract racks, lanes, levels & dimensions.
                                You can review and tweak before saving.
                            </div>
                            <label className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-5 py-2.5 text-sm font-bold uppercase tracking-wider cursor-pointer">
                                <Upload size={14} />
                                {busy ? "Analyzing..." : "Upload PDF"}
                                <input
                                    data-testid="blueprint-file-input"
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleFile}
                                    disabled={busy}
                                    className="hidden"
                                />
                            </label>
                            {busy && (
                                <div className="mt-3 flex items-center justify-center gap-2 font-mono text-xs text-amber-400">
                                    <Loader size={12} className="animate-spin" /> Claude is reading your blueprint...
                                </div>
                            )}
                        </div>

                        {err && (
                            <div className="mt-4 text-xs text-red-400 font-mono border border-red-500/30 bg-red-500/10 p-3">
                                {err}
                            </div>
                        )}

                        <div className="mt-5 text-center">
                            <button
                                onClick={skipUpload}
                                data-testid="skip-upload-btn"
                                className="text-sm text-gray-500 hover:text-amber-400 underline"
                            >
                                Skip and configure manually →
                            </button>
                        </div>
                    </div>
                )}

                {step === "edit" && (
                    <form onSubmit={submit} className="p-5 space-y-4">
                        {blueprintImage && (
                            <div className="border border-white/10 bg-[#0d0e12]">
                                <div className="px-3 py-1.5 border-b border-white/10 flex items-center gap-2">
                                    <span className="font-mono text-[9px] uppercase tracking-widest text-amber-400">
                                        // BLUEPRINT REFERENCE
                                    </span>
                                    <span className="text-[10px] text-gray-500">scroll to view full drawing</span>
                                </div>
                                <div className="overflow-auto max-h-64">
                                    <img
                                        src={blueprintImage}
                                        alt="Blueprint"
                                        className="w-full"
                                        style={{ minWidth: 600 }}
                                    />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Zone Code" value={config.zone_code} disabled />
                            <Field
                                label="Zone Name"
                                value={config.zone_name}
                                onChange={(v) => setConfig({ ...config, zone_name: v })}
                                testid="config-zone-name"
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
                                    Rows / Rack Configurations
                                </div>
                                <button
                                    type="button"
                                    onClick={addRow}
                                    className="text-xs text-amber-400 flex items-center gap-1 hover:text-amber-300"
                                >
                                    <Plus size={12} /> Add Row
                                </button>
                            </div>
                            <div className="space-y-2">
                                {config.rows.map((r, idx) => (
                                    <div
                                        key={idx}
                                        className="grid grid-cols-12 gap-1.5 items-end bg-[#0d0e12] border border-white/5 p-2"
                                    >
                                        <RowField label="Row" value={r.row} onChange={(v) => updateRow(idx, "row", v)} cols={1} />
                                        <RackTypeSelect
                                            value={r.rack_type}
                                            onChange={(v) => updateRow(idx, "rack_type", v)}
                                        />
                                        <RowField
                                            label="Lanes"
                                            value={r.lanes}
                                            type="number"
                                            onChange={(v) => updateRow(idx, "lanes", parseInt(v) || 0)}
                                            cols={2}
                                        />
                                        <RowField
                                            label="Lane Start#"
                                            value={r.lane_start}
                                            type="number"
                                            onChange={(v) => updateRow(idx, "lane_start", parseInt(v) || 0)}
                                            cols={2}
                                        />
                                        <RowField
                                            label="Levels"
                                            value={r.levels}
                                            type="number"
                                            onChange={(v) => updateRow(idx, "levels", parseInt(v) || 0)}
                                            cols={1}
                                        />
                                        <RowField
                                            label="Depth"
                                            value={r.depth}
                                            type="number"
                                            onChange={(v) => updateRow(idx, "depth", parseInt(v) || 0)}
                                            cols={1}
                                        />
                                        <RowField
                                            label="Weight kg"
                                            value={r.weight_kg}
                                            type="number"
                                            onChange={(v) => updateRow(idx, "weight_kg", parseInt(v) || 0)}
                                            cols={3}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeRow(idx)}
                                            className="col-span-1 text-gray-500 hover:text-red-400 self-center"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 font-mono text-xs text-gray-400">
                                <span className="text-amber-400 font-semibold">{totalSlots}</span> total pallet slots
                                will be created
                            </div>
                        </div>

                        {err && (
                            <div className="text-xs text-red-400 font-mono border border-red-500/30 bg-red-500/10 p-3">
                                {err}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setStep("upload")}
                                className="flex-1 border border-white/10 text-gray-400 py-2.5 text-sm uppercase tracking-wider hover:text-white hover:border-white/30"
                            >
                                ← Back
                            </button>
                            <button
                                type="submit"
                                disabled={busy}
                                data-testid="provision-submit-btn"
                                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold tracking-wider uppercase text-sm py-2.5 disabled:opacity-60"
                            >
                                {busy ? "Provisioning..." : "Provision Zone"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type = "text", disabled, testid }) {
    return (
        <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">{label}</label>
            <input
                data-testid={testid}
                type={type}
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                disabled={disabled}
                className="w-full mt-1 bg-[#090a0c] border border-white/10 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none disabled:opacity-60"
            />
        </div>
    );
}

function RowField({ label, value, onChange, type = "text", cols = 2 }) {
    return (
        <div className={`col-span-${cols}`}>
            <label className="text-[9px] uppercase tracking-widest text-gray-500 font-semibold block">
                {label}
            </label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-[#090a0c] border border-white/10 px-2 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
            />
        </div>
    );
}

function RackTypeSelect({ value, onChange }) {
    const options = [
        { value: "A", label: "A — Standard" },
        { value: "B", label: "B — Heavy Duty" },
        { value: "C", label: "C — High Bay" },
        { value: "flow_rack", label: "Flow Rack (FIFO)" },
    ];
    return (
        <div className="col-span-2">
            <label className="text-[9px] uppercase tracking-widest text-gray-500 font-semibold block">
                Type
            </label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-[#090a0c] border border-white/10 px-2 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
