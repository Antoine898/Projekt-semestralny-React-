const favoriteForm = document.querySelector("#favorite-form");
const favoriteList = document.querySelector("#favorite-list");
const favoriteStatus = document.querySelector("#favorite-status");
const favoriteCount = document.querySelector("#favorite-count");
const emptyMessage = document.querySelector("#empty-message");
const addButton = document.querySelector("#add-button");
const kindLabels = { league: "Liga", club: "Klub", player: "Zawodnik" };
let csrfToken = "";

function showStatus(message, success = false) {
  favoriteStatus.textContent = message;
  favoriteStatus.classList.toggle("success", success);
}

async function api(url, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": csrfToken } : {})
  };
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { ...headers, ...options.headers }
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Nie udało się wykonać żądania.");
  return result;
}

function renderFavorites(favorites) {
  favoriteList.replaceChildren();
  favoriteCount.textContent = `${favorites.length} / 100`;
  emptyMessage.hidden = favorites.length > 0;

  for (const favorite of favorites) {
    const item = document.createElement("li");
    item.className = "favorite-item";

    const details = document.createElement("div");
    details.className = "favorite-details";
    const kind = document.createElement("span");
    kind.className = "favorite-kind";
    kind.textContent = kindLabels[favorite.kind] || "Profil";
    const name = document.createElement("span");
    name.className = "favorite-name";
    name.textContent = favorite.name;
    details.append(kind, name);

    const removeButton = document.createElement("button");
    removeButton.className = "remove-button";
    removeButton.type = "button";
    removeButton.textContent = "Usuń";
    removeButton.setAttribute("aria-label", `Usuń profil: ${favorite.name}`);
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      try {
        await api(`/api/favorites/${favorite.id}`, { method: "DELETE" });
        await refreshFavorites();
        showStatus("Profil usunięto z listy.", true);
      } catch (error) {
        showStatus(error.message);
        removeButton.disabled = false;
      }
    });

    item.append(details, removeButton);
    favoriteList.append(item);
  }
}

async function refreshFavorites() {
  const { favorites } = await api("/api/favorites");
  renderFavorites(favorites);
}

favoriteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  addButton.disabled = true;
  showStatus("");
  const data = new FormData(favoriteForm);
  try {
    await api("/api/favorites", {
      method: "POST",
      body: JSON.stringify({
        kind: data.get("kind"),
        name: data.get("name")
      })
    });
    favoriteForm.reset();
    await refreshFavorites();
    showStatus("Dodano profil do obserwowanych.", true);
  } catch (error) {
    showStatus(error.message);
  } finally {
    addButton.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api("/api/logout", { method: "POST" });
    window.location.assign("/");
  } catch (error) {
    showStatus(error.message);
    button.disabled = false;
  }
});

async function initialize() {
  try {
    const csrf = await api("/api/csrf");
    csrfToken = csrf.csrfToken;
    const { user } = await api("/api/me");
    document.querySelector("#signed-in-user").textContent = `Zalogowano jako ${user.email}`;
    await refreshFavorites();
  } catch (error) {
    if (error.message === "Zaloguj się, aby kontynuować.") {
      window.location.replace("/");
      return;
    }
    showStatus(error.message);
  }
}

initialize();
