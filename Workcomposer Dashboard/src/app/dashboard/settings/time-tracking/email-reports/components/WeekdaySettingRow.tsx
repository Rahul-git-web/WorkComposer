type Props = {
    value: number[];
    onToggle: (updated: number[]) => void;
    disabled?: boolean;
};

const weekDays = [
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
    { label: "Sun", value: 0 },
];

export default function WeekdaySettingRow({
    value,
    onToggle,
    disabled,
}: Props) {
    return (
        <div className="flex flex-wrap gap-2">
            {weekDays.map((day) => {
                const normalized = value.map(Number);

const active = normalized.includes(day.value);

                return (
                    <button
                        key={day.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                            if (disabled) return;

                           const updated = normalized.includes(day.value)
    ? normalized.filter((d) => d !== day.value)
    : [...normalized, day.value].sort((a, b) => a - b);

onToggle(updated);
                        }}
                        className={`rounded-md px-1.5 py-1 text-sm font-medium transition ${active
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"
                            }`}
                    >
                        {day.label}
                    </button>
                );
            })}
        </div>
    );
}