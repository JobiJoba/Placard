import { useId, useState } from "react"

type CopySnippetProps = {
  code: string
  label?: string
}

export function CopySnippet({ code, label = "Install commands" }: CopySnippetProps) {
  const [copied, setCopied] = useState(false)
  const statusId = useId()

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="snippet">
      <div className="snippet-toolbar">
        <span className="snippet-label">{label}</span>
        <button type="button" className="snippet-copy" onClick={copy} aria-describedby={statusId}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="install-snippet">
        <code>{code}</code>
      </pre>
      <span id={statusId} className="visually-hidden" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  )
}
