import {
  placeCategories as categories,
  type PlaceCategory,
  type PlaceList,
  type PlaceStatus,
  type TagSummary,
} from "@placard/domain"
import { useMemo } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { categoryLabels } from "@/lib/places"

export function Filters({
  tags,
  lists,
  tag,
  list,
  status,
  category,
  onTag,
  onList,
  onStatus,
  onCategory,
}: {
  readonly tags: ReadonlyArray<TagSummary>
  readonly lists: ReadonlyArray<PlaceList>
  readonly tag?: string | undefined
  readonly list?: string | undefined
  readonly status?: PlaceStatus | undefined
  readonly category?: PlaceCategory | undefined
  readonly onTag: (value: string | undefined) => void
  readonly onList: (value: string | undefined) => void
  readonly onStatus: (value: PlaceStatus | undefined) => void
  readonly onCategory: (value: PlaceCategory | undefined) => void
}) {
  const listOptions = useMemo(() => lists, [lists])
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={category ?? "all"}
        onValueChange={(v) => onCategory(v === "all" ? undefined : (v as PlaceCategory))}
      >
        <SelectTrigger className="w-40" aria-label="Filter by type">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any type</SelectItem>
          {categories.map((value) => (
            <SelectItem key={value} value={value}>
              {categoryLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={tag ?? "all"} onValueChange={(v) => onTag(v === "all" ? undefined : v)}>
        <SelectTrigger className="w-40" aria-label="Filter by tag">
          <SelectValue placeholder="Tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tags</SelectItem>
          {tags.map((t) => (
            <SelectItem key={t.id} value={t.name}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={list ?? "all"} onValueChange={(v) => onList(v === "all" ? undefined : v)}>
        <SelectTrigger className="w-44" aria-label="Filter by list">
          <SelectValue placeholder="List" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All lists</SelectItem>
          {listOptions.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={status ?? "all"}
        onValueChange={(v) => onStatus(v === "all" ? undefined : (v as PlaceStatus))}
      >
        <SelectTrigger className="w-40" aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          <SelectItem value="want_to_go">Want to go</SelectItem>
          <SelectItem value="been_there">Been there</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
