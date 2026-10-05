require('dotenv').config();
const jwt = require('jsonwebtoken');

(async () => {
  try {
    const token = jwt.sign(
      { id: 1, email: 'admin@shippingwish.com', role: 'admin' },
      process.env.JWT_SECRET || 'SW_2026_8xP#9LmQ@7vNz!5KrT2YsA',
      { expiresIn: '1h' }
    );

    console.log('--- Testing Match for Rincon, GA -> Z0-Z7 with Min $2.00/mi ---');
    const res = await fetch('http://localhost:3000/api/dispatch-desk/match-truck', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        truck_number: '101',
        origin: 'Rincon, GA',
        destination: 'Z0,Z1,Z2,Z3,Z4,Z5,Z6,Z7',
        equipment: '53ft Dry Van',
        min_rpm: 2.00,
        max_deadhead: 150,
        limit: 15
      })
    });

    const data = await res.json();
    console.log(`Status: HTTP ${res.status} | Total Loads Found: ${data.loads ? data.loads.length : 0}\n`);

    if (data.loads && data.loads.length > 0) {
      data.loads.forEach((l, idx) => {
        console.log(`[#${idx + 1}] ${l.load_number} | ${l.origin} ➔ ${l.destination}`);
        console.log(`     Rate: $${l.rate} ($${l.all_in_rpm}/mi all-in) | DHO: ${l.dho} mi | Miles: ${l.loaded_miles} mi | Wt: ${l.weight} lbs`);
        console.log(`     Broker: ${l.broker_name} (${l.broker_phone})`);
      });
    } else {
      console.log('No loads matched.');
    }
  } catch (err) {
    console.error('Error:', err);
  }
})();
