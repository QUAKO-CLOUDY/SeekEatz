'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';

export default function CTASection() {
    const fadeRef = useRef<HTMLDivElement | null>(null);

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
        if (fadeRef.current) observer.observe(fadeRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <section
            id="cta"
            className="py-20 px-6 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
        >
            <div
                ref={fadeRef}
                className="max-w-3xl mx-auto text-center opacity-0 translate-y-8 transition-all duration-700"
            >
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                    Ready to find your perfect meal?
                </h2>
                <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
                    Join thousands of people eating smarter with AI-powered restaurant
                    recommendations.
                </p>
                <Link href="/upgrade">
                    <Button
                        size="lg"
                        className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-10 py-6 text-lg font-bold shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/40 transition-all hover:-translate-y-0.5"
                    >
                        Get Started Free <ArrowRight className="w-5 h-5 ml-1" />
                    </Button>
                </Link>
            </div>
        </section>
    );
}
