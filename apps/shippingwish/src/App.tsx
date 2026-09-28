import React from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { EquipmentDesk } from './components/EquipmentDesk';
import { CarrierGuide } from './components/CarrierGuide';
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
import { AiSupportChat } from './components/AiSupportChat';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#f4f7fb] text-slate-900 selection:bg-amber-200 selection:text-slate-950">
      {/* Header Navigation */}
      <Navbar />

      <main className="flex-grow">
        {/* Hero with Live Operations Panel */}
        <Hero />

        <EquipmentDesk />

        <CarrierGuide />

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

      {/* 24/7 AI Operations & Dispatch Chatbot */}
      <AiSupportChat />
    </div>
  );
};
