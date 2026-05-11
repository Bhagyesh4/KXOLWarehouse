/**
 * RackElevationSVG  — engineering-style side-elevation of a pallet rack.
 *
 * bins: [{level, position, occupied, expiring}]  (level & position are 1-based)
 * levels: total rack levels
 * depth: total depth positions per level
 * weightCapacityKg: beam load label (default 1000)
 * compact: smaller rendering for card thumbnails
 * highlightDepth: marks a specific depth position (e.g. 1 for FIFO exit face)
 */
export default function RackElevationSVG({
    levels = 5,
    depth = 10,
    bins = [],
    weightCapacityKg = 1000,
    compact = false,
    highlightDepth = null,
    onSlotClick = null,   // (bin) => void  — called with the bin object when an occupied slot is clicked
}) {
    const UW  = compact ? 5 : 7;     // upright width px
    const BH  = compact ? 5 : 8;     // beam height px
    const LH  = compact ? 20 : 40;   // level cell height px
    const GAP = depth > 30 ? 0 : depth > 15 ? 0.5 : 1;
    const PL  = compact ? 18 : 24;   // padding left  (level numbers)
    const PR  = compact ? 4  : 70;   // padding right (UDL labels)

    const MAX_FIELD = compact ? 148 : 320;
    const rawSlot   = (MAX_FIELD - depth * GAP) / depth;
    const slotW     = Math.max(2, Math.floor(rawSlot));
    const fieldW    = depth * slotW + Math.max(0, depth - 1) * GAP;

    const svgW  = PL + UW + fieldW + UW + PR;
    const svgH  = (levels + 1) * BH + levels * LH;

    const fx = PL + UW;         // field left x
    const rx = fx + fieldW;     // right upright x

    const getBin = (lv, pos) =>
        bins.find((b) => b.level === lv && b.position === pos);

    return (
        <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full"
            style={{ display: "block" }}
        >
            <rect width={svgW} height={svgH} fill="#080a0d" />

            {Array.from({ length: levels }, (_, li) => {
                const level = levels - li;          // top level rendered first
                const beamY = li * (LH + BH);
                const cellY = beamY + BH;
                const padV  = Math.max(1, LH * 0.14);

                return (
                    <g key={level}>
                        {/* ── Horizontal beam ── */}
                        <rect
                            x={PL} y={beamY}
                            width={UW + fieldW + UW} height={BH}
                            fill="#b45309" rx={1}
                        />

                        {/* ── Left upright ── */}
                        <rect x={PL} y={cellY} width={UW} height={LH} fill="#1e40af" />

                        {/* ── Right upright ── */}
                        <rect x={rx} y={cellY} width={UW} height={LH} fill="#1e40af" />

                        {/* ── X-bracing (structural, behind pallets) ── */}
                        <line
                            x1={fx} y1={cellY} x2={rx} y2={cellY + LH}
                            stroke="#1e293b" strokeWidth={1.5}
                        />
                        <line
                            x1={rx} y1={cellY} x2={fx} y2={cellY + LH}
                            stroke="#1e293b" strokeWidth={1.5}
                        />

                        {/* ── Pallet slots ── */}
                        {Array.from({ length: depth }, (_, di) => {
                            const pos      = di + 1;
                            const bin      = getBin(level, pos);
                            const occupied = bin?.occupied;
                            const expiring = bin?.expiring;
                            const isExit   = highlightDepth === pos;
                            const sx       = fx + di * (slotW + GAP);
                            const clickable = occupied && onSlotClick;

                            let fill, stroke;
                            if (isExit && occupied) {
                                fill   = "rgba(251,191,36,0.85)";
                                stroke = "#fbbf24";
                            } else if (occupied && expiring) {
                                fill   = "rgba(239,68,68,0.65)";
                                stroke = "#ef4444";
                            } else if (occupied) {
                                fill   = "rgba(217,119,6,0.60)";
                                stroke = "#d97706";
                            } else if (isExit) {
                                fill   = "rgba(251,191,36,0.10)";
                                stroke = "rgba(251,191,36,0.40)";
                            } else {
                                fill   = "rgba(255,255,255,0.03)";
                                stroke = "rgba(255,255,255,0.07)";
                            }

                            return (
                                <rect
                                    key={di}
                                    x={sx} y={cellY + padV}
                                    width={slotW} height={LH - padV * 2}
                                    fill={fill} stroke={stroke}
                                    strokeWidth={0.5} rx={0.5}
                                    style={clickable ? { cursor: "pointer" } : undefined}
                                    onClick={clickable ? (e) => { e.stopPropagation(); onSlotClick(bin); } : undefined}
                                />
                            );
                        })}

                        {/* ── Level number (left) ── */}
                        <text
                            x={PL - 3} y={cellY + LH / 2 + 3.5}
                            textAnchor="end"
                            fill="#4b5563"
                            fontSize={compact ? 7 : 9}
                            fontFamily="monospace"
                        >
                            {level}
                        </text>

                        {/* ── UDL label (right) ── */}
                        {!compact && (
                            <text
                                x={rx + UW + 5}
                                y={beamY + BH - 1.5}
                                fill="#713f12"
                                fontSize={7}
                                fontFamily="monospace"
                            >
                                {weightCapacityKg.toLocaleString()} kg UDL
                            </text>
                        )}
                    </g>
                );
            })}

            {/* ── Bottom beam ── */}
            <rect
                x={PL} y={levels * (LH + BH)}
                width={UW + fieldW + UW} height={BH}
                fill="#b45309" rx={1}
            />
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────────────
 * MultiLaneRackSVG — front-elevation showing multiple lanes as bays.
 * Used in Shuttle Zone as an interactive heatmap replacement.
 * ───────────────────────────────────────────────────────────────── */
export function MultiLaneRackSVG({
    lanes,          // [1,2,...,7]
    levels,         // [{no, label}]  — rendered bottom→top
    matrixEntry,    // (lane, levelNo) => {utilization_pct, occupied, total}
    activeLane,
    activeLevel,
    onCellClick,    // (lane, levelNo) => void
}) {
    const BAY_W  = 46;
    const LH     = 38;
    const BH     = 8;
    const UW     = 6;
    const PL     = 30;   // left padding for level labels
    const PB     = 18;   // bottom padding for lane labels

    const numLanes  = lanes.length;
    const numLevels = levels.length;

    const totalW = PL + numLanes * BAY_W + UW + 10;
    const totalH = (numLevels + 1) * BH + numLevels * LH + PB;

    // Render highest level at top: sort descending by no
    const levelsSorted = [...levels].sort((a, b) => b.no - a.no);

    const pctColor = (pct) => {
        if (pct === 0) return { fill: "rgba(16,185,129,0.08)", stroke: "rgba(16,185,129,0.20)" };
        if (pct < 50)  return { fill: "rgba(16,185,129,0.22)", stroke: "rgba(16,185,129,0.45)" };
        if (pct < 80)  return { fill: "rgba(245,158,11,0.28)", stroke: "rgba(245,158,11,0.55)" };
        return              { fill: "rgba(239,68,68,0.30)",  stroke: "rgba(239,68,68,0.60)" };
    };

    return (
        <svg
            viewBox={`0 0 ${totalW} ${totalH}`}
            className="w-full"
            style={{ display: "block" }}
        >
            <rect width={totalW} height={totalH} fill="#080a0d" />

            {levelsSorted.map((lv, li) => {
                const beamY = li * (LH + BH);
                const cellY = beamY + BH;

                return (
                    <g key={lv.no}>
                        {/* ── Full-width beam ── */}
                        <rect
                            x={PL} y={beamY}
                            width={numLanes * BAY_W + UW} height={BH}
                            fill="#b45309" rx={1}
                        />

                        {/* ── Level label ── */}
                        <text
                            x={PL - 4}
                            y={cellY + LH / 2 + 3}
                            textAnchor="end"
                            fill="#4b5563"
                            fontSize={8}
                            fontFamily="monospace"
                        >
                            {lv.no}
                        </text>

                        {lanes.map((ln, lni) => {
                            const bayX   = PL + lni * BAY_W;
                            const entry  = matrixEntry(ln, lv.no);
                            const pct    = entry?.utilization_pct ?? 0;
                            const isActive = activeLane === ln && activeLevel === lv.no;
                            const { fill, stroke } = pctColor(pct);

                            return (
                                <g
                                    key={ln}
                                    onClick={() => onCellClick(ln, lv.no)}
                                    style={{ cursor: "pointer" }}
                                >
                                    {/* ── Left upright of bay ── */}
                                    <rect x={bayX} y={cellY} width={UW} height={LH} fill="#1e40af" />

                                    {/* ── X-bracing ── */}
                                    <line
                                        x1={bayX + UW} y1={cellY}
                                        x2={bayX + BAY_W} y2={cellY + LH}
                                        stroke="#1a2030" strokeWidth={1}
                                    />
                                    <line
                                        x1={bayX + BAY_W} y1={cellY}
                                        x2={bayX + UW} y2={cellY + LH}
                                        stroke="#1a2030" strokeWidth={1}
                                    />

                                    {/* ── Occupancy cell ── */}
                                    <rect
                                        x={bayX + UW + 1}
                                        y={cellY + 3}
                                        width={BAY_W - UW - 2}
                                        height={LH - 6}
                                        fill={isActive ? "rgba(34,211,238,0.15)" : fill}
                                        stroke={isActive ? "#22d3ee" : stroke}
                                        strokeWidth={isActive ? 1.5 : 0.5}
                                        rx={1}
                                    />

                                    {/* ── Pct label ── */}
                                    <text
                                        x={bayX + UW + (BAY_W - UW) / 2}
                                        y={cellY + LH / 2 + 3}
                                        textAnchor="middle"
                                        fill={isActive ? "#22d3ee" : "#6b7280"}
                                        fontSize={7}
                                        fontFamily="monospace"
                                    >
                                        {pct}%
                                    </text>
                                </g>
                            );
                        })}

                        {/* ── Rightmost upright ── */}
                        <rect
                            x={PL + numLanes * BAY_W}
                            y={cellY}
                            width={UW}
                            height={LH}
                            fill="#1e40af"
                        />
                    </g>
                );
            })}

            {/* ── Bottom beam ── */}
            <rect
                x={PL}
                y={numLevels * (LH + BH)}
                width={numLanes * BAY_W + UW}
                height={BH}
                fill="#b45309"
                rx={1}
            />

            {/* ── Lane labels ── */}
            {lanes.map((ln, lni) => (
                <text
                    key={ln}
                    x={PL + lni * BAY_W + UW + (BAY_W - UW) / 2}
                    y={numLevels * (LH + BH) + BH + 13}
                    textAnchor="middle"
                    fill="#4b5563"
                    fontSize={7}
                    fontFamily="monospace"
                >
                    {String(ln).padStart(2, "0")}
                </text>
            ))}
        </svg>
    );
}
