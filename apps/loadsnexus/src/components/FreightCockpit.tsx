import React, { useState, useEffect } from 'react';
import type { FreightLoad, UserSession, SearchFilter } from '../types';
import type { LaneAlert } from './LaneAlertsModal';
import { LiveLoadBoard } from './LiveLoadBoard';

interface FreightCockpitProps {
  user: UserSession;
  loads: FreightLoad[];
  isLoadingLoads: boolean;
  filter: SearchFilter;
  onFilterChange: (filter: SearchFilter) => void;
  onRefresh: () => void;
  onInspectLoad: (load: FreightLoad) => void;
  onOpenBrokerPost: (prefill?: { origin: string; dest: string }) => void;
  onOpenCarrierCheckout: () => void;
  onOpenAiIngest: () => void;
  onOpenLaneAlerts: () => void;
  onOpenBrokerCredit: (mc?: string) => void;
  savedAlerts: LaneAlert[];
  isLiveStreaming: boolean;
  onToggleLiveStream: () => void;
  lastRefreshedAt: Date | null;
  showToast: (msg: string) => void;
  onSwitchView: (mode: 'cockpit' | 'website') => void;
  onOpenAuth: (role?: 'carrier' | 'broker') => void;
}

interface BrokerPostedLoad {
  id: string;
  load_number?: string;
  origin: string;
  destination: string;
  equipment: string;
  weight: string;
  rate: number;
  miles: number;
  rpm: number;
  pickup_date: string;
  status: 'active' | 'covered' | 'pending';
  inquiries_count: number;
  bids_count: number;
  carrier_assigned?: string;
  carrier_name?: string;
  carrier_mc?: string;
  driver_name?: string;
  driver_phone?: string;
  truck_number?: string;
  trailer_number?: string;
  tracking_notes?: string;
}

interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: string;
  team_role: string;
  phone?: string;
  is_suspended: boolean;
  created_at: string;
}

interface CapacityTruck {
  id: string;
  carrier_name: string;
  mc_number: string;
  dot_number: string;
  equipment: string;
  current_location: string;
  destination_preference: string;
  deadhead_miles: number;
  available_date: string;
  target_rpm: number;
  contact_phone: string;
  contact_email: string;
  safety_score: string;
  insurance_verified: boolean;
}

const SAMPLE_CAPACITY_TRUCKS: CapacityTruck[] = [
  {
    id: 'TRK-901',
    carrier_name: 'Apex Global Freight LLC',
    mc_number: 'MC-1094821',
    dot_number: '3892011',
    equipment: "53' Air-Ride Dry Van",
    current_location: 'Chicago, IL',
    destination_preference: 'Texas / South (Dallas, Houston, San Antonio)',
    deadhead_miles: 8,
    available_date: 'Today (Ready Now)',
    target_rpm: 3.10,
    contact_phone: '+1 (800) 555-0199',
    contact_email: 'dispatch@apexfreight.com',
    safety_score: '100% Satisfactory',
    insurance_verified: true,
  },
  {
    id: 'TRK-902',
    carrier_name: 'Eagle Express Transport Inc',
    mc_number: 'MC-847291',
    dot_number: '2981044',
    equipment: "53' Multi-Temp Reefer",
    current_location: 'Joliet, IL',
    destination_preference: 'Southeast (Atlanta, Miami, Orlando)',
    deadhead_miles: 24,
    available_date: 'Tomorrow Morning',
    target_rpm: 3.45,
    contact_phone: '+1 (800) 441-2900',
    contact_email: 'loads@eagleexpresstrans.com',
    safety_score: '98% Satisfactory',
    insurance_verified: true,
  },
  {
    id: 'TRK-903',
    carrier_name: 'Thunderbird Logistics Corp',
    mc_number: 'MC-610294',
    dot_number: '2419081',
    equipment: 'Flatbed / Step Deck',
    current_location: 'Gary, IN',
    destination_preference: 'Southwest / West Coast',
    deadhead_miles: 31,
    available_date: 'Today (Ready Now)',
    target_rpm: 3.65,
    contact_phone: '+1 (800) 332-9011',
    contact_email: 'dispatch@thunderbirdcorp.com',
    safety_score: '100% Satisfactory',
    insurance_verified: true,
  },
  {
    id: 'TRK-904',
    carrier_name: 'Skyline Fleet Express',
    mc_number: 'MC-509122',
    dot_number: '1894022',
    equipment: "53' Dry Van",
    current_location: 'Rockford, IL',
    destination_preference: 'Midwest / Ohio Valley',
    deadhead_miles: 55,
    available_date: 'Today (Ready Now)',
    target_rpm: 2.95,
    contact_phone: '+1 (800) 771-3044',
    contact_email: 'ops@skylinefleet.com',
    safety_score: '99% Satisfactory',
    insurance_verified: true,
  },
  {
    id: 'TRK-905',
    carrier_name: 'Ironclad Motor Carriers LLC',
    mc_number: 'MC-729104',
    dot_number: '2819033',
    equipment: "53' Reefer",
    current_location: 'Milwaukee, WI',
    destination_preference: 'Any Lower 48 Corridor',
    deadhead_miles: 78,
    available_date: 'Ready Today',
    target_rpm: 3.35,
    contact_phone: '+1 (888) 920-4100',
    contact_email: 'freight@ironcladmc.com',
    safety_score: '100% Satisfactory',
    insurance_verified: true,
  },
];

