const GOOGLE_API_URL =
  "https://script.google.com/macros/s/AKfycbxFCHjVhhGmOMTUgMvjT2Hz6I0z2vhSKrLLhNzR9qX652jT8ZVteIw4Wa3FQP-vgIea/exec";

let cart = [];
let productCache = [];
let offerCreatedAt = null;

/* ---------------- LOAD PRODUCTS ---------------- */
fetch(GOOGLE_API_URL)
  .then(r => r.json())
  .then(d => productCache = d);

/* ---------------- ADD PRODUCT ---------------- */
async function addProduct() {
  const model = modelInput.value.trim();
  if (!model) return alert("Enter model number");

  if (cart.some(p => p.model === model)) {
    alert("Product already added");
    return;
  }

  const res = await fetch(`${GOOGLE_API_URL}?model=${encodeURIComponent(model)}`);
  const p = await res.json();

  if (!p.model) return alert("Product not found");

  cart.push({
    model: p.model,
    mrp: p.mrp,
    sheetDiscount: p.discountAmount,
    offerBase: p.offerPrice, // ✅ base for all discounts
    discountPercent: Math.round(p.discountPercent),
    qty: 1,
    comboSelected: false
  });

  modelInput.value = "";
  renderCart();
}

/* ---------------- DISCOUNT SLAB ---------------- */
function slabDiscount(total) {
  if (total >= 20000) return 1000;
  if (total >= 15000) return 700;
  if (total >= 13000) return 500;
  if (total >= 10000) return 500;
  if (total >= 5000) return 200;
  return 0;
}

/* ---------------- RENDER CART ---------------- */
function renderCart() {
  cartBody.innerHTML = "";

  let offerBaseTotal = cart.reduce((s, p) => s + p.offerBase * p.qty, 0);

  let webDisc = slabDiscount(offerBaseTotal);
  let upiDisc = paymentMode.value === "UPI" ? Math.round(webDisc * 0.5) : 0;

  // Combo logic
  const comboItems = cart.filter(p => p.comboSelected && p.offerBase >= 5000);
  let comboDisc = 0;
  if (comboItems.length === 2) {
    comboDisc = Math.round(
      comboItems.reduce((s, p) => s + p.offerBase * 0.03, 0)
    );
  }

  let specialDisc = specialEnable.checked
    ? Number(specialAmt.value || 0)
    : 0;

  const totalDiscount = webDisc + upiDisc + comboDisc + specialDisc;
  const finalPay = Math.max(offerBaseTotal - totalDiscount, 0);

  cart.forEach((p, i) => {
    cartBody.innerHTML += `
      <tr>
        <td>
          <input type="checkbox"
            ${p.comboSelected ? "checked" : ""}
            onchange="cart[${i}].comboSelected=this.checked;renderCart()">
        </td>
        <td>${p.model}</td>
        <td>₹${p.mrp}</td>
        <td>${p.discountPercent}% (₹${p.sheetDiscount})</td>
        <td>
          <input type="number" value="${p.qty}" min="1"
            onchange="cart[${i}].qty=this.value;renderCart()"
            style="width:60px">
        </td>
        <td>₹${p.offerBase}</td>
      </tr>
    `;
  });

  orderValue.innerText = "₹" + offerBaseTotal;

  toggleRow(webDiscRow, webDisc);
  toggleRow(upiDiscRow, upiDisc);
  toggleRow(comboDiscRow, comboDisc);
  toggleRow(specialDiscRow, specialDisc);

  webDiscEl.innerText = "₹" + webDisc;
  upiDiscEl.innerText = "₹" + upiDisc;
  comboDiscEl.innerText = "₹" + comboDisc;
  specialDiscEl.innerText = "₹" + specialDisc;

  totalSavings.innerText = "₹" + totalDiscount;
  finalPayEl.innerText = "₹" + finalPay;
}

/* ---------------- HELPERS ---------------- */
function toggleRow(row, value) {
  row.style.display = value > 0 ? "flex" : "none";
}

/* ---------------- CREATE OFFER ---------------- */
function createOffer() {
  offerCreatedAt = Date.now();
  offerId.innerText =
    "HH-OFF-" +
    new Date().toISOString().slice(0,10).replace(/-/g,"") +
    "-" +
    Math.floor(1000 + Math.random() * 9000);

  startTimer();
  takeScreenshot();
}

/* ---------------- TIMER ---------------- */
function startTimer() {
  setInterval(() => {
    const diff = 24*60*60*1000 - (Date.now() - offerCreatedAt);
    if (diff <= 0) {
      validity.innerText = "Offer Expired";
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    validity.innerText = `Valid for ${h}h ${m}m`;
  }, 1000);
}

/* ---------------- SCREENSHOT ---------------- */
function takeScreenshot() {
  html2canvas(document.getElementById("offerSlip")).then(canvas => {
    canvas.toBlob(blob => {
      navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob })
      ]);
      alert("Offer screenshot copied");
    });
  });
}
