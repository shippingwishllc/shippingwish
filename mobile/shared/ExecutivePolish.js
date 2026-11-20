// mobile/shared/ExecutivePolish.js
// Bespoke Corporate Opening Animations, Processing Loaders, Live Tickers & Top Executive Menu Drawers
// Each of the 4 Shipping Wish Portfolio Apps has a completely distinct visual geometry & corporate identity.

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

export const BRAND_PROFILES = {
  shippingwish: {
    id: 'shippingwish',
    title: 'ShippingWish',
    subtitle: '24/7 OPERATIONS DESK & FLEET TMS',
    tagline: 'WE WORK AS YOUR STAFF.',
    estLine: 'Named Fleet Operations Manager • First Week $0 • Lower 48',
    monogram: 'SW',
    emblemSub: 'ELD 58',
    tickerLeft: '● Named Manager  •  ● You Approve Loads',
    tickerRight: '● No Cut of Load  •  ● TMS Included',
    steps: [
      'Connecting to Shipping Wish 24/7 Operations Desk...',
      'Syncing FMCSA ELD Clocks, Dispatches & DAT Offers...',
      'Desk Active • Welcome to Shipping Wish'
    ],
    dark: {
      bg: '#040A14',
      card: '#0B1628',
      border: '#1D3557',
      primary: '#2563EB',
      secondary: '#F59E0B',
      text: '#F8FAFC',
      muted: '#94A3B8',
      badgeBg: 'rgba(37, 99, 235, 0.16)'
    },
    light: {
      bg: '#F8FAFC',
      card: '#FFFFFF',
      border: '#E2E8F0',
      primary: '#2563EB',
      secondary: '#D97706',
      text: '#0F172A',
      muted: '#475569',
      badgeBg: 'rgba(37, 99, 235, 0.10)'
    }
  },

  loadsnexus: {
    id: 'loadsnexus',
    title: 'LOADS NEXUS',
    subtitle: '50-STATE SPOT FREIGHT & CAPACITY EXCHANGE',
    tagline: 'DIRECT SHIPPERS. ZERO DOUBLE-BROKERING.',
    estLine: '$75,000 BMC-84 Bond Watchdog • Instant RateCon Lock',
    monogram: 'LNX',
    emblemSub: 'A+ DTP',
    tickerLeft: '📈 SPOT INDEX: $3.84/MI ▲ +4.2%',
    tickerRight: '🛡️ ANTI-DOUBLE BROKER LOCK',
    steps: [
      'Initializing 50-State Institutional Load Exchange...',
      'Verifying Carrier MC/DOT & $75k BMC-84 Surety Bonds...',
      'Exchange Floor Live • Welcome to Loads Nexus'
    ],
    dark: {
      bg: '#060F0D',
      card: '#0D1F1B',
      border: '#1B4332',
      primary: '#10B981',
      secondary: '#8B5CF6',
      text: '#ECFDF5',
      muted: '#A7F3D0',
      badgeBg: 'rgba(16, 185, 129, 0.16)'
    },
    light: {
      bg: '#F2FBF7',
      card: '#FFFFFF',
      border: '#BBF7D0',
      primary: '#059669',
      secondary: '#6D28D9',
      text: '#064E3B',
      muted: '#047857',
      badgeBg: 'rgba(5, 150, 105, 0.12)'
    }
  },

  buywish: {
    id: 'buywish',
    title: 'BUYWISHONLINE',
    subtitle: 'HAUTE CURATION & GLOBAL E-COMMERCE MAISON',
    tagline: 'CURATED LUXURY. EXPRESS GLOBAL DELIVERY.',
    estLine: 'Direct Tracked Fulfillment • United States · Canada · UK',
    monogram: 'BWO',
    emblemSub: 'MAISON',
    tickerLeft: '✨ CODE WELCOME10: 10% OFF',
    tickerRight: '✈️ EXPRESS SHIPPING: USA · CA · UK',
    steps: [
      'Opening BuyWishOnline Private Showroom Edit...',
      'Syncing Live Zendrop Express Inventory (USA · CA · UK)...',
      'Showroom Unlocked • Welcome to BuyWishOnline'
    ],
    dark: {
      bg: '#14110F',
      card: '#1F1A17',
      border: '#3D322A',
      primary: '#D4AF37',
      secondary: '#C4A574',
      text: '#FAF6F0',
      muted: '#C2B5A6',
      badgeBg: 'rgba(212, 175, 55, 0.16)'
    },
    light: {
      bg: '#F6F1E8',
      card: '#FFFDF8',
      border: '#E5D7C3',
      primary: '#9A6F28',
      secondary: '#14120F',
      text: '#14120F',
      muted: '#6F675E',
      badgeBg: 'rgba(196, 165, 116, 0.22)'
    }
  },

  nyclimo: {
    id: 'nyclimo',
    title: 'NYC LIMO WISH',
    subtitle: 'FIFTH AVENUE VIP CHAUFFEUR & PRIVATE JET CONCIERGE',
    tagline: 'WHITE-GLOVE CHAUFFEURS. ON-TIME EVERY FLIGHT.',
    estLine: 'NYC TLC Licensed Fleet • JFK · LGA · EWR · TEB · Manhattan',
    monogram: '👑',
    emblemSub: 'VIP TLC',
    tickerLeft: '✈️ FAA FLIGHT RADAR: ACTIVE',
    tickerRight: '🥂 99.8% SLA • JFK · LGA · EWR · TEB',
    steps: [
      'Connecting to Manhattan Fifth Ave Chauffeur Concierge...',
      'Syncing FAA Live Flight Radar & Maybach/Escalade Fleet...',
      'Your Private Chauffeur Awaits • NYC Limo Wish'
    ],
    dark: {
      bg: '#070709',
      card: '#121217',
      border: '#2E2614',
      primary: '#D89F25',
      secondary: '#F5D061',
      text: '#F8FAFC',
      muted: '#A1A1AA',
      badgeBg: 'rgba(216, 159, 37, 0.18)'
    },
    light: {
      bg: '#F8F6F0',
      card: '#FFFFFF',
      border: '#E5DEC9',
      primary: '#B47D12',
      secondary: '#18181B',
      text: '#09090B',
      muted: '#52525B',
      badgeBg: 'rgba(180, 125, 18, 0.14)'
    }
  }
};

