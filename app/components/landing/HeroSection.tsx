'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';

export default function HeroSection() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Small delay so the browser has painted before the transition starts
        const t = setTimeout(() => setVisible(true), 80);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const onReset = () => {
            setVisible(false);
            setTimeout(() => setVisible(true), 80);
        };
        window.addEventListener('seekResetAnimations', onReset);
        return () => window.removeEventListener('seekResetAnimations', onReset);
    }, []);

    return (
        <section
            id="hero"
            className="relative z-10 min-h-screen flex items-center bg-[#f0f4f8] overflow-hidden pt-24"
        >
            {/* Subtle decorative blobs */}
            <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-blue-100/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-slate-200/30 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-7xl mx-auto w-full px-6 sm:px-10 lg:px-16">
                <div className="flex flex-col lg:flex-row items-start gap-12 lg:gap-8">
                    {/* ── Left: Text content ── */}
                    <div
                        className="flex-1 text-center lg:text-left max-w-2xl lg:max-w-none"
                        style={{
                            opacity: visible ? 1 : 0,
                            transform: visible ? 'translateY(0)' : 'translateY(28px)',
                            transition: 'opacity 0.9s ease, transform 0.9s ease',
                        }}
                    >
                        {/* Trust badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200/60 bg-white/70 shadow-sm mb-8">
                            <span className="text-lg">🍽️</span>
                            <span className="text-sm font-medium text-gray-700">
                                AI-Powered Restaurant Search
                            </span>
                        </div>

                        {/* Headline */}
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-[4.25rem] font-extrabold text-gray-900 leading-[1.08] tracking-tight mb-6">
                            Find meals that
                            <br className="hidden sm:block" />{' '}
                            fit{' '}
                            <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                                your macros
                            </span>
                            <br className="hidden sm:block" />{' '}
                            <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
                                instantly
                            </span>
                        </h1>

                        {/* Sub-headline */}
                        <p className="text-lg sm:text-xl text-gray-500 leading-relaxed mb-10 max-w-xl mx-auto lg:mx-0">
                            Search real restaurant meals by calories, protein, 
                            and macros all powered by verified nutrition data.
                        </p>

                        {/* CTA */}
                        <Link href="/chat">
                            <Button
                                size="lg"
                                className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-10 py-6 text-lg font-bold shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all hover:-translate-y-0.5"
                            >
                                Get Started Free
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                        </Link>
                        <p className="mt-4 text-sm text-gray-400">
                            No signup required · 3 free searches
                        </p>
                    </div>

                    {/* ── Right: Phone video ── */}
                    <div
                        className="flex-1 flex justify-center lg:justify-end relative self-stretch min-h-[500px] sm:min-h-[600px] lg:min-h-[700px]"
                        style={{
                            opacity: visible ? 1 : 0,
                            transform: visible ? 'translateY(0)' : 'translateY(20px)',
                            transition: 'opacity 1.1s ease 0.2s, transform 1.1s ease 0.2s',
                        }}
                    >
                        <div className="absolute inset-0 lg:-right-16 overflow-hidden flex items-center justify-center pointer-events-none">
                            {/* Video with reduced brightness for a muted, professional look */}
                            <video
                                className="w-full h-full object-cover brightness-[0.97] contrast-[0.95] saturate-[0.9]"
                                style={{ backgroundColor: '#f0f4f8' }}
                                autoPlay
                                muted
                                loop
                                playsInline
                            >
                                <source src="/m%20iPhone.mp4" type="video/mp4" />
                            </video>

                            {/* Heavy edge feathering — all four sides blend into #f0f4f8 */}
                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to right, #f0f4f8 0%, #f0f4f8 5%, transparent 35%)' }} />
                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to left, #f0f4f8 0%, #f0f4f8 5%, transparent 35%)' }} />
                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, #f0f4f8 0%, #f0f4f8 3%, transparent 25%)' }} />
                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, #f0f4f8 0%, #f0f4f8 3%, transparent 25%)' }} />
                        </div>
                    </div>
                </div>

                {/* ── Social proof — bottom center ── */}
                <div
                    className="flex justify-center pb-12 pt-4"
                    style={{
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(16px)',
                        transition: 'opacity 0.9s ease 0.7s, transform 0.9s ease 0.7s',
                    }}
                >
                    <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white/70 border border-gray-200/60 shadow-sm backdrop-blur-sm">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                        <p className="text-[14px] text-gray-600 font-medium">
                            <span className="font-extrabold text-gray-900">1,000+</span> people have already joined SeekEatz
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
