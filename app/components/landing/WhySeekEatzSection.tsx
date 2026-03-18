'use client';

import React, { useEffect, useRef } from 'react';
import { Check, Minus, X, Sparkles } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from '@/app/components/ui/animated-table';

const COMPARISONS = [
    { feature: 'Decision-first, not logging-first', seekeatz: true, mfp: false, loseit: false },
    { feature: 'Conversational AI concierge', seekeatz: true, mfp: false, loseit: false },
    { feature: 'Smart AI meal swaps', seekeatz: true, mfp: false, loseit: false },
    { feature: 'Verified nutrition database', seekeatz: true, mfp: 'partial' as const, loseit: 'partial' as const },
    { feature: 'Built for eating out', seekeatz: true, mfp: false, loseit: false },
    { feature: 'No crowdsourced guesses', seekeatz: true, mfp: false, loseit: false },
];

function CheckCell({ value }: { value: boolean | 'partial' }) {
    if (value === true)
        return (
            <div className="flex items-center justify-center">
                <span className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                </span>
            </div>
        );
    if (value === 'partial')
        return (
            <div className="flex items-center justify-center">
                <span className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                    <Minus className="w-4 h-4 text-amber-500 stroke-[2.5]" />
                </span>
            </div>
        );
    return (
        <div className="flex items-center justify-center">
            <span className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center">
                <X className="w-4 h-4 text-red-400 stroke-[2.5]" />
            </span>
        </div>
    );
}

// Animated table row component with scroll-triggered animation
function AnimatedTableRow({ 
    children, 
    index = 0, 
    className 
}: { 
    children: React.ReactNode; 
    index?: number;
    className?: string;
}) {
    const ref = React.useRef<HTMLTableRowElement>(null);
    const isInView = useInView(ref, { 
        once: true, 
        margin: '-50px 0px',
        amount: 0.3
    });

    return (
        <motion.tr
            ref={ref}
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ 
                duration: 0.4, 
                delay: index * 0.1,
                ease: [0.22, 1, 0.36, 1]
            }}
            className={className}
        >
            {children}
        </motion.tr>
    );
}

export default function WhySeekEatzSection() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const targets = [sectionRef.current, tableRef.current].filter(Boolean);
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        (e.target as HTMLElement).style.opacity = '1';
                        (e.target as HTMLElement).style.transform = 'translateY(0)';
                    }
                });
            },
            { threshold: 0.1 }
        );
        targets.forEach((el) => observer.observe(el!));
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const onReset = () => {
            if (sectionRef.current) {
                sectionRef.current.style.opacity = '0';
                sectionRef.current.style.transform = 'translateY(24px)';
            }
            if (tableRef.current) {
                tableRef.current.style.opacity = '0';
                tableRef.current.style.transform = 'translateY(32px)';
            }
        };
        window.addEventListener('seekResetAnimations', onReset);
        return () => window.removeEventListener('seekResetAnimations', onReset);
    }, []);

    return (
        <section id="why-seekeatz" className="relative bg-[#f0f4f8] py-24 sm:py-32 overflow-hidden">
            {/* Ambient glows matching FeaturesSection */}
            <div className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-cyan-200/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-violet-200/10 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-5xl mx-auto px-6">
                {/* Heading */}
                <div
                    ref={sectionRef}
                    style={{ opacity: 0, transform: 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}
                    className="text-center mb-16"
                >
                    <p className="text-sm font-semibold text-cyan-600 uppercase tracking-widest mb-3">
                        Your positioning advantage
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
                        Why SeekEatz Is{' '}
                        <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                            Different
                        </span>
                    </h2>
                    <p className="text-base sm:text-lg text-gray-500 mt-3 max-w-2xl mx-auto">
                        MyFitnessPal and LoseIt are <span className="font-semibold text-gray-700">logging tools</span>. SeekEatz is a <span className="font-semibold text-gray-700">decision tool</span> — built from the ground up for eating out, not manually logging everything after the fact.
                    </p>
                </div>

                {/* Table card */}
                <div
                    ref={tableRef}
                    style={{ opacity: 0, transform: 'translateY(32px)', transition: 'opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s' }}
                    className="relative rounded-3xl overflow-hidden shadow-2xl shadow-gray-300/30"
                >
                    {/* Subtle gradient border effect */}
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-400/20 via-transparent to-violet-400/20 pointer-events-none z-0" />

                    <div className="relative z-10 overflow-x-auto rounded-3xl border border-white/80 bg-white/60 backdrop-blur-xl">
                        <Table className="w-full text-sm">
                            {/* Header */}
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-left py-5 px-6 text-gray-500 font-semibold text-xs uppercase tracking-widest w-[42%]">
                                        Feature
                                    </TableHead>
                                    {/* SeekEatz column — highlighted */}
                                    <TableHead className="py-5 px-4 text-center w-[19%]">
                                        <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md shadow-cyan-300/40">
                                            <Sparkles className="w-3 h-3" />
                                            SeekEatz
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-5 px-4 text-center text-gray-400 font-semibold text-xs uppercase tracking-widest w-[19%]">
                                        MyFitnessPal
                                    </TableHead>
                                    <TableHead className="py-5 px-4 text-center text-gray-400 font-semibold text-xs uppercase tracking-widest w-[19%]">
                                        LoseIt
                                    </TableHead>
                                </TableRow>
                                {/* Thin separator */}
                                <TableRow>
                                    <TableCell colSpan={4} className="p-0">
                                        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                    </TableCell>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {COMPARISONS.map((row, i) => (
                                    <React.Fragment key={i}>
                                        <AnimatedTableRow
                                            index={i}
                                            className="group transition-colors duration-150 hover:bg-cyan-50/40"
                                        >
                                            <TableCell className="py-4 px-6 text-gray-700 font-medium">
                                                {row.feature}
                                            </TableCell>
                                            {/* SeekEatz col — soft highlight strip */}
                                            <TableCell className="py-4 px-4 bg-gradient-to-b from-cyan-50/60 to-blue-50/40 border-x border-cyan-100/60">
                                                <CheckCell value={row.seekeatz} />
                                            </TableCell>
                                            <TableCell className="py-4 px-4">
                                                <CheckCell value={row.mfp} />
                                            </TableCell>
                                            <TableCell className="py-4 px-4">
                                                <CheckCell value={row.loseit} />
                                            </TableCell>
                                        </AnimatedTableRow>
                                        {i < COMPARISONS.length - 1 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="p-0">
                                                    <div className="h-px bg-gray-100 mx-6" />
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </React.Fragment>
                                ))}
                            </TableBody>

                            {/* Footer score row */}
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={4} className="p-0">
                                        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                    </TableCell>
                                </TableRow>
                                <AnimatedTableRow className="bg-gray-50/60">
                                    <TableCell className="py-4 px-6 text-gray-500 text-xs font-semibold uppercase tracking-widest">
                                        Score
                                    </TableCell>
                                    <TableCell className="py-4 px-4 text-center bg-gradient-to-b from-cyan-50/60 to-blue-50/40 border-x border-cyan-100/60">
                                        <span className="text-base font-extrabold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                                            6 / 6
                                        </span>
                                    </TableCell>
                                    <TableCell className="py-4 px-4 text-center">
                                        <span className="text-base font-bold text-gray-400">1 / 6</span>
                                    </TableCell>
                                    <TableCell className="py-4 px-4 text-center">
                                        <span className="text-base font-bold text-gray-400">1 / 6</span>
                                    </TableCell>
                                </AnimatedTableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </div>
            </div>
        </section>
    );
}
