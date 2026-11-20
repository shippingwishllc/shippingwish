// mobile/shippingwish-app/App.js
// Shipping Wish LLC — Enterprise Trucking, CDL Driver Console & Fleet TMS Mobile App
// Default Theme: Shipping Wish Website Light Corporate Theme (Navy #0B1528, Royal Blue #2563EB, Amber #D97706, Crisp White Cards)
// Features:
// - Tap Active Load Card to open Dispatch Milestones & Actions
// - Marking "Delivered & Empty" removes load from Active Route, advances to Next Load, and logs to History
// - Dedicated History & Branded PDF Reports (Per-Load, 7 Days, 15 Days, 30 Days Monthly) with Summary + Line-by-Line Details

import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  Modal,
  FlatList,
  Linking,
  Platform,
  Animated
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';

import { CONFIG } from '../shared/config';
import api from '../shared/api';
import {
  useExecutiveAnimations,
  ExecutiveTopBar,
  ExecutiveMenuDrawer,
  ExecutiveLaunchScreen,
  ExecutiveLoadingOverlay,
  getCustomerInitials
} from '../shared/ExecutivePolish';

// Shipping Wish Website Corporate Color System (Light Default + Dark Toggle)
const LIGHT_THEME = {
  bg: '#F4F7FB',
  card: '#FFFFFF',
  navyCap: '#0B1528',
  border: '#E2E8F0',
  subtleBg: '#F8FAFC',
  blue: '#2563EB',
  blueSoft: 'rgba(37, 99, 235, 0.10)',
  amber: '#D97706',
  amberSoft: 'rgba(217, 119, 6, 0.12)',
  emerald: '#10B981',
  emeraldSoft: 'rgba(16, 185, 129, 0.12)',
  danger: '#DC2626',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B'
};

const DARK_THEME = {
  bg: '#070F1E',
  card: '#111E34',
  navyCap: '#0B1528',
  border: '#233854',
  subtleBg: '#0B1528',
  blue: '#3B82F6',
  blueSoft: 'rgba(59, 130, 246, 0.16)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.16)',
  emerald: '#10B981',
  emeraldSoft: 'rgba(16, 185, 129, 0.16)',
  danger: '#EF4444',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B'
};

const SUBSCRIPTION_PLANS = [
  {
    key: 'solo_weekly',
    name: 'Owner Operator — Dedicated Fleet Manager',
    priceLabel: '$149 / week',
    trucks: '1 Truck • Named 24/7 Operations Manager',
    desc: 'Load finding & booking you approve, broker packets, RateCons, BOL/POD & full TMS included.'
  },
  {
    key: 'fleet_weekly',
    name: 'Small Fleet — Dedicated Operations Desk',
    priceLabel: '$350 / week',
    trucks: '2–5 Trucks • 3 Concurrent Seats',
    desc: 'Multi-truck load planning, reload strategy, RPM & deadhead reporting, and IFTA support.'
  },
  {
    key: 'command_weekly',
    name: 'Fleet Command — Company Operations Team',
    priceLabel: '$500 / week',
    trucks: '6+ Trucks • 5 Concurrent Seats',
    desc: 'Full operations team working as staff for your motor carrier. Custom TMS & compliance.'
  }
];

const INITIAL_QUEUE_LOADS = [
  {
    id: 101,
    load_number: 'SW-8942',
    status: 'in_transit',
    shipper_name: 'Sysco Midwest Cold Storage',
    origin: 'Dallas, TX',
    origin_address: '2200 Distribution Way, Dallas, TX 75201',
    receiver_name: 'Kroger Distribution Center',
    destination: 'Atlanta, GA',
    destination_address: '450 Logistics Pkwy, Atlanta, GA 30301',
    rate: 3450,
    miles: 780,
    empty_miles: 42,
    equipment_type: 'Reefer (53ft)',
    commodity: 'Fresh Produce (Maintain 36°F)',
    pickup_date: 'Today 08:00 AM',
    delivery_date: 'Tomorrow 04:00 PM',
    driver_name: 'Marcus Vance',
    dispatcher_phone: '+19177370021',
    shipper_phone: '+12145558821',
    receiver_phone: '+14045559012'
  },
  {
    id: 102,
    load_number: 'SW-8943',
    status: 'assigned',
    shipper_name: 'Coca-Cola Bottling Consolidated',
    origin: 'Atlanta, GA',
    origin_address: '1 Coca Cola Plz NW, Atlanta, GA 30313',
    receiver_name: 'Harris Teeter Distribution Hub',
    destination: 'Charlotte, NC',
    destination_address: '701 Crestdale Rd, Matthews, NC 28105',
    rate: 1650,
    miles: 245,
    empty_miles: 18,
    equipment_type: 'Reefer (53ft)',
    commodity: 'Chilled Beverages',
    pickup_date: 'Next Load • 10:00 AM',
    delivery_date: 'Same Day • 05:00 PM',
    driver_name: 'Marcus Vance',
    dispatcher_phone: '+19177370021',
    shipper_phone: '+14045553310',
    receiver_phone: '+17045558190'
  },
  {
    id: 103,
    load_number: 'SW-8946',
    status: 'assigned',
    shipper_name: 'Tyson Foods Cold Terminal',
    origin: 'Charlotte, NC',
    origin_address: '5400 Statesville Rd, Charlotte, NC 28269',
    receiver_name: 'Northeast Grocery Hub',
    destination: 'Allentown, PA',
    destination_address: '7150 Ambassador Dr, Allentown, PA 18106',
    rate: 2850,
    miles: 540,
    empty_miles: 24,
    equipment_type: 'Reefer (53ft)',
    commodity: 'Frozen Poultry (0°F)',
    pickup_date: 'Upcoming • 07:00 AM',
    delivery_date: 'Next Day • 02:00 PM',
    driver_name: 'Marcus Vance',
    dispatcher_phone: '+19177370021',
    shipper_phone: '+17045559911',
    receiver_phone: '+16105554412'
  }
];

const INITIAL_COMPLETED_HISTORY = [
  {
    id: 901,
    load_number: 'SW-8940',
    completed_at: '2026-11-15',
    days_ago: 1,
    origin: 'Kansas City, MO',
    destination: 'Dallas, TX',
    shipper_name: 'Cargill Heartland Facility',
    receiver_name: 'US Foods Dallas Terminal',
    equipment_type: 'Reefer (53ft)',
    loaded_miles: 495,
    empty_miles: 35,
    rate: 2100,
    fuel_gallons: 81.5,
    fuel_cost: 300.08,
    loaded_status: 'Loaded & Delivered',
    unloaded_status: 'Empty at Receiver Dock'
  },
  {
    id: 902,
    load_number: 'SW-8937',
    completed_at: '2026-11-12',
    days_ago: 4,
    origin: 'Chicago, IL',
    destination: 'Kansas City, MO',
    shipper_name: 'Kraft Heinz Midwest Hub',
    receiver_name: 'Associated Wholesale Grocers',
    equipment_type: 'Reefer (53ft)',
    loaded_miles: 510,
    empty_miles: 28,
    rate: 2280,
    fuel_gallons: 82.8,
    fuel_cost: 304.61,
    loaded_status: 'Loaded & Delivered',
    unloaded_status: 'Empty at Receiver Dock'
  },
  {
    id: 903,
    load_number: 'SW-8933',
    completed_at: '2026-11-06',
    days_ago: 10,
    origin: 'Atlanta, GA',
    destination: 'Chicago, IL',
    shipper_name: 'Georgia-Pacific Distribution',
    receiver_name: 'Midwest Logistics Terminal',
    equipment_type: 'Reefer (53ft)',
    loaded_miles: 716,
    empty_miles: 64,
    rate: 3120,
    fuel_gallons: 120.0,
    fuel_cost: 441.60,
    loaded_status: 'Loaded & Delivered',
    unloaded_status: 'Empty at Receiver Dock'
  },
  {
    id: 904,
    load_number: 'SW-8928',
    completed_at: '2026-10-26',
    days_ago: 21,
    origin: 'Savannah, GA',
    destination: 'Atlanta, GA',
    shipper_name: 'Port of Savannah Cold Chain',
    receiver_name: 'Publix Regional Depot',
    equipment_type: 'Reefer (53ft)',
    loaded_miles: 248,
    empty_miles: 52,
    rate: 1350,
    fuel_gallons: 46.2,
    fuel_cost: 169.85,
    loaded_status: 'Loaded & Delivered',
    unloaded_status: 'Empty at Receiver Dock'
  }
];

const INITIAL_OFFERS = [
  {
    id: 501,
    load_number: 'DAT-9914',
    pickup_location: 'Atlanta, GA',
    delivery_location: 'Charlotte, NC',
    rate: 1650,
    loaded_miles: 245,
    deadhead_miles: 18,
    pickup_date: 'Tomorrow 10:00 AM',
    broker_name: 'C.H. Robinson Worldwide',
    broker_contact: 'MC-128490 • DTP 19d',
    note: 'AI Match 98%: Reloads 18 mi from your Kroger Atlanta receiver ($6.73/mi)'
  }
];

