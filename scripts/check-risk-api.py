"""Run against the risk API or tests/RiskApiHarness --serve; standard library only."""
import concurrent.futures
import json
import sys
import urllib.error
import urllib.request
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:51596'
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))
checks = 0
def post(path, body, status=200):
    global checks
    request = urllib.request.Request(BASE+'/api/risk/'+path, json.dumps(body).encode(), {'Content-Type':'application/json'})
    try:
        response = urllib.request.urlopen(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    assert response.status == status, (response.status, response.read().decode())
    checks += 1
    return json.load(response)
request = dict(spot=100, rate=.03, dividendYield=0, volatility=.2, maturity=1, confidence=.95,
    physicalDrift=.05, horizonDays=10, collateral=0, hazardRate=.02, recovery=.4, paths=10000,
    steps=12, seed=42, trades=[dict(quantity=1000,strike=100)])
r = post('analyse', request)
assert len(r['profile']) == 13 and r['cva'] > 0 and r['expectedShortfall'] >= r['var']
post('analyse', {**request, 'paths':100000,'steps':120}, 400)
post('analyse', {**request, 'trades':None}, 400)
post('analyse', {**request, 'trades':[None]}, 400)
post('analyse', {**request, 'maturity':.01}, 400)
post('credit-bond', dict(face=1000,coupon=.05,maturity=5,frequency=2,rate=.03,hazardRate=.02,recovery=.4))
h=post('historical-var', dict(confidence=.95,horizonDays=1,pnl=[-x for x in range(1,101)]))
assert h['var']==95 and abs(h['expectedShortfall']-98)<1e-10
post('historical-var', dict(confidence=.95,horizonDays=1,pnl=[]),400)
row = dict(tradeId='NETTING-SET',counterparty='CP',nettingSet='NS',asOf='2026-09-19',currency='USD',metric='PFE',tenor=1,confidence=.95,modelVersion='v1',scenarioId='same',value=10000)
a=post('reconcile', dict(engine=[row],reporting=[{**row,'value':10100}],absoluteTolerance=.01,relativeTolerance=.001))
assert a['breaks']==1 and a['rows'][0]['difference']==100
post('reconcile', dict(engine=[None],reporting=[]),400)
post('reconcile', dict(engine=[{**row,'asOf':'bad'}],reporting=[]),400)
post('reconcile', dict(engine=[{**row,'metric':None}],reporting=[]),400)
# Shared worker serializes simultaneous requests without crossing response streams.
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results=list(pool.map(lambda seed: post('analyse',{**request,'seed':seed}),range(4)))
assert [r['seed'] for r in results]==list(range(4))
assert post('analyse',request)==r
print(f'{checks} HTTP/worker checks passed')
