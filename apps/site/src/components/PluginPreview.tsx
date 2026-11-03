import { useEffect, useRef, useState } from "react"

/** Native dialog supplies focus trapping, Escape dismissal and focus restoration. */
export function PluginPreview({ name, image }: { name: string; image: string }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const src = `${import.meta.env.BASE_URL}plugins/${image}`
  useEffect(() => {
    if (!open) return
    dialog.current?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])
  return (
    <>
      <button
        className="plugin-preview"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge ${name} screenshot`}
      >
        <img
          src={src}
          alt={`${name} running in Placard`}
          width={1440}
          height={1050}
          loading="lazy"
        />
        <span>
          See {name} in action <span aria-hidden="true">↗</span>
        </span>
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="plugin-lightbox"
          aria-label={`${name} screenshot`}
          onClose={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              dialog.current?.close()
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close()
          }}
        >
          <div className="plugin-lightbox-bar">
            <span>{name} · Desktop preview</span>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close screenshot"
            >
              Close ×
            </button>
          </div>
          <img
            src={src}
            alt={`${name} running in Placard, full-size desktop preview`}
            width={1440}
            height={1050}
          />
        </dialog>
      )}
    </>
  )
}
