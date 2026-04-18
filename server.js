const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'dev-secret',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new Database('deals.db');

db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  googleId TEXT,
  email TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  userId TEXT
)`).run();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  let user = db.prepare('SELECT * FROM users WHERE googleId=?').get(profile.id);
  if (!user) {
    user = {
      id: uuidv4(),
      googleId: profile.id,
      email: profile.emails[0].value
    };
    db.prepare('INSERT INTO users VALUES (?, ?, ?)').run(user.id, user.googleId, user.email);
  }
  done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  done(null, user);
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
  res.redirect('/dashboard');
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).send('Login required');
  next();
}

app.get('/whoami', (req, res) => {
  res.json(req.user || null);
});

app.post('/token', (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  const token = uuidv4();
  db.prepare('INSERT INTO tokens VALUES (?, ?)').run(token, user.id);

  res.json({ access_token: token, token_type: 'bearer' });
});

function getUserFromToken(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  const row = db.prepare('SELECT * FROM tokens WHERE token=?').get(token);
  if (!row) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(row.userId);
}

app.post('/saveDeal', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  res.json({ ok: true, user: user.email });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(3000, () => console.log('OAuth server running'));