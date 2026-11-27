import type { Metadata } from "next";
import DeveloperApiClient from "./DeveloperApiClient";

export const metadata: Metadata = {
  title: "Developer API Documentation — WorkComposer",
  description:
    "WorkComposer Developer API Quickstart, authentication headers, REST endpoints, data exports, and OpenAPI 3.0 specification.",
};

export default function DeveloperApiDocsPage() {
  return <DeveloperApiClient />;
}

