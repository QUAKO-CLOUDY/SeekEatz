'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
    Sparkles,
    ShieldCheck,
    ArrowLeftRight,
    BarChart3,
    Heart,
    SlidersHorizontal,
    type LucideIcon,
} from 'lucide-react';

/* ─── 6 Deliverables ─── */
const FEATURES: {
    title: string;
    desc: string;
    Icon: LucideIcon;
    gradientFrom: string;
    gradientTo: string;
    shadow: string;
    glowColor: string;
}[] = [
    {
        title: 'AI Meal Search',
        desc: 'Chat naturally and get real restaurant meals matching your exact macros.',
        Icon: Sparkles,
        gradientFrom: '#06b6d4',
        gradientTo: '#3b82f6',
        shadow: 'rgba(6,182,212,0.40)',
        glowColor: 'rgba(6,182,212,0.15)',
    },
    {
        title: 'Verified Nutrition',
        desc: 'Real data from restaurant menus. No guessing, no crowdsourced estimates.',
        Icon: ShieldCheck,
        gradientFrom: '#10b981',
        gradientTo: '#059669',
        shadow: 'rgba(16,185,129,0.40)',
        glowColor: 'rgba(16,185,129,0.15)',
    },
    {
        title: 'Smart Swaps',
        desc: 'Swap ingredients and see updated macros instantly before ordering.',
        Icon: ArrowLeftRight,
        gradientFrom: '#f59e0b',
        gradientTo: '#ef4444',
        shadow: 'rgba(245,158,11,0.40)',
        glowColor: 'rgba(245,158,11,0.15)',
    },
    {
        title: 'Daily Tracking',
        desc: 'Calorie ring, macro bars, streaks, and smart daily recommendations.',
        Icon: BarChart3,
        gradientFrom: '#6366f1',
        gradientTo: '#8b5cf6',
        shadow: 'rgba(99,102,241,0.40)',
        glowColor: 'rgba(99,102,241,0.15)',
    },
    {
        title: 'Favorites',
        desc: 'Save meals you love and access them instantly anytime.',
        Icon: Heart,
        gradientFrom: '#ec4899',
        gradientTo: '#f43f5e',
        shadow: 'rgba(236,72,153,0.40)',
        glowColor: 'rgba(236,72,153,0.15)',
    },
    {
        title: 'Macro Filtering',
        desc: 'Filter by calories, protein, carbs, and fat — only see meals that qualify.',
        Icon: SlidersHorizontal,
        gradientFrom: '#0ea5e9',
        gradientTo: '#7c3aed',
        shadow: 'rgba(14,165,233,0.40)',
        glowColor: 'rgba(14,165,233,0.15)',
    },
];

/* Hexagon: 6 points at 60° intervals, starting from top */
const HEX_ANGLES_DEG = [-90, -30, 30, 90, 150, 210];

/* Per-breakpoint orbit radius (px) */
const RADIUS = { sm: 140, md: 178, lg: 218, xl: 248 };

function getRadius(): number {
    if (typeof window === 'undefined') return RADIUS.xl;
    const w = window.innerWidth;
    if (w < 500) return RADIUS.sm;
    if (w < 768) return RADIUS.md;
    if (w < 1024) return RADIUS.lg;
    return RADIUS.xl;
}

