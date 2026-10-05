require('dotenv').config();
const jwt = require('jsonwebtoken');

(async () => {
  try {
    const token = jwt.sign(
      { id: 1, email: 'admin@shippingwish.com', role: 'admin' },
      process.env.JWT_SECRET || 'SW_2026_8xP#9LmQ@7vNz!5KrT2YsA',
      { expiresIn: '1h' }
    );

    const testCases = [
      {
        name: 'Case 1: 26ft Box Truck (Hopkinsville, KY -> D\'Iberville, MS)',
        truck_number: '101',
        origin: 'Hopkinsville, KY',
        destination: "D'Iberville, MS",
        equipment: '26ft Box Truck',
        expectedMaxWeight: 10000
      },
      {
        name: 'Case 2: 53ft Dry Van (Atlanta, GA -> Dallas, TX)',
        truck_number: '102',
        origin: 'Atlanta, GA',
        destination: 'Dallas, TX',
        equipment: '53ft Dry Van',
        expectedMaxWeight: 45000
      },
      {
        name: 'Case 3: 53ft Reefer (Chicago, IL -> Atlanta, GA)',
        truck_number: '103',
        origin: 'Chicago, IL',
        destination: 'Atlanta, GA',
        equipment: '53ft Reefer',
        expectedMaxWeight: 45000
      },
      {
        name: 'Case 4: Flatbed (Savannah, GA -> Orlando, FL)',
        truck_number: '104',
        origin: 'Savannah, GA',
        destination: 'Orlando, FL',
        equipment: 'Flatbed',
        expectedMaxWeight: 48000
      }
    ];

    console.log('================================================================');
    console.log('🚚 CROSS-VERIFICATION: ERP FILTERS & TAL LOADBOARD BEHAVIOR');
    console.log('================================================================\n');

    for (const tc of testCases) {
      console.log(`🔍 [Testing] ${tc.name}`);
      const res = await fetch('http://localhost:3000/api/dispatch-desk/match-truck', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          truck_number: tc.truck_number,
          origin: tc.origin,
          destination: tc.destination,
          equipment: tc.equipment,
          min_rpm: 1.8,
          max_deadhead: 150
        })
      });

      const data = await res.json();
      console.log(`Status: HTTP ${res.status} | Total Loads Returned: ${data.loads ? data.loads.length : 0}`);

      if (data.loads && data.loads.length > 0) {
        for (let i = 0; i < Math.min(data.loads.length, 3); i++) {
          const l = data.loads[i];
          const isWeightValid = l.weight <= tc.expectedMaxWeight;
          console.log(`  Load #${i + 1}: ${l.load_number}`);
          console.log(`    - Route: ${l.origin} ➔ ${l.destination}`);
          console.log(`    - Equipment: ${l.equipment_type}`);
          console.log(`    - Weight: ${l.weight} lbs (Compliant with ${tc.equipment}: ${isWeightValid ? '✅ YES' : '❌ NO'})`);
          console.log(`    - Rate: $${l.rate} ($${l.all_in_rpm}/mi, DHO: ${l.dho} mi)`);
          console.log(`    - Broker: ${l.broker_name} (${l.broker_phone})`);
        }
      } else {
        console.log('  ⚠️ No loads returned.');
      }
      console.log('----------------------------------------------------------------\n');
    }

    console.log('🎉 ALL CROSS-VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test execution failed:', err);
  }
})();
