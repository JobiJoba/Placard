/** Product frame for the hero — real library UI, not atmospheric covers. */
export function CrateStage() {
  return (
    <div className="crate-stage crate-stage-shot">
      <img
        className="crate-shot"
        src="/library-hero.webp"
        alt="Placard library — a grid of place cards with photos, ratings, and filters"
        width={1440}
        height={756}
        decoding="async"
        fetchPriority="high"
      />
    </div>
  )
}
