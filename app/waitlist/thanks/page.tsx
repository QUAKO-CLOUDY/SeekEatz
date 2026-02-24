'use client';

import Link from 'next/link';

export default function WaitlistThanksPage() {

  return (
    <main className="min-h-screen bg-white overflow-x-hidden flex justify-center">
      <div className="w-full max-w-2xl py-10 lg:py-16 px-4 md:px-6 lg:px-8 mx-auto space-y-8">
        {/* Header */}
        <header className="mb-6 lg:mb-8">
          <div className="text-3xl lg:text-4xl font-semibold text-gray-900">SeekEatz</div>
        </header>

        {/* Confirmation Message */}
        <section className="flex flex-col items-center justify-center text-center space-y-6 py-12">
          <div className="w-16 h-16 bg-cyan-500 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900">
            You're on the waitlist!
          </h1>
          
          <p className="text-base sm:text-lg text-gray-600 max-w-md mx-auto leading-relaxed">
            Thanks for signing up for SeekEatz.
            The first 50 people to join will receive two weeks free when we launch.
            We'll email you as soon as the app is ready, keep an eye on your inbox.
          </p>

          <Link
            href="/waitlist"
            className="mt-4 px-6 py-3 bg-cyan-500 text-white font-medium rounded-lg hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 transition-all text-sm sm:text-base"
          >
            Back to waitlist
          </Link>
        </section>
      </div>
    </main>
  );
}

