const form = document.getElementById("trackForm");
const input = document.getElementById("tracking");
const result = document.getElementById("result");
const error = document.getElementById("error");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function formatDate(value) {
  return new Date(value + "Z").toLocaleString();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  result.classList.add("hidden");
  error.textContent = "";
  const number = input.value.trim().toUpperCase();
  if (!number) return;

  try {
    const res = await fetch("/api/track/" + encodeURIComponent(number));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unable to find shipment.");

    result.innerHTML = `
      <div class="result-head">
        <div>
          <p class="eyebrow">TRACKING NUMBER</p>
          <div class="tracking-code">${esc(data.tracking_number)}</div>
        </div>
        <span class="badge">${esc(data.status)}</span>
      </div>
      <hr>
      <p><strong>Recipient:</strong> ${esc(data.recipient_name)}</p>
      <p><strong>Destination:</strong> ${esc(data.destination)}</p>
      <p><strong>Package:</strong> ${esc(data.package_description)}</p>
      <p><strong>Last updated:</strong> ${esc(formatDate(data.updated_at))}</p>
      <h3>Tracking history</h3>
      <ul class="timeline">
        ${data.events.map(ev => `
          <li>
            <span class="dot"></span>
            <strong>${esc(ev.status)}</strong>
            ${ev.note ? `<div>${esc(ev.note)}</div>` : ""}
            <small>${esc(formatDate(ev.created_at))}</small>
          </li>
        `).join("")}
      </ul>
    `;
    result.classList.remove("hidden");
  } catch (err) {
    error.textContent = err.message;
  }
});