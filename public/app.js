(function () {
  "use strict";

  var STATUS_FLOW = ["new", "processing", "fulfilled"];
  var STATUS_LABEL = { new: "New", processing: "Processing", fulfilled: "Fulfilled" };

  var state = {
    user: null,           // { type: 'customer'|'staff', name, ... }
    mustChangePassword: false,
    products: [],
    cart: {},             // key: productId|size -> { productId, name, image, size, pcs, bundles }
    note: "",
    orders: [],
    execTab: "orders",
    dirSearch: "",
    dirResults: [],
    dirTotal: 0,
    openOrderId: null,
    loginError: "",
    customerView: "catalog",  // "catalog" | "confirmation"
    lastOrder: null
  };

  var app = document.getElementById("app");
  var topBar = document.getElementById("topBar");
  var whoBar = document.getElementById("whoBar");

  // ---------- API helper ----------
  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (options.body && typeof options.body !== "string") options.body = JSON.stringify(options.body);
    return fetch("/api" + path, options).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        return data;
      });
    });
  }

  function showToast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  // ---------- Boot ----------
  function boot() {
    api("/auth/me").then(function (data) {
      if (data.user) {
        state.user = data.user;
        afterLogin();
      } else {
        renderLogin();
      }
    });
  }

  function afterLogin() {
    topBar.hidden = false;
    if (state.user.type === "customer") {
      loadProductsThenRenderCustomer();
    } else {
      state.execTab = "orders";
      loadOrdersThenRenderExec();
    }
    renderTopBar();
  }

  // ---------- Top bar ----------
  function renderTopBar() {
    if (!state.user) { whoBar.innerHTML = ""; return; }
    var label = state.user.type === "customer" ? state.user.name : (state.user.name + " (Order Desk)");
    whoBar.innerHTML = '<span>' + label + '</span> <button type="button" class="link-btn" id="logoutBtn">Log out</button>';
    document.getElementById("logoutBtn").addEventListener("click", function () {
      api("/auth/logout", { method: "POST" }).then(function () {
        state.user = null;
        state.cart = {};
        state.orders = [];
        topBar.hidden = true;
        renderTopBar();
        renderLogin();
      });
    });
  }

  // ---------- Login ----------
  function renderLogin() {
    topBar.hidden = true;
    app.innerHTML =
      '<div class="login-wrap">' +
      '  <img class="logo-img" src="/images/logo.png" alt="Ginni Steel">' +
      '  <h1>Ginni Steel</h1>' +
      '  <p class="tag">Order Desk — sign in to continue</p>' +
      '  <form id="loginForm">' +
      '    <div class="field"><label>Phone number (customers) or email (staff)</label><input type="text" id="loginUser" autocomplete="username" required></div>' +
      '    <div class="field"><label>Password</label><input type="password" id="loginPass" autocomplete="current-password" required></div>' +
      '    <button type="submit" class="btn-primary">Log in</button>' +
      (state.loginError ? '<div class="form-error">' + state.loginError + '</div>' : '') +
      '  </form>' +
      '  <div class="login-hint">First time logging in? Use the temporary password your order desk gave you — you\u2019ll be asked to set a new one.</div>' +
      '</div>';

    document.getElementById("loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var username = document.getElementById("loginUser").value;
      var password = document.getElementById("loginPass").value;
      api("/auth/login", { method: "POST", body: { username: username, password: password } })
        .then(function (data) {
          state.loginError = "";
          state.user = { type: data.type, name: data.name };
          state.mustChangePassword = data.mustChangePassword;
          if (state.mustChangePassword) {
            renderChangePassword();
          } else {
            afterLogin();
          }
        })
        .catch(function (err) {
          state.loginError = err.message;
          renderLogin();
        });
    });
  }

  function renderChangePassword() {
    topBar.hidden = true;
    app.innerHTML =
      '<div class="login-wrap">' +
      '  <img class="logo-img" src="/images/logo.png" alt="Ginni Steel">' +
      '  <h1>Set a new password</h1>' +
      '  <p class="tag">This is your first login \u2014 choose a password only you know.</p>' +
      '  <form id="pwForm">' +
      '    <div class="field"><label>New password (min 6 characters)</label><input type="password" id="newPass" autocomplete="new-password" required minlength="6"></div>' +
      '    <div class="field"><label>Confirm new password</label><input type="password" id="newPass2" autocomplete="new-password" required minlength="6"></div>' +
      '    <button type="submit" class="btn-primary">Save and continue</button>' +
      '    <div class="form-error" id="pwError"></div>' +
      '  </form>' +
      '</div>';

    document.getElementById("pwForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var newPassword = document.getElementById("newPass").value;
      var newPassword2 = document.getElementById("newPass2").value;
      if (newPassword !== newPassword2) {
        document.getElementById("pwError").textContent = "Those two passwords don't match \u2014 please re-type them.";
        return;
      }
      api("/auth/change-password", { method: "POST", body: { newPassword: newPassword } })
        .then(function () {
          state.mustChangePassword = false;
          afterLogin();
        })
        .catch(function (err) {
          document.getElementById("pwError").textContent = err.message;
        });
    });
  }

  // ================= CUSTOMER VIEW =================
  function loadProductsThenRenderCustomer() {
    if (state.products.length) { renderCustomerView(); return; }
    api("/products").then(function (products) {
      state.products = products;
      renderCustomerView();
    });
  }

  function formatRupees(n) {
    return "\u20b9" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  function estimateAmount(sizeObj, bundles) {
    if (!sizeObj || sizeObj.weightKg == null || sizeObj.ratePerKg == null) return null;
    return sizeObj.weightKg * bundles * sizeObj.ratePerKg;
  }

  function sizeInfoHtml(sizeObj) {
    if (!sizeObj) return "";
    var est = estimateAmount(sizeObj, 1);
    var detailParts = [];
    if (sizeObj.ratePerKg != null) detailParts.push(formatRupees(sizeObj.ratePerKg) + "/kg");
    if (sizeObj.weightKg != null) detailParts.push(sizeObj.weightKg + " kg/bundle");
    if (sizeObj.pcs != null) detailParts.push(sizeObj.pcs + " pcs/bundle");
    var detail = detailParts.join(" \u00b7 ");
    if (est == null) return detail ? '<div class="price-detail">' + detail + '</div>' : "";
    return ''
      + '<div class="price-est">~' + formatRupees(est) + ' <span class="price-label">estimated / bundle</span></div>'
      + (detail ? '<div class="price-detail">' + detail + '</div>' : '');
  }

  function cartCount() {
    var n = 0;
    for (var k in state.cart) n += state.cart[k].bundles;
    return n;
  }

  function productById(id) {
    for (var i = 0; i < state.products.length; i++) if (state.products[i].id === id) return state.products[i];
    return null;
  }

  function renderCustomerView() {
    if (state.customerView === "confirmation" && state.lastOrder) {
      renderOrderConfirmation();
    } else {
      renderCatalogView();
    }
  }

  function renderCatalogView() {
    var html = "";
    html += '<h1 class="page-title">Place an order</h1>';
    html += '<p class="page-sub">Pick items and sizes from the catalog below, set quantities, then submit. Your order goes straight to the order desk.</p>';
    html += '<div class="work-grid">';

    html += '<div class="catalog">';
    state.products.forEach(function (p) {
      var sizeOpts = p.sizes.map(function (s) {
        return '<option value="' + s.label + '"'
          + ' data-pcs="' + (s.pcs == null ? "" : s.pcs) + '"'
          + ' data-weight="' + (s.weightKg == null ? "" : s.weightKg) + '"'
          + ' data-rate="' + (s.ratePerKg == null ? "" : s.ratePerKg) + '"'
          + '>' + s.label + '</option>';
      }).join("");
      var firstInfo = sizeInfoHtml(p.sizes[0]);
      html +=
        '<div class="product-card">' +
        '  <div class="product-photo"><img src="' + p.image + '" alt="' + p.name + '" loading="lazy"></div>' +
        '  <div class="pname">' + p.name + '</div>' +
        '  <div class="pcat">' + p.category + '</div>' +
        '  <select data-pid="' + p.id + '" class="size-select">' + sizeOpts + '</select>' +
        '  <div class="size-info" id="info-' + p.id + '">' + firstInfo + '</div>' +
        '  <div class="qty-row">' +
        '    <span class="qty-label">Bundles</span>' +
        '    <div class="stepper">' +
        '      <button type="button" class="qty-dec" data-pid="' + p.id + '">\u2212</button>' +
        '      <input type="text" inputmode="numeric" class="qty-input" data-pid="' + p.id + '" value="1">' +
        '      <button type="button" class="qty-inc" data-pid="' + p.id + '">+</button>' +
        '    </div>' +
        '  </div>' +
        '  <button type="button" class="add-btn" data-pid="' + p.id + '">Add to order</button>' +
        '</div>';
    });
    html += '</div>';

    html += '<div class="cart">';
    html += '<h2>Current order</h2>';
    html += '<div class="cart-sub">' + state.user.name + '</div>';
    var keys = Object.keys(state.cart);
    var grandTotal = 0;
    var hasAnyEstimate = false;
    if (keys.length === 0) {
      html += '<div class="cart-empty">No items added yet. Add products from the catalog to build your order.</div>';
    } else {
      keys.forEach(function (k) {
        var line = state.cart[k];
        var pcsTxt = line.pcs != null ? " (" + (line.pcs * line.bundles) + " pcs)" : "";
        var est = estimateAmount(line, line.bundles);
        var amountTxt = "";
        if (est != null) {
          grandTotal += est;
          hasAnyEstimate = true;
          amountTxt = " \u00b7 ~" + formatRupees(est);
        }
        html +=
          '<div class="cart-line">' +
          '  <div class="thumb"><img src="' + line.image + '" alt="' + line.name + '"></div>' +
          '  <div class="desc"><span class="lname">' + line.name + '</span> \u00d7 ' + line.bundles + ' bundle' + (line.bundles > 1 ? "s" : "") + pcsTxt + '<br><span class="lsize">' + line.size + amountTxt + '</span></div>' +
          '  <button type="button" class="remove" data-key="' + k + '">Remove</button>' +
          '</div>';
      });
      if (hasAnyEstimate) {
        html += '<div class="cart-total">Estimated total: ~' + formatRupees(grandTotal) + '</div>';
        html += '<div class="cart-disclaimer">Estimate only \u2014 actual weight can vary about 2%. Final invoice is confirmed against the dispatch weight.</div>';
      }
    }
    html += '<textarea class="note-field" id="orderNote" placeholder="Delivery notes or special instructions (optional)">' + state.note + '</textarea>';
    html += '<button type="button" class="submit-btn" id="submitOrder"' + (keys.length === 0 ? " disabled" : "") + '>Submit order' + (keys.length ? " (" + cartCount() + " bundles)" : "") + '</button>';
    html += '</div>';
    html += '</div>';

    app.innerHTML = html;
    wireCustomerEvents();
  }

  function readSizeOption(opt) {
    return {
      pcs: opt.dataset.pcs === "" ? null : parseInt(opt.dataset.pcs, 10),
      weightKg: opt.dataset.weight === "" ? null : parseFloat(opt.dataset.weight),
      ratePerKg: opt.dataset.rate === "" ? null : parseFloat(opt.dataset.rate)
    };
  }

  function wireCustomerEvents() {
    app.querySelectorAll(".size-select").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var pid = sel.dataset.pid;
        var opt = sel.selectedOptions[0];
        var infoEl = document.getElementById("info-" + pid);
        if (infoEl) infoEl.innerHTML = sizeInfoHtml(readSizeOption(opt));
      });
    });
    app.querySelectorAll(".qty-dec").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = app.querySelector('.qty-input[data-pid="' + btn.dataset.pid + '"]');
        input.value = Math.max(1, parseInt(input.value || "1", 10) - 1);
      });
    });
    app.querySelectorAll(".qty-inc").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = app.querySelector('.qty-input[data-pid="' + btn.dataset.pid + '"]');
        input.value = Math.max(1, parseInt(input.value || "1", 10) + 1);
      });
    });
    app.querySelectorAll(".add-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pid = btn.dataset.pid;
        var product = productById(pid);
        var sizeSel = app.querySelector('.size-select[data-pid="' + pid + '"]');
        var qtyInp = app.querySelector('.qty-input[data-pid="' + pid + '"]');
        var opt = sizeSel.selectedOptions[0];
        var size = opt.value;
        var sizeData = readSizeOption(opt);
        var bundles = Math.max(1, parseInt(qtyInp.value || "1", 10));
        var key = pid + "|" + size;
        if (state.cart[key]) {
          state.cart[key].bundles += bundles;
        } else {
          state.cart[key] = {
            productId: pid, name: product.name, image: product.image, size: size,
            bundles: bundles, pcs: sizeData.pcs, weightKg: sizeData.weightKg, ratePerKg: sizeData.ratePerKg
          };
        }
        showToast(product.name + " (" + size + ") added");
        renderCustomerView();
      });
    });
    app.querySelectorAll(".remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        delete state.cart[btn.dataset.key];
        renderCustomerView();
      });
    });
    var noteField = document.getElementById("orderNote");
    if (noteField) noteField.addEventListener("input", function (e) { state.note = e.target.value; });

    var submitBtn = document.getElementById("submitOrder");
    if (submitBtn) submitBtn.addEventListener("click", function () {
      var cartKeys = Object.keys(state.cart);
      var items = cartKeys.map(function (k) {
        var l = state.cart[k];
        return { productId: l.productId, size: l.size, bundles: l.bundles };
      });
      if (items.length === 0) return;
      var confirmationItems = cartKeys.map(function (k) { return state.cart[k]; });
      var noteAtSubmit = state.note;
      submitBtn.disabled = true;
      api("/orders", { method: "POST", body: { items: items, note: state.note } })
        .then(function (res) {
          state.lastOrder = {
            orderCode: res.orderCode,
            customerName: state.user.name,
            items: confirmationItems,
            note: noteAtSubmit
          };
          state.cart = {};
          state.note = "";
          state.customerView = "confirmation";
          renderCustomerView();
        })
        .catch(function (err) {
          showToast(err.message);
          submitBtn.disabled = false;
        });
    });
  }

  function renderOrderConfirmation() {
    var o = state.lastOrder;
    var html = "";
    html += '<div class="confirm-wrap">';
    html += '  <div class="confirm-check">\u2713</div>';
    html += '  <h1 class="page-title">Order confirmed</h1>';
    html += '  <p class="page-sub">Order <strong>' + o.orderCode + '</strong> has been sent to the Ginni Steel order desk.</p>';
    html += '  <div class="confirm-card">';
    html += '    <div class="confirm-row confirm-head"><span>' + o.customerName + '</span></div>';
    var total = 0;
    var hasAnyEstimate = false;
    o.items.forEach(function (line) {
      var pcsTxt = line.pcs != null ? " (" + (line.pcs * line.bundles) + " pcs)" : "";
      var est = estimateAmount(line, line.bundles);
      var amountTxt = "";
      if (est != null) { total += est; hasAnyEstimate = true; amountTxt = " \u00b7 ~" + formatRupees(est); }
      html += '    <div class="confirm-row">';
      html += '      <div class="thumb"><img src="' + line.image + '" alt="' + line.name + '"></div>';
      html += '      <div class="desc"><span class="lname">' + line.name + '</span> \u00d7 ' + line.bundles + ' bundle' + (line.bundles > 1 ? "s" : "") + pcsTxt + '<br><span class="lsize">' + line.size + amountTxt + '</span></div>';
      html += '    </div>';
    });
    if (hasAnyEstimate) {
      html += '    <div class="confirm-row confirm-head"><span>Estimated total</span><span>~' + formatRupees(total) + '</span></div>';
    }
    if (o.note) html += '    <div class="confirm-note">Note: ' + o.note + '</div>';
    html += '  </div>';
    if (hasAnyEstimate) {
      html += '  <div class="cart-disclaimer">Estimate only \u2014 actual weight can vary about 2%. Final invoice is confirmed against the dispatch weight.</div>';
    }
    html += '  <button type="button" class="btn-primary" id="placeAnother">Place another order</button>';
    html += '</div>';

    app.innerHTML = html;
    document.getElementById("placeAnother").addEventListener("click", function () {
      state.customerView = "catalog";
      state.lastOrder = null;
      renderCustomerView();
    });
  }

  // ================= EXECUTIVE VIEW =================
  function loadOrdersThenRenderExec() {
    api("/orders").then(function (orders) {
      state.orders = orders;
      renderExecutiveView();
    });
  }

  function timeAgo(iso) {
    var d = new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function renderExecutiveView() {
    var html = "";
    html += '<h1 class="page-title">Order desk</h1>';
    html += '<p class="page-sub">' + (state.execTab === "directory"
      ? "Look up phone numbers for any party on file."
      : "Every order customers submit lands here in real time, newest first.") + '</p>';

    html += '<div class="exec-tabs">';
    html += '  <button type="button" class="exec-tab' + (state.execTab === "orders" ? " active" : "") + '" data-tab="orders">Orders</button>';
    html += '  <button type="button" class="exec-tab' + (state.execTab === "directory" ? " active" : "") + '" data-tab="directory">Customer Directory</button>';
    html += '</div>';

    if (state.execTab === "directory") {
      html += renderDirectoryTab();
    } else {
      html += renderOrdersTab();
    }

    app.innerHTML = html;

    app.querySelectorAll(".exec-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        state.execTab = b.dataset.tab;
        if (state.execTab === "directory" && state.dirResults.length === 0) {
          searchDirectory("");
        } else {
          renderExecutiveView();
        }
      });
    });

    if (state.execTab === "directory") {
      var dirInput = document.getElementById("dirSearch");
      if (dirInput) {
        dirInput.addEventListener("input", debounce(function (e) {
          searchDirectory(e.target.value);
        }, 250));
        dirInput.focus();
        var len = dirInput.value.length;
        dirInput.setSelectionRange(len, len);
      }
      return;
    }

    app.querySelectorAll(".order-head").forEach(function (h) {
      h.addEventListener("click", function () {
        var id = h.dataset.id;
        state.openOrderId = state.openOrderId === id ? null : id;
        renderExecutiveView();
      });
    });
    app.querySelectorAll(".status-btn").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = b.dataset.id;
        var status = b.dataset.status;
        api("/orders/" + id + "/status", { method: "PATCH", body: { status: status } })
          .then(function () {
            state.orders.forEach(function (o) { if (String(o.id) === String(id)) o.status = status; });
            renderExecutiveView();
          })
          .catch(function (err) { showToast(err.message); });
      });
    });
  }

  function renderOrdersTab() {
    var total = state.orders.length;
    var pending = state.orders.filter(function (o) { return o.status !== "fulfilled"; }).length;
    var fulfilled = state.orders.filter(function (o) { return o.status === "fulfilled"; }).length;

    var html = "";
    html += '<div class="stats-row">';
    html += '  <div class="stat"><div class="num">' + total + '</div><div class="lbl">Total orders</div></div>';
    html += '  <div class="stat pending"><div class="num">' + pending + '</div><div class="lbl">Awaiting action</div></div>';
    html += '  <div class="stat fulfilled"><div class="num">' + fulfilled + '</div><div class="lbl">Fulfilled</div></div>';
    html += '</div>';

    if (state.orders.length === 0) {
      html += '<div class="empty-state"><div class="big">\u2014</div>No orders yet.</div>';
    } else {
      state.orders.forEach(function (o) {
        var open = state.openOrderId === String(o.id);
        var orderTotal = 0;
        var hasAnyEstimate = false;
        o.items.forEach(function (it) { if (it.estimated_amount != null) { orderTotal += it.estimated_amount; hasAnyEstimate = true; } });
        html += '<div class="order-card">';
        html += '  <div class="order-head" data-id="' + o.id + '">';
        html += '    <span class="oid">GS-' + (1000 + o.id) + '</span>';
        html += '    <span class="ocust">' + o.customer_name + '</span>';
        html += '    <span class="ophone">' + o.customer_phone + '</span>';
        html += '    <span class="badge ' + o.status + '">' + STATUS_LABEL[o.status] + '</span>';
        if (hasAnyEstimate) html += '    <span class="oamount">~' + formatRupees(orderTotal) + '</span>';
        html += '    <span class="otime">' + timeAgo(o.created_at) + '</span>';
        html += '  </div>';
        html += '  <div class="order-body' + (open ? " open" : "") + '">';
        html += '    <div class="overflow-x"><table class="order-items"><thead><tr><th>Item</th><th>Size</th><th>Bundles</th><th>Pcs</th><th>Amount</th></tr></thead><tbody>';
        o.items.forEach(function (it) {
          var pcsTxt = it.pcs_per_bundle != null ? (it.pcs_per_bundle * it.bundles) : "\u2014";
          var amtTxt = it.estimated_amount != null ? "~" + formatRupees(it.estimated_amount) : "\u2014";
          html += '<tr><td>' + it.product_name + '</td><td>' + it.size_label + '</td><td>' + it.bundles + '</td><td>' + pcsTxt + '</td><td>' + amtTxt + '</td></tr>';
        });
        html += '    </tbody></table></div>';
        if (hasAnyEstimate) html += '<div class="cart-disclaimer">Estimated from listed weight \u2014 actual weight (and final invoice) can vary about 2%, confirmed at dispatch.</div>';
        if (o.note) html += '<div class="order-note">Note: ' + o.note + '</div>';
        html += '    <div class="status-actions">';
        STATUS_FLOW.forEach(function (s) {
          html += '<button type="button" class="status-btn' + (o.status === s ? " current" : "") + '" data-id="' + o.id + '" data-status="' + s + '">' + STATUS_LABEL[s] + '</button>';
        });
        html += '    </div>';
        html += '  </div>';
        html += '</div>';
      });
    }
    return html;
  }

  function renderDirectoryTab() {
    var html = "";
    html += '<input type="text" id="dirSearch" class="dir-search" placeholder="Search by business name\u2026" value="' + state.dirSearch.replace(/"/g, "&quot;") + '">';
    if (state.dirResults.length === 0) {
      html += '<div class="empty-state"><div class="big">\u2014</div>No parties match "' + state.dirSearch + '".</div>';
    } else {
      html += '<div class="dir-count">' + state.dirResults.length + ' of ' + state.dirTotal + ' parties' + (state.dirResults.length === 200 ? ' (showing first 200 \u2014 refine your search)' : '') + '</div>';
      html += '<div class="dir-list">';
      state.dirResults.forEach(function (c) {
        html += '<div class="dir-row"><span class="dir-name">' + c.name + '</span><span class="dir-phone">' + c.phone + '</span></div>';
      });
      html += '</div>';
    }
    return html;
  }

  function searchDirectory(q) {
    state.dirSearch = q;
    api("/customers?search=" + encodeURIComponent(q)).then(function (data) {
      state.dirResults = data.results;
      state.dirTotal = data.total;
      renderExecutiveView();
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  boot();
})();
