import type { ImportDecision } from "@placard/domain"
import { Badge } from "@/components/ui/badge"

/** Display label for starred Saved Places.json entries (sourceList is null). */
const SAVED_PLACES = "Saved Places"

export const listLabel = (sourceList: string | null) => sourceList ?? SAVED_PLACES

export const decisionBadge = (decision: ImportDecision) => {
  if (decision === "keep") return <Badge variant="default">keep</Badge>
  if (decision === "skip") return <Badge variant="destructive">skip</Badge>
  return <Badge variant="outline">pending</Badge>
}
