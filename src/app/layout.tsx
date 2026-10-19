import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SynapseSync — AI Study Companion",
  description:
    "AI-powered study companion with smart notes, spaced repetition flashcards, and automated quiz generation.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0f",
};

import { MsalProviderWrapper } from "@/components/auth/MsalProviderWrapper";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" className={inter.variable}>
      <body className={inter.className}>
        <MsalProviderWrapper>
          <div className="app-container">
            <aside className="app-sidebar" aria-label="Sidebar navigation">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "2rem",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "var(--color-accent-gradient)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "var(--shadow-glow)",
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    color: "#ffffff",
                  }}
                >
                  ⚡
                </div>
                <div>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "1.125rem",
                      letterSpacing: "-0.02em",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    Synapse<span style={{ color: "var(--color-primary)" }}>Sync</span>
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.7rem",
                      color: "var(--color-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    AI Study Companion
                  </span>
                </div>
              </div>

              <nav
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.375rem",
                  flex: 1,
                }}
              >
                {[
                  { label: "Dashboard", href: "/", icon: "🏠" },
                  { label: "Study Notes", href: "/notes", icon: "📚" },
                  { label: "YouTube Notes", href: "/youtube", icon: "▶️" },
                  { label: "Import Notes", href: "/notes/import", icon: "📥" },
                  { label: "Quizzes", href: "/quizzes", icon: "📝" },
                  { label: "Flashcards", href: "/flashcards", icon: "🔄" },
                  { label: "AI Tutor Chat", href: "/chat", icon: "💬" },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.625rem 0.875rem",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "transparent",
                      color: "var(--color-text-secondary)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                      textDecoration: "none",
                      transition: "all var(--transition-fast)",
                      border: "1px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </nav>

              <div
                style={{
                  padding: "0.875rem",
                  borderRadius: "var(--radius-lg)",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-surface-border)",
                  marginTop: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "var(--color-primary-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-primary)",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                  }}
                >
                  SS
                </div>
                <div style={{ overflow: "hidden" }}>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    Local Workspace
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Offline Ready (PWA)
                  </div>
                </div>
              </div>
            </aside>

            <main className="app-main">
              <header
                style={{
                  height: "var(--header-height)",
                  borderBottom: "1px solid var(--color-surface-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 var(--space-8)",
                  background: "var(--glass-bg)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}
              >
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span>SynapseSync</span> /{" "}
                  <strong style={{ color: "var(--color-text-primary)" }}>
                    Knowledge Hub
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      fontSize: "0.75rem",
                      color: "var(--color-success)",
                      background: "var(--color-success-bg)",
                      padding: "0.25rem 0.625rem",
                      borderRadius: "var(--radius-full)",
                      fontWeight: 500,
                    }}
                  >
                    ● System Online
                  </span>
                </div>
              </header>

              <div className="app-content">{children}</div>
            </main>
          </div>
        </MsalProviderWrapper>
      </body>
    </html>
  );
}