// Extract 1-2 character Customer / Company Initials (e.g. "Marcus Vance" -> "MV")
export function getCustomerInitials(rawName, fallback = 'SW') {
  if (!rawName || typeof rawName !== 'string') return fallback;
  const clean = rawName.split('•')[0].trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function useExecutiveAnimations(activeTabKey) {
  const [isBooting, setIsBooting] = useState(true);
  const [bootIdx, setBootIdx] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Syncing with Live Cloud Server...');

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.78)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;
  const reverseSpin = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(0.94)).current;
  const bootProgress = useRef(new Animated.Value(0)).current;

  const tabFade = useRef(new Animated.Value(1)).current;
  const tabSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin1 = Animated.loop(
      Animated.timing(ringSpin, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    const spin2 = Animated.loop(
      Animated.timing(reverseSpin, {
        toValue: 1,
        duration: 4400,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.09,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulseScale, {
          toValue: 0.93,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    spin1.start();
    spin2.start();
    pulse.start();

    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 48,
        useNativeDriver: true
      }),
      Animated.timing(bootProgress, {
        toValue: 1,
        duration: 1850,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false
      })
    ]).start();

    const t1 = setTimeout(() => setBootIdx(1), 600);
    const t2 = setTimeout(() => setBootIdx(2), 1250);
    const t3 = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 360,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true
      }).start(() => setIsBooting(false));
    }, 1900);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      spin1.stop();
      spin2.stop();
      pulse.stop();
    };
  }, []);

  useEffect(() => {
    tabFade.setValue(0.28);
    tabSlide.setValue(12);
    Animated.parallel([
      Animated.timing(tabFade, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true
      }),
      Animated.timing(tabSlide, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true
      })
    ]).start();
  }, [activeTabKey]);

  const runWithLoader = async (msg, fn) => {
    setProcessingMessage(msg || 'Syncing Live Data...');
    setIsProcessing(true);
    const minWait = new Promise(r => setTimeout(r, 500));
    try {
      const [res] = await Promise.all([Promise.resolve(fn ? fn() : null), minWait]);
      return res;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isBooting,
    bootIdx,
    isProcessing,
    processingMessage,
    splashOpacity,
    logoScale,
    ringSpin,
    reverseSpin,
    pulseScale,
    bootProgress,
    tabFade,
    tabSlide,
    runWithLoader
  };
}

