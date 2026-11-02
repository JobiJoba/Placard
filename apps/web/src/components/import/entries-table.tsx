import type { ImportDecision, ImportEntry } from "@placard/domain"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { decisionBadge, listLabel } from "./entry-labels"
export function EntriesTable({
  entries,
  selected,
  allSelected,
  someSelected,
  onToggleAll,
  onToggle,
  onDecide,
}: {
  readonly entries: ReadonlyArray<ImportEntry>
  readonly selected: ReadonlySet<string>
  readonly allSelected: boolean
  readonly someSelected: boolean
  readonly onToggleAll: () => void
  readonly onToggle: (id: string) => void
  readonly onDecide: (id: string, decision: ImportDecision) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <ul className="flex flex-col divide-y md:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(entry.id)}
                onChange={() => onToggle(entry.id)}
                aria-label={`Select ${entry.name ?? "entry"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{entry.name ?? "(unnamed)"}</p>
                <p className="text-xs text-muted-foreground">{listLabel(entry.sourceList)}</p>
              </div>
              {decisionBadge(entry.decision)}
            </div>
            <div className="flex gap-2 pl-6">
              <Button
                size="sm"
                variant={entry.decision === "keep" ? "default" : "outline"}
                onClick={() => onDecide(entry.id, "keep")}
              >
                Keep
              </Button>
              <Button
                size="sm"
                variant={entry.decision === "skip" ? "destructive" : "outline"}
                onClick={() => onDecide(entry.id, "skip")}
              >
                Skip
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <table className="hidden w-full min-w-[640px] text-left text-sm md:table">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allSelected && someSelected
                }}
                onChange={onToggleAll}
                aria-label="Select all shown"
              />
            </th>
            <th className="px-2 py-2">Name</th>
            <th className="px-2 py-2">List</th>
            <th className="px-2 py-2">Flags</th>
            <th className="px-2 py-2">Decision</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={`border-b border-border/60 ${
                entry.decision === "skip"
                  ? "bg-destructive/5 text-muted-foreground"
                  : entry.decision === "keep"
                    ? "bg-primary/5"
                    : ""
              }`}
            >
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onChange={() => onToggle(entry.id)}
                  aria-label={`Select ${entry.name ?? "entry"}`}
                />
              </td>
              <td className="px-2 py-2">
                <div className="font-medium">{entry.name ?? "(no name)"}</div>
                <div className="text-xs text-muted-foreground">{entry.address}</div>
              </td>
              <td className="px-2 py-2 text-xs">{listLabel(entry.sourceList)}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  {entry.needsLocation && <Badge variant="outline">needs location</Badge>}
                  {entry.alreadyInLibrary && <Badge variant="outline">in library</Badge>}
                  {entry.crossListDuplicate && <Badge variant="outline">cross-list</Badge>}
                </div>
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-1">
                  {decisionBadge(entry.decision)}
                  {entry.decision !== "keep" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1"
                      onClick={() => onDecide(entry.id, "keep")}
                    >
                      keep
                    </Button>
                  )}
                  {entry.decision !== "skip" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1"
                      onClick={() => onDecide(entry.id, "skip")}
                    >
                      skip
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">No entries match this filter.</p>
      )}
    </div>
  )
}
