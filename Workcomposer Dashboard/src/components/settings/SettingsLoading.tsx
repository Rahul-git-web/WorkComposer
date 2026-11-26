type SettingsLoadingProps = {
  label?: string;
  subLabel?: string;
};

export default function SettingsLoading({
  label = "Fetching settings...",
  subLabel = "Please wait while we Loading...",
}: SettingsLoadingProps) {
  return (
    <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] transition-colors duration-200">
      <div className="flex flex-col items-center justify-center">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border-4 border-gray-100 dark:border-gray-800" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-600 border-r-indigo-400" />
          <div className="absolute inset-2 rounded-full bg-white dark:bg-[#0F172A]" />
          <div className="absolute inset-[14px] animate-pulse rounded-full bg-indigo-600" />
        </div>
        <p className="mt-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
          {label}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {subLabel}
        </p>
      </div>
    </div>
  );
}