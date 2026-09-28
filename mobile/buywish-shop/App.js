import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, SafeAreaView, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View, Image, Linking
} from 'react-native';

const API = 'https://www.buywishonline.com';

async function api(path, options = {}, token) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function App() {
  const [screen, setScreen] = useState('shop');
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [trackNo, setTrackNo] = useState('');
  const [track, setTrack] = useState(null);
  const [selected, setSelected] = useState(null);

  async function loadProducts(nextCategory = category) {
    setLoading(true);
    setError('');
    try {
      const query = nextCategory === 'all' ? '' : `&category=${encodeURIComponent(nextCategory)}`;
      const data = await api(`/api/buywish/products?limit=48${query}`);
      setProducts(data.products || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProducts('all'); }, []);

  async function login() {
    const data = await api('/api/buywish/account/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(data.token);
    setCustomer(data.customer);
    const mine = await api('/api/buywish/account/orders', {}, data.token);
    setOrders(mine.orders || []);
    setScreen('account');
  }

  async function register() {
    const data = await api('/api/buywish/account/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    setToken(data.token);
    setCustomer(data.customer);
    setOrders([]);
    setScreen('account');
  }

  async function lookup() {
    const data = await api('/api/buywish/orders/track/' + encodeURIComponent(trackNo.trim()));
    setTrack(data.order);
  }

  const categories = ['all', 'Tech', 'Home', 'Fitness', 'Beauty', 'Kitchen', 'Pets', 'Travel'];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.brand}>BuyWishOnline</Text>
        <View style={styles.nav}>
          <Text style={styles.navLink} onPress={() => setScreen('shop')}>Shop</Text>
          <Text style={styles.navLink} onPress={() => setScreen('account')}>Account</Text>
          <Text style={styles.navLink} onPress={() => setScreen('track')}>Track</Text>
        </View>
      </View>
      {screen === 'shop' && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cats}>
            {categories.map((item) => (
              <TouchableOpacity key={item} onPress={() => { setCategory(item); loadProducts(item); }}>
                <Text style={[styles.chip, category === item && styles.chipOn]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {loading ? <ActivityIndicator color="#14120f" style={{ marginTop: 40 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <FlatList
            data={products}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={!loading ? <Text style={styles.muted}>The edit is empty until an admin syncs Zendrop products that ship to the USA, Canada, and the UK.</Text> : null}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
                {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.image} /> : null}
                <Text style={styles.cat}>{item.category}</Text>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.price}>${item.retail_price}</Text>
                <Text style={styles.muted}>{item.delivery || 'Ships to USA, Canada & UK'}</Text>
              </TouchableOpacity>
            )}
          />
          {selected ? (
            <View style={styles.sheet}>
              <Text style={styles.title}>{selected.title}</Text>
              <Text style={styles.muted}>{selected.description}</Text>
              <TouchableOpacity style={styles.button} onPress={() => Linking.openURL(`${API}/products/${selected.handle || selected.id}`)}>
                <Text style={styles.buttonText}>Open to purchase</Text>
              </TouchableOpacity>
              <Text style={styles.navLink} onPress={() => setSelected(null)}>Close</Text>
            </View>
          ) : null}
        </View>
      )}
      {screen === 'account' && (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {customer ? (
            <View>
              <Text style={styles.title}>{customer.name}</Text>
              <Text style={styles.muted}>{customer.email}</Text>
              {orders.map((order) => (
                <View key={order.order_number} style={styles.card}>
                  <Text style={styles.title}>{order.order_number}</Text>
                  <Text>{order.payment_status} · {order.fulfillment_status}</Text>
                  <Text>${order.total_amount} {order.currency}</Text>
                </View>
              ))}
              {!orders.length ? <Text style={styles.muted}>No orders yet.</Text> : null}
              <TouchableOpacity onPress={() => { setToken(''); setCustomer(null); setOrders([]); }}>
                <Text style={styles.navLink}>Sign out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
              <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
              <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
              <TouchableOpacity style={styles.button} onPress={() => login().catch((err) => setError(err.message))}>
                <Text style={styles.buttonText}>Sign in</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { marginTop: 10, backgroundColor: '#3d3428' }]} onPress={() => register().catch((err) => setError(err.message))}>
                <Text style={styles.buttonText}>Create account</Text>
              </TouchableOpacity>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          )}
        </ScrollView>
      )}
      {screen === 'track' && (
        <View style={{ padding: 20 }}>
          <TextInput style={styles.input} placeholder="Order number" autoCapitalize="characters" value={trackNo} onChangeText={setTrackNo} />
          <TouchableOpacity style={styles.button} onPress={() => lookup().catch((err) => setError(err.message))}>
            <Text style={styles.buttonText}>Track</Text>
          </TouchableOpacity>
          {track ? <Text style={{ marginTop: 16 }}>{track.order_number} · {track.fulfillment_status}{track.supplier_tracking_number ? ` · ${track.supplier_tracking_number}` : ''}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f1e8' },
  header: { backgroundColor: '#14120f', padding: 18, paddingTop: 8 },
  brand: { color: '#f6f1e8', fontSize: 28, letterSpacing: 0.5 },
  nav: { flexDirection: 'row', gap: 16, marginTop: 8 },
  navLink: { color: '#c4a574', marginTop: 8 },
  cats: { paddingHorizontal: 12, paddingVertical: 10, maxHeight: 54 },
  chip: { marginRight: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#eadfce' },
  chipOn: { backgroundColor: '#14120f', color: '#fff' },
  card: { backgroundColor: '#fffdf8', borderWidth: 1, borderColor: '#eadfce', marginBottom: 14, padding: 12 },
  image: { width: '100%', height: 180, marginBottom: 8, backgroundColor: '#efe8dc' },
  cat: { letterSpacing: 1, textTransform: 'uppercase', fontSize: 11, color: '#6f675e' },
  title: { fontSize: 18, marginVertical: 4 },
  price: { fontWeight: '600' },
  muted: { color: '#6f675e', marginTop: 4 },
  error: { color: '#8c3a2f', margin: 16 },
  input: { borderWidth: 1, borderColor: '#eadfce', backgroundColor: '#fff', padding: 12, marginBottom: 10 },
  button: { backgroundColor: '#14120f', padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', letterSpacing: 1, textTransform: 'uppercase' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fffdf8', padding: 18, borderTopWidth: 1, borderColor: '#eadfce' }
});
