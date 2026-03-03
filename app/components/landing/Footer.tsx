import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="bg-gradient-to-b from-slate-900 to-gray-950 text-white pt-16 pb-8 px-6">
            <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
                    {/* Brand */}
                    <div className="lg:col-span-1">
                        <div className="text-xl font-bold mb-3">SeekEatz</div>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            AI-powered meal recommendations from verified restaurant menus.
                            Find meals that fit your macros — instantly.
                        </p>
                    </div>

                    {/* Product */}
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
                            Product
                        </h4>
                        <div className="flex flex-col gap-2.5">
                            <a
                                href="#features"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                Features
                            </a>
                            <a
                                href="#why-seekeatz"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                Why Us
                            </a>
                            <a
                                href="#faq"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                FAQ
                            </a>
                            <Link
                                href="/chat"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                Try Free
                            </Link>
                        </div>
                    </div>

                    {/* Company */}
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
                            Company
                        </h4>
                        <div className="flex flex-col gap-2.5">
                            <a
                                href="#"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                About
                            </a>
                            <a
                                href="#"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                Contact
                            </a>
                            <a
                                href="#"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                Careers
                            </a>
                        </div>
                    </div>

                    {/* Legal */}
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
                            Legal
                        </h4>
                        <div className="flex flex-col gap-2.5">
                            <a
                                href="#"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                Privacy Policy
                            </a>
                            <a
                                href="#"
                                className="text-gray-400 hover:text-cyan-400 transition-colors text-sm"
                            >
                                Terms of Service
                            </a>
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <span className="text-gray-500 text-sm">
                        © 2026 SeekEatz. All rights reserved.
                    </span>
                    <div className="flex gap-4">
                        {/* X / Twitter */}
                        <a
                            href="#"
                            className="text-gray-500 hover:text-cyan-400 transition-colors"
                            aria-label="Twitter"
                        >
                            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                        </a>
                        {/* Instagram */}
                        <a
                            href="#"
                            className="text-gray-500 hover:text-cyan-400 transition-colors"
                            aria-label="Instagram"
                        >
                            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
