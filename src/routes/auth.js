const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb } = require("../lib/db");

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

router.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/links");
  res.redirect("/login");
});

router.get("/login", (req, res) => {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(1) as c FROM users").get().c;
  res.render("login", { error: null, showSetup: count === 0 });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);
  if (!user) {
    const count = db.prepare("SELECT COUNT(1) as c FROM users").get().c;
    return res.render("login", {
      error: "Invalid username or password",
      showSetup: count === 0,
    });
  }
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    const count = db.prepare("SELECT COUNT(1) as c FROM users").get().c;
    return res.render("login", {
      error: "Invalid username or password",
      showSetup: count === 0,
    });
  }
  req.session.user = { id: user.id, username: user.username };
  res.redirect("/links");
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

router.get("/setup", (req, res) => {
  // Allow creating the first user if none exists yet
  const db = getDb();
  const count = db.prepare("SELECT COUNT(1) as c FROM users").get().c;
  if (count > 0) return res.redirect("/login");
  res.render("setup", { error: null });
});

router.post("/setup", (req, res) => {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(1) as c FROM users").get().c;
  if (count > 0) return res.redirect("/login");
  const { username, password } = req.body;
  if (!username || !password)
    return res.render("setup", { error: "Enter username and password" });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(username, hash);
    req.session.user = { id: info.lastInsertRowid, username };
    res.redirect("/links");
  } catch (e) {
    res.render("setup", { error: "Username already exists" });
  }
});

module.exports = { authRouter: router, requireAuth };
