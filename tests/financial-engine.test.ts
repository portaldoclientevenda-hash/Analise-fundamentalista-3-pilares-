import assert from 'node:assert/strict';
import test from 'node:test';
import { B3_ASSETS, getAssetByTicker } from '../src/data/b3Assets.ts';
import { makeBalanceSheet, makeDfc, makeDre } from '../src/data/assetBuilders.ts';
import { computeBeneishMScore } from '../src/engine/financial/earningsQuality.ts';
import { checkAccountingIdentity, computeCagr, safeDivide } from '../src/engine/financial/mathUtils.ts';
import { compareAssets } from '../src/engine/integrated/compareEngine.ts';
import { runIntegratedAnalysis } from '../src/engine/integrated/integratedEngine.ts';
import {
  buildCrossPillarCausalFlow,
  buildIndicatorDirectImpact,
} from '../src/engine/integrated/interpretationEngine.ts';
import { simulateInflationAdjustedReturn } from '../src/engine/integrated/returnSimulator.ts';
import { AssetRawData } from '../src/engine/types.ts';
import { buildAppZipArchive } from '../server/zipExport.ts';

function cloneAsset(ticker: string): AssetRawData {
  const found = getAssetByTicker(ticker);
  if (!found) throw new Error(`Missing fixture ${ticker}`);
  return structuredClone(found);
}

test('MathUtils: safeDivide handles zero, negative, and unavailable cleanly', () => {
  assert.equal(safeDivide(100, 0).status, 'zero');
  assert.equal(safeDivide(100, 0).value, null);
  assert.equal(safeDivide(null, 50).status, 'unavailable');
  assert.equal(safeDivide(-100, 50).status, 'negative');
  assert.equal(safeDivide(-100, 50).value, -2);
  assert.equal(computeCagr(100, 121, 2).value?.toFixed(2), '10.00');
  assert.equal(computeCagr(-50, 100, 2).status, 'negative');
  assert.equal(computeCagr(-50, 100, 2).value, null);
});

test('Accounting identity Ativo = Passivo + PL validates balanced and catches mismatch', () => {
  const ok = checkAccountingIdentity(1000, 300, 200, 500);
  assert.equal(ok.valid, true);
  const bad = checkAccountingIdentity(1000, 300, 200, 400);
  assert.equal(bad.valid, false);
  assert.equal(bad.difference, 100);
});

test('All 9 B3 reference assets pass accounting identity and run 3-pillar integration', () => {
  for (const asset of B3_ASSETS) {
    const res = runIntegratedAnalysis(asset);
    for (const chk of res.financial.accountingIdentityChecks) {
      assert.equal(chk.valid, true, `Balance mismatch in ${asset.ticker} ${chk.period}: ${chk.note}`);
    }
    assert.ok(res.scores.financial.pillarScore >= 0 && res.scores.financial.pillarScore <= 100);
    assert.ok(res.scores.qualitative.pillarScore >= 0 && res.scores.qualitative.pillarScore <= 100);
    assert.ok(res.scores.valuation.pillarScore >= 0 && res.scores.valuation.pillarScore <= 100);
    assert.ok(res.scores.overallScore >= 0 && res.scores.overallScore <= 100);
    assert.ok(res.valuation.reconciledFairValue > 0);
    assert.ok(res.valuation.waccPct > res.valuation.scenarios.base.terminalGrowthPct);
  }
});

test('Profitable net-cash industrial (WEGE3): ROIC > WACC, positive FCFF, sensitivity & Reverse DCF', () => {
  const wege = cloneAsset('WEGE3');
  const res = runIntegratedAnalysis(wege);

  const roic = res.financial.indicators.roic.value!;
  assert.ok(roic > 20, `Expected WEGE3 ROIC > 20%, got ${roic}`);
  assert.ok(roic > res.valuation.waccPct, 'WEGE3 should have positive ROIC - WACC spread');
  assert.ok((res.financial.netDebtBrlM ?? 0) < 0, 'WEGE3 should be net cash');
  assert.ok(res.financial.indicators.fcff.value! > 0);
  assert.equal(res.valuation.reverseDcf.applicable, true);
  assert.ok(res.valuation.reverseDcf.impliedRevenueCagrPct !== null);

  // Sensitivity monotonicity: higher WACC lowers fair value; higher g raises fair value
  const cells = res.valuation.sensitivityWaccVsG.cells;
  assert.ok(cells[0][2] > cells[4][2], 'Lower WACC must yield higher fair value');
  assert.ok(cells[2][4] >= cells[2][0], 'Higher g must yield higher or equal fair value');

  // Scenarios order: Otimista > Base > Conservador
  assert.ok(res.valuation.scenarios.otimista.fairValuePerShare > res.valuation.scenarios.base.fairValuePerShare);
  assert.ok(res.valuation.scenarios.base.fairValuePerShare > res.valuation.scenarios.conservador.fairValuePerShare);
});

