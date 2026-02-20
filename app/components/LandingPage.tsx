'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Menu, X, Check, Minus, Sparkles, BarChart3, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from './ui/table';

/* ──────── Data ──────── */

const FEATURES = [
    {
        badge: 'AI Search',
        icon: <Sparkles className="w-5 h-5" />,
        title: 'AI-Powered Meal Search',
        desc: 'Ask for what you want — low carb, high protein, under 500 calories — and get real meals from restaurants near you. No scrolling through endless menus.',
        image: '/logos/waitlist_photo.png',
        alt: 'SeekEatz AI chat finding meals matching macro goals',
    },
    {
        badge: 'Tracking',
        icon: <BarChart3 className="w-5 h-5" />,
        title: 'Track Your Daily Progress',
        desc: 'Visual calorie ring, macro breakdown, day streaks, and personalized recommendations that adapt to your eating habits.',
        image: '/images/daily-tracking.jpeg',
        alt: 'Daily tracking dashboard with calorie ring and macros',
    },
    {
        badge: 'Nutrition',
        icon: <ShieldCheck className="w-5 h-5" />,
        title: 'Verified Restaurant Nutrition',
        desc: 'Every meal shows calories, protein, carbs, and fat pulled directly from restaurant menus. No crowdsourced guessing — 93%+ match accuracy.',
        image: '/images/meal-detail.jpeg',
        alt: 'Meal detail card with verified nutritional information',
    },
    {
        badge: 'Customization',
        icon: <SlidersHorizontal className="w-5 h-5" />,
        title: 'Smart Meal Customization',
        desc: 'Swap ingredients, modify portions, and see updated macros instantly before you order. Make any meal fit your goals.',
        image: '/images/meal-customize.jpeg',
        alt: 'Meal customization modal showing updated macros',
    },
];

const COMPARISONS = [
    { feature: 'Verified restaurant nutrition', seekeatz: true, mfp: false, noom: false },
    { feature: 'AI meal recommendations', seekeatz: true, mfp: false, noom: false },
    { feature: 'Real-time macro matching', seekeatz: true, mfp: false, noom: false },
    { feature: 'No manual food logging', seekeatz: true, mfp: false, noom: false },
    { feature: 'Smart meal swaps', seekeatz: true, mfp: false, noom: false },
    { feature: 'Nearby restaurant search', seekeatz: true, mfp: 'partial' as const, noom: false },
    { feature: 'Free to try', seekeatz: true, mfp: true, noom: false },
];

const FAQS = [
    {
        q: 'What is SeekEatz?',
        a: 'SeekEatz is an AI-powered meal recommendation app that searches real restaurant menus to find meals matching your macro and calorie goals. No more guessing, no more manual food logging.',
    },
    {
        q: 'How does the AI search work?',
        a: 'Just type what you\'re looking for — like "low carb meal under 500 calories" — and our AI searches verified restaurant nutrition data to find matching meals near you, ranked by macro fit.',
    },
    {
        q: 'Is the nutrition data accurate?',
        a: 'Yes. We pull nutrition data directly from official restaurant PDFs and verified menus. Unlike crowdsourced databases, our data is verified at the source.',
    },
    {
        q: 'How many restaurants are available?',
        a: 'We currently cover 30+ major restaurant chains with thousands of menu items. We add new restaurants every week based on user requests.',
    },
    {
        q: 'Is SeekEatz free?',
        a: 'You get 3 free AI searches to try it out — no signup required. After that, create a free account for unlimited access to all features.',
    },
    {
        q: 'What diet types are supported?',
        a: 'We support high-protein, low-carb, low-fat, keto, vegetarian, vegan, pescatarian, and more. You can also set custom macro ranges for any goal.',
    },
];

/* ──────── Component ──────── */

