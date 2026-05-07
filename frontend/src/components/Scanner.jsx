import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X, Camera, RefreshCw } from "lucide-react";

export default function Scanner({ onScan, onClose }) {
    const videoRef = useRef(null);
    const codeReaderRef = useRef(null);
    const [error, setError] = useState("");
    const [lastCode, setLastCode] = useState("");

    useEffect(() => {
        const reader = new BrowserMultiFormatReader();
        codeReaderRef.current = reader;

        (async () => {
            try {
                const devices = await BrowserMultiFormatReader.listVideoInputDevices();
                if (!devices.length) {
                    setError("No camera detected. Use a device with a camera.");
                    return;
                }
                // prefer back camera if available
                const back = devices.find((d) => /back|rear|environment/i.test(d.label));
                const deviceId = (back || devices[0]).deviceId;
                await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
                    if (result) {
                        const code = result.getText();
                        setLastCode(code);
                        if (onScan) onScan(code);
                    }
                });
            } catch (e) {
                setError(e.message || "Camera access denied");
            }
        })();

        return () => {
            try {
                codeReaderRef.current?.reset?.();
            } catch {}
        };
    }, [onScan]);

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" data-testid="scanner-modal">
            <div className="bg-[#181a20] border border-amber-500/40 max-w-lg w-full">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <Camera className="text-amber-400" size={18} />
                        <div>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
                                // BARCODE SCANNER
                            </div>
                            <div className="font-semibold text-sm">Point at a barcode</div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        data-testid="scanner-close-btn"
                        className="text-gray-400 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="p-4">
                    {error ? (
                        <div className="bg-red-500/10 border border-red-500/30 p-4 text-red-400 text-sm font-mono">
                            {error}
                        </div>
                    ) : (
                        <div className="relative bg-black aspect-video overflow-hidden">
                            <video
                                ref={videoRef}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                            />
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute top-1/2 left-4 right-4 h-px bg-amber-400/70" />
                                <div className="absolute inset-4 border-2 border-amber-500/40" />
                            </div>
                        </div>
                    )}

                    {lastCode && (
                        <div className="mt-3 border border-emerald-500/30 bg-emerald-500/10 p-3">
                            <div className="font-mono text-[10px] tracking-widest text-emerald-400 uppercase">
                                ✓ Scanned
                            </div>
                            <div className="font-mono text-emerald-300 text-sm break-all">
                                {lastCode}
                            </div>
                        </div>
                    )}

                    <div className="mt-3 text-[11px] text-gray-500 text-center font-mono">
                        Tip: Use good lighting & hold steady. Reads QR / EAN / Code128 / UPC.
                    </div>
                </div>
            </div>
        </div>
    );
}