test('Bank (ITUB4): excludes corporate EV/EBITDA & inventory, uses Residual Income + DDM + P/VP', () => {
  const itub = cloneAsset('ITUB4');
  const res = runIntegratedAnalysis(itub);

  assert.equal(res.financial.indicators.ev_ebitda.status, 'not_applicable');
  assert.equal(res.financial.indicators.liquidez_corrente.status, 'not_applicable');
  assert.equal(res.financial.indicators.roic.status, 'not_applicable');
  assert.ok(res.financial.indicators.basileia.value! > 14);
  assert.ok(res.valuation.residualIncomeFairValue !== null && res.valuation.residualIncomeFairValue > 0);
  assert.ok(res.valuation.ddmFairValue !== null && res.valuation.ddmFairValue > 0);
  assert.equal(res.valuation.reverseDcf.applicable, false);
});

test('Insurer (BBSE3): uses Combined Ratio and DDM/Residual Income', () => {
  const bbse = cloneAsset('BBSE3');
  const res = runIntegratedAnalysis(bbse);

  assert.equal(res.financial.indicators.ev_ebitda.status, 'not_applicable');
  assert.ok(res.financial.indicators.combined_ratio.value! < 85);
  assert.ok(res.valuation.ddmFairValue !== null && res.valuation.ddmFairValue > 0);
});

test('FIIs (HGLG11 Tijolo & KNCR11 Papel): use dedicated FII valuation, exclude corporate ROIC/DCF', () => {
  const hglg = cloneAsset('HGLG11');
  const resTijolo = runIntegratedAnalysis(hglg);
  assert.equal(resTijolo.financial.indicators.roic.status, 'not_applicable');
  assert.equal(resTijolo.financial.indicators.ev_ebitda.status, 'not_applicable');
  assert.ok(resTijolo.valuation.sectorSpecificFairValue! > 100);
  assert.ok(resTijolo.financial.indicators.vacancia_fisica.value! < 10);

  const kncr = cloneAsset('KNCR11');
  const resPapel = runIntegratedAnalysis(kncr);
  assert.ok(resPapel.valuation.reconciledFairValue > 85 && resPapel.valuation.reconciledFairValue < 120);
});

test('Deficit, indebted, negative-FCF company triggers alerts and handles P/L & Dívida/EBITDA safely', () => {
  const distressed = cloneAsset('LREN3');
  distressed.ticker = 'TEST_DEFICIT';
  distressed.incomeStatements[distressed.incomeStatements.length - 2] = makeDre({
    period: '2023',
    disclosureDate: '2024-03-07',
    receitaLiquida: 6800,
    custos: 5400,
    comerciais: 1100,
    administrativas: 600,
    da: 400,
    recFin: 15,
    despJuros: 850,
    irCsll: 0,
  });
  distressed.incomeStatements[distressed.incomeStatements.length - 1] = makeDre({
    period: '2024',
    disclosureDate: '2025-02-20',
    receitaLiquida: 6500,
    custos: 5100,
    comerciais: 1200,
    administrativas: 650,
    da: 400,
    recFin: 20,
    despJuros: 950,
    irCsll: 0,
  });
  distressed.cashFlows[distressed.cashFlows.length - 2] = makeDfc({
    period: '2023',
    disclosureDate: '2024-03-07',
    ll: -1135,
    da: 400,
    varWc: -300,
    fco: -100,
    capex: 500,
    dividendos: 120,
  });
  distressed.cashFlows[distressed.cashFlows.length - 1] = makeDfc({
    period: '2024',
    disclosureDate: '2025-02-20',
    ll: -1380,
    da: 400,
    varWc: -250,
    fco: -720,
    capex: 450,
    dividendos: 150,
  });

  const res = runIntegratedAnalysis(distressed);
  // Negative net income -> P/L should be null (not misleading negative number)
  assert.equal(res.financial.indicators.pl.value, null);
  // Should trigger negative FCFF, low interest coverage, and uncovered dividends alerts
  assert.ok(res.alerts.some((a) => a.id === 'alert_neg_fcff'));
  assert.ok(res.alerts.some((a) => a.id === 'alert_div_uncovered'));
  assert.ok(res.alerts.some((a) => a.id === 'alert_interest_cov'));
});

