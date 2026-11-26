import SecurityLayoutView from "./SecurityLayoutView";

export default function SecurityLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <SecurityLayoutView>{children}</SecurityLayoutView>;
}
