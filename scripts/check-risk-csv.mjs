// Run from repository root with Node 22+; uses the dashboard's installed TypeScript.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import ts from '../apps/quant-dashboard/node_modules/typescript/lib/typescript.js'
const source = fs.readFileSync(new URL('../apps/quant-dashboard/src/riskCsv.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {parseCsv, parseExposures, exposureCsv} = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const row = {tradeId:'NETTING-SET', counterparty:'CP,"quoted"', nettingSet:'NS',asOf:'2026-09-19',currency:'USD',metric:'PFE',tenor:1,confidence:.95,modelVersion:'v1',scenarioId:'id',value:12345.678}
assert.deepEqual(parseExposures(exposureCsv([row])),[row])
assert.deepEqual(parseExposures('\uFEFF'+exposureCsv([row])),[row])
assert.deepEqual(parseExposures(exposureCsv([])),[])
assert.deepEqual(parseCsv('a,"b\nc"\r\n1,2'),[['a','b\nc'],['1','2']])
assert.throws(()=>parseCsv('"unterminated'))
assert.throws(()=>parseCsv('"a"x,b'))
assert.throws(()=>parseCsv('a"b,c'))
assert.throws(()=>parseExposures('wrong,header'))
assert.throws(()=>parseExposures(exposureCsv([row]).replace('"12345.678"','""')))
assert.throws(()=>parseExposures(exposureCsv([row]).replace('"12345.678"','"NaN"')))
assert.throws(()=>parseExposures(exposureCsv([row]).replace('"PFE"','"UNKNOWN"')))
console.log('11 CSV parsing/roundtrip checks passed')
