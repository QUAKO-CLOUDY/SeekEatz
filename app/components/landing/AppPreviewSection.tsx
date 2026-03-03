'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MessageSquare, BarChart3, Settings, Heart, Send, ArrowRight, Lock, Flame, Zap, Clock } from 'lucide-react';
import { Button } from '../ui/button';

/* ─── Tab definitions ─── */
const TABS = [
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
    { id: 'logs', label: 'Daily Log', icon: BarChart3 },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type TabId = (typeof TABS)[number]['id'];

/* ─── Mock Chat Screen ─── */
function MockChat() {
    return (
        <div className="flex flex-col h-full bg-white rounded-b-2xl">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-gray-900">SeekEatz AI</p>
                    <p className="text-xs text-emerald-500">Online</p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden px-5 py-4 space-y-4">
                {/* AI message */}
                <div className="flex gap-2.5 max-w-[85%]">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex-shrink-0 flex items-center justify-center mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-gray-50 rounded-2xl rounded-tl-md px-4 py-3">
                        <p className="text-sm text-gray-700">
                            Hi! I&apos;m your AI meal assistant. What are you looking for today?
                        </p>
                    </div>
                </div>

                {/* User message */}
                <div className="flex justify-end">
                    <div className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl rounded-tr-md px-4 py-3 max-w-[75%]">
                        <p className="text-sm text-white">
                            Find me a high protein meal under 600 calories
                        </p>
                    </div>
                </div>

                {/* AI response with meal cards */}
                <div className="flex gap-2.5 max-w-[90%]">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex-shrink-0 flex items-center justify-center mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="space-y-2.5">
                        <div className="bg-gray-50 rounded-2xl rounded-tl-md px-4 py-3">
                            <p className="text-sm text-gray-700">
                                Found 3 meals matching your goals nearby:
                            </p>
                        </div>
                        {/* Mini meal cards */}
                        {[
                            { name: 'Grilled Chicken Bowl', restaurant: 'Chipotle', cal: 510, protein: 48, carbs: 32, fat: 14 },
                            { name: 'Turkey Pesto Sandwich', restaurant: 'Panera Bread', cal: 480, protein: 42, carbs: 38, fat: 12 },
                            { name: 'Salmon Power Bowl', restaurant: 'Sweetgreen', cal: 560, protein: 44, carbs: 28, fat: 22 },
                        ].map((meal, i) => (
                            <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">{meal.name}</p>
                                        <p className="text-xs text-gray-400">{meal.restaurant}</p>
                                    </div>
                                    <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">{meal.cal} cal</span>
                                </div>
                                <div className="flex gap-3">
                                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">P: {meal.protein}g</span>
                                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">C: {meal.carbs}g</span>
                                    <span className="text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">F: {meal.fat}g</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Input bar */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
                <div className="flex-1 bg-gray-50 rounded-full px-4 py-2.5 text-sm text-gray-400">
                    Ask about meals, macros, or cravings...
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Send className="w-4 h-4 text-white" />
                </div>
            </div>
        </div>
    );
}

/* ─── Mock Daily Log Screen ─── */
function MockDailyLog() {
    const eaten = 1420;
    const goal = 2000;
    const pct = Math.round((eaten / goal) * 100);
    const remaining = goal - eaten;

    return (
        <div className="flex flex-col h-full bg-white rounded-b-2xl">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Daily Tracking</p>
                <p className="text-xs text-gray-400">Today · Feb 28, 2026</p>
            </div>

            <div className="flex-1 overflow-hidden px-5 py-4 space-y-5">
                {/* Calorie ring */}
                <div className="flex items-center gap-5">
                    <div className="relative w-24 h-24 flex-shrink-0">
                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                            <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                            <circle
                                cx="50" cy="50" r="42" fill="none"
                                stroke="url(#ringGrad)" strokeWidth="8" strokeLinecap="round"
                                strokeDasharray={`${pct * 2.64} 264`}
                            />
                            <defs>
                                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#06b6d4" />
                                    <stop offset="100%" stopColor="#3b82f6" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-lg font-bold text-gray-900">{eaten}</span>
                            <span className="text-[10px] text-gray-400">/ {goal}</span>
                        </div>
                    </div>
                    <div className="space-y-2 flex-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Remaining</span>
                            <span className="font-semibold text-emerald-600">{remaining} cal</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Goal</span>
                            <span className="font-semibold text-gray-700">{goal} cal</span>
                        </div>
                        <div className="bg-emerald-50 text-emerald-700 text-xs px-3 py-1.5 rounded-full font-medium inline-block">
                            🔥 3 Day Streak
                        </div>
                    </div>
                </div>

                {/* Macro bars */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Protein', current: 98, target: 150, color: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
                        { label: 'Carbs', current: 140, target: 200, color: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
                        { label: 'Fats', current: 42, target: 65, color: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' },
                    ].map((m) => (
                        <div key={m.label} className={`${m.bg} rounded-xl p-3 text-center`}>
                            <p className={`text-lg font-bold ${m.text}`}>{m.current}g</p>
                            <p className="text-[10px] text-gray-400">/ {m.target}g</p>
                            <p className="text-[10px] font-medium text-gray-500 mt-1">{m.label}</p>
                        </div>
                    ))}
                </div>

                {/* Logged meals */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Today&apos;s Meals</p>
                    {[
                        { name: 'Greek Yogurt Parfait', restaurant: 'Starbucks', cal: 320, time: '8:30 AM' },
                        { name: 'Grilled Chicken Salad', restaurant: 'Sweetgreen', cal: 560, time: '12:45 PM' },
                        { name: 'Protein Shake', restaurant: 'Homemade', cal: 540, time: '4:00 PM' },
                    ].map((meal, i) => (
                        <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                            <div>
                                <p className="text-sm font-medium text-gray-800">{meal.name}</p>
                                <p className="text-xs text-gray-400">{meal.restaurant} · {meal.time}</p>
                            </div>
                            <span className="text-xs font-semibold text-gray-500">{meal.cal} cal</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ─── Mock Settings Screen ─── */
function MockSettings() {
    return (
        <div className="flex flex-col h-full bg-white rounded-b-2xl">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Settings</p>
            </div>

            <div className="flex-1 overflow-hidden px-5 py-4 space-y-5">
                {/* Profile card */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                        S
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Sarah Johnson</p>
                        <p className="text-xs text-gray-400">sarah@email.com</p>
                    </div>
                </div>

                {/* Macro goals */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Daily Goals</p>
                    <div className="grid grid-cols-2 gap-2.5">
                        {[
                            { label: 'Calories', value: '2,000' },
                            { label: 'Protein', value: '150g' },
                            { label: 'Carbs', value: '200g' },
                            { label: 'Fats', value: '65g' },
                        ].map((g) => (
                            <div key={g.label} className="bg-gray-50 rounded-lg px-3 py-2.5 flex justify-between items-center">
                                <span className="text-xs text-gray-500">{g.label}</span>
                                <span className="text-sm font-semibold text-gray-800">{g.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Preferences */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Preferences</p>
                    <div className="space-y-2.5">
                        {[
                            { label: 'Diet Type', value: 'High Protein' },
                            { label: 'Search Radius', value: '10 miles' },
                            { label: 'Notifications', value: 'On' },
                            { label: 'Theme', value: 'Light' },
                        ].map((p) => (
                            <div key={p.label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                                <span className="text-sm text-gray-600">{p.label}</span>
                                <span className="text-sm font-medium text-gray-800">{p.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Mock Favorites Screen ─── */
function MockFavorites() {
    const savedMeals = [
        { name: 'Grilled Chicken Bowl', restaurant: 'Chipotle', cal: 510, protein: 48, carbs: 32, fat: 14, image: '🍗', rating: 4.9, timesOrdered: 12 },
        { name: 'Açaí Power Bowl', restaurant: 'Jamba Juice', cal: 380, protein: 12, carbs: 58, fat: 8, image: '🫐', rating: 4.8, timesOrdered: 8 },
        { name: 'Salmon Teriyaki Bowl', restaurant: 'Sweetgreen', cal: 560, protein: 44, carbs: 38, fat: 18, image: '🍣', rating: 5.0, timesOrdered: 15 },
        { name: 'Turkey Avocado Wrap', restaurant: 'Panera Bread', cal: 440, protein: 36, carbs: 28, fat: 16, image: '🌯', rating: 4.7, timesOrdered: 6 },
        { name: 'Greek Yogurt Parfait', restaurant: 'Starbucks', cal: 320, protein: 18, carbs: 42, fat: 6, image: '🥣', rating: 4.6, timesOrdered: 9 },
    ];

    const recentMeals = [
        { name: 'Protein Shake', restaurant: 'Smoothie King', cal: 340, protein: 32, time: '2 hours ago' },
        { name: 'Poke Bowl', restaurant: 'Pokéworks', cal: 520, protein: 38, time: 'Yesterday' },
        { name: 'Cobb Salad', restaurant: 'Chick-fil-A', cal: 460, protein: 34, time: '2 days ago' },
    ];

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-pink-50 to-rose-50 border-b border-pink-100/60">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-md shadow-pink-500/30">
                        <Heart className="w-5 h-5 text-white fill-white" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Favorites</p>
                        <p className="text-xs text-pink-500/80 font-medium">{savedMeals.length} saved · {recentMeals.length} recent</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden px-5 py-4 space-y-5">
                {/* Saved Meals */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Heart className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Saved Meals</p>
                    </div>
                    <div className="space-y-2.5">
                        {savedMeals.map((meal, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-gray-50/80 rounded-xl border border-gray-100/60 hover:border-pink-200 transition-colors cursor-pointer group">
                                <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center text-2xl shadow-sm border border-gray-100">
                                    {meal.image}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-pink-600 transition-colors">{meal.name}</p>
                                            <p className="text-xs text-gray-400">{meal.restaurant}</p>
                                        </div>
                                        <Heart className="w-4 h-4 text-pink-500 fill-pink-500 flex-shrink-0 mt-0.5" />
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <span className="flex items-center gap-1 text-xs text-gray-500">
                                            <Flame className="w-3 h-3 text-orange-400" /> {meal.cal}
                                        </span>
                                        <span className="flex items-center gap-1 text-xs text-gray-500">
                                            <Zap className="w-3 h-3 text-cyan-400" /> {meal.protein}g
                                        </span>
                                        <span className="text-xs text-gray-300">·</span>
                                        <span className="text-xs text-emerald-500 font-medium">⭐ {meal.rating}</span>
                                        <span className="text-xs text-gray-300">·</span>
                                        <span className="text-xs text-gray-400">{meal.timesOrdered}x ordered</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Meals */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-3.5 h-3.5 text-cyan-500" />
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Meals</p>
                    </div>
                    <div className="space-y-2">
                        {recentMeals.map((meal, i) => (
                            <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{meal.name}</p>
                                    <p className="text-xs text-gray-400">{meal.restaurant} · {meal.time}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-gray-600">{meal.cal} cal</p>
                                    <p className="text-xs text-cyan-500">{meal.protein}g protein</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Main Preview Section ─── */
export default function AppPreviewSection() {
    const [activeTab, setActiveTab] = useState<TabId>('chat');
    const sectionRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const ioRef = useRef<IntersectionObserver | null>(null);

    const attachObserver = useCallback(() => {
        if (ioRef.current) ioRef.current.disconnect();
        const el = sectionRef.current;
        if (!el) return;
        ioRef.current = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    ioRef.current?.disconnect();
                }
            },
            { threshold: 0.1 },
        );
        ioRef.current.observe(el);
    }, []);

    useEffect(() => {
        attachObserver();
        return () => ioRef.current?.disconnect();
    }, [attachObserver]);

    useEffect(() => {
        const onReset = () => {
            setVisible(false);
            setTimeout(attachObserver, 100);
        };
        window.addEventListener('seekResetAnimations', onReset);
        return () => window.removeEventListener('seekResetAnimations', onReset);
    }, [attachObserver]);

    return (
        <section ref={sectionRef} className="relative py-24 px-6 bg-[#f0f4f8]">
            {/* Seamless top gradient from hero */}
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#f0f4f8] to-transparent pointer-events-none" />

            <div className="max-w-5xl mx-auto">
                {/* Section heading */}
                <div
                    className="text-center mb-12"
                    style={{
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(24px)',
                        transition: 'opacity 0.8s ease, transform 0.8s ease',
                    }}
                >
                    <p className="text-sm font-semibold text-cyan-600 uppercase tracking-wider mb-3">
                        See It In Action
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
                        Your nutrition assistant,{' '}
                        <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                            right in your pocket
                        </span>
                    </h2>
                    <p className="text-lg text-gray-500 max-w-2xl mx-auto">
                        AI chat, daily tracking, and personalized settings — explore the full experience.
                    </p>
                </div>

                {/* Browser-style preview container */}
                <div
                    className="relative max-w-4xl mx-auto"
                    style={{
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(36px)',
                        transition: 'opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s',
                    }}
                >
                    {/* Subtle glow */}
                    <div className="absolute -inset-6 bg-gradient-to-b from-cyan-200/15 via-blue-200/10 to-transparent rounded-3xl blur-2xl pointer-events-none" />

                    <div className="relative bg-white rounded-2xl shadow-xl shadow-gray-900/10 border border-gray-200/60 overflow-hidden">
                        {/* Tab bar — styled like a web app nav */}
                        <div className="flex items-center bg-gray-50 border-b border-gray-200/80 px-2">
                            {TABS.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors relative ${
                                            isActive
                                                ? 'text-cyan-600'
                                                : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {tab.label}
                                        {isActive && (
                                            <div className="absolute bottom-0 inset-x-2 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Screen content */}
                        <div className="h-[500px] sm:h-[560px] lg:h-[600px] overflow-hidden">
                            {activeTab === 'chat' && <MockChat />}
                            {activeTab === 'logs' && <MockDailyLog />}
                            {activeTab === 'favorites' && <MockFavorites />}
                            {activeTab === 'settings' && <MockSettings />}
                        </div>

                        {/* Locked overlay fade at bottom */}
                        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-white via-white/90 to-transparent pointer-events-none" />

                        {/* CTA overlay */}
                        <div className="absolute bottom-6 inset-x-0 z-40 flex justify-center pointer-events-auto">
                            <Link href="/auth/signup">
                                <Button className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-8 py-5 text-sm font-bold shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/35 transition-all hover:-translate-y-0.5 gap-2">
                                    <Lock className="w-4 h-4" />
                                    Unlock Full Access
                                    <ArrowRight className="w-4 h-4" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Bottom note */}
                <p className="text-center text-sm text-gray-400 mt-14">
                    Explore the preview above — sign up to unlock all features
                </p>
            </div>
        </section>
    );
}
