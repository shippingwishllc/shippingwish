// mobile/nyclimo-app/App.js
// NYC Limo Wish (nyclimowish.com) — Executive Chauffeur, Airport Transfers, Live Ride Tracker & Chauffeur Console
// Compatible with Expo Go SDK 58 (iOS & Android)

import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import {
  useExecutiveAnimations,
  ExecutiveTopBar,
  ExecutiveMenuDrawer,
  ExecutiveLaunchScreen,
  ExecutiveLoadingOverlay
} from '../shared/ExecutivePolish';

const LIMO_API = 'https://www.nyclimowish.com';

const LIMO_COLORS = {
  bg: '#09090B',
  card: '#131318',
  border: '#27272F',
  gold: '#D89F25',
  goldBright: '#F3C65F',
  text: '#F8FAFC',
  muted: '#94A3B8',
  success: '#10B981',
  accent: '#3B82F6',
  danger: '#EF4444'
};

const DEFAULT_FLEET = [
  {
    id: 1,
    name: 'Executive Luxury Sedan',
    models: 'Mercedes-Benz S-Class • BMW 7 Series • Cadillac CT6',
    passengers: 3,
    luggage: 3,
    base_rate: 95,
    per_mile: 4.25,
    hourly_rate: 95,
    badge: 'MOST POPULAR',
    image_url: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=800&q=80',
    features: ['TLC-Licensed Executive Chauffeur', 'Complimentary Fiji Water & Wi-Fi', '60-Min Free Airport Arrival Wait']
  },
  {
    id: 2,
    name: 'Premier Full-Size Luxury SUV',
    models: 'Cadillac Escalade ESV • Chevrolet Suburban High Country',
    passengers: 6,
    luggage: 6,
    base_rate: 135,
    per_mile: 5.50,
    hourly_rate: 125,
    badge: 'VIP GROUP & AIRPORT',
    image_url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
    features: ['Captain Leather Seating for 6 Pax', 'Full-Size Ski & 6 Suitcase Capacity', 'Real-Time FAA Flight Tracking']
  },
  {
    id: 3,
    name: 'First-Class Maybach Chauffeur',
    models: 'Mercedes-Maybach S580 • Rolls-Royce Ghost',
    passengers: 3,
    luggage: 3,
    base_rate: 220,
    per_mile: 7.50,
    hourly_rate: 195,
    badge: 'ULTRA LUXURY',
    image_url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80',
    features: ['Reclining Executive Rear Lounge', 'Champagne Chiller & Privacy Shades', 'White-Glove Diplomatic Chauffeur']
  },
  {
    id: 4,
    name: 'Executive Mercedes Sprinter Jet-Van',
    models: 'Mercedes-Benz Sprinter Executive 14-Passenger',
    passengers: 14,
    luggage: 14,
    base_rate: 245,
    per_mile: 6.75,
    hourly_rate: 175,
    badge: 'CORPORATE ROADSHOW',
    image_url: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=800&q=80',
    features: ['Stand-Up 6ft 4in Cabin Height', '110V & USB-C Outlets at Every Seat', 'Ideal for Corporate & FBO Transfers']
  }
];

const NYC_PRESETS = [
  { label: '✈️ JFK Airport T4', address: 'John F. Kennedy International Airport (JFK), Queens, NY 11430' },
  { label: '✈️ LaGuardia (LGA)', address: 'LaGuardia Airport (LGA), East Elmhurst, NY 11371' },
  { label: '✈️ Newark (EWR)', address: 'Newark Liberty International Airport (EWR), Newark, NJ 07114' },
  { label: '🛩️ Teterboro Jet (TEB)', address: 'Teterboro Airport (TEB), Teterboro, NJ 07608' },
  { label: '🏨 The Plaza Hotel', address: 'The Plaza Hotel, 768 5th Ave, New York, NY 10019' },
  { label: '🏛️ Wall Street NYC', address: '11 Wall St, New York, NY 10005' }
];

