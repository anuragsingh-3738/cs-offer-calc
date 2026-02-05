 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/script.js b/script.js
index 77cec975484045e1242fd7db02c8f0d8eca3019b..0bd4093946b074a06fcc5d7b459edbfc4016c903 100644
--- a/script.js
+++ b/script.js
@@ -1,467 +1,733 @@
- (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
-diff --git a/script.js b/script.js
-index 94c457b142e9cf32e2b3f59ccbbea41c2fafa764..4ae2e4c3648b9d1c795396290045c09ba95f16a0 100644
---- a/script.js
-+++ b/script.js
-@@ -1,78 +1,80 @@
--const SHEET_CSV_URL =
--  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtSdtjCVaDlE3QQyWIdAh2c8Fy4_WiKogIqfyBw4aMcouV0cYN5Bwax4_Xe53F1c8XYdCmhtaV94KM/pub?gid=0&single=true&output=csv";
-+const PRODUCT_DATA_API_URL =
-+  "https://script.google.com/macros/s/AKfycbxFCHjVhhGmOMTUgMvjT2Hz6I0z2vhSKrLLhNzR9qX652jT8ZVteIw4Wa3FQP-vgIea/exec";
- 
- const GOOGLE_SAVE_API_URL =
-   "https://script.google.com/macros/s/AKfycbze3uf5PIZjlyx1h1g7D8iRrFLrdhJjODCDGNWYTmX51LNr5b0YQgO--VEe9jaQbUQ/exec";
- 
- let PRODUCT_MASTER = [];
-+let PRODUCT_CACHE = new Map();
- let cart = [];
- 
- let offerCreated = false;
- let offerExpiresAt = null;
- let offerId = null;
- 
- let breakdownVisible = true;
- 
- // ===============================
- // Auto-save Sales Person Name ✅
- // ===============================
- const SALES_NAME_KEY = "HH_SALES_PERSON_NAME";
- 
- function loadSalesPersonName() {
-   const saved = localStorage.getItem(SALES_NAME_KEY);
-   if (saved) {
-     document.getElementById("salesPerson").value = saved;
-   }
- }
- 
- function saveSalesPersonNameLive() {
-   const name = (document.getElementById("salesPerson").value || "").trim();
-   localStorage.setItem(SALES_NAME_KEY, name);
- }
- 
- // ===============================
- // Helpers
- // ===============================
- function formatINR(n) {
-   n = Number(n || 0);
-   return "₹" + n.toLocaleString("en-IN");
- }
- 
- function cleanMobile(m) {
-   return (m || "").replace(/\D/g, "").trim();
- }
- 
- function getItemDiscountPct(item) {
--  const pct = Number(item.discountPct || 0);
-+  const derivedPct = (Number(item.discountAmount || 0) / Math.max(Number(item.price || 0), 1)) * 100;
-+  const pct = Number(item.discountPct ?? derivedPct ?? 0);
-   return Math.min(Math.max(pct, 0), 100);
- }
- 
- function getItemOfferPrice(item) {
-   const mrp = Number(item.price || 0);
--  const pct = getItemDiscountPct(item);
--  return Math.round(mrp * (1 - pct / 100));
-+  const discountAmount = Math.max(Number(item.discountAmount || 0), 0);
-+  return Math.max(Math.round(mrp - discountAmount), 0);
- }
- 
- function getItemTotal(item) {
-   return getItemOfferPrice(item) * Number(item.qty || 0);
- }
- 
- function getCartTotal() {
-   return cart.reduce((sum, item) => sum + getItemTotal(item), 0);
- }
- 
- // ===============================
- // Discount Slabs (Updated)
- // ===============================
- function websiteDiscount(orderValue) {
-   if (orderValue >= 20000) return 1000;
-   if (orderValue >= 15000) return 700;
-   if (orderValue >= 13000) return 500;
-   if (orderValue >= 10000) return 500;
-   if (orderValue >= 5000) return 200;
-   return 0;
- }
- 
- function upiDiscount(orderValue, paymentMode) {
-   if (paymentMode !== "UPI") return 0;
-   if (orderValue >= 20000) return 500;
-@@ -170,175 +172,268 @@ function getSpecialDiscount() {
-   const enabled = document.getElementById("specialEnable").checked;
-   if (!enabled) return { name: "", amount: 0 };
- 
-   const name = (document.getElementById("specialName").value || "").trim();
-   const amt = Number(document.getElementById("specialAmt").value || 0);
- 
-   if (amt < 100 || amt > 1500) return { name, amount: 0 };
-   return { name, amount: amt };
- }
- 
- function updateSpecialOfferUI() {
-   const enabled = document.getElementById("specialEnable").checked;
-   document.getElementById("specialName").disabled = !enabled;
-   document.getElementById("specialAmt").disabled = !enabled;
- 
-   if (!enabled) {
-     document.getElementById("specialName").value = "";
-     document.getElementById("specialAmt").value = "";
-   }
- 
-   refreshSummary();
-   renderCart();
- }
- 
- // ===============================
--// Load Products from Google Sheet
-+// Load Products from Google Script Web App
- // ===============================
-+function parseCsvLine(line) {
-+  const vals = [];
-+  let cur = "";
-+  let quoted = false;
-+
-+  for (let i = 0; i < line.length; i += 1) {
-+    const ch = line[i];
-+
-+    if (ch === '"') {
-+      if (quoted && line[i + 1] === '"') {
-+        cur += '"';
-+        i += 1;
-+      } else {
-+        quoted = !quoted;
-+      }
-+      continue;
-+    }
-+
-+    if (ch === "," && !quoted) {
-+      vals.push(cur);
-+      cur = "";
-+      continue;
-+    }
-+
-+    cur += ch;
-+  }
-+
-+  vals.push(cur);
-+  return vals;
-+}
-+
-+function normalizeApiRows(data) {
-+  if (!data) return [];
-+  if (Array.isArray(data)) return data;
-+
-+  const keys = ["products", "data", "rows", "items", "result", "values"];
-+  for (const key of keys) {
-+    if (Array.isArray(data[key])) return data[key];
-+  }
-+
-+  return [];
-+}
-+
-+function parseProductRow(row) {
-+  if (!row) return null;
-+
-+  const get = (keys, fallbackIndex = -1) => {
-+    for (const key of keys) {
-+      if (row[key] !== undefined && row[key] !== null) return row[key];
-+    }
-+
-+    if (Array.isArray(row) && fallbackIndex >= 0) {
-+      return row[fallbackIndex] ?? "";
-+    }
-+
-+    return "";
-+  };
-+
-+  const model = String(
-+    get(["model", "modelNumber", "model_number", "Model Number", "A", "colA", "columnA"], 0)
-+  )
-+    .replaceAll('"', "")
-+    .trim();
-+
-+  const mrp =
-+    Number(String(get(["mrp", "MRP", "price", "Price", "H", "colH", "columnH"], 7)).replace(/[₹,\s]/g, "")) || 0;
-+  const discountAmount =
-+    Number(
-+      String(
-+        get(
-+          ["discountAmount", "discount_amount", "Discount Amount", "Discount Amount (₹)", "M", "colM", "columnM"],
-+          12
-+        )
-+      ).replace(/[₹,\s]/g, "")
-+    ) || 0;
-+
-+  if (!model || mrp <= 0) return null;
-+
-+  const safeDiscountAmount = Math.min(Math.max(discountAmount, 0), mrp);
-+  const discountPct = (safeDiscountAmount / mrp) * 100;
-+
-+  return {
-+    model,
-+    price: mrp,
-+    discountAmount: safeDiscountAmount,
-+    discountPct,
-+  };
-+}
-+
- async function loadProductsFromSheet() {
-   try {
--    const res = await fetch(SHEET_CSV_URL);
--    const text = await res.text();
-+    const res = await fetch(PRODUCT_DATA_API_URL, { cache: "no-store" });
-+    const raw = await res.text();
-+
-+    let parsed;
-+    try {
-+      parsed = JSON.parse(raw);
-+    } catch {
-+      parsed = null;
-+    }
-+
-+    let rows = normalizeApiRows(parsed);
-+
-+    // Fallback: CSV-style response
-+    if (rows.length === 0 && raw.includes("\n")) {
-+      const csvRows = raw
-+        .trim()
-+        .split(/\r?\n/)
-+        .map((line) => parseCsvLine(line));
-+
-+      if (csvRows.length > 1) {
-+        const header = csvRows[0].map((x) => (x || "").trim());
-+        rows = csvRows.slice(1).map((r) => {
-+          const obj = {};
-+          header.forEach((h, i) => {
-+            if (h) obj[h] = r[i] ?? "";
-+          });
-+          return Object.keys(obj).length ? obj : r;
-+        });
-+      }
-+    }
- 
--    const rows = text.trim().split("\n").map((r) => r.split(","));
--    rows.shift();
-+    PRODUCT_MASTER = rows.map(parseProductRow).filter(Boolean);
-+    PRODUCT_CACHE = new Map(PRODUCT_MASTER.map((p) => [p.model.toUpperCase(), p]));
- 
--    PRODUCT_MASTER = rows
--      .map((cols) => {
--        const model = (cols[0] || "").replaceAll('"', "").trim();
--        const price = Number((cols[1] || "0").replaceAll('"', "").trim());
--        return { model, price };
--      })
--      .filter((p) => p.model && p.price > 0);
-+    if (PRODUCT_MASTER.length === 0) {
-+      throw new Error("No valid products found in API response.");
-+    }
- 
-     console.log("✅ Products loaded:", PRODUCT_MASTER.length);
-   } catch (err) {
--    alert("❌ Unable to load products from Google Sheet.");
-+    alert("❌ Unable to load products from Google Script API.");
-     console.error(err);
-   }
- }
- 
- // ===============================
- // Suggestions
- // ===============================
- function showSuggestions(query) {
-   const box = document.getElementById("suggestions");
-   const q = (query || "").trim().toUpperCase();
- 
-   if (!q) {
-     box.style.display = "none";
-     box.innerHTML = "";
-     return;
-   }
- 
-   const matches = PRODUCT_MASTER
-     .filter((p) => p.model.toUpperCase().includes(q))
-     .slice(0, 10);
- 
-   if (matches.length === 0) {
-     box.style.display = "none";
-     box.innerHTML = "";
-     return;
-   }
- 
-   box.style.display = "block";
-   box.innerHTML = matches
-     .map(
-       (p) => `
-       <div class="suggItem" data-model="${p.model}">
--        <b>${p.model}</b> (${formatINR(p.price)})
-+        <b>${p.model}</b> (${formatINR(p.price)}) | ${getItemDiscountPct(p).toFixed(2)}% (${formatINR(p.discountAmount)})
-       </div>
-     `
-     )
-     .join("");
- 
-   document.querySelectorAll(".suggItem").forEach((el) => {
-     el.addEventListener("click", () => {
-       document.getElementById("modelSearch").value = el.dataset.model;
-       box.style.display = "none";
-       box.innerHTML = "";
-     });
-   });
- }
- 
- // ===============================
- // Render Cart
- // ===============================
- function renderCart() {
-   const tbody = document.getElementById("cartBody");
-   tbody.innerHTML = "";
- 
-   const comboEnabled = document.getElementById("comboEnable").checked;
-   document.getElementById("comboTh").classList.toggle("hide", !comboEnabled);
- 
-   cart.forEach((item, index) => {
-     const tr = document.createElement("tr");
- 
-     const total = getItemTotal(item);
-     const eligible = total >= 5000;
- 
-     tr.innerHTML = `
-       <td class="comboTd ${comboEnabled ? "" : "hide"}">
-         <input type="checkbox" class="comboChk" data-index="${index}"
-           ${item.comboSelected ? "checked" : ""}
-           ${comboEnabled && eligible ? "" : "disabled"}>
-       </td>
- 
-       <td><b>${item.model}</b></td>
-       <td>${formatINR(item.price)}</td>
--      <td>
--        <input class="disc" type="number" min="0" max="100" step="0.01" value="${getItemDiscountPct(item)}" data-index="${index}" />%
--        <div style="font-size:11px;color:#6b7280;">${formatINR(item.price - getItemOfferPrice(item))}</div>
--      </td>
-+      <td>${getItemDiscountPct(item).toFixed(2)}% (${formatINR(item.discountAmount)})</td>
-       <td><b>${formatINR(getItemOfferPrice(item))}</b></td>
-       <td>
-         <input class="qty" type="number" min="1" value="${item.qty}" data-index="${index}" />
-       </td>
-       <td><b>${formatINR(total)}</b></td>
-       <td><button class="btn-danger" data-remove="${index}">Remove</button></td>
-     `;
- 
-     tbody.appendChild(tr);
-   });
- 
--  document.querySelectorAll(".disc").forEach((inp) => {
--    inp.addEventListener("input", (e) => {
--      const idx = Number(e.target.dataset.index);
--      let d = Number(e.target.value || 0);
--      if (d < 0) d = 0;
--      if (d > 100) d = 100;
--
--      cart[idx].discountPct = d;
--
--      const total = getItemTotal(cart[idx]);
--      if (total < 5000) cart[idx].comboSelected = false;
--
--      refreshSummary();
--      renderCart();
--    });
--  });
--
-   document.querySelectorAll(".qty").forEach((inp) => {
-     inp.addEventListener("input", (e) => {
-       const idx = Number(e.target.dataset.index);
-       let q = Number(e.target.value || 1);
-       if (q < 1) q = 1;
- 
-       cart[idx].qty = q;
- 
-       const total = getItemTotal(cart[idx]);
-       if (total < 5000) cart[idx].comboSelected = false;
- 
-       refreshSummary();
-       renderCart();
-     });
-   });
- 
-   document.querySelectorAll(".comboChk").forEach((chk) => {
-     chk.addEventListener("change", (e) => {
-       const idx = Number(e.target.dataset.index);
- 
-       if (e.target.checked) {
-         const already = cart.filter((x) => x.comboSelected).length;
-         if (already >= 2) {
-           e.target.checked = false;
-           alert("Combo Discount allows only 2 products selection.");
-@@ -349,57 +444,66 @@ function renderCart() {
-       cart[idx].comboSelected = e.target.checked;
-       refreshSummary();
-     });
-   });
- 
-   document.querySelectorAll("[data-remove]").forEach((btn) => {
-     btn.addEventListener("click", (e) => {
-       const idx = Number(e.target.dataset.remove);
-       cart.splice(idx, 1);
-       refreshSummary();
-       renderCart();
-     });
-   });
- 
-   updateComboMessage();
- }
- 
- // ===============================
- // Add Product
- // ===============================
- function addProductByModel() {
-   const input = document.getElementById("modelSearch");
-   const model = (input.value || "").trim().toUpperCase();
-   if (!model) return alert("Please enter a Model Number.");
- 
--  const found = PRODUCT_MASTER.find((p) => p.model.toUpperCase() === model);
-+  const found = PRODUCT_CACHE.get(model);
-   if (!found) return alert("Model Number not found.");
- 
-   const existing = cart.find((x) => x.model.toUpperCase() === model);
- 
-   if (existing) existing.qty += 1;
--  else cart.push({ model: found.model, price: found.price, qty: 1, discountPct: 0, comboSelected: false });
-+  else {
-+    cart.push({
-+      model: found.model,
-+      price: found.price,
-+      qty: 1,
-+      discountAmount: found.discountAmount,
-+      discountPct: found.discountPct,
-+      comboSelected: false,
-+    });
-+  }
- 
-   input.value = "";
-   document.getElementById("suggestions").style.display = "none";
-   document.getElementById("suggestions").innerHTML = "";
- 
-   renderCart();
-   refreshSummary();
- }
- 
- // ===============================
- // Offer ID Generator
- // ===============================
- function generateOfferId() {
-   const d = new Date();
-   const y = d.getFullYear();
-   const m = String(d.getMonth() + 1).padStart(2, "0");
-   const day = String(d.getDate()).padStart(2, "0");
- 
-   const key = `HH_OFFER_COUNTER_${y}${m}${day}`;
-   let counter = Number(localStorage.getItem(key) || 0);
-   counter += 1;
-   localStorage.setItem(key, String(counter));
- 
-   return `HH-${y}${m}${day}-${String(counter).padStart(4, "0")}`;
- }
- 
-EOF
-)
+const SHEET_CSV_URL =
+  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtSdtjCVaDlE3QQyWIdAh2c8Fy4_WiKogIqfyBw4aMcouV0cYN5Bwax4_Xe53F1c8XYdCmhtaV94KM/pub?gid=0&single=true&output=csv";
+
+const GOOGLE_SAVE_API_URL =
+  "https://script.google.com/macros/s/AKfycbze3uf5PIZjlyx1h1g7D8iRrFLrdhJjODCDGNWYTmX51LNr5b0YQgO--VEe9jaQbUQ/exec";
+
+let PRODUCT_MASTER = [];
+let cart = [];
+
+let offerCreated = false;
+let offerExpiresAt = null;
+let offerId = null;
+
+let breakdownVisible = true;
+
+// ===============================
+// Auto-save Sales Person Name ✅
+// ===============================
+const SALES_NAME_KEY = "HH_SALES_PERSON_NAME";
+
+function loadSalesPersonName() {
+  const saved = localStorage.getItem(SALES_NAME_KEY);
+  if (saved) {
+    document.getElementById("salesPerson").value = saved;
+  }
+}
+
+function saveSalesPersonNameLive() {
+  const name = (document.getElementById("salesPerson").value || "").trim();
+  localStorage.setItem(SALES_NAME_KEY, name);
+}
+
+// ===============================
+// Helpers
+// ===============================
+function formatINR(n) {
+  n = Number(n || 0);
+  return "₹" + n.toLocaleString("en-IN");
+}
+
+function cleanMobile(m) {
+  return (m || "").replace(/\D/g, "").trim();
+}
+
+function getItemTotal(item) {
+  return Number(item.price || 0) * Number(item.qty || 0);
+}
+
+function getCartTotal() {
+  return cart.reduce((sum, item) => sum + getItemTotal(item), 0);
+}
+
+// ===============================
+// Discount Slabs (Updated)
+// ===============================
+function websiteDiscount(orderValue) {
+  if (orderValue >= 20000) return 1000;
+  if (orderValue >= 15000) return 700;
+  if (orderValue >= 13000) return 500;
+  if (orderValue >= 10000) return 500;
+  if (orderValue >= 5000) return 200;
+  return 0;
+}
+
+function upiDiscount(orderValue, paymentMode) {
+  if (paymentMode !== "UPI") return 0;
+  if (orderValue >= 20000) return 500;
+  if (orderValue >= 15000) return 300;
+  if (orderValue >= 13000) return 300;
+  if (orderValue >= 10000) return 200;
+  if (orderValue >= 5000) return 100;
+  return 0;
+}
+
+// ===============================
+// Combo Discount Rules ✅
+// 1) Combo ON
+// 2) Exactly 2 selected
+// 3) Each selected product total >= 5000
+// 4) 3% on both selected totals combined
+// ===============================
+function comboDiscountAmount() {
+  const comboEnabled = document.getElementById("comboEnable").checked;
+  if (!comboEnabled) return 0;
+
+  const selected = cart.filter((x) => x.comboSelected);
+  if (selected.length !== 2) return 0;
+
+  const t1 = getItemTotal(selected[0]);
+  const t2 = getItemTotal(selected[1]);
+
+  if (t1 < 5000 || t2 < 5000) return 0;
+
+  return Math.round((t1 + t2) * 0.03);
+}
+
+function clearComboSelections() {
+  cart.forEach((x) => (x.comboSelected = false));
+}
+
+// ===============================
+// Combo Guidance Message ✅
+// ===============================
+function updateComboMessage() {
+  const box = document.getElementById("comboMessageBox");
+  const enabled = document.getElementById("comboEnable").checked;
+
+  if (!enabled) {
+    box.style.display = "none";
+    box.innerText = "";
+    return;
+  }
+
+  const selected = cart.filter((x) => x.comboSelected);
+  const eligible = cart.filter((x) => getItemTotal(x) >= 5000);
+
+  box.style.display = "block";
+
+  if (cart.length < 2) {
+    box.innerText = "⚠️ Add at least 2 products to use Combo Discount.";
+    return;
+  }
+
+  if (eligible.length < 2) {
+    box.innerText = "⚠️ Combo needs 2 products with total value ₹5000+ each (Price × Qty).";
+    return;
+  }
+
+  if (selected.length === 0) {
+    box.innerText = "✅ Select any 2 eligible products to activate Combo Discount (3%).";
+    return;
+  }
+
+  if (selected.length === 1) {
+    box.innerText = "✅ Selected 1/2. Select 1 more product (each must be ₹5000+).";
+    return;
+  }
+
+  if (selected.length === 2) {
+    const t1 = getItemTotal(selected[0]);
+    const t2 = getItemTotal(selected[1]);
+
+    if (t1 < 5000 || t2 < 5000) {
+      box.innerText = "⚠️ One selected product is below ₹5000. Combo Discount will NOT apply.";
+      return;
+    }
+
+    box.innerText = "🎉 Combo Discount Active! 3% applied on both selected products total.";
+    return;
+  }
+
+  box.innerText = "⚠️ Combo allows only 2 products selection.";
+}
+
+// ===============================
+// Special Discount
+// ===============================
+function getSpecialDiscount() {
+  const enabled = document.getElementById("specialEnable").checked;
+  if (!enabled) return { name: "", amount: 0 };
+
+  const name = (document.getElementById("specialName").value || "").trim();
+  const amt = Number(document.getElementById("specialAmt").value || 0);
+
+  if (amt < 100 || amt > 1500) return { name, amount: 0 };
+  return { name, amount: amt };
+}
+
+function updateSpecialOfferUI() {
+  const enabled = document.getElementById("specialEnable").checked;
+  document.getElementById("specialName").disabled = !enabled;
+  document.getElementById("specialAmt").disabled = !enabled;
+
+  if (!enabled) {
+    document.getElementById("specialName").value = "";
+    document.getElementById("specialAmt").value = "";
+  }
+
+  refreshSummary();
+  renderCart();
+}
+
+// ===============================
+// Load Products from Google Sheet
+// ===============================
+async function loadProductsFromSheet() {
+  try {
+    const res = await fetch(SHEET_CSV_URL);
+    const text = await res.text();
+
+    const rows = text.trim().split("\n").map((r) => r.split(","));
+    rows.shift();
+
+    PRODUCT_MASTER = rows
+      .map((cols) => {
+        const model = (cols[0] || "").replaceAll('"', "").trim();
+        const price = Number((cols[1] || "0").replaceAll('"', "").trim());
+        return { model, price };
+      })
+      .filter((p) => p.model && p.price > 0);
+
+    console.log("✅ Products loaded:", PRODUCT_MASTER.length);
+  } catch (err) {
+    alert("❌ Unable to load products from Google Sheet.");
+    console.error(err);
+  }
+}
+
+// ===============================
+// Suggestions
+// ===============================
+function showSuggestions(query) {
+  const box = document.getElementById("suggestions");
+  const q = (query || "").trim().toUpperCase();
+
+  if (!q) {
+    box.style.display = "none";
+    box.innerHTML = "";
+    return;
+  }
+
+  const matches = PRODUCT_MASTER
+    .filter((p) => p.model.toUpperCase().includes(q))
+    .slice(0, 10);
+
+  if (matches.length === 0) {
+    box.style.display = "none";
+    box.innerHTML = "";
+    return;
+  }
+
+  box.style.display = "block";
+  box.innerHTML = matches
+    .map(
+      (p) => `
+      <div class="suggItem" data-model="${p.model}">
+        <b>${p.model}</b> (${formatINR(p.price)})
+      </div>
+    `
+    )
+    .join("");
+
+  document.querySelectorAll(".suggItem").forEach((el) => {
+    el.addEventListener("click", () => {
+      document.getElementById("modelSearch").value = el.dataset.model;
+      box.style.display = "none";
+      box.innerHTML = "";
+    });
+  });
+}
+
+// ===============================
+// Render Cart
+// ===============================
+function renderCart() {
+  const tbody = document.getElementById("cartBody");
+  tbody.innerHTML = "";
+
+  const comboEnabled = document.getElementById("comboEnable").checked;
+  document.getElementById("comboTh").classList.toggle("hide", !comboEnabled);
+
+  cart.forEach((item, index) => {
+    const tr = document.createElement("tr");
+
+    const total = getItemTotal(item);
+    const eligible = total >= 5000;
+
+    tr.innerHTML = `
+      <td class="comboTd ${comboEnabled ? "" : "hide"}">
+        <input type="checkbox" class="comboChk" data-index="${index}"
+          ${item.comboSelected ? "checked" : ""}
+          ${comboEnabled && eligible ? "" : "disabled"}>
+      </td>
+
+      <td><b>${item.model}</b></td>
+      <td>${formatINR(item.price)}</td>
+      <td>
+        <input class="qty" type="number" min="1" value="${item.qty}" data-index="${index}" />
+      </td>
+      <td><b>${formatINR(total)}</b></td>
+      <td><button class="btn-danger" data-remove="${index}">Remove</button></td>
+    `;
+
+    tbody.appendChild(tr);
+  });
+
+  document.querySelectorAll(".qty").forEach((inp) => {
+    inp.addEventListener("input", (e) => {
+      const idx = Number(e.target.dataset.index);
+      let q = Number(e.target.value || 1);
+      if (q < 1) q = 1;
+
+      cart[idx].qty = q;
+
+      const total = getItemTotal(cart[idx]);
+      if (total < 5000) cart[idx].comboSelected = false;
+
+      refreshSummary();
+      renderCart();
+    });
+  });
+
+  document.querySelectorAll(".comboChk").forEach((chk) => {
+    chk.addEventListener("change", (e) => {
+      const idx = Number(e.target.dataset.index);
+
+      if (e.target.checked) {
+        const already = cart.filter((x) => x.comboSelected).length;
+        if (already >= 2) {
+          e.target.checked = false;
+          alert("Combo Discount allows only 2 products selection.");
+          return;
+        }
+      }
+
+      cart[idx].comboSelected = e.target.checked;
+      refreshSummary();
+    });
+  });
+
+  document.querySelectorAll("[data-remove]").forEach((btn) => {
+    btn.addEventListener("click", (e) => {
+      const idx = Number(e.target.dataset.remove);
+      cart.splice(idx, 1);
+      refreshSummary();
+      renderCart();
+    });
+  });
+
+  updateComboMessage();
+}
+
+// ===============================
+// Add Product
+// ===============================
+function addProductByModel() {
+  const input = document.getElementById("modelSearch");
+  const model = (input.value || "").trim().toUpperCase();
+  if (!model) return alert("Please enter a Model Number.");
+
+  const found = PRODUCT_MASTER.find((p) => p.model.toUpperCase() === model);
+  if (!found) return alert("Model Number not found.");
+
+  const existing = cart.find((x) => x.model.toUpperCase() === model);
+
+  if (existing) existing.qty += 1;
+  else cart.push({ model: found.model, price: found.price, qty: 1, comboSelected: false });
+
+  input.value = "";
+  document.getElementById("suggestions").style.display = "none";
+  document.getElementById("suggestions").innerHTML = "";
+
+  renderCart();
+  refreshSummary();
+}
+
+// ===============================
+// Offer ID Generator
+// ===============================
+function generateOfferId() {
+  const d = new Date();
+  const y = d.getFullYear();
+  const m = String(d.getMonth() + 1).padStart(2, "0");
+  const day = String(d.getDate()).padStart(2, "0");
+
+  const key = `HH_OFFER_COUNTER_${y}${m}${day}`;
+  let counter = Number(localStorage.getItem(key) || 0);
+  counter += 1;
+  localStorage.setItem(key, String(counter));
+
+  return `HH-${y}${m}${day}-${String(counter).padStart(4, "0")}`;
+}
+
+// ===============================
+// Expiry
+// ===============================
+let expiryTimer = null;
+
+function startExpiryTicker() {
+  if (expiryTimer) clearInterval(expiryTimer);
+
+  function tick() {
+    const el = document.getElementById("expireText");
+
+    if (!offerCreated || !offerExpiresAt) {
+      el.innerText = "Create Offer to start validity";
+      return;
+    }
+
+    const diff = offerExpiresAt - Date.now();
+    if (diff <= 0) {
+      el.innerText = "Offer Expired";
+      document.getElementById("offerStatusText").innerText = "Expired";
+      return;
+    }
+
+    const hours = Math.floor(diff / (1000 * 60 * 60));
+    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
+    el.innerText = `Offer valid till: ${new Date(offerExpiresAt).toLocaleString()} | Time left: ${hours}h ${mins}m`;
+  }
+
+  tick();
+  expiryTimer = setInterval(tick, 30000);
+}
+
+// ===============================
+// Breakdown Toggle
+// ===============================
+function toggleBreakdown() {
+  breakdownVisible = !breakdownVisible;
+  document.getElementById("breakdownBox").classList.toggle("hide", !breakdownVisible);
+  document.getElementById("toggleBreakdownBtn").innerText = breakdownVisible
+    ? "👁️ Hide Breakdown"
+    : "👁️ Show Breakdown";
+}
+
+// ===============================
+// Slip Header Update
+// ===============================
+function refreshSlipHeader() {
+  document.getElementById("slipCustomerName").innerText =
+    (document.getElementById("customerName").value || "-").trim() || "-";
+
+  document.getElementById("slipCustomerMobile").innerText =
+    cleanMobile(document.getElementById("customerMobile").value) || "-";
+
+  document.getElementById("slipSalesPerson").innerText =
+    (document.getElementById("salesPerson").value || "-").trim() || "-";
+}
+
+// ===============================
+// Summary Update
+// ===============================
+function refreshSummary() {
+  const paymentModeValue = document.getElementById("paymentMode").value;
+  const paymentMode = paymentModeValue === "UPI" ? "UPI" : "NET";
+
+  const orderValue = getCartTotal();
+  const comboDisc = comboDiscountAmount();
+  const webDisc = websiteDiscount(orderValue);
+  const upiDisc = upiDiscount(orderValue, paymentMode);
+
+  const sp = getSpecialDiscount();
+
+  const totalDisc = comboDisc + webDisc + upiDisc + sp.amount;
+  const finalPay = Math.max(orderValue - totalDisc, 0);
+
+  document.getElementById("orderValue").innerText = formatINR(orderValue);
+  document.getElementById("webDisc").innerText = formatINR(webDisc);
+  document.getElementById("upiDisc").innerText = formatINR(upiDisc);
+  document.getElementById("finalPay").innerText = formatINR(finalPay);
+  document.getElementById("totalSavings").innerText = formatINR(totalDisc);
+
+  // Combo row
+  const comboRow = document.getElementById("comboRow");
+  const comboDiscEl = document.getElementById("comboDisc");
+
+  if (document.getElementById("comboEnable").checked && comboDisc > 0) {
+    comboRow.classList.remove("hide");
+    comboDiscEl.innerText = formatINR(comboDisc);
+  } else {
+    comboRow.classList.add("hide");
+    comboDiscEl.innerText = formatINR(0);
+  }
+
+  // Special row
+  const specialRow = document.getElementById("specialRow");
+  const specialDiscEl = document.getElementById("specialDisc");
+  const specialLabel = document.getElementById("specialLabel");
+
+  if (document.getElementById("specialEnable").checked && sp.amount > 0) {
+    specialRow.classList.remove("hide");
+    specialDiscEl.innerText = formatINR(sp.amount);
+    specialLabel.innerText = sp.name ? `Special Discount (${sp.name})` : "Special Discount";
+  } else {
+    specialRow.classList.add("hide");
+    specialDiscEl.innerText = formatINR(0);
+    specialLabel.innerText = "Special Discount";
+  }
+
+  // Payment hint
+  const hint = document.getElementById("paymentHint");
+  if (paymentMode === "UPI") {
+    hint.innerHTML = `<span class="pill pill-upi">UPI Selected (UPI Discount Active)</span>`;
+  } else {
+    hint.innerHTML = `<span class="pill pill-net">Net Banking Selected (UPI Discount OFF)</span>`;
+  }
+
+  if (!offerCreated) {
+    document.getElementById("expireText").innerText = "Create Offer to start validity";
+  }
+
+  refreshSlipHeader();
+  updateComboMessage();
+}
+
+// ===============================
+// Save Offer To Google Sheet
+// ===============================
+async function saveOfferToGoogleSheet() {
+  try {
+    const paymentMode =
+      document.getElementById("paymentMode").value === "UPI" ? "UPI" : "Net Banking";
+
+    const orderValue = getCartTotal();
+    const comboDisc = comboDiscountAmount();
+    const webDisc = websiteDiscount(orderValue);
+    const upiDisc = upiDiscount(orderValue, paymentMode === "UPI" ? "UPI" : "NET");
+
+    const sp = getSpecialDiscount();
+
+    const totalDiscount = comboDisc + webDisc + upiDisc + sp.amount;
+    const finalPayable = Math.max(orderValue - totalDiscount, 0);
+
+    const productsText = cart.map((p) => `${p.model} x${p.qty}`).join(" | ");
+
+    const payload = {
+      offerId: offerId || "",
+      customerName: (document.getElementById("customerName").value || "").trim(),
+      mobile: cleanMobile(document.getElementById("customerMobile").value),
+      salesPerson: (document.getElementById("salesPerson").value || "").trim(),
+      paymentMode: paymentMode,
+      products: productsText,
+      orderValue: orderValue,
+      websiteDiscount: webDisc,
+      upiDiscount: upiDisc,
+      comboDiscount: comboDisc,
+      specialDiscount: sp.amount,
+      totalDiscount: totalDiscount,
+      finalPayable: finalPayable,
+      validTill: offerExpiresAt ? new Date(offerExpiresAt).toLocaleString() : ""
+    };
+
+    await fetch(GOOGLE_SAVE_API_URL, {
+      method: "POST",
+      headers: { "Content-Type": "text/plain;charset=utf-8" },
+      body: JSON.stringify(payload),
+    });
+  } catch (err) {
+    console.error("❌ Save failed:", err);
+    alert("❌ Failed to save offer in Google Sheet.");
+  }
+}
+
+// ===============================
+// Create Offer
+// ===============================
+function createOffer() {
+  const customerName = (document.getElementById("customerName").value || "").trim();
+  const mobile = cleanMobile(document.getElementById("customerMobile").value);
+  const sales = (document.getElementById("salesPerson").value || "").trim();
+
+  if (!customerName) return alert("Please enter Customer Name.");
+  if (mobile.length !== 10) return alert("Please enter valid 10-digit mobile.");
+  if (!sales) return alert("Please enter Sales Person name.");
+  if (cart.length === 0) return alert("Please add at least 1 product.");
+
+  offerCreated = true;
+  offerExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
+  offerId = generateOfferId();
+
+  document.getElementById("offerIdText").innerText = offerId;
+  document.getElementById("offerStatusText").innerText = "Active";
+
+  refreshSummary();
+  startExpiryTicker();
+  saveOfferToGoogleSheet();
+}
+
+// ===============================
+// WhatsApp Message
+// ===============================
+function makeOfferText() {
+  const sales = (document.getElementById("salesPerson").value || "").trim() || "N/A";
+  const customerName = (document.getElementById("customerName").value || "").trim() || "N/A";
+  const mobile = cleanMobile(document.getElementById("customerMobile").value) || "N/A";
+
+  const paymentMode =
+    document.getElementById("paymentMode").value === "UPI" ? "UPI" : "Net Banking";
+
+  const orderValue = getCartTotal();
+  const comboDisc = comboDiscountAmount();
+  const webDisc = websiteDiscount(orderValue);
+  const upiDisc = upiDiscount(orderValue, paymentMode === "UPI" ? "UPI" : "NET");
+
+  const sp = getSpecialDiscount();
+  const totalDisc = comboDisc + webDisc + upiDisc + sp.amount;
+  const finalPay = Math.max(orderValue - totalDisc, 0);
+
+  let lines = [];
+  lines.push("🏷️ *HunyHuny Overseas Pvt. Ltd.*");
+  lines.push(`🆔 Offer ID: *${offerId || "Not Created"}*`);
+  lines.push("");
+  lines.push(`👤 Customer: *${customerName}*`);
+  lines.push(`📞 Mobile: *${mobile}*`);
+  lines.push(`🧑‍💼 Sales: *${sales}*`);
+  lines.push("");
+  lines.push("🛒 *Products:*");
+
+  cart.forEach((it, i) => {
+    lines.push(`${i + 1}) ${it.model} x${it.qty} = ${formatINR(getItemTotal(it))}`);
+  });
+
+  lines.push("");
+  lines.push(`💳 Payment Mode: *${paymentMode}*`);
+  lines.push(`💰 Order Value: *${formatINR(orderValue)}*`);
+
+  if (document.getElementById("comboEnable").checked && comboDisc > 0) {
+    lines.push(`🎁 Combo Discount (3%): *${formatINR(comboDisc)}*`);
+  }
+
+  lines.push(`🎁 Website Discount: *${formatINR(webDisc)}*`);
+  lines.push(`🎁 UPI Discount: *${formatINR(upiDisc)}*`);
+
+  if (document.getElementById("specialEnable").checked && sp.amount > 0) {
+    lines.push(`🎁 Special Discount (${sp.name || "Offer"}): *${formatINR(sp.amount)}*`);
+  }
+
+  lines.push(`✅ Total Discount: *${formatINR(totalDisc)}*`);
+  lines.push(`✅ Final Payable: *${formatINR(finalPay)}*`);
+  lines.push("");
+  lines.push("⚠️ Offer valid for 24 hours only.");
+
+  return lines.join("\n");
+}
+
+async function copySummary() {
+  await navigator.clipboard.writeText(makeOfferText());
+  alert("✅ Offer summary copied.");
+}
+
+function shareWhatsApp() {
+  const msg = encodeURIComponent(makeOfferText());
+  window.open(`https://wa.me/?text=${msg}`, "_blank");
+}
+
+// ===============================
+// Screenshot copy to clipboard
+// ===============================
+async function copyScreenshotToClipboard() {
+  if (!navigator.clipboard || !window.ClipboardItem) {
+    alert("❌ Clipboard screenshot not supported. Use Chrome.");
+    return;
+  }
+
+  const node = document.getElementById("slipContent");
+  const canvas = await html2canvas(node, { scale: 2 });
+  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
+
+  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
+  alert("✅ Screenshot copied. Now paste in WhatsApp.");
+}
+
+// ===============================
+// Clear
+// ===============================
+function clearCartOnly() {
+  cart = [];
+  renderCart();
+  refreshSummary();
+}
+
+function clearAll() {
+  cart = [];
+  offerCreated = false;
+  offerExpiresAt = null;
+  offerId = null;
+
+  // ✅ Sales Person will NOT be cleared (Auto-saved)
+  document.getElementById("customerName").value = "";
+  document.getElementById("customerMobile").value = "";
+  document.getElementById("modelSearch").value = "";
+  document.getElementById("paymentMode").value = "UPI";
+
+  document.getElementById("specialEnable").checked = false;
+  updateSpecialOfferUI();
+
+  document.getElementById("comboEnable").checked = false;
+  clearComboSelections();
+
+  document.getElementById("offerIdText").innerText = "Not Created";
+  document.getElementById("offerStatusText").innerText = "Not Created";
+
+  renderCart();
+  refreshSummary();
+  refreshSlipHeader();
+}
+
+// ===============================
+// Events
+// ===============================
+document.getElementById("addProductBtn").addEventListener("click", addProductByModel);
+document.getElementById("modelSearch").addEventListener("input", (e) => showSuggestions(e.target.value));
+document.getElementById("paymentMode").addEventListener("change", refreshSummary);
+
+// ✅ Auto-save sales person name
+document.getElementById("salesPerson").addEventListener("input", saveSalesPersonNameLive);
+
+document.getElementById("specialEnable").addEventListener("change", updateSpecialOfferUI);
+document.getElementById("specialName").addEventListener("input", refreshSummary);
+document.getElementById("specialAmt").addEventListener("input", refreshSummary);
+
+document.getElementById("comboEnable").addEventListener("change", () => {
+  const enabled = document.getElementById("comboEnable").checked;
+  if (!enabled) clearComboSelections();
+  renderCart();
+  refreshSummary();
+});
+
+document.getElementById("createOfferBtn").addEventListener("click", createOffer);
+document.getElementById("toggleBreakdownBtn").addEventListener("click", toggleBreakdown);
+
+document.getElementById("screenshotBtn").addEventListener("click", copyScreenshotToClipboard);
+document.getElementById("copyBtn").addEventListener("click", copySummary);
+document.getElementById("whatsappBtn").addEventListener("click", shareWhatsApp);
+
+document.getElementById("clearCartBtn").addEventListener("click", clearCartOnly);
+document.getElementById("clearAllBtn").addEventListener("click", clearAll);
+
+// ===============================
+// Init
+// ===============================
+(async function init() {
+  await loadProductsFromSheet();
+
+  // ✅ Auto-fill saved sales person name
+  loadSalesPersonName();
+
+  updateSpecialOfferUI();
+  refreshSummary();
+  renderCart();
+  refreshSlipHeader();
+})();
 
EOF
)
