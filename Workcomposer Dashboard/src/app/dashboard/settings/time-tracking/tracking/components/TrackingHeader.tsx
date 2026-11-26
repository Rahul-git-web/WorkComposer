"use client"

type Props = {
    title: string;
    description: string;
};

export default function TrackingHeader({
    title,
    description,
}: Props) {
    return (
        <div className="border-b border-gray-200 dark:border-gray-800 px-12 py-8">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {title}
            </h1>

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {description}   
            </p>
        </div>
    );
}