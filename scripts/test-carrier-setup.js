const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('Testing Digital Carrier Setup Submission...');

  const dummyFile = Buffer.from('PDF-1.4 Mock Authority Certificate');
  const dummyBlob = new Blob([dummyFile], { type: 'application/pdf' });

  const formData = new FormData();
  formData.append('company_name', 'Test Horizon Express LLC');
  formData.append('dba', 'Horizon Freight');
  formData.append('owner_name', 'Marcus Vance');
  formData.append('title', 'Managing Director');
  formData.append('phone', '+1 555 982 3411');
  formData.append('emergency_phone', '+1 555 982 3412');
  formData.append('email', 'testcarrier@shippingwish.com');
  formData.append('address', '789 Logistics Blvd');
  formData.append('city', 'Atlanta');
  formData.append('state', 'GA');
  formData.append('zip', '30301');

  formData.append('mc_number', 'MC987654');
  formData.append('dot_number', '3910293');
  formData.append('equipment_types', '53ft Dry Van, 53ft Reefer');
  formData.append('num_trucks', '3');
  formData.append('num_drivers', '3');
  formData.append('max_payload', '44,500 lbs');
  formData.append('eld_provider', 'Samsara');
  formData.append('factoring_company', 'Apex Capital');
  formData.append('preferred_lanes', 'Southeast, Midwest, Texas');
  formData.append('excluded_states', 'NYC, CA');
  formData.append('min_rpm', '2.65');

  formData.append('mc_cert', dummyBlob, 'authority_mc987654.pdf');
  formData.append('coi', dummyBlob, 'coi_insurance.pdf');
  formData.append('w9', dummyBlob, 'w9_signed.pdf');

  formData.append('signature_type', 'type');
  formData.append('signature_data', 'Marcus Vance');
  formData.append('signer_name', 'Marcus Vance');
  formData.append('signer_title', 'Managing Director');
  formData.append('agree_terms', 'true');

  try {
    const res = await fetch('http://localhost:3000/api/carrier-setup/submit', {
      method: 'POST',
      body: formData
    });

    console.log('Status code:', res.status);
    const data = await res.json();
    console.log('Response:', data);

    if (data.ok) {
      console.log('SUCCESS! Carrier setup submission tested successfully.');
    } else {
      console.error('Submission returned not ok:', data);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

runTest();
