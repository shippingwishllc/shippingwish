# 🚚 Shipping Wish — DAT One 1-Click AI Dispatcher (Chrome Extension)

A lightweight, high-performance Manifest V3 Chrome Extension that connects your **DAT One**, **DAT Power**, and **Truckstop** load boards directly into the **Shipping Wish Autonomous AI Dispatch Engine**.

---

## ⚡ Key Capabilities
1. **1-Click Load Ingestion**:
   - Injects a discrete **"⚡ Send to Shipping Wish"** button directly onto DAT One load cards & detail panels.
   - Right-click Context Menu: highlight any load text on DAT, right-click, and choose **"⚡ Dispatch to Shipping Wish Fleet"**.
2. **Instant Fleet Matching**:
   - Automatically compares load equipment (Box Truck, Dry Van, Reefer, Flatbed) and Deadhead (DHO) against your active trucks.
3. **Autonomous Driver SMS Offers**:
   - Sends the exact bold-structured SMS offer to the driver's phone with 1 click.
4. **Broker Coordination (Both Options Built-In)**:
   - **Option A (Email)**: Sends branded booking request email with carrier setup packet, MC#, USDOT, and COI notice.
   - **Option B (Phone Call)**: Initiates AI voice agent call to confirm load availability and lock in RateCon.
5. **Auto-Pilot Mode**:
   - Turn on Auto-Pilot in the popup settings to automatically send SMS offers to the driver the second a load is grabbed.

---

## 📥 How to Install in Google Chrome (15 Seconds)

1. Open Google Chrome.
2. Navigate to: `chrome://extensions` in the address bar (or Menu > Extensions > Manage Extensions).
3. Toggle the **"Developer mode"** switch in the top-right corner to **ON**.
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select this folder:
   ```
   c:\Users\HCT\Desktop\shippingwish\extensions\dat-one-dispatcher
   ```
6. The extension is now installed! Pin it to your Chrome toolbar for instant access.

---

## 🚀 How to Use on DAT One

### Method A: 1-Click Popup Grab
1. Open your DAT One dashboard (`https://one.dat.com`).
2. Click any load to view its details.
3. Click the **Shipping Wish extension icon** in your Chrome toolbar.
4. Click **"🎯 Grab Active Load from DAT"**.
5. The extension will parse the lane, rate, miles, and broker contact info.
6. Click **"📱 Send Driver SMS Offer"** (or let Auto-Pilot send it automatically)!

### Method B: Right-Click Context Menu
1. Highlight any load text on DAT One or any web page.
2. Right-click and choose **"⚡ Dispatch to Shipping Wish Fleet"**.
3. A green notification badge will confirm the load was matched and dispatched.

---

## ⚙️ Configuration & Environments
Inside the extension popup:
* **Server**: Toggle between Live (`https://shippingwish.com`) and Local development (`http://localhost:3000`).
* **Auto-Pilot SMS**: When enabled, offers are dispatched to the driver immediately upon load capture.
