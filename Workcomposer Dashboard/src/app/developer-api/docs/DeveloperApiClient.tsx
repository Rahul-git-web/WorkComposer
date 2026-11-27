"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  FileDown,
  KeyRound,
  Menu,
  Search,
  Server,
  ShieldAlert,
  Terminal,
  X,
} from "lucide-react";
import {
  MobileResourcesAccordion,
  ResourcesMenu,
} from "@/components/navigation/ResourcesMenu";
import {
  API_BASE_URLS,
  API_ERROR_CODES,
  buildOpenApiSpec,
  CODE_SNIPPETS,
  DATA_EXPORT_ENDPOINTS,
  ENDPOINT_GROUPS,
  QUICKSTART_STEPS,
  type ApiEndpoint,
  type CodeLanguage,
} from "./apiDocsData";

const METHOD_COLORS: Record<ApiEndpoint["method"], string> = {
  GET: "bg-emerald-950/70 text-emerald-300 border-emerald-700/60",
  POST: "bg-indigo-950/80 text-indigo-300 border-indigo-700/60",
  PUT: "bg-amber-950/70 text-amber-300 border-amber-700/60",
  PATCH: "bg-sky-950/70 text-sky-300 border-sky-700/60",
  DELETE: "bg-rose-950/70 text-rose-300 border-rose-700/60",
};

function BrandLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const boxClass = size === "sm" ? "w-7 h-7 rounded-lg p-1" : "w-9 h-9 rounded-xl p-1.5";
  const textClass = size === "sm" ? "text-base" : "text-xl";

  return (
    <Link href="/" className="flex items-center gap-3">
      <div
        className={`${boxClass} bg-gradient-to-tr from-indigo-600 to-blue-500 shadow-lg shadow-indigo-500/20`}
      >
        <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
          <path
            d="M15 50 L35 75 L60 30"
            stroke="white"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M45 50 L65 75 L90 30"
            stroke="#93c5fd"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className={`${textClass} font-bold tracking-tight text-white font-mono`}>
        Work<span className="text-indigo-400">Composer</span>
      </span>
    </Link>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-indigo-500/60 hover:text-white transition cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-300">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

export default function DeveloperApiClient() {
  const [lang, setLang] = useState<CodeLanguage>("curl");
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(
    "v1-get-projects"
  );

  const filteredGroups = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return ENDPOINT_GROUPS;

    return ENDPOINT_GROUPS.map((group) => ({
      ...group,
      endpoints: group.endpoints.filter(
        (ep) =>
          ep.path.toLowerCase().includes(trimmed) ||
          ep.method.toLowerCase().includes(trimmed) ||
          ep.summary.toLowerCase().includes(trimmed) ||
          ep.auth.toLowerCase().includes(trimmed) ||
          (ep.permission?.toLowerCase().includes(trimmed) ?? false)
      ),
    })).filter((group) => group.endpoints.length > 0);
  }, [search]);

  const handleDownloadOpenApi = () => {
    const spec = buildOpenApiSpec();
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workcomposer-openapi-v1.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const jumpTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white relative">
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[960px] h-[460px] bg-indigo-600/15 blur-[130px] rounded-full" />
        <div className="absolute top-1/2 -right-24 w-[420px] h-[420px] bg-blue-600/10 blur-[150px] rounded-full" />
      </div>

      {/* Top Sticky Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white transition cursor-pointer"
              aria-label="Toggle API navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <BrandLogo />
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <Link href="/docs" className="hover:text-white transition-colors">
              Docs
            </Link>
            <ResourcesMenu />
            <Link
              href="/developer-api/docs/api-quickstart"
              className="text-white font-semibold"
            >
              Developer API
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/authenticate/login"
              className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 text-sm font-semibold transition"
            >
              Sign in
            </Link>
            <Link
              href="/authenticate/signup"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-md shadow-indigo-600/20"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 pt-20 bg-slate-950/95 backdrop-blur-md">
          <div className="h-full overflow-y-auto p-6 space-y-4">
            <MobileResourcesAccordion onNavigate={() => setMobileMenuOpen(false)} />

            <div className="space-y-1">
              {[
                { label: "Quick Start", id: "quickstart" },
                { label: "Authentication & Base URL", id: "authentication" },
                { label: "Code Examples", id: "code-examples" },
                { label: "Endpoint Reference", id: "endpoints" },
                { label: "Data Export", id: "data-export" },
                { label: "Error Reference", id: "errors" },
              ].map((nav) => (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => jumpTo(nav.id)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-900 hover:text-white transition cursor-pointer"
                >
                  {nav.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-10 lg:py-14 space-y-10">
        {/* Hero & Sub-Nav Pills */}
        <div className="rounded-3xl border border-slate-800/80 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-7 md:p-10 shadow-2xl space-y-7">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-800/50 text-indigo-300 text-xs font-semibold tracking-wide uppercase font-mono">
                <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                DEVELOPER API · V1.0
              </div>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
                API Quickstart &{" "}
                <span className="bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">
                  Endpoint Reference
                </span>
              </h1>
              <p className="text-slate-400 text-base md:text-lg leading-relaxed">
                Integrate WorkComposer projects, tasks, users, attendance,
                reports, and audit telemetry using organization{" "}
                <code className="text-indigo-300 font-mono text-sm">wc_...</code>{" "}
                API keys or scoped JWT Bearer sessions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleDownloadOpenApi}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/25 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download OpenAPI JSON
              </button>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm font-semibold transition"
              >
                Platform Docs
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/70">
            {[
              { label: "Quick Start", id: "quickstart" },
              { label: "Authentication", id: "authentication" },
              { label: "Code Examples", id: "code-examples" },
              { label: "API Reference", id: "endpoints" },
              { label: "Data Export", id: "data-export" },
              { label: "Errors", id: "errors" },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => jumpTo(pill.id)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/70 text-xs font-semibold text-slate-300 hover:text-white hover:border-indigo-500/60 transition cursor-pointer"
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Layout Grid */}
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          {/* Left Sticky Sidebar */}
          <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-28 space-y-5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter endpoints (e.g. /v1, tasks)..."
                aria-label="Filter API endpoints"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-10 pr-9 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-200 cursor-pointer"
                  aria-label="Clear filter"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3 space-y-4">
              <div>
                <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Guide
                </p>
                <div className="space-y-1">
                  {[
                    { label: "Quick Start Steps", id: "quickstart" },
                    { label: "Auth & Base URL", id: "authentication" },
                    { label: "SDK & cURL Examples", id: "code-examples" },
                    { label: "Data Export Routes", id: "data-export" },
                    { label: "HTTP Error Reference", id: "errors" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => jumpTo(item.id)}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800/60 hover:text-white transition cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-3">
                <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Endpoint Groups ({filteredGroups.length})
                </p>
                <div className="space-y-1">
                  {filteredGroups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => jumpTo(group.id)}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800/60 hover:text-white transition cursor-pointer truncate"
                    >
                      {group.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Reference Column */}
          <main className="lg:col-span-8 xl:col-span-9 space-y-8 min-w-0">
            {/* Quick Start */}
            <section
              id="quickstart"
              className="scroll-mt-28 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 md:p-8 space-y-6"
            >
              <div className="border-b border-slate-800/80 pb-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                  GETTING STARTED
                </span>
                <h2 className="text-2xl font-bold text-white mt-1">
                  API Quick Start (4 Steps)
                </h2>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {QUICKSTART_STEPS.map((item) => (
                  <div
                    key={item.step}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-950 border border-indigo-700/60 text-xs font-bold text-indigo-300 font-mono">
                        {item.step}
                      </span>
                      <h3 className="text-sm font-semibold text-white">
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-xs md:text-sm text-slate-300/90 leading-relaxed">
                      {item.description}
                    </p>
                    {item.note && (
                      <p className="text-xs text-slate-500 leading-relaxed pt-1 border-t border-slate-800/60">
                        {item.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Authentication & Base URL */}
            <section
              id="authentication"
              className="scroll-mt-28 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 md:p-8 space-y-5"
            >
              <div className="border-b border-slate-800/80 pb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                    SECURITY & HEADERS
                  </span>
                  <h2 className="text-2xl font-bold text-white mt-1">
                    Authentication & Base URL
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-mono text-indigo-300">
                  <Server className="w-3.5 h-3.5" />
                  {API_BASE_URLS.local}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-indigo-800/50 bg-indigo-950/20 p-5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-indigo-200">
                    <KeyRound className="w-4 h-4 text-indigo-400" />
                    API Key Auth (`/api/v1/*`)
                  </div>
                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                    Generate keys in Settings → Account → API Access (`wc_&lt;64 hex&gt;`).
                    Pass strictly via the Bearer Authorization header (`apiKeyAuth.js`).
                    API-key calls are logged in `ApiLog` and bypass CSRF checks.
                  </p>
                  <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-indigo-300 font-mono overflow-x-auto">
                    Authorization: Bearer wc_your_64_char_hex_key
                  </pre>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Terminal className="w-4 h-4 text-slate-400" />
                    JWT Bearer & Session Auth (`/api/*`)
                  </div>
                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                    Core REST resources (`/api/projects`, `/api/tasks`, `/api/attendance`,
                    `/api/reports`, `/api/users`) accept `Authorization: Bearer &lt;JWT&gt;`
                    or HTTP-only `accessToken` cookies (requiring `X-CSRF-Token` on mutations).
                  </p>
                  <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-300 font-mono overflow-x-auto">
                    Authorization: Bearer &lt;JWT_ACCESS_TOKEN&gt;
                  </pre>
                </div>
              </div>
            </section>

            {/* Interactive Multi-Language Code Examples */}
            <section
              id="code-examples"
              className="scroll-mt-28 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 md:p-8 space-y-6"
            >
              <div className="border-b border-slate-800/80 pb-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                    REQUEST EXAMPLES
                  </span>
                  <h2 className="text-2xl font-bold text-white mt-1">
                    cURL, JavaScript & Node.js Snippets
                  </h2>
                </div>

                <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1">
                  {(
                    [
                      { key: "curl", label: "cURL" },
                      { key: "javascript", label: "JavaScript" },
                      { key: "node", label: "Node.js" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setLang(tab.key)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        lang === tab.key
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                {CODE_SNIPPETS.map((snippet) => (
                  <div
                    key={snippet.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/70">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          {snippet.title}
                        </h3>
                        <p className="text-xs text-slate-400">{snippet.description}</p>
                      </div>
                      <CopyButton text={snippet.code[lang]} />
                    </div>
                    <pre className="p-4 text-xs text-indigo-200 font-mono overflow-x-auto leading-relaxed">
                      <code>{snippet.code[lang]}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </section>

            {/* Endpoint Reference */}
            <section id="endpoints" className="scroll-mt-28 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                    LIVE ENDPOINTS
                  </span>
                  <h2 className="text-2xl font-bold text-white mt-1">
                    API Endpoint Reference
                  </h2>
                </div>
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    Reset search filter
                  </button>
                )}
              </div>

              {filteredGroups.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center space-y-3">
                  <p className="text-base font-semibold text-white">
                    No endpoints matched &ldquo;{search}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white cursor-pointer"
                  >
                    Show all endpoints
                  </button>
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div
                    key={group.id}
                    id={group.id}
                    className="scroll-mt-28 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 md:p-7 space-y-5"
                  >
                    <div className="border-b border-slate-800/80 pb-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xl font-bold text-white">{group.title}</h3>
                        <p className="text-sm text-slate-400 mt-1">
                          {group.description}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] font-mono text-slate-300">
                        {group.badge}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {group.endpoints.map((ep) => {
                        const isOpen = expandedResponseId === ep.id;
                        return (
                          <div
                            key={ep.id}
                            className="rounded-xl border border-slate-800 bg-slate-950/75 overflow-hidden"
                          >
                            <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                <span
                                  className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold font-mono ${METHOD_COLORS[ep.method]}`}
                                >
                                  {ep.method}
                                </span>
                                <code className="text-sm font-semibold text-white font-mono break-all">
                                  {ep.path}
                                </code>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                    ep.auth === "API Key (Bearer wc_...)"
                                      ? "bg-indigo-950/70 text-indigo-300 border-indigo-700/60"
                                      : "bg-slate-900 text-slate-300 border-slate-700"
                                  }`}
                                >
                                  {ep.auth}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedResponseId(isOpen ? null : ep.id)
                                  }
                                  className="px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-900 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer"
                                >
                                  {isOpen ? "Hide details" : "Inspect"}
                                </button>
                              </div>
                            </div>

                            <div className="px-4 pb-4 text-xs md:text-sm text-slate-300 space-y-3">
                              <p>{ep.summary}</p>
                              {ep.permission && (
                                <p className="text-xs text-slate-400">
                                  Required RBAC scope:{" "}
                                  <code className="text-indigo-300 font-mono">
                                    {ep.permission}
                                  </code>
                                </p>
                              )}

                              {isOpen && (
                                <div className="pt-3 border-t border-slate-800/80 space-y-4">
                                  {ep.params && ep.params.length > 0 && (
                                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                                      <table className="min-w-full divide-y divide-slate-800 text-xs text-left">
                                        <thead className="bg-slate-900/90 text-slate-400 uppercase">
                                          <tr>
                                            <th className="px-3 py-2">Param</th>
                                            <th className="px-3 py-2">In</th>
                                            <th className="px-3 py-2">Description</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/70">
                                          {ep.params.map((p) => (
                                            <tr key={p.name}>
                                              <td className="px-3 py-2 font-mono text-indigo-300 whitespace-nowrap">
                                                {p.name}
                                                {p.required && (
                                                  <span className="text-rose-400 ml-1">*</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2 font-mono text-slate-400">
                                                {p.location}
                                              </td>
                                              <td className="px-3 py-2 text-slate-300">
                                                {p.description}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}

                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                                        Sample JSON Response
                                      </span>
                                      <CopyButton text={ep.responseExample} label="Copy JSON" />
                                    </div>
                                    <pre className="rounded-lg bg-slate-900/90 border border-slate-800 p-3 text-xs text-emerald-200 font-mono overflow-x-auto leading-relaxed">
                                      <code>{ep.responseExample}</code>
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Data Export */}
            <section
              id="data-export"
              className="scroll-mt-28 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 md:p-8 space-y-5"
            >
              <div className="border-b border-slate-800/80 pb-4 flex items-center gap-2.5">
                <FileDown className="w-5 h-5 text-indigo-400" />
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Data Export Endpoints
                  </h2>
                  <p className="text-sm text-slate-400">
                    Bulk CSV and ZIP export routes gated by role permissions and JWT/Session auth.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
                <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                  <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Endpoint</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {DATA_EXPORT_ENDPOINTS.map((exp) => (
                      <tr key={exp.path} className="hover:bg-slate-900/40">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-300 whitespace-nowrap">
                          <span className="font-bold mr-2 text-emerald-300">
                            {exp.method}
                          </span>
                          {exp.path}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">
                          {exp.format}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs md:text-sm">
                          {exp.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Errors */}
            <section
              id="errors"
              className="scroll-mt-28 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 md:p-8 space-y-5"
            >
              <div className="border-b border-slate-800/80 pb-4 flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    HTTP Error & Status Reference
                  </h2>
                  <p className="text-sm text-slate-400">
                    Standard JSON error envelopes returned by Express middleware and RBAC guards.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
                <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                  <thead className="bg-slate-900/90 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Cause</th>
                      <th className="px-4 py-3">Response Body</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {API_ERROR_CODES.map((err) => (
                      <tr key={err.status} className="hover:bg-slate-900/40">
                        <td className="px-4 py-3 font-mono font-bold text-amber-300 whitespace-nowrap">
                          {err.status} · {err.title}
                        </td>
                        <td className="px-4 py-3 text-xs md:text-sm text-slate-300">
                          {err.cause}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">
                          {err.sampleBody}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 py-12 bg-slate-950 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <BrandLogo size="sm" />

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-400">
            <Link href="/" className="hover:text-white transition">
              Home
            </Link>
            <Link href="/docs" className="hover:text-white transition">
              Docs
            </Link>
            <Link
              href="/developer-api/docs/api-quickstart"
              className="text-white font-medium"
            >
              Developer API
            </Link>
          </div>

          <span className="text-xs text-slate-500">© 2026 WorkComposer</span>
        </div>
      </footer>
    </div>
  );
}

