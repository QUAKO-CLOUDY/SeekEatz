'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, LocateFixed, CheckCircle2, BookOpen, EyeOff, ClipboardList, Ruler, Dices } from 'lucide-react';

/* ─── Pain points ─── */
const PAINS = [
    {
        Icon: BookOpen,
        title: 'Restaurant menus rarely list macros',
        desc: 'Most menues show only the dish name and ingredients. No macros. No real breakdown. Just names and prices.',
    },
    {
        Icon: EyeOff,
        title: 'Nutritional data is not always transparent',
        desc: 'The information exists, but it’s not accessible or usable in the moment.',
    },
    {
        Icon: ClipboardList,
        title: 'Finding nutrition mid-order is a mess and time consuming.',
        desc: 'Digging through websites or PDFs while you’re waiting or with company doesn’t work.',
    },
    {
        Icon: Ruler,
        title: 'You feel full but there’s still food on the plate and feel obligated to finish',
        desc: 'So you log it after the fact and hope it didn’t throw off your day.',
    },
    {
        Icon: Dices,
        title: 'You guess… and hope for the best',
        desc: 'Second guessing if you overate or didn\'t hit your goals.',
    },
];

/* ─── Solution steps ─── */
const STEPS = [
    {
        number: '01',
        Icon: Search,
        title: 'Search by calories, macros, or cravings',
        desc: 'Find me lunch for 850 calories or less and at least 40g of protein.',
        accent: '#06b6d4',
        glow: 'rgba(6,182,212,0.18)',
        iconBg: 'rgba(6,182,212,0.12)',
    },
    {
        number: '02',
        Icon: LocateFixed,
        title: 'Filters meals from resaurants in your area',
        desc: 'Only mealcards within your desired radius will be populated.',
        accent: '#8b5cf6',
        glow: 'rgba(139,92,246,0.18)',
        iconBg: 'rgba(139,92,246,0.12)',
    },
    {
        number: '03',
        Icon: CheckCircle2,
        title: 'Browse curated mealcards',
        desc: 'Browse and pick from a large variety of meals that fit fit your desired needs.',
        accent: '#10b981',
        glow: 'rgba(16,185,129,0.18)',
        iconBg: 'rgba(16,185,129,0.12)',
    },
    {
        number: '04',
        Icon: Search,
        title: 'AI smart swaps',
        desc: 'Increase protein, reduce calories, and stay aligned with your goals without guessing.',
        accent: '#f59e0b',
        glow: 'rgba(245,158,11,0.18)',
        iconBg: 'rgba(245,158,11,0.12)',
    },
    {
        number: '05',
        Icon: CheckCircle2,
        title: 'Track without the manual logging',
        desc: 'Auto log to daily tracker with updated data from AI swaps, no manually entry required.',
        accent: '#ef4444',
        glow: 'rgba(239,68,68,0.18)',
        iconBg: 'rgba(239,68,68,0.10)',
    },
];

