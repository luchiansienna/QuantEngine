import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'
const source = fs.readFileSync(new URL('../src/portfolio.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { minimumVariance, buildPortfolio, readAsset } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`)

test('minimum variance matches the analytic uncorrelated two-asset solution', () => {
  const result = minimumVariance([.1, .2], [[.04, 0], [0, .09]], 0)
  near(result.weights[0], .09 / .13)
  near(result.volatility ** 2, .04 * .09 / .13)
  const target = minimumVariance([.1, .2], [[.04, 0], [0, .09]], .02, .15)
  near(target.weights[0], .5); near(target.mean, .15)
})
test('active sets exclude short positions and handle singular/equal-mean cases', () => {
  const result = minimumVariance([.1, .2], [[.04, .06], [.06, .09]], 0)
  near(result.weights[0], 1)
  const singular = minimumVariance([.1, .1], [[.04, .04], [.04, .04]], 0, .1)
  near(singular.volatility, .2)
  near(singular.weights.reduce((a,b) => a+b), 1)
  assert.throws(() => minimumVariance([.1, .2], [[.04, 0], [0, .09]], 0, .3), /feasible/)
})
test('multi-asset optimisation agrees with an analytic three-asset target', () => {
  const p = minimumVariance([.1,.2,.3], [[.04,0,0],[0,.04,0],[0,0,.04]], 0, .25)
  near(p.weights[0], 1/12); near(p.weights[1], 1/3); near(p.weights[2], 7/12)
  near(p.mean,.25)
})
const dates = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0,10))
function series(name, offset = 0) {
  let value = 100
  return { name, currency: 'USD', basis: 'test', points: dates.map((date,i) => { value *= 1 + .001 + Math.sin(i + offset)*.01; return { date, value } }) }
}
test('daily estimates use sample covariance and annualise consistently', () => {
  const a = series('A'), b = series('B', 2), model = buildPortfolio([a,b], .02)
  const returns = a.points.slice(1).map((p,i) => p.value/a.points[i].value-1)
  const mean = returns.reduce((a,b) => a+b)/returns.length
  near(model.means[0], mean*252)
  near(model.covariance[0][0], returns.reduce((s,v) => s+(v-mean)**2,0)/(returns.length-1)*252)
  near(model.covariance[0][1], model.covariance[1][0])
  for (const p of model.frontier) { near(p.weights.reduce((a,b) => a+b),1); assert.ok(p.weights.every(w => w >= 0)); assert.ok(p.mean >= model.minimum.mean - 1e-7) }
  near(model.equal.sharpe, (model.equal.mean-.02)/model.equal.volatility)
})
test('aligns shared endpoints and rejects missing sessions, currency mismatches and duplicates', () => {
  const a = series('A'), b = series('B',2)
  const shorter = {...b,points:b.points.slice(2)}
  assert.equal(buildPortfolio([a,shorter],0).dates.length,68)
  assert.throws(() => buildPortfolio([a,{...b, points:b.points.filter((_,i) => i !== 20)}],0), /Missing sessions/)
  assert.throws(() => buildPortfolio([a,{...b,currency:'GBP'}],0), /currency/)
  assert.throws(() => buildPortfolio([a,a],0), /unique/)
  assert.throws(() => buildPortfolio([a,{...b,points:[...b.points,b.points[0]]}],0), /duplicate/)
  assert.throws(() => buildPortfolio([a,b],NaN), /risk-free/)
})
test('imports actual backtest exports as prices or strategy equity', () => {
  const exported = {symbol:'A',currency:'USD',history:{bars:[{date:'2025-01-01',close:100}],priceBasis:'Dividends excluded'},result:{equity:[{date:'2025-01-01',equity:10000}]}}
  assert.equal(readAsset(exported,'prices').points[0].value,100)
  assert.equal(readAsset(exported,'strategy').points[0].value,10000)
  assert.throws(() => readAsset({},'strategy'), /Import/)
})
