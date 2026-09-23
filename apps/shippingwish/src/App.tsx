import React from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Comparison } from './components/Comparison';
import { MobileSuite } from './components/MobileSuite';
import { Partners } from './components/Partners';
import { IncludedFeatures } from './components/IncludedFeatures';
import { PricingTiers } from './components/PricingTiers';
import { DeskTimeline } from './components/DeskTimeline';
import { CapacityStats } from './components/CapacityStats';
import { Faq } from './components/Faq';
import { LoadsNexusBanner } from './components/LoadsNexusBanner';
import { CtaBanner } from './components/CtaBanner';
import { Footer } from './components/Footer';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Header Navigation */}
      <Navbar />

      <main className="flex-grow">
        {/* Hero with Live Operations Panel */}
        <Hero />

        {/* Value Model Comparison */}
        <Comparison />

        {/* Dedicated Mobile Apps Suite */}
        <MobileSuite />

        {/* Motor Carrier & Broker Partners */}
        <Partners />

        {/* What's In The Plan */}
        <IncludedFeatures />

        {/* Weekly Pricing Tiers */}
        <PricingTiers />

        {/* A Week on the Desk Timeline */}
        <DeskTimeline />

        {/* Company Capacity Stats */}
        <CapacityStats />

        {/* Frequently Asked Questions */}
        <Faq />

        {/* LoadsNexus AI Load Board Showcase */}
        <LoadsNexusBanner />

        {/* Final High-Conversion CTA */}
        <CtaBanner />
      </main>

      {/* Corporate Footer */}
      <Footer />
    </div>
  );
};
