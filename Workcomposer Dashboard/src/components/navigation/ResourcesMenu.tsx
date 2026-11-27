"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  Clock,
  Code2,
  FolderKanban,
  Laptop,
  PauseCircle,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";

type MenuLink = {
  label: string;
  href: string;
  description?: string;
  icon?: ReactNode;
};

type MenuColumn = {
  heading: string;
  items: MenuLink[];
  footerLink?: {
    label: string;
    href: string;
  };
};

const RESOURCE_COLUMNS: MenuColumn[] = [
  {
    heading: "GETTING STARTED",
    items: [
      {
        label: "How it works",
        href: "/docs#how-it-works",
        description: "Dashboard, Electron & native helpers",
      },
      {
        label: "Getting started",
        href: "/docs#getting-started",
        description: "Workspace setup & Windows installer",
      },
      {
        label: "User onboarding",
        href: "/docs#user-onboarding",
        description: "Invites, OAuth sign-in & 2FA",
      },
    ],
  },
  {
    heading: "KNOWLEDGE BASE",
    items: [
      {
        label: "Time tracking modes explained",
        href: "/docs#tracking-modes",
        description: "Automatic, Manual & Silent modes",
      },
      {
        label: "External screenshot storage",
        href: "/docs#external-storage",
        description: "Cloudinary TLS & S3/GCS/Azure roadmap",
      },
      {
        label: "Screen capture & blur privacy",
        href: "/docs#screen-capture-blur",
        description: "Capture cadence & blur levels",
      },
    ],
    footerLink: {
      label: "View all articles",
      href: "/docs",
    },
  },
  {
    heading: "WORKCOMPOSER",
    items: [
      {
        label: "Features",
        href: "/#features",
        icon: <Sparkles className="w-4 h-4 text-indigo-400" />,
      },
      {
        label: "Time & screenshot tracking",
        href: "/docs#time-attendance",
        icon: <Clock className="w-4 h-4 text-indigo-400" />,
      },
      {
        label: "Employee website & app usage",
        href: "/docs#usage-productivity",
        icon: <Activity className="w-4 h-4 text-indigo-400" />,
      },
      {
        label: "Offline time tracking",
        href: "/docs#offline-tracking",
        icon: <WifiOff className="w-4 h-4 text-indigo-400" />,
      },
      {
        label: "Idle time tracking",
        href: "/docs#idle-tracking",
        icon: <PauseCircle className="w-4 h-4 text-indigo-400" />,
      },
      {
        label: "Live location & project tracking",
        href: "/docs#live-location",
        icon: <FolderKanban className="w-4 h-4 text-indigo-400" />,
      },
      {
        label: "Privacy & security",
        href: "/docs#privacy-troubleshooting",
        icon: <ShieldCheck className="w-4 h-4 text-indigo-400" />,
      },
    ],
  },
  {
    heading: "DOCUMENTATION",
    items: [
      {
        label: "API documentation",
        href: "/docs#api-documentation",
        description: "Bearer / x-api-key & /api/v1 routes",
        icon: <Code2 className="w-4 h-4 text-indigo-400" />,
      },
      {
        label: "Roles, RBAC & integrations",
        href: "/docs#settings-rbac",
        description: "Multi-manager scope, Slack, Jira, Asana",
        icon: <Laptop className="w-4 h-4 text-indigo-400" />,
      },
      {
        label: "Privacy & troubleshooting FAQ",
        href: "/docs#privacy-troubleshooting",
        description: "Timezone, queues & browser permissions",
        icon: <ShieldCheck className="w-4 h-4 text-indigo-400" />,
      },
    ],
  },
];

export function ResourcesMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimer();
    closeTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 140);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearCloseTimer();
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors cursor-pointer py-2 ${
          open ? "text-white" : "text-slate-400 hover:text-white"
        }`}
      >
        <span>Resources</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            open ? "rotate-180 text-indigo-400" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="fixed left-1/2 -translate-x-1/2 top-20 z-50 w-[min(94vw,960px)] rounded-2xl border border-slate-800/90 bg-slate-950/95 backdrop-blur-2xl shadow-2xl shadow-black/60 p-6 md:p-8"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7">
            {RESOURCE_COLUMNS.map((col) => (
              <div key={col.heading} className="space-y-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 pb-2">
                  {col.heading}
                </h4>

                <ul className="space-y-2">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="group flex items-start gap-2.5 rounded-xl px-2.5 py-2 -mx-2.5 hover:bg-slate-900/90 border border-transparent hover:border-slate-800/80 transition"
                      >
                        {item.icon && (
                          <span className="mt-0.5 shrink-0 opacity-90 group-hover:opacity-100">
                            {item.icon}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="block text-xs text-slate-500 group-hover:text-slate-400 mt-0.5 leading-snug">
                              {item.description}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                {col.footerLink && (
                  <div className="pt-1">
                    <Link
                      href={col.footerLink.href}
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
                    >
                      <span>{col.footerLink.label}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileResourcesAccordion({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-200 hover:text-white cursor-pointer"
      >
        <span>Resources</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            expanded ? "rotate-180 text-indigo-400" : "text-slate-400"
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-800/80 px-4 py-3 space-y-5 bg-slate-950/60">
          {RESOURCE_COLUMNS.map((col) => (
            <div key={col.heading} className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {col.heading}
              </p>
              <ul className="space-y-1.5">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      onClick={() => onNavigate?.()}
                      className="block rounded-lg px-2.5 py-1.5 text-sm text-slate-300 hover:bg-slate-900 hover:text-white transition"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
                {col.footerLink && (
                  <li>
                    <Link
                      href={col.footerLink.href}
                      onClick={() => onNavigate?.()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      <span>{col.footerLink.label}</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

