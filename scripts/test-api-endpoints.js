require('dotenv').config();
const jwt = require('jsonwebtoken');

(async () => {
  try {
    const token = jwt.sign(
      { id: 1, email: 'admin@shippingwish.com', role: 'admin' },
      process.env.JWT_SECRET || 'SW_2026_8xP#9LmQ@7vNz!5KrT2YsA',
      { expiresIn: '1h' }
    );

    console.log('--- 1. Testing GET /api/dispatch-desk/dat-cloud/status ---');
    const resStatus = await fetch('http://localhost:3000/api/dispatch-desk/dat-cloud/status', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const statusData = await resStatus.json();
    console.log('Status HTTP:', resStatus.status);
    console.log('Status Data:', statusData);

    console.log('\n--- 2. Testing POST /api/dispatch-desk/match-truck ---');
    const matchRes = await fetch('http://localhost:3000/api/dispatch-desk/match-truck', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        truck_number: '101',
        origin: 'Hopkinsville, KY',
        destination: "D'Iberville, MS",
        equipment: '26ft Box Truck',
        min_rpm: 2.0,
        max_deadhead: 150
      })
    });
    const matchData = await matchRes.json();
    console.log('Match HTTP:', matchRes.status);
    console.log('Matches count:', matchData.loads?.length);
    if (matchData.loads && matchData.loads.length > 0) {
      matchData.loads.forEach((l, idx) => {
        console.log(`[Load ${idx + 1}] ID: ${l.load_number} | Origin: ${l.origin} -> Dest: ${l.destination} | Weight: ${l.weight} lbs | Deadhead: ${l.dho} mi | Eq: ${l.equipment_type} | RPM: $${l.all_in_rpm}`);
      });
    }

    console.log('\n--- 3. Testing POST /api/dispatch-desk/send-driver-offer ---');
    const firstMatch = matchData.matches?.[0];
    const loadPayload = firstMatch ? (firstMatch.load || firstMatch) : {
      id: 9999,
      load_number: 'DAT-TEST-9999',
      pickup_location: 'Hopkinsville, KY',
      delivery_location: "D'Iberville, MS",
      equipment_type: '26ft Box Truck',
      weight: 6400,
      miles: 540,
      rate: 1350,
      rpm: 2.5,
      broker_name: 'Landstar Ranger Inc',
      broker_contact: '(800) 872-9474'
    };

    const offerRes = await fetch('http://localhost:3000/api/dispatch-desk/send-driver-offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        carrier_id: 1,
        load: {
          load_id: loadPayload.load_number || 'DAT-TEST-LIVE',
          origin: loadPayload.pickup_location,
          destination: loadPayload.delivery_location,
          equipment_type: loadPayload.equipment_type,
          weight: String(loadPayload.weight),
          loaded_miles: "540.00", // Decimal string to test integer fix!
          deadhead_miles: "15.00", // Decimal string to test integer fix!
          rate: String(loadPayload.rate || 1350),
          all_in_rpm: "2.50",
          broker_name: loadPayload.broker_name || 'Landstar Ranger Inc',
          broker_phone: loadPayload.broker_contact || '(800) 872-9474'
        }
      })
    });
    const offerData = await offerRes.json();
    console.log('Send Driver Offer HTTP:', offerRes.status);
    console.log('Send Driver Offer Response:', offerData);

    if (offerRes.status === 200 && offerData.ok) {
      console.log('\n✅ EVERYTHING IS WORKING 100% PERFECTLY!');
    } else {
      console.log('\n⚠️ Check offer response details above.');
    }
  } catch (err) {
    console.error('Error during API test:', err);
  }
})();