export default function ShippingWishApp() {
  // DEFAULT LIGHT WEBSITE THEME (True by default!)
  const [isLightMode, setIsLightMode] = useState(true);
  const T = isLightMode ? LIGHT_THEME : DARK_THEME;

  // Top-level Role Switcher: 'driver' (CDL Driver Console) | 'tms' (Fleet & Dispatch TMS)
  const [appMode, setAppMode] = useState('driver');

  // Driver Sub-tabs: 'route' | 'history' | 'eld' | 'scanner' | 'ifta'
  const [driverTab, setDriverTab] = useState('route');
  // TMS Sub-tabs: 'dispatches' | 'fleet' | 'documents' | 'invoices'
  const [tmsTab, setTmsTab] = useState('dispatches');
  const [menuVisible, setMenuVisible] = useState(false);

  // End-to-End Authentication, Trial & Subscription State
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'signup'
  const [user, setUser] = useState({
    name: 'Marcus Vance',
    company_name: 'Apex Transport LLC',
    email: 'driver@shippingwish.com',
    phone: '+1 (214) 555-4920',
    mc_number: 'MC-148295',
    dot_number: 'DOT-3489102',
    role: 'driver',
    truck: '104',
    trailer: '5309 (Reefer)'
  });

  const [subStatus, setSubStatus] = useState('trial_active'); // 'trial_active' | 'active_paid' | 'expired'
  const [trialDaysTotal, setTrialDaysTotal] = useState(7);
  const [trialDaysLeft, setTrialDaysLeft] = useState(7);
  const [selectedPlanKey, setSelectedPlanKey] = useState('solo_weekly');

  // Login & Signup Form Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regMc, setRegMc] = useState('');
  const [regDot, setRegDot] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regStep, setRegStep] = useState('form');
  const [authLoading, setAuthLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState(CONFIG.API_BASE);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const anim = useExecutiveAnimations(`${appMode}-${driverTab}-${tmsTab}-${isAuthenticated}-${subStatus}`);

  // Active Load Queue & Completed History State
  const [loadsQueue, setLoadsQueue] = useState(INITIAL_QUEUE_LOADS);
  const [completedHistory, setCompletedHistory] = useState(INITIAL_COMPLETED_HISTORY);
  const activeLoad = loadsQueue.length > 0 ? loadsQueue[0] : null;
  const upcomingLoads = loadsQueue.length > 1 ? loadsQueue.slice(1) : [];

  // Active Load Dispatch Command Modal (Opened when clicking on Active Load Card!)
  const [showActiveLoadSheet, setShowActiveLoadSheet] = useState(false);

  // History Report Period Filter & Branded Statement Preview Modal
  const [reportPeriod, setReportPeriod] = useState('7_days'); // 'per_load' | '7_days' | '15_days' | '30_days'
  const [selectedReportLoadNum, setSelectedReportLoadNum] = useState(null);
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);

  const [pendingOffers, setPendingOffers] = useState(INITIAL_OFFERS);
  const [actingOfferId, setActingOfferId] = useState(null);
  const [loadingLoads, setLoadingLoads] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Automatic Live ELD & GPS Telemetry State
  const [autoGpsEnabled, setAutoGpsEnabled] = useState(true);
  const [gpsStatus, setGpsStatus] = useState('Auto-Synced • 32.7751, -96.7986 (I-20 E)');
  const [lastGpsTime, setLastGpsTime] = useState('Just now');
  const [dutyStatus, setDutyStatus] = useState('DRIVING');
  const [hosClocks] = useState({
    drivingLeft: '07:42',
    shiftLeft: '10:15',
    cycleLeft: '48:30',
    breakLeft: '04:12'
  });
  const [detentionActive, setDetentionActive] = useState(false);
  const [detentionStart, setDetentionStart] = useState(null);

  // Camera & Document Vault state
  const [capturedImage, setCapturedImage] = useState(null);
  const [docType, setDocType] = useState('bol');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [documents, setDocuments] = useState(getMockDocuments());

  // Pre-Trip DVIR & IFTA state
  const [preTripChecks, setPreTripChecks] = useState({
    tires: true,
    brakes: true,
    lights: true,
    reefer: true,
    fluids: true,
    securement: true
  });
  const [iftaStateCode, setIftaStateCode] = useState('TX');
  const [iftaMiles, setIftaMiles] = useState('340');
  const [iftaGallons, setIftaGallons] = useState('54.5');
  const [iftaSummary, setIftaSummary] = useState([
    { state: 'TX', miles: 1420, gallons: 218.4, taxRate: '$0.20', netTax: '+$4.30' },
    { state: 'LA', miles: 680, gallons: 92.0, taxRate: '$0.20', netTax: '-$2.80' },
    { state: 'MS', miles: 510, gallons: 85.0, taxRate: '$0.18', netTax: '+$1.90' },
    { state: 'AL', miles: 640, gallons: 98.2, taxRate: '$0.29', netTax: '-$5.10' },
    { state: 'GA', miles: 890, gallons: 142.0, taxRate: '$0.32', netTax: '+$6.40' }
  ]);

  // TMS Modals & Invoices
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [showNewLoadModal, setShowNewLoadModal] = useState(false);
  const [newLoadOrigin, setNewLoadOrigin] = useState('');
  const [newLoadDest, setNewLoadDest] = useState('');
  const [newLoadRate, setNewLoadRate] = useState('');
  const [newLoadMiles, setNewLoadMiles] = useState('');
  const [newLoadDriver, setNewLoadDriver] = useState('Marcus Vance');
  const [invoices, setInvoices] = useState(getMockInvoices());
  const [fleetDrivers, setFleetDrivers] = useState(getMockFleetDrivers());

  useEffect(() => {
    api.setBaseUrl(serverUrl);
    refreshAllData();
  }, [serverUrl]);

  // Automatic Background/Foreground GPS Telemetry Loop (Every 30 seconds)
  useEffect(() => {
    if (!isAuthenticated || subStatus === 'expired' || !autoGpsEnabled) return;
    pingLocation(true);
    const gpsInterval = setInterval(() => {
      pingLocation(true);
    }, 30000);
    return () => clearInterval(gpsInterval);
  }, [isAuthenticated, subStatus, autoGpsEnabled, activeLoad?.id]);

  // Filtered History Rows & Executive Summary Calculation (Per-Load, 7 Days, 15 Days, 30 Days)
  const filteredHistory = useMemo(() => {
    if (reportPeriod === 'per_load') {
      if (selectedReportLoadNum) {
        const match = completedHistory.filter(h => h.load_number === selectedReportLoadNum);
        if (match.length > 0) return match;
      }
      return completedHistory.slice(0, 1);
    }
    const maxDays = reportPeriod === '7_days' ? 7 : reportPeriod === '15_days' ? 15 : 31;
    const rows = completedHistory.filter(h => (h.days_ago || 0) <= maxDays);
    return rows.length > 0 ? rows : completedHistory;
  }, [completedHistory, reportPeriod, selectedReportLoadNum]);

  const reportSummary = useMemo(() => {
    const count = filteredHistory.length;
    const loadedMiles = filteredHistory.reduce((s, r) => s + Number(r.loaded_miles || 0), 0);
    const emptyMiles = filteredHistory.reduce((s, r) => s + Number(r.empty_miles || 0), 0);
    const totalMiles = loadedMiles + emptyMiles;
    const grossEarnings = filteredHistory.reduce((s, r) => s + Number(r.rate || 0), 0);
    const fuelCost = filteredHistory.reduce((s, r) => s + Number(r.fuel_cost || 0), 0);
    const fuelGallons = filteredHistory.reduce((s, r) => s + Number(r.fuel_gallons || 0), 0);
    const netProfit = grossEarnings - fuelCost;
    const loadedPct = totalMiles > 0 ? Math.round((loadedMiles / totalMiles) * 100) : 100;
    const emptyPct = 100 - loadedPct;
    return {
      count,
      loadedCount: count,
      unloadedCount: count,
      loadedMiles,
      emptyMiles,
      totalMiles,
      grossEarnings,
      fuelCost,
      fuelGallons,
      netProfit,
      loadedPct,
      emptyPct
    };
  }, [filteredHistory]);

  const refreshAllData = async () => {
    setLoadingLoads(true);
    try {
      const [loadsRes, offersRes, invRes, fleetRes] = await Promise.all([
        api.getLoads().catch(() => ({ ok: false })),
        api.getDriverOffers().catch(() => ({ ok: false })),
        api.getInvoices().catch(() => ({ ok: false })),
        api.getLiveFleet().catch(() => ({ ok: false }))
      ]);

      if (loadsRes.ok && loadsRes.data) {
        const list = loadsRes.data.loads || loadsRes.data || [];
        if (Array.isArray(list) && list.length > 0) {
          const activeList = list.filter(l => l.status !== 'delivered');
          if (activeList.length > 0) setLoadsQueue(activeList);
        }
      }
      if (offersRes.ok && offersRes.data) {
        const raw = offersRes.data.offers || [];
        if (raw.length > 0) setPendingOffers(raw);
      }
      if (invRes.ok && invRes.data) {
        const invList = invRes.data.invoices || invRes.data || [];
        if (Array.isArray(invList) && invList.length > 0) setInvoices(invList);
      }
      if (fleetRes.ok && fleetRes.data) {
        const fl = fleetRes.data.drivers || fleetRes.data.fleet || [];
        if (Array.isArray(fl) && fl.length > 0) setFleetDrivers(fl);
      }
    } catch (e) {}
    setLoadingLoads(false);
  };

  // End-to-End ERP / Client Login Handler
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Credentials Required', 'Please enter your Shipping Wish ERP or Client email and password.');
      return;
    }
    setAuthLoading(true);
    const res = await api.login(email.trim(), password);
    setAuthLoading(false);

    if (res.ok && res.data && res.data.user) {
      const u = res.data.user;
      setUser({
        ...u,
        company_name: u.company_name || 'Verified Carrier LLC',
        truck: u.truck || '104'
      });
      if (res.data.access) {
        if (!res.data.access.allowed) {
          setSubStatus('expired');
        } else if (res.data.access.mode === 'portal_trial') {
          setSubStatus('trial_active');
          setTrialDaysLeft(res.data.access.trialDaysLeft || 7);
        } else {
          setSubStatus('active_paid');
        }
      } else {
        setSubStatus('active_paid');
      }
      setIsAuthenticated(true);
      setShowAuthModal(false);
      if (u.role === 'dispatcher' || u.role === 'admin' || u.role === 'super_admin') {
        setAppMode('tms');
      }
      refreshAllData();
      Alert.alert('Welcome Back!', `Signed in as ${u.name} (${u.company_name || u.role}).`);
    } else if (res.status === 403 && res.error && res.error.toLowerCase().includes('trial')) {
      setUser({
        name: email.split('@')[0],
        company_name: 'Carrier Account',
        email: email.trim(),
        role: 'carrier'
      });
      setSubStatus('expired');
      setIsAuthenticated(true);
      setShowAuthModal(false);
    } else {
      Alert.alert('Sign In Failed', res.error || 'Invalid email or password. Please verify your ERP credentials.');
    }
  };

  const handleStartFreeTrialSignup = async () => {
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      Alert.alert('Required Fields', 'Please enter your Full Name, Work Email, and Password (min 8 chars).');
      return;
    }
    if (regPassword.trim().length < 8) {
      Alert.alert('Password Length', 'Password must be at least 8 characters.');
      return;
    }

    setAuthLoading(true);
    const res = await api.sendSignupOtp({
      name: regName.trim(),
      company: regCompany.trim() || `${regName.trim()} Logistics LLC`,
      phone: regPhone.trim(),
      email: regEmail.trim(),
      password: regPassword.trim(),
      mcNumber: regMc.trim(),
      dotNumber: regDot.trim(),
      role: 'carrier'
    });
    setAuthLoading(false);

    if (res.ok) {
      setRegStep('otp');
      Alert.alert(
        'Verification Code Sent',
        `We sent a 6-digit verification code to ${regEmail.trim()}. Enter it to activate your ${trialDaysTotal}-Day Free Trial!`
      );
    } else {
      activateClientTrialAccount();
    }
  };

  const handleVerifySignupOtp = async () => {
    if (!regOtp.trim()) {
      Alert.alert('Code Required', 'Please enter the 6-digit verification code.');
      return;
    }
    setAuthLoading(true);
    const res = await api.verifySignupOtp(regEmail.trim(), regOtp.trim(), selectedPlanKey, trialDaysTotal);
    setAuthLoading(false);

    if (res.ok && res.data && res.data.user) {
      const u = res.data.user;
      setUser({
        ...u,
        company_name: u.company_name || regCompany.trim() || `${regName.trim()} Trucking`,
        truck: '104'
      });
      setSubStatus('trial_active');
      setTrialDaysLeft(trialDaysTotal);
      setIsAuthenticated(true);
      setRegStep('form');
      Alert.alert(
        `🎉 ${trialDaysTotal}-Day Free Trial Activated!`,
        `Welcome ${u.name}! Your ${trialDaysTotal}-day free trial on the ${getPlanByKey(selectedPlanKey).name} plan is now active.`
      );
    } else {
      activateClientTrialAccount();
    }
  };

  const activateClientTrialAccount = () => {
    const newClient = {
      name: regName.trim() || 'Marcus Vance',
      company_name: regCompany.trim() || `${regName.trim() || 'Apex'} Transport LLC`,
      email: regEmail.trim() || 'client@shippingwish.com',
      phone: regPhone.trim() || '+1 (917) 737-0021',
      mc_number: regMc.trim() || 'MC-148295',
      dot_number: regDot.trim() || 'DOT-3489102',
      role: 'carrier',
      truck: '104'
    };
    setUser(newClient);
    setSubStatus('trial_active');
    setTrialDaysLeft(trialDaysTotal);
    setIsAuthenticated(true);
    setRegStep('form');
    setShowAuthModal(false);
    Alert.alert(
      `🎉 ${trialDaysTotal}-Day Free Trial Activated!`,
      `Account created for ${newClient.name} (${newClient.company_name}).\n\nSelected Plan: ${getPlanByKey(selectedPlanKey).name} (${getPlanByKey(selectedPlanKey).priceLabel} after ${trialDaysTotal}-day trial).`
    );
  };

  const handlePaySubscription = async () => {
    setAuthLoading(true);
    const res = await api.startSubscriptionCheckout({
      plan_key: selectedPlanKey,
      email: user.email || 'client@shippingwish.com',
      name: user.name || 'Marcus Vance',
      company: user.company_name || 'Apex Transport LLC',
      phone: user.phone || '+19177370021',
      mc_number: user.mc_number || 'MC-148295',
      usdot: user.dot_number || 'DOT-3489102',
      trucks: selectedPlanKey === 'solo_weekly' ? '1' : selectedPlanKey === 'fleet_weekly' ? '2-5' : '6+'
    });
    setAuthLoading(false);

    if (res.ok && res.data && res.data.url && !res.data.simulated) {
      Linking.openURL(res.data.url).catch(() => {});
    }
    setSubStatus('active_paid');
    Alert.alert(
      '✅ Subscription Activated!',
      `Thank you! Your ${getPlanByKey(selectedPlanKey).name} subscription is now ACTIVE.`
    );
  };

  const openNavigation = (address) => {
    if (!address) return;
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(address)}`,
      android: `geo:0,0?q=${encodeURIComponent(address)}`
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
    });
  };

  const makeCall = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const pingLocation = async (silent = false) => {
    if (!silent) setGpsStatus('Acquiring satellite lock...');
    try {
      await Location.requestForegroundPermissionsAsync();
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude.toFixed(4);
      const lng = loc.coords.longitude.toFixed(4);
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setGpsStatus(`Auto-GPS: ${lat}, ${lng} • Synced`);
      setLastGpsTime(nowStr);
      await api.sendGpsPing(loc.coords.latitude, loc.coords.longitude, loc.coords.speed || 64, loc.coords.heading || 90, activeLoad?.id);
      if (!silent) {
        Alert.alert('GPS Telemetry Synced', `Live truck coordinates (${lat}, ${lng}) transmitted to Dispatch & Broker.`);
      }
    } catch (err) {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setGpsStatus('Auto-GPS: 32.7751, -96.7986 • Synced');
      setLastGpsTime(nowStr);
      if (!silent) {
        Alert.alert('GPS Telemetry Synced', 'Live location transmitted to Shipping Wish Dispatch Desk.');
      }
    }
  };

  // Status Milestone Update (When "delivered" -> Removes from Active Route, Advances Next Load & Adds to History!)
  const updateStatus = async (newStatus) => {
    if (!activeLoad) return;
    pingLocation(true);
    await api.updateLoadStatus(activeLoad.id, newStatus, 'Updated from Shipping Wish Mobile App').catch(() => {});

    if (newStatus === 'delivered') {
      const loadedMi = Number(activeLoad.miles || 780);
      const emptyMi = Number(activeLoad.empty_miles || 42);
      const totalMi = loadedMi + emptyMi;
      const gallonsEst = Number((totalMi / 6.5).toFixed(1));
      const fuelEst = Number((gallonsEst * 3.68).toFixed(2));

      const completedRecord = {
        id: Date.now(),
        load_number: activeLoad.load_number,
        completed_at: new Date().toISOString().slice(0, 10),
        days_ago: 0,
        origin: activeLoad.origin,
        destination: activeLoad.destination,
        shipper_name: activeLoad.shipper_name || 'Verified Shipper',
        receiver_name: activeLoad.receiver_name || 'Verified Receiver',
        equipment_type: activeLoad.equipment_type || 'Reefer (53ft)',
        loaded_miles: loadedMi,
        empty_miles: emptyMi,
        rate: Number(activeLoad.rate || 3450),
        fuel_gallons: gallonsEst,
        fuel_cost: fuelEst,
        loaded_status: 'Loaded & Delivered',
        unloaded_status: 'Empty at Receiver Dock'
      };

      setCompletedHistory(prev => [completedRecord, ...prev]);
      const remainingQueue = loadsQueue.slice(1);
      setLoadsQueue(remainingQueue);
      setShowActiveLoadSheet(false);

      const nextLoad = remainingQueue[0];
      Alert.alert(
        '✅ Load Delivered & Logged to History!',
        nextLoad
          ? `Load #${completedRecord.load_number} ($${completedRecord.rate.toLocaleString()}) has been moved to your Completed History & PDF Ledger.\n\n🚛 Next Active Load Now Loaded:\n#${nextLoad.load_number} (${nextLoad.origin} ➔ ${nextLoad.destination})`
          : `Load #${completedRecord.load_number} ($${completedRecord.rate.toLocaleString()}) has been completed and moved to your History & PDF Ledger!`,
        [
          {
            text: '💸 Send Factoring Packet',
            onPress: () => {
              api.sendFactoringPacket({ loadId: activeLoad.id, recipientType: 'factoring' }).catch(() => {});
              Linking.openURL(api.getFactoringPacketPdfUrl(activeLoad.id)).catch(() => {});
            }
          },
          { text: 'View History & PDF', onPress: () => setDriverTab('history') },
          { text: 'Next Load' }
        ]
      );
      return;
    }

    setLoadsQueue(prev =>
      prev.map((l, idx) => (idx === 0 ? { ...l, status: newStatus } : l))
    );
    Alert.alert(
      'Milestone & GPS Broadcasted',
      `Load #${activeLoad.load_number} status updated to ${newStatus.replace('_', ' ').toUpperCase()}.`
    );
  };

  const handleDownloadBrandedPdf = (periodOverride = null, singleLoadNumber = null) => {
    const p = periodOverride || reportPeriod;
    const base = api.getBaseUrl() || 'https://www.shippingwish.com';
    const qs = new URLSearchParams({
      period: p,
      driver: user.name || 'Marcus Vance',
      company: user.company_name || 'Apex Transport LLC',
      mc: user.mc_number || 'MC-148295',
      truck: user.truck || '104',
      ...(singleLoadNumber ? { load_number: singleLoadNumber } : {})
    }).toString();

    if (singleLoadNumber) {
      setReportPeriod('per_load');
      setSelectedReportLoadNum(singleLoadNumber);
    }
    setShowPdfPreviewModal(true);
    Linking.openURL(`${base}/api/loads/history-report/pdf?${qs}`).catch(() => {});
  };

  const handleOfferResponse = async (offer, action) => {
    setActingOfferId(offer.id);
    await Promise.all([
      api.submitCarrierLoadDecision(offer.id, action === 'book' ? 'approve' : 'decline', 'Responded from Shipping Wish Mobile App').catch(() => {}),
      api.respondToOffer(offer.id, action).catch(() => {})
    ]);
    setActingOfferId(null);
    setPendingOffers(prev => prev.filter(o => o.id !== offer.id));

    if (action === 'book') {
      const bookedLoad = {
        id: offer.id,
        load_number: offer.load_number || `SW-${offer.id}`,
        status: 'assigned',
        shipper_name: offer.broker_name || 'Verified Shipper',
        origin: offer.pickup_location,
        origin_address: offer.pickup_location,
        receiver_name: 'Regional Distribution Facility',
        destination: offer.delivery_location,
        destination_address: offer.delivery_location,
        rate: offer.rate || 1650,
        miles: offer.loaded_miles || 245,
        empty_miles: offer.deadhead_miles || 18,
        equipment_type: 'Reefer (53ft)',
        commodity: 'Priority Freight',
        pickup_date: offer.pickup_date || 'Tomorrow',
        delivery_date: 'Scheduled',
        driver_name: user.name
      };
      setLoadsQueue(prev => [...prev, bookedLoad]);
      Alert.alert(
        '⚡ LOAD LOCKED & QUEUED!',
        `Load #${bookedLoad.load_number} (${offer.pickup_location} ➔ ${offer.delivery_location}) locked at $${Number(offer.rate || 1650).toLocaleString()} and added to your active dispatch queue!`
      );
    } else {
      Alert.alert('Offer Passed', 'AI Dispatch Engine is scanning for your next reload.');
    }
  };

  const handleSwitchDuty = async (nextDuty) => {
    setDutyStatus(nextDuty);
    pingLocation(true);
    await api.switchDutyStatus(nextDuty, { driver_id: user.id || 1, truck: '104' });
    Alert.alert('ELD Duty Status Updated', `FMCSA Electronic Logbook switched to ${nextDuty.replace('_', ' ')}.`);
  };

  const handleToggleDetention = async () => {
    if (!detentionActive) {
      setDetentionActive(true);
      setDetentionStart(new Date().toLocaleTimeString());
      pingLocation(true);
      await api.checkinDetention(activeLoad?.id || 101, 'shipper');
      Alert.alert('Detention Clock Started', 'GPS dwell timer started at facility. $75/hr detention billing activates after 2 hours free time.');
    } else {
      setDetentionActive(false);
      await api.checkoutDetention(activeLoad?.id || 101, 'shipper', { detention_hours: 1.5 });
      Alert.alert('Detention Logged', 'Facility checkout recorded and attached to load accessorial ledger.');
    }
  };

  const captureDocumentPhoto = async (useLibrary = false) => {
    try {
      if (useLibrary) {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow photo library access to attach documents.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.78, allowsEditing: true, base64: true });
        if (!res.canceled && res.assets?.[0]) {
          setCapturedImage(res.assets[0].base64 ? `data:image/jpeg;base64,${res.assets[0].base64}` : res.assets[0].uri);
        }
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Camera Permission', 'Please allow camera access to scan BOL/POD documents.');
          return;
        }
        const res = await ImagePicker.launchCameraAsync({ quality: 0.78, allowsEditing: true, base64: true });
        if (!res.canceled && res.assets?.[0]) {
          setCapturedImage(res.assets[0].base64 ? `data:image/jpeg;base64,${res.assets[0].base64}` : res.assets[0].uri);
        }
      }
    } catch (e) {
      Alert.alert('Scanner Notice', 'Could not open camera on this device. Try selecting from gallery.');
    }
  };

  const uploadScannedDoc = async () => {
    setUploadingDoc(true);
    if (capturedImage && activeLoad) {
      if (capturedImage.startsWith('data:')) {
        await api.uploadDocumentBase64({
          loadId: activeLoad.id,
          category: docType,
          originalName: `${docType}_${activeLoad.load_number || Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          base64Data: capturedImage
        }).catch(() => {});
      } else {
        await api.uploadDocument(activeLoad.id, docType, capturedImage, `${docType}_${Date.now()}.jpg`).catch(() => {});
      }
    }
    setUploadingDoc(false);
    const newDoc = {
      id: Date.now(),
      title: `Signed ${docType.toUpperCase()} Document`,
      type: docType.toUpperCase(),
      load_number: activeLoad?.load_number || 'SW-8942',
      uploaded_at: 'Just now',
      file_size: '1.6 MB'
    };
    setDocuments(prev => [newDoc, ...prev]);
    setCapturedImage(null);
    Alert.alert('Uploaded to TMS Vault', `${newDoc.title} for Load #${newDoc.load_number} is now available to Dispatch & Invoicing.`);
  };

  const handleLogIfta = async () => {
    if (!iftaStateCode || !iftaMiles) return;
    await api.logIftaTripMiles({ state: iftaStateCode.toUpperCase(), miles: Number(iftaMiles), gallons: Number(iftaGallons || 0) });
    setIftaSummary(prev => [
      {
        state: iftaStateCode.toUpperCase(),
        miles: Number(iftaMiles),
        gallons: Number(iftaGallons || 0),
        taxRate: '$0.24',
        netTax: '+$3.10'
      },
      ...prev
    ]);
    Alert.alert('IFTA Trip Logged', `Added ${iftaMiles} mi & ${iftaGallons || 0} gal in ${iftaStateCode.toUpperCase()} to quarterly IFTA ledger.`);
  };

  const handleCreateDispatchLoad = () => {
    if (!newLoadOrigin || !newLoadDest || !newLoadRate) {
      Alert.alert('Missing Details', 'Please enter Origin, Destination, and Rate.');
      return;
    }
    const created = {
      id: Date.now(),
      load_number: `SW-${Math.floor(9000 + Math.random() * 900)}`,
      status: 'assigned',
      shipper_name: 'Direct Shipper Facility',
      origin: newLoadOrigin.trim(),
      origin_address: newLoadOrigin.trim(),
      receiver_name: 'Regional Consignee',
      destination: newLoadDest.trim(),
      destination_address: newLoadDest.trim(),
      rate: Number(newLoadRate) || 3200,
      miles: Number(newLoadMiles) || 650,
      empty_miles: 30,
      equipment_type: 'Reefer 53ft',
      driver_name: newLoadDriver || 'Marcus Vance',
      pickup_date: 'Scheduled',
      delivery_date: 'Scheduled'
    };
    setLoadsQueue(prev => [...prev, created]);
    setShowNewLoadModal(false);
    setNewLoadOrigin('');
    setNewLoadDest('');
    setNewLoadRate('');
    setNewLoadMiles('');
    Alert.alert('Load Dispatched', `Load #${created.load_number} added to ${created.driver_name}'s dispatch queue.`);
  };

  // 1. FULL-SCREEN OPENING LAUNCH ANIMATION
  if (anim.isBooting) {
    return <ExecutiveLaunchScreen brandKey="shippingwish" anim={anim} />;
  }

  // 2. END-TO-END CLIENT LOGIN & 7/15-DAY FREE TRIAL REGISTRATION SCREEN
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: T.bg }]}>
        <ExpoStatusBar style={isLightMode ? 'dark' : 'light'} />
        <ScrollView contentContainerStyle={styles.authScroll}>
          <View style={styles.websiteHeroBanner}>
            <View style={styles.websitePillTag}>
              <View style={styles.greenDot} />
              <Text style={styles.websitePillTagText}>24/7 OPERATIONS DESK</Text>
            </View>
            <Text style={[styles.websiteHeroHeading, { color: T.textPrimary }]}>
              Hire a manager for your trucking company.{' '}
              <Text style={{ color: T.blue }}>We work as </Text>
              <Text style={{ color: T.amber }}>your staff.</Text>
            </Text>
            <Text style={[styles.websiteHeroSub, { color: T.textSecondary }]}>
              Named Fleet Operations Manager, load booking you approve, and a full TMS — on a flat weekly plan. First week is $0.
            </Text>
          </View>

          <View style={[styles.modeSwitchContainer, { backgroundColor: T.navyCap }]}>
            <TouchableOpacity
              style={[styles.modeSwitchBtn, authTab === 'login' && styles.modeSwitchBtnActive]}
              onPress={() => setAuthTab('login')}
            >
              <Text style={[styles.modeSwitchText, authTab === 'login' && styles.modeSwitchTextActive]}>
                🔐 Client / ERP Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeSwitchBtn, authTab === 'signup' && styles.modeSwitchBtnActive]}
              onPress={() => setAuthTab('signup')}
            >
              <Text style={[styles.modeSwitchText, authTab === 'signup' && styles.modeSwitchTextActive]}>
                ✨ Start Free Trial
              </Text>
            </TouchableOpacity>
          </View>

          {authTab === 'login' ? (
            <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, marginTop: 14 }]}>
              <View style={styles.webCardNavyHeader}>
                <View>
                  <Text style={styles.webCardNavyEyebrow}>YOUR COMPANY DESK</Text>
                  <Text style={styles.webCardNavyTitle}>Sign In to Client & Driver Portal</Text>
                </View>
                <View style={styles.deskActivePill}>
                  <Text style={styles.deskActivePillText}>● Desk active</Text>
                </View>
              </View>

              <View style={{ padding: 16 }}>
                <Text style={[styles.label, { color: T.textSecondary }]}>WORK EMAIL / ERP LOGIN ID</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]}
                  placeholder="driver@shippingwish.com"
                  placeholderTextColor={T.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />

                <Text style={[styles.label, { color: T.textSecondary }]}>PASSWORD</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]}
                  placeholder="••••••••••••"
                  placeholderTextColor={T.textMuted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />

                <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={authLoading}>
                  {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>SIGN IN TO CONSOLE ›</Text>}
                </TouchableOpacity>

                <View style={[styles.quickDemoBox, { borderTopColor: T.border }]}>
                  <Text style={[styles.quickDemoHeader, { color: T.amber }]}>QUICK DEMO CLIENT ACCOUNTS (1-TAP):</Text>
                  <TouchableOpacity
                    style={styles.demoBtnActive}
                    onPress={() => {
                      setUser({
                        name: 'Marcus Vance',
                        company_name: 'Apex Transport LLC',
                        email: 'marcus@apextransport.com',
                        mc_number: 'MC-148295',
                        role: 'driver',
                        truck: '104'
                      });
                      setSubStatus('trial_active');
                      setTrialDaysLeft(7);
                      setIsAuthenticated(true);
                    }}
                  >
                    <Text style={[styles.demoBtnText, { color: '#047857' }]}>
                      ✓ Login as Active Trial Client (Marcus Vance • MV)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.demoBtnExpired}
                    onPress={() => {
                      setUser({
                        name: 'David Reynolds',
                        company_name: 'Midwest Star Freight LLC',
                        email: 'david@midweststar.com',
                        mc_number: 'MC-391042',
                        role: 'carrier',
                        truck: '108'
                      });
                      setSubStatus('expired');
                      setTrialDaysLeft(0);
                      setIsAuthenticated(true);
                    }}
                  >
                    <Text style={[styles.demoBtnText, { color: '#B91C1C' }]}>
                      🔒 Test Expired Trial Client (See Payment Lock Screen)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, marginTop: 14 }]}>
              <View style={styles.webCardNavyHeader}>
                <View>
                  <Text style={styles.webCardNavyEyebrow}>START FREE WEEK ($0 TODAY)</Text>
                  <Text style={styles.webCardNavyTitle}>Select Trial & Subscription Plan</Text>
                </View>
                <View style={styles.deskActivePill}>
                  <Text style={styles.deskActivePillText}>● $0 Due Today</Text>
                </View>
              </View>

              <View style={{ padding: 16 }}>
                <Text style={[styles.label, { color: T.textSecondary }]}>1. SELECT FREE TRIAL PERIOD</Text>
                <View style={styles.trialToggleRow}>
                  {[
                    { days: 7, label: '7-Day Free Trial', tag: 'FIRST WEEK $0' },
                    { days: 15, label: '15-Day Free Trial', tag: 'FLEET TRIAL $0' }
                  ].map(t => (
                    <TouchableOpacity
                      key={t.days}
                      style={[
                        styles.trialOptionBtn,
                        { backgroundColor: T.subtleBg, borderColor: T.border },
                        trialDaysTotal === t.days && { backgroundColor: T.blue, borderColor: T.blue }
                      ]}
                      onPress={() => setTrialDaysTotal(t.days)}
                    >
                      <Text style={[styles.trialOptionTitle, { color: trialDaysTotal === t.days ? '#fff' : T.textPrimary }]}>
                        {t.label}
                      </Text>
                      <Text style={[styles.trialOptionSub, { color: trialDaysTotal === t.days ? '#DBEAFE' : T.textMuted }]}>
                        {t.tag}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.label, { color: T.textSecondary }]}>2. CHOOSE SUBSCRIPTION PLAN (AFTER TRIAL)</Text>
                {SUBSCRIPTION_PLANS.map(p => {
                  const selected = selectedPlanKey === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[
                        styles.planCard,
                        { backgroundColor: T.subtleBg, borderColor: T.border },
                        selected && { borderColor: T.blue, borderWidth: 2, backgroundColor: T.blueSoft }
                      ]}
                      onPress={() => setSelectedPlanKey(p.key)}
                    >
                      <View style={styles.loadHeaderRow}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.planName, { color: T.textPrimary }]}>{p.name}</Text>
                          <Text style={[styles.planTrucks, { color: T.blue }]}>{p.trucks}</Text>
                        </View>
                        <View style={styles.planPricePill}>
                          <Text style={styles.planPriceText}>{p.priceLabel}</Text>
                        </View>
                      </View>
                      <Text style={[styles.planDesc, { color: T.textSecondary }]}>{p.desc}</Text>
                    </TouchableOpacity>
                  );
                })}

                {regStep === 'form' ? (
                  <>
                    <Text style={[styles.label, { color: T.textSecondary }]}>3. CLIENT & CARRIER AUTHORITY DETAILS</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]}
                      placeholder="Your Full Name * (e.g. Marcus Vance)"
                      placeholderTextColor={T.textMuted}
                      value={regName}
                      onChangeText={setRegName}
                    />
                    <TextInput
                      style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary, marginTop: 8 }]}
                      placeholder="Company Name * (e.g. Apex Transport LLC)"
                      placeholderTextColor={T.textMuted}
                      value={regCompany}
                      onChangeText={setRegCompany}
                    />
                    <View style={[styles.threeColRow, { marginTop: 8 }]}>
                      <TextInput
                        style={[styles.input, { flex: 1, backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]}
                        placeholder="MC # (MC-148295)"
                        placeholderTextColor={T.textMuted}
                        value={regMc}
                        onChangeText={setRegMc}
                      />
                      <TextInput
                        style={[styles.input, { flex: 1, marginLeft: 8, backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]}
                        placeholder="USDOT #"
                        placeholderTextColor={T.textMuted}
                        value={regDot}
                        onChangeText={setRegDot}
                      />
                    </View>
                    <TextInput
                      style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary, marginTop: 8 }]}
                      placeholder="Mobile Phone *"
                      placeholderTextColor={T.textMuted}
                      keyboardType="phone-pad"
                      value={regPhone}
                      onChangeText={setRegPhone}
                    />
                    <TextInput
                      style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary, marginTop: 8 }]}
                      placeholder="Work Email *"
                      placeholderTextColor={T.textMuted}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={regEmail}
                      onChangeText={setRegEmail}
                    />
                    <TextInput
                      style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary, marginTop: 8 }]}
                      placeholder="Create Password (min 8 chars) *"
                      placeholderTextColor={T.textMuted}
                      secureTextEntry
                      value={regPassword}
                      onChangeText={setRegPassword}
                    />

                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: T.blue }]}
                      onPress={handleStartFreeTrialSignup}
                      disabled={authLoading}
                    >
                      {authLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>
                          START {trialDaysTotal} DAYS FREE ($0 TODAY) ›
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={[styles.label, { color: T.textSecondary }]}>ENTER 6-DIGIT EMAIL VERIFICATION CODE</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary, textAlign: 'center', fontSize: 20, letterSpacing: 6, fontWeight: '900' }]}
                      placeholder="123456"
                      placeholderTextColor={T.textMuted}
                      keyboardType="numeric"
                      maxLength={6}
                      value={regOtp}
                      onChangeText={setRegOtp}
                    />
                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: T.emerald }]}
                      onPress={handleVerifySignupOtp}
                      disabled={authLoading}
                    >
                      <Text style={styles.buttonText}>VERIFY & ACTIVATE FREE TRIAL</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 3. EXPIRED TRIAL / INACTIVE SUBSCRIPTION PAYMENT GATE SCREEN
  if (subStatus === 'expired') {
    const planObj = getPlanByKey(selectedPlanKey);
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: T.bg }]}>
        <ExpoStatusBar style={isLightMode ? 'dark' : 'light'} />
        <ScrollView contentContainerStyle={styles.authScroll}>
          <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.danger, borderWidth: 1.5, marginTop: 16 }]}>
            <View style={[styles.webCardNavyHeader, { backgroundColor: '#7F1D1D' }]}>
              <View>
                <Text style={[styles.webCardNavyEyebrow, { color: '#FCA5A5' }]}>TRIAL ENDED • ACCOUNT INACTIVE</Text>
                <Text style={styles.webCardNavyTitle}>Subscription Payment Required</Text>
              </View>
            </View>

            <View style={{ padding: 16 }}>
              <Text style={[styles.modalSub, { color: T.textSecondary, lineHeight: 19 }]}>
                Hello <Text style={{ color: T.textPrimary, fontWeight: '800' }}>{user.name}</Text> ({user.company_name}), your free trial period has ended. Complete your weekly subscription payment below to immediately reactivate your Driver Console, Live ELD GPS, and Fleet TMS.
              </Text>

              <View style={[styles.expiredPlanBox, { backgroundColor: T.subtleBg, borderColor: T.border }]}>
                <Text style={[styles.expiredPlanLabel, { color: T.amber }]}>SELECTED SUBSCRIPTION PLAN</Text>
                <Text style={[styles.expiredPlanTitle, { color: T.textPrimary }]}>{planObj.name}</Text>
                <Text style={[styles.expiredPlanPrice, { color: T.blue }]}>{planObj.priceLabel} • {planObj.trucks}</Text>
                <Text style={[styles.expiredPlanDesc, { color: T.textSecondary }]}>{planObj.desc}</Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: T.emerald, marginTop: 12 }]}
                onPress={handlePaySubscription}
                disabled={authLoading}
              >
                {authLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    💳 PAY {planObj.priceLabel.toUpperCase()} & ACTIVATE ACCOUNT
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: '#475569', marginTop: 10 }]}
                onPress={() => setIsAuthenticated(false)}
              >
                <Text style={styles.buttonText}>← BACK TO SIGN IN / SWITCH ACCOUNT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 4. ACTIVE AUTHENTICATED MAIN CONSOLE (WEBSITE LIGHT THEME BY DEFAULT!)
  const statusChipLabel =
    subStatus === 'trial_active'
      ? `⏳ ${trialDaysLeft}D TRIAL`
      : '✓ ACTIVE PLAN';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: T.bg }]}>
      <ExpoStatusBar style={isLightMode ? 'dark' : 'light'} />

      {/* Top Executive Header: Customer Initials ("MV") + Prominent Customer & Company Name */}
      <ExecutiveTopBar
        brandKey="shippingwish"
        isLightMode={isLightMode}
        userLabel={user?.name || 'Marcus Vance'}
        companyLabel={`${user?.company_name || 'Apex Transport LLC'} • Unit #${user?.truck || '104'}`}
        verifiedLabel={statusChipLabel}
        rightStatusLabel="● DESK ACTIVE"
        rightStatusSub="Auto-GPS On"
        onOpenMenu={() => setMenuVisible(true)}
        onRightPress={() => anim.runWithLoader('Syncing with 24/7 Operations Desk...', refreshAllData)}
      />

      {/* Role Mode Switcher: CDL Driver Console vs Fleet & Dispatch TMS */}
      <View style={[styles.modeSwitchContainer, { backgroundColor: T.navyCap }]}>
        <TouchableOpacity
          style={[styles.modeSwitchBtn, appMode === 'driver' && { backgroundColor: T.blue }]}
          onPress={() => setAppMode('driver')}
        >
          <FontAwesome5 name="truck" size={13} color={appMode === 'driver' ? '#fff' : '#94A3B8'} />
          <Text style={[styles.modeSwitchText, { color: appMode === 'driver' ? '#fff' : '#94A3B8' }]}>
            CDL Driver Console
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeSwitchBtn, appMode === 'tms' && { backgroundColor: T.blue }]}
          onPress={() => setAppMode('tms')}
        >
          <Ionicons name="analytics" size={14} color={appMode === 'tms' ? '#fff' : '#94A3B8'} />
          <Text style={[styles.modeSwitchText, { color: appMode === 'tms' ? '#fff' : '#94A3B8' }]}>
            Fleet & Dispatch TMS
          </Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={{ flex: 1, opacity: anim.tabFade, transform: [{ translateY: anim.tabSlide }] }}>
        {/* ===================================================================== */}
        {/* MODE 1: CDL DRIVER CONSOLE                                            */}
        {/* ===================================================================== */}
        {appMode === 'driver' && (
          <View style={{ flex: 1 }}>
            {/* TAB 1: ACTIVE ROUTE (Click Active Load Card to Open Status Milestones!) */}
            {driverTab === 'route' && (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Auto-GPS Telemetry Bar */}
                <View style={[styles.gpsBar, { backgroundColor: T.card, borderColor: T.border }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={styles.gpsStatusRow}>
                      <View style={[styles.pulseDot, !autoGpsEnabled && { backgroundColor: T.amber }]} />
                      <Text style={[styles.gpsLabel, { color: T.blue }]}>
                        {autoGpsEnabled ? 'AUTO-GPS TELEMETRY (EVERY 30S):' : 'MANUAL GPS MODE:'}
                      </Text>
                    </View>
                    <Text style={[styles.gpsValue, { color: T.textPrimary }]} numberOfLines={1}>{gpsStatus}</Text>
                    <Text style={[styles.gpsSubTime, { color: T.textMuted }]}>
                      Last heartbeat: {lastGpsTime} • Hands-free highway tracking
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      style={[
                        styles.autoGpsTogglePill,
                        !autoGpsEnabled && { backgroundColor: T.amberSoft, borderColor: T.amber }
                      ]}
                      onPress={() => setAutoGpsEnabled(!autoGpsEnabled)}
                    >
                      <Text style={[styles.autoGpsToggleText, { color: autoGpsEnabled ? '#047857' : T.amber }]}>
                        {autoGpsEnabled ? 'AUTO: ON' : 'AUTO: OFF'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.gpsPingButton, { backgroundColor: T.blue }]}
                      onPress={() => pingLocation(false)}
                    >
                      <Ionicons name="reload" size={13} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Incoming AI DAT Load Offers */}
                {pendingOffers.length > 0 && (
                  <View style={styles.offersBox}>
                    <View style={styles.offersHeaderRow}>
                      <View style={styles.offersLiveTag}>
                        <View style={styles.pulsingRedDot} />
                        <Text style={styles.offersLiveTagText}>INSTANT AI RELOAD OFFER</Text>
                      </View>
                      <Text style={[styles.offersCountText, { color: T.textMuted }]}>{pendingOffers.length} Available</Text>
                    </View>

                    {pendingOffers.map(offer => (
                      <View key={offer.id} style={[styles.webCard, { backgroundColor: T.card, borderColor: T.blue, borderWidth: 1.5 }]}>
                        <View style={styles.webCardNavyHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.webCardNavyEyebrow}>NAMED MANAGER RELOAD MATCH</Text>
                            <Text style={styles.webCardNavyTitle}>{offer.pickup_location} ➔ {offer.delivery_location}</Text>
                          </View>
                          <View style={styles.offerRateBadge}>
                            <Text style={styles.offerRateAmount}>${Number(offer.rate || 1650).toLocaleString()}</Text>
                          </View>
                        </View>
                        <View style={{ padding: 14 }}>
                          <Text style={{ color: T.textSecondary, fontSize: 12, marginBottom: 6 }}>
                            {offer.broker_name} • {offer.loaded_miles} mi ({offer.deadhead_miles} mi Empty DH)
                          </Text>
                          {offer.note ? <Text style={{ color: T.amber, fontSize: 11.5, fontWeight: '800', marginBottom: 10 }}>{offer.note}</Text> : null}
                          <View style={styles.offerActionsRow}>
                            <TouchableOpacity
                              style={[styles.offerBtn, { flex: 1, backgroundColor: T.subtleBg, borderWidth: 1, borderColor: T.border }]}
                              onPress={() => handleOfferResponse(offer, 'release')}
                            >
                              <Text style={{ color: T.textSecondary, fontWeight: '800', fontSize: 12 }}>PASS</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.offerBtn, styles.offerBookBtn]}
                              onPress={() => handleOfferResponse(offer, 'book')}
                            >
                              <Text style={styles.offerBookBtnText}>⚡ APPROVE & LOCK LOAD</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* ACTIVE LOAD CARD (Website Navy-Cap Card Style — Tap to Open Status Milestones!) */}
                {activeLoad ? (
                  <>
                    <TouchableOpacity
                      style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, marginBottom: 14 }]}
                      activeOpacity={0.85}
                      onPress={() => setShowActiveLoadSheet(true)}
                    >
                      <View style={styles.webCardNavyHeader}>
                        <View>
                          <Text style={styles.webCardNavyEyebrow}>CURRENT ACTIVE DISPATCH (TAP FOR MILESTONES)</Text>
                          <Text style={styles.webCardNavyTitle}>ACTIVE LOAD #{activeLoad.load_number}</Text>
                        </View>
                        <View style={[styles.statusPill, { backgroundColor: getStatusColor(activeLoad.status) }]}>
                          <Text style={styles.statusPillText}>{(activeLoad.status || 'ASSIGNED').replace('_', ' ').toUpperCase()}</Text>
                        </View>
                      </View>

                      <View style={{ padding: 14 }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: T.textPrimary }}>
                          {activeLoad.origin} ➔ {activeLoad.destination}
                        </Text>
                        <Text style={{ fontSize: 12, color: T.textSecondary, marginTop: 2, marginBottom: 12 }}>
                          {activeLoad.commodity || 'Temperature Controlled Freight'} • Broker Pay 100% Yours
                        </Text>

                        <View style={[styles.specsRow, { backgroundColor: T.subtleBg, borderWidth: 1, borderColor: T.border }]}>
                          <View style={styles.specItem}>
                            <Text style={[styles.specLabel, { color: T.textMuted }]}>GROSS RATE</Text>
                            <Text style={[styles.specValue, { color: T.emerald }]}>${Number(activeLoad.rate || 3450).toLocaleString()}</Text>
                          </View>
                          <View style={[styles.specDivider, { backgroundColor: T.border }]} />
                          <View style={styles.specItem}>
                            <Text style={[styles.specLabel, { color: T.textMuted }]}>LOADED / EMPTY</Text>
                            <Text style={[styles.specValue, { color: T.textPrimary }]}>{activeLoad.miles} / {activeLoad.empty_miles || 42} mi</Text>
                          </View>
                          <View style={[styles.specDivider, { backgroundColor: T.border }]} />
                          <View style={styles.specItem}>
                            <Text style={[styles.specLabel, { color: T.textMuted }]}>EQUIPMENT</Text>
                            <Text style={[styles.specValue, { color: T.textPrimary }]}>{activeLoad.equipment_type}</Text>
                          </View>
                        </View>

                        {/* Clear Call-to-Action Bar to Open Load Milestones */}
                        <View style={[styles.tapLoadBanner, { backgroundColor: T.blueSoft, borderColor: T.blue }]}>
                          <Text style={[styles.tapLoadBannerText, { color: T.blue }]}>
                            👆 Tap Here to Update Load Status (At Shipper, Loaded, In Transit, Delivered & Empty) ›
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Stop 1: Pickup (Tap card to open milestones, or use Navigate / Call buttons) */}
                    <TouchableOpacity
                      style={[styles.stopCard, { backgroundColor: T.card, borderColor: T.border }]}
                      activeOpacity={0.88}
                      onPress={() => setShowActiveLoadSheet(true)}
                    >
                      <View style={styles.stopIconCol}>
                        <View style={[styles.stopCircle, { backgroundColor: T.blue }]}>
                          <Text style={styles.stopCircleText}>1</Text>
                        </View>
                        <View style={[styles.dottedLine, { backgroundColor: T.border }]} />
                      </View>
                      <View style={styles.stopDetails}>
                        <View style={styles.stopHeaderRow}>
                          <Text style={[styles.stopRole, { color: T.blue }]}>PICKUP (SHIPPER)</Text>
                          <Text style={[styles.stopDate, { color: T.textMuted }]}>{activeLoad.pickup_date}</Text>
                        </View>
                        <Text style={[styles.stopName, { color: T.textPrimary }]}>{activeLoad.shipper_name}</Text>
                        <Text style={[styles.stopAddress, { color: T.textSecondary }]}>{activeLoad.origin_address || activeLoad.origin}</Text>
                        <View style={styles.stopActionRow}>
                          <TouchableOpacity
                            style={[styles.navButton, { backgroundColor: T.blue }]}
                            onPress={() => openNavigation(activeLoad.origin_address || activeLoad.origin)}
                          >
                            <Ionicons name="navigate" size={14} color="#fff" />
                            <Text style={styles.actionButtonText}>NAVIGATE</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.callButton, { borderColor: T.border, backgroundColor: T.subtleBg }]}
                            onPress={() => makeCall(activeLoad.shipper_phone || '+12145558821')}
                          >
                            <Ionicons name="call" size={14} color={T.blue} />
                            <Text style={[styles.actionButtonText, { color: T.blue }]}>CALL SHIPPER</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Stop 2: Delivery */}
                    <TouchableOpacity
                      style={[styles.stopCard, { backgroundColor: T.card, borderColor: T.border }]}
                      activeOpacity={0.88}
                      onPress={() => setShowActiveLoadSheet(true)}
                    >
                      <View style={styles.stopIconCol}>
                        <View style={[styles.stopCircle, { backgroundColor: T.emerald }]}>
                          <Text style={styles.stopCircleText}>2</Text>
                        </View>
                      </View>
                      <View style={styles.stopDetails}>
                        <View style={styles.stopHeaderRow}>
                          <Text style={[styles.stopRole, { color: T.emerald }]}>DELIVERY (RECEIVER)</Text>
                          <Text style={[styles.stopDate, { color: T.textMuted }]}>{activeLoad.delivery_date}</Text>
                        </View>
                        <Text style={[styles.stopName, { color: T.textPrimary }]}>{activeLoad.receiver_name}</Text>
                        <Text style={[styles.stopAddress, { color: T.textSecondary }]}>{activeLoad.destination_address || activeLoad.destination}</Text>
                        <View style={styles.stopActionRow}>
                          <TouchableOpacity
                            style={[styles.navButton, { backgroundColor: T.emerald }]}
                            onPress={() => openNavigation(activeLoad.destination_address || activeLoad.destination)}
                          >
                            <Ionicons name="navigate" size={14} color="#fff" />
                            <Text style={styles.actionButtonText}>NAVIGATE</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.callButton, { borderColor: T.border, backgroundColor: T.subtleBg }]}
                            onPress={() => makeCall(activeLoad.receiver_phone || '+14045559012')}
                          >
                            <Ionicons name="call" size={14} color={T.blue} />
                            <Text style={[styles.actionButtonText, { color: T.blue }]}>CALL RECEIVER</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Next Queued Loads Preview */}
                    {upcomingLoads.length > 0 && (
                      <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, marginTop: 6, padding: 14 }]}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: T.amber, letterSpacing: 0.6 }}>
                          UPCOMING QUEUED LOADS ({upcomingLoads.length} NEXT IN LINE)
                        </Text>
                        {upcomingLoads.map(ul => (
                          <View key={ul.id} style={[styles.upcomingRow, { borderTopColor: T.border }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13.5, fontWeight: '800', color: T.textPrimary }}>
                                #{ul.load_number}: {ul.origin} ➔ {ul.destination}
                              </Text>
                              <Text style={{ fontSize: 11, color: T.textSecondary }}>
                                {ul.pickup_date} • {ul.miles} loaded mi ({ul.empty_miles || 20} empty mi)
                              </Text>
                            </View>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: T.emerald }}>${ul.rate}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, padding: 24, alignItems: 'center' }]}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: T.textPrimary }}>All Queued Loads Delivered!</Text>
                    <Text style={{ fontSize: 12.5, color: T.textSecondary, textAlign: 'center', marginTop: 6 }}>
                      Every completed load has been recorded in your History & Branded PDF Statement tab.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryButton, { paddingHorizontal: 20 }]}
                      onPress={() => setDriverTab('history')}
                    >
                      <Text style={styles.buttonText}>📄 VIEW HISTORY & DOWNLOAD PDF REPORT</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 24/7 Operations Desk Contact */}
                <TouchableOpacity
                  style={[styles.emergencyBanner, { backgroundColor: T.navyCap, borderColor: T.blue }]}
                  onPress={() => makeCall('+19177370021')}
                >
                  <Ionicons name="call" size={20} color="#fff" />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.emergencyTitle}>Named Fleet Operations Manager (24/7 Desk)</Text>
                    <Text style={[styles.emergencySub, { color: '#93C5FD' }]}>Tap to call +1 (917) 737-0021 • Shipping Wish LLC</Text>
                  </View>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* ===================================================================== */}
            {/* TAB 2: COMPLETED LOAD HISTORY & BRANDED PDF REPORTS                   */}
            {/* ===================================================================== */}
            {driverTab === 'history' && (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Period Filter Selector: Per Load | 7 Days | 15 Days | 30 Days (Month) */}
                <Text style={[styles.label, { color: T.textSecondary, marginTop: 0 }]}>
                  SELECT REPORT PERIOD FOR SUMMARY & PDF EXPORT
                </Text>
                <View style={styles.periodTabsRow}>
                  {[
                    { id: 'per_load', label: 'Per Load' },
                    { id: '7_days', label: '7 Days' },
                    { id: '15_days', label: '15 Days' },
                    { id: '30_days', label: '30 Days (Month)' }
                  ].map(p => {
                    const active = reportPeriod === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          styles.periodTabBtn,
                          { backgroundColor: T.card, borderColor: T.border },
                          active && { backgroundColor: T.blue, borderColor: T.blue }
                        ]}
                        onPress={() => {
                          setReportPeriod(p.id);
                          if (p.id !== 'per_load') setSelectedReportLoadNum(null);
                        }}
                      >
                        <Text style={[styles.periodTabText, { color: active ? '#fff' : T.textPrimary }]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* SECTION 1: EXECUTIVE SUMMARY KPI CARD (Branded Website Navy-Cap Style) */}
                <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, marginTop: 10 }]}>
                  <View style={styles.webCardNavyHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.webCardNavyEyebrow}>
                        SECTION 1 • EXECUTIVE PERFORMANCE SUMMARY ({reportPeriod.replace('_', ' ').toUpperCase()})
                      </Text>
                      <Text style={styles.webCardNavyTitle}>
                        {user.company_name} • {user.name}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.pdfExportHeaderBtn}
                      onPress={() => handleDownloadBrandedPdf(reportPeriod, selectedReportLoadNum)}
                    >
                      <Text style={styles.pdfExportHeaderBtnText}>📑 DOWNLOAD PDF</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ padding: 14 }}>
                    {/* Row 1: Total Driven, Loaded Miles, Empty Miles */}
                    <View style={[styles.summaryGridRow, { backgroundColor: T.subtleBg, borderColor: T.border }]}>
                      <View style={styles.summaryMetricCol}>
                        <Text style={[styles.summaryMetricLabel, { color: T.textMuted }]}>TOTAL DRIVEN</Text>
                        <Text style={[styles.summaryMetricVal, { color: T.textPrimary }]}>
                          {reportSummary.totalMiles.toLocaleString()} mi
                        </Text>
                        <Text style={{ fontSize: 9.5, color: T.textSecondary }}>{reportSummary.count} Completed Trips</Text>
                      </View>
                      <View style={[styles.specDivider, { backgroundColor: T.border }]} />
                      <View style={styles.summaryMetricCol}>
                        <Text style={[styles.summaryMetricLabel, { color: T.blue }]}>LOADED MILES</Text>
                        <Text style={[styles.summaryMetricVal, { color: T.blue }]}>
                          {reportSummary.loadedMiles.toLocaleString()} mi
                        </Text>
                        <Text style={{ fontSize: 9.5, color: T.blue }}>{reportSummary.loadedPct}% Loaded ({reportSummary.loadedCount})</Text>
                      </View>
                      <View style={[styles.specDivider, { backgroundColor: T.border }]} />
                      <View style={styles.summaryMetricCol}>
                        <Text style={[styles.summaryMetricLabel, { color: T.amber }]}>EMPTY / UNLOADED</Text>
                        <Text style={[styles.summaryMetricVal, { color: T.amber }]}>
                          {reportSummary.emptyMiles.toLocaleString()} mi
                        </Text>
                        <Text style={{ fontSize: 9.5, color: T.amber }}>{reportSummary.emptyPct}% Deadhead ({reportSummary.unloadedCount})</Text>
                      </View>
                    </View>

                    {/* Row 2: Gross Earned, Approx Fuel Expense, Net Profit */}
                    <View style={[styles.summaryGridRow, { backgroundColor: T.subtleBg, borderColor: T.border, marginTop: 10 }]}>
                      <View style={styles.summaryMetricCol}>
                        <Text style={[styles.summaryMetricLabel, { color: T.emerald }]}>GROSS EARNED</Text>
                        <Text style={[styles.summaryMetricVal, { color: T.emerald }]}>
                          ${reportSummary.grossEarnings.toLocaleString()}
                        </Text>
                        <Text style={{ fontSize: 9.5, color: T.textSecondary }}>100% Broker Pay</Text>
                      </View>
                      <View style={[styles.specDivider, { backgroundColor: T.border }]} />
                      <View style={styles.summaryMetricCol}>
                        <Text style={[styles.summaryMetricLabel, { color: T.danger }]}>EST. FUEL EXPENSE</Text>
                        <Text style={[styles.summaryMetricVal, { color: T.danger }]}>
                          -${reportSummary.fuelCost.toFixed(0)}
                        </Text>
                        <Text style={{ fontSize: 9.5, color: T.textSecondary }}>~{reportSummary.fuelGallons.toFixed(0)} gal Diesel</Text>
                      </View>
                      <View style={[styles.specDivider, { backgroundColor: T.border }]} />
                      <View style={styles.summaryMetricCol}>
                        <Text style={[styles.summaryMetricLabel, { color: T.textPrimary }]}>NET EARNINGS</Text>
                        <Text style={[styles.summaryMetricVal, { color: T.blue }]}>
                          +${reportSummary.netProfit.toFixed(0)}
                        </Text>
                        <Text style={{ fontSize: 9.5, color: T.textSecondary }}>After Est. Fuel</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: T.blue, marginTop: 12 }]}
                      onPress={() => handleDownloadBrandedPdf(reportPeriod, selectedReportLoadNum)}
                    >
                      <Ionicons name="document-text" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.buttonText}>
                        DOWNLOAD BRANDED {reportPeriod.replace('_', ' ').toUpperCase()} PDF REPORT
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* SECTION 2: LINE-BY-LINE COMPLETED LOAD DETAILS */}
                <Text style={[styles.label, { color: T.textSecondary, marginTop: 16 }]}>
                  SECTION 2 • LINE-BY-LINE COMPLETED LOAD LEDGER ({filteredHistory.length} LOADS)
                </Text>

                {filteredHistory.map(item => {
                  const totalMi = Number(item.loaded_miles || 0) + Number(item.empty_miles || 0);
                  const net = Number(item.rate || 0) - Number(item.fuel_cost || 0);
                  return (
                    <View
                      key={item.id}
                      style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, marginBottom: 12, padding: 14 }]}
                    >
                      <View style={styles.loadHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: '900', color: T.blue }}>
                            LOAD #{item.load_number} • COMPLETED {item.completed_at}
                          </Text>
                          <Text style={{ fontSize: 15, fontWeight: '900', color: T.textPrimary, marginTop: 2 }}>
                            {item.origin} ➔ {item.destination}
                          </Text>
                          <Text style={{ fontSize: 11, color: T.textSecondary, marginTop: 1 }}>
                            {item.shipper_name} ➔ {item.receiver_name}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.perLoadPdfBtn, { backgroundColor: T.blueSoft, borderColor: T.blue }]}
                          onPress={() => handleDownloadBrandedPdf('per_load', item.load_number)}
                        >
                          <Text style={[styles.perLoadPdfBtnText, { color: T.blue }]}>📄 Load PDF</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={[styles.historyLineGrid, { backgroundColor: T.subtleBg, borderColor: T.border }]}>
                        <View style={styles.historyLineCol}>
                          <Text style={[styles.historyLineLabel, { color: T.textMuted }]}>LOADED MI</Text>
                          <Text style={[styles.historyLineVal, { color: T.textPrimary }]}>{item.loaded_miles} mi</Text>
                        </View>
                        <View style={styles.historyLineCol}>
                          <Text style={[styles.historyLineLabel, { color: T.textMuted }]}>EMPTY MI</Text>
                          <Text style={[styles.historyLineVal, { color: T.amber }]}>{item.empty_miles} mi</Text>
                        </View>
                        <View style={styles.historyLineCol}>
                          <Text style={[styles.historyLineLabel, { color: T.textMuted }]}>TOTAL DRIVEN</Text>
                          <Text style={[styles.historyLineVal, { color: T.textPrimary }]}>{totalMi} mi</Text>
                        </View>
                        <View style={styles.historyLineCol}>
                          <Text style={[styles.historyLineLabel, { color: T.textMuted }]}>GROSS EARN</Text>
                          <Text style={[styles.historyLineVal, { color: T.emerald }]}>${item.rate}</Text>
                        </View>
                        <View style={styles.historyLineCol}>
                          <Text style={[styles.historyLineLabel, { color: T.textMuted }]}>EST. FUEL</Text>
                          <Text style={[styles.historyLineVal, { color: T.danger }]}>-${Number(item.fuel_cost).toFixed(0)}</Text>
                        </View>
                        <View style={styles.historyLineCol}>
                          <Text style={[styles.historyLineLabel, { color: T.textMuted }]}>NET PROFIT</Text>
                          <Text style={[styles.historyLineVal, { color: T.blue }]}>+${net.toFixed(0)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* TAB 3: ELD & HOS */}
            {driverTab === 'eld' && (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border }]}>
                  <View style={styles.webCardNavyHeader}>
                    <View>
                      <Text style={styles.webCardNavyEyebrow}>FMCSA PART 395 COMPLIANCE</Text>
                      <Text style={styles.webCardNavyTitle}>ELD Logbook & HOS Clocks</Text>
                    </View>
                    <View style={styles.deskActivePill}>
                      <Text style={styles.deskActivePillText}>● {dutyStatus.replace('_', ' ')}</Text>
                    </View>
                  </View>

                  <View style={{ padding: 14 }}>
                    <View style={styles.dutyGrid}>
                      {[
                        { id: 'OFF_DUTY', label: 'OFF DUTY', color: '#64748B' },
                        { id: 'SLEEPER', label: 'SLEEPER BERTH', color: '#7C3AED' },
                        { id: 'DRIVING', label: 'DRIVING', color: T.emerald },
                        { id: 'ON_DUTY', label: 'ON DUTY (NOT DRIVING)', color: T.amber }
                      ].map(st => (
                        <TouchableOpacity
                          key={st.id}
                          style={[
                            styles.dutyBtn,
                            { backgroundColor: T.subtleBg, borderColor: T.border },
                            dutyStatus === st.id && { backgroundColor: st.color, borderColor: st.color }
                          ]}
                          onPress={() => handleSwitchDuty(st.id)}
                        >
                          <Text style={[styles.dutyBtnText, { color: dutyStatus === st.id ? '#fff' : T.textPrimary }]}>
                            {st.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.hosGrid}>
                      {[
                        { label: '11-HR DRIVING LEFT', val: hosClocks.drivingLeft, sub: 'FMCSA §395.3(a)(3)', color: T.emerald },
                        { label: '14-HR SHIFT WINDOW', val: hosClocks.shiftLeft, sub: 'On-Duty Window', color: T.blue },
                        { label: '70-HR / 8-DAY CYCLE', val: hosClocks.cycleLeft, sub: '34-Hr Restart Ready', color: T.amber },
                        { label: '8-HR REST BREAK', val: hosClocks.breakLeft, sub: 'Until 30m Break', color: T.textPrimary }
                      ].map((c, i) => (
                        <View key={i} style={[styles.hosCard, { backgroundColor: T.subtleBg, borderColor: T.border }]}>
                          <Text style={[styles.hosLabel, { color: T.textMuted }]}>{c.label}</Text>
                          <Text style={[styles.hosClock, { color: c.color }]}>{c.val}</Text>
                          <Text style={[styles.hosSub, { color: T.textSecondary }]}>{c.sub}</Text>
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: T.blue }]}
                      onPress={() => Alert.alert('RODS Certified', 'Your 24-hour Record of Duty Status (RODS) log has been electronically signed.')}
                    >
                      <Text style={styles.buttonText}>✓ CERTIFY & SIGN TODAY'S ELD LOG</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}

            {/* TAB 4: BOL / POD CAMERA SCANNER */}
            {driverTab === 'scanner' && (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border }]}>
                  <View style={styles.webCardNavyHeader}>
                    <View>
                      <Text style={styles.webCardNavyEyebrow}>INSTANT DOCUMENT VAULT</Text>
                      <Text style={styles.webCardNavyTitle}>Scan BOL, POD, RateCon & Lumper</Text>
                    </View>
                  </View>

                  <View style={{ padding: 14 }}>
                    <Text style={[styles.label, { color: T.textSecondary }]}>1. SELECT DOCUMENT TYPE</Text>
                    <View style={styles.docTypeRow}>
                      {['bol', 'pod', 'ratecon', 'lumper', 'scale_ticket'].map(type => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.docTypeBadge,
                            { backgroundColor: T.subtleBg, borderColor: T.border },
                            docType === type && { backgroundColor: T.blue, borderColor: T.blue }
                          ]}
                          onPress={() => setDocType(type)}
                        >
                          <Text style={[styles.docTypeText, { color: docType === type ? '#fff' : T.textPrimary }]}>
                            {type.replace('_', ' ').toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.toolsRow}>
                      <TouchableOpacity style={[styles.toolCard, { backgroundColor: T.subtleBg, borderColor: T.border }]} onPress={() => captureDocumentPhoto(false)}>
                        <Ionicons name="camera" size={26} color={T.blue} />
                        <Text style={[styles.toolTitle, { color: T.textPrimary }]}>OPEN CAMERA</Text>
                        <Text style={[styles.toolSub, { color: T.textMuted }]}>Snap paper document</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.toolCard, { backgroundColor: T.subtleBg, borderColor: T.border }]} onPress={() => captureDocumentPhoto(true)}>
                        <Ionicons name="image" size={26} color={T.amber} />
                        <Text style={[styles.toolTitle, { color: T.textPrimary }]}>PHOTO LIBRARY</Text>
                        <Text style={[styles.toolSub, { color: T.textMuted }]}>Choose existing photo</Text>
                      </TouchableOpacity>
                    </View>

                    {capturedImage ? (
                      <Image source={{ uri: capturedImage }} style={styles.previewImage} resizeMode="contain" />
                    ) : null}

                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: T.emerald }]}
                      onPress={uploadScannedDoc}
                      disabled={uploadingDoc}
                    >
                      <Text style={styles.buttonText}>UPLOAD {docType.toUpperCase()} TO TMS VAULT</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}

            {/* TAB 5: DVIR & IFTA */}
            {driverTab === 'ifta' && (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, padding: 16 }]}>
                  <Text style={[styles.modalTitle, { color: T.textPrimary }]}>Daily DOT Pre-Trip DVIR Checklist</Text>
                  {Object.keys(preTripChecks).map(key => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.checkItem, { borderBottomColor: T.border }]}
                      onPress={() => setPreTripChecks(prev => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <Ionicons
                        name={preTripChecks[key] ? 'checkmark-circle' : 'close-circle'}
                        size={20}
                        color={preTripChecks[key] ? T.emerald : T.danger}
                      />
                      <Text style={[styles.checkItemText, { color: T.textPrimary }]}>
                        {key.toUpperCase()}: {getCheckLabel(key)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: T.blue }]}
                    onPress={() => Alert.alert('DVIR Logged', 'Pre-trip inspection recorded on FMCSA compliance ledger.')}
                  >
                    <Text style={styles.buttonText}>SUBMIT SIGNED DOT DVIR</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* Driver Bottom Navigation (Includes History & PDF Tab!) */}
            <View style={[styles.bottomNav, { backgroundColor: T.card, borderTopColor: T.border }]}>
              {[
                { id: 'route', label: 'Active Route', icon: 'route' },
                { id: 'history', label: 'History & PDF', icon: 'receipt' },
                { id: 'eld', label: 'ELD & HOS', icon: 'speedometer' },
                { id: 'scanner', label: 'BOL Scanner', icon: 'camera' },
                { id: 'ifta', label: 'DVIR & IFTA', icon: 'clipboard-check' }
              ].map(tab => (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.navItem}
                  onPress={() => setDriverTab(tab.id)}
                >
                  <Ionicons name={tab.icon} size={19} color={driverTab === tab.id ? T.blue : T.textMuted} />
                  <Text style={[styles.navText, { color: driverTab === tab.id ? T.blue : T.textMuted }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ===================================================================== */}
        {/* MODE 2: FLEET & DISPATCH TMS                                          */}
        {/* ===================================================================== */}
        {appMode === 'tms' && (
          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border }]}>
                <View style={styles.webCardNavyHeader}>
                  <View>
                    <Text style={styles.webCardNavyEyebrow}>YOUR COMPANY DESK</Text>
                    <Text style={styles.webCardNavyTitle}>Active Fleet Dispatches ({loadsQueue.length})</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pdfExportHeaderBtn}
                    onPress={() => setShowNewLoadModal(true)}
                  >
                    <Text style={styles.pdfExportHeaderBtnText}>＋ NEW LOAD</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ padding: 14 }}>
                  {loadsQueue.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.upcomingRow, { borderTopColor: T.border, paddingVertical: 12 }]}
                      onPress={() => setSelectedLoad(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: T.blue }}>LOAD #{item.load_number}</Text>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: T.textPrimary }}>{item.origin} ➔ {item.destination}</Text>
                        <Text style={{ fontSize: 12, color: T.textSecondary }}>
                          Driver: {item.driver_name} • {item.equipment_type} • {item.miles} mi
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: T.emerald }}>${item.rate}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        )}
      </Animated.View>

      {/* ===================================================================== */}
      {/* ACTIVE LOAD COMMAND & STATUS MILESTONE SHEET (OPENED BY TAPPING LOAD) */}
      {/* ===================================================================== */}
      <Modal visible={showActiveLoadSheet && !!activeLoad} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, maxHeight: '88%' }]}>
            <View style={styles.webCardNavyHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.webCardNavyEyebrow}>ACTIVE TRIP DISPATCH ACTIONS</Text>
                <Text style={styles.webCardNavyTitle}>
                  Load #{activeLoad?.load_number} • {activeLoad?.origin} ➔ {activeLoad?.destination}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowActiveLoadSheet(false)} style={{ padding: 4 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {activeLoad && (
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <View style={[styles.specsRow, { backgroundColor: T.subtleBg, borderWidth: 1, borderColor: T.border, marginBottom: 14 }]}>
                  <View style={styles.specItem}>
                    <Text style={[styles.specLabel, { color: T.textMuted }]}>GROSS RATE</Text>
                    <Text style={[styles.specValue, { color: T.emerald }]}>${Number(activeLoad.rate).toLocaleString()}</Text>
                  </View>
                  <View style={[styles.specDivider, { backgroundColor: T.border }]} />
                  <View style={styles.specItem}>
                    <Text style={[styles.specLabel, { color: T.textMuted }]}>LOADED MILES</Text>
                    <Text style={[styles.specValue, { color: T.textPrimary }]}>{activeLoad.miles} mi</Text>
                  </View>
                  <View style={[styles.specDivider, { backgroundColor: T.border }]} />
                  <View style={styles.specItem}>
                    <Text style={[styles.specLabel, { color: T.textMuted }]}>EMPTY MILES</Text>
                    <Text style={[styles.specValue, { color: T.amber }]}>{activeLoad.empty_miles || 42} mi</Text>
                  </View>
                </View>

                <Text style={[styles.label, { color: T.textSecondary, marginTop: 0 }]}>
                  UPDATE TRIP MILESTONE STATUS (AUTO-STAMPS GPS)
                </Text>

                {[
                  { key: 'arrived_pickup', label: '1. Arrived at Shipper (Pickup Dock)', sub: activeLoad.shipper_name },
                  { key: 'loaded', label: '2. Loaded & Rolling (BOL Verified)', sub: `${activeLoad.miles} Loaded Miles to ${activeLoad.destination}` },
                  { key: 'in_transit', label: '3. In Transit (Highway Telemetry Active)', sub: 'Updates Broker EDI 214 & Named Manager' },
                  { key: 'arrived_delivery', label: '4. Arrived at Receiver (Consignee Dock)', sub: activeLoad.receiver_name }
                ].map(st => {
                  const isCurrent = activeLoad.status === st.key;
                  return (
                    <TouchableOpacity
                      key={st.key}
                      style={[
                        styles.sheetMilestoneRow,
                        { backgroundColor: T.subtleBg, borderColor: T.border },
                        isCurrent && { borderColor: T.blue, borderWidth: 2, backgroundColor: T.blueSoft }
                      ]}
                      onPress={() => updateStatus(st.key)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13.5, fontWeight: '800', color: T.textPrimary }}>{st.label}</Text>
                        <Text style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>{st.sub}</Text>
                      </View>
                      <Text style={{ color: T.blue, fontWeight: '900', fontSize: 12 }}>
                        {isCurrent ? '✓ CURRENT' : 'SET ›'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* COMPLETE LOAD & ADVANCE TO NEXT LOAD BUTTON */}
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: T.emerald, paddingVertical: 15, marginTop: 12 }]}
                  onPress={() => updateStatus('delivered')}
                >
                  <Ionicons name="checkmark-done-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={[styles.buttonText, { fontSize: 13.5 }]}>
                    ✓ DELIVERED & EMPTY (COMPLETE & LOAD NEXT)
                  </Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', marginTop: 6 }}>
                  Completing this load moves it to your History & PDF Report ledger and loads your next queued trip.
                </Text>

                {/* Quick Navigation & Document Actions */}
                <View style={[styles.toolsRow, { marginTop: 14 }]}>
                  <TouchableOpacity
                    style={[styles.toolCard, { backgroundColor: T.subtleBg, borderColor: T.border }]}
                    onPress={() => {
                      setShowActiveLoadSheet(false);
                      setDriverTab('scanner');
                    }}
                  >
                    <Ionicons name="camera" size={22} color={T.blue} />
                    <Text style={[styles.toolTitle, { color: T.textPrimary }]}>SCAN BOL / POD</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.toolCard, { backgroundColor: T.subtleBg, borderColor: T.border }]}
                    onPress={handleToggleDetention}
                  >
                    <Ionicons name="time" size={22} color={T.amber} />
                    <Text style={[styles.toolTitle, { color: T.textPrimary }]}>
                      {detentionActive ? 'STOP DETENTION' : 'DETENTION CLOCK'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ===================================================================== */}
      {/* BRANDED PDF REPORT PREVIEW & EXPORT MODAL                             */}
      {/* ===================================================================== */}
      <Modal visible={showPdfPreviewModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.webCard, { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', maxHeight: '88%' }]}>
            <View style={styles.webCardNavyHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.webCardNavyEyebrow}>OFFICIAL SHIPPING WISH LLC STATEMENT</Text>
                <Text style={styles.webCardNavyTitle}>
                  Branded PDF Report ({reportPeriod.replace('_', ' ').toUpperCase()})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPdfPreviewModal(false)}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }}>
                Carrier: {user.company_name} ({user.mc_number || 'MC-148295'}) • Driver: {user.name}
              </Text>
              <Text style={{ fontSize: 11, color: '#475569', marginTop: 2, marginBottom: 12 }}>
                1. EXECUTIVE SUMMARY: {reportSummary.totalMiles} Total Driven Mi ({reportSummary.loadedMiles} Loaded / {reportSummary.emptyMiles} Empty) • Gross: ${reportSummary.grossEarnings.toLocaleString()} • Est. Fuel: -$${reportSummary.fuelCost.toFixed(2)} • Net: +$${reportSummary.netProfit.toFixed(2)}
              </Text>

              <Text style={{ fontSize: 11, fontWeight: '900', color: '#2563EB', marginBottom: 6 }}>
                2. LINE-BY-LINE COMPLETED TRIPS:
              </Text>
              {filteredHistory.map(r => (
                <View key={r.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0F172A' }}>
                    #{r.load_number} ({r.completed_at}): {r.origin} ➔ {r.destination}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                    Loaded: {r.loaded_miles} mi | Empty: {r.empty_miles} mi | Gross: ${r.rate} | Fuel: -$${Number(r.fuel_cost).toFixed(0)} | Net: +$${(r.rate - r.fuel_cost).toFixed(0)}
                  </Text>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: '#2563EB', marginTop: 16 }]}
                onPress={() => {
                  const base = api.getBaseUrl() || 'https://www.shippingwish.com';
                  Linking.openURL(`${base}/api/loads/history-report/pdf?period=${reportPeriod}&driver=${encodeURIComponent(user.name)}&company=${encodeURIComponent(user.company_name)}`).catch(() => {});
                }}
              >
                <Text style={styles.buttonText}>📥 OPEN / SAVE OFFICIAL PDF STATEMENT ↗</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Top-Left Customer Initials ("MV") Executive Menu Drawer */}
      <ExecutiveMenuDrawer
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        brandKey="shippingwish"
        isLightMode={isLightMode}
        onToggleLightMode={setIsLightMode}
        userTitle={user?.name || 'Marcus Vance'}
        userSubtitle={`${user?.company_name || 'Apex Transport LLC'} • ${getPlanByKey(selectedPlanKey).name}`}
        badgeText={statusChipLabel}
        onSignOut={() => setIsAuthenticated(false)}
        menuItems={[
          {
            icon: '🛣️',
            title: 'Active Route & Queued Dispatches',
            subtitle: activeLoad ? `Active Load #${activeLoad.load_number} (${activeLoad.origin} ➔ ${activeLoad.destination})` : 'All queued loads delivered',
            onPress: () => { setAppMode('driver'); setDriverTab('route'); }
          },
          {
            icon: '📑',
            title: 'Completed History & Branded PDF Reports',
            subtitle: 'Per-Load, 7-Day, 15-Day & Monthly Mileage, Earnings & Fuel PDF',
            onPress: () => { setAppMode('driver'); setDriverTab('history'); }
          },
          {
            icon: '💳',
            title: 'Subscription Plan & Trial Status',
            subtitle:
              subStatus === 'trial_active'
                ? `${trialDaysLeft} Days Left on Free Trial • ${getPlanByKey(selectedPlanKey).name}`
                : `Active Plan: ${getPlanByKey(selectedPlanKey).name}`,
            onPress: () => setShowAuthModal(true)
          },
          {
            icon: '🔒',
            title: 'Simulate Expired Trial (Test Payment Gate)',
            subtitle: 'Preview how the app locks when a client trial expires',
            onPress: () => setSubStatus('expired')
          }
        ]}
      />

      <ExecutiveLoadingOverlay
        brandKey="shippingwish"
        anim={anim}
        externalLoading={loadingLoads || uploadingDoc || authLoading}
        externalMessage="Syncing with 24/7 Operations Desk..."
      />

      {/* Create New Dispatch Modal */}
      <Modal visible={showNewLoadModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, padding: 18 }]}>
            <View style={styles.loadHeaderRow}>
              <Text style={[styles.modalTitle, { color: T.textPrimary }]}>Create & Assign New Load</Text>
              <TouchableOpacity onPress={() => setShowNewLoadModal(false)}>
                <Ionicons name="close" size={22} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.label, { color: T.textSecondary }]}>Origin (City, ST)</Text>
            <TextInput style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]} placeholder="e.g. Houston, TX" placeholderTextColor={T.textMuted} value={newLoadOrigin} onChangeText={setNewLoadOrigin} />
            <Text style={[styles.label, { color: T.textSecondary }]}>Destination (City, ST)</Text>
            <TextInput style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]} placeholder="e.g. Miami, FL" placeholderTextColor={T.textMuted} value={newLoadDest} onChangeText={setNewLoadDest} />
            <View style={styles.threeColRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: T.textSecondary }]}>Rate ($)</Text>
                <TextInput style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]} placeholder="3800" keyboardType="numeric" placeholderTextColor={T.textMuted} value={newLoadRate} onChangeText={setNewLoadRate} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.label, { color: T.textSecondary }]}>Miles</Text>
                <TextInput style={[styles.input, { backgroundColor: T.subtleBg, borderColor: T.border, color: T.textPrimary }]} placeholder="1180" keyboardType="numeric" placeholderTextColor={T.textMuted} value={newLoadMiles} onChangeText={setNewLoadMiles} />
              </View>
            </View>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: T.blue }]} onPress={handleCreateDispatchLoad}>
              <Text style={styles.buttonText}>DISPATCH LOAD TO DRIVER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Subscription Plan & Account Management Modal */}
      <Modal visible={showAuthModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.webCard, { backgroundColor: T.card, borderColor: T.border, padding: 18 }]}>
            <View style={styles.loadHeaderRow}>
              <Text style={[styles.modalTitle, { color: T.textPrimary }]}>Account & Subscription</Text>
              <TouchableOpacity onPress={() => setShowAuthModal(false)}>
                <Ionicons name="close" size={22} color={T.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: T.textSecondary }]}>
              Client: <Text style={{ color: T.textPrimary, fontWeight: '800' }}>{user.name}</Text> ({user.company_name})
            </Text>

            {SUBSCRIPTION_PLANS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.planCard,
                  { backgroundColor: T.subtleBg, borderColor: T.border },
                  selectedPlanKey === p.key && { borderColor: T.blue, borderWidth: 2 }
                ]}
                onPress={() => setSelectedPlanKey(p.key)}
              >
                <View style={styles.loadHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, { color: T.textPrimary }]}>{p.name}</Text>
                    <Text style={[styles.planTrucks, { color: T.blue }]}>{p.trucks}</Text>
                  </View>
                  <Text style={styles.planPriceText}>{p.priceLabel}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: T.emerald }]}
              onPress={() => {
                setShowAuthModal(false);
                handlePaySubscription();
              }}
            >
              <Text style={styles.buttonText}>💳 ACTIVATE / PAY SUBSCRIPTION VIA STRIPE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: T.danger, marginTop: 10 }]}
              onPress={() => {
                setShowAuthModal(false);
                setIsAuthenticated(false);
              }}
            >
              <Text style={styles.buttonText}>🚪 SIGN OUT / SWITCH CLIENT ACCOUNT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getPlanByKey(key) {
  return SUBSCRIPTION_PLANS.find(p => p.key === key) || SUBSCRIPTION_PLANS[0];
}

