const authForm = document.querySelector("#auth-form");
const statusMessage = document.querySelector("#status-message");
const authView = document.querySelector("#auth-view");
const submitButton = document.querySelector("#submit-button");
const passwordInput = document.querySelector("#password");
const passwordHint = document.querySelector("#password-hint");
const emailInput = document.querySelector("#email");
const loginTab = document.querySelector("#login-tab");
const registerTab = document.querySelector("#register-tab");
let csrfToken = "";
let mode = "login";

function showMessage(message, success = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("success", success);
}

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";
  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  loginTab.setAttribute("aria-selected", String(!registering));
  registerTab.setAttribute("aria-selected", String(registering));
  submitButton.textContent = registering ? "Utwórz konto" : "Zaloguj się";
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  passwordInput.minLength = registering ? 12 : 1;
  passwordHint.hidden = !registering;
  showMessage("");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers
    },
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Nie udało się wykonać żądania.");
  }
  return result;
}

async function loadAccount() {
  try {
    await api("/api/me");
    window.location.replace("/dashboard");
  } catch (error) {
    authView.hidden = false;
    if (error.message !== "Zaloguj się, aby kontynuować.") showMessage(error.message);
  }
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage("");
  try {
    const endpoint = mode === "register" ? "/api/register" : "/api/login";
    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({
        email: emailInput.value,
        password: passwordInput.value
      })
    });
    csrfToken = result.csrfToken;
    passwordInput.value = "";
    window.location.assign("/dashboard");
  } catch (error) {
    showMessage(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

async function initialize() {
  try {
    const result = await api("/api/csrf");
    csrfToken = result.csrfToken;
    await loadAccount();
  } catch (error) {
    showMessage(error.message);
  }
}

initialize();
