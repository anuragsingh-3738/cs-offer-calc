/* =========================
   CONFIG
========================= */
const GOOGLE_API_URL =
  "https://script.google.com/macros/s/AKfycbxFCHjVhhGmOMTUgMvjT2Hz6I0z2vhSKrLLhNzR9qX652jT8ZVteIw4Wa3FQP-vgIea/exec";

/* =========================
   STATE
========================= */
let cart = [];
let productCache = [];

/* =========================
   INIT – LOAD ALL PRODUCTS
========================= */
fetch(GOOGLE_API_URL)
  .then(res => res.json())
  .then(data => {
    if (Array.isArray(data)) {
      productCache = data;
    }
  })
  .catch(err => console.error("Failed to load product list", err));

/* =========================
   AUTO SUGGESTION
========================= */
const modelInput = document.getElementById("modelInput");
const suggestionBox = document.getElementById("suggestions");

modelInput.addEventListener("input", () => {
  const query = modelInput.value.trim().toLowerCase();
  suggestionBox.innerHTML = "";
  suggestionBox.style.display = "none";

  if (!query || query.length < 2) return;

  const matches = productCache
    .filter(p => p.model.toLowerCase().includes(query))
    .slice(0, 8);

  if (matches.length === 0) return;

  matches.forEach(p => {
    const div = document.createElement("div");
    div.className = "suggItem";
    div.innerHTML = `<b>${p.model}</b> — ₹${p.mrp}`;
    div.onclick = () => {
      modelInput.value = p.model;
      suggestionBox.style.display = "none";
    };
    suggestionBox.appendChild(div);
  });

  suggestionBox.style.display = "block";
});

document.addEventListener("click", e => {
  if (!modelInput.contains(e.target)) {
    suggestionBox.style.display = "none";
  }
});

/* =========================
   ADD PRODUCT BY MODEL
========================= */
async function addProduct() {
  const model = modelInput.value.trim();
  if (!model) {
    alert("Enter product model number");
    return;
  }

  // prevent duplicate
  if (cart.some(p => p.model === model)) {
    alert("Product already added");
    return;
  }

  try {
    const res = await fetch(`${GOOGLE_API_URL}?model=${encodeURIComponent(model)}`);
    const product = await res.json();

    if (!product || !product.model) {
      alert("Product not found in Google Sheet");
      return;
    }

    cart.push({
      model: product.model,
      mrp: product.mrp,
      sheetDiscount: product.discountAmount,
      sheetDiscountPercent: product.discountPercent,
      qty: 1
    });

    modelInput.value = "";
    suggestionBox.style.display = "none";
    renderCart();
  } catch (err) {
    console.error(err);
    alert("Failed to fetch product");
  }
}

/* =========================
   DISCOUNT SLAB LOGIC
========================= */
function getSlabDiscount(total) {
  if (total >= 20000) return { web: 1000, upi: 500 };
  if (total >= 15000) return { web: 700, upi: 300 };
  if (total >= 13000) return { web: 500, upi: 300 };
  if (total >= 10000) return { web: 500, upi: 200 };
  if (total >= 5000) return { web: 200, upi: 100 };
  return { web: 0, upi: 0 };
}

/* =========================
   RENDER CART
========================= */
function renderCart() {
  const cartBody = document.getElementById("cartBody");
  cartBody.innerHTML = "";

  let orderValue = cart.reduce((s, p) => s + p.mrp * p.qty, 0);
  let sheetDiscountTotal = cart.reduce((s, p) => s + p.sheetDiscount * p.qty, 0);

  const slab = getSlabDiscount(orderValue);
  const paymentMode = document.getElementById("paymentMode").value;
  const upiDiscount = paymentMode === "UPI" ? slab.upi : 0;

  const comboEnable = document.getElementById("comboEnable").checked;
  let comboDiscount = 0;
  if (comboEnable && cart.length === 2 && cart.every(p => p.mrp >= 5000)) {
    comboDiscount = Math.round(orderValue * 0.03);
  }

  const specialEnable = document.getElementById("specialEnable").checked;
  const specialAmt = specialEnable
    ? Number(document.getElementById("specialAmt").value || 0)
    : 0;

  const totalSavings =
    sheetDiscountTotal +
    slab.web +
    upiDiscount +
    comboDiscount +
    specialAmt;

  const finalPayable = Math.max(orderValue - totalSavings, 0);

  cart.forEach((p, i) => {
    const row = document.createElement("tr");

    const itemShare =
      orderValue > 0
        ? Math.round((p.mrp * p.qty / orderValue) * finalPayable)
        : 0;

    row.innerHTML = `
      <td>${p.model}</td>
      <td>₹${p.mrp}</td>
      <td>${p.sheetDiscountPercent}% (₹${p.sheetDiscount})</td>
      <td>
        <input type="number" min="1" value="${p.qty}"
          onchange="cart[${i}].qty=this.value; renderCart()"
          style="width:60px">
      </td>
      <td>₹${itemShare}</td>
      <td>
        <button onclick="cart.splice(${i},1); renderCart()">❌</button>
      </td>
    `;
    cartBody.appendChild(row);
  });

  // summary
  document.getElementById("orderValue").innerText = "₹" + orderValue;
  document.getElementById("webDisc").innerText = "₹" + slab.web;
  document.getElementById("upiDisc").innerText = "₹" + upiDiscount;
  document.getElementById("comboDisc").innerText = "₹" + comboDiscount;
  document.getElementById("specialDisc").innerText = "₹" + specialAmt;
  document.getElementById("totalSavings").innerText = "₹" + totalSavings;
  document.getElementById("finalPay").innerText = "₹" + finalPayable;
}

/* =========================
   CLEAR
========================= */
function clearCart() {
  cart = [];
  renderCart();
}