test('Negative equity company: triggers critical alert, avoids invalid positive ROE/P/VP', () => {
  const negEq = cloneAsset('LREN3');
  negEq.ticker = 'TEST_NEGEQ';
  // Force liabilities > assets manually
  const lastIdx = negEq.balanceSheets.length - 1;
  negEq.balanceSheets[lastIdx] = {
    ...makeBalanceSheet({
      period: '2024',
      disclosureDate: '2025-02-20',
      caixa: 300,
      recebiveis: 900,
      estoques: 700,
      imobilizado: 2000,
      intangivel: 500,
      fornecedores: 1800,
      divCP: 1600,
      divLP: 2800,
      capitalSocial: 1000,
      reservas: -2800,
    }),
  };

  const res = runIntegratedAnalysis(negEq);
  assert.ok(res.financial.accountingIdentityChecks.length > 0);
  assert.ok((negEq.balanceSheets[lastIdx].patrimonioLiquidoTotal ?? 0) < 0);
  assert.equal(res.financial.indicators.pvp.value, null);
  assert.equal(res.financial.indicators.divida_bruta_pl.value, null);
  assert.ok(res.alerts.some((a) => a.id === 'alert_neg_equity' && a.severity === 'critico'));
});

test('Missing data & conditional Beneish M-Score: refuses to invent missing variables', () => {
  const incomplete = cloneAsset('WEGE3');
  const bsCurr = { ...incomplete.balanceSheets[4], contasReceber: null };
  const resBeneish = computeBeneishMScore(
    'stock',
    incomplete.balanceSheets[3],
    bsCurr,
    incomplete.incomeStatements[3],
    incomplete.incomeStatements[4],
    incomplete.cashFlows[4]
  );
  assert.equal(resBeneish.calculable, false);
  assert.equal(resBeneish.score, null);
  assert.ok(resBeneish.missingVariables.includes('Contas a Receber (t)'));

  // Complete WEGE3 data computes Beneish M-Score cleanly
  const okBeneish = computeBeneishMScore(
    'stock',
    incomplete.balanceSheets[3],
    incomplete.balanceSheets[4],
    incomplete.incomeStatements[3],
    incomplete.incomeStatements[4],
    incomplete.cashFlows[4]
  );
  assert.equal(okBeneish.calculable, true);
  assert.ok(typeof okBeneish.score === 'number' && Number.isFinite(okBeneish.score));
});

test('CAPM, WACC, DDM (1/2/3 stages), FCFE discounted by Ke, and N/A score exclusion', () => {
  const egie = cloneAsset('EGIE3');
  const res = runIntegratedAnalysis(egie);
  assert.ok(res.valuation.kePct > 11 && res.valuation.kePct < 20);
  assert.ok(res.valuation.waccPct < res.valuation.kePct, 'With debt tax shield, WACC should sit below Ke');
  assert.ok(res.valuation.ddmDetails.gordon !== null && res.valuation.ddmDetails.gordon > 0);
  assert.ok(res.valuation.ddmDetails.twoStage !== null && res.valuation.ddmDetails.twoStage > 0);
  assert.ok(res.valuation.ddmDetails.threeStage !== null && res.valuation.ddmDetails.threeStage > 0);
  assert.ok(res.valuation.fcfeFairValue !== null && res.valuation.fcfeFairValue > 0);

  // Confirm N/A metrics for Banks never score as 0 or distort coverage calculation
  const itub = cloneAsset('ITUB4');
  const bankRes = runIntegratedAnalysis(itub);
  const liqComp = bankRes.scores.financial.components.find((c) => c.label === 'Liquidez');
  const cfComp = bankRes.scores.financial.components.find((c) => c.label === 'Geração de Caixa');
  assert.equal(liqComp?.status, 'not_applicable');
  assert.equal(liqComp?.score, null);
  assert.equal(cfComp?.status, 'not_applicable');
  assert.equal(cfComp?.score, null);
  assert.ok(bankRes.scores.financial.pillarScore > 55);
});

