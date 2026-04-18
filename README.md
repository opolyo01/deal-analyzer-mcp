# Deal Analyzer MCP

Minimal MCP-style app for analyzing real estate deals.

## Run locally

```bash
npm install
npm start
```

## API

POST /analyze

Example body:
```json
{
  "price": 500000,
  "rent": 3000,
  "taxes": 6000,
  "downPayment": 0.2
}
```

Response:
```json
{
  "cashFlow": -500,
  "capRate": 0.05,
  "score": 4,
  "recommendation": "PASS"
}
```
