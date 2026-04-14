import NavBar from './landing/NavBar';
import HeroSection from './landing/HeroSection';
import AppPreviewSection from './landing/AppPreviewSection';
import ProblemSolutionSection from './landing/ProblemSolutionSection';
import FeaturesSection from './landing/FeaturesSection';
import WhySeekEatzSection from './landing/WhySeekEatzSection';
import TestimonialsSection from './landing/TestimonialsSection';
import FAQSection from './landing/FAQSection';
import Footer from './landing/Footer';

/**
 * LandingPage — composes all landing page sections.
 * Each section is a self-contained component in ./landing/
 */


export default function LandingPage() {
    return (
        <div className="overflow-x-hidden bg-[#f0f4f8]">
            {/* ── Fixed top navigation ── */}
            <NavBar />

            {/* ── Hero section with phone mockup ── */}
            <HeroSection />

            {/* ── Interactive app preview teaser ── */}
            <AppPreviewSection />

            {/* ── Problem agitation → Solution reveal ── */}
            <ProblemSolutionSection />

            {/* ── Remaining landing sections ── */}
            <FeaturesSection />
            <WhySeekEatzSection />
            <TestimonialsSection />
            <FAQSection />
            <Footer />
        </div>
    );
}
