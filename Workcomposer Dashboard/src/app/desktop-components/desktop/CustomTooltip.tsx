interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

const formatTime = (hours: number) => {
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};

export default function CustomTooltip({
    active,
    payload,
    label,
}: CustomTooltipProps) {
    if (!active || !payload?.length) return null;

    const work = Number(payload.find((p) => p.dataKey === "work")?.value) || 0;
    const breakTime = Number(payload.find((p) => p.dataKey === "break")?.value) || 0;

    return (
        <div className="bg-[#0B1528] border border-[#1E293B] rounded-xl p-3 shadow-2xl min-w-[130px]">
            <h3 className="text-white text-xs font-bold mb-2 pb-1 border-b border-[#1E293B]">
                {label}
            </h3>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#3B82F6] shrink-0" />
                        <span className="text-gray-300">Work:</span>
                    </div>
                    <span className="text-white font-mono font-semibold">
                        {formatTime(work)}
                    </span>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#F97316] shrink-0" />
                        <span className="text-gray-300">Break:</span>
                    </div>
                    <span className="text-white font-mono font-semibold">
                        {formatTime(breakTime)}
                    </span>
                </div>
            </div>
        </div>
    );
}
