type Props = {
    icon: React.ReactNode;
    title: string;
    description: string;
    connected?: boolean;
    selected?: boolean;
    onClick?: () => void;
};

export default function IntegrationCard({
    icon,
    title,
    description,
    connected = false,
    selected = false,
    onClick,
}: Props) {
    const isConnected = connected === true;

    return (
        <div
            onClick={onClick}
            className={`cursor-pointer rounded-3xl border bg-white dark:bg-[#0F172A] p-6 shadow-sm transition-all hover:shadow-md ${selected
                    ? "border-blue-500 dark:border-blue-400"
                    : "border-gray-200 dark:border-[#22324D]"
                }`}
        >
            <div className="flex items-center justify-between">

                <div className="flex items-center gap-4">

                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1E293B]">
                        {icon}
                    </div>

                    <div>

                        <div className="flex items-center gap-3">

                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                                {title}
                            </h3>

                            {isConnected && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/60 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                    Connected
                                </span>
                            )}

                        </div>

                        <p className="mt-2 text-gray-500 dark:text-gray-400">
                            {description}
                        </p>

                    </div>

                </div>

                <span className="text-3xl text-gray-400">
                    ›
                </span>

            </div>
        </div>
    );
}