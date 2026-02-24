'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function WaitlistPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fadeRefs = useRef<(HTMLElement | null)[]>([]);

  const shareText = 'Find meals that fit your macros — instantly. SeekEatz uses AI + verified restaurant nutrition to recommend real meals near you. Join the waitlist!';

  const getShareUrl = () => {
    if (typeof window !== 'undefined') return `${window.location.origin}/waitlist`;
    return 'https://seekeatz.com/waitlist';
  };

  /* ── Scroll-triggered fade-up animations ── */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = '1';
            (e.target as HTMLElement).style.transform = 'translateY(0)';
          }
        });
      },
      { threshold: 0.12 }
    );
    fadeRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const addFadeRef = (el: HTMLElement | null) => {
    if (el && !fadeRefs.current.includes(el)) fadeRefs.current.push(el);
  };

  /* Inline style helper for animated sections */
  const fadeStyle: React.CSSProperties = {
    opacity: 0,
    transform: 'translateY(32px)',
    transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
  };

  const handleShare = async () => {
    const shareUrl = getShareUrl();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'SeekEatz — Join the Waitlist', text: shareText, url: shareUrl });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    const shareUrl = getShareUrl();
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to join waitlist');
      }

      const freeMonthParam = data.freeMonth ? '1' : '0';
      router.push(`/waitlist/thanks?free=${freeMonthParam}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white overflow-x-hidden flex justify-center">
      <div className="w-full max-w-2xl lg:max-w-4xl py-10 lg:py-16 px-4 md:px-6 lg:px-8 mx-auto space-y-16 lg:space-y-20">

        {/* ───────── Header ───────── */}
        <header className="mb-0">
          <div className="text-3xl lg:text-4xl font-semibold text-gray-900">SeekEatz</div>
        </header>

        {/* ───────── HERO ───────── */}
        <section className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
          {/* Left — Text */}
          <div className="flex-1 space-y-5 mb-10 lg:mb-0">
            <h1 className="text-2xl sm:text-3xl lg:text-[2.5rem] font-bold text-gray-900 leading-tight tracking-tight">
              Find Meals That Hit Your Macros,{' '}
              <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">Before You Order.</span>
            </h1>
            <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
              SeekEatz is the first conversational AI platform that helps you discover restaurant meals aligned with your goals, so you can eat out with confidence instead of anxiety.
            </p>

            {/* CTA Form */}
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col sm:flex-row gap-3">
                <label htmlFor="email" className="sr-only">Email address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  aria-label="Email address"
                  className="flex-1 px-4 py-3.5 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-sm sm:text-base shadow-sm"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-7 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap text-sm sm:text-base shadow-lg shadow-cyan-500/25"
                >
                  {isLoading ? 'Joining...' : 'Join the Waitlist →'}
                </button>
              </div>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </form>
          </div>

          {/* Right — Hero Image with float animation */}
          <div className="flex-1 flex justify-center lg:justify-end">
            <div className="relative">
              {/* Glow backdrop */}
              <div className="absolute -inset-4 bg-gradient-to-br from-cyan-400/20 via-blue-400/10 to-violet-400/20 rounded-[3rem] blur-2xl" />
              <Image
                src="/waitlist_final.png"
                alt="SeekEatz app — AI finding meals that fit your macros"
                width={400}
                height={656}
                className="relative rounded-[2.5rem] shadow-2xl w-full max-w-[280px] sm:max-w-[340px] lg:max-w-[380px] h-auto"
                priority
                style={{
                  animation: 'heroFloat 4s ease-in-out infinite',
                }}
              />
            </div>
          </div>
        </section>

        {/* ───────── FEATURES ───────── */}
        <section ref={addFadeRef} style={fadeStyle}>
          <div className="text-center mb-10">
            <span className="inline-block px-4 py-1.5 mb-4 text-sm font-semibold text-cyan-600 bg-cyan-50 border border-cyan-200 rounded-full">Features</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
              What SeekEatz Provides
            </h2>
          </div>

          <div className="space-y-12">
            {/* Feature 1 */}
            <div ref={addFadeRef} style={fadeStyle} className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Verified Restaurant Nutrition: No Guesswork</h3>
              </div>
              <p className="text-gray-600 leading-relaxed ml-[52px]">
                Accurate, vetted nutrition data pulled directly from official restaurant menus and published PDFs.
              </p>
              <p className="text-gray-500 text-sm leading-relaxed ml-[52px] mt-2">
                No AI hallucinations. No outdated database entries. Just real menu data you can trust.
              </p>
            </div>

            {/* Feature 2 */}
            <div ref={addFadeRef} style={fadeStyle} className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Personalized Meal Recommendations Near You</h3>
              </div>
              <p className="text-gray-600 leading-relaxed ml-[52px]">
                Set your calorie and macro targets above and below desired numbers and instantly see meals that fit.
              </p>
              <p className="text-gray-500 leading-relaxed ml-[52px] mt-3">
                Use our conversational AI to get specific:
              </p>
              <div className="ml-[52px] mt-2 bg-gray-900 text-cyan-400 rounded-xl px-4 py-3 font-mono text-sm inline-block">
                &quot;Find me lunch under 850 cals and at least 40g protein.&quot;
              </div>
              <p className="text-gray-500 text-sm leading-relaxed ml-[52px] mt-2">
                Find exactly what you&apos;re looking for in seconds.
              </p>
              {/* Product Screenshot in Feature Block */}
              <div className="ml-[52px] mt-6 relative max-w-[280px]">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur-sm" />
                
              </div>
            </div>

            {/* Feature 3 */}
            <div ref={addFadeRef} style={fadeStyle} className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Smart AI Swaps</h3>
              </div>
              <p className="text-gray-600 leading-relaxed ml-[52px]">
                Practical, real-world swap suggestions to help you stay within your goals. Simple changes that make a measurable difference.
              </p>
              <div className="ml-[52px] mt-3 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-cyan-500">•</span>Swap the bun for lettuce to reduce carbs
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-cyan-500">•</span>Remove sauce to save calories
                </div>
              </div>
            </div>

            {/* Feature 4 */}
            <div ref={addFadeRef} style={fadeStyle} className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Goal-Based Filters</h3>
              </div>
              <p className="text-gray-600 leading-relaxed ml-[52px]">
                Quickly filter meals by what matters most to you. High protein, lower carb, calorie range, and more  so you can narrow decisions fast.
              </p>
            </div>

            {/* Feature 5 */}
            <div ref={addFadeRef} style={fadeStyle} className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-6 lg:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Automatic Logging: No Manual Entry Required</h3>
              </div>
              <p className="text-gray-600 leading-relaxed ml-[52px]">
                Log your selected meal instantly, even with AI-assisted swaps without typing numbers, ingredients, or portion sizes.
              </p>
              <div className="ml-[52px] mt-3 flex items-center gap-2 text-sm font-semibold text-cyan-600">
                <span className="w-6 h-6 rounded-full bg-cyan-50 flex items-center justify-center text-xs">1</span> Choose.
                <span className="w-6 h-6 rounded-full bg-cyan-50 flex items-center justify-center text-xs">2</span> Confirm.
                <span className="w-6 h-6 rounded-full bg-cyan-50 flex items-center justify-center text-xs">3</span> Logged.
              </div>
            </div>
          </div>
        </section>

        {/* ───────── EARLY ACCESS ───────── */}
        <section ref={addFadeRef} style={fadeStyle}>
          <div className="text-center mb-8">
            <span className="inline-block px-4 py-1.5 mb-4 text-sm font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full">Early Access</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
              Why Join the Early Access Group?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 border border-emerald-100 rounded-2xl p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="font-bold text-gray-900 mb-2 text-lg">First Month Free</h3>
              <p className="text-gray-600 text-sm leading-relaxed">First 50 users get their first two weeks completely free.</p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-violet-50 border border-blue-100 rounded-2xl p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </div>
              <h3 className="font-bold text-gray-900 mb-2 text-lg">Shape the Product</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Influence upcoming features and give direct feedback to the founders.</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3 className="font-bold text-gray-900 mb-2 text-lg">Early Access</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Be among the first to use SeekEatz before it goes live to everyone else.</p>
            </div>
          </div>
        </section>

        {/* ───────── SHARE SEEKEATZ ───────── */}
        <section ref={addFadeRef} style={fadeStyle}>
          <div className="bg-gradient-to-br from-cyan-50 via-blue-50 to-violet-50 rounded-3xl p-7 lg:p-10 text-center border border-cyan-100 shadow-sm">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              Know someone who&apos;d love this?
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-6">
              Share SeekEatz with friends who track macros or eat out often.
            </p>

            {/* Share Buttons Grid */}
            <div className="flex flex-wrap justify-center gap-3 mb-5">
              {/* Native Share / Copy */}
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-400 transition-all text-sm shadow-lg shadow-cyan-500/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                {copied ? '✓ Copied!' : 'Share'}
              </button>

              {/* WhatsApp */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText + ' https://seekeatz.com/waitlist')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + getShareUrl())}`, '_blank');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#25D366] text-white font-medium rounded-xl hover:bg-[#1fb855] transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                WhatsApp
              </a>

              {/* Twitter / X */}
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent('https://seekeatz.com/waitlist')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(getShareUrl())}`, '_blank');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                Post on X
              </a>

              {/* Facebook */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://seekeatz.com/waitlist')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl())}`, '_blank', 'width=600,height=400');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1877F2] text-white font-medium rounded-xl hover:bg-[#166fe5] transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                Facebook
              </a>

              {/* LinkedIn */}
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://seekeatz.com/waitlist')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(getShareUrl())}`, '_blank', 'width=600,height=400');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0A66C2] text-white font-medium rounded-xl hover:bg-[#0958a8] transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                LinkedIn
              </a>

              {/* Reddit */}
              <a
                href={`https://www.reddit.com/submit?url=${encodeURIComponent('https://seekeatz.com/waitlist')}&title=${encodeURIComponent('SeekEatz - AI-powered meal recommendations that fit your macros')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(getShareUrl())}&title=${encodeURIComponent('SeekEatz - AI-powered meal recommendations that fit your macros')}`, '_blank');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FF4500] text-white font-medium rounded-xl hover:bg-[#e63e00] transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.462.342.342 0 00-.461 0c-.545.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.206-.095z" /></svg>
                Reddit
              </a>


            </div>

            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              className="text-sm text-cyan-600 hover:text-cyan-700 font-semibold transition-colors"
            >
              {copied ? '✓ Copied to clipboard!' : '🔗 Copy link to share anywhere'}
            </button>
          </div>
        </section>

        {/* ───────── WHY WE BUILT SEEKEATZ ───────── */}
        <section ref={addFadeRef} style={fadeStyle}>
          <div className="text-center mb-8">
            <span className="inline-block px-4 py-1.5 mb-4 text-sm font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-full">Our Story</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
              Why We Built SeekEatz
            </h2>
          </div>

          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-3xl p-7 lg:p-10 space-y-5">
            <p className="text-gray-700 text-base sm:text-lg leading-relaxed">
              We built SeekEatz because eating out shouldn&apos;t mean abandoning your goals.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Macro tracking works until you&apos;re at a restaurant. Then it becomes guesswork, stress, or overcorrection.
            </p>
            <div className="border-l-4 border-cyan-500 pl-5 py-2">
              <p className="text-gray-700 font-medium leading-relaxed">
                Existing apps focus on logging <em>after</em> you eat.
                <br />
                SeekEatz helps you choose <em>before</em> you order.
              </p>
            </div>
            <p className="text-gray-600 leading-relaxed">
              We believe nutrition tools should reduce anxiety, not increase it.
            </p>
          </div>
        </section>

        {/* ───────── BOTTOM CTA ───────── */}
        <section ref={addFadeRef} style={fadeStyle} className="text-center">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-8 lg:p-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">
              Ready to eat out without the stress?
            </h2>
            <p className="text-gray-400 mb-6 text-sm sm:text-base">
              Join the waitlist — launching soon on iOS and Android.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <label htmlFor="footer-email" className="sr-only">Email address</label>
                <input
                  id="footer-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  aria-label="Email address"
                  className="flex-1 px-4 py-3.5 rounded-xl border border-gray-700 bg-gray-800/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-sm sm:text-base"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-7 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap text-sm sm:text-base shadow-lg shadow-cyan-500/25"
                >
                  {isLoading ? 'Joining...' : 'Join the Waitlist →'}
                </button>
              </div>
              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            </form>
          </div>
        </section>
      </div>

      {/* ── CSS Keyframes for hero float animation ── */}
      <style jsx>{`
        @keyframes heroFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
      `}</style>
    </main>
  );
}
