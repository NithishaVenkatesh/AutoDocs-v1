"use client"

import { SignIn } from "@clerk/nextjs"

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <SignIn redirectUrl="/dashboard"
        appearance={{
          elements: {
            rootBox:
              "w-full space-y-6 rounded-2xl bg-neutral-900 bg-[radial-gradient(circle_at_50%_0%,theme(colors.white/10%),transparent)] px-4 py-10 ring-1 ring-inset ring-white/5 sm:w-96 sm:px-8",
            card: "shadow-none bg-transparent", // removes default gray card
            headerTitle: "text-xl font-medium tracking-tight text-white",
            headerSubtitle: "text-sm text-neutral-400",
            socialButtonsBlockButton:
              "flex w-full items-center justify-center gap-x-3 rounded-md bg-neutral-700 px-3.5 py-1.5 text-sm font-medium text-white shadow-[0_1px_0_0_theme(colors.white/5%)_inset,0_0_0_1px_theme(colors.white/2%)_inset] outline-none hover:bg-gradient-to-b hover:from-white/5 hover:to-white/5 focus-visible:outline-[1.5px] focus-visible:outline-offset-2 focus-visible:outline-white active:bg-gradient-to-b active:from-black/20 active:to-black/20 active:text-white/70",
            formButtonPrimary:
              "rounded-md bg-white text-black font-medium hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
            footerActionText: "text-sm text-neutral-400",
            footerActionLink:
              "font-medium text-white decoration-white/20 underline-offset-4 hover:underline",
          },
        }}
      />
    </div>
  )
}
