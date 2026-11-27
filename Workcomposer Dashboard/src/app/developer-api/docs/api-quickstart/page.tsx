import type { Metadata } from "next";
import DeveloperApiClient from "../DeveloperApiClient";

export const metadata: Metadata = {
  title: "API Quickstart — WorkComposer Developer API",
  description:
    "Get started with the WorkComposer Developer API: generate API keys, authenticate Bearer requests, query /api/v1/projects, and download the OpenAPI 3.0 spec.",
};

export default function ApiQuickstartPage() {
  return <DeveloperApiClient />;
}

