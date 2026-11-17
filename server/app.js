const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const session = require("express-session");
const Database = require("better-sqlite3");
const argon2 = require("argon2");
const Tokens = require("csrf");

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
};
const tokens = new Tokens();

function initializeDatabase(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('league', 'club', 'player')),
      name TEXT NOT NULL COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (user_id, kind, name)
    );
    CREATE INDEX IF NOT EXISTS favorites_user_id ON favorites (user_id);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at ON auth_sessions (expires_at);
  `);
}

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.getStatement = db.prepare(
      "SELECT sess, expires_at FROM auth_sessions WHERE sid = ?"
    );
    this.setStatement = db.prepare(
      "INSERT INTO auth_sessions (sid, sess, expires_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at"
    );
    this.touchStatement = db.prepare(
      "UPDATE auth_sessions SET expires_at = ? WHERE sid = ?"
    );
    this.destroyStatement = db.prepare("DELETE FROM auth_sessions WHERE sid = ?");
    this.removeExpiredStatement = db.prepare(
      "DELETE FROM auth_sessions WHERE expires_at <= ?"
    );
    this.cleanupExpired();
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.destroyStatement.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expiry = sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + SESSION_MAX_AGE_MS;
      this.setStatement.run(sid, JSON.stringify(sess), expiry);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expiry = sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + SESSION_MAX_AGE_MS;
      this.touchStatement.run(expiry, sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroyStatement.run(sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  cleanupExpired() {
    this.removeExpiredStatement.run(Date.now());
  }

  close() {
    clearInterval(this.cleanupTimer);
  }
}

function asyncSessionRegenerate(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function createApp({
  databasePath = path.join(__dirname, "data", "ligascore.sqlite"),
  sessionSecret = process.env.SESSION_SECRET,
  secureCookies = process.env.NODE_ENV === "production",
  authRateLimitLimit = 10
} = {}) {
  const dataDirectory = path.dirname(databasePath);
  fs.mkdirSync(dataDirectory, { recursive: true });

  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error("W środowisku produkcyjnym wymagany jest SESSION_SECRET.");
  }
  if (sessionSecret && Buffer.byteLength(sessionSecret) < 32) {
    throw new Error("SESSION_SECRET musi mieć co najmniej 32 bajty.");
  }
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(48).toString("hex");
    console.warn("SESSION_SECRET nie ustawiono; sesje wygasną po ponownym uruchomieniu serwera.");
  }

  const db = new Database(databasePath);
  initializeDatabase(db);
  const findUserByEmail = db.prepare(
    "SELECT id, email, password_hash, created_at FROM users WHERE email = ?"
  );
  const findUserById = db.prepare(
    "SELECT id, email, created_at FROM users WHERE id = ?"
  );
  const insertUser = db.prepare(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)"
  );
  const listFavorites = db.prepare(
    "SELECT id, kind, name, created_at AS createdAt FROM favorites " +
    "WHERE user_id = ? ORDER BY created_at DESC, id DESC"
  );
  const countFavorites = db.prepare(
    "SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?"
  );
  const insertFavorite = db.prepare(
    "INSERT INTO favorites (user_id, kind, name) VALUES (?, ?, ?)"
  );
  const findFavorite = db.prepare(
    "SELECT id, kind, name, created_at AS createdAt FROM favorites WHERE id = ? AND user_id = ?"
  );
  const deleteFavorite = db.prepare(
    "DELETE FROM favorites WHERE id = ? AND user_id = ?"
  );
  const addFavorite = db.transaction((userId, kind, name) => {
    if (countFavorites.get(userId).count >= 100) return null;
    const result = insertFavorite.run(userId, kind, name);
    return findFavorite.get(Number(result.lastInsertRowid), userId);
  });
  const cookieName = secureCookies ? "__Host-ligascore.sid" : "ligascore.sid";

  const dummyHash = await argon2.hash(
    crypto.randomBytes(32).toString("hex"),
    PASSWORD_HASH_OPTIONS
  );

  const app = express();
  const sessionStore = new SQLiteSessionStore(db);
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"]
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  }));
  app.use(express.json({ limit: "10kb", strict: true }));
  app.use(session({
    name: cookieName,
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS,
      path: "/"
    }
  }));

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimitLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Zbyt wiele prób. Spróbuj ponownie za 15 minut." }
  });

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.get("/api/csrf", (req, res) => {
    if (!req.session.csrfSecret) {
      req.session.csrfSecret = tokens.secretSync();
    }
    res.json({ csrfToken: tokens.create(req.session.csrfSecret) });
  });

  app.get("/api/me", (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Zaloguj się, aby kontynuować." });
    }
    const user = findUserById.get(req.session.userId);
    if (!user) {
      return req.session.destroy((error) => {
        if (error) return res.status(500).json({ error: "Wystąpił błąd serwera." });
        res.clearCookie(cookieName, {
          httpOnly: true,
          secure: secureCookies,
          sameSite: "lax",
          path: "/"
        });
        res.status(401).json({ error: "Zaloguj się, aby kontynuować." });
      });
    }
    return res.json({
      user: { id: user.id, email: user.email, createdAt: user.created_at }
    });
  });

  function requireCsrf(req, res, next) {
    const csrfSecret = req.session.csrfSecret;
    const csrfToken = req.get("X-CSRF-Token");
    if (!csrfSecret || !csrfToken || !tokens.verify(csrfSecret, csrfToken)) {
      return res.status(403).json({ error: "Żądanie nie przeszło weryfikacji bezpieczeństwa." });
    }
    return next();
  }

  function validateCredentials(req, res, next) {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Podaj prawidłowy e-mail i hasło." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return res.status(400).json({ error: "Podaj prawidłowy adres e-mail." });
    }
    const passwordLength = [...password].length;
    if (passwordLength < 12 || passwordLength > 128 || Buffer.byteLength(password) > 1024) {
      return res.status(400).json({ error: "Hasło musi mieć od 12 do 128 znaków." });
    }

    req.credentials = { email: normalizedEmail, password };
    return next();
  }

  app.post(
    "/api/register",
    authRateLimit,
    requireCsrf,
    validateCredentials,
    async (req, res, next) => {
      try {
        const { email, password } = req.credentials;
        if (findUserByEmail.get(email)) {
          return res.status(409).json({ error: "Konto z tym adresem e-mail już istnieje." });
        }

        const passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);
        let result;
        try {
          result = insertUser.run(email, passwordHash);
        } catch (error) {
          if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ error: "Konto z tym adresem e-mail już istnieje." });
          }
          throw error;
        }

        await asyncSessionRegenerate(req);
        req.session.userId = Number(result.lastInsertRowid);
        req.session.csrfSecret = tokens.secretSync();
        return res.status(201).json({
          user: { id: Number(result.lastInsertRowid), email },
          csrfToken: tokens.create(req.session.csrfSecret)
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.post(
    "/api/login",
    authRateLimit,
    requireCsrf,
    validateCredentials,
    async (req, res, next) => {
      try {
        const { email, password } = req.credentials;
        const user = findUserByEmail.get(email);
        const matches = await argon2.verify(
          user ? user.password_hash : dummyHash,
          password
        );
        if (!user || !matches) {
          return res.status(401).json({ error: "Nieprawidłowy e-mail lub hasło." });
        }

        await asyncSessionRegenerate(req);
        req.session.userId = user.id;
        req.session.csrfSecret = tokens.secretSync();
        return res.json({
          user: { id: user.id, email: user.email },
          csrfToken: tokens.create(req.session.csrfSecret)
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  app.post("/api/logout", requireCsrf, (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie(cookieName, {
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        path: "/"
      });
      return res.status(200).json({ ok: true });
    });
  });

  function requireAuthentication(req, res, next) {
    if (!req.session.userId || !findUserById.get(req.session.userId)) {
      return res.status(401).json({ error: "Zaloguj się, aby kontynuować." });
    }
    return next();
  }

  app.get("/api/favorites", requireAuthentication, (req, res) => {
    return res.json({ favorites: listFavorites.all(req.session.userId) });
  });

  app.post("/api/favorites", requireCsrf, requireAuthentication, (req, res) => {
    const { kind, name } = req.body || {};
    const normalizedName = typeof name === "string" ? name.trim() : "";
    if (!["league", "club", "player"].includes(kind)) {
      return res.status(400).json({ error: "Wybierz prawidłowy rodzaj profilu." });
    }
    if (
      [...normalizedName].length < 2 ||
      [...normalizedName].length > 80 ||
      /[\u0000-\u001f\u007f]/.test(normalizedName)
    ) {
      return res.status(400).json({ error: "Nazwa musi mieć od 2 do 80 znaków." });
    }

    try {
      const favorite = addFavorite(req.session.userId, kind, normalizedName);
      if (!favorite) {
        return res.status(409).json({ error: "Osiągnięto limit 100 obserwowanych profili." });
      }
      return res.status(201).json({ favorite });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({ error: "Ten profil jest już na liście." });
      }
      throw error;
    }
  });

  app.delete("/api/favorites/:id", requireCsrf, requireAuthentication, (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id)) {
      return res.status(400).json({ error: "Nieprawidłowy identyfikator profilu." });
    }
    const favoriteId = Number(req.params.id);
    if (!Number.isSafeInteger(favoriteId)) {
      return res.status(400).json({ error: "Nieprawidłowy identyfikator profilu." });
    }
    const result = deleteFavorite.run(favoriteId, req.session.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Nie znaleziono obserwowanego profilu." });
    }
    return res.status(204).end();
  });

  app.get("/dashboard", (req, res) => {
    if (!req.session.userId || !findUserById.get(req.session.userId)) {
      return res.redirect(302, "/");
    }
    return res.sendFile(path.join(__dirname, "private", "dashboard.html"));
  });

  app.use(express.static(path.join(__dirname, "public"), {
    index: "index.html",
    dotfiles: "deny",
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
  }));

  app.use((req, res) => {
    res.status(404).json({ error: "Nie znaleziono strony." });
  });

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.type === "entity.too.large") {
      return res.status(413).json({ error: "Żądanie jest zbyt duże." });
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      return res.status(400).json({ error: "Nieprawidłowy format danych." });
    }
    console.error("Błąd serwera obsługującego konto:", error);
    return res.status(500).json({ error: "Wystąpił błąd serwera." });
  });

  return {
    app,
    db,
    close() {
      sessionStore.close();
      db.close();
    }
  };
}

module.exports = { createApp };