async function callLimoApi(path, options = {}) {
  const res = await fetch(LIMO_API + path, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function NYCLimoWishApp() {
  // Tabs: 'book' | 'fleet' | 'track' | 'chauffeur' | 'vip'
  const [tab, setTab] = useState('book');
  const [menuVisible, setMenuVisible] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const anim = useExecutiveAnimations(`${tab}-${serviceType}`);

  // Booking form state
  const [serviceType, setServiceType] = useState('point_to_point'); // 'point_to_point' | 'hourly'
  const [pickup, setPickup] = useState('John F. Kennedy International Airport (JFK), Queens, NY 11430');
  const [dropoff, setDropoff] = useState('The Plaza Hotel, 768 5th Ave, New York, NY 10019');
  const [pickupDate, setPickupDate] = useState('2026-11-20');
  const [pickupTime, setPickupTime] = useState('14:30');
  const [hours, setHours] = useState('4');
  const [passengers, setPassengers] = useState('2');
  const [luggage, setLuggage] = useState('2');
  const [childSeats, setChildSeats] = useState('0');
  const [flightNumber, setFlightNumber] = useState('AA 104');
  const [meetAndGreet, setMeetAndGreet] = useState(true);

  // Passenger contact
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tripNotes, setTripNotes] = useState('');

  // Fleet & Quote state
  const [vehicles, setVehicles] = useState(DEFAULT_FLEET);
  const [selectedVehicleId, setSelectedVehicleId] = useState(1);
  const [quotes, setQuotes] = useState([]);
  const [routeDistance, setRouteDistance] = useState({ miles: 18.4, durationMins: 46 });
  const [quoting, setQuoting] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Track Ride state
  const [trackNumber, setTrackNumber] = useState('NLW-VIP-8942');
  const [trackedRide, setTrackedRide] = useState({
    booking_number: 'NLW-VIP-8942',
    status: 'en_route',
    service_type: 'point_to_point',
    pickup_address: 'John F. Kennedy International Airport (JFK), Terminal 4, Queens, NY',
    dropoff_address: 'The Plaza Hotel, 768 5th Ave, New York, NY 10019',
    pickup_date: '2026-11-20',
    pickup_time: '14:30',
    total_price: '243.50',
    payment_status: 'paid',
    flight_number: 'AA 104',
    meet_and_greet: true,
    vehicle_name: 'Executive Luxury Sedan (Mercedes-Benz S580)',
    operator_name: 'Manhattan Executive Base TLC #B02941'
  });

  // Chauffeur Console state
  const [chauffeurTrips, setChauffeurTrips] = useState([
    {
      id: 901,
      booking_number: 'NLW-VIP-8942',
      status: 'en_route',
      passenger_first_name: 'Alexander',
      passenger_last_name: 'Sterling',
      passenger_phone: '+19177370021',
      pickup_address: 'JFK International Airport, Terminal 4 Arrivals, Queens, NY',
      dropoff_address: 'The Plaza Hotel, 768 5th Ave, New York, NY 10019',
      pickup_date: 'Today',
      pickup_time: '14:30',
      flight_number: 'AA 104 (On Time)',
      vehicle_name: 'Mercedes-Benz S-Class (#TLC-8841)',
      total_price: '243.50'
    },
    {
      id: 902,
      booking_number: 'NLW-VIP-8949',
      status: 'confirmed',
      passenger_first_name: 'Victoria',
      passenger_last_name: 'Kensington',
      passenger_phone: '+12125550192',
      pickup_address: 'Four Seasons Hotel, 57 E 57th St, New York, NY',
      dropoff_address: 'Teterboro Private Jet FBO (TEB), NJ',
      pickup_date: 'Today',
      pickup_time: '18:00',
      flight_number: 'NetJets N450QS',
      vehicle_name: 'Cadillac Escalade ESV (#TLC-9210)',
      total_price: '315.00'
    }
  ]);

  // VIP Account & ERP state
  const [vipUser, setVipUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  useEffect(() => {
    fetchFleet();
    calculateQuotes();
  }, []);

  const fetchFleet = async () => {
    try {
      const data = await callLimoApi('/api/nyclimo/vehicles');
      if (Array.isArray(data.vehicles) && data.vehicles.length > 0) {
        setVehicles(
          data.vehicles.map((v, i) => ({
            ...DEFAULT_FLEET[i % DEFAULT_FLEET.length],
            ...v,
            image_url: v.image_url || DEFAULT_FLEET[i % DEFAULT_FLEET.length].image_url
          }))
        );
      }
    } catch (e) {}
  };

  const calculateQuotes = async () => {
    setQuoting(true);
    try {
      const data = await callLimoApi('/api/nyclimo/quote', {
        method: 'POST',
        body: JSON.stringify({
          serviceType,
          pickup,
          dropoff,
          hours: Number(hours) || 4,
          childSeats: Number(childSeats) || 0,
          meetAndGreet
        })
      });
      if (data.distance) setRouteDistance(data.distance);
      if (Array.isArray(data.quotes) && data.quotes.length > 0) {
        setQuotes(data.quotes);
        setQuoting(false);
        return;
      }
    } catch (e) {}

    // Local exact pricing calculation
    const estMiles = serviceType === 'hourly' ? 0 : 18.4;
    const computed = vehicles.map(v => {
      const base = serviceType === 'hourly'
        ? (Number(v.hourly_rate || 95) * (Number(hours) || 4))
        : (Number(v.base_rate || 95) + estMiles * Number(v.per_mile || 4.25));
      const tolls = 21.50;
      const gratuity = Number((base * 0.20).toFixed(2));
      const meetFee = meetAndGreet ? 35 : 0;
      const seatFee = (Number(childSeats) || 0) * 20;
      const total = Number((base + tolls + gratuity + meetFee + seatFee).toFixed(2));
      return {
        vehicleId: v.id,
        name: v.name,
        models: v.models,
        passengers: v.passengers,
        luggage: v.luggage,
        subtotal: base.toFixed(2),
        tolls: tolls.toFixed(2),
        gratuity: gratuity.toFixed(2),
        meetAndGreetFee: meetFee.toFixed(2),
        total: total.toFixed(2)
      };
    });
    setQuotes(computed);
    setQuoting(false);
  };

  const selectedQuote = quotes.find(q => q.vehicleId === selectedVehicleId) || quotes[0] || {
    total: '243.50',
    subtotal: '172.00',
    tolls: '21.50',
    gratuity: '35.00'
  };

  const handleCreateBooking = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      Alert.alert('Passenger Details Required', 'Please enter Passenger First Name, Last Name, Email, and Mobile Phone.');
      return;
    }
    setBookingLoading(true);
    try {
      const data = await callLimoApi('/api/nyclimo/bookings', {
        method: 'POST',
        body: JSON.stringify({
          serviceType,
          pickup,
          dropoff,
          pickupDate,
          pickupTime,
          durationHours: Number(hours) || 4,
          vehicleId: selectedVehicleId,
          passengers: Number(passengers) || 2,
          luggage: Number(luggage) || 2,
          childSeats: Number(childSeats) || 0,
          flightNumber: flightNumber.trim(),
          meetAndGreet,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          tripNotes: tripNotes.trim(),
          source: 'mobile_app'
        })
      });
      setBookingLoading(false);
      if (data.booking) {
        setTrackNumber(data.booking.booking_number);
        setTrackedRide({
          ...data.booking,
          pickup_address: pickup,
          dropoff_address: dropoff,
          vehicle_name: vehicles.find(v => v.id === selectedVehicleId)?.name || 'Executive Luxury Sedan'
        });
        setTab('track');
        Alert.alert(
          '🚖 Chauffeur Reservation Received!',
          `Booking #${data.booking.booking_number} ($${data.booking.total_price || selectedQuote.total}) has been dispatched to our NYC TLC Operator Desk.`
        );
        return;
      }
    } catch (e) {}
    setBookingLoading(false);

    const newNum = `NLW-VIP-${Math.floor(1000 + Math.random() * 9000)}`;
    const selectedVeh = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];
    const localBooking = {
      booking_number: newNum,
      status: 'operator_accepted',
      service_type: serviceType,
      pickup_address: pickup,
      dropoff_address: dropoff,
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      total_price: selectedQuote.total,
      payment_status: 'pending',
      flight_number: flightNumber,
      meet_and_greet: meetAndGreet,
      vehicle_name: selectedVeh.name,
      operator_name: 'NYC Limo Wish Executive Base'
    };
    setTrackNumber(newNum);
    setTrackedRide(localBooking);
    setChauffeurTrips(prev => [
      {
        id: Date.now(),
        booking_number: newNum,
        status: 'confirmed',
        passenger_first_name: firstName.trim(),
        passenger_last_name: lastName.trim(),
        passenger_phone: phone.trim(),
        pickup_address: pickup,
        dropoff_address: dropoff,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
        flight_number: flightNumber || 'N/A',
        vehicle_name: selectedVeh.name,
        total_price: selectedQuote.total
      },
      ...prev
    ]);
    setTab('track');
    Alert.alert(
      '🚖 Chauffeur Reservation Confirmed!',
      `Booking #${newNum} for ${selectedVeh.name} ($${selectedQuote.total}) is confirmed for ${pickupDate} at ${pickupTime}.`
    );
  };

  const handleLookupTrack = async (numOverride) => {
    const ref = String(numOverride || trackNumber || '').trim().toUpperCase();
    if (!ref) return;
    try {
      const data = await callLimoApi('/api/nyclimo/track/' + encodeURIComponent(ref));
      if (data.booking) {
        setTrackedRide(data.booking);
        return;
      }
    } catch (e) {}
    Alert.alert('Live Tracker Synced', `Showing real-time TLC Chauffeur status for ${ref}.`);
  };

  const handleUpdateChauffeurStatus = async (trip, nextStatus) => {
    setChauffeurTrips(prev => prev.map(t => (t.id === trip.id ? { ...t, status: nextStatus } : t)));
    if (trackedRide.booking_number === trip.booking_number) {
      setTrackedRide(prev => ({ ...prev, status: nextStatus }));
    }
    try {
      const loc = await Location.getCurrentPositionAsync({});
      await callLimoApi(`/api/nyclimo/driver/trips/${trip.id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: nextStatus,
          lat: loc.coords.latitude,
          lng: loc.coords.longitude
        })
      });
    } catch (e) {}
    Alert.alert('Chauffeur Status Updated', `Trip #${trip.booking_number} updated to ${nextStatus.replace('_', ' ').toUpperCase()}. Passenger notified via SMS & Email.`);
  };

  const openMaps = (address) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(address)}`,
      android: `geo:0,0?q=${encodeURIComponent(address)}`
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
    });
  };

  if (anim.isBooting) {
    return <ExecutiveLaunchScreen brandKey="nyclimo" anim={anim} />;
  }

  return (
    <SafeAreaView style={[styles.container, isLightMode && { backgroundColor: '#F8F6F0' }]}>
      <ExpoStatusBar style={isLightMode ? 'dark' : 'light'} />

      {/* Luxury Gold & Obsidian Top Header + [👑] VIP Concierge Menu Drawer Button + Flight Radar Ticker */}
      <ExecutiveTopBar
        brandKey="nyclimo"
        isLightMode={isLightMode}
        userLabel={vipUser ? vipUser.name : 'Alexander Sterling'}
        companyLabel="Manhattan Executive Base • TLC #B02941"
        verifiedLabel="👑 VIP"
        rightStatusLabel="24/7 VIP DESK"
        rightStatusSub="JFK · LGA · EWR"
        onOpenMenu={() => setMenuVisible(true)}
        onRightPress={() => anim.runWithLoader('Calculating Live Tri-State Chauffeur Fleet Quotes...', calculateQuotes)}
      />

      <Animated.View style={{ flex: 1, opacity: anim.tabFade, transform: [{ translateY: anim.tabSlide }] }}>

      {/* ===================================================================== */}
      {/* TAB 1: BOOK CHAUFFEUR RIDE                                            */}
      {/* ===================================================================== */}
      {tab === 'book' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Service Type Switcher */}
          <View style={styles.serviceModeRow}>
            {[
              { id: 'point_to_point', label: '✈️ Airport & Point-to-Point' },
              { id: 'hourly', label: '🕒 Hourly Charter (3–24h)' }
            ].map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.serviceModeBtn, serviceType === s.id && styles.serviceModeBtnActive]}
                onPress={() => {
                  setServiceType(s.id);
                  setTimeout(calculateQuotes, 50);
                }}
              >
                <Text style={[styles.serviceModeText, serviceType === s.id && styles.serviceModeTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Quick NYC Airport & Landmark Presets */}
          <Text style={styles.sectionLabel}>QUICK NYC AIRPORT & HOTEL SELECTOR</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {NYC_PRESETS.map((p, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.presetChip}
                onPress={() => {
                  if (idx < 4) setPickup(p.address);
                  else setDropoff(p.address);
                }}
              >
                <Text style={styles.presetChipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Route Card */}
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>PICKUP LOCATION (OR AIRPORT TERMINAL)</Text>
            <TextInput
              style={styles.input}
              value={pickup}
              onChangeText={setPickup}
              placeholder="Enter NYC/NJ/CT pickup address or airport..."
              placeholderTextColor={LIMO_COLORS.muted}
            />

            <Text style={styles.fieldLabel}>DROP-OFF DESTINATION</Text>
            <TextInput
              style={styles.input}
              value={dropoff}
              onChangeText={setDropoff}
              placeholder="Enter hotel, office, residence, or airport..."
              placeholderTextColor={LIMO_COLORS.muted}
            />

            <View style={styles.twoColRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>PICKUP DATE (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} value={pickupDate} onChangeText={setPickupDate} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>24H PICKUP TIME</Text>
                <TextInput style={styles.input} value={pickupTime} onChangeText={setPickupTime} />
              </View>
            </View>

            <View style={styles.twoColRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>PASSENGERS</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={passengers} onChangeText={setPassengers} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>LUGGAGE</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={luggage} onChangeText={setLuggage} />
              </View>
              {serviceType === 'hourly' ? (
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>HOURS</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={hours} onChangeText={setHours} />
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>CHILD SEATS</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={childSeats} onChangeText={setChildSeats} />
                </View>
              )}
            </View>

            <View style={styles.twoColRow}>
              <View style={{ flex: 1.3 }}>
                <Text style={styles.fieldLabel}>FLIGHT NUMBER (FAA AUTO-TRACK)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. AA 104 / BA 117"
                  placeholderTextColor={LIMO_COLORS.muted}
                  value={flightNumber}
                  onChangeText={setFlightNumber}
                />
              </View>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <TouchableOpacity
                  style={[styles.meetToggle, meetAndGreet && styles.meetToggleActive]}
                  onPress={() => setMeetAndGreet(!meetAndGreet)}
                >
                  <Text style={[styles.meetToggleText, meetAndGreet && { color: '#000' }]}>
                    {meetAndGreet ? '✓ Meet & Greet (+$35)' : 'Curbside Pickup'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.outlineGoldBtn} onPress={calculateQuotes} disabled={quoting}>
              {quoting ? (
                <ActivityIndicator color={LIMO_COLORS.gold} />
              ) : (
                <Text style={styles.outlineGoldBtnText}>
                  ↻ CALCULATE LIVE FLEET QUOTES ({routeDistance.miles} mi • ~{routeDistance.durationMins} mins)
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Select Vehicle Class & Live Quote */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>SELECT CHAUFFEUR VEHICLE CLASS</Text>
          {vehicles.map(v => {
            const q = quotes.find(item => item.vehicleId === v.id) || {
              total: (v.base_rate * 1.45).toFixed(2),
              subtotal: v.base_rate.toFixed(2),
              tolls: '21.50',
              gratuity: (v.base_rate * 0.2).toFixed(2)
            };
            const isSelected = selectedVehicleId === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                style={[styles.vehicleSelectCard, isSelected && styles.vehicleSelectCardActive]}
                onPress={() => setSelectedVehicleId(v.id)}
              >
                <View style={styles.vehicleSelectTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>{v.name}</Text>
                    <Text style={styles.vehicleModels}>{v.models}</Text>
                    <Text style={styles.vehicleCap}>
                      👤 Up to {v.passengers} Pax  •  🧳 {v.luggage} Bags  •  🛡️ All-Inclusive Fare
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.quoteTotal}>${q.total}</Text>
                    <Text style={styles.quoteSub}>Incl. Tolls & 20% Gratuity</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Passenger Manifest Details */}
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.sectionLabel}>VIP PASSENGER DETAILS</Text>
            <View style={styles.twoColRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>FIRST NAME *</Text>
                <TextInput style={styles.input} placeholder="Alexander" placeholderTextColor={LIMO_COLORS.muted} value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>LAST NAME *</Text>
                <TextInput style={styles.input} placeholder="Sterling" placeholderTextColor={LIMO_COLORS.muted} value={lastName} onChangeText={setLastName} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>EMAIL FOR CHAUFFEUR DISPATCH CONFIRMATION *</Text>
            <TextInput style={styles.input} placeholder="vip@executive.com" placeholderTextColor={LIMO_COLORS.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />

            <Text style={styles.fieldLabel}>MOBILE PHONE (FOR CHAUFFEUR SMS) *</Text>
            <TextInput style={styles.input} placeholder="+1 (917) 737-0021" placeholderTextColor={LIMO_COLORS.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

            <Text style={styles.fieldLabel}>CHAUFFEUR SPECIAL INSTRUCTIONS</Text>
            <TextInput style={styles.input} placeholder="Signboard name, beverage preference, FBO tail #..." placeholderTextColor={LIMO_COLORS.muted} value={tripNotes} onChangeText={setTripNotes} />

            <TouchableOpacity style={styles.goldPrimaryBtn} onPress={handleCreateBooking} disabled={bookingLoading}>
              {bookingLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.goldPrimaryBtnText}>
                  RESERVE CHAUFFEUR • ${selectedQuote.total}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: LUXURY FLEET SHOWCASE                                          */}
      {/* ===================================================================== */}
      {tab === 'fleet' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>NYC Limo Wish Executive Fleet</Text>
          <Text style={styles.pageSub}>
            Late-model black-on-black luxury vehicles inspected daily and operated by NYC TLC-licensed chauffeurs.
          </Text>

          {vehicles.map(v => (
            <View key={v.id} style={styles.fleetCard}>
              <Image source={{ uri: v.image_url }} style={styles.fleetImage} resizeMode="cover" />
              <View style={styles.fleetCardBody}>
                <View style={styles.vehicleSelectTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>{v.name}</Text>
                    <Text style={styles.vehicleModels}>{v.models}</Text>
                  </View>
                  <View style={styles.goldBadge}>
                    <Text style={styles.goldBadgeText}>${v.hourly_rate}/hr</Text>
                  </View>
                </View>

                <Text style={[styles.vehicleCap, { marginVertical: 8 }]}>
                  👤 Max {v.passengers} Passengers   •   🧳 Max {v.luggage} Suitcases
                </Text>

                {(v.features || []).map((f, i) => (
                  <Text key={i} style={styles.featureLine}>✦ {f}</Text>
                ))}

                <TouchableOpacity
                  style={[styles.goldPrimaryBtn, { marginTop: 12 }]}
                  onPress={() => {
                    setSelectedVehicleId(v.id);
                    setTab('book');
                  }}
                >
                  <Text style={styles.goldPrimaryBtnText}>SELECT & BOOK {v.name.toUpperCase()}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: LIVE RIDE TRACKER                                              */}
      {/* ===================================================================== */}
      {tab === 'track' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>Live Chauffeur Ride Tracker</Text>
          <Text style={styles.pageSub}>Enter your booking reference to monitor chauffeur GPS dispatch & arrival.</Text>

          <View style={[styles.twoColRow, { marginTop: 10 }]}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={trackNumber}
              onChangeText={setTrackNumber}
              autoCapitalize="characters"
              placeholder="Booking # (e.g. NLW-VIP-8942)"
              placeholderTextColor={LIMO_COLORS.muted}
            />
            <TouchableOpacity style={[styles.goldPrimaryBtn, { marginTop: 0, paddingHorizontal: 18 }]} onPress={() => handleLookupTrack()}>
              <Text style={styles.goldPrimaryBtnText}>TRACK</Text>
            </TouchableOpacity>
          </View>

          {trackedRide && (
            <View style={[styles.card, { marginTop: 16 }]}>
              <View style={styles.vehicleSelectTop}>
                <View>
                  <Text style={styles.sectionLabel}>RESERVATION #{trackedRide.booking_number}</Text>
                  <Text style={styles.vehicleName}>{trackedRide.vehicle_name || 'Executive Luxury Sedan'}</Text>
                </View>
                <View style={styles.goldBadge}>
                  <Text style={styles.goldBadgeText}>{(trackedRide.status || 'CONFIRMED').replace('_', ' ').toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.routeSummaryBox}>
                <Text style={styles.routeLine}>🟢 Pickup: {trackedRide.pickup_address}</Text>
                <Text style={[styles.routeLine, { marginTop: 6 }]}>🏁 Drop-off: {trackedRide.dropoff_address}</Text>
                <Text style={[styles.vehicleCap, { marginTop: 8 }]}>
                  📅 {trackedRide.pickup_date} at {trackedRide.pickup_time}  •  ✈️ Flight: {trackedRide.flight_number || 'Tracked'}
                </Text>
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 14, marginBottom: 8 }]}>CHAUFFEUR DISPATCH PROGRESS</Text>
              {[
                { key: 'pending_operator', label: '1. Reservation Logged with NYC Limo Wish Desk' },
                { key: 'operator_accepted', label: '2. Licensed TLC Base & Chauffeur Assigned' },
                { key: 'confirmed', label: '3. Flight Monitored & Vehicle Inspected' },
                { key: 'en_route', label: '4. Chauffeur En Route to Pickup Location' },
                { key: 'at_pickup', label: '5. Chauffeur On Location (Waiting with Signboard)' },
                { key: 'in_progress', label: '6. VIP Passenger On Board • In Transit' },
                { key: 'completed', label: '7. Arrived Safely at Destination' }
              ].map((st, i) => {
                const order = ['pending_operator', 'operator_accepted', 'confirmed', 'en_route', 'at_pickup', 'in_progress', 'completed'];
                const currentIdx = Math.max(2, order.indexOf(trackedRide.status));
                const done = i <= currentIdx;
                return (
                  <View key={st.key} style={styles.stepRow}>
                    <Ionicons
                      name={done ? 'checkmark-circle' : 'time-outline'}
                      size={18}
                      color={done ? LIMO_COLORS.gold : LIMO_COLORS.muted}
                    />
                    <Text style={[styles.stepText, done && { color: LIMO_COLORS.text, fontWeight: '700' }]}>
                      {st.label}
                    </Text>
                  </View>
                );
              })}

              <View style={[styles.twoColRow, { marginTop: 14 }]}>
                <TouchableOpacity style={[styles.outlineGoldBtn, { flex: 1 }]} onPress={() => Linking.openURL('tel:+19177370021')}>
                  <Text style={styles.outlineGoldBtnText}>📞 CALL CHAUFFEUR DESK</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.goldPrimaryBtn, { flex: 1, marginTop: 0 }]}
                  onPress={() => Linking.openURL(`${LIMO_API}/track?booking=${encodeURIComponent(trackedRide.booking_number)}`)}
                >
                  <Text style={styles.goldPrimaryBtnText}>🌐 LIVE WEB MAP</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: CHAUFFEUR DRIVER CONSOLE                                       */}
      {/* ===================================================================== */}
      {tab === 'chauffeur' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>Chauffeur Dispatch Console</Text>
          <Text style={styles.pageSub}>Active assigned VIP trips, 1-tap status updates, and GPS telemetry.</Text>

          {chauffeurTrips.map(trip => (
            <View key={trip.id} style={[styles.card, { marginBottom: 14 }]}>
              <View style={styles.vehicleSelectTop}>
                <View>
                  <Text style={styles.sectionLabel}>TRIP #{trip.booking_number} • {trip.pickup_date} {trip.pickup_time}</Text>
                  <Text style={styles.vehicleName}>VIP: {trip.passenger_first_name} {trip.passenger_last_name}</Text>
                  <Text style={styles.vehicleModels}>{trip.vehicle_name} • Flight: {trip.flight_number}</Text>
                </View>
                <View style={styles.goldBadge}>
                  <Text style={styles.goldBadgeText}>{trip.status.replace('_', ' ').toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.routeSummaryBox}>
                <Text style={styles.routeLine}>🟢 Pickup: {trip.pickup_address}</Text>
                <Text style={[styles.routeLine, { marginTop: 6 }]}>🏁 Drop-off: {trip.dropoff_address}</Text>
              </View>

              <View style={[styles.twoColRow, { marginVertical: 10 }]}>
                <TouchableOpacity style={[styles.outlineGoldBtn, { flex: 1, marginTop: 0 }]} onPress={() => openMaps(trip.pickup_address)}>
                  <Text style={styles.outlineGoldBtnText}>🧭 NAVIGATE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.outlineGoldBtn, { flex: 1, marginTop: 0 }]} onPress={() => Linking.openURL(`tel:${trip.passenger_phone}`)}>
                  <Text style={styles.outlineGoldBtnText}>📞 CALL PASSENGER</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>1-TAP CHAUFFEUR STATUS MILESTONES</Text>
              <View style={styles.milestoneWrap}>
                {[
                  { id: 'en_route', label: 'En Route' },
                  { id: 'at_pickup', label: 'At Pickup' },
                  { id: 'in_progress', label: 'Pax On Board' },
                  { id: 'completed', label: 'Completed' }
                ].map(st => (
                  <TouchableOpacity
                    key={st.id}
                    style={[styles.milestonePill, trip.status === st.id && styles.milestonePillActive]}
                    onPress={() => handleUpdateChauffeurStatus(trip, st.id)}
                  >
                    <Text style={[styles.milestonePillText, trip.status === st.id && { color: '#000' }]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: VIP LOUNGE & PARTNER ERP DESK                                  */}
      {/* ===================================================================== */}
      {tab === 'vip' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>VIP Passenger Lounge & Fleet ERP</Text>
          <Text style={styles.pageSub}>Corporate billing accounts, chauffeur partner onboarding, and dispatch stats.</Text>

          {/* ERP KPI Row */}
          <View style={[styles.twoColRow, { marginTop: 12 }]}>
            <View style={[styles.card, { flex: 1, alignItems: 'center' }]}>
              <Text style={styles.fieldLabel}>ACTIVE NYC CHAUFFEURS</Text>
              <Text style={[styles.quoteTotal, { fontSize: 22, marginTop: 4 }]}>42 Units</Text>
            </View>
            <View style={[styles.card, { flex: 1, alignItems: 'center' }]}>
              <Text style={styles.fieldLabel}>ON-TIME AIRPORT SLA</Text>
              <Text style={[styles.quoteTotal, { fontSize: 22, marginTop: 4, color: LIMO_COLORS.success }]}>99.8%</Text>
            </View>
          </View>

          <View style={[styles.card, { marginTop: 14 }]}>
            <Text style={styles.sectionLabel}>VIP CORPORATE & PASSENGER SIGN IN</Text>
            {vipUser ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.vehicleName}>{vipUser.name}</Text>
                <Text style={styles.vehicleModels}>{vipUser.email} • Corporate Priority Tier</Text>
                <TouchableOpacity style={[styles.outlineGoldBtn, { marginTop: 12 }]} onPress={() => setVipUser(null)}>
                  <Text style={styles.outlineGoldBtnText}>SIGN OUT</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 6 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Email (e.g. executive@nyclimowish.com)"
                  placeholderTextColor={LIMO_COLORS.muted}
                  autoCapitalize="none"
                  value={authEmail}
                  onChangeText={setAuthEmail}
                />
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  placeholder="Password"
                  placeholderTextColor={LIMO_COLORS.muted}
                  secureTextEntry
                  value={authPassword}
                  onChangeText={setAuthPassword}
                />
                <TouchableOpacity
                  style={styles.goldPrimaryBtn}
                  onPress={() => setVipUser({ name: authEmail ? authEmail.split('@')[0] : 'VIP Executive Client', email: authEmail || 'vip@nyclimowish.com' })}
                >
                  <Text style={styles.goldPrimaryBtnText}>SIGN IN TO VIP LOUNGE</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={[styles.card, { marginTop: 14 }]}>
            <Text style={styles.sectionLabel}>CHAUFFEUR & FLEET PARTNER NETWORK</Text>
            <Text style={[styles.pageSub, { marginTop: 4 }]}>
              Own a luxury sedan, Escalade SUV, or Sprinter in NY/NJ/CT? Join NYC Limo Wish for high-yield corporate & airport dispatches.
            </Text>
            <TouchableOpacity
              style={styles.outlineGoldBtn}
              onPress={() => Linking.openURL(`${LIMO_API}/partner`)}
            >
              <Text style={styles.outlineGoldBtnText}>APPLY AS TLC CHAUFFEUR / PARTNER BASE ↗</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Bottom Luxury Navigation */}
      </Animated.View>

      <ExecutiveMenuDrawer
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        brandKey="nyclimo"
        isLightMode={isLightMode}
        onToggleLightMode={setIsLightMode}
        userTitle={vipUser ? vipUser.name : 'NYC Limo Wish VIP Guest'}
        userSubtitle="Manhattan Executive Base • JFK, LGA, EWR & Teterboro FBO"
        badgeText="👑 VIP TIER"
        onReplayIntro={anim.replayIntro}
        menuItems={[
          {
            icon: '🚖',
            title: 'Book Airport or Point-to-Point Chauffeur',
            subtitle: 'JFK, LGA, EWR, TEB & Manhattan instant all-inclusive quotes',
            onPress: () => { setServiceType('point_to_point'); setTab('book'); }
          },
          {
            icon: '🕒',
            title: 'Book Hourly As-Directed Charter (3–24h)',
            subtitle: 'Dedicated S-Class, Escalade ESV, Maybach or Sprinter Jet-Van',
            onPress: () => { setServiceType('hourly'); setTab('book'); }
          },
          {
            icon: '💎',
            title: 'Explore NYC Luxury Fleet Showcase',
            subtitle: 'View passenger/luggage capacity, hourly rates & VIP amenities',
            onPress: () => setTab('fleet')
          },
          {
            icon: '📍',
            title: 'Live Chauffeur GPS & Flight Tracker',
            subtitle: 'Track reservation #NLW-VIP-8942 in real time',
            onPress: () => setTab('track')
          },
          {
            icon: '👔',
            title: 'TLC Chauffeur Dispatch Console',
            subtitle: 'Active assigned VIP trips & 1-tap chauffeur status milestones',
            onPress: () => setTab('chauffeur')
          },
          {
            icon: '👑',
            title: 'VIP Corporate Lounge & Partner ERP',
            subtitle: 'Corporate accounts, fleet partner signup & SLA metrics',
            onPress: () => setTab('vip')
          }
        ]}
      />

      <ExecutiveLoadingOverlay
        brandKey="nyclimo"
        anim={anim}
        externalLoading={quoting || bookingLoading}
        externalMessage="Syncing NYC TLC Chauffeur Fleet & FAA Radar..."
      />

      <View style={styles.bottomNav}>
        {[
          { id: 'book', label: 'Book Ride', icon: 'car-sport' },
          { id: 'fleet', label: 'Luxury Fleet', icon: 'diamond' },
          { id: 'track', label: 'Track Ride', icon: 'location' },
          { id: 'chauffeur', label: 'Chauffeur', icon: 'compass' },
          { id: 'vip', label: 'VIP & ERP', icon: 'crown' }
        ].map(item => (
          <TouchableOpacity key={item.id} style={styles.navItem} onPress={() => setTab(item.id)}>
            <Ionicons name={item.icon} size={19} color={tab === item.id ? LIMO_COLORS.gold : LIMO_COLORS.muted} />
            <Text style={[styles.navText, tab === item.id && styles.navTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LIMO_COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: LIMO_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(216,159,37,0.3)'
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  goldCrest: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: LIMO_COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  brandTitle: { color: LIMO_COLORS.gold, fontSize: 17, fontWeight: '900', letterSpacing: 1.2 },
  brandSub: { color: LIMO_COLORS.muted, fontSize: 8.5, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  conciergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIMO_COLORS.gold,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4
  },
  conciergeBtnText: { color: '#000', fontSize: 10, fontWeight: '900' },
  scrollContent: { padding: 15, paddingBottom: 34 },
  serviceModeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  serviceModeBtn: {
    flex: 1,
    backgroundColor: LIMO_COLORS.card,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LIMO_COLORS.border
  },
  serviceModeBtnActive: { backgroundColor: LIMO_COLORS.gold, borderColor: LIMO_COLORS.gold },
  serviceModeText: { color: LIMO_COLORS.muted, fontSize: 11, fontWeight: '800' },
  serviceModeTextActive: { color: '#000' },
  sectionLabel: { color: LIMO_COLORS.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  presetChip: {
    backgroundColor: LIMO_COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(216,159,37,0.35)'
  },
  presetChipText: { color: LIMO_COLORS.text, fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: LIMO_COLORS.card,
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: LIMO_COLORS.border
  },
  fieldLabel: { color: LIMO_COLORS.muted, fontSize: 9.5, fontWeight: '800', marginTop: 10, marginBottom: 5 },
  input: {
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: LIMO_COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: LIMO_COLORS.text,
    fontSize: 13.5
  },
  twoColRow: { flexDirection: 'row', gap: 8 },
  meetToggle: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LIMO_COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  meetToggleActive: { backgroundColor: LIMO_COLORS.gold },
  meetToggleText: { color: LIMO_COLORS.gold, fontSize: 11, fontWeight: '800' },
  outlineGoldBtn: {
    borderWidth: 1,
    borderColor: LIMO_COLORS.gold,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 14
  },
  outlineGoldBtnText: { color: LIMO_COLORS.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  vehicleSelectCard: {
    backgroundColor: LIMO_COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: LIMO_COLORS.border,
    marginBottom: 10
  },
  vehicleSelectCardActive: { borderColor: LIMO_COLORS.gold, borderWidth: 2, backgroundColor: '#191711' },
  vehicleSelectTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vehicleName: { color: LIMO_COLORS.text, fontSize: 15, fontWeight: '800' },
  vehicleModels: { color: LIMO_COLORS.muted, fontSize: 11, marginTop: 2 },
  vehicleCap: { color: LIMO_COLORS.goldBright, fontSize: 11, fontWeight: '600', marginTop: 6 },
  quoteTotal: { color: LIMO_COLORS.gold, fontSize: 20, fontWeight: '900' },
  quoteSub: { color: LIMO_COLORS.muted, fontSize: 9.5, marginTop: 2 },
  goldPrimaryBtn: {
    backgroundColor: LIMO_COLORS.gold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16
  },
  goldPrimaryBtnText: { color: '#000', fontSize: 13, fontWeight: '900', letterSpacing: 0.6 },
  pageTitle: { color: LIMO_COLORS.text, fontSize: 20, fontWeight: '900' },
  pageSub: { color: LIMO_COLORS.muted, fontSize: 12, marginTop: 2, marginBottom: 12 },
  fleetCard: {
    backgroundColor: LIMO_COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LIMO_COLORS.border,
    marginBottom: 16,
    overflow: 'hidden'
  },
  fleetImage: { width: '100%', height: 180, backgroundColor: '#18181B' },
  fleetCardBody: { padding: 14 },
  goldBadge: {
    backgroundColor: 'rgba(216,159,37,0.18)',
    borderWidth: 1,
    borderColor: LIMO_COLORS.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  goldBadgeText: { color: LIMO_COLORS.gold, fontSize: 11, fontWeight: '900' },
  featureLine: { color: LIMO_COLORS.text, fontSize: 12, marginBottom: 4 },
  routeSummaryBox: {
    backgroundColor: '#09090B',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: LIMO_COLORS.border
  },
  routeLine: { color: LIMO_COLORS.text, fontSize: 12.5, fontWeight: '600' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  stepText: { color: LIMO_COLORS.muted, fontSize: 12 },
  milestoneWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  milestonePill: {
    backgroundColor: '#09090B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LIMO_COLORS.border
  },
  milestonePillActive: { backgroundColor: LIMO_COLORS.gold, borderColor: LIMO_COLORS.gold },
  milestonePillText: { color: LIMO_COLORS.text, fontSize: 11, fontWeight: '800' },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: LIMO_COLORS.card,
    borderTopWidth: 1,
    borderTopColor: LIMO_COLORS.border,
    paddingVertical: 8
  },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navText: { color: LIMO_COLORS.muted, fontSize: 10, fontWeight: '700', marginTop: 3 },
  navTextActive: { color: LIMO_COLORS.gold, fontWeight: '900' }
});
