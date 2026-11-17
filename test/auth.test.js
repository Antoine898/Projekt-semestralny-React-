const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { createServer } = require("node:http");
const { createApp } = require("../server/app");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ligascore-auth-"));
let server;
let app;
let baseUrl;
let cookie = "";
let csrfToken = "";

function cookieFrom(response) {
  const header = response.headers.get("set-cookie");
  return header ? header.split(";")[0] : "";
}

async function request(pathname, { method = "GET", body, csrf = csrfToken } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  if (csrf && method !== "GET") headers["X-CSRF-Token"] = csrf;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const nextCookie = cookieFrom(response);
  if (nextCookie) cookie = nextCookie;
  return {
    response,
    data: response.status === 204 ? null : await response.json()
  };
}

before(async () => {
  const databasePath = path.join(temporaryDirectory, "test.sqlite");
  const created = await createApp({
    databasePath,
    sessionSecret: "test-session-secret-that-is-long-enough-123456",
    authRateLimitLimit: 50
  });
  app = created;
  server = createServer(created.app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (app) app.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("rejestracja i sesja są zabezpieczone przed CSRF i utrwalone w SQLite", async () => {
  const csrfResponse = await request("/api/csrf");
  assert.equal(csrfResponse.response.status, 200);
  assert.match(csrfResponse.data.csrfToken, /^[a-zA-Z0-9_-]+$/);
  csrfToken = csrfResponse.data.csrfToken;
  const anonymousCookie = cookie;
  assert.match(anonymousCookie, /^ligascore\.sid=/);
  assert.match(csrfResponse.response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(csrfResponse.response.headers.get("set-cookie"), /SameSite=Lax/i);

  const blocked = await request("/api/register", {
    method: "POST",
    csrf: "",
    body: { email: "ala@example.com", password: "bardzo-dlugie-haslo" }
  });
  assert.equal(blocked.response.status, 403);

  const registered = await request("/api/register", {
    method: "POST",
    body: { email: "Ala@example.com", password: "bardzo-dlugie-haslo" }
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.data.user.email, "ala@example.com");
  assert.notEqual(cookie, anonymousCookie, "identyfikator sesji powinien zostać zmieniony");
  csrfToken = registered.data.csrfToken;

  const storedUser = app.db.prepare(
    "SELECT email, password_hash FROM users WHERE email = ?"
  ).get("ala@example.com");
  assert.ok(storedUser.password_hash.startsWith("$argon2id$"));
  assert.notEqual(storedUser.password_hash, "bardzo-dlugie-haslo");

  const me = await request("/api/me");
  assert.equal(me.response.status, 200);
  assert.equal(me.data.user.email, "ala@example.com");
});

test("logowanie odrzuca błędne hasło, a wylogowanie unieważnia sesję", async () => {
  await request("/api/logout", { method: "POST" });
  cookie = "";
  const csrfResponse = await request("/api/csrf");
  csrfToken = csrfResponse.data.csrfToken;

  const wrongPassword = await request("/api/login", {
    method: "POST",
    body: { email: "ala@example.com", password: "inne-dlugie-haslo" }
  });
  assert.equal(wrongPassword.response.status, 401);
  assert.equal(wrongPassword.data.error, "Nieprawidłowy e-mail lub hasło.");

  const login = await request("/api/login", {
    method: "POST",
    body: { email: "ala@example.com", password: "bardzo-dlugie-haslo" }
  });
  assert.equal(login.response.status, 200);
  csrfToken = login.data.csrfToken;
  assert.equal((await request("/api/me")).response.status, 200);

  const logout = await request("/api/logout", { method: "POST" });
  assert.equal(logout.response.status, 200);
  assert.equal((await request("/api/me")).response.status, 401);
});

test("rejestracja odrzuca słabe hasła i istniejące adresy", async () => {
  cookie = "";
  const csrfResponse = await request("/api/csrf");
  csrfToken = csrfResponse.data.csrfToken;

  const weakPassword = await request("/api/register", {
    method: "POST",
    body: { email: "nowy@example.com", password: "za-krotkie" }
  });
  assert.equal(weakPassword.response.status, 400);

  const duplicate = await request("/api/register", {
    method: "POST",
    body: { email: "ALA@example.com", password: "bardzo-dlugie-haslo" }
  });
  assert.equal(duplicate.response.status, 409);
});

test("pulpit jest chroniony, a lista profili należy wyłącznie do jej właściciela", async () => {
  const protectedPage = await fetch(`${baseUrl}/dashboard`, { redirect: "manual" });
  assert.equal(protectedPage.status, 302);
  const privateList = await request("/api/favorites");
  assert.equal(privateList.response.status, 401);

  const login = await request("/api/login", {
    method: "POST",
    body: { email: "ala@example.com", password: "bardzo-dlugie-haslo" }
  });
  assert.equal(login.response.status, 200);
  csrfToken = login.data.csrfToken;

  const emptyList = await request("/api/favorites");
  assert.equal(emptyList.response.status, 200);
  assert.deepEqual(emptyList.data.favorites, []);

  const added = await request("/api/favorites", {
    method: "POST",
    body: { kind: "club", name: "Real Madrid" }
  });
  assert.equal(added.response.status, 201);
  const favoriteId = added.data.favorite.id;

  const duplicate = await request("/api/favorites", {
    method: "POST",
    body: { kind: "club", name: "real madrid" }
  });
  assert.equal(duplicate.response.status, 409);

  await request("/api/logout", { method: "POST" });
  cookie = "";
  const anonymousCsrf = await request("/api/csrf");
  csrfToken = anonymousCsrf.data.csrfToken;
  const secondAccount = await request("/api/register", {
    method: "POST",
    body: { email: "bob@example.com", password: "inne-dlugie-haslo" }
  });
  assert.equal(secondAccount.response.status, 201);
  csrfToken = secondAccount.data.csrfToken;
  assert.deepEqual((await request("/api/favorites")).data.favorites, []);

  const forbiddenDelete = await request(`/api/favorites/${favoriteId}`, {
    method: "DELETE"
  });
  assert.equal(forbiddenDelete.response.status, 404);
  assert.deepEqual((await request("/api/favorites")).data.favorites, []);

  await request("/api/logout", { method: "POST" });
  cookie = "";
  const newCsrf = await request("/api/csrf");
  csrfToken = newCsrf.data.csrfToken;
  const ownerLogin = await request("/api/login", {
    method: "POST",
    body: { email: "ala@example.com", password: "bardzo-dlugie-haslo" }
  });
  csrfToken = ownerLogin.data.csrfToken;
  assert.equal((await request("/api/favorites")).data.favorites.length, 1);
  const removed = await request(`/api/favorites/${favoriteId}`, { method: "DELETE" });
  assert.equal(removed.response.status, 204);
  assert.deepEqual((await request("/api/favorites")).data.favorites, []);
});
