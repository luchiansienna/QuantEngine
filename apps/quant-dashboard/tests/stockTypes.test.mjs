import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

const source = fs.readFileSync(new URL('../src/stockTypes.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { readAlgorithmCatalog, rsi, runStats } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const valid = [{ id: 'sma-long-cash', name: 'SMA', assetClass: 'Stocks', description: 'Trend',
  parameters: [{ key: 'fastWindow', label: 'Fast', default: 20, min: 1, max: 100, step: 1 }] }]

test('old API catalog produces an actionable error instead of entering React state', () => {
  assert.throws(() => readAlgorithmCatalog([{ id: 'sma-long-cash', name: 'SMA', assetClass: 'Stocks' }]), /Rebuild and restart QuantWebApi/)
  assert.deepEqual(readAlgorithmCatalog(valid), valid)
})
test('malformed and duplicate catalog definitions are rejected', () => {
  for (const value of [null, [], {}, [...valid, ...valid], [{ ...valid[0], parameters: null }],
    [{ ...valid[0], parameters: [{ ...valid[0].parameters[0], default: NaN }] }]]) {
    assert.throws(() => readAlgorithmCatalog(value))
  }
})
test('Wilder RSI seeds and smooths gains and losses', () => {
  const bars = [100, 110, 100, 110].map(close => ({ date: '', open: close, close }))
  assert.deepEqual(rsi(bars, 2), [null, null, 50, 75])
  assert.deepEqual(rsi([100, 100, 100].map(close => ({ date: '', open: close, close })), 2), [null, null, 50])
})
test('statistics handle no equity and count net profitable round trips', () => {
  assert.equal(runStats([], [], 100).sharpe, null)
  const equity = [100, 100, 110].map((value, i) => ({ date: `2021-01-0${i + 1}`, cash: 0, shares: i ? 1 : 0, equity: value, benchmarkEquity: value }))
  const trades = [{ side: 'Buy', shares: 1, price: 100, fee: 1 }, { side: 'Sell', shares: 1, price: 102, fee: 1 }]
  const stats = runStats(equity, trades, 100)
  assert.equal(stats.closedTrades, 1)
  assert.equal(stats.wins, 0)
})
test('exposure uses eligible sessions when the benchmark initially stays flat', () => {
  const equity = [100, 100, 100, 110].map((value, i) => ({ date: `2021-01-0${i + 1}`,
    cash: 0, shares: i >= 2 ? 1 : 0, equity: value, benchmarkEquity: value }))
  assert.equal(runStats(equity, [], 100, 2).exposure, 1)
})
