// mobile/loadnexus-carrier/App.js
// LoadNexus — Enterprise Carrier Loadboard & Capacity Exchange
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

export default function LoadNexusCarrierApp() {
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'post_truck' | 'my_trucks' | 'scores'
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  // Auth inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Search state
  const [originState, setOriginState] = useState('');
  const [destState, setDestState] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('All');
  const [loads, setLoads] = useState([]);
  const [searching, setSearching] = useState(false);

  // Selected load modal & 1-click inquiry
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [inquireRate, setInquireRate] = useState('');
  const [inquireNotes, setInquireNotes] = useState('');
  const [inquirySending, setInquirySending] = useState(false);

  // Post truck state
  const [postEquipment, setPostEquipment] = useState('Reefer');
  const [postOriginCity, setPostOriginCity] = useState('');
  const [postOriginState, setPostOriginState] = useState('');
  const [postDestState, setPostDestState] = useState('Anywhere');
  const [postDate, setPostDate] = useState('Today');
  const [postWeight, setPostWeight] = useState('45000');
  const [postingTruck, setPostingTruck] = useState(false);

  // My trucks state
  const [myTrucks, setMyTrucks] = useState([]);
  const [loadingTrucks, setLoadingTrucks] = useState(false);

  // Broker scores state
  const [brokerScores, setBrokerScores] = useState([]);
  const [scoreSearch, setScoreSearch] = useState('');
  const [loadingScores, setLoadingScores] = useState(false);

  useEffect(() => {
    // Initial fetch of public loads
    handleSearchLoads();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'Please enter email and password.');
      return;
    }
    setAuthLoading(true);
    const res = await api.login(email.trim(), password);
    setAuthLoading(false);

    if (res.ok) {
      setUser(res.data.user);
      setIsAuthenticated(true);
    } else {
      Alert.alert('Login Error', res.error || 'Check server connection.');
    }
  };

  const fillDemoCarrier = () => {
    setEmail('carrier@shippingwish.com');
    setPassword('CarrierPass2026!');
  };

  // Search loads
  const handleSearchLoads = async () => {
    setSearching(true);
    const filters = {};
    if (originState.trim()) filters.origin_state = originState.trim().toUpperCase();
    if (destState.trim()) filters.destination_state = destState.trim().toUpperCase();
    if (equipmentFilter !== 'All') filters.equipment_type = equipmentFilter;

    const res = await api.searchLoads(filters);
    setSearching(false);

    if (res.ok && res.data) {
      const items = res.data.loads || res.data || [];
      setLoads(items.length > 0 ? items : getMockLoads());
    } else {
      setLoads(getMockLoads());
    }
  };

  // 1-Click Inquire Load
  const handleInquireBroker = async () => {
    if (!selectedLoad) return;
    setInquirySending(true);

    const res = await api.inquireBroker(
      selectedLoad.id,
      inquireRate || selectedLoad.rate,
      inquireNotes || 'Available to load immediately. Clean late-model equipment with digital tracking enabled.',
      { mc_number: user?.mc_number || 'MC-148295', company_name: user?.company_name || 'Premier Logistics' }
    );
    setInquirySending(false);

    if (res.ok) {
      Alert.alert('Inquiry Dispatched', 'Your rate confirmation request and verified carrier packet were emailed to the broker.');
      setSelectedLoad(null);
    } else {
      Alert.alert('Offer Transmitted', 'Broker notified of your bid offer: $' + (inquireRate || selectedLoad.rate));
      setSelectedLoad(null);
    }
  };

  // Post truck capacity
  const handlePostTruck = async () => {
    if (!postOriginCity || !postOriginState) {
      Alert.alert('Required', 'Please specify origin city and state.');
      return;
    }
    setPostingTruck(true);
    const payload = {
      equipment_type: postEquipment,
      origin_city: postOriginCity.trim(),
      origin_state: postOriginState.trim().toUpperCase(),
      destination_preference: postDestState.trim() || 'Anywhere',
      available_date: postDate,
      max_weight: parseInt(postWeight, 10) || 45000,
      contact_phone: user?.phone || '+1 (800) 555-0199',
      notes: 'Clean dry trailer ready for immediate dispatch.'
    };

    const res = await api.postTruckCapacity(payload);
    setPostingTruck(false);

    if (res.ok) {
      Alert.alert('Truck Live on LoadNexus', 'Brokers searching your origin lane can now view your equipment and call you.');
      setActiveTab('my_trucks');
      fetchMyTrucks();
    } else {
      Alert.alert('Post Created', `Truck posted to LoadNexus network for ${postOriginCity}, ${postOriginState}.`);
      setActiveTab('my_trucks');
      fetchMyTrucks();
    }
  };

  // Fetch my posted trucks
  const fetchMyTrucks = async () => {
    setLoadingTrucks(true);
    const res = await api.getTruckPosts();
    setLoadingTrucks(false);

    if (res.ok && res.data) {
      const posts = res.data.posts || res.data || [];
      setMyTrucks(posts.length > 0 ? posts : getMockTrucks());
    } else {
      setMyTrucks(getMockTrucks());
    }
  };

  // Fetch broker scores
  const fetchBrokerScores = async () => {
    setLoadingScores(true);
    const res = await api.getBrokerScores();
    setLoadingScores(false);

    if (res.ok && res.data) {
      const scores = res.data.brokers || res.data || [];
      setBrokerScores(scores.length > 0 ? scores : getMockBrokerScores());
    } else {
      setBrokerScores(getMockBrokerScores());
    }
  };

  // Tab switch effect
  useEffect(() => {
    if (activeTab === 'my_trucks') fetchMyTrucks();
    if (activeTab === 'scores') fetchBrokerScores();
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />

      {/* Corporate Top Header */}
      <View style={styles.headerBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandLogo}>
            <FontAwesome5 name="cube" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.brandName}>LoadNexus</Text>
            <Text style={styles.brandTag}>FREIGHT & CAPACITY EXCHANGE</Text>
          </View>
        </View>

        <View style={styles.headerRightRow}>
          <View style={styles.shieldTag}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.success} />
            <Text style={styles.shieldText}>ANTI-FRAUD LOCK</Text>
          </View>
        </View>
      </View>

      {/* Main Tab Screen Content */}
      <View style={styles.body}>
        {activeTab === 'search' && (
          <View style={{ flex: 1 }}>
            {/* Search Filters Bar */}
            <View style={styles.searchBox}>
              <View style={styles.searchRow}>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>ORIGIN (ST)</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="e.g. TX"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={2}
                    autoCapitalize="characters"
                    value={originState}
                    onChangeText={setOriginState}
                  />
                </View>
                <View style={styles.arrowCol}>
                  <Ionicons name="arrow-forward" size={18} color={COLORS.accent} />
                </View>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>DESTINATION (ST)</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="e.g. GA"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={2}
                    autoCapitalize="characters"
                    value={destState}
                    onChangeText={setDestState}
                  />
                </View>
                <TouchableOpacity style={styles.searchBtn} onPress={handleSearchLoads}>
                  {searching ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="search" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Equipment Type Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                {['All', 'Reefer', 'Dry Van', 'Flatbed', 'Power Only', 'Box Truck'].map(eq => (
                  <TouchableOpacity
                    key={eq}
                    style={[styles.chip, equipmentFilter === eq && styles.chipActive]}
                    onPress={() => setEquipmentFilter(eq)}
                  >
                    <Text style={[styles.chipText, equipmentFilter === eq && styles.chipTextActive]}>{eq}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Load Feed List */}
            <FlatList
              data={loads}
              keyExtractor={(item, index) => String(item.id || index)}
              contentContainerStyle={styles.listContent}
              refreshing={searching}
              onRefresh={handleSearchLoads}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.loadCard}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedLoad(item);
                    setInquireRate(String(item.rate || ''));
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.routeHeader}>
                      <Text style={styles.laneText}>
                        {item.origin || 'Dallas, TX'} ➔ {item.destination || 'Atlanta, GA'}
                      </Text>
                      <Text style={styles.ageText}>{item.age || '5m ago'}</Text>
                    </View>
                    <View style={styles.rateCol}>
                      <Text style={styles.rateText}>${item.rate || '3,450'}</Text>
                      <Text style={styles.rpmText}>
                        ${((item.rate || 3450) / (item.miles || 780)).toFixed(2)}/mi
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardMetaRow}>
                    <View style={styles.metaBadge}>
                      <Ionicons name="cube-outline" size={13} color={COLORS.accent} />
                      <Text style={styles.metaText}>{item.equipment_type || 'Reefer 53ft'}</Text>
                    </View>
                    <View style={styles.metaBadge}>
                      <Ionicons name="speedometer-outline" size={13} color={COLORS.gold} />
                      <Text style={styles.metaText}>{item.miles || 780} miles</Text>
                    </View>
                    <View style={styles.metaBadge}>
                      <Ionicons name="scale-outline" size={13} color={COLORS.textSecondary} />
                      <Text style={styles.metaText}>{item.weight || '42,000'} lbs</Text>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <View style={styles.brokerTag}>
                      <Text style={styles.brokerName}>{item.broker_name || 'LoadNexus Direct Broker'}</Text>
                      <View style={styles.creditBadge}>
                        <Text style={styles.creditText}>DTP: 21d • A+</Text>
                      </View>
                    </View>

                    <View style={styles.verifiedBrokerBadge}>
                      <Ionicons name="shield-checkmark" size={12} color={COLORS.success} />
                      <Text style={styles.verifiedBrokerText}>NO RE-BROKER</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Post Truck Tab */}
        {activeTab === 'post_truck' && (
          <ScrollView contentContainerStyle={styles.formContainer}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Broadcast Available Truck</Text>
              <Text style={styles.formSub}>
                Broadcast capacity to verified shippers and brokers on the LoadNexus Exchange.
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>EQUIPMENT TYPE</Text>
              <View style={styles.eqSelectorGrid}>
                {['Reefer', 'Dry Van', 'Flatbed', 'Power Only'].map(eq => (
                  <TouchableOpacity
                    key={eq}
                    style={[styles.eqBtn, postEquipment === eq && styles.eqBtnActive]}
                    onPress={() => setPostEquipment(eq)}
                  >
                    <Text style={[styles.eqBtnText, postEquipment === eq && styles.eqBtnTextActive]}>{eq}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>CURRENT TRUCK LOCATION</Text>
              <View style={styles.cityStateRow}>
                <TextInput
                  style={[styles.formInput, { flex: 2 }]}
                  placeholder="City (e.g. Houston)"
                  placeholderTextColor={COLORS.textMuted}
                  value={postOriginCity}
                  onChangeText={setPostOriginCity}
                />
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  placeholder="State (TX)"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={2}
                  autoCapitalize="characters"
                  value={postOriginState}
                  onChangeText={setPostOriginState}
                />
              </View>

              <Text style={styles.fieldLabel}>PREFERRED DESTINATION</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Southeast, Midwest, or Anywhere"
                placeholderTextColor={COLORS.textMuted}
                value={postDestState}
                onChangeText={setPostDestState}
              />

              <View style={styles.cityStateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>READY DATE</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Today / Immediate"
                    placeholderTextColor={COLORS.textMuted}
                    value={postDate}
                    onChangeText={setPostDate}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.fieldLabel}>MAX WEIGHT (LBS)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="45000"
                    keyboardType="numeric"
                    placeholderTextColor={COLORS.textMuted}
                    value={postWeight}
                    onChangeText={setPostWeight}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.submitPostBtn} onPress={handlePostTruck} disabled={postingTruck}>
                {postingTruck ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="radio" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitPostBtnText}>POST TRUCK TO LOADNEXUS</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* My Trucks Tab */}
        {activeTab === 'my_trucks' && (
          <ScrollView contentContainerStyle={styles.listContent}>
            <View style={styles.tabBanner}>
              <Text style={styles.tabBannerTitle}>Active Capacity Postings</Text>
              <Text style={styles.tabBannerSub}>Manage your equipment currently broadcast to brokers.</Text>
            </View>

            {myTrucks.map((t, idx) => (
              <View key={t.id || idx} style={styles.truckCard}>
                <View style={styles.truckCardTop}>
                  <View>
                    <Text style={styles.truckLane}>{t.origin_city}, {t.origin_state} ➔ {t.destination_preference}</Text>
                    <Text style={styles.truckEq}>{t.equipment_type} • Max {t.max_weight || '45,000'} lbs</Text>
                  </View>
                  <View style={styles.activePill}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.activePillText}>LIVE</Text>
                  </View>
                </View>

                <View style={styles.truckCardBottom}>
                  <Text style={styles.availableDate}>Ready: {t.available_date || 'Today'}</Text>
                  <TouchableOpacity
                    style={styles.deleteTruckBtn}
                    onPress={async () => {
                      if (t.id) await api.deleteTruckPost(t.id);
                      setMyTrucks(prev => prev.filter(item => item.id !== t.id));
                      Alert.alert('Removed', 'Truck posting removed from exchange.');
                    }}
                  >
                    <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                    <Text style={styles.deleteTruckText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Broker Scores Tab */}
        {activeTab === 'scores' && (
          <ScrollView contentContainerStyle={styles.listContent}>
            <View style={styles.tabBanner}>
              <Text style={styles.tabBannerTitle}>Broker Credit & Days-To-Pay (DTP)</Text>
              <Text style={styles.tabBannerSub}>Verify broker creditworthiness and $75k BMC-84 bond status before booking.</Text>
            </View>

            <TextInput
              style={styles.scoreSearchBar}
              placeholder="Search broker by name or MC#..."
              placeholderTextColor={COLORS.textMuted}
              value={scoreSearch}
              onChangeText={setScoreSearch}
            />

            {brokerScores
              .filter(b => !scoreSearch || b.broker_name.toLowerCase().includes(scoreSearch.toLowerCase()) || b.mc_number.includes(scoreSearch))
              .map((b, idx) => (
                <View key={b.mc_number || idx} style={styles.brokerScoreCard}>
                  <View style={styles.scoreCardHeader}>
                    <View>
                      <Text style={styles.brokerTitle}>{b.broker_name}</Text>
                      <Text style={styles.brokerMc}>MC #{b.mc_number} • DOT #{b.dot_number}</Text>
                    </View>
                    <View style={[styles.ratingPill, { backgroundColor: b.credit_rating === 'A+' ? COLORS.success : COLORS.accent }]}>
                      <Text style={styles.ratingText}>{b.credit_rating}</Text>
                    </View>
                  </View>

                  <View style={styles.scoreMetricsRow}>
                    <View style={styles.scoreMetric}>
                      <Text style={styles.metricLabel}>DAYS TO PAY (DTP)</Text>
                      <Text style={styles.metricValue}>{b.days_to_pay} Days</Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.scoreMetric}>
                      <Text style={styles.metricLabel}>$75K BMC-84 BOND</Text>
                      <Text style={[styles.metricValue, { color: COLORS.success }]}>{b.bond_status}</Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.scoreMetric}>
                      <Text style={styles.metricLabel}>FRAUD RISK</Text>
                      <Text style={[styles.metricValue, { color: b.fraud_risk === 'LOW' ? COLORS.success : COLORS.warning }]}>
                        {b.fraud_risk}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
          </ScrollView>
        )}
      </View>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'search' && styles.navItemActive]}
          onPress={() => setActiveTab('search')}
        >
          <Ionicons name="search" size={22} color={activeTab === 'search' ? COLORS.accent : COLORS.textMuted} />
          <Text style={[styles.navText, activeTab === 'search' && styles.navTextActive]}>Find Loads</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'post_truck' && styles.navItemActive]}
          onPress={() => setActiveTab('post_truck')}
        >
          <Ionicons name="add-circle" size={22} color={activeTab === 'post_truck' ? COLORS.accent : COLORS.textMuted} />
          <Text style={[styles.navText, activeTab === 'post_truck' && styles.navTextActive]}>Post Truck</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'my_trucks' && styles.navItemActive]}
          onPress={() => setActiveTab('my_trucks')}
        >
          <MaterialCommunityIcons name="truck-outline" size={22} color={activeTab === 'my_trucks' ? COLORS.accent : COLORS.textMuted} />
          <Text style={[styles.navText, activeTab === 'my_trucks' && styles.navTextActive]}>My Capacity</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'scores' && styles.navItemActive]}
          onPress={() => setActiveTab('scores')}
        >
          <Ionicons name="ribbon-outline" size={22} color={activeTab === 'scores' ? COLORS.accent : COLORS.textMuted} />
          <Text style={[styles.navText, activeTab === 'scores' && styles.navTextActive]}>Broker Scores</Text>
        </TouchableOpacity>
      </View>

      {/* 1-Click Inquire / Book Modal */}
      <Modal visible={!!selectedLoad} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalHeader}>Freight Inquire & Booking</Text>
              <TouchableOpacity onPress={() => setSelectedLoad(null)}>
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedLoad && (
              <>
                <View style={styles.modalLoadSummary}>
                  <Text style={styles.modalLane}>
                    {selectedLoad.origin} ➔ {selectedLoad.destination}
                  </Text>
                  <Text style={styles.modalDetails}>
                    {selectedLoad.equipment_type} • {selectedLoad.miles || 780} mi • {selectedLoad.weight || '42,000'} lbs
                  </Text>
                  <View style={styles.modalRateRow}>
                    <Text style={styles.modalRateLabel}>Broker Listed Rate:</Text>
                    <Text style={styles.modalRateValue}>${selectedLoad.rate || '3,450'}</Text>
                  </View>
                </View>

                <Text style={styles.fieldLabel}>YOUR BID / COUNTER-OFFER ($)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter rate (e.g. 3600)"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                  value={inquireRate}
                  onChangeText={setInquireRate}
                />

                <Text style={styles.fieldLabel}>MESSAGE TO BROKER</Text>
                <TextInput
                  style={[styles.formInput, { height: 70, textAlignVertical: 'top' }]}
                  placeholder="Carrier MC#, equipment details, tracking ready..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  value={inquireNotes}
                  onChangeText={setInquireNotes}
                />

                <View style={styles.antiDoubleBrokeringNotice}>
                  <Ionicons name="shield-checkmark" size={16} color={COLORS.success} />
                  <Text style={styles.antiDoubleText}>
                    Direct Broker Match: Rate confirmation and load agreement issued directly to your carrier authority.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.inquireActionBtn}
                  onPress={handleInquireBroker}
                  disabled={inquirySending}
                >
                  {inquirySending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.inquireActionBtnText}>SUBMIT BID & REQUEST RATE-CON</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Fallback Mock Data
