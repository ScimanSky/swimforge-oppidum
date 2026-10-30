import { useEffect, useRef } from "react"

/**
 * While `open`, the Android back button (and the browser's «Indietro») closes the sheet instead
 * of leaving the page: opening pushes a history entry on the same URL, back pops it and calls
 * `onClose`. Closing the sheet any other way removes that entry again (only if the page is still
 * the one it was opened on). The same pattern as CreatePostSheet and ShareActivityPicker.
 */
export function useCloseOnBack(open: boolean, onClose: () => void, stateKey: string) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open || typeof window === "undefined") return

    const openedOn = `${window.location.pathname}${window.location.search}${window.location.hash}`
    window.history.pushState({ ...(window.history.state ?? {}), [stateKey]: true }, "", window.location.href)
    let entryActive = true
    let closedByBack = false

    const handlePopState = () => {
      if (!entryActive) return
      closedByBack = true
      entryActive = false
      onCloseRef.current()
    }
    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      if (!entryActive) return
      entryActive = false
      const pathNow = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (!closedByBack && openedOn === pathNow) window.history.back()
    }
  }, [open, stateKey])
}
