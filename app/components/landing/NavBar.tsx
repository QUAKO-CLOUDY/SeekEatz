'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export default function NavBar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 sm:px-6 pt-4 pointer-events-none">
            {/* Compact floating pill — single row, fully rounded */}
            <div
                className={`pointer-events-auto w-full max-w-4xl flex flex-col rounded-full transition-all duration-300 ${
                    scrolled
                        ? 'border border-white/30 shadow-xl shadow-black/10'
                        : 'border border-white/20 shadow-md shadow-black/5'
                }`}
                style={{
                    background: scrolled
                        ? 'rgba(240,244,248,0.18)'
                        : 'rgba(240,244,248,0.10)',
                    backdropFilter: 'blur(16px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                }}
            >
                {/* Main row */}
                <div className="px-4 py-2 flex items-center justify-between gap-4">
                    {/* Logo */}
                    <button
                        onClick={() => {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            window.dispatchEvent(new CustomEvent('seekResetAnimations'));
                        }}
                        className="text-[15px] font-bold tracking-tight text-gray-900 cursor-pointer shrink-0 pl-2"
                    >
                        SeekEatz
                    </button>

                    {/* Desktop nav links — centered */}
                    <div className="hidden md:flex items-center gap-6 flex-1 justify-center">
                        <a
                            href="#features"
                            className="text-[13px] font-medium text-gray-600 transition-colors hover:text-gray-900 whitespace-nowrap"
                        >
                            Features
                        </a>
                        <a
                            href="#why-seekeatz"
                            className="text-[13px] font-medium text-gray-600 transition-colors hover:text-gray-900 whitespace-nowrap"
                        >
                            Why Us
                        </a>
                        <a
                            href="#faq"
                            className="text-[13px] font-medium text-gray-600 transition-colors hover:text-gray-900 whitespace-nowrap"
                        >
                            FAQ
                        </a>
                    </div>

                    {/* Desktop CTA buttons */}
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                        <Link
                            href="/auth/signin"
                            className="px-4 py-1.5 text-[13px] font-medium text-gray-700 rounded-full border border-gray-300/70 bg-white/30 hover:bg-white/50 transition-all"
                        >
                            Log In
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="px-4 py-1.5 text-[13px] font-semibold text-white rounded-full bg-gray-900 hover:bg-gray-700 transition-all shadow-sm"
                        >
                            Sign Up
                        </Link>
                    </div>

                    {/* Mobile hamburger */}
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="md:hidden p-1.5 text-gray-700 rounded-full hover:bg-white/40 transition-colors"
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>

                {/* Mobile dropdown — inside pill, rounded bottom */}
                {mobileOpen && (
                    <div className="md:hidden border-t border-white/30 mx-2 mb-2">
                        <div className="px-4 py-3 flex flex-col gap-1">
                            {['Features|#features', 'Why Us|#why-seekeatz', 'FAQ|#faq'].map((item) => {
                                const [label, href] = item.split('|');
                                return (
                                    <a
                                        key={href}
                                        href={href}
                                        onClick={() => setMobileOpen(false)}
                                        className="text-[14px] font-medium text-gray-700 py-2 px-2 rounded-xl hover:bg-white/40 transition-colors"
                                    >
                                        {label}
                                    </a>
                                );
                            })}
                            <div className="flex gap-2 pt-2">
                                <Link href="/auth/signin" className="flex-1">
                                    <span className="block text-center px-4 py-2 text-[13px] font-medium text-gray-700 rounded-full border border-gray-300/70 bg-white/30 hover:bg-white/50 transition-all">
                                        Log In
                                    </span>
                                </Link>
                                <Link href="/auth/signup" className="flex-1">
                                    <span className="block text-center px-4 py-2 text-[13px] font-semibold text-white rounded-full bg-gray-900 hover:bg-gray-700 transition-all">
                                        Sign Up
                                    </span>
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
}