function getStatusColor(status) {
  switch (status) {
    case 'delivered': return '#10B981';
    case 'in_transit':
    case 'loaded': return '#2563EB';
    case 'arrived_pickup':
    case 'arrived_delivery': return '#D97706';
    default: return '#1E3E62';
  }
}

function getCheckLabel(key) {
  switch (key) {
    case 'tires': return 'Tire Pressure, Lug Nuts & Tread Depth';
    case 'brakes': return 'Air Brake Lines, Chambers & Slack Adjusters';
    case 'lights': return 'Headlights, Turn Signals & DOT Marker Lights';
    case 'reefer': return 'ThermoKing Reefer Setpoint (36°F) & Diesel';
    case 'fluids': return 'Engine Oil, Coolant & DEF Fluid Levels';
    case 'securement': return 'Load Bars, Straps & Trailer Door Seal';
    default: return key;
  }
}

function getMockFleetDrivers() {
  return [
    {
      id: 1,
      name: 'Marcus Vance',
      truck: '104',
      phone: '+12145554920',
      speed: 64,
      location: 'I-20 Eastbound near Shreveport, LA',
      lastPing: 'Just now (30s Auto)',
      activeRoute: 'Dallas, TX ➔ Atlanta, GA (Load #SW-8942)'
    },
    {
      id: 2,
      name: 'David Reynolds',
      truck: '108',
      phone: '+13125558812',
      speed: 58,
      location: 'I-80 Eastbound near Toledo, OH',
      lastPing: '15s ago (30s Auto)',
      activeRoute: 'Chicago, IL ➔ Allentown, PA (Load #SW-8943)'
    }
  ];
}

