require('dotenv').config();
const pool = require('../db');

const DAT_SCREEN_LOADS = [
  {
    load_number: 'DAT-TAL-101',
    broker_name: 'First Call Logistics LLC',
    broker_contact: '(317) 708-7790 x236',
    broker_mc: '708779',
    pickup_location: 'Savannah, GA',
    pickup_state: 'GA',
    delivery_location: 'Mt Juliet, TN',
    delivery_state: 'TN',
    pickup_time: 'Ready 10/5 Today Before 5PM',
    delivery_time: 'Next Day Before 12PM',
    equipment_type: '53ft Dry Van',
    weight: 38000,
    miles: 502,
    rate: 1200,
    rpm: 2.39,
    dho: 18,
    notes: 'Direct from DAT One • 53ft Van Full • Rate $1,200 ($2.39/mi)'
  },
  {
    load_number: 'DAT-TAL-102',
    broker_name: 'Allen Lund Company',
    broker_contact: '(800) 555-0199 | minor.hamm@allenlund.com',
    broker_mc: '143202',
    pickup_location: 'Savannah, GA',
    pickup_state: 'GA',
    delivery_location: 'Dallas, TX',
    delivery_state: 'TX',
    pickup_time: 'Ready 10/5 Today',
    delivery_time: '10/7 Scheduled 8AM',
    equipment_type: '53ft Dry Van',
    weight: 41270,
    miles: 1033,
    rate: 2200,
    rpm: 2.13,
    dho: 18,
    notes: 'Direct from DAT One • 53ft Van Full • Rate $2,200 ($2.13/mi)'
  },
  {
    load_number: 'DAT-TAL-103',
    broker_name: 'Allen Lund Company',
    broker_contact: '(800) 555-0199 | minor.hamm@allenlund.com',
    broker_mc: '143202',
    pickup_location: 'Savannah, GA',
    pickup_state: 'GA',
    delivery_location: 'Minneapolis, MN',
    delivery_state: 'MN',
    pickup_time: 'Ready 10/5 Today',
    delivery_time: '10/8 Scheduled',
    equipment_type: '53ft Dry Van',
    weight: 42500,
    miles: 1366,
    rate: 2800,
    rpm: 2.05,
    dho: 18,
    notes: 'Direct from DAT One • 53ft Van Full • Rate $2,800 ($2.05/mi)'
  },
  {
    load_number: 'DAT-TAL-104',
    broker_name: 'Allen Lund Company',
    broker_contact: '(800) 555-0199 | minor.hamm@allenlund.com',
    broker_mc: '143202',
    pickup_location: 'Stillmore, GA',
    pickup_state: 'GA',
    delivery_location: 'Morris, IL',
    delivery_state: 'IL',
    pickup_time: 'Ready 10/5 Today',
    delivery_time: '10/7 Scheduled',
    equipment_type: '53ft Dry Van',
    weight: 42336,
    miles: 897,
    rate: 1800,
    rpm: 2.01,
    dho: 72,
    notes: 'Direct from DAT One • 53ft Van Full • Rate $1,800 ($2.01/mi)'
  },
  {
    load_number: 'DAT-TAL-105',
    broker_name: 'Landstar Ranger Inc',
    broker_contact: '(240) 624-0494',
    broker_mc: '166949',
    pickup_location: 'Rincon, GA',
    pickup_state: 'GA',
    delivery_location: 'Midway, GA',
    delivery_state: 'GA',
    pickup_time: 'Ready 10/5 Immediate',
    delivery_time: 'Same Day Delivery',
    equipment_type: '53ft Dry Van',
    weight: 9000,
    miles: 40,
    rate: 300,
    rpm: 7.50,
    dho: 0,
    notes: 'Direct from DAT One • 53ft Van Local Run • DHO 0 mi • Rate $300'
  },
  {
    load_number: 'DAT-TAL-106',
    broker_name: 'Landstar Ranger Inc',
    broker_contact: '(240) 624-0494',
    broker_mc: '166949',
    pickup_location: 'Savannah, GA',
    pickup_state: 'GA',
    delivery_location: 'Midway, GA',
    delivery_state: 'GA',
    pickup_time: 'Ready 10/5 Immediate',
    delivery_time: 'Same Day Delivery',
    equipment_type: '53ft Dry Van',
    weight: 14000,
    miles: 33,
    rate: 300,
    rpm: 9.09,
    dho: 18,
    notes: 'Direct from DAT One • 53ft Van Local Run • Rate $300'
  },
  {
    load_number: 'DAT-TAL-107',
    broker_name: 'Allen Lund Company',
    broker_contact: '(800) 555-0199 | booking-at@allenlund.com',
    broker_mc: '143202',
    pickup_location: 'Stillmore, GA',
    pickup_state: 'GA',
    delivery_location: 'Van Buren Twp, MI',
    delivery_state: 'MI',
    pickup_time: 'Ready 10/5 Today',
    delivery_time: '10/7 Scheduled',
    equipment_type: '53ft Dry Van',
    weight: 44000,
    miles: 829,
    rate: 1980,
    rpm: 2.39,
    dho: 72,
    notes: 'Direct from DAT One • 48ft/53ft Van Full • Rate $1,980'
  },
  {
    load_number: 'DAT-TAL-108',
    broker_name: 'Echo Global Logistics',
    broker_contact: '(800) 354-7993',
    broker_mc: '500155',
    pickup_location: 'Savannah, GA',
    pickup_state: 'GA',
    delivery_location: 'Charlotte, NC',
    delivery_state: 'NC',
    pickup_time: 'Ready 10/5 Afternoon',
    delivery_time: 'Next Day Morning',
    equipment_type: '53ft Dry Van',
    weight: 39500,
    miles: 250,
    rate: 675,
    rpm: 2.70,
    dho: 18,
    notes: 'Direct from DAT One • 53ft Dry Van • Charlotte NC Lane'
  },
  {
    load_number: 'DAT-TAL-109',
    broker_name: 'C.H. Robinson Worldwide',
    broker_contact: '(800) 323-7587',
    broker_mc: '216195',
    pickup_location: 'Savannah, GA',
    pickup_state: 'GA',
    delivery_location: 'Atlanta, GA',
    delivery_state: 'GA',
    pickup_time: 'Ready 10/5 Today',
    delivery_time: 'Next Day 8AM',
    equipment_type: '53ft Dry Van',
    weight: 41000,
    miles: 248,
    rate: 620,
    rpm: 2.50,
    dho: 18,
    notes: 'Direct from DAT One • 53ft Dry Van • Atlanta GA Corridor'
  },
  {
    load_number: 'DAT-TAL-110',
    broker_name: 'Spot Freight Inc',
    broker_contact: '(317) 635-6207 ext 1176',
    broker_mc: '665776',
    pickup_location: 'Rincon, GA',
    pickup_state: 'GA',
    delivery_location: 'Jacksonville, FL',
    delivery_state: 'FL',
    pickup_time: 'Ready 10/5 Today Before 6PM',
    delivery_time: 'Next Day 9AM',
    equipment_type: '53ft Dry Van',
    weight: 40000,
    miles: 155,
    rate: 450,
    rpm: 2.90,
    dho: 0,
    notes: 'Direct from DAT One • 53ft Dry Van • I-95 South Corridor'
  }
];

(async () => {
  try {
    console.log('Seeding authentic DAT One screen loads into Shipping Wish database...');
    let inserted = 0;
    for (const l of DAT_SCREEN_LOADS) {
      const res = await pool.query(`
        INSERT INTO loads (
          load_number, broker_name, broker_contact, broker_mc,
          pickup_location, pickup_state, delivery_location, delivery_state,
          pickup_time, delivery_time, equipment_type, weight, miles,
          rate, rpm, status, source_type, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'new','dat_sync',$16)
        ON CONFLICT (load_number) DO UPDATE SET
          rate = EXCLUDED.rate,
          rpm = EXCLUDED.rpm,
          miles = EXCLUDED.miles,
          status = 'new'
        RETURNING id
      `, [
        l.load_number, l.broker_name, l.broker_contact, l.broker_mc,
        l.pickup_location, l.pickup_state, l.delivery_location, l.delivery_state,
        l.pickup_time, l.delivery_time, l.equipment_type, l.weight, l.miles,
        l.rate, l.rpm, l.notes
      ]);
      inserted++;
    }
    console.log(`✓ Successfully seeded ${inserted} live DAT One loads!`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding DAT screen loads:', err);
    process.exit(1);
  }
})();
