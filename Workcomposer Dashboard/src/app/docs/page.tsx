import type { Metadata } from "next";
import DocsClient from "./DocsClient";

export const metadata: Metadata = {
  title: "Documentation — WorkComposer",
  description:
    "Official WorkComposer platform documentation: Desktop tracking modes, floating timer bar, attendance & reports, blurred screenshots, app/URL analytics, RBAC, and privacy controls.",
};

export default function DocsPage() {
  return <DocsClient />;
}

