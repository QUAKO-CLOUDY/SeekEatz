'use client';

import { useEffect, useRef } from 'react';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '../ui/accordion';

const FAQS = [
    {
        q: 'What is SeekEatz?',
        a: 'SeekEatz is an AI-powered meal recommendation app that searches real restaurant menus to find meals matching your macro and calorie goals. No more guessing, no more manual food logging.',
    },
    {
        q: 'How does the AI search work?',
        a: "Just type what you're looking for — like \"low carb meal under 500 calories\" — and our AI searches verified restaurant nutrition data to find matching meals near you, ranked by macro fit.",
    },
    {
        q: 'How do we get our data?',
        a: 'We pull nutrition data from directly from official restaurant PDFs, verefied nutrition menues, and a wide range of vetted databases.',
    },
    {
        q: 'How many restaurants are available?',
        a: 'We currently have over a couple hundred restaurants available with over 10,000 menue items to choose from.',
    },
    {
        q: 'Is SeekEatz free?',
        a: 'Free — Access AI chat search with up to 3 chats per day. Monthly subscription — Unlock all features, including unlimited chat, filters, and tracking. Lifetime — One-time payment for full access to all features and future updates.',
    },
    {
        q: 'What diet types are supported?',
        a: 'We support High-protein, low-carb, keto, vegetarian, vegan, pescatarian or a fully custom one tailored specific to you. Set your own macro targets and find meals that fit.',
    },
];

export default function FAQSection() {
    const fadeRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add('opacity-100', 'translate-y-0');
                        e.target.classList.remove('opacity-0', 'translate-y-8');
                    }
                });
            },
            { threshold: 0.1 }
        );
        fadeRefs.current.forEach((el) => el && observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const addFadeRef = (el: HTMLDivElement | null) => {
        if (el && !fadeRefs.current.includes(el)) fadeRefs.current.push(el);
    };

    useEffect(() => {
        const onReset = () => {
            fadeRefs.current.forEach((el) => {
                if (!el) return;
                el.classList.remove('opacity-100', 'translate-y-0');
                el.classList.add('opacity-0', 'translate-y-8');
            });
        };
        window.addEventListener('seekResetAnimations', onReset);
        return () => window.removeEventListener('seekResetAnimations', onReset);
    }, []);

    return (
        <section id="faq" className="relative bg-[#f0f4f8] py-24 sm:py-32 px-6 overflow-hidden">
            {/* Ambient glow matching sibling sections */}
            <div className="absolute bottom-0 left-1/4 w-[450px] h-[450px] bg-violet-200/10 rounded-full blur-3xl pointer-events-none" />
            <div className="max-w-3xl mx-auto relative z-10">
                {/* Heading */}
                <div
                    ref={addFadeRef}
                    className="text-center mb-12 opacity-0 translate-y-8 transition-all duration-700"
                >
                    <p className="text-sm font-semibold text-cyan-600 uppercase tracking-widest mb-3">
                        FAQ
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
                        Frequently asked questions
                    </h2>
                </div>

                {/* Accordion */}
                <div
                    ref={addFadeRef}
                    className="opacity-0 translate-y-8 transition-all duration-700"
                >
                    <Accordion type="single" collapsible className="w-full divide-y divide-gray-200">
                        {FAQS.map((faq, i) => (
                            <AccordionItem
                                key={i}
                                value={`faq-${i}`}
                                className="border-0 py-1"
                            >
                                <AccordionTrigger className="text-left text-base sm:text-lg font-semibold text-gray-800 hover:text-cyan-600 hover:no-underline py-5">
                                    {faq.q}
                                </AccordionTrigger>
                                <AccordionContent className="text-gray-500 leading-relaxed text-base">
                                    {faq.a}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </section>
    );
}
