"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Information We Collect",
    body: [
      "Account information, including your email address, authentication details, and profile preferences.",
      "Usage data, including searches, saved meals, logs, favorites, and interactions with core app features.",
      "Device and technical information, such as device type, operating system, and app performance diagnostics.",
      "Optional location data when you allow location access so we can show nearby restaurants and meal options.",
      "Subscription and billing status from Apple and our billing providers so premium access can be activated, restored, and managed.",
    ],
  },
  {
    title: "2. How We Use Information",
    body: [
      "Provide and improve the app.",
      "Deliver relevant meal results, nearby restaurant experiences, and personalized recommendations.",
      "Maintain performance, reliability, and security.",
      "Authenticate accounts, sync app state across devices, and restore subscription access.",
      "Communicate with users when necessary.",
    ],
  },
  {
    title: "3. Data Sharing",
    body: [
      "We do not sell personal data.",
      "We may share data with service providers that support authentication, hosting, search, billing, analytics, or infrastructure.",
      "We may disclose data to legal authorities if required by law.",
    ],
  },
  {
    title: "4. Data Security",
    body: [
      "We implement safeguards and security measures designed to protect your information.",
    ],
  },
  {
    title: "5. User Control",
    body: [
      "You may delete your account and associated in-app data from the account settings screen.",
      "You may disable location access at any time through your device settings.",
      "If you subscribe through Apple, subscription cancellation and billing changes are managed through your Apple account.",
      "You may stop using the app at any time.",
    ],
  },
  {
    title: "6. Third-Party Services",
    body: [
      "SeekEatz uses third-party services for authentication, data storage, billing, and AI-powered features. Those services operate under their own terms and privacy policies.",
    ],
  },
  {
    title: "7. Children's Privacy",
    body: [
      "SeekEatz is not intended for children under 13.",
    ],
  },
  {
    title: "8. Changes to Policy",
    body: [
      "We may update this Privacy Policy periodically. Continued use of the app after updates become effective constitutes acceptance of the revised policy.",
    ],
  },
  {
    title: "9. Contact",
    body: [
      "For privacy-related questions, contact support@seekeatz.com.",
    ],
  },
];

export default function PrivacyPage() {
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
          <h1 className="text-xl font-semibold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Effective Date: April 1, 2026</p>
        </div>
      </header>

      <main className="flex-1 bg-background px-4 py-6 pb-24 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <p className="text-sm leading-7 text-muted-foreground">
              SeekEatz respects your privacy and is committed to handling your information responsibly.
            </p>
          </section>

          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm"
            >
              <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
              <div className="mt-3 space-y-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-7 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
