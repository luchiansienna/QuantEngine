# Quant Dashboard

React and TypeScript working surface for the native QuantEngine. Calculations remain in C++; the browser calls the ASP.NET Core API through the Vite proxy.

## Run locally

Start `QuantWebApi` first on `http://localhost:51596`, with `QuantCli.exe` configured as described in `../QuantWebApi/README.md`.

Then run:

```powershell
cd apps\quant-dashboard
npm install
npm run dev
```

Open `http://localhost:5173`. The development server proxies `/api` requests to the ASP.NET Core API, so no development CORS policy is required.

Run `npm run build` to create the production bundle in `dist/`.
