import React, { useState, useEffect, useCallback } from 'react';
import type { FreightLoad, UserSession, SearchFilter } from './types';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { SearchWidget } from './components/SearchWidget';
import { CorridorTicker } from './components/CorridorTicker';
import { LiveLoadBoard } from './components/LiveLoadBoard';
import { Features } from './components/Features';
import { ComparisonTable } from './components/ComparisonTable';
import { MobileApps } from './components/MobileApps';
import { Pricing } from './components/Pricing';
import { Faq } from './components/Faq';
import { CtaBanner } from './components/CtaBanner';
import { Footer } from './components/Footer';
import { LegalModal } from './components/LegalModal';
import { BrokerPostModal } from './components/BrokerPostModal';
import { CarrierCheckoutModal } from './components/CarrierCheckoutModal';
import { AuthModal } from './components/AuthModal';
import { LoadDetailsModal } from './components/LoadDetailsModal';
import { DispatchInquiryModal } from './components/DispatchInquiryModal';
import { LaneAlertsModal, type LaneAlert } from './components/LaneAlertsModal';
import { BrokerCreditModal } from './components/BrokerCreditModal';
import { AiIngestModal } from './components/AiIngestModal';
import { ToastContainer, type ToastItem } from './components/ToastContainer';

const INITIAL_FALLBACK_LOADS: FreightLoad[] = [
  {
    id: 'SW-2601',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    miles: 925,
    rate: 2850,
    rpm: 3.08,
    equipment_type: "53' Dry Van",
    weight: '42,000 lbs',
    commodity: 'General Freight / CPG',
    pickup_date: 'Today',
    broker_name: 'Apex Logistics Freight LLC',
    broker_mc: 'MC-981240',
    broker_phone: '+1 (800) 580-3101',
    broker_email: 'dispatch@apexlogistics.com',
    days_to_pay: '18 days',
    credit_score: 'A+ (98)',
  },
  {
    id: 'SW-2602',
    origin: 'Atlanta, GA',
    destination: 'Miami, FL',
    miles: 660,
    rate: 2450,
    rpm: 3.71,
    equipment_type: "53' Reefer",
    weight: '38,500 lbs',
    commodity: 'Fresh Produce / Chilled',
    pickup_date: 'Today',
    broker_name: 'Sunbelt Trans Logistics',
    broker_mc: 'MC-847291',
    broker_phone: '+1 (800) 441-2900',
    broker_email: 'loads@sunbeltfreight.com',
    days_to_pay: '16 days',
    credit_score: 'A (95)',
  },
  {
    id: 'SW-2603',
    origin: 'Los Angeles, CA',
    destination: 'Phoenix, AZ',
    miles: 375,
    rate: 1450,
    rpm: 3.86,
    equipment_type: 'Flatbed',
    weight: '44,000 lbs',
    commodity: 'Structural Steel Coils',
    pickup_date: 'Tomorrow',
    broker_name: 'Pacific Freight Exchange',
    broker_mc: 'MC-729104',
    broker_phone: '+1 (888) 920-4100',
    broker_email: 'dispatch@pacificfreight.com',
    days_to_pay: '21 days',
    credit_score: 'A+ (97)',
  },
  {
    id: 'SW-2604',
    origin: 'Philadelphia, PA',
    destination: 'Charlotte, NC',
    miles: 480,
    rate: 1720,
    rpm: 3.58,
    equipment_type: "53' Dry Van",
    weight: '34,000 lbs',
    commodity: 'Retail Goods / High Value',
    pickup_date: 'Today',
    broker_name: 'Keystone Logistics 3PL',
    broker_mc: 'MC-610294',
    broker_phone: '+1 (800) 332-9011',
    broker_email: 'freight@keystonelogistics.com',
    days_to_pay: '19 days',
    credit_score: 'A (94)',
  },
  {
    id: 'SW-2605',
    origin: 'Houston, TX',
    destination: 'Nashville, TN',
    miles: 780,
    rate: 2550,
    rpm: 3.27,
    equipment_type: "53' Dry Van",
    weight: '41,000 lbs',
    commodity: 'Industrial Parts',
    pickup_date: 'Today',
    broker_name: 'Lone Star Freight Express',
    broker_mc: 'MC-509122',
    broker_phone: '+1 (800) 771-3044',
    broker_email: 'ops@lonestarfreight.com',
    days_to_pay: '17 days',
    credit_score: 'A+ (99)',
  },
  {
    id: 'SW-2606',
    origin: 'Columbus, OH',
    destination: 'Atlanta, GA',
    miles: 560,
    rate: 1950,
    rpm: 3.48,
    equipment_type: "53' Reefer",
    weight: '40,000 lbs',
    commodity: 'Dairy & Beverages',
    pickup_date: 'Tomorrow',
    broker_name: 'Midwest Carrier Solutions',
    broker_mc: 'MC-418290',
    broker_phone: '+1 (800) 662-8119',
    broker_email: 'dispatch@midwestcs.com',
    days_to_pay: '20 days',
    credit_score: 'A (93)',
  },
];

