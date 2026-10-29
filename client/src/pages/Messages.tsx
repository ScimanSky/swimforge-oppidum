import AppLayout from "@/components/AppLayout"
import DirectMessages from "@/components/DirectMessages"

/** `/messages`: the shell header carries the «Messaggi» title. */
export default function MessagesPage() {
  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-[1400px]">
        <DirectMessages mode="page" />
      </div>
    </AppLayout>
  )
}
