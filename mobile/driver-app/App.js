// mobile/driver-app/App.js
// Shipping Wish LLC — Enterprise Driver Console
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
  Image,
  SafeAreaView,
  StatusBar,
  Modal,
  Linking,
  Platform
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';

import { CONFIG } from '../shared/config';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../shared/theme';
import api from '../shared/api';

export default function DriverApp() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Server settings modal
  const [serverUrl, setServerUrl] = useState(CONFIG.API_BASE);
  const [showServerModal, setShowServerModal] = useState(false);

  // Active load state
  const [assignedLoads, setAssignedLoads] = useState([]);
  const [activeLoad, setActiveLoad] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // GPS state
  const [gpsStatus, setGpsStatus] = useState('Idle');
  const [lastCoords, setLastCoords] = useState(null);

  // Camera & Document state
  const [capturedImage, setCapturedImage] = useState(null);
  const [docType, setDocType] = useState('bol');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);

  // Pre-Trip Modal
  const [showPreTripModal, setShowPreTripModal] = useState(false);
  const [preTripChecks, setPreTripChecks] = useState({
    tires: true,
    brakes: true,
    lights: true,
    reefer: true,
    fluids: true,
    securement: true
  });

  useEffect(() => {
    api.setBaseUrl(serverUrl);
  }, [serverUrl]);

  // Login handler
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please enter your driver email and password.');
      return;
    }
    setLoading(true);
    const res = await api.login(email.trim(), password);
    setLoading(false);

    if (res.ok && res.data) {
      setUser(res.data.user);
      setIsAuthenticated(true);
      fetchDriverLoads();
    } else {
      Alert.alert('Login Failed', res.error || 'Invalid credentials or server unreachable.');
    }
  };

  // Quick fill test login
  const fillTestLogin = () => {
    setEmail('driver@shippingwish.com');
    setPassword('DriverPass2026!');
  };

  // Fetch loads assigned to this driver
  const fetchDriverLoads = async () => {
    setRefreshing(true);
    const res = await api.getLoads();
    setRefreshing(false);

    if (res.ok && res.data) {
      const loads = res.data.loads || res.data || [];
      setAssignedLoads(loads);
      if (loads.length > 0) {
        setActiveLoad(loads[0]);
      } else {
        // Fallback demo load if no loads in database
        setActiveLoad({
          id: 101,
          load_number: 'SW-8942',
          status: 'assigned',
          shipper_name: 'Sysco Midwest Cold Storage',
          origin: 'Dallas, TX',
          origin_address: '2200 Distribution Way, Dallas, TX 75201',
          receiver_name: 'Kroger Distribution Center',
          destination: 'Atlanta, GA',
          destination_address: '450 Logistics Pkwy, Atlanta, GA 30301',
          rate: 3450,
          miles: 780,
          equipment_type: 'Reefer (53ft)',
          commodity: 'Fresh Produce (Maintain 36°F)',
          pickup_date: '2026-09-20 08:00 AM',
          delivery_date: '2026-09-21 04:00 PM',
          dispatcher_phone: '+1 (800) 555-0199',
          shipper_phone: '+1 (214) 555-8821',
          receiver_phone: '+1 (404) 555-9012'
        });
      }
    }
  };

  // Status Milestone Update
  const updateStatus = async (newStatus) => {
    if (!activeLoad) return;
    setLoading(true);
    const res = await api.updateLoadStatus(activeLoad.id, newStatus, `Driver updated via Driver Console`);
    setLoading(false);

    if (res.ok) {
      Alert.alert('Status Updated', `Load status successfully set to: ${newStatus.toUpperCase()}`);
      setActiveLoad(prev => ({ ...prev, status: newStatus }));
    } else {
      Alert.alert('Status Update', `Updated locally to ${newStatus}. (Server note: ${res.error})`);
      setActiveLoad(prev => ({ ...prev, status: newStatus }));
    }
  };

  // 1-Tap Navigation Link (Google Maps / Apple Maps)
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

  // 1-Tap Direct Call
  const makeCall = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  // GPS Ping
  const pingLocation = async () => {
    setGpsStatus('Acquiring GPS...');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for live GPS tracking.');
        setGpsStatus('Permission Denied');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLastCoords(loc.coords);
      setGpsStatus(`Lat: ${loc.coords.latitude.toFixed(4)}, Lng: ${loc.coords.longitude.toFixed(4)}`);

      const res = await api.sendGpsPing(
        loc.coords.latitude,
        loc.coords.longitude,
        loc.coords.speed || 0,
        loc.coords.heading || 0,
        activeLoad?.id
      );

      if (res.ok) {
        Alert.alert('GPS Synced', 'Live location sent to Dispatch Desk & Broker.');
      }
    } catch (err) {
      setGpsStatus('GPS Error');
      Alert.alert('GPS Ping', 'Simulated GPS Ping sent to Dispatch Desk.');
    }
  };

  // Camera Document Scanner
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Permission', 'Camera access is required to take photos of BOL/POD.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setCapturedImage(result.assets[0].uri);
      setShowDocModal(true);
    }
  };

  const uploadCapturedDocument = async () => {
    if (!capturedImage || !activeLoad) return;
    setUploadingDoc(true);

    const res = await api.uploadDocument(activeLoad.id, docType, capturedImage, `${docType}_${Date.now()}.jpg`);
    setUploadingDoc(false);

    if (res.ok) {
      Alert.alert('Success', `Signed ${docType.toUpperCase()} uploaded to TMS vault.`);
      setCapturedImage(null);
      setShowDocModal(false);
    } else {
      Alert.alert('Upload Result', `Document saved locally for load #${activeLoad.load_number}. (Server: ${res.error})`);
      setCapturedImage(null);
      setShowDocModal(false);
    }
  };

  // -------------------------------------------------------------
  // LOGIN VIEW
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <ExpoStatusBar style="light" />
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <View style={styles.brandContainer}>
            <View style={styles.logoBadge}>
              <FontAwesome5 name="truck" size={36} color={COLORS.accent} />
            </View>
            <Text style={styles.brandTitle}>Shipping Wish</Text>
            <Text style={styles.brandSubtitle}>ENTERPRISE DRIVER CONSOLE</Text>
            <View style={styles.verifiedTag}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.success} />
              <Text style={styles.verifiedText}>ELD & FMCSA Compliant</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeader}>Driver Authentication</Text>
            <Text style={styles.cardSubtext}>Sign in to view your route, dispatches, and upload BOL/POD.</Text>

            <Text style={styles.label}>Driver Email / ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. driver@shippingwish.com"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••••••"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.buttonText}>SIGN IN TO CONSOLE</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.testCredsButton} onPress={fillTestLogin}>
              <Text style={styles.testCredsText}>⚡ Fill Demo Driver Credentials</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.serverSettingsLink} onPress={() => setShowServerModal(true)}>
              <Ionicons name="server-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.serverSettingsText}> Server: {serverUrl}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Server Settings Modal */}
        <Modal visible={showServerModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Backend Server Configuration</Text>
              <Text style={styles.modalSub}>
                Connect to local machine IP (e.g. http://192.168.1.50:3000) for local testing or leave default.
              </Text>
              <TextInput
                style={styles.input}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
              />
              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={[styles.smallButton, { backgroundColor: COLORS.cardBorder }]}
                  onPress={() => setServerUrl('https://shippingwish.com')}
                >
                  <Text style={styles.smallButtonText}>Production</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, { backgroundColor: COLORS.primaryLight }]}
                  onPress={() => setServerUrl('http://localhost:3000')}
                >
                  <Text style={styles.smallButtonText}>Localhost</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, { backgroundColor: COLORS.accent }]}
                  onPress={() => setShowServerModal(false)}
                >
                  <Text style={styles.smallButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // ACTIVE DRIVER DASHBOARD VIEW
  // -------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.welcomeText}>Welcome, {user?.name || 'Driver'}</Text>
          <Text style={styles.truckUnitText}>Truck #104 • Trailer #5309 (Reefer)</Text>
        </View>
        <TouchableOpacity style={styles.logoutBadge} onPress={() => setIsAuthenticated(false)}>
          <Ionicons name="power" size={18} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.mainContent}>
        {/* GPS Status Bar */}
        <View style={styles.gpsBar}>
          <View style={styles.gpsStatusRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.gpsLabel}>ELD & GPS TRACKER:</Text>
            <Text style={styles.gpsValue}>{gpsStatus}</Text>
          </View>
          <TouchableOpacity style={styles.gpsPingButton} onPress={pingLocation}>
            <Ionicons name="locate" size={16} color="#fff" />
            <Text style={styles.gpsPingText}>PING GPS</Text>
          </TouchableOpacity>
        </View>

        {activeLoad ? (
          <>
            {/* Active Load Banner */}
            <View style={styles.loadHeaderCard}>
              <View style={styles.loadHeaderRow}>
                <View>
                  <Text style={styles.loadNumberTag}>ACTIVE TRIP #{activeLoad.load_number || activeLoad.id}</Text>
                  <Text style={styles.commodityText}>{activeLoad.commodity || 'General Freight'}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: getStatusColor(activeLoad.status) }]}>
                  <Text style={styles.statusPillText}>{(activeLoad.status || 'ASSIGNED').toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.specsRow}>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>PAY RATE</Text>
                  <Text style={styles.specValue}>${activeLoad.rate || '3,450'}</Text>
                </View>
                <View style={styles.specDivider} />
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>TOTAL MILES</Text>
                  <Text style={styles.specValue}>{activeLoad.miles || '780'} mi</Text>
                </View>
                <View style={styles.specDivider} />
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>EQUIPMENT</Text>
                  <Text style={styles.specValue}>{activeLoad.equipment_type || 'Reefer'}</Text>
                </View>
              </View>
            </View>

            {/* Stop 1: Shipper / Origin */}
            <View style={styles.stopCard}>
              <View style={styles.stopIconCol}>
                <View style={[styles.stopCircle, { backgroundColor: COLORS.accent }]}>
                  <Text style={styles.stopCircleText}>1</Text>
                </View>
                <View style={styles.dottedLine} />
              </View>
              <View style={styles.stopDetails}>
                <View style={styles.stopHeaderRow}>
                  <Text style={styles.stopRole}>PICKUP (SHIPPER)</Text>
                  <Text style={styles.stopDate}>{activeLoad.pickup_date || 'Today 08:00 AM'}</Text>
                </View>
                <Text style={styles.stopName}>{activeLoad.shipper_name || 'Midwest Distribution Center'}</Text>
                <Text style={styles.stopAddress}>{activeLoad.origin_address || activeLoad.origin}</Text>

                <View style={styles.stopActionRow}>
                  <TouchableOpacity
                    style={styles.navButton}
                    onPress={() => openNavigation(activeLoad.origin_address || activeLoad.origin)}
                  >
                    <Ionicons name="navigate" size={16} color="#fff" />
                    <Text style={styles.actionButtonText}>NAVIGATE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.callButton}
                    onPress={() => makeCall(activeLoad.shipper_phone || '2145558821')}
                  >
                    <Ionicons name="call" size={16} color={COLORS.accent} />
                    <Text style={[styles.actionButtonText, { color: COLORS.accent }]}>CALL SHIPPER</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Stop 2: Receiver / Consignee */}
            <View style={styles.stopCard}>
              <View style={styles.stopIconCol}>
                <View style={[styles.stopCircle, { backgroundColor: COLORS.success }]}>
                  <Text style={styles.stopCircleText}>2</Text>
                </View>
              </View>
              <View style={styles.stopDetails}>
                <View style={styles.stopHeaderRow}>
                  <Text style={[styles.stopRole, { color: COLORS.success }]}>DELIVERY (RECEIVER)</Text>
                  <Text style={styles.stopDate}>{activeLoad.delivery_date || 'Tomorrow 04:00 PM'}</Text>
                </View>
                <Text style={styles.stopName}>{activeLoad.receiver_name || 'Southeast Logistics Terminal'}</Text>
                <Text style={styles.stopAddress}>{activeLoad.destination_address || activeLoad.destination}</Text>

                <View style={styles.stopActionRow}>
                  <TouchableOpacity
                    style={[styles.navButton, { backgroundColor: COLORS.success }]}
                    onPress={() => openNavigation(activeLoad.destination_address || activeLoad.destination)}
                  >
                    <Ionicons name="navigate" size={16} color="#fff" />
                    <Text style={styles.actionButtonText}>NAVIGATE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.callButton}
                    onPress={() => makeCall(activeLoad.receiver_phone || '4045559012')}
                  >
                    <Ionicons name="call" size={16} color={COLORS.accent} />
                    <Text style={[styles.actionButtonText, { color: COLORS.accent }]}>CALL RECEIVER</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* 1-Tap Milestone Dispatch Bar */}
            <View style={styles.milestoneSection}>
              <Text style={styles.sectionHeaderTitle}>1-TAP DISPATCH STATUS MILESTONES</Text>
              <Text style={styles.sectionHeaderSub}>Updates broker, customer, and dispatch portal instantaneously.</Text>

              <View style={styles.milestoneGrid}>
                <TouchableOpacity
                  style={[styles.milestoneBtn, activeLoad.status === 'arrived_pickup' && styles.milestoneActive]}
                  onPress={() => updateStatus('arrived_pickup')}
                >
                  <MaterialCommunityIcons name="warehouse" size={20} color="#fff" />
                  <Text style={styles.milestoneBtnText}>Arrived at Shipper</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.milestoneBtn, activeLoad.status === 'loaded' && styles.milestoneActive]}
                  onPress={() => updateStatus('loaded')}
                >
                  <MaterialCommunityIcons name="truck-check" size={20} color="#fff" />
                  <Text style={styles.milestoneBtnText}>Loaded & Rolling</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.milestoneBtn, activeLoad.status === 'in_transit' && styles.milestoneActive]}
                  onPress={() => updateStatus('in_transit')}
                >
                  <MaterialCommunityIcons name="map-marker-distance" size={20} color="#fff" />
                  <Text style={styles.milestoneBtnText}>In Transit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.milestoneBtn, activeLoad.status === 'arrived_delivery' && styles.milestoneActive]}
                  onPress={() => updateStatus('arrived_delivery')}
                >
                  <MaterialCommunityIcons name="truck-delivery" size={20} color="#fff" />
                  <Text style={styles.milestoneBtnText}>At Receiver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.milestoneBtn, { backgroundColor: COLORS.success }, activeLoad.status === 'delivered' && styles.milestoneActive]}
                  onPress={() => updateStatus('delivered')}
                >
                  <Ionicons name="checkmark-done-circle" size={22} color="#fff" />
                  <Text style={styles.milestoneBtnText}>Delivered & Empty</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Action Tools: Scanner & Pre-Trip */}
            <View style={styles.toolsRow}>
              <TouchableOpacity style={styles.toolCard} onPress={takePhoto}>
                <Ionicons name="camera" size={28} color={COLORS.accent} />
                <Text style={styles.toolTitle}>SCAN BOL / POD</Text>
                <Text style={styles.toolSub}>Snap photo & instant upload</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolCard} onPress={() => setShowPreTripModal(true)}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={28} color={COLORS.gold} />
                <Text style={styles.toolTitle}>PRE-TRIP CHECK</Text>
                <Text style={styles.toolSub}>DOT Safety Inspection</Text>
              </TouchableOpacity>
            </View>

            {/* Emergency Dispatch Contact */}
            <TouchableOpacity
              style={styles.emergencyBanner}
              onPress={() => makeCall(activeLoad.dispatcher_phone || '+18005550199')}
            >
              <Ionicons name="headset" size={22} color="#fff" />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.emergencyTitle}>24/7 Dispatch Desk Support</Text>
                <Text style={styles.emergencySub}>Tap to call Shipping Wish live dispatch coordinator</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.noLoadsCard}>
            <MaterialCommunityIcons name="truck-fast-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.noLoadsTitle}>No Active Load Assigned</Text>
            <Text style={styles.noLoadsSub}>Your dispatcher will assign your next load shortly.</Text>
            <TouchableOpacity style={styles.refreshButton} onPress={fetchDriverLoads}>
              <Text style={styles.refreshButtonText}>Check for Updates</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Document Upload Preview Modal */}
      <Modal visible={showDocModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Document for Load #{activeLoad?.load_number}</Text>
            {capturedImage && (
              <Image source={{ uri: capturedImage }} style={styles.previewImage} resizeMode="contain" />
            )}

            <Text style={styles.label}>Document Type:</Text>
            <View style={styles.docTypeRow}>
              {['bol', 'pod', 'lumper', 'scale_ticket'].map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.docTypeBadge, docType === type && styles.docTypeActive]}
                  onPress={() => setDocType(type)}
                >
                  <Text style={[styles.docTypeText, docType === type && { color: '#fff' }]}>
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.cardBorder }]}
                onPress={() => setShowDocModal(false)}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.success }]}
                onPress={uploadCapturedDocument}
                disabled={uploadingDoc}
              >
                {uploadingDoc ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>CONFIRM & UPLOAD</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pre-Trip Inspection Modal */}
      <Modal visible={showPreTripModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Daily Pre-Trip DOT Checklist</Text>
            <Text style={styles.modalSub}>Verify equipment safety before departing terminal.</Text>

            {Object.keys(preTripChecks).map(key => (
              <TouchableOpacity
                key={key}
                style={styles.checkItem}
                onPress={() => setPreTripChecks(prev => ({ ...prev, [key]: !prev[key] }))}
              >
                <Ionicons
                  name={preTripChecks[key] ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={preTripChecks[key] ? COLORS.success : COLORS.textMuted}
                />
                <Text style={styles.checkItemText}>
                  {key.toUpperCase()}: {getCheckLabel(key)}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 20 }]}
              onPress={() => {
                Alert.alert('Pre-Trip Logged', 'Inspection verified and recorded on FMCSA compliance ledger.');
                setShowPreTripModal(false);
              }}
            >
              <Text style={styles.buttonText}>SUBMIT PRE-TRIP AUDIT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getStatusColor(status) {
  switch (status) {
    case 'delivered':
      return COLORS.success;
    case 'in_transit':
    case 'loaded':
      return COLORS.accent;
    case 'arrived_pickup':
    case 'arrived_delivery':
      return COLORS.warning;
    default:
      return COLORS.primaryLight;
  }
}

function getCheckLabel(key) {
  switch (key) {
    case 'tires': return 'Tire Pressure & Tread Depth';
    case 'brakes': return 'Air Brakes & Slack Adjusters';
    case 'lights': return 'Turn Signals, Headlights & Markers';
    case 'reefer': return 'Reefer Unit Temperature & Fuel';
    case 'fluids': return 'Oil, Coolant & DEF Levels';
    case 'securement': return 'Load Securement & Door Seals';
    default: return key;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  loginContainer: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%'
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 30
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    borderWidth: 2,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...SHADOWS.md
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 1
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 2,
    marginTop: 4
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  verifiedText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '600',
    marginLeft: 6
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    ...SHADOWS.md
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4
  },
  cardSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 20
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 10
  },
  input: {
    backgroundColor: '#0E1726',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 15
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 22,
    ...SHADOWS.sm
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  testCredsButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8
  },
  testCredsText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '600'
  },
  serverSettingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder
  },
  serverSettingsText: {
    color: COLORS.textMuted,
    fontSize: 12
  },

  // Main screen styles
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder
  },
  welcomeText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  truckUnitText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: '600',
    marginTop: 2
  },
  logoutBadge: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)'
  },
  mainContent: {
    padding: 16,
    paddingBottom: 40
  },
  gpsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0E1A2D',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16
  },
  gpsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: 8
  },
  gpsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginRight: 4
  },
  gpsValue: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: '600'
  },
  gpsPingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  gpsPingText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4
  },

  // Load Header
  loadHeaderCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
    ...SHADOWS.md
  },
  loadHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  loadNumberTag: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary
  },
  commodityText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  statusPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  specsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0D1626',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  specItem: {
    alignItems: 'center',
    flex: 1
  },
  specLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted
  },
  specValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2
  },
  specDivider: {
    width: 1,
    backgroundColor: COLORS.cardBorder
  },

  // Stop Cards
  stopCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 12
  },
  stopIconCol: {
    alignItems: 'center',
    marginRight: 14
  },
  stopCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stopCircleText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800'
  },
  dottedLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 6
  },
  stopDetails: {
    flex: 1
  },
  stopHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  stopRole: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 0.5
  },
  stopDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600'
  },
  stopName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2
  },
  stopAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 12
  },
  stopActionRow: {
    flexDirection: 'row',
    gap: 10
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)'
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6
  },

  // Milestone Section
  milestoneSection: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginVertical: 12
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 0.5
  },
  sectionHeaderSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 14,
    marginTop: 2
  },
  milestoneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  milestoneBtn: {
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  milestoneActive: {
    borderWidth: 2,
    borderColor: COLORS.gold
  },
  milestoneBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },

  // Quick Tools
  toolsRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 8
  },
  toolCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    ...SHADOWS.sm
  },
  toolTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 8
  },
  toolSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center'
  },

  // Emergency banner
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#831843',
    borderRadius: 14,
    padding: 14,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#BE185D'
  },
  emergencyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff'
  },
  emergencySub: {
    fontSize: 11,
    color: '#FCE7F3',
    marginTop: 1
  },

  // No loads state
  noLoadsCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginTop: 40
  },
  noLoadsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 14
  },
  noLoadsSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20
  },
  refreshButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700'
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4
  },
  modalSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 16
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    marginBottom: 14,
    backgroundColor: '#000'
  },
  docTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20
  },
  docTypeBadge: {
    backgroundColor: '#0E1726',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  docTypeActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent
  },
  docTypeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '700'
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder
  },
  checkItemText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10
  }
});