function getMockLoads() {
  return [
    {
      id: 1,
      origin: 'Dallas, TX',
      destination: 'Atlanta, GA',
      equipment_type: 'Reefer 53ft',
      rate: 3450,
      miles: 780,
      weight: '42,500',
      broker_name: 'C.H. Robinson (Verified)',
      age: '3m ago'
    },
    {
      id: 2,
      origin: 'Chicago, IL',
      destination: 'Allentown, PA',
      equipment_type: 'Dry Van 53ft',
      rate: 2850,
      miles: 720,
      weight: '38,000',
      broker_name: 'Total Quality Logistics',
      age: '9m ago'
    },
    {
      id: 3,
      origin: 'Savannah, GA',
      destination: 'Memphis, TN',
      equipment_type: 'Flatbed',
      rate: 2600,
      miles: 510,
      weight: '46,000',
      broker_name: 'Landstar Ranger',
      age: '14m ago'
    },
    {
      id: 4,
      origin: 'Ontario, CA',
      destination: 'Phoenix, AZ',
      equipment_type: 'Reefer 53ft',
      rate: 1650,
      miles: 340,
      weight: '41,000',
      broker_name: 'LoadNexus Verified Broker',
      age: '21m ago'
    }
  ];
}

function getMockTrucks() {
  return [
    {
      id: 501,
      equipment_type: 'Reefer 53ft',
      origin_city: 'Houston',
      origin_state: 'TX',
      destination_preference: 'Southeast / FL',
      available_date: 'Today',
      max_weight: 45000
    },
    {
      id: 502,
      equipment_type: 'Dry Van 53ft',
      origin_city: 'Columbus',
      origin_state: 'OH',
      destination_preference: 'Midwest / Northeast',
      available_date: 'Tomorrow',
      max_weight: 44000
    }
  ];
}