export function ExecutiveTopBar({
  brandKey,
  isLightMode,
  userLabel,
  companyLabel,
  verifiedLabel,
  rightStatusLabel,
  rightStatusSub,
  onOpenMenu,
  onRightPress
}) {
  const brand = BRAND_PROFILES[brandKey] || BRAND_PROFILES.shippingwish;
  const palette = isLightMode ? brand.light : brand.dark;
  const customerInitials = getCustomerInitials(userLabel, brand.monogram);

  const isSwLight = brandKey === 'shippingwish' && isLightMode;
  const headerBg = isSwLight ? '#0B1528' : palette.card;
  const headerBorder = isSwLight ? '#1E293B' : palette.border;
  const primaryTextOnHeader = isSwLight ? '#FFFFFF' : palette.text;
  const mutedTextOnHeader = isSwLight ? '#94A3B8' : palette.muted;

  return (
    <View>
      <View
        style={[
          styles.topHeader,
          { backgroundColor: headerBg, borderBottomColor: headerBorder }
        ]}
      >
        <View style={styles.headerLeft}>
          {/* Prominent Customer Initials Avatar + Menu Badge (Just like Wahid Jewellers & ShippingWish Website!) */}
          <TouchableOpacity
            style={[
              styles.avatarMenuBtn,
              {
                backgroundColor: isSwLight ? '#2563EB' : palette.primary,
                borderColor: isSwLight ? '#60A5FA' : palette.secondary,
                borderRadius: brandKey === 'loadsnexus' || brandKey === 'shippingwish' ? 14 : 23
              }
            ]}
            activeOpacity={0.78}
            onPress={onOpenMenu}
          >
            <Text
              style={[
                styles.avatarMenuText,
                { color: brandKey === 'nyclimo' && !isLightMode ? '#040A14' : '#FFFFFF' }
              ]}
            >
              {customerInitials}
            </Text>
            <View
              style={[
                styles.avatarCornerMenuBadge,
                {
                  backgroundColor: isSwLight ? '#0B1528' : palette.card,
                  borderColor: isSwLight ? '#F59E0B' : palette.primary
                }
              ]}
            >
              <Text style={[styles.avatarCornerMenuIcon, { color: isSwLight ? '#F59E0B' : palette.primary }]}>☰</Text>
            </View>
          </TouchableOpacity>

          {/* Center Column: Brand + Prominent Customer / Company Name + Non-overlapping Verified Pill */}
          <TouchableOpacity style={styles.centerTextCol} activeOpacity={0.8} onPress={onOpenMenu}>
            <View style={styles.titleAndBadgeRow}>
              {brandKey === 'shippingwish' ? (
                <Text style={[styles.brandHeaderTitle, { color: '#FFFFFF' }]} numberOfLines={1}>
                  Shipping<Text style={{ color: '#F59E0B' }}>Wish</Text>
                </Text>
              ) : (
                <Text style={[styles.brandHeaderTitle, { color: palette.primary }]} numberOfLines={1}>
                  {brand.title}
                </Text>
              )}
              {verifiedLabel ? (
                <View
                  style={[
                    styles.verifiedChip,
                    {
                      backgroundColor: isSwLight ? 'rgba(16, 185, 129, 0.16)' : palette.badgeBg,
                      borderColor: isSwLight ? 'rgba(16, 185, 129, 0.45)' : palette.primary
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.verifiedChipText,
                      { color: isSwLight ? '#34D399' : palette.primary }
                    ]}
                    numberOfLines={1}
                  >
                    {verifiedLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.userProminentName, { color: primaryTextOnHeader }]} numberOfLines={1} ellipsizeMode="tail">
              {userLabel || 'Executive Client'}
            </Text>

            {companyLabel ? (
              <Text style={[styles.companySubText, { color: mutedTextOnHeader }]} numberOfLines={1} ellipsizeMode="tail">
                {companyLabel}
              </Text>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Right Telemetry / Sync Box (Fixed width so it NEVER overlaps center text!) */}
        <TouchableOpacity
          style={[
            styles.liveRightPill,
            {
              backgroundColor: isSwLight ? '#2563EB' : palette.badgeBg,
              borderColor: isSwLight ? '#3B82F6' : palette.primary
            }
          ]}
          activeOpacity={0.75}
          onPress={onRightPress}
        >
          <View style={styles.liveDotRow}>
            <View style={[styles.livePulseDot, { backgroundColor: isSwLight ? '#34D399' : '#10B981' }]} />
            <Text style={[styles.livePillTitle, { color: isSwLight ? '#FFFFFF' : palette.primary }]} numberOfLines={1}>
              {rightStatusLabel || 'LIVE CLOUD'}
            </Text>
          </View>
          <Text style={[styles.livePillSub, { color: isSwLight ? '#DBEAFE' : palette.muted }]} numberOfLines={1}>
            {rightStatusSub || 'Sync ↻'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Clean Telemetry / Market / Editorial Ticker Strip (No tiny MENU clutter at end!) */}
      <View
        style={[
          styles.tickerBar,
          {
            backgroundColor: isSwLight ? '#111C35' : isLightMode ? palette.bg : '#03070E',
            borderBottomColor: headerBorder
          }
        ]}
      >
        <Text style={[styles.tickerLeftText, { color: isSwLight ? '#F59E0B' : palette.primary }]} numberOfLines={1}>
          {brand.tickerLeft}
        </Text>
        <Text style={[styles.tickerRightText, { color: isSwLight ? '#CBD5E1' : palette.muted }]} numberOfLines={1}>
          {brand.tickerRight}
        </Text>
      </View>
    </View>
  );
}

export function ExecutiveMenuDrawer({
  visible,
  onClose,
  brandKey,
  isLightMode,
  onToggleLightMode,
  userTitle,
  userSubtitle,
  badgeText,
  menuItems = [],
  onSignOut
}) {
  const brand = BRAND_PROFILES[brandKey] || BRAND_PROFILES.shippingwish;
  const palette = isLightMode ? brand.light : brand.dark;
  const initials = getCustomerInitials(userTitle, brand.monogram);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.drawerOverlay}>
        <View
          style={[
            styles.drawerCard,
            { backgroundColor: palette.card, borderColor: palette.primary }
          ]}
        >
          <View style={[styles.drawerHeader, { borderBottomColor: palette.border }]}>
            <View>
              <Text style={[styles.drawerEyebrow, { color: palette.primary }]}>{brand.subtitle}</Text>
              <Text style={[styles.drawerTitle, { color: palette.text }]}>Account, Subscription & Menu</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeBtnText, { color: palette.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Executive Account Profile Card with Customer Initials */}
            <View
              style={[
                styles.profileBanner,
                { backgroundColor: palette.bg, borderColor: palette.border }
              ]}
            >
              <View style={[styles.profileBadge, { backgroundColor: palette.primary }]}>
                <Text style={styles.profileBadgeText}>{initials}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.profileName, { color: palette.text }]} numberOfLines={1}>
                  {userTitle}
                </Text>
                <Text style={[styles.profileSub, { color: palette.muted }]} numberOfLines={2}>
                  {userSubtitle}
                </Text>
              </View>
              {badgeText ? (
                <View style={[styles.verifiedChip, { backgroundColor: palette.badgeBg, borderColor: palette.primary }]}>
                  <Text style={[styles.verifiedChipText, { color: palette.primary }]}>{badgeText}</Text>
                </View>
              ) : null}
            </View>

            {/* Dual Theme Switcher (Dark Corporate vs Daylight / Ivory Theme) */}
            <View
              style={[
                styles.drawerRow,
                { backgroundColor: palette.bg, borderColor: palette.border }
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.drawerRowTitle, { color: palette.text }]}>
                  {isLightMode ? '☀️ Executive Daylight / Ivory Theme' : '🌙 Signature Dark Corporate Theme'}
                </Text>
                <Text style={[styles.drawerRowSub, { color: palette.muted }]}>
                  Instant high-contrast corporate appearance toggle
                </Text>
              </View>
              <Switch
                value={isLightMode}
                onValueChange={onToggleLightMode}
                trackColor={{ false: '#334155', true: palette.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Quick Navigation & Action Items */}
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.drawerRow,
                  { backgroundColor: palette.bg, borderColor: palette.border }
                ]}
                onPress={() => {
                  onClose();
                  if (item.onPress) item.onPress();
                }}
              >
                <Text style={{ fontSize: 18, marginRight: 12 }}>{item.icon || '⚡'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.drawerRowTitle, { color: palette.text }]}>{item.title}</Text>
                  <Text style={[styles.drawerRowSub, { color: palette.muted }]}>{item.subtitle}</Text>
                </View>
                <Text style={[styles.chevron, { color: palette.primary }]}>›</Text>
              </TouchableOpacity>
            ))}

            {/* 24/7 Support */}
            <TouchableOpacity
              style={[
                styles.drawerRow,
                { backgroundColor: palette.bg, borderColor: palette.border }
              ]}
              onPress={() => Linking.openURL('tel:+19177370021')}
            >
              <Text style={{ fontSize: 18, marginRight: 12 }}>📞</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.drawerRowTitle, { color: palette.text }]}>
                  24/7 Executive Support Desk
                </Text>
                <Text style={[styles.drawerRowSub, { color: palette.muted }]}>
                  +1 (917) 737-0021 • Live Vercel Cloud Connected
                </Text>
              </View>
              <Text style={[styles.chevron, { color: palette.primary }]}>›</Text>
            </TouchableOpacity>

            {/* Sign Out Button if provided */}
            {onSignOut ? (
              <TouchableOpacity
                style={[
                  styles.drawerRow,
                  { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: '#EF4444', marginTop: 4 }
                ]}
                onPress={() => {
                  onClose();
                  onSignOut();
                }}
              >
                <Text style={{ fontSize: 18, marginRight: 12 }}>🚪</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.drawerRowTitle, { color: '#F87171' }]}>
                    Sign Out / Switch Client Account
                  </Text>
                  <Text style={[styles.drawerRowSub, { color: palette.muted }]}>
                    Log in with another ERP client account or register a new trial
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: '#F87171' }]}>›</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Dedicated Full-Screen Launch Screen (shown BEFORE the main app renders so the dashboard never flashes underneath!)
export function ExecutiveLaunchScreen({ brandKey, anim }) {
  const brand = BRAND_PROFILES[brandKey] || BRAND_PROFILES.shippingwish;
  const palette = brand.dark;

  const spinDeg = anim.ringSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });
  const revSpinDeg = anim.reverseSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg']
  });
  const progressWidth = anim.bootProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['10%', '100%']
  });

  return (
    <SafeAreaView style={[styles.launchContainer, { backgroundColor: palette.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={palette.bg} />
      <Animated.View style={[styles.splashContent, { opacity: anim.splashOpacity, transform: [{ scale: anim.logoScale }] }]}>
        {/* BRAND 1: SHIPPING WISH — SATELLITE RADAR TELEMETRY ORBIT */}
        {brandKey === 'shippingwish' && (
          <View style={styles.dialBox}>
            <Animated.View
              style={[
                styles.swOuterRadar,
                { borderColor: 'rgba(6, 182, 212, 0.35)', transform: [{ scale: anim.pulseScale }] }
              ]}
            />
            <Animated.View
              style={[
                styles.swRotatingOrbit,
                { borderColor: palette.primary, borderTopColor: palette.secondary, transform: [{ rotate: spinDeg }] }
              ]}
            />
            <Animated.View
              style={[
                styles.swInnerCompass,
                { borderColor: palette.secondary, transform: [{ rotate: revSpinDeg }] }
              ]}
            />
            <View style={[styles.coreBadgeCircle, { backgroundColor: '#0B1628', borderColor: palette.primary }]}>
              <Text style={{ fontSize: 22 }}>🚛</Text>
              <Text style={[styles.coreMonogram, { color: palette.primary }]}>SW•TMS</Text>
            </View>
          </View>
        )}

        {/* BRAND 2: LOADS NEXUS — ROTATING DIAMOND EXCHANGE MATRIX */}
        {brandKey === 'loadsnexus' && (
          <View style={styles.dialBox}>
            <Animated.View
              style={[
                styles.lnxDiamondOuter,
                { borderColor: 'rgba(16, 185, 129, 0.4)', transform: [{ rotate: spinDeg }, { scale: anim.pulseScale }] }
              ]}
            />
            <Animated.View
              style={[
                styles.lnxDiamondInner,
                { borderColor: palette.secondary, transform: [{ rotate: revSpinDeg }] }
              ]}
            />
            <View style={[styles.lnxCoreSquare, { backgroundColor: '#0D1F1B', borderColor: palette.primary }]}>
              <Text style={[styles.coreMonogram, { color: palette.primary, fontSize: 20 }]}>LNX</Text>
              <Text style={{ color: '#A7F3D0', fontSize: 9, fontWeight: '800' }}>50-STATE BOARD</Text>
            </View>
          </View>
        )}

        {/* BRAND 3: BUY WISH ONLINE — PARISIAN HAUTE COUTURE MEDALLION */}
        {brandKey === 'buywish' && (
          <View style={styles.dialBox}>
            <Animated.View
              style={[
                styles.bwoArchHalo,
                { borderColor: 'rgba(212, 175, 55, 0.38)', transform: [{ scale: anim.pulseScale }] }
              ]}
            />
            <Animated.View
              style={[
                styles.bwoGoldRing,
                { borderColor: palette.primary, transform: [{ rotate: spinDeg }] }
              ]}
            />
            <View style={[styles.bwoCoreMedallion, { backgroundColor: '#1F1A17', borderColor: palette.primary }]}>
              <Text style={{ fontSize: 20 }}>🛍️</Text>
              <Text style={[styles.coreMonogram, { color: palette.primary, letterSpacing: 2 }]}>BWO</Text>
              <Text style={{ color: '#C4A574', fontSize: 8, fontWeight: '800' }}>USA · CA · UK</Text>
            </View>
          </View>
        )}

        {/* BRAND 4: NYC LIMO WISH — MANHATTAN 24K GOLD CHRONOGRAPH DIAL */}
        {brandKey === 'nyclimo' && (
          <View style={styles.dialBox}>
            <Animated.View
              style={[
                styles.limoChronoOuter,
                { borderColor: 'rgba(216, 159, 37, 0.35)', transform: [{ scale: anim.pulseScale }] }
              ]}
            />
            <Animated.View
              style={[
                styles.limoChronoBezel,
                { borderColor: palette.primary, borderBottomColor: '#F5D061', transform: [{ rotate: spinDeg }] }
              ]}
            />
            <Animated.View
              style={[
                styles.limoInnerRing,
                { borderColor: '#F5D061', transform: [{ rotate: revSpinDeg }] }
              ]}
            />
            <View style={[styles.coreBadgeCircle, { backgroundColor: '#121217', borderColor: palette.primary }]}>
              <Text style={{ fontSize: 22 }}>👑</Text>
              <Text style={[styles.coreMonogram, { color: palette.primary }]}>NYC VIP</Text>
            </View>
          </View>
        )}

        <Text style={[styles.splashBrandName, { color: palette.primary }]}>{brand.title}</Text>
        <Text style={[styles.splashTagline, { color: palette.text }]}>{brand.tagline}</Text>
        <Text style={[styles.splashMaisonSub, { color: palette.muted }]}>{brand.estLine}</Text>

        <View style={[styles.splashProgressTrack, { borderColor: palette.border }]}>
          <Animated.View
            style={[
              styles.splashProgressBar,
              { width: progressWidth, backgroundColor: palette.primary }
            ]}
          />
        </View>

        <View style={styles.splashStatusRow}>
          <ActivityIndicator size="small" color={palette.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.splashStatusText, { color: palette.text }]}>
            {brand.steps[anim.bootIdx] || brand.steps[0]}
          </Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// Processing / Syncing Loader Overlay (shown when refreshing or performing actions inside the app)
export function ExecutiveLoadingOverlay({ brandKey, anim, externalLoading = false, externalMessage = '' }) {
  if (!anim.isProcessing && !externalLoading) return null;

  const brand = BRAND_PROFILES[brandKey] || BRAND_PROFILES.shippingwish;
  const palette = brand.dark;

  const spinDeg = anim.ringSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <View style={styles.processingOverlay}>
      <View style={[styles.processingCard, { backgroundColor: palette.card, borderColor: palette.primary }]}>
        <View style={styles.loaderRingWrapper}>
          <Animated.View
            style={[
              styles.loaderOuterRing,
              {
                borderColor: palette.primary,
                borderTopColor: 'transparent',
                borderRadius: brandKey === 'loadsnexus' ? 14 : 44,
                transform: [{ rotate: spinDeg }]
              }
            ]}
          />
          <Animated.View
            style={[
              styles.loaderInnerEmblem,
              {
                backgroundColor: palette.badgeBg,
                borderColor: palette.secondary,
                borderRadius: brandKey === 'loadsnexus' ? 10 : 30,
                transform: [{ scale: anim.pulseScale }]
              }
            ]}
          >
            <Text style={[styles.loaderEmblemText, { color: palette.primary }]}>{brand.monogram}</Text>
          </Animated.View>
        </View>
        <Text style={[styles.processingTitle, { color: palette.primary }]}>{brand.title}</Text>
        <Text style={[styles.processingSubtitle, { color: palette.text }]}>
          {externalLoading ? externalMessage || 'Loading Live Cloud Data...' : anim.processingMessage}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10
  },
  avatarMenuBtn: {
    width: 46,
    height: 46,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    position: 'relative'
  },
  avatarMenuText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  avatarCornerMenuBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarCornerMenuIcon: {
    fontSize: 9,
    fontWeight: '900'
  },
  centerTextCol: {
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  titleAndBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap'
  },
  brandHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    flexShrink: 1
  },
  userProminentName: {
    fontSize: 13.5,
    fontWeight: '800',
    marginTop: 1
  },
  companySubText: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1
  },
  verifiedChip: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    flexShrink: 0
  },
  verifiedChipText: {
    fontSize: 8,
    fontWeight: '900'
  },
  liveRightPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'flex-end',
    flexShrink: 0
  },
  liveDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  livePillTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4
  },
  livePillSub: {
    fontSize: 8.5,
    fontWeight: '700',
    marginTop: 2
  },
  tickerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1
  },
  tickerLeftText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  tickerRightText: {
    fontSize: 9.5,
    fontWeight: '700'
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end'
  },
  drawerCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 2,
    padding: 18,
    maxHeight: '86%'
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1
  },
  drawerEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2
  },
  closeBtn: {
    padding: 6
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '800'
  },
  profileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10
  },
  profileBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileBadgeText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900'
  },
  profileName: {
    fontSize: 15,
    fontWeight: '900'
  },
  profileSub: {
    fontSize: 11,
    marginTop: 2
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8
  },
  drawerRowTitle: {
    fontSize: 13.5,
    fontWeight: '800'
  },
  drawerRowSub: {
    fontSize: 11,
    marginTop: 2
  },
  chevron: {
    fontSize: 20,
    fontWeight: '800',
    marginLeft: 8
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 9, 18, 0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999
  },
  processingCard: {
    width: 290,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center'
  },
  loaderRingWrapper: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  loaderOuterRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderWidth: 3
  },
  loaderInnerEmblem: {
    width: 58,
    height: 58,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loaderEmblemText: {
    fontSize: 15,
    fontWeight: '900'
  },
  processingTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 4
  },
  processingSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17
  },
  launchContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28
  },
  splashContent: {
    alignItems: 'center',
    width: '100%'
  },
  dialBox: {
    width: 148,
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22
  },
  swOuterRadar: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: 71,
    borderWidth: 1.5
  },
  swRotatingOrbit: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderStyle: 'dashed'
  },
  swInnerCompass: {
    position: 'absolute',
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 1.5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent'
  },
  lnxDiamondOuter: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 16,
    borderWidth: 2.5
  },
  lnxDiamondInner: {
    position: 'absolute',
    width: 98,
    height: 98,
    borderRadius: 12,
    borderWidth: 2
  },
  lnxCoreSquare: {
    width: 78,
    height: 78,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bwoArchHalo: {
    position: 'absolute',
    width: 138,
    height: 138,
    borderRadius: 69,
    borderWidth: 1.5
  },
  bwoGoldRing: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2.5,
    borderTopColor: 'transparent'
  },
  bwoCoreMedallion: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  limoChronoOuter: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 1.5
  },
  limoChronoBezel: {
    position: 'absolute',
    width: 122,
    height: 122,
    borderRadius: 61,
    borderWidth: 3.5,
    borderLeftColor: 'transparent'
  },
  limoInnerRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderStyle: 'dashed'
  },
  coreBadgeCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  coreMonogram: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2
  },
  splashBrandName: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center'
  },
  splashTagline: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 6,
    textAlign: 'center'
  },
  splashMaisonSub: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center'
  },
  splashProgressTrack: {
    width: '82%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 24,
    borderWidth: 1
  },
  splashProgressBar: {
    height: '100%',
    borderRadius: 4
  },
  splashStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14
  },
  splashStatusText: {
    fontSize: 11.5,
    fontWeight: '700'
  }
});