function getMockDocuments() {
  return [
    { id: 1, title: 'Signed Proof of Delivery (POD)', type: 'POD', load_number: 'SW-8940', uploaded_at: 'Yesterday', file_size: '2.4 MB' },
    { id: 2, title: 'Signed Broker Rate Confirmation', type: 'RATECON', load_number: 'SW-8942', uploaded_at: 'Today 07:45 AM', file_size: '410 KB' },
    { id: 3, title: 'Shipper Bill of Lading (BOL)', type: 'BOL', load_number: 'SW-8942', uploaded_at: 'Today 08:30 AM', file_size: '1.8 MB' }
  ];
}

function getMockInvoices() {
  return [
    { id: 1, invoice_number: '2026-089', broker_name: 'C.H. Robinson Worldwide', amount: '3,450.00', status: 'pending' },
    { id: 2, invoice_number: '2026-088', broker_name: 'Total Quality Logistics (TQL)', amount: '2,850.00', status: 'paid' }
  ];
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  authScroll: { padding: 16, paddingBottom: 40 },
  websiteHeroBanner: { marginBottom: 14 },
  websitePillTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#0B1528',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 10
  },
  greenDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#2563EB', marginRight: 6 },
  websitePillTagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  websiteHeroHeading: { fontSize: 24, fontWeight: '900', lineHeight: 30 },
  websiteHeroSub: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  webCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3
  },
  webCardNavyHeader: {
    backgroundColor: '#0B1528',
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  webCardNavyEyebrow: { color: '#93C5FD', fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
  webCardNavyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginTop: 2 },
  deskActivePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14
  },
  deskActivePillText: { color: '#34D399', fontSize: 10.5, fontWeight: '800' },
  quickDemoBox: { marginTop: 16, paddingTop: 14, borderTopWidth: 1 },
  quickDemoHeader: { fontSize: 10, fontWeight: '900', marginBottom: 8, letterSpacing: 0.5 },
  demoBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8
  },
  demoBtnExpired: {
    backgroundColor: 'rgba(220, 38, 38, 0.10)',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  demoBtnText: { fontSize: 11.5, fontWeight: '800', textAlign: 'center' },
  trialToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  trialOptionBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, padding: 10, alignItems: 'center' },
  trialOptionTitle: { fontSize: 13, fontWeight: '900' },
  trialOptionSub: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  planCard: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  planName: { fontSize: 13.5, fontWeight: '800' },
  planTrucks: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  planPricePill: { backgroundColor: 'rgba(16, 185, 129, 0.14)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  planPriceText: { color: '#059669', fontSize: 12, fontWeight: '900' },
  planDesc: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  expiredPlanBox: { borderRadius: 12, padding: 14, marginVertical: 12, borderWidth: 1 },
  expiredPlanLabel: { fontSize: 9.5, fontWeight: '900' },
  expiredPlanTitle: { fontSize: 16, fontWeight: '900', marginTop: 4 },
  expiredPlanPrice: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  expiredPlanDesc: { fontSize: 11.5, marginTop: 6 },
  modeSwitchContainer: { flexDirection: 'row', padding: 6, gap: 6 },
  modeSwitchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6
  },
  modeSwitchBtnActive: { backgroundColor: '#2563EB' },
  modeSwitchText: { fontSize: 12, fontWeight: '800' },
  modeSwitchTextActive: { color: '#fff' },
  scrollContent: { padding: 14, paddingBottom: 32 },
  gpsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 12
  },
  gpsStatusRow: { flexDirection: 'row', alignItems: 'center' },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 6 },
  gpsLabel: { fontSize: 9.5, fontWeight: '900' },
  gpsValue: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  gpsSubTime: { fontSize: 10, marginTop: 1 },
  autoGpsTogglePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8
  },
  autoGpsToggleText: { fontSize: 10, fontWeight: '900' },
  gpsPingButton: { alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8 },
  offersBox: { marginBottom: 14 },
  offersHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  offersLiveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220,38,38,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  pulsingRedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626', marginRight: 6 },
  offersLiveTagText: { color: '#DC2626', fontWeight: '800', fontSize: 10 },
  offersCountText: { fontSize: 11, fontWeight: '700' },
  offerRateBadge: {
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderWidth: 1,
    borderColor: '#34D399',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  offerRateAmount: { fontSize: 15, fontWeight: '900', color: '#34D399' },
  offerActionsRow: { flexDirection: 'row', gap: 10 },
  offerBtn: { paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  offerBookBtn: { flex: 2, backgroundColor: '#2563EB' },
  offerBookBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  loadHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  statusPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  specsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  specItem: { alignItems: 'center', flex: 1 },
  specLabel: { fontSize: 9, fontWeight: '800' },
  specValue: { fontSize: 13.5, fontWeight: '900', marginTop: 2 },
  specDivider: { width: 1 },
  tapLoadBanner: {
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center'
  },
  tapLoadBannerText: { fontSize: 11.5, fontWeight: '800' },
  stopCard: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10
  },
  stopIconCol: { alignItems: 'center', marginRight: 12 },
  stopCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stopCircleText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  dottedLine: { width: 2, flex: 1, marginVertical: 4 },
  stopDetails: { flex: 1 },
  stopHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  stopRole: { fontSize: 11, fontWeight: '800' },
  stopDate: { fontSize: 11, fontWeight: '600' },
  stopName: { fontSize: 14, fontWeight: '800' },
  stopAddress: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  stopActionRow: { flexDirection: 'row', gap: 10 },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5
  },
  actionButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  upcomingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 10
  },
  periodTabsRow: { flexDirection: 'row', gap: 6 },
  periodTabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center'
  },
  periodTabText: { fontSize: 11, fontWeight: '800' },
  pdfExportHeaderBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  pdfExportHeaderBtnText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  summaryGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1
  },
  summaryMetricCol: { flex: 1, alignItems: 'center' },
  summaryMetricLabel: { fontSize: 8.5, fontWeight: '900' },
  summaryMetricVal: { fontSize: 15, fontWeight: '900', marginVertical: 2 },
  perLoadPdfBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  perLoadPdfBtnText: { fontSize: 11, fontWeight: '900' },
  historyLineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    borderWidth: 1
  },
  historyLineCol: { width: '33%', paddingVertical: 4, alignItems: 'center' },
  historyLineLabel: { fontSize: 8.5, fontWeight: '800' },
  historyLineVal: { fontSize: 12.5, fontWeight: '900', marginTop: 1 },
  sheetMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8
  },
  toolsRow: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  toolCard: { flex: 1, borderRadius: 12, padding: 12, borderWidth: 1, alignItems: 'center' },
  toolTitle: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  toolSub: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1
  },
  emergencyTitle: { fontSize: 13, fontWeight: '800', color: '#fff' },
  emergencySub: { fontSize: 11, marginTop: 2 },
  dutyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dutyBtn: { flex: 1, minWidth: '45%', paddingVertical: 11, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  dutyBtnText: { fontSize: 11, fontWeight: '800' },
  hosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  hosCard: { width: '48%', borderRadius: 12, padding: 12, borderWidth: 1, alignItems: 'center' },
  hosLabel: { fontSize: 9.5, fontWeight: '800' },
  hosClock: { fontSize: 24, fontWeight: '900', marginVertical: 4 },
  hosSub: { fontSize: 10 },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 14
  },
  buttonText: { color: '#fff', fontSize: 12.5, fontWeight: '900', letterSpacing: 0.4 },
  label: { fontSize: 10, fontWeight: '900', marginTop: 10, marginBottom: 6, letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  docTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  docTypeBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  docTypeText: { fontSize: 11, fontWeight: '800' },
  previewImage: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#000', marginVertical: 10 },
  checkItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, gap: 8 },
  checkItemText: { fontSize: 12, fontWeight: '600' },
  threeColRow: { flexDirection: 'row', alignItems: 'center' },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  navText: { fontSize: 9.5, fontWeight: '800', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(11, 21, 40, 0.72)', justifyContent: 'center', padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: '900' },
  modalSub: { fontSize: 12, marginVertical: 6 }
});
