"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const faqItems = [
  {
    question: "What is SeekEatz?",
    answer:
      "SeekEatz is a nutrition discovery app that helps you find restaurant meals that align with your calorie, protein, and dietary goals before you order.",
  },
  {
    question: "How does SeekEatz work?",
    answer:
      "You can search meals by calories, protein, or specific requests, and SeekEatz returns matching options from supported restaurant menus based on available nutrition data.",
  },
  {
    question: "Where does the nutrition data come from?",
    answer:
      "SeekEatz uses nutrition information provided by restaurants and other verified sources. While we aim for accuracy, values may vary based on preparation methods and portion differences.",
  },
  {
    question: "Is the information always accurate?",
    answer:
      "All data comes from restaurant nutrition menus or other vetted sources. We strive to provide reliable information, but nutrition values are still estimates and may vary. Always use your own judgment when making dietary decisions.",
  },
  {
    question: "Is SeekEatz a replacement for a nutritionist or medical advice?",
    answer:
      "No. SeekEatz is a decision-support tool and does not provide medical, nutritional, or dietary advice.",
  },
  {
    question: "Do I need a subscription?",
    answer:
      "SeekEatz offers both free and paid access. Paid plans unlock additional features and remove daily usage limits.",
  },
  {
    question: "Can I cancel my subscription?",
    answer:
      "Yes. Subscriptions can be managed and canceled through your App Store account.",
  },
];

export default function FAQPage() {
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
          <h1 className="text-xl font-semibold text-foreground">FAQ</h1>
          <p className="text-sm text-muted-foreground">Product and subscription basics.</p>
        </div>
      </header>

      <main className="flex-1 bg-background px-4 py-6 pb-24 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {faqItems.map((item) => (
            <section
              key={item.question}
              className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
            >
              <h2 className="text-base font-semibold text-foreground">{item.question}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.answer}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