/* ─── Component ─── */
export default function FeaturesSection() {
    const triggerRef = useRef<HTMLDivElement>(null);
    const [triggered, setTriggered] = useState(false);
    const [radius, setRadius] = useState(RADIUS.xl);
    const ioRef = useRef<IntersectionObserver | null>(null);

    const attachObserver = useCallback(() => {
        if (ioRef.current) ioRef.current.disconnect();
        const el = triggerRef.current;
        if (!el) return;
        ioRef.current = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setTriggered(true);
                    ioRef.current?.disconnect();
                }
            },
            { threshold: 0.62 },
        );
        ioRef.current.observe(el);
    }, []);

    /* Measure radius on mount + resize */
    useEffect(() => {
        const update = () => setRadius(getRadius());
        update();
        window.addEventListener('resize', update, { passive: true });
        return () => window.removeEventListener('resize', update);
    }, []);

    /* Fire animation once section center hits viewport center */
    useEffect(() => {
        attachObserver();
        return () => ioRef.current?.disconnect();
    }, [attachObserver]);

    useEffect(() => {
        const onReset = () => {
            setTriggered(false);
            setTimeout(attachObserver, 100);
        };
        window.addEventListener('seekResetAnimations', onReset);
        return () => window.removeEventListener('seekResetAnimations', onReset);
    }, [attachObserver]);

    return (
        <section
            id="features"
            ref={triggerRef}
            className="relative bg-[#f0f4f8] py-24 sm:py-32 overflow-hidden"
        >
            {/* Float keyframes injected here to avoid global CSS */}
            <style>{`
                @keyframes seekFloat {
                    0%, 100% { transform: translate(-50%, -50%) scale(1) translateY(0px); }
                    50%       { transform: translate(-50%, -50%) scale(1) translateY(-10px); }
                }
            `}</style>
            {/* Seamless blend from previous section */}
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#f0f4f8] to-transparent pointer-events-none" />

            {/* Ambient glow blobs */}
            <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-cyan-300/8 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-violet-300/8 rounded-full blur-3xl pointer-events-none" />

            {/* Background app screenshots — vertically centered on sides, visible without scrolling */}
            <img
                src="/logos/waitlist_photo.png"
                alt=""
                aria-hidden
                className="absolute pointer-events-none select-none object-contain rounded-2xl"
                style={{
                    top: '30%',
                    left: '7rem',
                    width: 280,
                    maxWidth: '20%',
                    opacity: triggered ? 0.62 : 0,
                    filter: 'blur(0.5px) saturate(0.5)',
                    transform: triggered
                        ? 'translateY(-50%) rotate(-3deg) scale(1)'
                        : 'translateY(-50%) rotate(-3deg) scale(0.9)',
                    transition: 'opacity 1.8s ease 5.5s, transform 1.8s ease 5.5s',
                    zIndex: 0,
                }}
            />
            <img
                src="/images/low_fat.jpeg"
                alt=""
                aria-hidden
                className="absolute pointer-events-none select-none object-contain rounded-2xl"
                style={{
                    top: '60%',
                    right: '7rem',
                    width: 280,
                    maxWidth: '20%',
                    opacity: triggered ? 0.62 : 0,
                    filter: 'blur(0.5px) saturate(0.5)',
                    transform: triggered
                        ? 'translateY(-50%) rotate(3deg) scale(1)'
                        : 'translateY(-50%) rotate(3deg) scale(0.9)',
                    transition: 'opacity 1.8s ease 5.5s, transform 1.8s ease 5.5s',
                    zIndex: 0,
                }}
            />


            <div className="max-w-6xl mx-auto px-6">
                {/* Section label — always visible */}
                <div className="text-center mb-16">
                    <p className="text-sm font-semibold text-cyan-600 uppercase tracking-widest mb-3">
                        Everything You Need
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
                        What We{' '}
                        <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                            Deliver
                        </span>
                    </h2>
                    <p className="text-base sm:text-lg text-gray-500 mt-3 max-w-xl mx-auto">
                        Six powerful tools to transform how you eat.
                    </p>
                </div>

                {/* ── Hexagon arena ── */}
                <div
                    className="relative mx-auto pointer-events-none"
                    style={{
                        width: radius * 2 + 260,
                        height: radius * 2 + 260,
                        maxWidth: '100%',
                        aspectRatio: '1 / 1',
                    }}
                >
                    {/* Dashed orbit ring — fades in with cards */}
                    <svg
                        className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-1000"
                        style={{ opacity: triggered ? 0.10 : 0 }}
                        viewBox={`0 0 ${radius * 2 + 260} ${radius * 2 + 260}`}
                    >
                        <circle
                            cx={(radius * 2 + 260) / 2}
                            cy={(radius * 2 + 260) / 2}
                            r={radius}
                            fill="none"
                            stroke="#94a3b8"
                            strokeWidth="1"
                            strokeDasharray="6 8"
                        />
                    </svg>

                    {/* Center card */}
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-center transition-all duration-1000 pointer-events-none"
                        style={{
                            opacity: triggered ? 1 : 0,
                            transform: triggered
                                ? 'translate(-50%, -50%) scale(1)'
                                : 'translate(-50%, -50%) scale(0.88)',
                            transitionDelay: '0ms',
                        }}
                    >
                        <div className="bg-white/80 backdrop-blur-xl rounded-3xl px-7 py-6 sm:px-9 sm:py-8 border border-white/90 shadow-xl shadow-gray-200/50">
                            <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
                                What We{' '}
                                <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                                    Deliver
                                </span>
                            </h3>
                            <p className="text-xs sm:text-sm text-gray-400 mt-1.5 max-w-[160px] mx-auto">
                                Six tools, one app.
                            </p>
                        </div>
                    </div>

                    {/* Feature cards around hexagon */}
                    {FEATURES.map((f, i) => {
                        const angleRad = (HEX_ANGLES_DEG[i] * Math.PI) / 180;
                        const cx = (radius * 2 + 260) / 2 + Math.cos(angleRad) * radius;
                        const cy = (radius * 2 + 260) / 2 + Math.sin(angleRad) * radius;
                        // One-by-one reveal: 800ms gap between each card
                        const delay = 100 + i * 800;
                        // Float starts after entrance completes; stagger phase per card
                        const floatDelay = delay + 900 + i * 400;

                        return (
                            <div
                                key={i}
                                className="absolute z-20 transition-all pointer-events-auto"
                                style={{
                                    left: cx,
                                    top: cy,
                                    transform: triggered
                                        ? 'translate(-50%, -50%) scale(1)'
                                        : 'translate(-50%, -50%) scale(0.5)',
                                    opacity: triggered ? 1 : 0,
                                    transitionProperty: 'transform, opacity',
                                    transitionDuration: '900ms',
                                    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                                    transitionDelay: `${delay}ms`,
                                    animation: triggered
                                        ? `seekFloat 4.5s ease-in-out ${floatDelay}ms infinite`
                                        : 'none',
                                    willChange: 'transform, opacity',
                                }}
                            >
                                <div
                                    className="w-[170px] sm:w-[210px] lg:w-[235px] rounded-2xl p-4 sm:p-5 border border-white/80 backdrop-blur-md cursor-default select-none group transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                                    style={{
                                        background: `linear-gradient(145deg, ${f.glowColor}, rgba(255,255,255,0.93))`,
                                        boxShadow: `0 0 32px 5px ${f.shadow}, 0 6px 20px ${f.shadow}`,
                                    }}
                                >
                                    {/* Icon */}
                                    <div
                                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110"
                                        style={{
                                            background: `linear-gradient(135deg, ${f.gradientFrom}, ${f.gradientTo})`,
                                            boxShadow: `0 4px 12px ${f.shadow}`,
                                        }}
                                    >
                                        <f.Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow-sm" />
                                    </div>
                                    <h3 className="text-gray-900 font-bold text-sm sm:text-[15px] leading-snug mb-1.5">
                                        {f.title}
                                    </h3>
                                    <p className="text-gray-500 text-[11px] sm:text-xs leading-relaxed">
                                        {f.desc}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
