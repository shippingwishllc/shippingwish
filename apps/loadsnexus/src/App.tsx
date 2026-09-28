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
import { CarrierCheckoutModal, type LoadBoardPlanTier } from './components/CarrierCheckoutModal';
import { ConcurrentSessionModal } from './components/ConcurrentSessionModal';
import { AuthModal } from './components/AuthModal';
import { LoadDetailsModal } from './components/LoadDetailsModal';
import { DispatchInquiryModal } from './components/DispatchInquiryModal';
import { LaneAlertsModal, type LaneAlert } from './components/LaneAlertsModal';
import { BrokerCreditModal } from './components/BrokerCreditModal';
import { AiIngestModal } from './components/AiIngestModal';
import { AiSupportChat } from './components/AiSupportChat';
import { ToastContainer, type ToastItem } from './components/ToastContainer';
import { FreightCockpit } from './components/FreightCockpit';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [viewMode, setViewMode] = useState<'cockpit' | 'website'>('cockpit');
  const [loads, setLoads] = useState<FreightLoad[]>([]);
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
  const [checkoutPlanTier, setCheckoutPlanTier] = useState<LoadBoardPlanTier>('loadboard_ai_pass');
  const [isConcurrentSessionOpen, setIsConcurrentSessionOpen] = useState(false);
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

      if (res.ok && data.loads) {
        setLoads(data.loads);
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
        if (data?.user) {
          setUser(data.user);
          const p = new URLSearchParams(window.location.search);
          if (p.get('view') !== 'website') {
            setViewMode('cockpit');
          }
        }
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

  // DAT-Style Live Session Heartbeat & Seat Watchdog
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;

    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/session-heartbeat', { credentials: 'include' });
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          if (data.code === 'CONCURRENT_SESSION_TERMINATED') {
            setUser(null);
            setIsConcurrentSessionOpen(true);
          }
        }
      } catch {}
    };

    const interval = setInterval(checkSession, 20000);
    return () => clearInterval(interval);
  }, [user]);

  // Global listener & fetch interceptor for session termination across tabs or API responses
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      setUser(null);
      setIsConcurrentSessionOpen(true);
    };
    window.addEventListener('ln:concurrent-session-terminated', handler);

    // Global fetch hook to catch 401 concurrent session termination on any endpoint
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      if (res.status === 401) {
        try {
          const clone = res.clone();
          const data = await clone.json();
          if (data && data.code === 'CONCURRENT_SESSION_TERMINATED') {
            window.dispatchEvent(new CustomEvent('ln:concurrent-session-terminated'));
          }
        } catch {}
      }
      return res;
    };

    return () => {
      window.removeEventListener('ln:concurrent-session-terminated', handler);
      window.fetch = originalFetch;
    };
  }, []);

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
              id: raw.load_number || (raw.id != null ? `SW-${raw.id}` : ''),
              origin: raw.pickup_location || raw.origin,
              destination: raw.delivery_location || raw.destination,
              equipment_type: raw.equipment_type || raw.equipment,
              rate: Number(raw.rate) || 0,
              miles: Number(raw.miles) || 0,
              rpm: raw.rpm ? Number(raw.rpm) : (Number(raw.rate) && Number(raw.miles) ? Number((Number(raw.rate) / Number(raw.miles)).toFixed(2)) : 0),
              weight:
                typeof raw.weight === 'number'
                  ? `${raw.weight.toLocaleString()} lbs`
                  : raw.weight || '',
              commodity: raw.commodity || '',
              pickup_date: raw.pickup_date ? String(raw.pickup_date).slice(0, 10) : '',
              broker_name: raw.broker_name || '',
              broker_mc: raw.broker_mc || '',
              broker_phone: raw.broker_phone || '',
              broker_email: raw.broker_email || '',
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

  const handleOpenCarrierCheckout = (tier: LoadBoardPlanTier = 'loadboard_ai_pass') => {
    setCheckoutPlanTier(tier);
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
    <div className={`min-h-screen flex flex-col font-sans ${user && viewMode === 'cockpit' ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      {user && viewMode === 'cockpit' ? (
        <FreightCockpit
          user={user}
          loads={loads}
          isLoadingLoads={isLoadingLoads}
          filter={filter}
          onFilterChange={handleFilterChange}
          onRefresh={() => {
            fetchLoads(filter);
            showToast('Live spot board updated with latest rates.');
          }}
          onInspectLoad={handleInspectLoad}
          onOpenBrokerPost={() => handleOpenBrokerPost()}
          onOpenCarrierCheckout={handleOpenCarrierCheckout}
          onOpenAiIngest={() => setIsAiIngestOpen(true)}
          onOpenLaneAlerts={() => setIsLaneAlertsOpen(true)}
          onOpenBrokerCredit={() => handleOpenBrokerCredit()}
          savedAlerts={savedAlerts}
          isLiveStreaming={isLiveStreaming}
          onToggleLiveStream={handleToggleLiveStream}
          lastRefreshedAt={lastRefreshedAt}
          showToast={showToast}
          onSwitchView={(mode) => setViewMode(mode)}
          onOpenAuth={handleOpenAuth}
        />
      ) : (
        <>
          {/* Navigation */}
          <Navbar
            user={user}
            onOpenAuth={handleOpenAuth}
            onOpenCarrierCheckout={handleOpenCarrierCheckout}
            onOpenBrokerPost={() => handleOpenBrokerPost()}
            onOpenCockpit={() => setViewMode('cockpit')}
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
            <CorridorTicker loads={loads} />

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
        </>
      )}

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
        initialPlan={checkoutPlanTier}
      />

      <ConcurrentSessionModal
        isOpen={isConcurrentSessionOpen}
        onClose={() => setIsConcurrentSessionOpen(false)}
        onOpenLogin={() => {
          setIsConcurrentSessionOpen(false);
          handleOpenAuth('carrier');
        }}
        onOpenUpgrade={(tier) => {
          setIsConcurrentSessionOpen(false);
          handleOpenCarrierCheckout(tier);
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        initialRole={authModalRole}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          setViewMode('cockpit');
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

      {/* 24/7 AI Freight Support Chatbot */}
      <AiSupportChat
        brand="loadsnexus"
        onOpenCarrierCheckout={handleOpenCarrierCheckout}
        onOpenBrokerPost={() => handleOpenBrokerPost()}
      />

      {/* Toast Alerts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
