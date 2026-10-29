const COVERS = [
  { label: "Ramen", hue: "28 42% 38%", delay: "0s" },
  { label: "Harbor", hue: "205 28% 36%", delay: "0.08s" },
  { label: "Bakery", hue: "18 36% 42%", delay: "0.16s" },
  { label: "Park", hue: "142 22% 32%", delay: "0.24s" },
  { label: "Cinema", hue: "265 18% 38%", delay: "0.32s" },
  { label: "Market", hue: "38 40% 40%", delay: "0.4s" },
] as const

/** Atmospheric crate of place covers — visual plane for the hero, not a product screenshot. */
export function CrateStage() {
  return (
    <div className="crate-stage" aria-hidden="true">
      <div className="crate-stage-glow" />
      <div className="crate-grid">
        {COVERS.map((c) => (
          <article
            className="cover"
            key={c.label}
            style={{
              ["--cover-hue" as string]: c.hue,
              animationDelay: c.delay,
            }}
          >
            <span className="cover-spine" />
            <span className="cover-title">{c.label}</span>
          </article>
        ))}
      </div>
    </div>
  )
}
