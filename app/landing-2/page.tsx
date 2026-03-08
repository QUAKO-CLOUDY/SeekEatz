'use client';

/**
 * Landing Page 2 — Test page only. Not wired into app navigation.
 * Structure inspired by https://kivo.dev/
 * Uses SeekEatz color scheme and copy.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, ChevronDown } from 'lucide-react';

const BG_LIGHT = '#f0f4f8';
const GRADIENT = 'from-[#22d3ee] via-[#3A8BFF] to-[#4DDDF9]';

/* ----- Nav (Kivo: simple bar, Sign In + Get Started) ----- */
function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200/80 bg-white/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <a href="#" className="text-lg font-bold tracking-tight text-gray-900">
          SeekEatz
        </a>
        <div className="hidden md:flex items-center gap-4">
          <Link href="/auth/signin" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Sign In
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 text-white text-sm font-semibold px-4 py-2 hover:bg-gray-800 transition-colors"
          >
            Get Started
          </Link>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-gray-600 rounded-lg hover:bg-gray-100"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
          <Link href="/auth/signin" className="text-sm font-medium text-gray-700 py-2">Sign In</Link>
          <Link href="/chat" className="text-sm font-semibold text-gray-900 py-2">Get Started</Link>
        </div>
      )}
    </nav>
  );
}

