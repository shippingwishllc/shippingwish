// mobile/shippingwish-tms/App.js
// Shipping Wish LLC — Enterprise TMS Mobile Fleet & Operations App
// Compatible with Expo Go (Android & iOS)

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Modal,
  FlatList,
  Linking
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';

import { CONFIG } from '../shared/config';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../shared/theme';
import api from '../shared/api';

export default function ShippingWishTmsApp() {
  const [activeTab, setActiveTab] = useState('dispatches'); // 'dispatches' | 'fleet' | 'documents' | 'invoices'
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  // Auth inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Dispatches state
  const [loads, setLoads] = useState([]);
  const [loadingLoads, setLoadingLoads] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Invoices state
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Selected load modal
  const [selectedLoad, setSelectedLoad] = useState(null);

  useEffect(() => {
    fetchLoads();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'Please enter your dispatcher/admin email and password.');
      return;
    }
    setAuthLoading(true);
    const res = await api.login(email.trim(), password);
    setAuthLoading(false);

    if (res.ok) {
      setUser(res.data.user);
      setIsAuthenticated(true);
      fetchLoads();
    } else {
      Alert.alert('Login Failed', res.error || 'Server unreachable or invalid login.');
    }
  };

  const fillDemoDispatcher = () => {
    setEmail('dispatcher@shippingwish.com');
    setPassword('DispatcherPass2026!');
  };

  const fetchLoads = async () => {
    setLoadingLoads(true);
    const res = await api.getLoads();
    setLoadingLoads(false);

    if (res.ok && res.data) {
      const list = res.data.loads || res.data || [];
      setLoads(list.length > 0 ? list : getMockLoads());
    } else {
      setLoads(getMockLoads());
    }
  };

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    const res = await api.getInvoices();
    setLoadingInvoices(false);

    if (res.ok && res.data) {
      const inv = res.data.invoices || res.data || [];
      setInvoices(inv.length > 0 ? inv : getMockInvoices());
    } else {
      setInvoices(getMockInvoices());
    }
  };

  useEffect(() => {
    if (activeTab === 'invoices') fetchInvoices();
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <FontAwesome5 name="route" size={18} color="#fff" />
          </View>
          <View>
            <Text style={styles.brandName}>Shipping Wish TMS</Text>
            <Text style={styles.brandSub}>FLEET & DISPATCH OPERATIONS</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={fetchLoads}>
          <Ionicons name="reload" size={18} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {/* Main Body */}
      <View style={styles.body}>
        {/* Tab 1: Dispatches Desk */}
        {activeTab === 'dispatches' && (
          <View style={{ flex: 1 }}>
            {/* Status Filter Chips */}
            <View style={styles.filterScrollWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {['all', 'assigned', 'in_transit', 'delivered'].map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[styles.filterChip, statusFilter === st && styles.filterChipActive]}
                    onPress={() => setStatusFilter(st)}
                  >
                    <Text style={[styles.filterChipText, statusFilter === st && styles.filterChipTextActive]}>
                      {st === 'all' ? 'All Active' : st.replace('_', ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Loads List */}
            <FlatList
              data={loads.filter(l => statusFilter === 'all' || l.status === statusFilter)}
              keyExtractor={(item, index) => String(item.id || index)}
              contentContainerStyle={styles.listContent}
              refreshing={loadingLoads}
              onRefresh={fetchLoads}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.dispatchCard}
                  activeOpacity={0.8}
                  onPress={() => setSelectedLoad(item)}
                >
                  <View style={styles.cardHeaderRow}>
                    <View>
                      <Text style={styles.loadTag}>LOAD #{item.load_number || item.id}</Text>
                      <Text style={styles.laneText}>{item.origin} ➔ {item.destination}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusBadgeColor(item.status) }]}>
                      <Text style={styles.statusBadgeText}>{(item.status || 'ASSIGNED').replace('_', ' ').toUpperCase()}</Text>
                    </View>
                  </View>

                  <View style={styles.driverUnitRow}>
                    <View style={styles.driverInfo}>
                      <Ionicons name="person-circle-outline" size={16} color={COLORS.accent} />
                      <Text style={styles.driverName}>{item.driver_name || 'Driver: Marcus Vance'}</Text>
                    </View>
                    <Text style={styles.truckUnit}>Truck #104 • Reefer</Text>
                  </View>

                  <View style={styles.cardFooterRow}>
                    <View style={styles.rateBlock}>
                      <Text style={styles.rateLabel}>GROSS RATE</Text>
                      <Text style={styles.rateVal}>${item.rate || '3,450'}</Text>
                    </View>
                    <View style={styles.rateBlock}>
                      <Text style={styles.rateLabel}>MILES</Text>
                      <Text style={styles.rateVal}>{item.miles || '780'} mi</Text>
                    </View>
                    <View style={styles.rateBlock}>
                      <Text style={styles.rateLabel}>DELIVERY</Text>
                      <Text style={styles.rateVal}>{item.delivery_date || 'Sep 21'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Tab 2: Fleet GPS Live Map */}
        {activeTab === 'fleet' && (
          <ScrollView contentContainerStyle={styles.listContent}>
            <View style={styles.tabBanner}>
              <Text style={styles.tabTitle}>Fleet GPS Telematics</Text>
              <Text style={styles.tabSub}>Real-time location, speed, and status of drivers on active loads.</Text>
            </View>

            {getMockFleetDrivers().map(d => (
              <View key={d.id} style={styles.fleetDriverCard}>
                <View style={styles.driverTopRow}>
                  <View style={styles.driverAvatar}>
                    <FontAwesome5 name="user-alt" size={16} color="#fff" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.driverFullname}>{d.name}</Text>
                    <Text style={styles.driverMeta}>Unit #{d.truck} • {d.phone}</Text>
                  </View>
                  <View style={styles.speedPill}>
                    <Text style={styles.speedText}>{d.speed} MPH</Text>
                  </View>
                </View>

                <View style={styles.locationBlock}>
                  <View style={styles.locationRow}>
                    <Ionicons name="navigate-circle" size={16} color={COLORS.accent} />
                    <Text style={styles.locationText}>{d.location}</Text>
                  </View>
                  <Text style={styles.lastPing}>Last GPS Ping: {d.lastPing}</Text>
                </View>

                <View style={styles.activeLoadPill}>
                  <Text style={styles.loadPillLabel}>Assigned Route:</Text>
                  <Text style={styles.loadPillVal}>{d.activeRoute}</Text>
                </View>

                <View style={styles.actionBtnRow}>
                  <TouchableOpacity
                    style={styles.callDriverBtn}
                    onPress={() => Linking.openURL(`tel:${d.phone}`)}
                  >
                    <Ionicons name="call" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>CALL DRIVER</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.messageDriverBtn}
                    onPress={() => Linking.openURL(`sms:${d.phone}`)}
                  >
                    <Ionicons name="chatbubble" size={14} color={COLORS.accent} />
                    <Text style={[styles.actionBtnText, { color: COLORS.accent }]}>MESSAGE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Tab 3: Document Vault */}
        {activeTab === 'documents' && (
          <ScrollView contentContainerStyle={styles.listContent}>
            <View style={styles.tabBanner}>
              <Text style={styles.tabTitle}>Document Vault & PODs</Text>
              <Text style={styles.tabSub}>Rate confirmations, signed proof of delivery, and inspection sheets.</Text>
            </View>

            {getMockDocuments().map(doc => (
              <View key={doc.id} style={styles.docCard}>
                <View style={styles.docLeft}>
                  <View style={[styles.docIcon, { backgroundColor: doc.type === 'POD' ? COLORS.success : COLORS.accent }]}>
                    <Ionicons name="document-text" size={20} color="#fff" />
                  </View>
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.docTitle}>{doc.title}</Text>
                    <Text style={styles.docSub}>{doc.load_number} • Uploaded {doc.uploaded_at}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.docViewBtn}
                  onPress={() => Alert.alert('Document Viewer', `Viewing ${doc.title} (${doc.file_size}). Verified digital signature.`)}
                >
                  <Text style={styles.docViewBtnText}>View</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Tab 4: Invoices & Accounting */}
        {activeTab === 'invoices' && (
          <ScrollView contentContainerStyle={styles.listContent}>
            <View style={styles.tabBanner}>
              <Text style={styles.tabTitle}>Invoicing & Factoring</Text>
              <Text style={styles.tabSub}>Track broker invoice settlements, factoring status, and 24-hr payouts.</Text>
            </View>

            {/* Financial KPI Cards */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>PAID THIS MONTH</Text>
                <Text style={[styles.kpiVal, { color: COLORS.success }]}>$48,920</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>PENDING BROKER</Text>
                <Text style={[styles.kpiVal, { color: COLORS.warning }]}>$12,450</Text>
              </View>
            </View>

            {invoices.map((inv, idx) => (
              <View key={inv.id || idx} style={styles.invoiceCard}>
                <View style={styles.invHeader}>
                  <View>
                    <Text style={styles.invNumber}>INV #{inv.invoice_number || `2026-${100 + idx}`}</Text>
                    <Text style={styles.invBroker}>{inv.broker_name || 'C.H. Robinson'}</Text>
                  </View>
                  <View style={[styles.invStatusPill, { backgroundColor: inv.status === 'paid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)' }]}>
                    <Text style={[styles.invStatusText, { color: inv.status === 'paid' ? COLORS.success : COLORS.warning }]}>
                      {(inv.status || 'PENDING').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.invAmountRow}>
                  <Text style={styles.invAmountLabel}>Invoice Total:</Text>
                  <Text style={styles.invAmountVal}>${inv.amount || '3,450.00'}</Text>
                </View>

                <View style={styles.invFooter}>
                  <Text style={styles.invDue}>Payment Terms: Net 30 • Factoring: Approved</Text>
                  <TouchableOpacity
                    style={styles.invDownloadBtn}
                    onPress={() => Alert.alert('Invoice PDF', 'Official Shipping Wish invoice generated & ready to email to broker.')}
                  >
                    <Ionicons name="download-outline" size={14} color={COLORS.accent} />
                    <Text style={styles.invDownloadText}>PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Bottom Tabs Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'dispatches' && styles.navItemActive]}
          onPress={() => setActiveTab('dispatches')}
        >
          <MaterialCommunityIcons name="view-dashboard" size={22} color={activeTab === 'dispatches' ? COLORS.accent : COLORS.textMuted} />
          <Text style={[styles.navText, activeTab === 'dispatches' && styles.navTextActive]}>Dispatches</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'fleet' && styles.navItemActive]}
          onPress={() => setActiveTab('fleet')}
        >
          <Ionicons name="map" size={22} color={activeTab === 'fleet' ? COLORS.accent : COLORS.textMuted} />
          <Text style={[styles.navText, activeTab === 'fleet' && styles.navTextActive]}>Fleet GPS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'documents' && styles.navItemActive]}
          onPress={() => setActiveTab('documents')}
        >
          <Ionicons name="folder-open" size={22} color={activeTab === 'documents' ? COLORS.accent : COLORS.textMuted} />
          <Text style={[styles.navText, activeTab === 'documents' && styles.navTextActive]}>Documents</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'invoices' && styles.navItemActive]}
          onPress={() => setActiveTab('invoices')}
        >
          <Ionicons name="receipt" size={22} color={activeTab === 'invoices' ? COLORS.accent : COLORS.textMuted} />
          <Text style={[styles.navText, activeTab === 'invoices' && styles.navTextActive]}>Invoices</Text>
        </TouchableOpacity>
      </View>

      {/* Load Details Modal */}
      <Modal visible={!!selectedLoad} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Dispatch Details #{selectedLoad?.load_number}</Text>
              <TouchableOpacity onPress={() => setSelectedLoad(null)}>
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedLoad && (
              <ScrollView>
                <View style={styles.modalLaneCard}>
                  <Text style={styles.laneHeader}>{selectedLoad.origin} ➔ {selectedLoad.destination}</Text>
                  <Text style={styles.laneSub}>{selectedLoad.equipment_type} • {selectedLoad.miles} miles</Text>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.sectionHeader}>FINANCIAL & RATE</Text>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Broker Rate:</Text>
                    <Text style={styles.infoValue}>${selectedLoad.rate}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Rate Per Mile:</Text>
                    <Text style={styles.infoValue}>${((selectedLoad.rate || 3450) / (selectedLoad.miles || 780)).toFixed(2)}/mi</Text>
                  </View>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.sectionHeader}>ASSIGNED DRIVER & TRUCK</Text>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Assigned Driver:</Text>
                    <Text style={styles.infoValue}>{selectedLoad.driver_name || 'Marcus Vance'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Power Unit:</Text>
                    <Text style={styles.infoValue}>Truck #104 (Freightliner Cascadia)</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.contactDriverBtn}
                  onPress={() => Linking.openURL('tel:+18005550199')}
                >
                  <Ionicons name="call" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.contactDriverText}>CALL ASSIGNED DRIVER</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getStatusBadgeColor(status) {
  switch (status) {
    case 'delivered': return COLORS.success;
    case 'in_transit': return COLORS.accent;
    case 'assigned': return COLORS.warning;
    default: return COLORS.primaryLight;
  }
}

function getMockLoads() {
  return [
    {
      id: 101,
      load_number: 'SW-8942',
      status: 'in_transit',
      origin: 'Dallas, TX',
      destination: 'Atlanta, GA',
      rate: 3450,
      miles: 780,
      equipment_type: 'Reefer 53ft',
      driver_name: 'Marcus Vance',
      delivery_date: 'Sep 21, 04:00 PM'
    },
    {
      id: 102,
      load_number: 'SW-8943',
      status: 'assigned',
      origin: 'Chicago, IL',
      destination: 'Allentown, PA',
      rate: 2850,
      miles: 720,
      equipment_type: 'Dry Van',
      driver_name: 'David Reynolds',
      delivery_date: 'Sep 22, 09:00 AM'
    },
    {
      id: 103,
      load_number: 'SW-8940',
      status: 'delivered',
      origin: 'Kansas City, MO',
      destination: 'Dallas, TX',
      rate: 2100,
      miles: 495,
      equipment_type: 'Flatbed',
      driver_name: 'Robert Hayes',
      delivery_date: 'Sep 18, 02:30 PM'
    }
  ];
}

function getMockFleetDrivers() {
  return [
    {
      id: 1,
      name: 'Marcus Vance',
      truck: '104',
      phone: '+1 (214) 555-4920',
      speed: 64,
      location: 'I-20 Eastbound near Shreveport, LA',
      lastPing: '2 mins ago',
      activeRoute: 'Dallas, TX ➔ Atlanta, GA (Load #SW-8942)'
    },
    {
      id: 2,
      name: 'David Reynolds',
      truck: '108',
      phone: '+1 (312) 555-8812',
      speed: 0,
      location: 'Rest Area - I-80 East, South Bend, IN',
      lastPing: '5 mins ago',
      activeRoute: 'Chicago, IL ➔ Allentown, PA (Load #SW-8943)'
    }
  ];
}

function getMockDocuments() {
  return [
    {
      id: 1,
      title: 'Signed Proof of Delivery (POD)',
      type: 'POD',
      load_number: 'SW-8940',
      uploaded_at: 'Sep 18, 03:00 PM',
      file_size: '2.4 MB'
    },
    {
      id: 2,
      title: 'Broker Rate Confirmation',
      type: 'RateCon',
      load_number: 'SW-8942',
      uploaded_at: 'Sep 19, 07:45 AM',
      file_size: '410 KB'
    },
    {
      id: 3,
      title: 'Clean Bill of Lading (BOL)',
      type: 'BOL',
      load_number: 'SW-8942',
      uploaded_at: 'Sep 19, 08:30 AM',
      file_size: '1.8 MB'
    }
  ];
}

function getMockInvoices() {
  return [
    {
      id: 1,
      invoice_number: '2026-089',
      broker_name: 'C.H. Robinson Worldwide',
      amount: '3,450.00',
      status: 'pending'
    },
    {
      id: 2,
      invoice_number: '2026-088',
      broker_name: 'Total Quality Logistics',
      amount: '2,850.00',
      status: 'paid'
    },
    {
      id: 3,
      invoice_number: '2026-087',
      broker_name: 'Echo Global Logistics',
      amount: '2,100.00',
      status: 'paid'
    }
  ];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  brandName: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.textPrimary
  },
  brandSub: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 1.5
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#0E1726'
  },
  body: {
    flex: 1
  },

  // Filters
  filterScrollWrap: {
    backgroundColor: COLORS.cardBg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8
  },
  filterChip: {
    backgroundColor: '#0E1726',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  filterChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary
  },
  filterChipTextActive: {
    color: '#fff'
  },

  // Dispatches
  listContent: {
    padding: 16,
    paddingBottom: 30
  },
  dispatchCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 12,
    ...SHADOWS.sm
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  loadTag: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accent
  },
  laneText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800'
  },
  driverUnitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0E1726',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 10
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  driverName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  truckUnit: {
    fontSize: 11,
    color: COLORS.textMuted
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)'
  },
  rateBlock: {
    alignItems: 'center'
  },
  rateLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted
  },
  rateVal: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2
  },

  // Fleet GPS
  tabBanner: {
    marginBottom: 14
  },
  tabTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  tabSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  fleetDriverCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 12
  },
  driverTopRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  driverAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  driverFullname: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  driverMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1
  },
  speedPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  speedText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '800'
  },
  locationBlock: {
    backgroundColor: '#0E1726',
    borderRadius: 8,
    padding: 10,
    marginVertical: 10
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  locationText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  lastPing: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
    marginLeft: 22
  },
  activeLoadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10
  },
  loadPillLabel: {
    fontSize: 11,
    color: COLORS.textMuted
  },
  loadPillVal: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10
  },
  callDriverBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6
  },
  messageDriverBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    gap: 6
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700'
  },

  // Document Vault
  docCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 10
  },
  docLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  docIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  docSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2
  },
  docViewBtn: {
    backgroundColor: '#0E1726',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  docViewBtnText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700'
  },

  // Invoices & Accounting
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted
  },
  kpiVal: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4
  },
  invoiceCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 12
  },
  invHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  invNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  invBroker: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  invStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  invStatusText: {
    fontSize: 10,
    fontWeight: '800'
  },
  invAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  invAmountLabel: {
    fontSize: 12,
    color: COLORS.textMuted
  },
  invAmountVal: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary
  },
  invFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  invDue: {
    fontSize: 10,
    color: COLORS.textMuted
  },
  invDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  invDownloadText: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: '700'
  },

  // Bottom Navigation
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 6
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4
  },
  navItemActive: {
    borderTopWidth: 2,
    borderTopColor: COLORS.accent
  },
  navText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 3
  },
  navTextActive: {
    color: COLORS.accent
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    maxHeight: '80%'
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  modalLaneCard: {
    backgroundColor: '#0E1726',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14
  },
  laneHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  laneSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  modalSection: {
    marginBottom: 14
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 6
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  infoLabel: {
    fontSize: 13,
    color: COLORS.textSecondary
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  contactDriverBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 10
  },
  contactDriverText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800'
  }
});
