export default function Home() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Hero Welcome Banner */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "var(--radius-xl)",
          padding: "2.5rem",
          background:
            "linear-gradient(135deg, rgba(99, 102, 241, 0.16) 0%, rgba(139, 92, 246, 0.12) 100%)",
          border: "1px solid var(--color-surface-border)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ maxWidth: "680px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 0.85rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-primary-light)",
              border: "1px solid var(--color-primary-glow)",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--color-primary)",
              marginBottom: "1rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            🚀 Milestone 1 — Project Foundation Active
          </div>

          <h1
            style={{
              fontSize: "2.25rem",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
              marginBottom: "1rem",
              color: "var(--color-text-primary)",
            }}
          >
            Welcome to{" "}
            <span
              style={{
                background: "var(--color-accent-gradient)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              SynapseSync
            </span>
          </h1>

          <p
            style={{
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              marginBottom: "1.75rem",
            }}
          >
            Your AI-powered study companion. Transform YouTube lectures into
            structured study guides, convert lecture Word docs into Markdown,
            quiz yourself on key concepts, and retain knowledge with spaced
            repetition flashcards.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <button
              id="cta-import-video"
              type="button"
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "var(--radius-md)",
                background: "var(--color-primary)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "0.875rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                boxShadow: "var(--shadow-glow)",
                transition: "background var(--transition-fast)",
              }}
            >
              <span>🎬</span> Import YouTube Lecture
            </button>
            <button
              id="cta-take-quiz"
              type="button"
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "var(--radius-md)",
                background: "var(--color-surface-raised)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-surface-border)",
                fontWeight: 600,
                fontSize: "0.875rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                transition: "all var(--transition-fast)",
              }}
            >
              <span>📝</span> Review Due Cards
            </button>
          </div>
        </div>
      </section>

      {/* Feature Architecture Cards */}
      <section>
        <h2
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            marginBottom: "1.25rem",
          }}
        >
          Core Architecture Modules
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {[
            {
              title: "YouTube Engine",
              badge: "Local CLI",
              icon: "🎬",
              desc: "Local Python CLI fetches transcripts and synthesizes notes with Gemini Flash without cloud IP blocks.",
            },
            {
              title: "Document Parser",
              badge: "Vercel Python",
              icon: "📄",
              desc: "Converts .docx syllabi and notes into clean Markdown using Python stdlib with zero external bloat.",
            },
            {
              title: "Smart Flashcards",
              badge: "SM-2 Alg",
              icon: "🧠",
              desc: "Spaced repetition flashcards with automated interval calculations and offline IndexedDB sync.",
            },
            {
              title: "AI Quiz Generator",
              badge: "Gemini 2.5",
              icon: "✨",
              desc: "Automated multiple-choice questions with instant scoring, feedback, and study reference links.",
            },
          ].map((card) => (
            <div
              key={card.title}
              style={{
                padding: "1.5rem",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-surface-border)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "1.75rem" }}>{card.icon}</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--color-primary-light)",
                    color: "var(--color-primary)",
                  }}
                >
                  {card.badge}
                </span>
              </div>
              <h3
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {card.title}
              </h3>
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
