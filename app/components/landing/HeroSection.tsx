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
            className="relative z-10 overflow-hidden bg-[#f0f4f8] pt-14 pb-4 sm:pt-16 sm:pb-6"
        >
            {/* Subtle decorative blobs */}
            <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-blue-100/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-slate-200/30 rounded-full blur-3xl pointer-events-none" />

            <div className="mx-auto w-full max-w-7xl px-4 sm:px-10 lg:px-16">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-10 lg:gap-8">
                    {/* ── Left: Text content ── */}
                    <div
                        className="flex-1 text-center lg:text-left max-w-2xl lg:max-w-none"
                        style={{
                            opacity: visible ? 1 : 0,
                            transform: visible ? 'translateY(0)' : 'translateY(28px)',
                            transition: 'opacity 0.9s ease, transform 0.9s ease',
                        }}
                    >
                        {/* Headline */}
                        <h1 className="mb-6 text-3xl font-extrabold leading-[1.08] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl xl:text-[4.25rem]">
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
                        <p className="mb-10 mx-auto max-w-xl text-base leading-relaxed text-gray-500 sm:text-xl lg:mx-0">
                            Search real restaurant meals by calories, protein, 
                            and macros all powered by verified nutrition data.
                        </p>

                        {/* CTA */}
                        <div className="inline-flex flex-col items-center sm:translate-x-1">
                            <Link href="/upgrade">
                                <Button
                                    size="lg"
                                    className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-8 py-6 text-base font-bold text-white shadow-xl shadow-cyan-500/20 transition-all hover:-translate-y-0.5 hover:from-cyan-400 hover:to-blue-400 hover:shadow-cyan-500/30 sm:w-auto sm:px-10 sm:text-lg"
                                >
                                    Find meals near you
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>
                            </Link>
                            <p className="mt-4 text-center text-sm text-gray-400">
                                2 free searches every 24 hours
                            </p>
                        </div>
                    </div>

                    {/* ── Right: Phone video ── */}
                    <div
                        className="relative flex min-h-[320px] flex-1 self-stretch justify-center sm:min-h-[460px] lg:min-h-[620px] lg:justify-end"
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
                    className="flex justify-center pt-1 pb-0 sm:pt-3"
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
                            Verified restaurant nutrition data
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
