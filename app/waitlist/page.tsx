'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function WaitlistPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to join waitlist');
      }

      // Success - redirect to confirmation page with free month query param
      const freeMonthParam = data.freeMonth ? '1' : '0';
      router.push(`/waitlist/thanks?free=${freeMonthParam}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white overflow-x-hidden flex justify-center">
      <div className="w-full max-w-2xl lg:max-w-4xl py-10 lg:py-16 px-4 md:px-6 lg:px-8 mx-auto space-y-10 lg:space-y-12">
        {/* Header */}
        <header className="mb-6 lg:mb-8">
          <div className="text-3xl lg:text-4xl font-semibold text-gray-900">SeekEatz</div>
        </header>

        {/* Hero Section */}
        <section className="flex flex-col lg:flex-row lg:items-center lg:gap-10">
          {/* Left: Text Content */}
          <div className="flex-1 space-y-4 mb-8 lg:mb-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 leading-tight break-words">
              Scan menus and instantly see what fits your goals.
              <br />
              <span className="text-cyan-500">Anytime, Anywhere.</span>
            </h1>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed break-words">
              SeekEatz finds meals near you using verified restaurant nutrition, personalized AI recommendations, and macro-friendly swaps — so you hit your goals without the math.
            </p>
            
            {/* Email Form */}
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col sm:flex-row gap-3">
                <label htmlFor="email" className="sr-only">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  aria-label="Email address"
                  className="flex-1 px-4 py-3 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-sm sm:text-base"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-3 bg-cyan-500 text-white font-medium rounded-lg hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap text-sm sm:text-base"
                >
                  {isLoading ? 'Joining...' : 'Join the Waitlist →'}
                </button>
              </div>
              {error && (
                <p className="mt-3 text-sm text-red-600">{error}</p>
              )}
            </form>
          </div>

          {/* Right: Hero Mockup */}
          <div className="flex-1 flex justify-center lg:justify-end">
            <Image
              src="/logos/waitlist_photo.png"
              alt="SeekEatz app screenshot"
              width={400}
              height={711}
              className="rounded-[2.5rem] shadow-2xl w-full max-w-[300px] sm:max-w-[360px] lg:max-w-[400px] h-auto"
              priority
            />
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="space-y-4 lg:space-y-6">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 text-center break-words">
            What SeekEatz Actually Does
          </h2>
          <p className="text-sm sm:text-base text-gray-600 text-center break-words">
            Real features for real results.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {/* Feature 1 */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-2.5 flex-shrink-0"></div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words">
                  Accurate restaurant nutrition. No crowdsourced or third party data.
                </h3>
              </div>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed break-words ml-4.5">
                Pulled directly from restaurant PDFs and verified menus. No guessing. No outdated entries.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-2.5 flex-shrink-0"></div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words">
                  Personalized meal recommendations near you
                </h3>
              </div>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed break-words ml-4.5">
                Set your calorie or macro target → instantly see real meals around you that fit.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-2.5 flex-shrink-0"></div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words">
                  Smart AI swaps that improve any meal
                </h3>
              </div>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed break-words ml-4.5">
                "Remove cheese → –80 calories" • "Swap rice for veggies → –40g carbs"
                <br />
                Practical, simple changes that actually move the needle.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-2.5 flex-shrink-0"></div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 break-words">
                  Diet filters that actually matter
                </h3>
              </div>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed break-words ml-4.5">
                High-protein, low-carb, dairy-free, vegetarian, allergen-safe, and more.
                <br />
                Designed for real-world eating.
              </p>
            </div>
          </div>
        </section>

        {/* Incentive Section */}
        <section className="space-y-4 lg:space-y-6">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 mb-6 break-words">
              Why Join the Early Access Group?
            </h2>

            <div className="space-y-3 max-w-xl mx-auto mb-6">
              <div className="flex items-start gap-3 text-left">
                <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0"></div>
                <p className="text-sm sm:text-base text-gray-900 break-words">
                  First 50 users get 3 weeks FREE
                </p>
              </div>

              <div className="flex items-start gap-3 text-left">
                <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0"></div>
                <p className="text-sm sm:text-base text-gray-900 break-words">
                  Get in before the public launch
                </p>
              </div>

              <div className="flex items-start gap-3 text-left">
                <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0"></div>
                <p className="text-sm sm:text-base text-gray-900 break-words">
                  Influence new features and future restaurants
                </p>
              </div>
            </div>

            <p className="text-sm sm:text-base text-gray-600 leading-relaxed break-words">
              Early users help shape how SeekEatz grows — and get rewarded for it.
            </p>
          </div>
        </section>

        {/* Credibility / Story Section */}
        <section className="space-y-4 lg:space-y-6">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 text-center break-words">
            Why We Built SeekEatz
          </h2>

          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0"></div>
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed break-words">
                Most macro apps rely on outdated, generic, or crowdsourced nutrition data.
                <br />
                If you travel, eat out, or have a busy schedule… that's not good enough.
              </p>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0"></div>
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed break-words">
                SeekEatz uses verified restaurant nutrition + AI to give you meal options you can trust. Anytime, Anywhere.
              </p>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0"></div>
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed break-words">
                Built for people who want real results, not another app that forces you to track every bite.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom CTA Section */}
        <section className="space-y-4 lg:space-y-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-gray-900 break-words">
            Ready to make eating out easier?
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <label htmlFor="footer-email" className="sr-only">
                Email address
              </label>
              <input
                id="footer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                aria-label="Email address"
                className="flex-1 px-4 py-3 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all text-sm sm:text-base"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-3 bg-cyan-500 text-white font-medium rounded-lg hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap text-sm sm:text-base"
              >
                {isLoading ? 'Joining...' : 'Join the Waitlist →'}
              </button>
            </div>
            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}
          </form>

          <p className="text-sm text-gray-500">
            Launching soon on iOS and Android.
          </p>
        </section>
      </div>
    </main>
  );
}