export default function ProblemSolutionSection() {
    const [revealed, setRevealed] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);
    const [hoveredCard, setHoveredCard] = useState<'problem' | 'solution' | null>(null);

    /* ── Tape strip style factory ── */
    const tape = (extra: React.CSSProperties): React.CSSProperties => ({
        position: 'absolute',
        width: '60px',
        height: '22px',
        borderRadius: '3px',
        background:
            'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.14) 3px, rgba(255,255,255,0.14) 4px), ' +
            'linear-gradient(to bottom, rgba(205,160,70,0.58) 0%, rgba(178,138,52,0.38) 50%, rgba(205,160,70,0.58) 100%)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18), inset 0 0 8px rgba(255,255,255,0.22)',
        pointerEvents: 'none',
        zIndex: 10,
        ...extra,
    });

    /* ── Refs ── */
    const problemHeadRef = useRef<HTMLDivElement>(null);
    const painCardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const ctaBtnRef = useRef<HTMLDivElement>(null);
    const ioRef = useRef<IntersectionObserver | null>(null);

    const solHeadRef = useRef<HTMLDivElement>(null);
    const stepCardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const taglineRef = useRef<HTMLDivElement>(null);
    const solColRef = useRef<HTMLDivElement>(null);

    /* ── Track viewport ── */
    useEffect(() => {
        const check = () => setIsDesktop(window.innerWidth >= 1024);
        check();
        window.addEventListener('resize', check, { passive: true });
        return () => window.removeEventListener('resize', check);
    }, []);

    /* ── Intersection observer for problem half entrance ── */
    const attachObserver = () => {
        if (ioRef.current) ioRef.current.disconnect();

        if (problemHeadRef.current) {
            problemHeadRef.current.style.opacity = '0';
            problemHeadRef.current.style.transform = 'translateY(28px)';
            problemHeadRef.current.style.transition = '';
        }
        painCardRefs.current.forEach((el) => {
            if (!el) return;
            el.style.opacity = '0';
            el.style.transform = 'translateX(-18px)';
            el.style.transition = '';
        });
        if (ctaBtnRef.current) {
            ctaBtnRef.current.style.opacity = '0';
            ctaBtnRef.current.style.transform = 'translateY(12px)';
            ctaBtnRef.current.style.transition = '';
        }

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (!e.isIntersecting) return;
                    io.unobserve(e.target);
                    const el = e.target as HTMLElement;

                    if (el === problemHeadRef.current) {
                        el.style.transition = 'opacity 0.75s ease, transform 0.75s ease';
                        el.style.opacity = '1';
                        el.style.transform = 'translateY(0)';
                    } else if (el === ctaBtnRef.current) {
                        el.style.transition = 'opacity 0.6s ease 0.8s, transform 0.6s ease 0.8s';
                        el.style.opacity = '1';
                        el.style.transform = 'translateY(0)';
                    } else {
                        const idx = parseInt(el.dataset.idx ?? '0', 10);
                        el.style.transition = `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${idx * 110}ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${idx * 110}ms`;
                        el.style.opacity = '1';
                        el.style.transform = 'translateX(0)';
                    }
                });
            },
            { threshold: 0.12 }
        );

        if (problemHeadRef.current) io.observe(problemHeadRef.current);
        painCardRefs.current.forEach((el) => { if (el) io.observe(el); });
        if (ctaBtnRef.current) io.observe(ctaBtnRef.current);
        ioRef.current = io;
    };

    useEffect(() => {
        attachObserver();
        return () => ioRef.current?.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ── Reset ── */
    useEffect(() => {
        const onReset = () => {
            setRevealed(false);

            if (solHeadRef.current) {
                solHeadRef.current.style.opacity = '0';
                solHeadRef.current.style.transform = 'translateY(20px)';
                solHeadRef.current.style.transition = '';
            }
            stepCardRefs.current.forEach((el) => {
                if (!el) return;
                el.style.opacity = '0';
                el.style.transform = 'translateY(24px)';
                el.style.transition = '';
            });
            if (taglineRef.current) {
                taglineRef.current.style.opacity = '0';
                taglineRef.current.style.transform = 'translateY(10px)';
                taglineRef.current.style.transition = '';
            }
            if (solColRef.current) {
                solColRef.current.style.transition = 'none';
                solColRef.current.style.maxHeight = '0';
                solColRef.current.style.opacity = '0';
            }

            setTimeout(() => attachObserver(), 100);
        };
        window.addEventListener('seekResetAnimations', onReset);
        return () => window.removeEventListener('seekResetAnimations', onReset);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ── Solution content enters when revealed ── */
    useEffect(() => {
        if (!revealed) return;

        /* mobile: expand wrapper */
        if (solColRef.current) {
            solColRef.current.style.transition = 'max-height 1s cubic-bezier(0.22,1,0.36,1), opacity 0.5s ease';
            solColRef.current.style.maxHeight = '1400px';
            solColRef.current.style.opacity = '1';
        }

        /* solution heading */
        setTimeout(() => {
            if (solHeadRef.current) {
                solHeadRef.current.style.transition = 'opacity 0.65s ease, transform 0.65s cubic-bezier(0.22,1,0.36,1)';
                solHeadRef.current.style.opacity = '1';
                solHeadRef.current.style.transform = 'translateY(0)';
            }
        }, isDesktop ? 200 : 350);

        /* step cards */
        stepCardRefs.current.forEach((el, i) => {
            if (!el) return;
            setTimeout(() => {
                el.style.transition = 'opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, (isDesktop ? 300 : 500) + i * 140);
        });

        /* tagline */
        setTimeout(() => {
            if (taglineRef.current) {
                taglineRef.current.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
                taglineRef.current.style.opacity = '1';
                taglineRef.current.style.transform = 'translateY(0)';
            }
        }, isDesktop ? 850 : 1050);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revealed]);

    return (
        <section className="relative bg-[#f0f4f8] py-24 sm:py-32 overflow-hidden">
            {/* Ambient glow */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 transition-all duration-[1800ms]"
                style={{
                    background: revealed
                        ? 'radial-gradient(ellipse 55% 45% at 15% 45%, rgba(6,182,212,0.09) 0%, transparent 70%), radial-gradient(ellipse 45% 45% at 85% 55%, rgba(16,185,129,0.07) 0%, transparent 70%)'
                        : 'radial-gradient(ellipse 60% 40% at 75% 45%, rgba(251,146,60,0.09) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 25% 60%, rgba(239,68,68,0.07) 0%, transparent 70%)',
                }}
            />

            <div className="relative mx-auto max-w-5xl px-6 lg:px-8">

                {/*
                  * Single DOM, two visual states.
                  * Desktop: problem shifts from center (translateX(50%)) → left (translateX(0)),
                  *          solution slides in from the right.
                  * Mobile:  single column, solution expands below.
                  */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: isDesktop ? 'row' : 'column',
                        alignItems: isDesktop ? 'stretch' : 'flex-start',
                        gap: isDesktop ? (revealed ? '5rem' : '0') : '0',
                        overflow: 'visible',
                        transition: isDesktop ? 'gap 0.88s cubic-bezier(0.22,1,0.36,1)' : 'none',
                    }}
                >
                    {/* ── PROBLEM COLUMN ── */}
                    <div
                        style={{
                            width: isDesktop ? '50%' : '100%',
                            flexShrink: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            transform: isDesktop ? (revealed ? 'translateX(0)' : 'translateX(50%)') : 'none',
                            transition: isDesktop ? 'transform 0.88s cubic-bezier(0.22,1,0.36,1)' : 'none',
                            paddingTop: '18px',
                        }}
                    >
                        {/* Tape strips — top-left + top-right */}
                        <div aria-hidden style={tape({ top: '0px', left: '14%', transform: 'rotate(-14deg)' })} />
                        <div aria-hidden style={tape({ top: '0px', right: '14%', transform: 'rotate(14deg)' })} />

                        {/* ── Paper card ── */}
                        <div
                            onMouseEnter={() => setHoveredCard('problem')}
                            onMouseLeave={() => setHoveredCard(null)}
                            style={{
                                flex: 1,
                                background: '#fffef7',
                                borderRadius: '14px',
                                padding: '28px 28px 24px',
                                border: '1px solid rgba(0,0,0,0.07)',
                                boxShadow: hoveredCard === 'problem'
                                    ? '6px 22px 52px rgba(0,0,0,0.22), 0 4px 10px rgba(0,0,0,0.08)'
                                    : '3px 6px 22px rgba(0,0,0,0.11), 0 2px 5px rgba(0,0,0,0.06)',
                                transform: hoveredCard === 'problem'
                                    ? 'rotate(0deg) translateY(-8px) scale(1.01)'
                                    : 'rotate(-1.8deg)',
                                transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.4s ease',
                                cursor: 'default',
                            }}
                        >
                            {/* Heading */}
                            <div ref={problemHeadRef} style={{ opacity: 0, transform: 'translateY(28px)' }}>
                                <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-red-400">
                                    <span className="w-5 h-px bg-red-400" />
                                    The Problem
                                </p>
                                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 leading-[1.12]">
                                    Eating out should not be{' '}
                                    <span className="relative inline-block">
                                        <span className="relative z-10">hard to track</span>
                                        <svg viewBox="0 0 220 12" className="absolute -bottom-1 left-0 w-full" aria-hidden preserveAspectRatio="none">
                                            <path d="M2 8 Q55 2 110 8 Q165 14 218 6" stroke="#f97316" strokeWidth="3" fill="none" strokeLinecap="round" />
                                        </svg>
                                    </span>
                                    .
                                </h2>
                                <p className="mt-4 text-[14px] text-gray-500 leading-relaxed">
                                    Every meal out is a gamble without the right info.
                                    Most people give up tracking the moment they leave home.
                                </p>
                            </div>

                            {/* Pain cards */}
                            <div className="mt-5 flex flex-col gap-2.5">
                                {PAINS.map((pain, i) => (
                                    <div
                                        key={i}
                                        ref={(el) => { painCardRefs.current[i] = el; }}
                                        data-idx={i}
                                        style={{ opacity: 0, transform: 'translateX(-18px)' }}
                                        className="flex items-start gap-3 rounded-2xl px-4 py-3.5 bg-white/60 border border-white/80 shadow-sm"
                                    >
                                        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                                            <pain.Icon className="w-3.5 h-3.5 text-red-400" strokeWidth={2} />
                                        </div>
                                        <div>
                                            <p className="text-[13px] font-semibold text-gray-800 leading-snug">{pain.title}</p>
                                            <p className="text-[11.5px] text-gray-500 leading-relaxed mt-0.5">{pain.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* CTA */}
                            <div ref={ctaBtnRef} style={{ opacity: 0, transform: 'translateY(12px)' }} className="mt-7">
                                {!revealed ? (
                                    <button
                                        onClick={() => setRevealed(true)}
                                        className="group relative inline-flex items-center gap-2.5 px-6 py-3 rounded-full font-semibold text-[14px] text-white overflow-hidden shadow-md shadow-orange-300/25 transition-transform duration-200 hover:scale-105 active:scale-95"
                                        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}
                                    >
                                        <span
                                            aria-hidden
                                            className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700"
                                            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)' }}
                                        />
                                        <span>See how SeekEatz fixes this</span>
                                        <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
                                    </button>
                                ) : (
                                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-[13px] font-medium">
                                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 8l4 4 6-6" />
                                        </svg>
                                        Here&apos;s how we fix it
                                    </div>
                                )}
                            </div>
                        </div>{/* end paper card */}
                    </div>

                    {/* ── SOLUTION COLUMN ── */}
                    <div
                        ref={solColRef}
                        style={{
                            width: isDesktop ? '50%' : '100%',
                            flexShrink: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            /* Desktop: slides in from right */
                            ...(isDesktop ? {
                                opacity: revealed ? 1 : 0,
                                transform: revealed ? 'translateX(0)' : 'translateX(52px)',
                                transition: 'opacity 0.65s ease 0.18s, transform 0.88s cubic-bezier(0.22,1,0.36,1) 0.08s',
                                overflow: 'visible',
                            } : {
                                /* Mobile: expands below */
                                maxHeight: revealed ? '1400px' : '0px',
                                opacity: revealed ? 1 : 0,
                                overflow: 'hidden',
                                marginTop: revealed ? '2.5rem' : '0',
                                transition: 'max-height 1s cubic-bezier(0.22,1,0.36,1), opacity 0.5s ease, margin-top 0.5s ease',
                            }),
                            paddingTop: '18px',
                        }}
                    >
                        {/* Mobile divider — outside the card */}
                        {!isDesktop && (
                            <div className="flex items-center gap-3 mb-5">
                                <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.5))' }} />
                                <span className="text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full border"
                                    style={{ color: '#06b6d4', borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.06)' }}>
                                    The Solution
                                </span>
                                <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(16,185,129,0.5), transparent)' }} />
                            </div>
                        )}

                        {/* Tape strips — top-left + top-right */}
                        <div aria-hidden style={tape({ top: '0px', left: '14%', transform: 'rotate(-12deg)' })} />
                        <div aria-hidden style={tape({ top: '0px', right: '14%', transform: 'rotate(12deg)' })} />

                        {/* ── Paper card ── */}
                        <div
                            onMouseEnter={() => setHoveredCard('solution')}
                            onMouseLeave={() => setHoveredCard(null)}
                            style={{
                                flex: 1,
                                background: '#fffef7',
                                borderRadius: '14px',
                                padding: '28px 28px 24px',
                                border: '1px solid rgba(0,0,0,0.07)',
                                boxShadow: hoveredCard === 'solution'
                                    ? '6px 22px 52px rgba(0,0,0,0.22), 0 4px 10px rgba(0,0,0,0.08)'
                                    : '3px 6px 22px rgba(0,0,0,0.11), 0 2px 5px rgba(0,0,0,0.06)',
                                transform: hoveredCard === 'solution'
                                    ? 'rotate(0deg) translateY(-8px) scale(1.01)'
                                    : 'rotate(1.6deg)',
                                transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.4s ease',
                                cursor: 'default',
                            }}
                        >
                            {/* Solution heading */}
                            <div ref={solHeadRef} style={{ opacity: 0, transform: 'translateY(20px)' }} className="mb-6">
                                <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-cyan-500">
                                    <span className="w-5 h-px bg-cyan-400" />
                                    The Solution
                                </p>
                                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 leading-[1.1]">
                                    Meet{' '}
                                    <span className="bg-clip-text text-transparent"
                                        style={{ backgroundImage: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 55%, #10b981 100%)' }}>
                                        SeekEatz
                                    </span>
                                    .
                                </h2>
                                <p className="mt-1.5 text-[14px] text-gray-500 leading-relaxed">
                                    Five steps. No more guesswork.
                                </p>
                            </div>

                            {/* Step cards */}
                            <div className="flex flex-col gap-3">
                                {STEPS.map((step, i) => (
                                    <div
                                        key={i}
                                        ref={(el) => { stepCardRefs.current[i] = el; }}
                                        style={{ opacity: 0, transform: 'translateY(24px)' }}
                                        className="group relative rounded-2xl p-4 bg-white/60 border border-white/80 shadow-sm hover:bg-white/80 hover:shadow-md transition-all duration-300"
                                    >
                                        <div
                                            className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest"
                                            style={{ background: `${step.accent}18`, color: step.accent, border: `1px solid ${step.accent}30` }}
                                        >
                                            {step.number}
                                        </div>
                                        <div className="flex items-start gap-3 mt-1">
                                            <div
                                                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                                                style={{ background: step.iconBg, boxShadow: `0 0 16px ${step.glow}` }}
                                            >
                                                <step.Icon className="w-4 h-4" style={{ color: step.accent }} strokeWidth={2} />
                                            </div>
                                            <div>
                                                <h3 className="text-[13px] font-bold text-gray-900 leading-snug">{step.title}</h3>
                                                <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5">{step.desc}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Tagline */}
                            <div ref={taglineRef} style={{ opacity: 0, transform: 'translateY(10px)' }} className="mt-5 pb-2">
                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 border border-white/80 shadow-sm">
                                    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-cyan-500 shrink-0" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 1.5l7 2.8v5.2c0 3.9-2.9 7.5-7 8.8-4.1-1.3-7-4.9-7-8.8V4.3L10 1.5zm3.7 6.2l-4.2 4.2-1.7-1.8-1.1 1.1 2.8 2.8 5.3-5.3-1.1-1z" clipRule="evenodd" />
                                    </svg>
                                    <p className="text-[11px] text-gray-500 font-medium">
                                        Verified data,{' '}
                                        <span className="text-gray-700 font-semibold">no AI hallucinations</span>
                                    </p>
                                </div>
                            </div>
                        </div>{/* end paper card */}
                    </div>
                </div>

            </div>
        </section>
    );
}
