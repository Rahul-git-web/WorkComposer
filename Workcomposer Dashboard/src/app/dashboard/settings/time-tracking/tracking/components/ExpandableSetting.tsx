import type { ReactNode } from "react";

type Props = {
    children: ReactNode;
};

export default function ExpandableSetting({
    children,
}: Props) {
    return (
        <div className="border-b border-gray-200 dark:border-[#22324D] px-12 py-6">
            <div className="ml-8 border-l-2 border-gray-200 dark:border-[#22324D] pl-8">
                {children}
            </div>
        </div>

        
    );
}