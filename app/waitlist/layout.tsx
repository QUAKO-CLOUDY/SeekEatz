import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Join the SeekEatz Waitlist — First 100 users get first month FREE",
    description:
        "Find meals that fit your macros — instantly. SeekEatz uses verified restaurant nutrition + AI to recommend real meals near you. Join the waitlist today.",
    openGraph: {
        title: "Find meals that fit your macros. Instantly.",
        description:
            "AI-powered meal recommendations from verified restaurant menus. Join the waitlist — First 100 users get first month FREE.",
        type: "website",
        siteName: "SeekEatz",
        images: [
            {
                url: "/logos/waitlist_photo.png",
                width: 800,
                height: 1422,
                alt: "SeekEatz — AI-powered meal recommendations",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Find meals that fit your macros. Instantly.",
        description:
            "AI-powered meal recommendations from verified restaurant menus. Join the waitlist — first 50 users get 3 weeks FREE.",
        images: ["/logos/waitlist_photo.png"],
    },
};

export default function WaitlistLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
