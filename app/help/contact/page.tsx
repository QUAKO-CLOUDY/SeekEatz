"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";

export default function ContactPage() {
  const router = useRouter();
  const handleBackToSettings = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("seekeatz_current_screen", "settings");
      localStorage.setItem("seekeatz_nav_history", JSON.stringify(["chat", "settings"]));
    }
    router.push("/chat");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-4 backdrop-blur-md">
        <button
          type="button"
          onClick={handleBackToSettings}
          className="rounded-lg p-2 transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Contact Support</h1>
          <p className="text-sm text-muted-foreground">Questions, issues, or product feedback.</p>
        </div>
      </header>

      <main className="flex-1 bg-background px-4 py-6 pb-24 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                <MessageCircle className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">We&apos;re here to help</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  If you have any questions, issues, or feedback, we&apos;re here to help. We appreciate and welcome your feedback as we continue improving SeekEatz.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                <Mail className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">Support Email</h2>
                <a
                  href="mailto:support@seekeatz.com"
                  className="mt-2 inline-block text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
                >
                  support@seekeatz.com
                </a>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Typical response time is within 24 to 48 hours.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
