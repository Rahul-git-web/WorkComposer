"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Download,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  MobileResourcesAccordion,
  ResourcesMenu,
} from "@/components/navigation/ResourcesMenu";
import {
  DESKTOP_DOWNLOAD_URL,
  DOCS_SECTIONS,
  type DocSection,
} from "./docsData";

function BrandLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const boxClass = size === "sm" ? "w-7 h-7 rounded-lg p-1" : "w-9 h-9 rounded-xl p-1.5";
  const textClass = size === "sm" ? "text-base" : "text-xl";

  return (
    <Link href="/" className="flex items-center gap-3 group">
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

function CalloutBox({ callout }: { callout: NonNullable<DocSection["callout"]> }) {
  const palette =
    callout.tone === "privacy"
      ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-200"
      : callout.tone === "tip"
      ? "border-blue-500/30 bg-blue-950/25 text-blue-200"
      : "border-indigo-500/30 bg-indigo-950/30 text-indigo-200";

  return (
    <div className={`rounded-2xl border p-5 ${palette}`}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1.5">
        {callout.tone === "privacy" ? (
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
        )}
        <span>{callout.title}</span>
      </div>
      <p className="text-sm leading-relaxed text-slate-300">{callout.text}</p>
    </div>
  );
}

function findParentSectionId(anchorId: string): string | null {
  for (const section of DOCS_SECTIONS) {
    if (section.id === anchorId) return section.id;
    if (section.subsections.some((sub) => sub.id === anchorId)) {
      return section.id;
    }
  }
  return null;
}

export default function DocsClient() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(DOCS_SECTIONS[0]?.id ?? "getting-started");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  const filteredSections = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return DOCS_SECTIONS;

    return DOCS_SECTIONS.filter((section) => {
      const inHeader =
        section.title.toLowerCase().includes(trimmed) ||
        section.summary.toLowerCase().includes(trimmed) ||
        section.tags.some((t) => t.toLowerCase().includes(trimmed));

      const inSubsections = section.subsections.some(
        (sub) =>
          sub.heading.toLowerCase().includes(trimmed) ||
          sub.body.toLowerCase().includes(trimmed) ||
          (sub.code?.toLowerCase().includes(trimmed) ?? false) ||
          (sub.steps?.some((step) => step.toLowerCase().includes(trimmed)) ?? false) ||
          (sub.bullets?.some((b) => b.toLowerCase().includes(trimmed)) ?? false)
      );

      const inTable =
        section.table?.rows.some((row) =>
          row.some((cell) => cell.toLowerCase().includes(trimmed))
        ) ?? false;

      const inCallout =
        (section.callout?.title.toLowerCase().includes(trimmed) ||
          section.callout?.text.toLowerCase().includes(trimmed)) ??
        false;

      return inHeader || inSubsections || inTable || inCallout;
    });
  }, [query]);

  const effectiveActiveId = useMemo(() => {
    if (filteredSections.length === 0) return "";
    return filteredSections.some((s) => s.id === activeId)
      ? activeId
      : filteredSections[0]!.id;
  }, [filteredSections, activeId]);

  useEffect(() => {
    const syncHashTarget = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const parentId = findParentSectionId(hash);
      if (parentId) {
        requestAnimationFrame(() => {
          setActiveId(parentId);
          document.getElementById(hash)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    };

    syncHashTarget();
    window.addEventListener("hashchange", syncHashTarget);
    return () => window.removeEventListener("hashchange", syncHashTarget);
  }, []);

  useEffect(() => {
    if (filteredSections.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-96px 0px -65% 0px",
        threshold: 0.05,
      }
    );

    filteredSections.forEach((sec) => {
      const el = document.getElementById(sec.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [filteredSections]);

  const jumpToSection = (id: string) => {
    setActiveId(id);
    setMobileTocOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white relative">
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[960px] h-[460px] bg-indigo-600/15 blur-[130px] rounded-full" />
        <div className="absolute top-1/2 -left-24 w-[420px] h-[420px] bg-blue-600/10 blur-[150px] rounded-full" />
      </div>

      {/* Top Sticky Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileTocOpen((prev) => !prev)}
              className="lg:hidden p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:border-slate-700 transition cursor-pointer"
              aria-label="Toggle documentation navigation"
            >
              {mobileTocOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <BrandLogo />
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <Link href="/#features" className="hover:text-white transition-colors">
              Features
            </Link>
            <Link href="/#privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/#download" className="hover:text-white transition-colors">
              Download
            </Link>
            <ResourcesMenu />
            <Link href="/docs" className="text-white font-semibold">
              Docs
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

      {/* Mobile TOC Drawer */}
      {mobileTocOpen && (
        <div className="lg:hidden fixed inset-0 z-40 pt-20 bg-slate-950/90 backdrop-blur-md">
          <div className="h-full overflow-y-auto p-6 space-y-4">
            <MobileResourcesAccordion onNavigate={() => setMobileTocOpen(false)} />

            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search docs..."
                className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-9 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-200 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-1">
              {filteredSections.map((sec) => {
                const isActive = effectiveActiveId === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => jumpToSection(sec.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-between cursor-pointer ${
                      isActive
                        ? "bg-indigo-950/70 border border-indigo-700/60 text-indigo-300"
                        : "text-slate-400 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    <span>{sec.title}</span>
                    <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12 lg:py-16">
        {/* Hero Intro Banner */}
        <div className="mb-12 rounded-3xl border border-slate-800/80 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-8 md:p-10 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-800/50 text-indigo-300 text-xs font-semibold tracking-wide uppercase">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                PRODUCT DOCUMENTATION
              </div>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
                WorkComposer Guide &{" "}
                <span className="bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">
                  Platform Reference
                </span>
              </h1>
              <p className="text-slate-400 text-base md:text-lg leading-relaxed">
                Complete documentation covering desktop tracking modes, time and
                attendance reporting, blurred screenshots, app/URL analytics,
                live location, projects, RBAC roles, and privacy controls.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <a
                href={DESKTOP_DOWNLOAD_URL}
                download
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/25"
              >
                <Download className="w-4 h-4" />
                Windows Agent v1.0.0
              </a>
              <Link
                href="/authenticate/signup"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-sm font-semibold transition"
              >
                Create Workspace
              </Link>
            </div>
          </div>
        </div>

        {/* Sidebar + Content Grid */}
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          {/* Sticky Desktop Left TOC + Search */}
          <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-28 space-y-5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter topics (e.g. RBAC, blur)..."
                aria-label="Search documentation"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-10 pr-9 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-200 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3">
              <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Contents ({filteredSections.length})
              </p>
              <nav className="space-y-1 max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
                {filteredSections.map((sec) => {
                  const isActive = effectiveActiveId === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => jumpToSection(sec.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition flex items-center gap-2.5 cursor-pointer border ${
                        isActive
                          ? "bg-indigo-950/60 border-indigo-700/50 text-indigo-300 font-semibold"
                          : "border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 font-medium"
                      }`}
                    >
                      <span
                        className={`h-4 w-1 rounded-full shrink-0 transition-colors ${
                          isActive ? "bg-indigo-400" : "bg-slate-700"
                        }`}
                      />
                      <span className="truncate">{sec.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Documentation Body */}
          <main className="lg:col-span-8 xl:col-span-9 space-y-8 min-w-0">
            {filteredSections.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-4">
                <p className="text-lg font-semibold text-white">
                  No documentation topics matched &ldquo;{query}&rdquo;
                </p>
                <p className="text-sm text-slate-400">
                  Try searching for keywords like screenshots, timezone, RBAC,
                  Jira, offline queue, or floating bar.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition cursor-pointer"
                >
                  Reset filter
                </button>
              </div>
            ) : (
              filteredSections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-28 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 md:p-8 space-y-6 shadow-xl"
                >
                  <div className="border-b border-slate-800/80 pb-5 space-y-2.5">
                    <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/70 border border-indigo-800/50 px-2.5 py-0.5 rounded-full font-mono">
                      {section.badge}
                    </span>
                    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                      {section.title}
                    </h2>
                    <p className="text-slate-400 leading-relaxed">
                      {section.summary}
                    </p>
                  </div>

                  <div className="space-y-6">
                    {section.subsections.map((sub) => (
                      <div
                        key={sub.heading}
                        id={sub.id}
                        className="scroll-mt-28 space-y-2.5"
                      >
                        <h3 className="text-lg font-semibold text-slate-100">
                          {sub.heading}
                        </h3>
                        <p className="text-sm md:text-[15px] text-slate-300/90 leading-relaxed">
                          {sub.body}
                        </p>
                        {sub.steps && (
                          <ol className="space-y-2.5 pt-1">
                            {sub.steps.map((step, sIdx) => (
                              <li
                                key={step}
                                className="flex items-start gap-3 text-sm text-slate-300"
                              >
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-950/90 border border-indigo-700/60 text-[11px] font-bold text-indigo-300 font-mono">
                                  {sIdx + 1}
                                </span>
                                <span className="leading-relaxed">{step}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {sub.bullets && (
                          <ul className="space-y-2 pt-1">
                            {sub.bullets.map((bullet) => (
                              <li
                                key={bullet}
                                className="flex items-start gap-2.5 text-sm text-slate-300"
                              >
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                                <span className="leading-relaxed">{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {sub.code && (
                          <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/90 p-4 text-xs text-indigo-200 font-mono leading-relaxed">
                            <code>{sub.code}</code>
                          </pre>
                        )}
                        {sub.cta && (
                          <div className="pt-2">
                            <Link
                              href={sub.cta.href}
                              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition shadow-md shadow-indigo-600/20"
                            >
                              <span>{sub.cta.label}</span>
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {section.table && (
                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
                      <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                        <thead className="bg-slate-900/90">
                          <tr>
                            {section.table.headers.map((header) => (
                              <th
                                key={header}
                                className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-300"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {section.table.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-900/50 transition">
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={`px-4 py-3 align-top leading-relaxed ${
                                    cIdx === 0
                                      ? "font-semibold text-indigo-300 whitespace-nowrap"
                                      : "text-slate-300"
                                  }`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {section.callout && <CalloutBox callout={section.callout} />}
                </section>
              ))
            )}
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
            <Link href="/#features" className="hover:text-white transition">
              Features
            </Link>
            <Link href="/#privacy" className="hover:text-white transition">
              Privacy
            </Link>
            <Link href="/#download" className="hover:text-white transition">
              Download
            </Link>
            <Link href="/docs" className="text-white font-medium">
              Docs
            </Link>
          </div>

          <span className="text-xs text-slate-500">© 2026 WorkComposer</span>
        </div>
      </footer>
    </div>
  );
}
