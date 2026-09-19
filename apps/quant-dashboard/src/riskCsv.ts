import type { ExposureRow } from './riskTypes'
export const columns = ['tradeId', 'counterparty', 'nettingSet', 'asOf', 'currency', 'metric', 'tenor', 'confidence', 'modelVersion', 'scenarioId', 'value'] as const

// RFC-style quoting, doubled quotes, CRLF and embedded newlines; reject malformed rows.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false; closed = true }
      } else field += c
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++
        rows.push(row); row = []
      }
    } else if (closed) throw new Error('Unexpected character after a quoted CSV field.')
    else if (c === '"') {
      if (field.length) throw new Error('A CSV quote must start a field.')
      quoted = true
    } else field += c
  }
  if (quoted) throw new Error('Unclosed CSV quote.')
  if (field || row.length || closed) { row.push(field); rows.push(row) }
  return rows
}
export function parseExposures(text: string): ExposureRow[] {
  const [header, ...rows] = parseCsv(text)
  if (!header || header.join(',') !== columns.join(',')) throw new Error(`CSV header must be: ${columns.join(',')}`)
  if (rows.length > 10000) throw new Error('Maximum 10,000 rows per file.')
  return rows.map((cells, i) => {
    if (cells.length !== columns.length) throw new Error(`Row ${i + 2}: wrong column count.`)
    const row = Object.fromEntries(columns.map((c, j) => [c, cells[j]])) as Record<string, string | number>
    for (const name of ['tenor', 'confidence', 'value']) {
      const raw = row[name] as string
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) || !Number.isFinite(Number(raw))) throw new Error(`Row ${i + 2}: invalid ${name}.`)
      row[name] = Number(raw)
    }
    if (row.metric !== 'PFE' && row.metric !== 'EE') throw new Error(`Row ${i + 2}: metric must be PFE or EE.`)
    return row as ExposureRow
  })
}
const cell = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`
export function exposureCsv(rows: ExposureRow[]): string {
  return columns.join(',') + '\r\n' + rows.map(row => columns.map(c => cell(row[c])).join(',')).join('\r\n')
}
export function downloadFile(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