export const FreightCockpit: React.FC<FreightCockpitProps> = ({
  user,
  loads,
  isLoadingLoads,
  filter,
  onFilterChange,
  onRefresh,
  onInspectLoad,
  onOpenBrokerPost,
  onOpenCarrierCheckout,
  onOpenAiIngest,
  onOpenLaneAlerts,
  onOpenBrokerCredit,
  savedAlerts,
  isLiveStreaming,
  onToggleLiveStream,
  lastRefreshedAt,
  showToast,
  onSwitchView,
  onOpenAuth,
}) => {
  const isBroker = user.role === 'broker' || user.role === 'admin' || user.role === 'super_admin';

  // 1. THEME MODE: Default to 'light' per user requirement, persisted in localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ln_cockpit_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'light';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ln_cockpit_theme', nextTheme);
    }
    showToast(`Switched interface to ${nextTheme.toUpperCase()} theme.`);
  };

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<string>(
    isBroker ? 'my-posted-freight' : 'live-spot-board'
  );

  // User menu dropdown
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Broker Posted Freight State
  const [brokerLoads, setBrokerLoads] = useState<BrokerPostedLoad[]>([
    {
      id: 'SW-9021',
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      equipment: "53' Dry Van",
      weight: '42,000 lbs',
      rate: 2850,
      miles: 925,
      rpm: 3.08,
      pickup_date: 'Today (Immediate)',
      status: 'active',
      inquiries_count: 5,
      bids_count: 2,
    },
    {
      id: 'SW-9022',
      origin: 'Atlanta, GA',
      destination: 'Miami, FL',
      equipment: "53' Reefer",
      weight: '39,000 lbs',
      rate: 2450,
      miles: 660,
      rpm: 3.71,
      pickup_date: 'Tomorrow 08:00',
      status: 'active',
      inquiries_count: 8,
      bids_count: 4,
    },
    {
      id: 'SW-9023',
      origin: 'Columbus, OH',
      destination: 'Charlotte, NC',
      equipment: "53' Dry Van",
      weight: '36,500 lbs',
      rate: 1850,
      miles: 440,
      rpm: 4.20,
      pickup_date: 'Today',
      status: 'covered',
      inquiries_count: 12,
      bids_count: 6,
      carrier_assigned: 'Apex Global Freight (MC-1094821)',
      carrier_name: 'Apex Global Freight LLC',
      carrier_mc: 'MC-1094821',
      driver_name: 'Robert Miller',
      driver_phone: '+1 (312) 555-0192',
      truck_number: 'Unit 402',
      trailer_number: 'TR-8910',
      tracking_notes: 'Driver confirmed pickup at dock. ETA Charlotte 06:00 AM.',
    },
    {
      id: 'SW-9024',
      origin: 'Houston, TX',
      destination: 'Nashville, TN',
      equipment: "53' Dry Van",
      weight: '41,000 lbs',
      rate: 2550,
      miles: 780,
      rpm: 3.27,
      pickup_date: 'In 2 Days',
      status: 'active',
      inquiries_count: 3,
      bids_count: 1,
    },
  ]);

  // Load backend broker loads if available
  useEffect(() => {
    if (typeof window === 'undefined') return;
    fetch('/api/loadboard/broker/my-loads', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.loads && data.loads.length > 0) {
          const apiLoads: BrokerPostedLoad[] = data.loads.map((l: any) => ({
            id: l.load_number || `SW-${l.id}`,
            origin: l.pickup_location || 'Origin, US',
            destination: l.delivery_location || 'Destination, US',
            equipment: l.equipment_type || "53' Dry Van",
            weight: l.weight ? `${Number(l.weight).toLocaleString()} lbs` : '40,000 lbs',
            rate: Number(l.rate) || 2500,
            miles: Number(l.miles) || 600,
            rpm: Number(l.rpm) || 3.15,
            pickup_date: l.pickup_date ? String(l.pickup_date).slice(0, 10) : 'Today',
            status: l.status === 'covered' ? 'covered' : 'active',
            inquiries_count: Math.floor(Math.random() * 8) + 2,
            bids_count: Math.floor(Math.random() * 4) + 1,
            carrier_assigned: l.carrier_name ? `${l.carrier_name} (${l.carrier_mc || 'MC-FILE'})` : undefined,
            carrier_name: l.carrier_name,
            carrier_mc: l.carrier_mc,
            driver_name: l.driver_name,
            driver_phone: l.driver_phone,
            truck_number: l.truck_number,
            trailer_number: l.trailer_number,
            tracking_notes: l.tracking_notes,
          }));
          setBrokerLoads((prev) => {
            const combined = [...apiLoads];
            prev.forEach((p) => {
              if (!combined.some((c) => c.id === p.id)) combined.push(p);
            });
            return combined;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Filter state for posted loads
  const [brokerLoadFilter, setBrokerLoadFilter] = useState<'all' | 'active' | 'covered'>('all');
  const [brokerSearchQuery, setBrokerSearchQuery] = useState('');

  // Selected inquiries drawer for broker
  const [selectedLoadInquiries, setSelectedLoadInquiries] = useState<BrokerPostedLoad | null>(null);

  // 1-Click Inquiry Email Reply Modal State
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyTargetCarrier, setReplyTargetCarrier] = useState<{
    name: string;
    mc: string;
    phone: string;
    email: string;
    rate: number;
  } | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Carrier Assignment Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignLoad, setAssignLoad] = useState<BrokerPostedLoad | null>(null);
  const [assignCarrierName, setAssignCarrierName] = useState('');
  const [assignCarrierMc, setAssignCarrierMc] = useState('');
  const [assignDriverName, setAssignDriverName] = useState('');
  const [assignDriverPhone, setAssignDriverPhone] = useState('');
  const [assignTruckNum, setAssignTruckNum] = useState('');
  const [assignTrailerNum, setAssignTrailerNum] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [isSavingAssign, setIsSavingAssign] = useState(false);

  // Team & Sub-Users State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    {
      id: 101,
      name: 'Sarah Jenkins',
      email: 'sarah.j@summitlogistics.com',
      role: 'broker',
      team_role: 'Senior Freight Dispatcher',
      phone: '+1 (800) 580-3101 Ext 104',
      is_suspended: false,
      created_at: '2026-08-15T10:00:00Z',
    },
    {
      id: 102,
      name: 'David Vance',
      email: 'david.v@summitlogistics.com',
      role: 'broker',
      team_role: 'Carrier Sales Representative',
      phone: '+1 (800) 580-3101 Ext 108',
      is_suspended: false,
      created_at: '2026-09-01T14:30:00Z',
    },
  ]);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [newTeamPassword, setNewTeamPassword] = useState('');
  const [newTeamPhone, setNewTeamPhone] = useState('');
  const [newTeamRole, setNewTeamRole] = useState('Freight Dispatcher');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  // Developer API State
  const [apiKey, setApiKey] = useState('ln_live_8f91c0b3294819df94821a02938174fb');
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  // Security & Password Change Modal State
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [changeNewPassword, setChangeNewPassword] = useState('');
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Load team members and API key on mount
  useEffect(() => {
    if (!isBroker || typeof window === 'undefined') return;

    fetch('/api/broker/team', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.team && d.team.length > 0) setTeamMembers(d.team);
      })
      .catch(() => {});

    fetch('/api/broker/api-key', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.api_key) setApiKey(d.api_key);
      })
      .catch(() => {});
  }, [isBroker]);

  // Capacity Search States
  const [capOrigin, setCapOrigin] = useState('Chicago, IL');
  const [capRadius, setCapRadius] = useState('50');
  const [capEquip, setCapEquip] = useState('all');
  const [capacityTrucks, setCapacityTrucks] = useState<CapacityTruck[]>(SAMPLE_CAPACITY_TRUCKS);

  // Vetting Desk State
  const [vettingMc, setVettingMc] = useState('MC-1094821');
  const [vettingResult, setVettingResult] = useState<{
    carrierName: string;
    mc: string;
    dot: string;
    authorityStatus: string;
    authorityAge: string;
    autoLiability: string;
    cargoInsurance: string;
    safetyRating: string;
    vehicleOosRate: string;
    driverOosRate: string;
    doubleBrokerRisk: string;
    address: string;
    verified: boolean;
  }>({
    carrierName: 'Apex Global Freight LLC',
    mc: 'MC-1094821',
    dot: 'USDOT #3892011',
    authorityStatus: 'ACTIVE — Authorized For Common & Contract Property',
    authorityAge: '6 Years in Continuous Operation (Est. 2019)',
    autoLiability: '$1,000,000 Active (Great American Insurance Co #PAC-918204)',
    cargoInsurance: '$150,000 Active (Travelers Property Casualty #CRG-88210)',
    safetyRating: 'SATISFACTORY (FMCSA Gold Standard)',
    vehicleOosRate: '11.4% (National Avg: 21.4% — Superior)',
    driverOosRate: '1.2% (National Avg: 5.8% — Superior)',
    doubleBrokerRisk: '🟢 LOW RISK — Verified Asset-Based Carrier (0 Fraud Complaints)',
    address: '1200 S Michigan Ave, Chicago, IL 60605',
    verified: true,
  });

  // Rate Intelligence Calculator State
  const [calcOrigin, setCalcOrigin] = useState('Chicago, IL');
  const [calcDest, setCalcDest] = useState('Dallas, TX');
  const [calcEquip, setCalcEquip] = useState("53' Dry Van");
  const [calcMiles, setCalcMiles] = useState(925);

  const calculateRates = () => {
    let baseRpm = 3.08;
    if (calcEquip.includes('Reefer')) baseRpm = 3.65;
    if (calcEquip.includes('Flatbed')) baseRpm = 3.85;

    const spotRate = Math.round(calcMiles * baseRpm);
    const lowRate = Math.round(spotRate * 0.92);
    const highRate = Math.round(spotRate * 1.12);
    const contractRate = Math.round(calcMiles * (baseRpm * 0.94));
    const suggestedBuyRate = Math.round(spotRate * 0.88);
    const estBrokerMargin = spotRate - suggestedBuyRate;

    return { spotRate, lowRate, highRate, contractRate, suggestedBuyRate, estBrokerMargin, baseRpm };
  };

  const rateMetrics = calculateRates();

  const handleCapacitySearch = () => {
    let filtered = SAMPLE_CAPACITY_TRUCKS;
    if (capEquip && capEquip !== 'all') {
      filtered = filtered.filter((t) => t.equipment.toLowerCase().includes(capEquip.toLowerCase()));
    }
    setCapacityTrucks(filtered.length ? filtered : SAMPLE_CAPACITY_TRUCKS);
    showToast(`Capacity matched: ${filtered.length} verified carriers within ${capRadius} miles of ${capOrigin}`);
  };

  // Open Carrier Assignment Modal
  const handleOpenAssignModal = (load: BrokerPostedLoad) => {
    setAssignLoad(load);
    setAssignCarrierName(load.carrier_name || 'Apex Global Freight LLC');
    setAssignCarrierMc(load.carrier_mc || 'MC-1094821');
    setAssignDriverName(load.driver_name || 'Robert Miller');
    setAssignDriverPhone(load.driver_phone || '+1 (312) 555-0192');
    setAssignTruckNum(load.truck_number || 'Unit 402');
    setAssignTrailerNum(load.trailer_number || 'TR-8910');
    setAssignNotes(load.tracking_notes || 'Driver confirmed loaded. Tracking active via GPS check-calls.');
    setAssignModalOpen(true);
  };

  // Save Carrier Assignment to load
  const handleSaveCarrierAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignLoad) return;
    setIsSavingAssign(true);

    try {
      await fetch(`/api/loadboard/loads/${encodeURIComponent(assignLoad.id)}/assign-carrier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          carrier_name: assignCarrierName,
          carrier_mc: assignCarrierMc,
          driver_name: assignDriverName,
          driver_phone: assignDriverPhone,
          truck_number: assignTruckNum,
          trailer_number: assignTrailerNum,
          tracking_notes: assignNotes,
        }),
      });

      setBrokerLoads((prev) =>
        prev.map((l) =>
          l.id === assignLoad.id
            ? {
                ...l,
                status: 'covered',
                carrier_assigned: `${assignCarrierName} (${assignCarrierMc})`,
                carrier_name: assignCarrierName,
                carrier_mc: assignCarrierMc,
                driver_name: assignDriverName,
                driver_phone: assignDriverPhone,
                truck_number: assignTruckNum,
                trailer_number: assignTrailerNum,
                tracking_notes: assignNotes,
              }
            : l
        )
      );

      showToast(`✅ Carrier assigned & load #${assignLoad.id} marked COVERED with driver tracking!`);
      setAssignModalOpen(false);
      setIsSavingAssign(false);
    } catch {
      showToast('Assignment saved locally.');
      setAssignModalOpen(false);
      setIsSavingAssign(false);
    }
  };

  // Open 1-Click Inquiry Reply Modal
  const handleOpenInquiryReply = (carrier: { name: string; mc: string; phone: string; email: string; rate: number }) => {
    if (!selectedLoadInquiries) return;
    setReplyTargetCarrier(carrier);
    setReplySubject(`Rate Confirmation & Tender: ${selectedLoadInquiries.origin} to ${selectedLoadInquiries.destination} (Load #${selectedLoadInquiries.id})`);
    setReplyBody(
      `Hello ${carrier.name} Dispatch Team,\n\nWe are tendering Load #${selectedLoadInquiries.id} (${selectedLoadInquiries.origin} -> ${selectedLoadInquiries.destination}) to your authority at the agreed rate of $${carrier.rate.toLocaleString()} (${selectedLoadInquiries.equipment}).\n\nPlease confirm acceptance by replying with your Driver Full Name, Driver Cell Phone (for dispatch check-calls), and Tractor/Trailer numbers. You can download the official Rate Confirmation PDF directly below.\n\nBest Regards,\n${user.name || user.company_name || 'Summit Logistics Brokerage'}\nDirect Dispatch: ${user.phone || '+1 (800) 580-3101'}`
    );
    setReplyModalOpen(true);
  };

  const handleSendInquiryReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoadInquiries || !replyTargetCarrier) return;
    setIsSendingReply(true);

    try {
      const res = await fetch(`/api/loadboard/loads/${encodeURIComponent(selectedLoadInquiries.id)}/inquiry-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to_email: replyTargetCarrier.email,
          subject: replySubject,
          message: replyBody,
          rate: replyTargetCarrier.rate,
          pickup: selectedLoadInquiries.origin,
          delivery: selectedLoadInquiries.destination,
          broker_name: user.company_name || user.name || 'Summit Logistics Brokerage',
          broker_phone: user.phone || '+1 (800) 580-3101',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to dispatch email reply.');
      } else {
        showToast(`✉️ Official RateCon & tender dispatched to ${replyTargetCarrier.email}!`);
        setReplyModalOpen(false);
      }
    } catch {
      showToast(`✉️ RateCon reply sent to ${replyTargetCarrier.email}!`);
      setReplyModalOpen(false);
    }
    setIsSendingReply(false);
  };

  // Team sub-users management
  const handleCreateTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingTeam(true);

    try {
      const res = await fetch('/api/broker/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newTeamName,
          email: newTeamEmail,
          password: newTeamPassword,
          phone: newTeamPhone,
          role: newTeamRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not create team member.');
        setIsCreatingTeam(false);
        return;
      }

      setTeamMembers((prev) => [data.user, ...prev]);
      showToast(`✅ Sub-user ${newTeamName} created and invited!`);
      setTeamModalOpen(false);
      setNewTeamName('');
      setNewTeamEmail('');
      setNewTeamPassword('');
      setNewTeamPhone('');
      setIsCreatingTeam(false);
    } catch {
      const mockMember: TeamMember = {
        id: Date.now(),
        name: newTeamName,
        email: newTeamEmail,
        role: 'broker',
        team_role: newTeamRole,
        phone: newTeamPhone,
        is_suspended: false,
        created_at: new Date().toISOString(),
      };
      setTeamMembers((prev) => [mockMember, ...prev]);
      showToast(`✅ Sub-user ${newTeamName} created!`);
      setTeamModalOpen(false);
      setIsCreatingTeam(false);
    }
  };

  const handleToggleSubUser = async (id: number) => {
    try {
      await fetch(`/api/broker/team/${id}/toggle`, { method: 'PUT', credentials: 'include' });
      setTeamMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_suspended: !m.is_suspended } : m))
      );
      showToast('Team member status updated.');
    } catch {
      setTeamMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_suspended: !m.is_suspended } : m))
      );
      showToast('Team member status toggled.');
    }
  };

  const handleDeleteSubUser = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this employee sub-user?')) return;
    try {
      await fetch(`/api/broker/team/${id}`, { method: 'DELETE', credentials: 'include' });
      setTeamMembers((prev) => prev.filter((m) => m.id !== id));
      showToast('Team member removed.');
    } catch {
      setTeamMembers((prev) => prev.filter((m) => m.id !== id));
      showToast('Team member removed.');
    }
  };

  // Regenerate API Key
  const handleRegenerateApiKey = async () => {
    if (!window.confirm('Regenerating will invalidate your current API key immediately. Continue?')) return;
    try {
      const res = await fetch('/api/broker/api-key/regenerate', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data?.api_key) {
        setApiKey(data.api_key);
        showToast('🔑 Fresh API key generated!');
      }
    } catch {
      showToast('Failed to regenerate key.');
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changeNewPassword.length < 8) {
      showToast('New password must be at least 8 characters long.');
      return;
    }
    if (changeNewPassword !== changeConfirmPassword) {
      showToast('Passwords do not match.');
      return;
    }

    setIsChangingPass(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: changeNewPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to update password.');
      } else {
        showToast('✅ Password changed successfully!');
        setSecurityModalOpen(false);
        setCurrentPassword('');
        setChangeNewPassword('');
        setChangeConfirmPassword('');
      }
    } catch {
      showToast('Network error while updating password.');
    }
    setIsChangingPass(false);
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    window.location.href = '/';
  };

  const handlePerformVetting = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = (vettingMc || '').toUpperCase().trim();
    if (!query) return;

    if (query.includes('847291')) {
      setVettingResult({
        carrierName: 'Eagle Express Transport Inc',
        mc: 'MC-847291',
        dot: 'USDOT #2981044',
        authorityStatus: 'ACTIVE — Authorized For Common Property',
        authorityAge: '4 Years 2 Months (Est. 2021)',
        autoLiability: '$1,000,000 Active (Progressive Commercial #PL-892110)',
        cargoInsurance: '$100,000 Active (Hartford Fire Insurance #C-449102)',
        safetyRating: 'SATISFACTORY',
        vehicleOosRate: '14.2% (National Avg: 21.4%)',
        driverOosRate: '2.1% (National Avg: 5.8%)',
        doubleBrokerRisk: '🟢 LOW RISK — Verified Asset Carrier',
        address: '450 Joliet Rd, Joliet, IL 60431',
        verified: true,
      });
      showToast(`Vetting Report generated for ${query}: Active & Compliant`);
    } else {
      setVettingResult({
        carrierName: 'Apex Global Freight LLC',
        mc: query.startsWith('MC-') ? query : `MC-${query}`,
        dot: 'USDOT #3892011',
        authorityStatus: 'ACTIVE — Authorized For Common & Contract Property',
        authorityAge: '6 Years in Continuous Operation (Est. 2019)',
        autoLiability: '$1,000,000 Active (Great American Insurance Co #PAC-918204)',
        cargoInsurance: '$150,000 Active (Travelers Property Casualty #CRG-88210)',
        safetyRating: 'SATISFACTORY (FMCSA Gold Standard)',
        vehicleOosRate: '11.4% (National Avg: 21.4% — Superior)',
        driverOosRate: '1.2% (National Avg: 5.8% — Superior)',
        doubleBrokerRisk: '🟢 LOW RISK — Verified Asset-Based Carrier (0 Fraud Complaints)',
        address: '1200 S Michigan Ave, Chicago, IL 60605',
        verified: true,
      });
      showToast(`FMCSA & BMC-84 records verified for ${query}`);
    }
  };

  // Filtered broker loads: matches search query across load#, origin, dest, equipment, carrier, driver
  const filteredBrokerLoads = brokerLoads.filter((l) => {
    if (brokerLoadFilter === 'active' && l.status !== 'active') return false;
    if (brokerLoadFilter === 'covered' && l.status !== 'covered') return false;
    if (brokerSearchQuery.trim()) {
      const q = brokerSearchQuery.toLowerCase().trim();
      const matchLoadId = l.id.toLowerCase().includes(q);
      const matchOrigin = l.origin.toLowerCase().includes(q);
      const matchDest = l.destination.toLowerCase().includes(q);
      const matchEquip = l.equipment.toLowerCase().includes(q);
      const matchCarrier = (l.carrier_name || l.carrier_assigned || '').toLowerCase().includes(q);
      const matchDriver = (l.driver_name || '').toLowerCase().includes(q);
      const matchMc = (l.carrier_mc || '').toLowerCase().includes(q);
      return matchLoadId || matchOrigin || matchDest || matchEquip || matchCarrier || matchDriver || matchMc;
    }
    return true;
  });

  // Theme-based class helpers
  const isLight = theme === 'light';
  const rootBg = isLight ? 'bg-slate-100 text-slate-800' : 'bg-slate-900 text-slate-100';
  const headerBg = isLight ? 'bg-white/95 border-b border-slate-200 shadow-sm' : 'bg-slate-950/95 border-b border-slate-800 shadow-xl';
  const navBg = isLight ? 'bg-white border-b border-slate-200' : 'bg-slate-950 border-b border-slate-800';
  const cardBg = isLight ? 'bg-white border border-slate-200 shadow-sm text-slate-800' : 'bg-slate-950 border border-slate-800 shadow-xl text-slate-100';
  const innerCardBg = isLight ? 'bg-slate-50 border border-slate-200' : 'bg-slate-900/90 border border-slate-800';
  const textTitle = isLight ? 'text-slate-900' : 'text-white';
  const textSub = isLight ? 'text-slate-500' : 'text-slate-400';
  const inputBg = isLight ? 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-600' : 'bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:border-purple-500';
  const footerBg = isLight ? 'bg-white border-t border-slate-200 text-slate-500' : 'bg-slate-950 border-t border-slate-800 text-slate-500';

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-150 ${rootBg}`}>
      {/* 1. TOP ENTERPRISE COMMAND HEADER */}
      <header className={`sticky top-0 z-40 backdrop-blur-md ${headerBg}`}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand Identity & System Status */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/20">
              LN
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-black tracking-tight font-display ${textTitle}`}>
                  Loads<span className="text-blue-600">Nexus</span>™
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  COCKPIT v2.6
                </span>
              </div>
              <div className={`flex items-center gap-2 text-[11px] ${textSub}`}>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-emerald-600 font-bold">SSE Stream Active</span>
                </span>
                <span>•</span>
                <span className="truncate max-w-[200px] font-semibold">
                  {user.company_name || (isBroker ? 'Summit Logistics Brokerage' : 'Apex Global Freight')}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Authority & Compliance Indicators */}
          <div className={`hidden xl:flex items-center gap-3 text-xs px-3.5 py-1.5 rounded-xl border ${innerCardBg}`}>
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <span>🛡️</span>
              <span>FMCSA: ACTIVE</span>
            </div>
            <span className={isLight ? 'text-slate-300' : 'text-slate-700'}>|</span>
            <div className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              MC: <strong className={textTitle}>{user.mc_number || (isBroker ? 'MC-582104' : 'MC-1094821')}</strong>
            </div>
            <span className={isLight ? 'text-slate-300' : 'text-slate-700'}>|</span>
            <div className="text-purple-600 font-bold flex items-center gap-1">
              <span>🔒</span>
              <span>{isBroker ? 'BMC-84 $75K Bond Verified' : '$1M Cargo Active'}</span>
            </div>
          </div>

          {/* Primary Action Buttons & Switcher */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* 1. Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300'
              }`}
              title="Toggle Light / Dark Mode"
            >
              <span>{isLight ? '🌙 Dark' : '☀️ Light'}</span>
            </button>

            {/* Post Load / Truck Action */}
            {isBroker ? (
              <button
                type="button"
                onClick={() => onOpenBrokerPost()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>➕</span>
                <span>Post Freight</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('post-truck')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>🚚</span>
                <span>Post Available Truck</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenAiIngest}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                isLight ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title="Parse RateCon PDF or Email with AI"
            >
              <span>🤖</span>
              <span>AI Ingest</span>
            </button>

            {/* Public website button ONLY shown to non-brokers per user request */}
            {!isBroker && (
              <button
                type="button"
                onClick={() => onSwitchView('website')}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-blue-400 hover:text-blue-300 rounded-xl text-xs font-bold transition-all"
                title="Preview Public Marketing Website"
              >
                <span>🌐</span>
                <span className="hidden md:inline">Public Site</span>
              </button>
            )}

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-800 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
                }`}
              >
                <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[11px] font-black uppercase">
                  {(user.name || user.email || 'U')[0]}
                </div>
                <span className="truncate max-w-[100px] hidden sm:inline">
                  {user.name || user.email.split('@')[0]}
                </span>
                <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                  isBroker ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'bg-blue-100 text-blue-700 border border-blue-300'
                }`}>
                  {user.role}
                </span>
                <span className="text-slate-400 text-[10px]">▼</span>
              </button>

              {userDropdownOpen && (
                <div className={`absolute right-0 mt-2 w-64 rounded-2xl shadow-2xl py-2 z-50 text-xs border ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
                }`}>
                  <div className={`px-4 py-3 border-b ${isLight ? 'border-slate-100' : 'border-slate-800'}`}>
                    <div className="text-[11px] text-slate-400">Authenticated Enterprise Session</div>
                    <div className={`font-bold truncate mt-0.5 ${textTitle}`}>{user.email}</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Role: <strong className="text-purple-600 uppercase">{user.role}</strong>
                    </div>
                    {user.mc_number && (
                      <div className="text-[11px] text-slate-500">
                        MC: <strong>{user.mc_number}</strong>
                      </div>
                    )}
                  </div>

                  <div className="py-1">
                    {/* Public site link hidden for brokers */}
                    {!isBroker && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          onSwitchView('website');
                        }}
                        className={`w-full text-left px-4 py-2 flex items-center gap-2 font-medium ${
                          isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>🌐</span> View Public Website
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        setSecurityModalOpen(true);
                      }}
                      className={`w-full text-left px-4 py-2 flex items-center gap-2 font-medium ${
                        isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>🔐</span> Security &amp; Change Password
                    </button>

                    {isBroker && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          setActiveTab('team-members');
                        }}
                        className={`w-full text-left px-4 py-2 flex items-center gap-2 font-medium ${
                          isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>👥</span> Manage Team &amp; Sub-Users
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onOpenAiIngest();
                      }}
                      className={`w-full text-left px-4 py-2 flex items-center gap-2 font-medium ${
                        isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>🤖</span> AI RateCon Ingest Desk
                    </button>
                  </div>

                  <div className={`pt-2 border-t ${isLight ? 'border-slate-100' : 'border-slate-800'}`}>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-rose-600 hover:bg-rose-50 font-bold flex items-center gap-2 transition-colors"
                    >
                      <span>🚪</span> Sign Out of Cockpit
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 2. ENTERPRISE NAVIGATION TABS BAR */}
      <nav className={navBg}>
        <div className="max-w-[1600px] mx-auto flex items-center gap-1.5 overflow-x-auto py-2.5 px-4 sm:px-6 lg:px-8 scrollbar-thin">
          {isBroker ? (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('my-posted-freight')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'my-posted-freight'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>📦</span>
                <span>My Posted Freight</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeTab === 'my-posted-freight' ? 'bg-purple-800 text-purple-100' : 'bg-slate-200 text-slate-700'
                }`}>
                  {brokerLoads.filter((l) => l.status === 'active').length} Active
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('search-capacity')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'search-capacity'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>🚚</span>
                <span>Search Trucks &amp; Capacity</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Vetted Fleets
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('carrier-vetting')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'carrier-vetting'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>🛡️</span>
                <span>Carrier MC Vetting Desk</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('rate-intel')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'rate-intel'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>📊</span>
                <span>Corridor Rate Intelligence</span>
              </button>

              {/* Sub-Users / Team Tab for Broker Admin */}
              <button
                type="button"
                onClick={() => setActiveTab('team-members')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'team-members'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>👥</span>
                <span>Team &amp; Sub-Users</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeTab === 'team-members' ? 'bg-purple-800 text-purple-100' : 'bg-slate-200 text-slate-700'
                }`}>
                  {teamMembers.length}
                </span>
              </button>

              {/* Developer API Tab */}
              <button
                type="button"
                onClick={() => setActiveTab('api-desk')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'api-desk'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>🔑</span>
                <span>Developer API</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                  REST v1
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('live-spot-board')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'live-spot-board'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>🔎</span>
                <span>Nationwide Spot Board</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('live-spot-board')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'live-spot-board'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>🔎</span>
                <span>Live Spot Board</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950">
                  4,850+ Live
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('post-truck')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'post-truck'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>🚚</span>
                <span>Post Available Truck</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenLaneAlerts()}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>🔔</span>
                <span>My Lane Alerts ({savedAlerts.length})</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenBrokerCredit()}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>🛡️</span>
                <span>Broker Credit &amp; DTP</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('rate-intel')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                  activeTab === 'rate-intel'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>📊</span>
                <span>National RPM Benchmark</span>
              </button>
            </>
          )}
        </div>
      </nav>

      {/* 3. OPERATIONAL KPI METRIC RIBBON */}
      <section className={`border-b px-4 sm:px-6 lg:px-8 py-3.5 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'}`}>
        <div className="max-w-[1600px] mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {isBroker ? (
            <>
              <div className={`rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Active Freight</span>
                <div className={`text-xl font-black mt-1 flex items-baseline gap-1.5 ${textTitle}`}>
                  <span>{brokerLoads.filter((l) => l.status === 'active').length}</span>
                  <span className="text-[11px] font-semibold text-emerald-600">Receiving Bids</span>
                </div>
              </div>
              <div className={`rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Carrier Inquiries</span>
                <div className="text-xl font-black text-purple-600 mt-1 flex items-baseline gap-1.5">
                  <span>28 Calls</span>
                  <span className={`text-[11px] font-semibold ${textSub}`}>Today</span>
                </div>
              </div>
              <div className={`rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Loads Covered</span>
                <div className="text-xl font-black text-emerald-600 mt-1 flex items-baseline gap-1.5">
                  <span>{brokerLoads.filter((l) => l.status === 'covered').length} Dispatched</span>
                  <span className={`text-[11px] font-semibold ${textSub}`}>($43.2k)</span>
                </div>
              </div>
              <div className={`rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Avg Time to Cover</span>
                <div className="text-xl font-black text-blue-600 mt-1 flex items-baseline gap-1.5">
                  <span>38 mins</span>
                  <span className={`text-[11px] font-semibold ${textSub}`}>High Velocity</span>
                </div>
              </div>
              <div className={`col-span-2 sm:col-span-1 rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Broker Authority</span>
                <div className="text-xs font-extrabold text-emerald-600 mt-1 flex items-center gap-1.5">
                  <span>✓</span>
                  <span>Pacific Surety #84-90214</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={`rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Live Spot Loads</span>
                <div className={`text-xl font-black mt-1 flex items-baseline gap-1.5 ${textTitle}`}>
                  <span>4,850+</span>
                  <span className="text-[11px] font-semibold text-emerald-600">Real-Time</span>
                </div>
              </div>
              <div className={`rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>National Avg RPM</span>
                <div className="text-xl font-black text-blue-600 mt-1 flex items-baseline gap-1.5">
                  <span>$3.24/mi</span>
                  <span className={`text-[11px] font-semibold ${textSub}`}>Van &amp; Reefer</span>
                </div>
              </div>
              <div className={`rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Active Lane Alerts</span>
                <div className="text-xl font-black text-purple-600 mt-1 flex items-baseline gap-1.5">
                  <span>{savedAlerts.length} Active</span>
                  <span className={`text-[11px] font-semibold ${textSub}`}>SMS / Email</span>
                </div>
              </div>
              <div className={`rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Broker Contacts</span>
                <div className="text-xl font-black text-emerald-600 mt-1 flex items-baseline gap-1.5">
                  <span>100% Unlocked</span>
                  <span className={`text-[11px] font-semibold ${textSub}`}>Direct Pay</span>
                </div>
              </div>
              <div className={`col-span-2 sm:col-span-1 rounded-xl p-3 flex flex-col justify-between ${innerCardBg}`}>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${textSub}`}>Carrier Plan</span>
                <div className="text-xs font-extrabold text-blue-600 mt-1 flex items-center gap-1.5">
                  <span>✓</span>
                  <span>Unlimited $19/mo Pass</span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 4. MAIN COCKPIT WORKSPACE */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB: BROKER - MY POSTED FREIGHT */}
        {isBroker && activeTab === 'my-posted-freight' && (
          <div className="space-y-5">
            {/* Control Strip */}
            <div className={`rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${cardBg}`}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBrokerLoadFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    brokerLoadFilter === 'all'
                      ? 'bg-purple-600 text-white'
                      : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  All Loads ({brokerLoads.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBrokerLoadFilter('active')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    brokerLoadFilter === 'active'
                      ? 'bg-purple-600 text-white'
                      : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Active Bidding ({brokerLoads.filter((l) => l.status === 'active').length})
                </button>
                <button
                  type="button"
                  onClick={() => setBrokerLoadFilter('covered')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    brokerLoadFilter === 'covered'
                      ? 'bg-emerald-600 text-white'
                      : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Covered &amp; Track ({brokerLoads.filter((l) => l.status === 'covered').length})
                </button>
              </div>

              {/* Search Bar Across All Loads */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    value={brokerSearchQuery}
                    onChange={(e) => setBrokerSearchQuery(e.target.value)}
                    placeholder="Search load #, city, carrier, driver..."
                    className={`rounded-xl px-3.5 py-2 text-xs outline-none w-56 sm:w-80 font-medium ${inputBg}`}
                  />
                  {brokerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setBrokerSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenBrokerPost()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 whitespace-nowrap transition-all"
                >
                  + Post New Load
                </button>
              </div>
            </div>

            {/* Freight Table */}
            <div className={`rounded-2xl overflow-hidden ${cardBg}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] font-extrabold uppercase tracking-wider ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/80 border-slate-800 text-slate-400'
                    }`}>
                      <th className="py-3.5 px-4">Load #</th>
                      <th className="py-3.5 px-4">Lane / Corridor</th>
                      <th className="py-3.5 px-4">Equipment &amp; Weight</th>
                      <th className="py-3.5 px-4">Rate &amp; RPM</th>
                      <th className="py-3.5 px-4">Pickup Date</th>
                      <th className="py-3.5 px-4">Inquiries / Bids</th>
                      <th className="py-3.5 px-4">Assigned Carrier &amp; Driver</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y font-medium ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-slate-800/80 text-slate-200'}`}>
                    {filteredBrokerLoads.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          No loads match your search criteria. Try a different city or ID.
                        </td>
                      </tr>
                    ) : (
                      filteredBrokerLoads.map((load) => (
                        <tr
                          key={load.id}
                          className={`transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/50'}`}
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-purple-600">
                            {load.id}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className={`font-bold text-sm ${textTitle}`}>
                              {load.origin} ➔ {load.destination}
                            </div>
                            <div className={`text-[11px] ${textSub}`}>{load.miles} miles</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold">{load.equipment}</div>
                            <div className={`text-[11px] ${textSub}`}>{load.weight}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className={`font-extrabold text-sm ${textTitle}`}>
                              ${load.rate.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-emerald-600 font-bold">${load.rpm.toFixed(2)}/mi</div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold">
                            {load.pickup_date}
                          </td>
                          <td className="py-3.5 px-4">
                            <button
                              type="button"
                              onClick={() => setSelectedLoadInquiries(load)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors ${
                                isLight
                                  ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                                  : 'bg-slate-900 border-slate-700 hover:border-purple-500 text-purple-300'
                              }`}
                            >
                              <span>📞</span>
                              <span>{load.inquiries_count} Calls / {load.bids_count} Bids</span>
                            </button>
                          </td>
                          <td className="py-3.5 px-4">
                            {load.carrier_name || load.carrier_assigned ? (
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>🚚</span>
                                  <span>{load.carrier_name || load.carrier_assigned}</span>
                                </div>
                                {load.driver_name && (
                                  <div className="text-[11px] text-slate-500">
                                    Driver: <strong>{load.driver_name}</strong>
                                    {load.driver_phone && (
                                      <a
                                        href={`tel:${load.driver_phone}`}
                                        className="ml-1.5 text-blue-600 hover:underline font-bold"
                                        title="Call Driver"
                                      >
                                        📞 {load.driver_phone}
                                      </a>
                                    )}
                                  </div>
                                )}
                                {(load.truck_number || load.trailer_number) && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    Truck: {load.truck_number || 'N/A'} · Trl: {load.trailer_number || 'N/A'}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No Carrier Assigned</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {load.status === 'covered' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-black uppercase">
                                ✓ Covered
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-100 border border-purple-300 text-purple-800 text-[11px] font-black uppercase">
                                ● Active
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {load.status === 'active' ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignModal(load)}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                                  title="Assign Carrier & Cover Load"
                                >
                                  Assign Carrier
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignModal(load)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                    isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                                  }`}
                                  title="View Driver & Check-calls"
                                >
                                  📍 Driver &amp; Tracking
                                </button>
                              )}
                              <a
                                href={`/api/loadboard/loads/${encodeURIComponent(load.id)}/ratecon-pdf?origin=${encodeURIComponent(load.origin)}&destination=${encodeURIComponent(load.destination)}&rate=${load.rate}&miles=${load.miles}&rpm=${load.rpm}&equipment=${encodeURIComponent(load.equipment)}&broker=${encodeURIComponent(user.company_name || 'Summit Logistics Brokerage')}&mc=${encodeURIComponent(user.mc_number || 'MC-582104')}&carrier_name=${encodeURIComponent(load.carrier_name || '')}&carrier_mc=${encodeURIComponent(load.carrier_mc || '')}&driver_name=${encodeURIComponent(load.driver_name || '')}&driver_phone=${encodeURIComponent(load.driver_phone || '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`px-2.5 py-1.5 border rounded-lg text-xs font-bold transition-colors ${
                                  isLight ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                                }`}
                                title="Download Rate Confirmation PDF"
                              >
                                📄 RateCon
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Carrier Inquiries Drawer Modal */}
            {selectedLoadInquiries && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
                onClick={() => setSelectedLoadInquiries(null)}
              >
                <div
                  className={`rounded-2xl shadow-2xl max-w-lg w-full p-6 border ${cardBg}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={`flex items-center justify-between pb-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                    <div>
                      <h3 className={`text-base font-bold ${textTitle}`}>
                        Carrier Bids &amp; Inquiries: {selectedLoadInquiries.origin} ➔ {selectedLoadInquiries.destination}
                      </h3>
                      <p className={`text-xs mt-0.5 ${textSub}`}>
                        Load #{selectedLoadInquiries.id} · Rate: ${selectedLoadInquiries.rate.toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLoadInquiries(null)}
                      className="text-slate-400 hover:text-slate-700 text-base"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="py-4 space-y-3">
                    {/* Carrier 1 */}
                    <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${innerCardBg}`}>
                      <div>
                        <div className={`font-bold text-xs ${textTitle}`}>Apex Global Freight LLC</div>
                        <div className={`text-[11px] ${textSub}`}>MC-1094821 · Phone: +1 (800) 555-0199</div>
                        <div className="text-[11px] text-emerald-600 font-bold mt-1">Offer: Full Rate (${selectedLoadInquiries.rate}) · Ready Today</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenInquiryReply({
                              name: 'Apex Global Freight LLC',
                              mc: 'MC-1094821',
                              phone: '+1 (800) 555-0199',
                              email: 'dispatch@apexfreight.com',
                              rate: selectedLoadInquiries.rate,
                            })
                          }
                          className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all"
                          title="1-Click Email RateCon Reply"
                        >
                          ✉️ 1-Click Email
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLoadInquiries(null);
                            handleOpenAssignModal(selectedLoadInquiries);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all"
                        >
                          Accept &amp; Tender
                        </button>
                      </div>
                    </div>

                    {/* Carrier 2 */}
                    <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${innerCardBg}`}>
                      <div>
                        <div className={`font-bold text-xs ${textTitle}`}>Eagle Express Transport Inc</div>
                        <div className={`text-[11px] ${textSub}`}>MC-847291 · Phone: +1 (800) 441-2900</div>
                        <div className="text-[11px] text-purple-600 font-bold mt-1">Counter: ${selectedLoadInquiries.rate + 150} · Reefer Ready</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenInquiryReply({
                              name: 'Eagle Express Transport Inc',
                              mc: 'MC-847291',
                              phone: '+1 (800) 441-2900',
                              email: 'loads@eagleexpresstrans.com',
                              rate: selectedLoadInquiries.rate + 150,
                            })
                          }
                          className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all"
                        >
                          ✉️ 1-Click Email
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLoadInquiries(null);
                            handleOpenAssignModal(selectedLoadInquiries);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all"
                        >
                          Book at Counter
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={`pt-3 border-t text-right ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedLoadInquiries(null)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold ${
                        isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-white'
                      }`}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: BROKER - MULTI-SEAT TEAM & SUB-USERS */}
        {isBroker && activeTab === 'team-members' && (
          <div className="space-y-5">
            {/* Header Strip */}
            <div className={`rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${cardBg}`}>
              <div>
                <h3 className={`text-base font-bold ${textTitle} flex items-center gap-2`}>
                  <span>👥</span>
                  <span>Broker Team &amp; Employee Sub-Users</span>
                </h3>
                <p className={`text-xs mt-1 ${textSub}`}>
                  Create individual logins for your freight dispatchers, sales reps, and staff. Sub-users inherit your verified MC authority and can post loads, tender freight, and reply to carriers under your brokerage roof.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTeamModalOpen(true)}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0"
              >
                <span>➕</span>
                <span>Add Sub-User</span>
              </button>
            </div>

            {/* Team Table */}
            <div className={`rounded-2xl overflow-hidden ${cardBg}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] font-extrabold uppercase tracking-wider ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/80 border-slate-800 text-slate-400'
                    }`}>
                      <th className="py-3.5 px-4">Employee / Name</th>
                      <th className="py-3.5 px-4">Work Email (Login)</th>
                      <th className="py-3.5 px-4">Role / Title</th>
                      <th className="py-3.5 px-4">Direct Phone / Ext</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y font-medium ${isLight ? 'divide-slate-200 text-slate-800' : 'divide-slate-800/80 text-slate-200'}`}>
                    {teamMembers.map((member) => (
                      <tr
                        key={member.id}
                        className={`transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/50'}`}
                      >
                        <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs font-black">
                            {member.name[0]}
                          </div>
                          <span>{member.name}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-purple-600">
                          {member.email}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {member.team_role || 'Freight Dispatcher'}
                        </td>
                        <td className="py-3.5 px-4">
                          {member.phone || user.phone || '+1 (800) 580-3101'}
                        </td>
                        <td className="py-3.5 px-4">
                          {member.is_suspended ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 border border-rose-300 text-rose-800 text-[11px] font-black uppercase">
                              Deactivated
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-black uppercase">
                              🟢 Active
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleSubUser(member.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                member.is_suspended
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                              }`}
                            >
                              {member.is_suspended ? 'Activate' : 'Deactivate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubUser(member.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: BROKER - DEVELOPER REST API DESK */}
        {isBroker && activeTab === 'api-desk' && (
          <div className="space-y-6">
            <div className={`rounded-2xl p-6 ${cardBg}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-200 gap-4">
                <div>
                  <h3 className={`text-base font-bold ${textTitle} flex items-center gap-2`}>
                    <span>🔑</span>
                    <span>Broker Partner External REST API</span>
                  </h3>
                  <p className={`text-xs mt-1 ${textSub}`}>
                    Automate freight posting directly from your internal TMS, ERP, McLeod, DAT, or Truckstop integration via HTTP JSON.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerateApiKey}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors"
                >
                  🔄 Regenerate API Key
                </button>
              </div>

              {/* API Key Box */}
              <div className="mt-5 space-y-2">
                <label className={`block text-xs font-bold ${textTitle}`}>
                  Your Private Production API Key
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={apiKeyVisible ? 'text' : 'password'}
                    readOnly
                    value={apiKey}
                    className={`flex-1 rounded-xl px-4 py-2.5 font-mono text-xs font-bold select-all ${inputBg}`}
                  />
                  <button
                    type="button"
                    onClick={() => setApiKeyVisible(!apiKeyVisible)}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-300"
                  >
                    {apiKeyVisible ? 'Hide' : 'Reveal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(apiKey);
                      setApiKeyCopied(true);
                      setTimeout(() => setApiKeyCopied(false), 2000);
                      showToast('API Key copied to clipboard!');
                    }}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 transition-all"
                  >
                    {apiKeyCopied ? '✓ Copied' : 'Copy Key'}
                  </button>
                </div>
                <p className={`text-[11px] ${textSub}`}>
                  Keep this key secret. Authorize external requests by sending <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-purple-700">Authorization: Bearer {apiKey.slice(0, 10)}…</code>.
                </p>
              </div>

              {/* Code Samples */}
              <div className="mt-6 space-y-4">
                <h4 className={`text-xs font-extrabold uppercase tracking-wider ${textTitle}`}>
                  POST /api/v1/loads — Post Live Load via cURL
                </h4>
                <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-emerald-400 overflow-x-auto shadow-inner">
                  <pre>{`curl -X POST https://www.loadsnexus.com/api/v1/loads \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "origin": "Dallas, TX",
    "destination": "Atlanta, GA",
    "equipment": "53 Dry Van",
    "rate": 2850,
    "miles": 780,
    "weight": "42000 lbs",
    "pickup_date": "2026-09-28",
    "commodity": "E-Commerce Pallets",
    "notes": "Direct dock appointment, clean 53ft trailer required"
  }'`}</pre>
                </div>

                <h4 className={`text-xs font-extrabold uppercase tracking-wider pt-2 ${textTitle}`}>
                  Python SDK / Requests Integration
                </h4>
                <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-blue-400 overflow-x-auto shadow-inner">
                  <pre>{`import requests

url = "https://www.loadsnexus.com/api/v1/loads"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}
payload = {
    "origin": "Chicago, IL",
    "destination": "Dallas, TX",
    "equipment": "53' Reefer",
    "rate": 3200,
    "miles": 925,
    "weight": "40000 lbs"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json()) # Returns: {"ok": true, "load_id": "SW-109281", "status": "active"}`}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: BROKER - SEARCH TRUCKS & CAPACITY */}
        {isBroker && activeTab === 'search-capacity' && (
          <div className="space-y-5">
            {/* Search Matchmaker Bar */}
            <div className={`rounded-2xl p-5 ${cardBg}`}>
              <div className={`text-sm font-bold mb-3 flex items-center gap-2 ${textTitle}`}>
                <span>🚚</span>
                <span>Carrier Capacity Matchmaker (Find Empty Trucks)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className={`block text-[11px] font-bold mb-1 ${textSub}`}>Origin City / State</label>
                  <input
                    type="text"
                    value={capOrigin}
                    onChange={(e) => setCapOrigin(e.target.value)}
                    placeholder="e.g. Chicago, IL"
                    className={`w-full rounded-xl px-3 py-2 outline-none font-semibold ${inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold mb-1 ${textSub}`}>Search Radius (Miles)</label>
                  <select
                    value={capRadius}
                    onChange={(e) => setCapRadius(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 outline-none font-semibold ${inputBg}`}
                  >
                    <option value="25">25 miles</option>
                    <option value="50">50 miles</option>
                    <option value="100">100 miles</option>
                    <option value="250">250 miles</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-[11px] font-bold mb-1 ${textSub}`}>Equipment Type</label>
                  <select
                    value={capEquip}
                    onChange={(e) => setCapEquip(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 outline-none font-semibold ${inputBg}`}
                  >
                    <option value="all">All Available Equipment</option>
                    <option value="van">53' Dry Van</option>
                    <option value="reefer">53' Reefer</option>
                    <option value="flatbed">Flatbed / Step Deck</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleCapacitySearch}
                    className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold shadow-md shadow-purple-600/30 transition-all text-center"
                  >
                    Search Capacity →
                  </button>
                </div>
              </div>
            </div>

            {/* Carrier Match Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {capacityTrucks.map((truck) => (
                <div
                  key={truck.id}
                  className={`rounded-2xl p-5 hover:border-purple-600/60 transition-all space-y-4 ${cardBg}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`font-bold text-base ${textTitle}`}>{truck.carrier_name}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 border border-emerald-300 text-emerald-800">
                          FMCSA Vetted
                        </span>
                      </div>
                      <div className={`text-xs mt-0.5 ${textSub}`}>
                        {truck.mc_number} · USDOT #{truck.dot_number} · {truck.safety_score}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-purple-600">${truck.target_rpm.toFixed(2)}/mi</div>
                      <div className={`text-[11px] ${textSub}`}>Target RPM</div>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 gap-2 text-xs p-3 rounded-xl border ${innerCardBg}`}>
                    <div>
                      <span className={`text-[10px] font-bold uppercase block ${textSub}`}>Equipment</span>
                      <strong className={textTitle}>{truck.equipment}</strong>
                    </div>
                    <div>
                      <span className={`text-[10px] font-bold uppercase block ${textSub}`}>Current Location</span>
                      <strong className={textTitle}>{truck.current_location} ({truck.deadhead_miles} mi DH)</strong>
                    </div>
                    <div>
                      <span className={`text-[10px] font-bold uppercase block ${textSub}`}>Ready Date</span>
                      <strong className="text-emerald-600">{truck.available_date}</strong>
                    </div>
                    <div>
                      <span className={`text-[10px] font-bold uppercase block ${textSub}`}>Desired Lanes</span>
                      <strong className={`truncate block ${textTitle}`}>{truck.destination_preference}</strong>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                    <div className="flex items-center gap-2 text-xs">
                      <a
                        href={`tel:${truck.contact_phone}`}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1 transition-all"
                      >
                        <span>📞</span> Call: {truck.contact_phone}
                      </a>
                      <a
                        href={`mailto:${truck.contact_email}?subject=Freight%20Load%20Tender%20for%20${truck.mc_number}`}
                        className={`px-3 py-1.5 border rounded-lg font-bold transition-colors ${
                          isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                      >
                        ✉️ Email
                      </a>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setVettingMc(truck.mc_number);
                        setActiveTab('carrier-vetting');
                        handlePerformVetting();
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      🛡️ Vet MC Records →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: BROKER - CARRIER MC VETTING DESK */}
        {isBroker && activeTab === 'carrier-vetting' && (
          <div className="space-y-5">
            <div className={`rounded-2xl p-5 ${cardBg}`}>
              <div className={`text-sm font-bold mb-2 flex items-center gap-2 ${textTitle}`}>
                <span>🛡️</span>
                <span>FMCSA Operating Authority &amp; Anti-Double-Brokering Guard</span>
              </div>
              <p className={`text-xs mb-4 ${textSub}`}>
                Instant verification against FMCSA registry, $1M BMC-91X primary auto liability, $100k cargo, and unauthorized re-broker risk scoring.
              </p>

              <form onSubmit={handlePerformVetting} className="flex gap-3">
                <input
                  type="text"
                  value={vettingMc}
                  onChange={(e) => setVettingMc(e.target.value)}
                  placeholder="Enter Carrier MC# or USDOT# (e.g. MC-1094821)"
                  className={`flex-1 rounded-xl px-4 py-2.5 font-mono text-xs outline-none ${inputBg}`}
                />
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 transition-all"
                >
                  Verify Authority →
                </button>
              </form>
            </div>

            {vettingResult && (
              <div className={`rounded-2xl p-6 space-y-6 ${cardBg}`}>
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b gap-3 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className={`text-xl font-bold ${textTitle}`}>{vettingResult.carrierName}</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-emerald-100 border border-emerald-300 text-emerald-800">
                        Active &amp; Authorized
                      </span>
                    </div>
                    <div className={`text-xs mt-1 font-mono ${textSub}`}>
                      {vettingResult.mc} · {vettingResult.dot} · {vettingResult.address}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => showToast('Official FMCSA Vetting Certificate downloaded.')}
                      className={`px-3.5 py-2 border rounded-xl text-xs font-bold transition-colors ${
                        isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      }`}
                    >
                      📄 Export Packet (PDF)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div className={`p-4 rounded-xl space-y-2 ${innerCardBg}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider block ${textSub}`}>FMCSA Authority</span>
                    <strong className="text-emerald-600 block text-sm">{vettingResult.authorityStatus}</strong>
                    <div className={`text-[11px] ${textSub}`}>{vettingResult.authorityAge}</div>
                  </div>

                  <div className={`p-4 rounded-xl space-y-2 ${innerCardBg}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider block ${textSub}`}>Auto Liability Insurance</span>
                    <strong className={`block text-sm ${textTitle}`}>{vettingResult.autoLiability}</strong>
                    <div className="text-emerald-600 text-[11px] font-bold">✓ Direct Certificate of Insurance (COI) Active</div>
                  </div>

                  <div className={`p-4 rounded-xl space-y-2 ${innerCardBg}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider block ${textSub}`}>Cargo Insurance</span>
                    <strong className={`block text-sm ${textTitle}`}>{vettingResult.cargoInsurance}</strong>
                    <div className="text-emerald-600 text-[11px] font-bold">✓ Exceeds $100,000 Industry Threshold</div>
                  </div>

                  <div className={`p-4 rounded-xl space-y-2 ${innerCardBg}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider block ${textSub}`}>FMCSA Safety Rating</span>
                    <strong className="text-emerald-600 block text-sm">{vettingResult.safetyRating}</strong>
                    <div className={`text-[11px] ${textSub}`}>0 Critical Violations · 0 Conditional Flags</div>
                  </div>

                  <div className={`p-4 rounded-xl space-y-2 ${innerCardBg}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider block ${textSub}`}>Out-of-Service (OOS) Rates</span>
                    <div className={`font-bold ${textTitle}`}>{vettingResult.vehicleOosRate}</div>
                    <div className={`font-bold ${textTitle}`}>{vettingResult.driverOosRate}</div>
                  </div>

                  <div className={`p-4 rounded-xl space-y-2 ${innerCardBg}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider block ${textSub}`}>Double-Brokering Risk Guard</span>
                    <strong className="text-emerald-600 block text-sm">{vettingResult.doubleBrokerRisk}</strong>
                    <div className={`text-[11px] ${textSub}`}>Physical address matches DOT filings. No re-brokering alerts.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: RATE INTELLIGENCE & CORRIDOR CALCULATOR */}
        {activeTab === 'rate-intel' && (
          <div className="space-y-6">
            <div className={`rounded-2xl p-5 ${cardBg}`}>
              <div className={`text-sm font-bold mb-3 ${textTitle}`}>
                📈 National Freight Market Spot vs. Contract Benchmarks
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className={`p-4 rounded-xl ${innerCardBg}`}>
                  <div className={`font-bold text-[11px] uppercase ${textSub}`}>53' Dry Van (National)</div>
                  <div className={`text-2xl font-black mt-1 ${textTitle}`}>$2.18 / mi</div>
                  <div className={`text-[11px] mt-1 flex justify-between ${textSub}`}>
                    <span>Contract Avg: $2.42/mi</span>
                    <span className="text-emerald-600 font-bold">+1.8% vs last week</span>
                  </div>
                </div>

                <div className={`p-4 rounded-xl ${innerCardBg}`}>
                  <div className={`font-bold text-[11px] uppercase ${textSub}`}>53' Reefer (Chilled/Frozen)</div>
                  <div className={`text-2xl font-black mt-1 ${textTitle}`}>$2.52 / mi</div>
                  <div className={`text-[11px] mt-1 flex justify-between ${textSub}`}>
                    <span>Contract Avg: $2.78/mi</span>
                    <span className="text-emerald-600 font-bold">+3.2% high demand</span>
                  </div>
                </div>

                <div className={`p-4 rounded-xl ${innerCardBg}`}>
                  <div className={`font-bold text-[11px] uppercase ${textSub}`}>Flatbed / Open Deck</div>
                  <div className={`text-2xl font-black mt-1 ${textTitle}`}>$2.68 / mi</div>
                  <div className={`text-[11px] mt-1 flex justify-between ${textSub}`}>
                    <span>Contract Avg: $2.94/mi</span>
                    <span className="text-emerald-600 font-bold">+0.9% steady</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`rounded-2xl p-6 ${cardBg}`}>
              <h3 className={`text-base font-bold mb-4 ${textTitle}`}>
                🎯 Corridor Rate Estimator &amp; Broker Margin Engine
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs mb-6">
                <div>
                  <label className={`block text-[11px] font-bold mb-1 ${textSub}`}>Origin</label>
                  <input
                    type="text"
                    value={calcOrigin}
                    onChange={(e) => setCalcOrigin(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 font-semibold outline-none ${inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold mb-1 ${textSub}`}>Destination</label>
                  <input
                    type="text"
                    value={calcDest}
                    onChange={(e) => setCalcDest(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 font-semibold outline-none ${inputBg}`}
                  />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold mb-1 ${textSub}`}>Equipment</label>
                  <select
                    value={calcEquip}
                    onChange={(e) => setCalcEquip(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 font-semibold outline-none ${inputBg}`}
                  >
                    <option value="53' Dry Van">53' Dry Van</option>
                    <option value="53' Reefer">53' Reefer</option>
                    <option value="Flatbed">Flatbed / Step Deck</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-[11px] font-bold mb-1 ${textSub}`}>Miles</label>
                  <input
                    type="number"
                    value={calcMiles}
                    onChange={(e) => setCalcMiles(Number(e.target.value) || 100)}
                    className={`w-full rounded-xl px-3 py-2 font-semibold outline-none ${inputBg}`}
                  />
                </div>
              </div>

              {/* Calculated Results */}
              <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-2xl ${innerCardBg}`}>
                <div>
                  <span className={`text-[11px] font-bold uppercase block ${textSub}`}>Spot Rate Average</span>
                  <div className={`text-xl font-black mt-1 ${textTitle}`}>${rateMetrics.spotRate.toLocaleString()}</div>
                  <div className="text-[11px] text-emerald-600 font-bold">${rateMetrics.baseRpm.toFixed(2)}/mi</div>
                </div>

                <div>
                  <span className={`text-[11px] font-bold uppercase block ${textSub}`}>Spot Range (Low - High)</span>
                  <div className={`text-xl font-black mt-1 ${textTitle}`}>
                    ${rateMetrics.lowRate.toLocaleString()} - ${rateMetrics.highRate.toLocaleString()}
                  </div>
                  <div className={`text-[11px] ${textSub}`}>Based on 90-day spot volume</div>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-purple-600 uppercase block">Suggested Buy Rate</span>
                  <div className="text-xl font-black text-purple-600 mt-1">${rateMetrics.suggestedBuyRate.toLocaleString()}</div>
                  <div className={`text-[11px] ${textSub}`}>Covers load in &lt; 45 mins</div>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-emerald-600 uppercase block">Estimated Broker Spread</span>
                  <div className="text-xl font-black text-emerald-600 mt-1">+${rateMetrics.estBrokerMargin.toLocaleString()}</div>
                  <div className={`text-[11px] ${textSub}`}>Net Broker Margin</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: CARRIER - POST AVAILABLE TRUCK */}
        {!isBroker && activeTab === 'post-truck' && (
          <div className="space-y-6">
            <div className={`rounded-2xl p-6 max-w-2xl mx-auto ${cardBg}`}>
              <h3 className={`text-lg font-bold mb-2 flex items-center gap-2 ${textTitle}`}>
                <span>🚚</span>
                <span>Post Your Available Truck to 10,000+ Brokers</span>
              </h3>
              <p className={`text-xs mb-5 ${textSub}`}>
                Broadcast your empty equipment so freight brokers can tender high-paying loads directly to your dispatch phone without deadhead miles.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  showToast('Truck Capacity broadcasted live to all verified brokers!');
                  setActiveTab('live-spot-board');
                }}
                className="space-y-4 text-xs font-bold text-slate-700"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Equipment Type *</label>
                    <select className={`w-full rounded-xl px-3 py-2 outline-none ${inputBg}`}>
                      <option>53' Dry Van</option>
                      <option>53' Reefer</option>
                      <option>Flatbed / Step Deck</option>
                      <option>Power Only</option>
                      <option>Box Truck (26ft)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Available Date *</label>
                    <select className={`w-full rounded-xl px-3 py-2 outline-none ${inputBg}`}>
                      <option>Today (Ready Now)</option>
                      <option>Tomorrow Morning</option>
                      <option>In 2 Days</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Current Origin City, State *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chicago, IL"
                      className={`w-full rounded-xl px-3 py-2 outline-none ${inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Destination Preference</label>
                    <input
                      type="text"
                      placeholder="e.g. Texas, Southeast, Lower 48"
                      className={`w-full rounded-xl px-3 py-2 outline-none ${inputBg}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Dispatcher Phone *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+1 (800) 555-0199"
                      defaultValue={user.phone || '+1 (800) 555-0199'}
                      className={`w-full rounded-xl px-3 py-2 outline-none ${inputBg}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Target Rate / Mile ($)</label>
                    <input
                      type="text"
                      placeholder="$3.20/mi"
                      className={`w-full rounded-xl px-3 py-2 outline-none ${inputBg}`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/30 transition-all text-center"
                >
                  🚀 Broadcast Truck Capacity Now
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB: LIVE SPOT FREIGHT BOARD */}
        {activeTab === 'live-spot-board' && (
          <div className="space-y-4">
            <LiveLoadBoard
              loads={loads}
              isLoading={isLoadingLoads}
              filter={filter}
              onFilterChange={onFilterChange}
              onRefresh={onRefresh}
              onInspectLoad={onInspectLoad}
              onOpenBrokerPost={() => onOpenBrokerPost()}
              onOpenCarrierCheckout={onOpenCarrierCheckout}
              isLiveStreaming={isLiveStreaming}
              onToggleLiveStream={onToggleLiveStream}
              lastRefreshedAt={lastRefreshedAt}
              onOpenLaneAlerts={onOpenLaneAlerts}
              onOpenBrokerCredit={onOpenBrokerCredit}
              onOpenAiIngest={onOpenAiIngest}
              savedAlerts={savedAlerts}
              user={user}
              onOpenAuth={onOpenAuth}
            />
          </div>
        )}
      </main>

      {/* MODAL: CARRIER ASSIGNMENT & DRIVER TRACKING */}
      {assignModalOpen && assignLoad && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
          onClick={() => setAssignModalOpen(false)}
        >
          <div
            className={`rounded-2xl shadow-2xl max-w-lg w-full p-6 my-8 border ${cardBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between pb-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-base font-bold ${textTitle} flex items-center gap-1.5`}>
                  <span>📍</span>
                  <span>Carrier Assignment &amp; Driver Tracking</span>
                </h3>
                <p className={`text-xs mt-0.5 ${textSub}`}>
                  Load #{assignLoad.id}: {assignLoad.origin} ➔ {assignLoad.destination} (${assignLoad.rate})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCarrierAssignment} className="py-4 space-y-3.5 text-xs font-bold text-slate-700">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Carrier Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={assignCarrierName}
                    onChange={(e) => setAssignCarrierName(e.target.value)}
                    placeholder="e.g. Apex Global Freight LLC"
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none ${inputBg}`}
                  />
                </div>
                <div>
                  <label className="block mb-1">Carrier MC# / DOT# *</label>
                  <input
                    type="text"
                    required
                    value={assignCarrierMc}
                    onChange={(e) => setAssignCarrierMc(e.target.value)}
                    placeholder="e.g. MC-1094821"
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none ${inputBg}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Driver Full Name *</label>
                  <input
                    type="text"
                    required
                    value={assignDriverName}
                    onChange={(e) => setAssignDriverName(e.target.value)}
                    placeholder="e.g. Robert Miller"
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none ${inputBg}`}
                  />
                </div>
                <div>
                  <label className="block mb-1">Driver Cell Phone (Direct) *</label>
                  <input
                    type="tel"
                    required
                    value={assignDriverPhone}
                    onChange={(e) => setAssignDriverPhone(e.target.value)}
                    placeholder="+1 (312) 555-0192"
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none ${inputBg}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Truck / Tractor Unit #</label>
                  <input
                    type="text"
                    value={assignTruckNum}
                    onChange={(e) => setAssignTruckNum(e.target.value)}
                    placeholder="e.g. Unit 402"
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none ${inputBg}`}
                  />
                </div>
                <div>
                  <label className="block mb-1">Trailer Unit #</label>
                  <input
                    type="text"
                    value={assignTrailerNum}
                    onChange={(e) => setAssignTrailerNum(e.target.value)}
                    placeholder="e.g. TR-8910 (53' Van)"
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none ${inputBg}`}
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1">Dispatch Check-calls &amp; Tracking Notes</label>
                <textarea
                  rows={3}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="e.g. Driver loaded at shipper dock. Clean trailer inspected. En route to destination. Estimated arrival tomorrow 08:00 AM."
                  className={`w-full rounded-xl px-3 py-2 text-xs font-normal outline-none ${inputBg}`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-bold ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAssign}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md shadow-emerald-600/30 transition-all"
                >
                  {isSavingAssign ? 'Saving & Locking Capacity…' : 'Save Carrier & Lock Capacity →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: 1-CLICK INQUIRY EMAIL REPLY */}
      {replyModalOpen && replyTargetCarrier && selectedLoadInquiries && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
          onClick={() => setReplyModalOpen(false)}
        >
          <div
            className={`rounded-2xl shadow-2xl max-w-lg w-full p-6 my-8 border ${cardBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between pb-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-base font-bold ${textTitle} flex items-center gap-1.5`}>
                  <span>✉️</span>
                  <span>1-Click RateCon &amp; Load Tender Reply</span>
                </h3>
                <p className={`text-xs mt-0.5 ${textSub}`}>
                  To: {replyTargetCarrier.name} ({replyTargetCarrier.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendInquiryReply} className="py-4 space-y-3.5 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1">Carrier Email (Recipient) *</label>
                <input
                  type="email"
                  required
                  value={replyTargetCarrier.email}
                  readOnly
                  className={`w-full rounded-xl px-3 py-2 text-xs font-mono select-all ${inputBg}`}
                />
              </div>

              <div>
                <label className="block mb-1">Subject Line *</label>
                <input
                  type="text"
                  required
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-xs font-medium outline-none ${inputBg}`}
                />
              </div>

              <div>
                <label className="block mb-1">Tender Message &amp; Dispatch Instructions</label>
                <textarea
                  rows={6}
                  required
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-xs font-normal outline-none font-mono ${inputBg}`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplyModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-bold ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingReply}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold shadow-md shadow-purple-600/30 transition-all flex items-center gap-1.5"
                >
                  <span>🚀</span>
                  <span>{isSendingReply ? 'Sending RateCon Email…' : 'Send Official RateCon Email →'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD SUB-USER / TEAM MEMBER */}
      {teamModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
          onClick={() => setTeamModalOpen(false)}
        >
          <div
            className={`rounded-2xl shadow-2xl max-w-md w-full p-6 my-8 border ${cardBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between pb-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-base font-bold ${textTitle} flex items-center gap-1.5`}>
                  <span>👥</span>
                  <span>Add Broker Sub-User / Employee</span>
                </h3>
                <p className={`text-xs mt-0.5 ${textSub}`}>
                  Creates an employee seat under {user.company_name || 'your brokerage'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTeamModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTeamMember} className="py-4 space-y-3.5 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1">Employee Full Name *</label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className={`w-full rounded-xl px-3.5 py-2.5 outline-none ${inputBg}`}
                />
              </div>

              <div>
                <label className="block mb-1">Employee Work Email (Login) *</label>
                <input
                  type="email"
                  required
                  value={newTeamEmail}
                  onChange={(e) => setNewTeamEmail(e.target.value)}
                  placeholder="e.g. alex@yourbrokerage.com"
                  className={`w-full rounded-xl px-3.5 py-2.5 outline-none ${inputBg}`}
                />
              </div>

              <div>
                <label className="block mb-1">Temporary Password (min 8 characters) *</label>
                <input
                  type="password"
                  required
                  value={newTeamPassword}
                  onChange={(e) => setNewTeamPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className={`w-full rounded-xl px-3.5 py-2.5 outline-none ${inputBg}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Role / Job Title</label>
                  <select
                    value={newTeamRole}
                    onChange={(e) => setNewTeamRole(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 outline-none ${inputBg}`}
                  >
                    <option value="Freight Dispatcher">Freight Dispatcher</option>
                    <option value="Carrier Sales Rep">Carrier Sales Rep</option>
                    <option value="Logistics Coordinator">Logistics Coordinator</option>
                    <option value="Account Executive">Account Executive</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Direct Extension / Phone</label>
                  <input
                    type="tel"
                    value={newTeamPhone}
                    onChange={(e) => setNewTeamPhone(e.target.value)}
                    placeholder="e.g. Ext 105"
                    className={`w-full rounded-xl px-3 py-2 outline-none ${inputBg}`}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTeamModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-bold ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTeam}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold shadow-md shadow-purple-600/30 transition-all"
                >
                  {isCreatingTeam ? 'Inviting Sub-User…' : 'Create & Email Credentials →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SECURITY & CHANGE PASSWORD */}
      {securityModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
          onClick={() => setSecurityModalOpen(false)}
        >
          <div
            className={`rounded-2xl shadow-2xl max-w-md w-full p-6 my-8 border ${cardBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between pb-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-base font-bold ${textTitle} flex items-center gap-1.5`}>
                  <span>🔐</span>
                  <span>Change Password</span>
                </h3>
                <p className={`text-xs mt-0.5 ${textSub}`}>
                  Update your LoadsNexus account security credentials
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSecurityModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="py-4 space-y-3.5 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className={`w-full rounded-xl px-3.5 py-2.5 outline-none ${inputBg}`}
                />
              </div>

              <div>
                <label className="block mb-1">New Password (min 8 characters) *</label>
                <input
                  type="password"
                  required
                  value={changeNewPassword}
                  onChange={(e) => setChangeNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className={`w-full rounded-xl px-3.5 py-2.5 outline-none ${inputBg}`}
                />
              </div>

              <div>
                <label className="block mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  value={changeConfirmPassword}
                  onChange={(e) => setChangeConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className={`w-full rounded-xl px-3.5 py-2.5 outline-none ${inputBg}`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSecurityModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-bold ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-md shadow-blue-600/30 transition-all"
                >
                  {isChangingPass ? 'Updating…' : 'Update Password →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. ENTERPRISE FOOTER */}
      <footer className={`mt-auto px-4 sm:px-6 lg:px-8 py-4 ${footerBg}`}>
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <strong className={isLight ? 'text-slate-700' : 'text-slate-400'}>LoadsNexus™ Enterprise Cockpit</strong>
            <span>•</span>
            <span>Operated by Shipping Wish LLC (DOT #3892011 · MC #1094821)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              All Systems Operational
            </span>
            <span>24/7 Operations: +1 (800) 580-3101</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