/* ----- Hero (Kivo: headline, sub, 2 CTAs, then video) ----- */
function Hero() {
  return (
    <section className="relative pt-24 pb-12 sm:pt-28 sm:pb-16 overflow-hidden" style={{ background: BG_LIGHT }}>
      <div className="absolute top-1/4 -left-[15%] w-[min(90vw,380px)] h-[min(90vw,380px)] rounded-full opacity-30 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(77,221,249,0.35) 0%, rgba(58,139,255,0.12) 50%, transparent 70%)' }} />
      <div className="absolute bottom-1/4 -right-[10%] w-[min(70vw,280px)] h-[min(70vw,280px)] rounded-full opacity-25 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(58,139,255,0.3) 0%, rgba(77,221,249,0.08) 50%, transparent 70%)' }} />
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 leading-[1.15] tracking-tight mb-5">
          Meals that fit your macros — without the hassle.
        </h1>
        <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-8">
          Stop guessing at restaurants. SeekEatz&apos;s AI reads real menu nutrition and helps you find meals that match your goals in seconds.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 text-white px-6 py-3.5 text-base font-semibold hover:bg-gray-800 transition-all shadow-lg"
          >
            Get Started
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white text-gray-800 px-6 py-3.5 text-base font-semibold hover:border-gray-400 hover:bg-gray-50 transition-all"
          >
            See how it works
          </Link>
        </div>
        {/* Hero video / app preview (Kivo-style) */}
        <div className="mt-12 sm:mt-16 max-w-4xl mx-auto">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-200/60 overflow-hidden aspect-video max-h-[480px] flex items-center justify-center">
            <video
              className="w-full h-full object-cover object-top"
              autoPlay
              muted
              loop
              playsInline
              poster="/logos/waitlist_photo.png"
            >
              <source src="/m%20iPhone.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----- How it works (Kivo: 4 steps) ----- */
const HOW_IT_WORKS = [
  {
    title: 'Search by macros — skip the guesswork',
    desc: 'No more scanning menus in your head. Tell SeekEatz your calorie or macro target and get real restaurant meals that fit.',
  },
  {
    title: 'Get real meals instantly',
    desc: 'See options in seconds using natural language—no logging first. Results come from verified restaurant nutrition data.',
  },
  {
    title: 'AI-assisted swaps',
    desc: 'SeekEatz suggests smarter choices at the same restaurant. Swap the burrito for a bowl and see updated macros before you order.',
  },
  {
    title: 'Track and share in one tap',
    desc: 'Save favorites, hit your daily goals, and keep a clear view of what you’re eating—all in one place.',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-20" style={{ background: BG_LIGHT }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 text-center mb-12">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white text-sm font-bold mb-4">
                {i + 1}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----- Use cases (Kivo: 3 personas with metrics + preview) ----- */
const USE_CASES = [
  {
    title: 'Macro trackers',
    sub: 'From 15+ minutes to under a minute',
    desc: 'Hit your protein and calorie targets when eating out. No spreadsheets, no guessing.',
    stat: '< 1 min',
  },
  {
    title: 'Eating out daily',
    sub: 'From “I’ll just guess” to confident choices',
    desc: 'Get real options at the restaurant you’re at. Same place, better decisions.',
    stat: 'Seconds',
  },
  {
    title: 'Meal preppers',
    sub: 'From manual lookups to one search',
    desc: 'Find high-protein, low-carb, or keto-friendly meals across 30+ chains before you go.',
    stat: 'One search',
  },
];

function UseCases() {
  return (
    <section id="use-cases" className="py-16 sm:py-20 border-t border-gray-200/80" style={{ background: BG_LIGHT }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 text-center mb-4">Use cases</h2>
        <p className="text-center text-gray-500 max-w-xl mx-auto mb-12">
          See how different people use SeekEatz to eat smarter when eating out.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {USE_CASES.map((uc, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="aspect-video bg-gradient-to-br from-cyan-50 to-blue-50 flex items-center justify-center p-6">
                <div className="text-center">
                  <p className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">{uc.stat}</p>
                  <p className="text-xs text-gray-500 mt-1">to find a matching meal</p>
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{uc.title}</h3>
                <p className="text-xs text-cyan-600 font-medium mb-2">{uc.sub}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{uc.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----- FAQ (Kivo: “Find answers to common questions”) ----- */
const FAQS = [
  { q: 'What types of restaurants does SeekEatz support?', a: 'We cover 30+ major chains (Chipotle, Panera, McDonald’s, etc.) with thousands of menu items. Nutrition is pulled from official sources and verified. We add new restaurants regularly based on user requests.' },
  { q: 'How does SeekEatz keep nutrition data accurate?', a: 'Your results are based on verified restaurant nutrition—PDFs and official menus. We don’t use crowdsourced or estimated data. What you see matches what the restaurant publishes.' },
  { q: 'Can I customize my macro or calorie goals?', a: 'Yes. You can set custom calorie and macro ranges (protein, carbs, fat). Ask in plain language too—e.g. “low carb under 500 cal”—and get meals that fit.' },
  { q: "What's the difference between SeekEatz and other food apps?", a: 'Many apps are built for logging after you eat. SeekEatz is built for deciding before you order—AI search over real restaurant data, smart swaps, and goals all in one place.' },
  { q: 'Is there a free trial?', a: 'Yes. You get 3 free AI searches with no signup. After that, create a free account for full access to search, favorites, and daily tracking.' },
  { q: 'Can I use SeekEatz on the go?', a: 'SeekEatz works in your browser so you can use it anywhere—at home, at the office, or at the restaurant. Search, save favorites, and track your day from one place.' },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-16 sm:py-20" style={{ background: BG_LIGHT }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 text-center mb-4">Frequently asked questions</h2>
        <p className="text-center text-gray-500 mb-10">Find answers to common questions about SeekEatz.</p>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between text-left px-5 py-4 font-semibold text-gray-900 hover:bg-gray-50/80 transition-colors"
              >
                {faq.q}
                <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 ml-2 transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <div className="px-5 pb-4 pt-0 text-gray-500 text-sm leading-relaxed border-t border-gray-100">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----- Final CTA (Kivo: “Ready to transform…?” + 2 buttons) ----- */
function FinalCTA() {
  return (
    <section className="py-16 sm:py-20 border-t border-gray-200/80" style={{ background: BG_LIGHT }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Ready to find your perfect meal?</h2>
        <p className="text-lg text-gray-500 mb-8">
          Join thousands of people eating smarter with SeekEatz.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 text-white px-6 py-3.5 text-base font-semibold hover:bg-gray-800 transition-all shadow-lg"
          >
            Get Started
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white text-gray-800 px-6 py-3.5 text-base font-semibold hover:border-gray-400 hover:bg-gray-50 transition-all"
          >
            See how it works
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----- Minimal footer (Kivo-style: simple) ----- */
function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
        <a href="#" className="text-lg font-bold text-gray-900">SeekEatz</a>
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
          <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How it works</a>
          <a href="#use-cases" className="hover:text-gray-900 transition-colors">Use cases</a>
          <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
          <Link href="/chat" className="hover:text-gray-900 transition-colors">Get Started</Link>
        </div>
        <span className="text-sm text-gray-400">© 2026 SeekEatz</span>
      </div>
    </footer>
  );
}

/* ----- Page ----- */
export default function LandingPage2() {
  return (
    <div className="min-h-screen" style={{ background: BG_LIGHT }}>
      <Nav />
      <Hero />
      <HowItWorks />
      <UseCases />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