test('Peer comparator verdict declares winner, why across 3 pillars, and metric winners', () => {
  const wege = runIntegratedAnalysis(cloneAsset('WEGE3'));
  const egie = runIntegratedAnalysis(cloneAsset('EGIE3'));
  const verdict = compareAssets([wege, egie]);

  assert.ok(verdict !== null);
  assert.equal(verdict.ranked.length, 2);
  assert.equal(verdict.hasIncompatibleTypes, false);
  assert.ok(verdict.headline.includes(verdict.best.asset.ticker));
  assert.ok(verdict.overallWhy.length > 20);
  assert.equal(verdict.pillarVerdicts.length, 3);
  assert.ok(verdict.pillarVerdicts.every((pv) => pv.why.length > 10 && pv.directImpact.length > 10));
  assert.equal(verdict.metricWinners.dl_ebitda, 'WEGE3');

  // Mixed asset types triggers incompatibility caveat and suppresses ROIC/debt winner
  const itub = runIntegratedAnalysis(cloneAsset('ITUB4'));
  const mixedVerdict = compareAssets([wege, itub]);
  assert.ok(mixedVerdict !== null);
  assert.equal(mixedVerdict.hasIncompatibleTypes, true);
  assert.equal(mixedVerdict.metricWinners.roic, null);
  assert.equal(mixedVerdict.metricWinners.dl_ebitda, null);
});

test('Causal interpretation engine produces cross-pillar flow and indicator direct impact', () => {
  const wege = runIntegratedAnalysis(cloneAsset('WEGE3'));
  const flow = buildCrossPillarCausalFlow(wege);
  assert.equal(flow.pillars.length, 3);
  assert.ok(flow.p1ToP2AndP3.includes('ROIC'));
  assert.ok(flow.p2ToP3.includes('WACC') || flow.p2ToP3.includes('custo de capital'));
  assert.ok(flow.p3ToDecision.includes('Valor Justo'));
  assert.ok(flow.pillars.every((p) => p.drivers.every((d) => d.why.length > 0 && d.directInfluence.length > 0)));

  const roicImpact = buildIndicatorDirectImpact(wege.financial.indicators.roic);
  assert.ok(roicImpact.whyCurrentValue.length > 10);
  assert.ok(roicImpact.directInfluence.includes('WACC'));
});

test('Return simulator computes inflation-discounted real value via Fisher equation and dividend compounding', () => {
  // 100 shares @ R$ 40 = R$ 4,000; 10% price growth, 5% DY reinvested, 5% inflation for 5 years
  const reinvested = simulateInflationAdjustedReturn({
    ticker: 'PETR3',
    quantity: 100,
    pricePerShare: 40,
    horizonYears: 5,
    expectedPriceAppreciationPct: 10,
    expectedDividendYieldPct: 5,
    reinvestDividends: true,
    inflationRatePct: 5,
    benchmarkRatePct: 11,
  });

  assert.equal(reinvested.ticker, 'PETR3');
  assert.equal(reinvested.investedCapital, 4000);
  assert.equal(reinvested.rows.length, 6);
  assert.ok(reinvested.finalShares > 100);
  assert.ok(reinvested.finalNominalValue > reinvested.finalRealValue);
  assert.ok(reinvested.beatsInflation);
  // Nominal annualized = (1.10 * 1.05) - 1 = 15.5% -> Fisher real = (1.155 / 1.05) - 1 = 10.00%
  assert.equal(reinvested.nominalAnnualizedPct.toFixed(2), '15.50');
  assert.equal(reinvested.realAnnualizedPct.toFixed(2), '10.00');

  const noReinvest = simulateInflationAdjustedReturn({
    ticker: 'PETR3',
    quantity: 100,
    pricePerShare: 40,
    horizonYears: 5,
    expectedPriceAppreciationPct: 10,
    expectedDividendYieldPct: 5,
    reinvestDividends: false,
    inflationRatePct: 5,
  });
  assert.equal(noReinvest.finalShares, 100);
  assert.ok(reinvested.finalRealValue > noReinvest.finalRealValue);
});

test('App ZIP packager generates valid PKZIP archive and excludes secrets/build artifacts', () => {
  const { buffer, fileCount, entryNames } = buildAppZipArchive(process.cwd());
  assert.ok(fileCount > 10, `Expected > 10 source files in archive, got ${fileCount}`);
  // PKZIP local header signature PK\x03\x04
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  // End of Central Directory signature PK\x05\x06 at end (no zip comment -> last 22 bytes)
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);

  assert.ok(entryNames.includes('apice-research/package.json'));
  assert.ok(entryNames.includes('apice-research/server.ts'));
  assert.ok(entryNames.includes('apice-research/src/App.tsx'));
  assert.ok(entryNames.includes('apice-research/.env.example'));
  assert.ok(entryNames.includes('apice-research/README.md'));

  // Never bundle private env files, git history, build artifacts, or node_modules
  assert.equal(entryNames.some((n) => n === 'apice-research/.env' || n.startsWith('apice-research/.env.local')), false);
  assert.equal(entryNames.some((n) => n.includes('node_modules/') || n.includes('.git/') || n.includes('/dist/')), false);
});



