const loginPanel = document.getElementById("loginPanel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const shipmentsBody = document.getElementById("shipments");
const createForm = document.getElementById("createForm");
const createMessage = document.getElementById("createMessage");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}
function fmt(value) { return new Date(value + "Z").toLocaleString(); }

async function api(url, options={}) {
  const res = await fetch(url, { headers: {"Content-Type":"application/json"}, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function checkAuth() {
  const me = await api("/api/admin/me");
  loginPanel.classList.toggle("hidden", me.authenticated);
  dashboard.classList.toggle("hidden", !me.authenticated);
  if (me.authenticated) loadShipments();
}

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  loginError.textContent = "";
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      })
    });
    loginForm.reset();
    checkAuth();
  } catch (err) { loginError.textContent = err.message; }
});

document.getElementById("logout").addEventListener("click", async () => {
  await api("/api/admin/logout", {method:"POST"});
  checkAuth();
});

async function loadShipments() {
  const rows = await api("/api/admin/shipments");
  shipmentsBody.innerHTML = rows.map(s => `
    <tr>
      <td><strong>${esc(s.tracking_number)}</strong></td>
      <td>${esc(s.recipient_name)}</td>
      <td>${esc(s.destination)}</td>
      <td>
        <select data-id="${s.id}" class="status-select">
          ${["Shipment created","In transit","Out for delivery","Delivered"].map(x =>
            `<option ${x === s.status ? "selected" : ""}>${x}</option>`).join("")}
        </select>
      </td>
      <td>${esc(fmt(s.created_at))}</td>
      <td><button class="small danger delete-btn" data-id="${s.id}">Delete</button></td>
    </tr>
  `).join("");

  document.querySelectorAll(".status-select").forEach(el => {
    el.addEventListener("change", async e => {
      const note = prompt("Optional status note:", "");
      try {
        await api("/api/admin/shipments/" + e.target.dataset.id + "/status", {
          method: "PATCH",
          body: JSON.stringify({status: e.target.value, note: note || ""})
        });
        loadShipments();
      } catch (err) { alert(err.message); loadShipments(); }
    });
  });

  document.querySelectorAll(".delete-btn").forEach(el => {
    el.addEventListener("click", async () => {
      if (!confirm("Delete this shipment record? This also removes its tracking history.")) return;
      try {
        await api("/api/admin/shipments/" + el.dataset.id, {method:"DELETE"});
        loadShipments();
      } catch (err) { alert(err.message); }
    });
  });
}

createForm.addEventListener("submit", async e => {
  e.preventDefault();
  createMessage.textContent = "";
  try {
    const shipment = await api("/api/admin/shipments", {
      method: "POST",
      body: JSON.stringify({
        recipientName: document.getElementById("recipientName").value,
        destination: document.getElementById("destination").value,
        packageDescription: document.getElementById("packageDescription").value,
        status: document.getElementById("status").value,
        note: document.getElementById("note").value
      })
    });
    createForm.reset();
    createMessage.textContent = "Created: " + shipment.tracking_number;
    loadShipments();
  } catch (err) { createMessage.textContent = err.message; }
});

document.getElementById("refresh").addEventListener("click", loadShipments);
checkAuth().catch(() => {});
