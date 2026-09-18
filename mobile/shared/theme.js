// mobile/shared/theme.js
// Enterprise Dark Logistics Theme for LoadNexus & Shipping Wish Mobile Apps

export const COLORS = {
  primary: '#0B192C',        // Deep Navy / Midnight Executive
  primaryLight: '#1E3E62',   // Corporate Steel Blue
  accent: '#3B82F6',         // Modern Tech Indigo Blue
  accentHover: '#2563EB',
  success: '#10B981',        // Emerald Status Green (Verified / Loaded / Delivered)
  warning: '#F59E0B',        // Amber Status Warning (In Transit / Pending)
  danger: '#EF4444',         // Alert / Cancelled / High Risk
  cardBg: '#132036',         // Card surface color
  cardBorder: '#233854',     // Subdued borders
  background: '#070F1E',     // App dark background
  surface: '#1A2942',        // Surface highlight
  textPrimary: '#F8FAFC',    // Pure high-contrast white
  textSecondary: '#94A3B8',  // Subtitle / Label muted gray
  textMuted: '#64748B',      // Inactive / Placeholder gray
  gold: '#FBBF24',           // High-tier trust / rating badges
  purple: '#8B5CF6'          // Analytics / Broker score highlights
};

export const TYPOGRAPHY = {
  header: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.5
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textSecondary,
    lineHeight: 20
  },
  caption: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  }
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 3
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6
  }
};

export default { COLORS, TYPOGRAPHY, SHADOWS };
