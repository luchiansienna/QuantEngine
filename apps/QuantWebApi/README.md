# QuantWebApi

ASP.NET Core 8 API and browser dashboard backed by the native C++ QuantEngine.

## Build and run

First build the C++ solution so that `QuantCli` is available. On Windows with the repository's Visual Studio CMake preset, set its full path using an environment variable:

```powershell
$env:QuantEngine__ExecutablePath = "C:\path\to\QuantCli.exe"
dotnet run --project apps/QuantWebApi
```

Then open the URL printed by ASP.NET Core. The dashboard posts bond inputs to
`POST /api/bonds/analyse`; the API invokes `QuantCli` without a shell and returns
the native engine's valuation, risk metrics, cash flows and rate scenarios.

Example request:

```json
{
  "faceValue": 1000,
  "couponRate": 0.05,
  "maturityYears": 5,
  "paymentsPerYear": 2,
  "yield": 0.045,
  "shocksBasisPoints": [-100, -50, 0, 50, 100]
}
```
