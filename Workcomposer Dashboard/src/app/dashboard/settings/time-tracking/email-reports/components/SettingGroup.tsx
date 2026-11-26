import type { ReactNode } from "react";

type Props = {
    children: ReactNode;
};

export default function SettingGroup({ children }: Props) {
    return (
        <div className="border-b border-gray-200 dark:border-gray-800 px-6 py-0">
            <div className="ml-7 border-l-4 border-indigo-200 dark:border-indigo-800 py-5 pl-8">
                <div className="space-y-8">
                    {children}
                </div>
            </div>
        </div>
    );
}