import { useParams } from "react-router"
import { ImportTriagePage } from "@/components/import/import-triage"
import { ImportUploadPage } from "@/components/import/import-upload"

export function ImportPage() {
  const { runId } = useParams()
  if (runId) return <ImportTriagePage runId={runId} />
  return <ImportUploadPage />
}
