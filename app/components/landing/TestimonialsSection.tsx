'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Quote } from 'lucide-react';

/* ─── Testimonial data — swap in real messages when they arrive ─── */
const TESTIMONIALS = [
    {
        quote: 'SeekEatz helped me discover meals before I even got to the restaurant, to stay on track!',
        name: 'Gael Rios',
        handle: '@earlyaccess',
        avatar: '🥗',
        color: '#06b6d4',
        tilt: '-2.2deg',
    },
    {
        quote: 'I\u2019ve used calorie trackers before, but this is the first time something helped before I ordered, not after.',
        name: 'Andrew',
        handle: '@earlyaccess',
        avatar: '🏋️',
        color: '#8b5cf6',
        tilt: '1.8deg',
    },
    {
        quote: 'I was traveling for work and was able to find a meal to help me stay on track.',
        name: 'Adam M',
        handle: '@earlyaccess',
        avatar: '🔥',
        color: '#10b981',
        tilt: '-1.4deg',
    },
];

/* ─── Tape strip helper ─── */
const tape = (extra: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    width: '56px',
    height: '20px',
    borderRadius: '3px',
    background:
        'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.14) 3px, rgba(255,255,255,0.14) 4px), ' +
        'linear-gradient(to bottom, rgba(205,160,70,0.55) 0%, rgba(178,138,52,0.36) 50%, rgba(205,160,70,0.55) 100%)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.16), inset 0 0 8px rgba(255,255,255,0.2)',
    pointerEvents: 'none',
    zIndex: 10,
    ...extra,
});

function TestimonialCard({
    t,
    delay,
}: {
    t: (typeof TESTIMONIALS)[0];
    delay: number;
}) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        el.style.opacity = '1';
                        el.style.transform = `translateY(0) rotate(${t.tilt})`;
                    }, delay);
                    io.disconnect();
                }
            },
            { threshold: 0.15 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [delay, t.tilt]);

    return (
        <div
            ref={cardRef}
            style={{
                opacity: 0,
                transform: `translateY(36px) rotate(${t.tilt})`,
                transition: 'opacity 0.65s ease, transform 0.65s cubic-bezier(0.22,1,0.36,1)',
                position: 'relative',
                paddingTop: '18px',
            }}
        >
            {/* Tape strips */}
            <div aria-hidden style={tape({ top: '0px', left: '14%', transform: 'rotate(-13deg)' })} />
            <div aria-hidden style={tape({ top: '0px', right: '14%', transform: 'rotate(13deg)' })} />

            {/* Paper card */}
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    background: '#fffef7',
                    borderRadius: '14px',
                    padding: '24px',
                    border: '1px solid rgba(0,0,0,0.07)',
                    boxShadow: hovered
                        ? '6px 20px 48px rgba(0,0,0,0.2), 0 4px 10px rgba(0,0,0,0.07)'
                        : '2px 5px 18px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.05)',
                    transform: hovered
                        ? 'rotate(0deg) translateY(-8px) scale(1.02)'
                        : `rotate(0deg)`,
                    transition: 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.38s ease',
                    cursor: 'default',
                }}
            >
                {/* Quote icon */}
                <div
                    style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: `${t.color}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: '14px',
                    }}
                >
                    <Quote style={{ width: '15px', height: '15px', color: t.color }} strokeWidth={2.5} />
                </div>

                {/* Quote text */}
                <p style={{
                    fontSize: '14px', lineHeight: 1.65, color: '#374151', fontWeight: 500,
                    fontStyle: 'italic', marginBottom: '18px',
                }}>
                    &ldquo;{t.quote}&rdquo;
                </p>

                {/* Stars */}
                <div style={{ display: 'flex', gap: '3px', marginBottom: '14px' }}>
                    {[...Array(5)].map((_, i) => (
                        <svg key={i} viewBox="0 0 16 16" style={{ width: '13px', height: '13px', fill: '#f59e0b' }}>
                            <path d="M8 1l1.85 3.75L14 5.5l-3 2.93.7 4.07L8 10.5l-3.7 1.95.7-4.07L2 5.5l4.15-.75L8 1z" />
                        </svg>
                    ))}
                </div>

                {/* Author */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: `${t.color}18`,
                        border: `1.5px solid ${t.color}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '17px',
                    }}>
                        {t.avatar}
                    </div>
                    <div>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{t.name}</p>
                        <p style={{ fontSize: '11px', color: '#9ca3af' }}>{t.handle}</p>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                        <span style={{
                            fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em',
                            padding: '3px 8px', borderRadius: '999px',
                            background: `${t.color}12`, color: t.color,
                            border: `1px solid ${t.color}28`,
                        }}>
                            Beta tester
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function TestimonialsSection() {
    const headRef = useRef<HTMLDivElement>(null);
    const badgeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const targets = [headRef.current, badgeRef.current].filter(Boolean);
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        (e.target as HTMLElement).style.opacity = '1';
                        (e.target as HTMLElement).style.transform = 'translateY(0)';
                    }
                });
            },
            { threshold: 0.15 }
        );
        targets.forEach((el) => io.observe(el!));
        return () => io.disconnect();
    }, []);

    return (
        <section className="relative bg-[#f0f4f8] py-16 sm:py-20 overflow-hidden">
            {/* Ambient glows */}
            <div className="absolute top-0 left-1/4 w-[480px] h-[480px] bg-amber-200/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-[480px] h-[480px] bg-cyan-200/10 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-5xl mx-auto px-6">

                {/* Heading */}
                <div
                    ref={headRef}
                    style={{ opacity: 0, transform: 'translateY(24px)', transition: 'opacity 0.75s ease, transform 0.75s ease' }}
                    className="text-center mb-6"
                >
                    <p className="text-sm font-semibold text-amber-600 uppercase tracking-widest mb-3">
                        Early access voices
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
                        Real people.{' '}
                        <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                            Real meals.
                        </span>
                    </h2>
                    <p className="text-base text-gray-500 mt-3 max-w-lg mx-auto">
                        Early testers have already found their perfect meals in seconds — not minutes.
                    </p>
                </div>

                {/* Early-access count badge */}
                <div
                    ref={badgeRef}
                    style={{ opacity: 0, transform: 'translateY(16px)', transition: 'opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s' }}
                    className="flex justify-center mb-10"
                >
                    <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/70 border border-amber-200/60 shadow-sm">
                        {/* Pulse dot */}
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                        </span>
                        <p className="text-[13px] font-semibold text-gray-700">
                            <span className="text-amber-600">247 people</span> on the early access waitlist and counting!
                        </p>
                    </div>
                </div>

                {/* Testimonial cards grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                    {TESTIMONIALS.map((t, i) => (
                        <TestimonialCard key={i} t={t} delay={i * 150} />
                    ))}
                </div>
            </div>
        </section>
    );
}
