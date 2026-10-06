const https = require('https');

const VAPI_KEY = '49988777-7a8a-4da0-99ac-ec3e4ec0bd76';
const ASSISTANT_ID = 'a454665c-8f51-4d3e-afb3-7884277622a9';
const PHONE_NUMBER_ID = '7e43a8e4-a844-4cb7-9f71-017467f38d33';
const HUMAN_TRANSFER_NUMBER = '+19177370021';

function vapiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.vapi.ai',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VAPI_KEY}`,
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('1. Updating Assistant with transferCall tool to ' + HUMAN_TRANSFER_NUMBER + '...');
  const assistantUpdate = {
    name: 'Alex — Senior Dispatcher (Shipping Wish)',
    forwardingPhoneNumber: HUMAN_TRANSFER_NUMBER,
    firstMessage: "Hi, thank you for calling Shipping Wish Logistics operations! This is Alex. Are you calling regarding your fleet, load booking, or rates today?",
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are Alex, an experienced, friendly, and assertive American truck dispatch manager at Shipping Wish LLC (shippingwish.com, dispatch desk: +1-917-737-0021).
Your objective: Greet motor carriers and drivers calling in, answer questions about dedicated dispatch and spot freight booking, and get them started with our 7-Day $0 Free Trial.

CORE VALUE PROPOSITION:
- 0% Commission: We never take 8 to 10 percent of your gross check. You keep 100% of the broker pay.
- Flat Weekly Rate: Flat $149/week for 1 truck, $350/week for 2-5 trucks.
- 7-DAY ZERO RISK FREE TRIAL ($0 TODAY) — test our dispatch desk and tech for 1 full week at zero cost.
- 1-Click DAT One Matcher & instant 10-second carrier packet submission.
- RateCon OCR Audit: We verify detention ($50/hr), TONU ($250), and prevent sneaky broker rate cuts.
- Equipment handled: 53' Dry Van, 53' Reefer, Flatbed, 26' Box Truck, Power Only.

CONVERSATION RULES:
1. Speak in short, conversational sentences (1 to 2 sentences maximum).
2. Sound warm, confident, and professional.
3. If they ask about pricing: "Zero commission! We charge a flat $149 a week, and your first 7 days are completely free ($0) to test."
4. If they ask to speak to a person, dispatcher, human, owner, or manager:
   "Absolutely! Let me transfer you directly to our live operations dispatch desk right now. Please hold on for just a moment."
   IMMEDIATELY execute the transferCall tool to forward the call to +19177370021.`
        }
      ],
      tools: [
        {
          type: 'transferCall',
          destinations: [
            {
              type: 'number',
              number: HUMAN_TRANSFER_NUMBER,
              message: "Transferring you to our live operations dispatch desk right now. Please hold on."
            }
          ]
        }
      ]
    },
    server: {
      url: 'https://www.shippingwish.com/api/ai-calling/webhook',
      timeoutSeconds: 20
    }
  };

  const aRes = await vapiRequest('PATCH', `/assistant/${ASSISTANT_ID}`, assistantUpdate);
  console.log('Assistant update status:', aRes.status, aRes.data ? aRes.data.id : aRes);

  console.log('2. Linking Assistant to Inbound Phone Number ' + PHONE_NUMBER_ID + ' (+16094696004)...');
  const phoneUpdate = {
    assistantId: ASSISTANT_ID,
    server: {
      url: 'https://www.shippingwish.com/api/ai-calling/webhook',
      timeoutSeconds: 20
    }
  };

  const pRes = await vapiRequest('PATCH', `/phone-number/${PHONE_NUMBER_ID}`, phoneUpdate);
  console.log('Phone update status:', pRes.status, pRes.data ? pRes.data.number : pRes);

  console.log('\n--- VERIFICATION ---');
  const checkPhone = await vapiRequest('GET', `/phone-number/${PHONE_NUMBER_ID}`);
  console.log('Active Phone Configuration:', {
    number: checkPhone.data?.number,
    assistantId: checkPhone.data?.assistantId,
    status: checkPhone.data?.status,
    server: checkPhone.data?.server
  });
}

run().catch(console.error);
