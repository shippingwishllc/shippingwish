# LoadNexus & Shipping Wish 4-App Mobile Suite

Welcome to the enterprise mobile ecosystem for **LoadNexus** and **Shipping Wish LLC**.
Each application is configured to run directly with **Expo Go** on Android and iOS devices, or compile to native standalone APK / AAB / IPA builds via EAS.

---

## The 4 Dedicated Mobile Applications

```
┌────────────────────────────────────────────────────────────────────────┐
│                     LoadNexus & Shipping Wish Backend                  │
│               Node.js + PostgreSQL + JWT Bearer Auth                   │
│         Base URL: http://<YOUR_LAN_IP>:3000 or https://shippingwish.com│
└───────┬─────────────────┬───────────────────┬──────────────────┬───────┘
        │                 │                   │                  │
        ▼                 ▼                   ▼                  ▼
 📱 1. Driver Console   📱 2. LoadNexus Carrier 📱 3. Shipping Wish TMS 📱 4. LoadNexus Broker
 (mobile/driver-app)    (mobile/loadnexus-carrier) (mobile/shippingwish-tms) (mobile/loadnexus-broker)
```

| Application | Folder | Target Persona | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **1. Driver Console** | `mobile/driver-app` | CDL Drivers on Road | Active routes, 1-tap milestone dispatch (Loaded, In Transit, Delivered), camera BOL/POD scanner, GPS ping, pre-trip checklist, emergency call. |
| **2. LoadNexus Carrier** | `mobile/loadnexus-carrier` | Motor Carriers & Dispatchers | 50-state load search, rate per mile (RPM), post truck capacity, anti-double brokering guard, 1-click inquire broker, broker credit scores (DTP, A+ rating, $75k bond). |
| **3. Shipping Wish TMS** | `mobile/shippingwish-tms` | Fleet Owners & Dispatchers | Active fleet dispatches, live driver GPS telematics, document vault (RateCon, POD, BOL), invoices & factoring revenue tracker. |
| **4. LoadNexus Broker** | `mobile/loadnexus-broker` | Freight Brokers & Shippers | Post spot freight with anti-double brokering guarantee, search available carrier capacity, live brokered freight tracking, carrier MC/DOT safety vetting. |

---

## How to Run Any App in Expo Go on Physical Phone

### Prerequisites
1. Install **Expo Go** on your mobile phone from the **Google Play Store** (Android) or **Apple App Store** (iOS).
2. Ensure your phone is connected to the same Wi-Fi network as your computer (or computer has public internet access).

### Step 1: Find your computer's local Wi-Fi IP address
In PowerShell or Command Prompt:
```powershell
ipconfig
```
Look for `IPv4 Address` (for example `192.168.1.50`).

### Step 2: Launch the Desired Mobile App
Open a terminal in the application directory:

#### To run the Driver Console:
```bash
cd d:\shippingwish\mobile\driver-app
npx expo start
```

#### To run the LoadNexus Carrier Loadboard:
```bash
cd d:\shippingwish\mobile\loadnexus-carrier
npx expo start
```

#### To run the Shipping Wish TMS:
```bash
cd d:\shippingwish\mobile\shippingwish-tms
npx expo start
```

#### To run the LoadNexus Broker App:
```bash
cd d:\shippingwish\mobile\loadnexus-broker
npx expo start
```

### Step 3: Scan the QR Code
- **On Android**: Open the **Expo Go** app and tap **"Scan QR Code"**.
- **On iPhone**: Open the default **Camera app** and scan the QR code displayed in your terminal.

---

## Connecting to Backend API

In `mobile/shared/config.js`, the default API base URL is set:
- In production / standalone builds: `https://shippingwish.com`
- In local development: `http://localhost:3000` (or `http://<YOUR_LAN_IP>:3000`)

Each app also includes an in-app server configuration toggle or automatically connects to `CONFIG.API_BASE`.
All requests use `Authorization: Bearer <token>` for native mobile authentication.
