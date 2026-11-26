import ReportsModule from "@/app/modules/reports/ReportsModule";
import DesktopPageHeader from "../common/DesktopPageHeader";

export default function ReportsPage() {
   return (
    <>
        <DesktopPageHeader />

        <div className="pt-[45px]">
            <div className="h-[calc(100vh-4rem-1.75rem-45px)] flex flex-col min-h-0">
                <ReportsModule />
            </div>
        </div>
    </>
)
}