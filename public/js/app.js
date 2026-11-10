const API = {
  async request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "تعذّر إكمال الطلب.");
    return data;
  },
  get(url) { return this.request(url); },
  post(url, body) { return this.request(url, { method: "POST", body: JSON.stringify(body) }); },
  put(url, body) { return this.request(url, { method: "PUT", body: JSON.stringify(body) }); },
  patch(url, body) { return this.request(url, { method: "PATCH", body: JSON.stringify(body) }); },
  delete(url) { return this.request(url, { method: "DELETE" }); }
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}
function dateLabel(value) {
  if (!value) return "غير محدد";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("ar-EG", { year:"numeric", month:"short", day:"numeric" });
}
function statusPill(status) {
  const labels = { published:"منشور", draft:"مسودة", active:"نشط", completed:"مكتمل", inactive:"موقوف", scheduled:"مجدول" };
  return `<span class="pill ${escapeHTML(status)}">${labels[status] || escapeHTML(status || "—")}</span>`;
}
function emptyState(message = "لا توجد بيانات لعرضها حالياً.") {
  return `<div class="empty-state"><div class="empty-icon">◇</div>${escapeHTML(message)}</div>`;
}
function field(label, name, value = "", type = "text", full = false, placeholder = "") {
  const safe = escapeHTML(value ?? "");
  if (type === "textarea") return `<div class="field ${full?"full":""}"><label>${label}</label><textarea name="${name}" placeholder="${placeholder}">${safe}</textarea></div>`;
  return `<div class="field ${full?"full":""}"><label>${label}</label><input name="${name}" type="${type}" value="${safe}" placeholder="${placeholder}"></div>`;
}
function selectField(label, name, value, options, full = false, required = false) {
  return `<div class="field ${full?"full":""}"><label>${label}</label><select name="${name}" ${required?"required":""}>${required?`<option value="">اختر الصف الدراسي</option>`:""}${options.map(o=>`<option value="${escapeHTML(o.value)}" ${String(value)===String(o.value)?"selected":""}>${escapeHTML(o.label)}</option>`).join("")}</select></div>`;
}
const GRADE_OPTIONS = [
  { value: "الصف الأول الإعدادي", label: "الصف الأول الإعدادي" },
  { value: "الصف الثاني الإعدادي", label: "الصف الثاني الإعدادي" },
  { value: "الصف الثالث الإعدادي", label: "الصف الثالث الإعدادي" },
  { value: "الصف الأول الثانوي", label: "الصف الأول الثانوي" },
  { value: "الصف الثاني الثانوي", label: "الصف الثاني الثانوي" },
  { value: "الصف الثالث الثانوي", label: "الصف الثالث الثانوي" }
];
function attachPasswordToggles(root = document) {
  $$('input[type="password"]', root).forEach(input => {
    if (input.dataset.passwordToggle === "ready") return;
    input.dataset.passwordToggle = "ready";
    const wrapper = document.createElement("span");
    wrapper.className = "password-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-toggle";
    button.setAttribute("aria-label", "إظهار كلمة المرور");
    button.setAttribute("aria-pressed", "false");
    const eye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOff = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"/></svg>';
    button.innerHTML = eye;
    button.addEventListener("click", () => {
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.innerHTML = visible ? eyeOff : eye;
      button.setAttribute("aria-label", visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
      button.setAttribute("aria-pressed", String(visible));
    });
    wrapper.appendChild(button);
  });
}
function requireRole(role) {
  return API.get("/api/auth/me").then(({user}) => {
    if (user.role !== role) location.href = user.role === "admin" ? "/admin" : "/student";
    return user;
  }).catch(() => { location.href = "/"; });
}
$$("[data-logout]").forEach(btn => btn.addEventListener("click", async () => {
  try { await API.post("/api/auth/logout", {}); } finally { location.href = "/"; }
}));
$("#mobileMenu")?.addEventListener("click", () => $(".sidebar")?.classList.toggle("open"));

async function loadPlatformSettings() {
  try {
    const settings = await API.get("/api/public/settings");

    // Update platform name everywhere
    if (settings.platform_name) {
      document.querySelectorAll("[data-platform-name]").forEach(el => {
        el.textContent = settings.platform_name;
      });

      document.title = document.title.replace(
        "منصة مستر أحمد",
        settings.platform_name
      );
    }

    // Update teacher name everywhere
    if (settings.teacher_name) {
      document.querySelectorAll("[data-teacher-name]").forEach(el => {
        el.textContent = settings.teacher_name;
      });
    }

    // Update announcement
    document.querySelectorAll("[data-announcement]").forEach(el => {
      el.textContent = settings.announcement || "";
      el.hidden = !settings.announcement;
    });

  } catch (error) {
    console.error("Settings loading failed:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => { attachPasswordToggles(); loadPlatformSettings(); });