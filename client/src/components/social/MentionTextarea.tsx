import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from "react"
import { mentionToken } from "@shared/mentions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { getInitials } from "@/lib/format"
import {
  activeMentionQuery,
  addMention,
  insertMention,
  MAX_MENTIONS,
  pickedMentionIds,
  type MentionUser,
} from "@/lib/mentions"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

const SEARCH_DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

type MentionTextareaProps = Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
  /** The users picked so far (also those already in the post when editing). */
  mentions: MentionUser[]
  onMentionsChange: (mentions: MentionUser[]) => void
  /** Shown under the field; false hides it. */
  hint?: string | false
}

type SearchPerson = { userId: number; name?: string | null; username?: string | null; avatarUrl?: string | null }

/**
 * A post text field with «@» mentions: typing «@» and two letters suggests swimmers (debounced
 * search); picking one writes `@username` (else `@name`) and remembers who it is, so the post
 * stores the user id, not a name to look up later.
 */
export function MentionTextarea({
  value,
  onValueChange,
  mentions,
  onMentionsChange,
  hint = "Scrivi @ e un nome per menzionare qualcuno.",
  className,
  onKeyDown,
  onBlur,
  ...props
}: MentionTextareaProps) {
  const listId = useId()
  const hintId = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const pendingCaret = useRef<number | null>(null)

  const active = caret === null ? null : activeMentionQuery(value, caret)
  // Ten at most, counting only the picks still written in the text.
  const writtenCount = useMemo(() => pickedMentionIds(value, mentions).length, [value, mentions])
  const open = active !== null && active.start !== dismissedAt && writtenCount < MAX_MENTIONS
  const query = useDebouncedValue(open ? active.query : "", SEARCH_DEBOUNCE_MS)
  const searchQuery = trpc.community.users.search.useQuery(
    { query, limit: 6 },
    { enabled: open && query.length >= MIN_QUERY_LENGTH }
  )
  const people = (open && query.length >= MIN_QUERY_LENGTH ? (searchQuery.data ?? []) : []) as SearchPerson[]
  const showList = open && people.length > 0
  const noMatch = open && query.length >= MIN_QUERY_LENGTH && searchQuery.data !== undefined && people.length === 0

  useEffect(() => {
    if (pendingCaret.current === null || !ref.current) return
    const position = pendingCaret.current
    pendingCaret.current = null
    ref.current.focus()
    ref.current.setSelectionRange(position, position)
  }, [value])

  const readCaret = () => setCaret(ref.current?.selectionStart ?? null)

  const pick = (person: SearchPerson) => {
    if (!active) return
    const user: MentionUser = {
      userId: Number(person.userId),
      name: person.name?.trim() || null,
      username: person.username?.trim() || null,
    }
    const token = mentionToken({ id: user.userId, name: user.name, username: user.username })
    if (!token) return
    const next = insertMention(value, { start: active.start, end: caret ?? active.start }, token)
    pendingCaret.current = next.caret
    setCaret(next.caret)
    setActiveIndex(0)
    onMentionsChange(addMention(mentions, user, value))
    onValueChange(next.text)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showList) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const step = event.key === "ArrowDown" ? 1 : -1
        setActiveIndex((index) => (index + step + people.length) % people.length)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        pick(people[Math.min(activeIndex, people.length - 1)])
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setDismissedAt(active?.start ?? null)
        return
      }
    }
    onKeyDown?.(event)
  }

  const optionId = (index: number) => `${listId}-option-${index}`
  const describedBy = [props["aria-describedby"], hint ? hintId : null].filter(Boolean).join(" ") || undefined

  return (
    <div className="space-y-1.5">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        aria-autocomplete="list"
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList ? optionId(Math.min(activeIndex, people.length - 1)) : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          onValueChange(event.target.value)
          setCaret(event.target.selectionStart)
          setActiveIndex(0)
          setDismissedAt(null)
        }}
        onSelect={readCaret}
        onClick={readCaret}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          setCaret(null)
          onBlur?.(event)
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Persone da menzionare"
          className="max-h-56 overflow-y-auto rounded-xl border border-border bg-card py-1"
        >
          {people.map((person, index) => {
            const name = person.name?.trim() || person.username?.trim() || "Nuotatore"
            const username = person.username?.trim()
            return (
              <li
                key={person.userId}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                // Keeps the focus (and the caret) in the text field.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(person)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                  index === activeIndex ? "bg-raised" : "hover:bg-raised"
                )}
              >
                <Avatar aria-hidden className="size-7">
                  <AvatarImage src={person.avatarUrl || undefined} alt="" />
                  <AvatarFallback className="text-xs font-semibold">{getInitials(name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{name}</span>
                  {username && username !== name ? (
                    <span className="block truncate text-xs text-muted-foreground">@{username}</span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
      {/* Says how many swimmers are suggested (a screen reader does not see the list appear), or
          that none was found (shown too). */}
      <p aria-live="polite" className={noMatch ? "text-xs text-muted-foreground" : "sr-only"}>
        {noMatch
          ? "Nessun nuotatore trovato."
          : showList
            ? people.length === 1
              ? "1 nuotatore suggerito"
              : `${people.length} nuotatori suggeriti`
            : ""}
      </p>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