export default function LandingPage() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const fadeRefs = useRef<(HTMLDivElement | null)[]>([]);

    /* Scroll listener for navbar */
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    /* Intersection observer for fade-in animations */
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

    return (
        <div className="bg-white min-h-screen">
            {/* ─────────────────────── NAVBAR ─────────────────────── */}
            <nav
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
                        ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100'
                        : 'bg-transparent backdrop-blur-sm'
                    }`}
            >
                <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
                    <Link href="/" className={`text-xl font-bold tracking-tight transition-colors ${scrolled ? 'text-gray-900' : 'text-white'}`}>
                        SeekEatz
                    </Link>

                    {/* Desktop */}
                    <div className="hidden md:flex items-center gap-8">
                        <a href="#features" className={`text-sm font-medium transition-colors hover:text-cyan-500 ${scrolled ? 'text-gray-600' : 'text-white/80'}`}>Features</a>
                        <a href="#comparison" className={`text-sm font-medium transition-colors hover:text-cyan-500 ${scrolled ? 'text-gray-600' : 'text-white/80'}`}>Why Us</a>
                        <a href="#faq" className={`text-sm font-medium transition-colors hover:text-cyan-500 ${scrolled ? 'text-gray-600' : 'text-white/80'}`}>FAQ</a>
                        <div className="flex items-center gap-3 ml-4">
                            <Link href="/auth/signin">
                                <Button variant="outline" size="sm" className={`rounded-full ${scrolled ? 'border-gray-300 text-gray-700 hover:bg-gray-50' : 'border-white/40 text-white hover:bg-white/10'}`}>
                                    Log In
                                </Button>
                            </Link>
                            <Link href="/auth/signup">
                                <Button size="sm" className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white shadow-lg shadow-cyan-500/25">
                                    Sign Up
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {/* Mobile hamburger */}
                    <button onClick={() => setMobileOpen(!mobileOpen)} className={`md:hidden p-2 ${scrolled ? 'text-gray-700' : 'text-white'}`}>
                        {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>

                {/* Mobile menu */}
                {mobileOpen && (
                    <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-gray-100 shadow-lg">
                        <div className="px-6 py-4 flex flex-col gap-3">
                            <a href="#features" onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium py-2">Features</a>
                            <a href="#comparison" onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium py-2">Why Us</a>
                            <a href="#faq" onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium py-2">FAQ</a>
                            <div className="flex gap-3 pt-2">
                                <Link href="/auth/signin" className="flex-1">
                                    <Button variant="outline" className="w-full rounded-full border-gray-300 text-gray-700">Log In</Button>
                                </Link>
                                <Link href="/auth/signup" className="flex-1">
                                    <Button className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white">Sign Up</Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </nav>

            {/* ─────────────────────── HERO — Fixed Video ─────────────────────── */}
            {/* The video is position:fixed so all content scrolls over it */}
            <div className="fixed inset-0 w-full h-[70vh] z-0 overflow-hidden">
                <video
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                >
                    <source src="/Banner.mp4" type="video/mp4" />
                </video>
                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
            </div>

            {/* Hero content area — sits over the fixed video */}
            <section className="relative z-10 h-[70vh] flex items-center justify-center">
                <div className="text-center px-6 max-w-3xl mx-auto">
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight mb-5">
                        Find Meals That Fit{' '}
                        <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                            Your Macros.
                        </span>
                    </h1>
                    <p className="text-lg sm:text-xl text-white/80 mb-8 leading-relaxed max-w-xl mx-auto">
                        AI-powered restaurant meal search with verified nutrition data.
                        Tell us what you want — we&apos;ll find it near you.
                    </p>
                    <Link href="/chat">
                        <Button
                            size="lg"
                            className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-10 py-6 text-lg font-bold shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/40 transition-all hover:-translate-y-0.5"
                        >
                            Try It Free <ArrowRight className="w-5 h-5 ml-1" />
                        </Button>
                    </Link>
                    <p className="mt-4 text-sm text-white/50">No signup required · 3 free searches</p>
                </div>
            </section>

            {/* ─────────────────────── Scrollable content (over the video) ─────────────────────── */}
            <div className="relative z-10 bg-white">
                {/* ─── Features Section ─── */}
                <section id="features" className="py-20 px-6">
                    <div className="max-w-6xl mx-auto">
                        <div ref={addFadeRef} className="text-center mb-16 opacity-0 translate-y-8 transition-all duration-700">
                            <Badge variant="secondary" className="mb-4 bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-100 px-4 py-1.5 text-sm">
                                Features
                            </Badge>
                            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
                                Everything you need to eat smarter
                            </h2>
                            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
                                Real restaurant data. AI-powered search. No guesswork.
                            </p>
                        </div>

                        {FEATURES.map((f, i) => (
                            <div
                                key={i}
                                ref={addFadeRef}
                                className={`flex flex-col ${i % 2 !== 0 ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-8 md:gap-16 py-12 md:py-16 opacity-0 translate-y-8 transition-all duration-700`}
                            >
                                {/* Image */}
                                <div className="flex-1 flex justify-center">
                                    <Card className="overflow-hidden border-0 shadow-2xl shadow-gray-200/60 rounded-3xl bg-gradient-to-br from-gray-50 to-white p-2">
                                        <Image
                                            src={f.image}
                                            alt={f.alt}
                                            width={340}
                                            height={600}
                                            className="rounded-2xl object-contain"
                                        />
                                    </Card>
                                </div>

                                {/* Text */}
                                <div className="flex-1 text-center md:text-left">
                                    <Badge variant="secondary" className="mb-3 bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-100 gap-1.5">
                                        {f.icon}
                                        {f.badge}
                                    </Badge>
                                    <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 tracking-tight">
                                        {f.title}
                                    </h3>
                                    <p className="text-gray-500 text-lg leading-relaxed max-w-md">
                                        {f.desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ─── Comparison Section ─── */}
                <section id="comparison" className="py-20 px-6 bg-gray-50/80">
                    <div className="max-w-4xl mx-auto">
                        <div ref={addFadeRef} className="text-center mb-12 opacity-0 translate-y-8 transition-all duration-700">
                            <Badge variant="secondary" className="mb-4 bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 px-4 py-1.5 text-sm">
                                Why SeekEatz
                            </Badge>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
                                Stop guessing. Start eating smarter.
                            </h2>
                            <p className="text-lg text-gray-500 max-w-xl mx-auto">
                                See how we compare to general tracking apps.
                            </p>
                        </div>

                        <div ref={addFadeRef} className="opacity-0 translate-y-8 transition-all duration-700">
                            <Card className="overflow-hidden border border-gray-200 shadow-xl rounded-2xl">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-900 hover:bg-gray-900">
                                            <TableHead className="text-white font-semibold text-left py-4 px-6">Feature</TableHead>
                                            <TableHead className="text-center py-4 px-4">
                                                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent font-bold">SeekEatz</span>
                                            </TableHead>
                                            <TableHead className="text-white/70 text-center py-4 px-4 font-medium">MyFitnessPal</TableHead>
                                            <TableHead className="text-white/70 text-center py-4 px-4 font-medium">Noom</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {COMPARISONS.map((row, i) => (
                                            <TableRow key={i} className="hover:bg-gray-50/80">
                                                <TableCell className="font-medium text-gray-700 py-4 px-6">{row.feature}</TableCell>
                                                <TableCell className="text-center bg-cyan-50/30">
                                                    <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {row.mfp === true ? (
                                                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                                                    ) : row.mfp === 'partial' ? (
                                                        <Minus className="w-5 h-5 text-amber-500 mx-auto" />
                                                    ) : (
                                                        <X className="w-5 h-5 text-red-400 mx-auto" />
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {row.noom === true ? (
                                                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                                                    ) : (
                                                        <X className="w-5 h-5 text-red-400 mx-auto" />
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Card>
                        </div>
                    </div>
                </section>

                {/* ─── FAQ Section ─── */}
                <section id="faq" className="py-20 px-6">
                    <div className="max-w-3xl mx-auto">
                        <div ref={addFadeRef} className="text-center mb-12 opacity-0 translate-y-8 transition-all duration-700">
                            <Badge variant="secondary" className="mb-4 bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100 px-4 py-1.5 text-sm">
                                FAQ
                            </Badge>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
                                Frequently asked questions
                            </h2>
                        </div>

                        <div ref={addFadeRef} className="opacity-0 translate-y-8 transition-all duration-700">
                            <Accordion type="single" collapsible className="w-full">
                                {FAQS.map((faq, i) => (
                                    <AccordionItem key={i} value={`faq-${i}`} className="border-gray-200">
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

                {/* ─── CTA Banner ─── */}
                <section className="py-20 px-6 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
                    <div ref={addFadeRef} className="max-w-3xl mx-auto text-center opacity-0 translate-y-8 transition-all duration-700">
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                            Ready to find your perfect meal?
                        </h2>
                        <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
                            Join thousands of people eating smarter with AI-powered restaurant recommendations.
                        </p>
                        <Link href="/chat">
                            <Button
                                size="lg"
                                className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-10 py-6 text-lg font-bold shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/40 transition-all hover:-translate-y-0.5"
                            >
                                Get Started Free <ArrowRight className="w-5 h-5 ml-1" />
                            </Button>
                        </Link>
                    </div>
                </section>

                {/* ─── Footer ─── */}
                <footer className="bg-gray-950 text-white pt-16 pb-8 px-6">
                    <div className="max-w-6xl mx-auto">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
                            {/* Brand */}
                            <div className="lg:col-span-1">
                                <div className="text-xl font-bold mb-3">SeekEatz</div>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    AI-powered meal recommendations from verified restaurant menus. Find meals that fit your macros — instantly.
                                </p>
                            </div>

                            {/* Product */}
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Product</h4>
                                <div className="flex flex-col gap-2.5">
                                    <a href="#features" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">Features</a>
                                    <a href="#comparison" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">Why Us</a>
                                    <a href="#faq" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">FAQ</a>
                                    <Link href="/chat" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">Try Free</Link>
                                </div>
                            </div>

                            {/* Company */}
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Company</h4>
                                <div className="flex flex-col gap-2.5">
                                    <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">About</a>
                                    <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">Contact</a>
                                    <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">Careers</a>
                                </div>
                            </div>

                            {/* Legal */}
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Legal</h4>
                                <div className="flex flex-col gap-2.5">
                                    <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">Privacy Policy</a>
                                    <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm">Terms of Service</a>
                                </div>
                            </div>
                        </div>

                        {/* Bottom */}
                        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <span className="text-gray-500 text-sm">© 2026 SeekEatz. All rights reserved.</span>
                            <div className="flex gap-4">
                                <a href="#" className="text-gray-500 hover:text-cyan-400 transition-colors" aria-label="Twitter">
                                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                </a>
                                <a href="#" className="text-gray-500 hover:text-cyan-400 transition-colors" aria-label="Instagram">
                                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                                </a>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
