const form = document.querySelector('#bond-form');
const error = document.querySelector('#error');
const submit = form.querySelector('[type=submit]');
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 });

const defaults = { faceValue: 1000, couponRate: 5, maturityYears: 5, paymentsPerYear: 2, yield: 4.5 };

function payload() {
  const data = new FormData(form);
  return {
    faceValue: +data.get('faceValue'), couponRate: +data.get('couponRate') / 100,
    maturityYears: +data.get('maturityYears'), paymentsPerYear: +data.get('paymentsPerYear'),
    yield: +data.get('yield') / 100, shocksBasisPoints: [-100, -50, -25, 0, 25, 50, 100]
  };
}

function metric(label, value, note) {
  return `<article class="metric"><p>${label}</p><strong>${value}</strong><small>${note}</small></article>`;
}

function render(data) {
  const m = data.metrics;
  document.querySelector('#metrics').innerHTML = [
    metric('Present value', number.format(m.presentValue), 'cash flows discounted today'),
    metric('Modified duration', number.format(m.modifiedDuration), 'price sensitivity to yield'),
    metric('DV01', number.format(m.dv01), 'value change for 1 bp'),
    metric('Convexity', number.format(m.convexity), 'curvature of price response'),
    metric('Macaulay duration', `${number.format(m.macaulayDuration)}y`, 'weighted cash-flow timing')
  ].join('');

  document.querySelector('#scenario-body').innerHTML = data.scenarios.map(s => `<tr>
    <td>${s.shockBasisPoints > 0 ? '+' : ''}${number.format(s.shockBasisPoints)} bp</td>
    <td>${number.format(s.shockedYield * 100)}%</td><td>${number.format(s.shockedPrice)}</td>
    <td class="${s.exactPnl >= 0 ? 'positive' : 'negative'}">${s.exactPnl >= 0 ? '+' : ''}${number.format(s.exactPnl)}</td>
    <td>${number.format(s.durationPnl)}</td><td>${number.format(s.durationConvexityPnl)}</td></tr>`).join('');
  renderChart(data.scenarios);
}

function renderChart(rows) {
  const width = 860, height = 260, pad = { l: 52, r: 20, t: 15, b: 38 };
  const values = rows.map(x => x.exactPnl), shocks = rows.map(x => x.shockBasisPoints);
  const minY = Math.min(0, ...values), maxY = Math.max(0, ...values);
  const x = v => pad.l + (v - Math.min(...shocks)) / (Math.max(...shocks) - Math.min(...shocks)) * (width - pad.l - pad.r);
  const y = v => pad.t + (maxY - v) / ((maxY - minY) || 1) * (height - pad.t - pad.b);
  const points = rows.map(r => `${x(r.shockBasisPoints)},${y(r.exactPnl)}`).join(' ');
  const zeroY = y(0);
  const ticks = rows.map(r => `<text x="${x(r.shockBasisPoints)}" y="${height - 10}" text-anchor="middle">${r.shockBasisPoints}</text>`).join('');
  const dots = rows.map(r => `<circle class="point" cx="${x(r.shockBasisPoints)}" cy="${y(r.exactPnl)}" r="4"><title>${r.shockBasisPoints} bp: ${number.format(r.exactPnl)}</title></circle>`).join('');
  document.querySelector('#chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Exact profit and loss by yield shock">
    <defs><linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#67d7ff" stop-opacity=".28"/><stop offset="1" stop-color="#67d7ff" stop-opacity="0"/></linearGradient></defs>
    <line class="axis" x1="${pad.l}" y1="${zeroY}" x2="${width-pad.r}" y2="${zeroY}"/>
    <polygon class="area" points="${x(shocks[0])},${zeroY} ${points} ${x(shocks.at(-1))},${zeroY}"/>
    <polyline class="line" points="${points}"/>${dots}${ticks}
    <text x="${pad.l-8}" y="${pad.t+4}" text-anchor="end">${number.format(maxY)}</text>
    <text x="${pad.l-8}" y="${height-pad.b}" text-anchor="end">${number.format(minY)}</text>
    <text x="${width/2}" y="${height}" text-anchor="middle">Yield shock (basis points)</text></svg>`;
}

async function analyse(event) {
  event?.preventDefault(); error.textContent = ''; submit.disabled = true; submit.firstChild.textContent = 'Calculating… ';
  try {
    const response = await fetch('/api/bonds/analyse', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload()) });
    if (!response.ok) throw new Error((await response.json()).detail || 'The calculation could not be completed.');
    render(await response.json());
  } catch (e) { error.textContent = e.message; }
  finally { submit.disabled = false; submit.firstChild.textContent = 'Run analysis '; }
}

form.addEventListener('submit', analyse);
document.querySelector('#reset').addEventListener('click', () => { Object.entries(defaults).forEach(([key,value]) => form.elements[key].value = value); analyse(); });
analyse();
