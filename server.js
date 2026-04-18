const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ================= DB =================
const db = new Database('deals.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  label TEXT,
  input TEXT,
  analysis TEXT,
  createdAt TEXT
)
`).run();

function saveDealDB(input, analysis) {
  const id = uuidv4();
  db.prepare(`INSERT INTO deals (id,label,input,analysis,createdAt) VALUES (?,?,?,?,?)`)
    .run(id, input.label || 'Deal', JSON.stringify(input), JSON.stringify(analysis), new Date().toISOString());
  return id;
}

function getDealsDB() {
  return db.prepare('SELECT * FROM deals ORDER BY createdAt DESC').all().map(r => ({
    ...r,
    input: JSON.parse(r.input),
    analysis: JSON.parse(r.analysis)
  }));
}

// ================= LOGIC =================
function estimateRent(price) {
  if (!price) return { rent: 0, estimated: true };
  let ratio = 0.006;
  if (price < 300000) ratio = 0.008;
  if (price > 800000) ratio = 0.005;
  return { rent: Math.round(price * ratio), estimated: true };
}

function calculateDeal(input = {}) {
  const price = Number(input.price || 0);
  let rent = input.rent;
  let estimatedRent = false;

  if (!rent) {
    const est = estimateRent(price);
    rent = est.rent;
    estimatedRent = true;
  }

  const taxes = input.taxes || price * 0.012;
  const monthlyCost = (price * 0.8 * 0.006) + (taxes / 12);
  const cashFlow = rent - monthlyCost;

  let score = 5;
  if (cashFlow > 500) score += 3;
  else if (cashFlow > 0) score += 1;
  else score -= 2;

  const recommendation = score >= 7 ? 'BUY' : score <= 4 ? 'PASS' : 'HOLD';

  return {
    summary: {
      score,
      recommendation,
      monthlyCashFlow: Math.round(cashFlow),
      rent,
      estimatedRent
    }
  };
}

async function parseListing({ url }) {
  if (!url) return {};
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const text = $('body').text();
  const priceMatch = text.match(/\$[\d,]+/);
  return { price: priceMatch ? Number(priceMatch[0].replace(/[$,]/g, '')) : null };
}

function compareDeals(deals = []) {
  const results = deals.map(d => calculateDeal(d));
  results.sort((a,b)=> b.summary.score - a.summary.score || b.summary.monthlyCashFlow - a.summary.monthlyCashFlow);
  return results;
}

// ================= MCP =================
const tools = [
  { name:'analyzeDeal', inputSchema:{type:'object',properties:{price:{type:'number'},rent:{type:'number'}},required:['price']}},
  { name:'parseListing', inputSchema:{type:'object',properties:{url:{type:'string'}}}},
  { name:'compareDeals', inputSchema:{type:'object',properties:{deals:{type:'array'}},required:['deals']}},
  { name:'saveDeal', inputSchema:{type:'object',properties:{price:{type:'number'},rent:{type:'number'},label:{type:'string'}},required:['price']}},
  { name:'getDeals', inputSchema:{type:'object',properties:{}}}
];

function jsonRpc(id, result){ return {jsonrpc:'2.0', id, result}; }
function jsonRpcError(id, message){ return {jsonrpc:'2.0', id, error:{message}}; }

app.post('/mcp', async (req,res)=>{
  const {id, method, params} = req.body || {};

  if(method==='initialize') return res.json(jsonRpc(id,{serverInfo:{name:'deal-analyzer-mcp',version:'1.0'}}));
  if(method==='tools/list') return res.json(jsonRpc(id,{tools}));

  if(method==='tools/call'){
    const name = params?.name;
    const args = params?.arguments || {};

    if(name==='analyzeDeal'){
      const r = calculateDeal(args);
      return res.json(jsonRpc(id,{content:[{type:'text',text:'analyzed'}],structuredContent:r}));
    }

    if(name==='parseListing'){
      const r = await parseListing(args);
      return res.json(jsonRpc(id,{content:[{type:'text',text:'parsed'}],structuredContent:r}));
    }

    if(name==='compareDeals'){
      const r = compareDeals(args.deals || []);
      return res.json(jsonRpc(id,{content:[{type:'text',text:'compared'}],structuredContent:r}));
    }

    if(name==='saveDeal'){
      const r = calculateDeal(args);
      const savedId = saveDealDB(args,r);
      return res.json(jsonRpc(id,{content:[{type:'text',text:'saved'}],structuredContent:{id:savedId,...r}}));
    }

    if(name==='getDeals'){
      const deals = getDealsDB();
      return res.json(jsonRpc(id,{content:[{type:'text',text:`${deals.length} deals`}],structuredContent:deals}));
    }

    return res.json(jsonRpcError(id,'Unknown tool'));
  }

  return res.json(jsonRpcError(id,'Unknown method'));
});

// ================= DASHBOARD =================
app.get('/dashboard',(req,res)=>{
  res.sendFile(path.join(__dirname,'dashboard.html'));
});

app.get('/deals',(req,res)=>{
  res.json(getDealsDB());
});

app.listen(3000,()=>console.log('APP RUNNING'));