const formMessage = (id, text, success = false) => {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.classList.toggle("success", success); }
};
const forms = {
  login: document.getElementById("authForms"),
  register: document.getElementById("registerPanel"),
  setup: document.getElementById("setupPanel")
};
function show(which) {
  Object.entries(forms).forEach(([key, el]) => el.classList.toggle("hidden", key !== which));
}
document.getElementById("year").textContent = new Date().getFullYear();
document.getElementById("showRegister").addEventListener("click", () => show("register"));
document.getElementById("showLogin").addEventListener("click", () => show("login"));
async function boot() {
  try {
    const { user } = await API.get("/api/auth/me");
    location.href = user.role === "admin" ? "/admin" : "/student";
    return;
  } catch {}
  try {
    const { setupRequired } = await API.get("/api/setup/status");
    if (setupRequired) show("setup");
  } catch {}
}
document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  formMessage("loginMessage", "جارٍ تسجيل الدخول...");
  try {
    const { user } = await API.post("/api/auth/login", data);
    location.href = user.role === "admin" ? "/admin" : "/student";
  } catch (err) { formMessage("loginMessage", err.message); }
});
document.getElementById("registerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  formMessage("registerMessage", "جارٍ إنشاء الحساب...");
  try {
    await API.post("/api/auth/register", data);
    location.href = "/student";
  } catch (err) { formMessage("registerMessage", err.message); }
});
document.getElementById("setupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  formMessage("setupMessage", "جارٍ إعداد حساب الإدارة...");
  try {
    await API.post("/api/setup", data);
    location.href = "/admin";
  } catch (err) { formMessage("setupMessage", err.message); }
});
boot();
