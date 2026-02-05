diff --git a/script.js b/script.js
index 0bd4093946b074a06fcc5d7b459edbfc4016c903..94c457b142e9cf32e2b3f59ccbbea41c2fafa764 100644
--- a/script.js
+++ b/script.js
@@ -20,52 +20,63 @@ const SALES_NAME_KEY = "HH_SALES_PERSON_NAME";
 
 function loadSalesPersonName() {
   const saved = localStorage.getItem(SALES_NAME_KEY);
   if (saved) {
     document.getElementById("salesPerson").value = saved;
   }
 }
 
 function saveSalesPersonNameLive() {
   const name = (document.getElementById("salesPerson").value || "").trim();
   localStorage.setItem(SALES_NAME_KEY, name);
 }
 
 // ===============================
 // Helpers
 // ===============================
 function formatINR(n) {
   n = Number(n || 0);
   return "₹" + n.toLocaleString("en-IN");
 }
 
 function cleanMobile(m) {
   return (m || "").replace(/\D/g, "").trim();
 }
 
+function getItemDiscountPct(item) {
+  const pct = Number(item.discountPct || 0);
+  return Math.min(Math.max(pct, 0), 100);
+}
+
+function getItemOfferPrice(item) {
+  const mrp = Number(item.price || 0);
+  const pct = getItemDiscountPct(item);
+  return Math.round(mrp * (1 - pct / 100));
+}
+
 function getItemTotal(item) {
-  return Number(item.price || 0) * Number(item.qty || 0);
+  return getItemOfferPrice(item) * Number(item.qty || 0);
 }
 
 function getCartTotal() {
   return cart.reduce((sum, item) => sum + getItemTotal(item), 0);
 }
 
 // ===============================
 // Discount Slabs (Updated)
 // ===============================
 function websiteDiscount(orderValue) {
   if (orderValue >= 20000) return 1000;
   if (orderValue >= 15000) return 700;
   if (orderValue >= 13000) return 500;
   if (orderValue >= 10000) return 500;
   if (orderValue >= 5000) return 200;
   return 0;
 }
 
 function upiDiscount(orderValue, paymentMode) {
   if (paymentMode !== "UPI") return 0;
   if (orderValue >= 20000) return 500;
   if (orderValue >= 15000) return 300;
   if (orderValue >= 13000) return 300;
   if (orderValue >= 10000) return 200;
   if (orderValue >= 5000) return 100;
@@ -100,51 +111,51 @@ function clearComboSelections() {
 
 // ===============================
 // Combo Guidance Message ✅
 // ===============================
 function updateComboMessage() {
   const box = document.getElementById("comboMessageBox");
   const enabled = document.getElementById("comboEnable").checked;
 
   if (!enabled) {
     box.style.display = "none";
     box.innerText = "";
     return;
   }
 
   const selected = cart.filter((x) => x.comboSelected);
   const eligible = cart.filter((x) => getItemTotal(x) >= 5000);
 
   box.style.display = "block";
 
   if (cart.length < 2) {
     box.innerText = "⚠️ Add at least 2 products to use Combo Discount.";
     return;
   }
 
   if (eligible.length < 2) {
-    box.innerText = "⚠️ Combo needs 2 products with total value ₹5000+ each (Price × Qty).";
+    box.innerText = "⚠️ Combo needs 2 products with total value ₹5000+ each (Offer Price × Qty).";
     return;
   }
 
   if (selected.length === 0) {
     box.innerText = "✅ Select any 2 eligible products to activate Combo Discount (3%).";
     return;
   }
 
   if (selected.length === 1) {
     box.innerText = "✅ Selected 1/2. Select 1 more product (each must be ₹5000+).";
     return;
   }
 
   if (selected.length === 2) {
     const t1 = getItemTotal(selected[0]);
     const t2 = getItemTotal(selected[1]);
 
     if (t1 < 5000 || t2 < 5000) {
       box.innerText = "⚠️ One selected product is below ₹5000. Combo Discount will NOT apply.";
       return;
     }
 
     box.innerText = "🎉 Combo Discount Active! 3% applied on both selected products total.";
     return;
   }
@@ -252,60 +263,82 @@ function showSuggestions(query) {
 // ===============================
 // Render Cart
 // ===============================
 function renderCart() {
   const tbody = document.getElementById("cartBody");
   tbody.innerHTML = "";
 
   const comboEnabled = document.getElementById("comboEnable").checked;
   document.getElementById("comboTh").classList.toggle("hide", !comboEnabled);
 
   cart.forEach((item, index) => {
     const tr = document.createElement("tr");
 
     const total = getItemTotal(item);
     const eligible = total >= 5000;
 
     tr.innerHTML = `
       <td class="comboTd ${comboEnabled ? "" : "hide"}">
         <input type="checkbox" class="comboChk" data-index="${index}"
           ${item.comboSelected ? "checked" : ""}
           ${comboEnabled && eligible ? "" : "disabled"}>
       </td>
 
       <td><b>${item.model}</b></td>
       <td>${formatINR(item.price)}</td>
+      <td>
+        <input class="disc" type="number" min="0" max="100" step="0.01" value="${getItemDiscountPct(item)}" data-index="${index}" />%
+        <div style="font-size:11px;color:#6b7280;">${formatINR(item.price - getItemOfferPrice(item))}</div>
+      </td>
+      <td><b>${formatINR(getItemOfferPrice(item))}</b></td>
       <td>
         <input class="qty" type="number" min="1" value="${item.qty}" data-index="${index}" />
       </td>
       <td><b>${formatINR(total)}</b></td>
       <td><button class="btn-danger" data-remove="${index}">Remove</button></td>
     `;
 
     tbody.appendChild(tr);
   });
 
+  document.querySelectorAll(".disc").forEach((inp) => {
+    inp.addEventListener("input", (e) => {
+      const idx = Number(e.target.dataset.index);
+      let d = Number(e.target.value || 0);
+      if (d < 0) d = 0;
+      if (d > 100) d = 100;
+
+      cart[idx].discountPct = d;
+
+      const total = getItemTotal(cart[idx]);
+      if (total < 5000) cart[idx].comboSelected = false;
+
+      refreshSummary();
+      renderCart();
+    });
+  });
+
   document.querySelectorAll(".qty").forEach((inp) => {
     inp.addEventListener("input", (e) => {
       const idx = Number(e.target.dataset.index);
       let q = Number(e.target.value || 1);
       if (q < 1) q = 1;
 
       cart[idx].qty = q;
 
       const total = getItemTotal(cart[idx]);
       if (total < 5000) cart[idx].comboSelected = false;
 
       refreshSummary();
       renderCart();
     });
   });
 
   document.querySelectorAll(".comboChk").forEach((chk) => {
     chk.addEventListener("change", (e) => {
       const idx = Number(e.target.dataset.index);
 
       if (e.target.checked) {
         const already = cart.filter((x) => x.comboSelected).length;
         if (already >= 2) {
           e.target.checked = false;
           alert("Combo Discount allows only 2 products selection.");
@@ -322,51 +355,51 @@ function renderCart() {
     btn.addEventListener("click", (e) => {
       const idx = Number(e.target.dataset.remove);
       cart.splice(idx, 1);
       refreshSummary();
       renderCart();
     });
   });
 
   updateComboMessage();
 }
 
 // ===============================
 // Add Product
 // ===============================
 function addProductByModel() {
   const input = document.getElementById("modelSearch");
   const model = (input.value || "").trim().toUpperCase();
   if (!model) return alert("Please enter a Model Number.");
 
   const found = PRODUCT_MASTER.find((p) => p.model.toUpperCase() === model);
   if (!found) return alert("Model Number not found.");
 
   const existing = cart.find((x) => x.model.toUpperCase() === model);
 
   if (existing) existing.qty += 1;
-  else cart.push({ model: found.model, price: found.price, qty: 1, comboSelected: false });
+  else cart.push({ model: found.model, price: found.price, qty: 1, discountPct: 0, comboSelected: false });
 
   input.value = "";
   document.getElementById("suggestions").style.display = "none";
   document.getElementById("suggestions").innerHTML = "";
 
   renderCart();
   refreshSummary();
 }
 
 // ===============================
 // Offer ID Generator
 // ===============================
 function generateOfferId() {
   const d = new Date();
   const y = d.getFullYear();
   const m = String(d.getMonth() + 1).padStart(2, "0");
   const day = String(d.getDate()).padStart(2, "0");
 
   const key = `HH_OFFER_COUNTER_${y}${m}${day}`;
   let counter = Number(localStorage.getItem(key) || 0);
   counter += 1;
   localStorage.setItem(key, String(counter));
 
   return `HH-${y}${m}${day}-${String(counter).padStart(4, "0")}`;
 }
@@ -576,51 +609,56 @@ function makeOfferText() {
   const mobile = cleanMobile(document.getElementById("customerMobile").value) || "N/A";
 
   const paymentMode =
     document.getElementById("paymentMode").value === "UPI" ? "UPI" : "Net Banking";
 
   const orderValue = getCartTotal();
   const comboDisc = comboDiscountAmount();
   const webDisc = websiteDiscount(orderValue);
   const upiDisc = upiDiscount(orderValue, paymentMode === "UPI" ? "UPI" : "NET");
 
   const sp = getSpecialDiscount();
   const totalDisc = comboDisc + webDisc + upiDisc + sp.amount;
   const finalPay = Math.max(orderValue - totalDisc, 0);
 
   let lines = [];
   lines.push("🏷️ *HunyHuny Overseas Pvt. Ltd.*");
   lines.push(`🆔 Offer ID: *${offerId || "Not Created"}*`);
   lines.push("");
   lines.push(`👤 Customer: *${customerName}*`);
   lines.push(`📞 Mobile: *${mobile}*`);
   lines.push(`🧑‍💼 Sales: *${sales}*`);
   lines.push("");
   lines.push("🛒 *Products:*");
 
   cart.forEach((it, i) => {
-    lines.push(`${i + 1}) ${it.model} x${it.qty} = ${formatINR(getItemTotal(it))}`);
+    const offerPrice = getItemOfferPrice(it);
+    const discPct = getItemDiscountPct(it);
+    const discAmt = Number(it.price || 0) - offerPrice;
+    lines.push(
+      `${i + 1}) ${it.model} | MRP ${formatINR(it.price)} | Disc ${discPct}% (${formatINR(discAmt)}) | Offer ${formatINR(offerPrice)} | Qty ${it.qty} | Total ${formatINR(getItemTotal(it))}`
+    );
   });
 
   lines.push("");
   lines.push(`💳 Payment Mode: *${paymentMode}*`);
   lines.push(`💰 Order Value: *${formatINR(orderValue)}*`);
 
   if (document.getElementById("comboEnable").checked && comboDisc > 0) {
     lines.push(`🎁 Combo Discount (3%): *${formatINR(comboDisc)}*`);
   }
 
   lines.push(`🎁 Website Discount: *${formatINR(webDisc)}*`);
   lines.push(`🎁 UPI Discount: *${formatINR(upiDisc)}*`);
 
   if (document.getElementById("specialEnable").checked && sp.amount > 0) {
     lines.push(`🎁 Special Discount (${sp.name || "Offer"}): *${formatINR(sp.amount)}*`);
   }
 
   lines.push(`✅ Total Discount: *${formatINR(totalDisc)}*`);
   lines.push(`✅ Final Payable: *${formatINR(finalPay)}*`);
   lines.push("");
   lines.push("⚠️ Offer valid for 24 hours only.");
 
   return lines.join("\n");
 }
 
