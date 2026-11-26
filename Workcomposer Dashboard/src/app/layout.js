import "./globals.css";
import Script from "next/script";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/context/ThemeContext";

export const metadata = {
  title: "WorkComposer — Time tracking that runs quietly in the background",
  description:
    "WorkComposer runs quietly in the background, logging focused time, app usage, and idle gaps.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="workcomposer-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var s = localStorage.getItem("workcomposer_theme") || localStorage.getItem("workcomposer_desktop_theme") || "system";
                var d = s === "dark" || (s === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
                var root = document.documentElement;
                root.setAttribute("data-theme", d ? "dark" : "light");
                if (d) { root.classList.add("dark"); } else { root.classList.remove("dark"); }
              } catch (e) {}
            })();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {children}

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,

              style: {
                background: "var(--surface-bg, #ffffff)",
                color: "var(--text-primary, #111827)",
                border: "1px solid var(--surface-border, #e5e7eb)",
                borderRadius: "12px",
                padding: "10px 14px",
                fontSize: "13px",
                fontWeight: "500",
                boxShadow:
                  "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                maxWidth: "360px",
              },

              success: {
                style: {
                  background: "var(--toast-success-bg, #f0fdf4)",
                  color: "var(--toast-success-text, #166534)",
                  border: "1px solid var(--toast-success-border, #bbf7d0)",
                },
                iconTheme: {
                  primary: "#16a34a",
                  secondary: "#ffffff",
                },
              },

              error: {
                style: {
                  background: "var(--toast-error-bg, #fef2f2)",
                  color: "var(--toast-error-text, #991b1b)",
                  border: "1px solid var(--toast-error-border, #fecaca)",
                },
                iconTheme: {
                  primary: "#dc2626",
                  secondary: "#ffffff",
                },
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
