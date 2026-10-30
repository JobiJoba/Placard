/** Product frame for the hero — real library UI, not atmospheric covers. */
export function CrateStage() {
  const src = `${import.meta.env.BASE_URL}library-hero.webp`

  return (
    <div className="crate-stage crate-stage-shot">
      <img
        className="crate-shot"
        src={src}
        alt="Placard library — a grid of place cards with photos, ratings, and filters"
        width={1440}
        height={756}
        decoding="async"
        fetchPriority="high"
      />
    </div>
  )
}
