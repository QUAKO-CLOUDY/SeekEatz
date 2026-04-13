"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Use of the App",
    body:
      "SeekEatz provides nutrition-related information to help users make informed food decisions. The app is intended for informational purposes only.",
  },
  {
    title: "2. No Medical or Dietary Advice",
    body:
      "SeekEatz does not provide medical, nutritional, or health advice. The information provided should not be relied upon as a substitute for professional guidance.",
  },
  {
    title: "3. Accuracy of Information",
    body:
      "We strive to provide accurate and up-to-date information. However, nutrition data may vary due to preparation methods, portion sizes, or restaurant changes. We do not guarantee the accuracy or completeness of any information.",
  },
  {
    title: "4. User Responsibility",
    body:
      "You are responsible for your own dietary choices and decisions. SeekEatz is not liable for outcomes resulting from your use of the app.",
  },
  {
    title: "5. Subscription and Payments",
    body:
        "Certain features may require a paid subscription. Billing and subscription management are handled through the App Store. All purchases are subject to Apple's terms and policies.",
  },
  {
    title: "6. Limitation of Liability",
    body:
      "To the fullest extent permitted by law, SeekEatz and its affiliates are not liable for any direct, indirect, incidental, or consequential damages arising from the use of the app.",
  },
  {
    title: "7. Changes to the Service",
    body:
      "We may update, modify, or discontinue the app or portions of the app at any time without notice.",
  },
  {
    title: "8. Changes to Terms",
    body:
      "We reserve the right to update these Terms. Continued use of the app after changes become effective constitutes acceptance of the updated Terms.",
  },
  {
    title: "9. Contact",
    body: "For questions regarding these Terms, contact support@seekeatz.com.",
  },
];

export default function TermsPage() {
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
          <h1 className="text-xl font-semibold text-foreground">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Effective Date: April 1, 2026</p>
        </div>
      </header>

      <main className="flex-1 bg-background px-4 py-6 pb-24 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <p className="text-sm leading-7 text-muted-foreground">
              Welcome to SeekEatz. By using the SeekEatz application, you agree to the following Terms of Service.
            </p>
          </section>

          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm"
            >
              <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