export const App: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loads, setLoads] = useState<FreightLoad[]>(INITIAL_FALLBACK_LOADS);
  const [isLoadingLoads, setIsLoadingLoads] = useState(false);
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState<SearchFilter>({
    origin: '',
    destination: '',
    equipment: 'all',
  });

  // Modals state
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postModalPrefill, setPostModalPrefill] = useState<{ origin: string; dest: string } | null>(null);
  const [isCarrierCheckoutOpen, setIsCarrierCheckoutOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalRole, setAuthModalRole] = useState<'carrier' | 'broker'>('carrier');
  const [isLoadDetailsOpen, setIsLoadDetailsOpen] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<FreightLoad | null>(null);
  const [isDispatchInquiryOpen, setIsDispatchInquiryOpen] = useState(false);
  const [isLaneAlertsOpen, setIsLaneAlertsOpen] = useState(false);
  const [isBrokerCreditOpen, setIsBrokerCreditOpen] = useState(false);
  const [brokerCreditMc, setBrokerCreditMc] = useState<string>('');
  const [isAiIngestOpen, setIsAiIngestOpen] = useState(false);
  const [legalModalState, setLegalModalState] = useState<{ isOpen: boolean; type: 'privacy' | 'terms' }>({
    isOpen: false,
    type: 'privacy',
  });
  const [savedAlerts, setSavedAlerts] = useState<LaneAlert[]>([]);

  // Initialize saved lane alerts from backend API and localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('ln_lane_alerts');
      if (raw) setSavedAlerts(JSON.parse(raw));
    } catch {}

    fetch('/api/loadboard/lane-alerts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.alerts && data.alerts.length > 0) {
          const apiAlerts: LaneAlert[] = data.alerts.map((a: any) => ({
            id: String(a.id),
            origin: a.origin,
            destination: a.destination,
            equipment: a.equipment,
            minRpm: Number(a.min_rpm) || 2.50,
            contactPhone: a.contact_phone || '',
            contactEmail: a.contact_email || '',
            notifySms: a.notify_sms !== false,
            notifyEmail: a.notify_email !== false,
            createdAt: a.created_at
              ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'Active',
          }));
          setSavedAlerts(apiAlerts);
        }
      })
      .catch(() => {});
  }, []);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch live loads from backend
  const fetchLoads = useCallback(async (searchParams: SearchFilter) => {
    if (typeof window === 'undefined') return;
    setIsLoadingLoads(true);

    try {
      const params = new URLSearchParams();
      if (searchParams.origin) params.append('origin', searchParams.origin);
      if (searchParams.destination) params.append('destination', searchParams.destination);
      if (searchParams.equipment && searchParams.equipment !== 'all') {
        params.append('equipmentType', searchParams.equipment);
      }

      const res = await fetch(`/api/loadboard/search?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();

      if (res.ok && data.loads && data.loads.length > 0) {
        setLoads(data.loads);
      } else if (!searchParams.origin && !searchParams.destination) {
        setLoads(INITIAL_FALLBACK_LOADS);
      } else {
        setLoads([]);
      }
    } catch {
      // Keep existing loads on network failure
    } finally {
      setIsLoadingLoads(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    fetchLoads(filter);

    // Check user session
    fetch('/api/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});

    // Check query params for deep triggers
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'post-load') {
      setIsPostModalOpen(true);
    } else if (params.get('action') === 'checkout' || params.get('checkout') === '1') {
      setIsCarrierCheckoutOpen(true);
    } else if (params.get('action') === 'login' || params.get('login') === '1' || window.location.pathname.includes('/login')) {
      const role = params.get('role') === 'broker' ? 'broker' : 'carrier';
      setAuthModalRole(role);
      setIsAuthModalOpen(true);
    }
  }, [fetchLoads, filter]);

  // Real-Time Server-Sent Events (SSE) Stream
  useEffect(() => {
    if (typeof window === 'undefined' || !isLiveStreaming) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/loadboard/stream');

      eventSource.addEventListener('load_posted', (e) => {
        try {
          const raw = JSON.parse(e.data);
          if (raw) {
            const newLoad: FreightLoad = {
              id: raw.load_number || `SW-${raw.id || Math.floor(1000 + Math.random() * 9000)}`,
              origin: raw.pickup_location || raw.origin,
              destination: raw.delivery_location || raw.destination,
              equipment_type: raw.equipment_type || raw.equipment,
              rate: Number(raw.rate),
              miles: Number(raw.miles) || 650,
              rpm: raw.rpm ? Number(raw.rpm) : 3.15,
              weight:
                typeof raw.weight === 'number'
                  ? `${raw.weight.toLocaleString()} lbs`
                  : raw.weight || '42,000 lbs',
              commodity: raw.commodity || 'General Freight',
              pickup_date: raw.pickup_date ? String(raw.pickup_date).slice(0, 10) : 'Today',
              broker_name: raw.broker_name || 'LoadsNexus™ Verified Brokerage',
              broker_mc: raw.broker_mc || 'MC-VERIFIED',
              broker_phone: raw.broker_phone || '+1 (800) 580-3101',
              broker_email: raw.broker_email || 'dispatch@loadsnexus.com',
              days_to_pay: '21 days',
              credit_score: 'A+ (Verified)',
              is_live_broker_post: true,
            };
            setLoads((prev) => {
              if (prev.some((p) => p.id === newLoad.id)) return prev;
              return [newLoad, ...prev];
            });
            setLastRefreshedAt(new Date());
            showToast(
              `⚡ Live Freight Stream: ${newLoad.origin} → ${newLoad.destination} ($${Number(newLoad.rate).toLocaleString()})`
            );
          }
        } catch {}
      });

      eventSource.addEventListener('load_covered', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data && data.id) {
            setLoads((prev) =>
              prev.map((l) =>
                l.id === data.id || l.load_number === data.id
                  ? { ...l, is_covered: true, status: 'covered', covered_at: data.covered_at || Date.now() }
                  : l
              )
            );
          }
        } catch {}
      });
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [isLiveStreaming, showToast]);

  // Background Live Stream Auto-Refresh Polling Fallback (Every 30 seconds)
  useEffect(() => {
    if (typeof window === 'undefined' || !isLiveStreaming) return;

    const interval = setInterval(() => {
      const params = new URLSearchParams();
      if (filter.origin) params.append('origin', filter.origin);
      if (filter.destination) params.append('destination', filter.destination);
      if (filter.equipment && filter.equipment !== 'all') {
        params.append('equipmentType', filter.equipment);
      }

      fetch(`/api/loadboard/search?${params.toString()}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.loads && data.loads.length > 0) {
            setLoads(data.loads);
            setLastRefreshedAt(new Date());
          }
        })
        .catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [isLiveStreaming, filter]);

  const handleToggleLiveStream = () => {
    setIsLiveStreaming((prev) => {
      const next = !prev;
      showToast(next ? '⚡ Real-time live stream active' : '⏸ Real-time live stream paused');
      return next;
    });
  };

  // Modal Handlers
  const handleOpenAuth = (role: 'carrier' | 'broker' = 'carrier') => {
    setAuthModalRole(role);
    setIsAuthModalOpen(true);
  };

  const handleOpenCarrierCheckout = () => {
    setIsCarrierCheckoutOpen(true);
  };

  const handleOpenBrokerPost = (prefill?: { origin: string; dest: string }) => {
    setPostModalPrefill(prefill || null);
    setIsPostModalOpen(true);
  };

  const handleInspectLoad = (load: FreightLoad) => {
    setSelectedLoad(load);
    setIsLoadDetailsOpen(true);
  };

  const handleFilterChange = (newFilter: SearchFilter) => {
    setFilter(newFilter);
    fetchLoads(newFilter);
  };

  const handleLoadPosted = (newLoad: FreightLoad) => {
    setLoads((prev) => [newLoad, ...prev]);
  };

  const handleSaveLaneAlert = async (alert: LaneAlert) => {
    try {
      const res = await fetch('/api/loadboard/lane-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          origin: alert.origin,
          destination: alert.destination,
          equipment: alert.equipment,
          minRpm: alert.minRpm,
          contactPhone: alert.contactPhone,
          contactEmail: alert.contactEmail,
          notifySms: alert.notifySms !== false,
          notifyEmail: alert.notifyEmail !== false,
        }),
      });
      const data = await res.json();
      if (data?.alert?.id) {
        alert.id = String(data.alert.id);
      }
    } catch {}

    setSavedAlerts((prev) => {
      const next = [alert, ...prev];
      if (typeof window !== 'undefined') {
        localStorage.setItem('ln_lane_alerts', JSON.stringify(next));
      }
      return next;
    });
    showToast(`🔔 Lane Alert active for ${alert.origin || 'Any'} ➔ ${alert.destination || 'Any'}`);
  };

  const handleDeleteLaneAlert = async (id: string) => {
    try {
      fetch(`/api/loadboard/lane-alerts/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    } catch {}

    setSavedAlerts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ln_lane_alerts', JSON.stringify(next));
      }
      return next;
    });
    showToast('Lane alert removed.');
  };

  const handleOpenBrokerCredit = (mc?: string) => {
    setBrokerCreditMc(mc || '');
    setIsBrokerCreditOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50 text-slate-800">
      {/* Navigation */}
      <Navbar
        user={user}
        onOpenAuth={handleOpenAuth}
        onOpenCarrierCheckout={handleOpenCarrierCheckout}
        onOpenBrokerPost={() => handleOpenBrokerPost()}
      />

      <main className="flex-grow">
        {/* Hero Section */}
        <Hero
          onOpenCarrierCheckout={handleOpenCarrierCheckout}
          onOpenBrokerPost={() => handleOpenBrokerPost()}
          onOpenAuth={handleOpenAuth}
        />

        {/* Hero Search Widget */}
        <SearchWidget
          onSearch={handleFilterChange}
          onOpenPostFreight={(prefill) => handleOpenBrokerPost(prefill)}
        />

        {/* Corridor Rates Ticker */}
        <CorridorTicker />

        {/* DAT One Style Live Board */}
        <LiveLoadBoard
          loads={loads}
          isLoading={isLoadingLoads}
          filter={filter}
          onFilterChange={handleFilterChange}
          onRefresh={() => {
            fetchLoads(filter);
            showToast('Live spot board updated with latest rates.');
          }}
          onInspectLoad={handleInspectLoad}
          onOpenBrokerPost={() => handleOpenBrokerPost()}
          onOpenCarrierCheckout={handleOpenCarrierCheckout}
          isLiveStreaming={isLiveStreaming}
          onToggleLiveStream={handleToggleLiveStream}
          lastRefreshedAt={lastRefreshedAt}
          onOpenLaneAlerts={() => setIsLaneAlertsOpen(true)}
          onOpenBrokerCredit={() => handleOpenBrokerCredit()}
          onOpenAiIngest={() => setIsAiIngestOpen(true)}
          savedAlerts={savedAlerts}
          user={user}
          onOpenAuth={handleOpenAuth}
        />

        {/* Features Grid */}
        <Features />

        {/* Market Comparison Table */}
        <ComparisonTable />

        {/* Native Mobile Apps */}
        <MobileApps />

        {/* Pricing Section */}
        <Pricing
          onOpenCarrierCheckout={handleOpenCarrierCheckout}
          onOpenDispatchInquiry={() => setIsDispatchInquiryOpen(true)}
          onOpenBrokerPost={() => handleOpenBrokerPost()}
        />

        {/* Frequently Asked Questions */}
        <Faq
          onOpenCarrierCheckout={handleOpenCarrierCheckout}
          onOpenBrokerPost={() => handleOpenBrokerPost()}
        />

        {/* Final Conversion Banner */}
        <CtaBanner
          onOpenCarrierCheckout={handleOpenCarrierCheckout}
          onOpenBrokerPost={() => handleOpenBrokerPost()}
        />
      </main>

      {/* Corporate Footer */}
      <Footer
        onOpenAuth={handleOpenAuth}
        onOpenCarrierCheckout={handleOpenCarrierCheckout}
        onOpenBrokerPost={() => handleOpenBrokerPost()}
        onOpenDispatchInquiry={() => setIsDispatchInquiryOpen(true)}
        onOpenPrivacy={() => setLegalModalState({ isOpen: true, type: 'privacy' })}
        onOpenTerms={() => setLegalModalState({ isOpen: true, type: 'terms' })}
      />

      {/* Modals System */}
      <BrokerPostModal
        isOpen={isPostModalOpen}
        onClose={() => setIsPostModalOpen(false)}
        onSuccess={handleLoadPosted}
        onShowToast={showToast}
        prefill={postModalPrefill}
        user={user}
        onOpenAuth={handleOpenAuth}
      />

      <CarrierCheckoutModal
        isOpen={isCarrierCheckoutOpen}
        onClose={() => setIsCarrierCheckoutOpen(false)}
        onOpenAuth={handleOpenAuth}
        onShowToast={showToast}
        onSuccess={() => fetchLoads(filter)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        initialRole={authModalRole}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          fetchLoads(filter);
        }}
        onOpenCarrierCheckout={handleOpenCarrierCheckout}
        onOpenBrokerPost={() => handleOpenBrokerPost()}
        onShowToast={showToast}
      />

      <LoadDetailsModal
        load={selectedLoad}
        isOpen={isLoadDetailsOpen}
        onClose={() => setIsLoadDetailsOpen(false)}
        onOpenCarrierCheckout={handleOpenCarrierCheckout}
        onOpenBrokerCredit={handleOpenBrokerCredit}
        user={user}
        onOpenAuth={handleOpenAuth}
      />

      <DispatchInquiryModal
        isOpen={isDispatchInquiryOpen}
        onClose={() => setIsDispatchInquiryOpen(false)}
        onOpenCarrierCheckout={handleOpenCarrierCheckout}
      />

      <LaneAlertsModal
        isOpen={isLaneAlertsOpen}
        onClose={() => setIsLaneAlertsOpen(false)}
        onSaveAlert={handleSaveLaneAlert}
        savedAlerts={savedAlerts}
        onDeleteAlert={handleDeleteLaneAlert}
      />

      <BrokerCreditModal
        isOpen={isBrokerCreditOpen}
        onClose={() => setIsBrokerCreditOpen(false)}
        initialQuery={brokerCreditMc}
      />

      <AiIngestModal
        isOpen={isAiIngestOpen}
        onClose={() => setIsAiIngestOpen(false)}
        onSuccess={() => fetchLoads(filter)}
        onShowToast={showToast}
      />

      <LegalModal
        isOpen={legalModalState.isOpen}
        type={legalModalState.type}
        onClose={() => setLegalModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Toast Alerts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