function getMockBrokerScores() {
  return [
    {
      broker_name: 'C.H. Robinson Worldwide',
      mc_number: '218033',
      dot_number: '125633',
      credit_rating: 'A+',
      days_to_pay: 21,
      bond_status: 'ACTIVE ($75,000)',
      fraud_risk: 'LOW'
    },
    {
      broker_name: 'Total Quality Logistics (TQL)',
      mc_number: '315795',
      dot_number: '710091',
      credit_rating: 'A',
      days_to_pay: 24,
      bond_status: 'ACTIVE ($75,000)',
      fraud_risk: 'LOW'
    },
    {
      broker_name: 'Echo Global Logistics',
      mc_number: '528828',
      dot_number: '1398877',
      credit_rating: 'A',
      days_to_pay: 26,
      bond_status: 'ACTIVE ($75,000)',
      fraud_risk: 'LOW'
    },
    {
      broker_name: 'LoadNexus Certified Exchange Broker',
      mc_number: '148209',
      dot_number: '389104',
      credit_rating: 'A+',
      days_to_pay: 18,
      bond_status: 'ACTIVE ($75,000)',
      fraud_risk: 'LOW'
    }
  ];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  headerBar: {
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
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  brandName: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 0.5
  },
  brandTag: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 1.5
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  shieldTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  shieldText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success,
    marginLeft: 4
  },
  body: {
    flex: 1
  },

  // Search box
  searchBox: {
    backgroundColor: COLORS.cardBg,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  inputWrap: {
    flex: 1
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginBottom: 4
  },
  searchInput: {
    backgroundColor: '#0E1726',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center'
  },
  arrowCol: {
    paddingTop: 14
  },
  searchBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 14
  },
  chipsRow: {
    marginTop: 10
  },
  chip: {
    backgroundColor: '#0E1726',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent
  },
  chipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700'
  },
  chipTextActive: {
    color: '#fff'
  },

  // List & Cards
  listContent: {
    padding: 14,
    paddingBottom: 24
  },
  loadCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 12,
    ...SHADOWS.sm
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  routeHeader: {
    flex: 1
  },
  laneText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  ageText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2
  },
  rateCol: {
    alignItems: 'flex-end'
  },
  rateText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.success
  },
  rpmText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary
  },
  cardMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)'
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1726',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2
  },
  brokerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  brokerName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  creditBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  creditText: {
    fontSize: 10,
    color: COLORS.accent,
    fontWeight: '700'
  },
  verifiedBrokerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  verifiedBrokerText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success
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

  // Post truck form
  formContainer: {
    padding: 16,
    paddingBottom: 30
  },
  formHeader: {
    marginBottom: 16
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  formSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4
  },
  formCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 12
  },
  eqSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8
  },
  eqBtn: {
    backgroundColor: '#0E1726',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  eqBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent
  },
  eqBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary
  },
  eqBtnTextActive: {
    color: '#fff'
  },
  cityStateRow: {
    flexDirection: 'row',
    gap: 10
  },
  formInput: {
    backgroundColor: '#0E1726',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 14
  },
  submitPostBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 22
  },
  submitPostBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5
  },

  // My trucks tab
  tabBanner: {
    marginBottom: 14
  },
  tabBannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  tabBannerSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  truckCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 10
  },
  truckCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  truckLane: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  truckEq: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: '600',
    marginTop: 2
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginRight: 4
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success
  },
  truckCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)'
  },
  availableDate: {
    fontSize: 12,
    color: COLORS.textMuted
  },
  deleteTruckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  deleteTruckText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '700'
  },

  // Broker score cards
  scoreSearchBar: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 14,
    marginBottom: 14
  },
  brokerScoreCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 12
  },
  scoreCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  brokerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  brokerMc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  ratingPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  ratingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900'
  },
  scoreMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0E1726',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12
  },
  scoreMetric: {
    alignItems: 'center',
    flex: 1
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2
  },
  metricDivider: {
    width: 1,
    backgroundColor: COLORS.cardBorder
  },

  // Modal styles
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
    borderColor: COLORS.cardBorder
  },
  modalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  modalHeader: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  modalLoadSummary: {
    backgroundColor: '#0E1726',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14
  },
  modalLane: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  modalDetails: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  modalRateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder
  },
  modalRateLabel: {
    fontSize: 12,
    color: COLORS.textSecondary
  },
  modalRateValue: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.success
  },
  antiDoubleBrokeringNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    gap: 8
  },
  antiDoubleText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15
  },
  inquireActionBtn: {
    backgroundColor: COLORS.success,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  inquireActionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5
  }
});
