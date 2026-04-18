# Deal Analyzer MCP

## 🚀 Overview
Full-stack real estate deal analysis platform:
- Advanced scoring engine (cash flow, cap rate, DSCR)
- Listing parser (Redfin/Zillow)
- Deal comparison + ranking
- SQLite persistence (deal history)
- ChatGPT MCP integration
- Mobile dashboard UI

---

## 🧠 Features

### 📊 Analyze Deals
- Cash flow
- Cap rate
- Cash-on-cash return
- DSCR
- Risk + strengths insights

### 🔎 Parse Listings
- Extract price, rent, taxes, beds, baths
- Works with URLs or pasted text

### 🥇 Compare Deals
- Rank investments
- Identify best deal

### 💾 Save & Track
- SQLite database (`deals.db`)
- Save + retrieve deals

### 🖥️ Dashboard
- Mobile-friendly UI
- Color-coded scoring (BUY / HOLD / PASS)
- Ranked deal list

---

## ⚙️ Run Locally

```bash
npm install
npm run build
npm start
```

Open:
```
http://localhost:3000/dashboard
```

For TypeScript development:

```bash
npm run dev
npm run check
npm run build
```

---

## 🔌 API Endpoints

- POST /analyze
- POST /parse-listing
- POST /compare
- POST /saveDeal
- GET /deals
- GET /dashboard

---

## 🤖 MCP Tools

- analyzeDeal
- parseListing
- analyzeListing
- compareDeals
- saveDeal
- getDeals

---

## 🌐 Deploy (Railway - easiest)

1. Go to https://railway.app
2. Create new project → Deploy from GitHub
3. Select this repository
4. Deploy (no config needed)

Your app will be live at:
https://your-app.up.railway.app

---

## 🧠 Production Notes

- SQLite persists locally (fine for MVP)
- For scale → switch to Postgres
- Parser may break if listing sites change structure

---

## 💡 Next Steps

- Add authentication (multi-user SaaS)
- Integrate rent comps API
- Export reports (PDF)
- Add charts (ROI visualization)

---

## 🏆 Status

Production-ready MVP (backend + UI + persistence)
