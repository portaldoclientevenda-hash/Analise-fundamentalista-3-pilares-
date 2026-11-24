import { FinancialPillarResult } from '../financial/financialEngine.ts';
import { isFiniteNumber } from '../financial/mathUtils.ts';
import { QualitativePillarResult } from '../qualitative/qualitativeEngine.ts';
import { SECTOR_PROFILES } from '../sectors/sectorProfiles.ts';
import { AssetRawData, ValuationAssumptions } from '../types.ts';

export interface DcfProjectionYear {
  year: number;
  revenue: number;
  ebit: number;
  nopat: number;
  da: number;
  capex: number;
  deltaWc: number;
  fcff: number;
  pvFcff: number;
}

export interface ScenarioValuationOutput {
  name: 'Conservador' | 'Base' | 'Otimista';
  rationale: string;
  revenueCagrPct: number;
  ebitMarginTargetPct: number;
  waccPct: number;
  kePct: number;
  terminalGrowthPct: number;
  projectedYears: DcfProjectionYear[];
  pvExplicitFcff: number;
  pvTerminalValue: number;
  terminalValueSharePct: number;
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  marginOfSafetyPct: number;
  upsidePct: number;
}

export interface SensitivityMatrix {
  title: string;
  rowLabel: string;
  colLabel: string;
  rowValues: number[];
  colValues: number[];
  cells: number[][]; // fairValuePerShare
}

export interface ModelValuationEntry {
  modelId: string;
  label: string;
  fairValuePerShare: number | null;
  applicable: boolean;
  weight: number;
  rationale: string;
  details: string;
}

export interface ValuationPillarResult {
  assetTicker: string;
  referenceDate: string;
  currentPrice: number;
  marketCapBrlM: number;
  enterpriseValueBrlM: number | null;
  grossDebtBrlM: number | null;
  cashBrlM: number | null;
  netDebtBrlM: number | null;
  sharesTotal: number;
  // CAPM & WACC
  kePct: number;
  kdAfterTaxPct: number;
  equityWeightPct: number;
  debtWeightPct: number;
  waccPct: number;
  assumptionsUsed: ValuationAssumptions;
  // Scenarios
  scenarios: {
    conservador: ScenarioValuationOutput;
    base: ScenarioValuationOutput;
    otimista: ScenarioValuationOutput;
  };
  // Individual models (Base)
  dcfFcffFairValue: number | null;
  fcfeFairValue: number | null;
  ddmFairValue: number | null;
  ddmDetails: { gordon: number | null; twoStage: number | null; threeStage: number | null; payoutPct: number | null };
  multiplesFairValue: number | null;
  multiplesBreakdown: { peFair: number | null; evEbitdaFair: number | null; pvpFair: number | null };
  navFairValue: number | null;
  residualIncomeFairValue: number | null;
  sectorSpecificFairValue: number | null;
  sectorSpecificNotes: string[];
  // Reverse DCF
  reverseDcf: {
    applicable: boolean;
    impliedRevenueCagrPct: number | null;
    impliedTerminalGrowthPct: number | null;
    impliedEbitMarginPct: number | null;
    marketExpectationAssessment: 'Conservadora' | 'Equilibrada' | 'Exigente' | 'Muito Agressiva' | 'Não aplicável';
    explanation: string;
  };
  // Sensitivity
  sensitivityWaccVsG: SensitivityMatrix;
  sensitivityGrowthVsMargin: SensitivityMatrix;
  sensitivityCapexVsWc: SensitivityMatrix;
  // Reconciliation
  modelsTable: ModelValuationEntry[];
  reconciledFairValue: number;
  upsidePct: number;
  marginOfSafetyPct: number;
  meetsDesiredMarginOfSafety: boolean;
  confidenceLevel: 'Alto' | 'Moderado' | 'Baixo';
  confidenceReasons: string[];
}

function computeCapmAndWacc(
  asset: AssetRawData,
  financial: FinancialPillarResult,
  qualitative: QualitativePillarResult,
  assumptions: ValuationAssumptions
) {
  // Prevent double counting: countryRiskPct is 0 when Rf already reflects BRL sovereign yield
  const keRawPct =
    assumptions.rfPct +
    assumptions.beta * assumptions.rmMinusRfPct +
    assumptions.countryRiskPct +
    qualitative.qualitativeRiskSpreadBps / 100;

  const kePct = Math.max(7.5, Math.min(28, keRawPct));
  const tax = Math.max(0.05, Math.min(0.34, assumptions.taxRateNormalizedPct / 100));
  const kdAfterTaxPct = assumptions.kdPreTaxPct * (1 - tax);

  const e = Math.max(1, financial.marketCapBrlM);
  const d = Math.max(0, financial.grossDebtBrlM ?? 0);
  const totalCap = e + d;
  const equityWeight = e / totalCap;
  const debtWeight = d / totalCap;

  const waccPct = equityWeight * kePct + debtWeight * kdAfterTaxPct;

  return {
    kePct,
    kdAfterTaxPct,
    equityWeightPct: equityWeight * 100,
    debtWeightPct: debtWeight * 100,
    waccPct,
  };
}

function runDcfFcffScenario(params: {
  name: 'Conservador' | 'Base' | 'Otimista';
  rationale: string;
  baseRevenue: number;
  sharesM: number;
  netDebtBrlM: number;
  nonOpAdj: number;
  contingenciesAdj: number;
  currentPrice: number;
  projectionYears: number;
  revenueCagrPct: number;
  ebitMarginTargetPct: number;
  initialEbitMarginPct: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  wcPctDeltaRev: number;
  taxRate: number;
  waccPct: number;
  kePct: number;
  terminalGrowthPct: number;
  exitMultipleEvEbitda?: number;
}): ScenarioValuationOutput {
  const wacc = params.waccPct / 100;
  // Enforce WACC > g strictly
  const g = Math.min(params.terminalGrowthPct / 100, wacc - 0.015);
  const effectiveTerminalGrowthPct = g * 100;

  const years: DcfProjectionYear[] = [];
  let rev = Math.max(1, params.baseRevenue);
  let prevRev = rev;
  const growth = params.revenueCagrPct / 100;
  let pvExplicitFcff = 0;

  for (let t = 1; t <= params.projectionYears; t++) {
    // Taper growth gradually toward terminal growth in later years
    const taper = (t - 1) / Math.max(1, params.projectionYears - 1);
    const yrGrowth = growth * (1 - 0.35 * taper) + g * (0.35 * taper);
    rev = prevRev * (1 + yrGrowth);

    // Converge EBIT margin gradually from current toward target
    const yrEbitMargin =
      (params.initialEbitMarginPct * (1 - taper) + params.ebitMarginTargetPct * taper) / 100;
    const ebit = rev * yrEbitMargin;
    const nopat = ebit * (1 - params.taxRate);
    const da = rev * (params.daPctRevenue / 100);
    const capex = rev * (params.capexPctRevenue / 100);
    const deltaWc = (rev - prevRev) * (params.wcPctDeltaRev / 100);
    const fcff = nopat + da - capex - deltaWc;
    const pvFcff = fcff / Math.pow(1 + wacc, t);

    pvExplicitFcff += pvFcff;
    years.push({
      year: t,
      revenue: rev,
      ebit,
      nopat,
      da,
      capex,
      deltaWc,
      fcff,
      pvFcff,
    });
    prevRev = rev;
  }

  const lastYear = years[years.length - 1];
  const fcffNext = lastYear.fcff * (1 + g);
  const tvPerpetuity = fcffNext / Math.max(0.015, wacc - g);
  const tvExit =
    params.exitMultipleEvEbitda && params.exitMultipleEvEbitda > 0
      ? (lastYear.ebit + lastYear.da) * params.exitMultipleEvEbitda
      : tvPerpetuity;

  const terminalValue = params.exitMultipleEvEbitda ? (tvPerpetuity + tvExit) / 2 : tvPerpetuity;
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, params.projectionYears);
  const enterpriseValue = pvExplicitFcff + pvTerminalValue;
  const equityValue = Math.max(
    0,
    enterpriseValue - params.netDebtBrlM + params.nonOpAdj - params.contingenciesAdj
  );
  const fairValuePerShare = equityValue / Math.max(1e-6, params.sharesM);
  const marginOfSafetyPct =
    fairValuePerShare > 0 ? (1 - params.currentPrice / fairValuePerShare) * 100 : -100;
  const upsidePct =
    params.currentPrice > 0 ? (fairValuePerShare / params.currentPrice - 1) * 100 : 0;

  const terminalValueSharePct =
    enterpriseValue > 0 ? (pvTerminalValue / enterpriseValue) * 100 : 0;

  return {
    name: params.name,
    rationale: params.rationale,
    revenueCagrPct: params.revenueCagrPct,
    ebitMarginTargetPct: params.ebitMarginTargetPct,
    waccPct: params.waccPct,
    kePct: params.kePct,
    terminalGrowthPct: effectiveTerminalGrowthPct,
    projectedYears: years,
    pvExplicitFcff,
    pvTerminalValue,
    terminalValueSharePct,
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    marginOfSafetyPct,
    upsidePct,
  };
}

function computeFcfeModel(
  asset: AssetRawData,
  financial: FinancialPillarResult,
  assumptions: ValuationAssumptions,
  kePct: number
): number | null {
  if (asset.assetType === 'fii') return null;
  const latestDre = asset.incomeStatements[asset.incomeStatements.length - 1];
  const latestDfc = asset.cashFlows[asset.cashFlows.length - 1];
  if (!latestDre || !isFiniteNumber(latestDre.lucroLiquidoControladores ?? latestDre.lucroLiquidoTotal)) {
    return null;
  }
  const ll = (latestDre.lucroLiquidoControladores ?? latestDre.lucroLiquidoTotal)!;
  const da = Math.abs(latestDre.depreciacaoAmortizacao ?? latestDfc?.depreciacaoAmortizacaoDFC ?? 0);
  const capex = Math.abs(latestDfc?.aquisicaoImobilizadoCapex ?? 0);
  const netDebtChange =
    (latestDfc?.captacaoEmprestimos ?? 0) - Math.abs(latestDfc?.pagamentoDividas ?? 0);

  // Base FCFE normalized (smoothed if net debt change is huge)
  const rawFcfe = ll + da - capex + netDebtChange * 0.35;
  const baseFcfe = rawFcfe > 0 ? rawFcfe : ll > 0 ? ll * 0.75 : null;
  if (baseFcfe === null || baseFcfe <= 0) return null;

  // Discount strictly by Ke (NEVER WACC!)
  const ke = kePct / 100;
  const g = Math.min(assumptions.revenueGrowthTerminalPct / 100, ke - 0.02);
  const g1 = Math.min(assumptions.revenueGrowthBasePct / 100, 0.18);
  let pv = 0;
  let cf = baseFcfe;
  for (let t = 1; t <= assumptions.projectionYears; t++) {
    const taper = (t - 1) / Math.max(1, assumptions.projectionYears - 1);
    cf = cf * (1 + g1 * (1 - taper) + g * taper);
    pv += cf / Math.pow(1 + ke, t);
  }
  const terminalEq = (cf * (1 + g)) / Math.max(0.02, ke - g);
  const equityVal = pv + terminalEq / Math.pow(1 + ke, assumptions.projectionYears);
  const sharesM = asset.market.sharesTotal / 1_000_000;
  return equityVal / Math.max(1e-6, sharesM);
}

function computeDdmModels(
  asset: AssetRawData,
  assumptions: ValuationAssumptions,
  kePct: number
): {
  fairValue: number | null;
  gordon: number | null;
  twoStage: number | null;
  threeStage: number | null;
  payoutPct: number | null;
} {
  const dpsList = asset.market.dividendsPerShareAnnual;
  const latestDps =
    dpsList[dpsList.length - 1]?.dps ??
    (asset.assetType === 'fii' && asset.fiiMetrics?.rendimentoMensalMedioCota
      ? asset.fiiMetrics.rendimentoMensalMedioCota * 12
      : null);

  if (!isFiniteNumber(latestDps) || latestDps <= 0) {
    return { fairValue: null, gordon: null, twoStage: null, threeStage: null, payoutPct: null };
  }

  const ke = kePct / 100;
  const gTerm = Math.min(assumptions.dividendGrowthTerminalPct / 100, ke - 0.02);
  const g1 = Math.min(assumptions.dividendGrowthStage1Pct / 100, 0.16);

  // 1. Gordon: P0 = D1 / (Ke - g)
  const d1 = latestDps * (1 + gTerm);
  const gordon = d1 / Math.max(0.02, ke - gTerm);

  // 2. Two-stage (5y stage 1 + Gordon perpetuity)
  let pvTwo = 0;
  let d = latestDps;
  for (let t = 1; t <= 5; t++) {
    d = d * (1 + g1);
    pvTwo += d / Math.pow(1 + ke, t);
  }
  const tvTwo = (d * (1 + gTerm)) / Math.max(0.02, ke - gTerm);
  const twoStage = pvTwo + tvTwo / Math.pow(1 + ke, 5);

  // 3. Three-stage (3y high, 4y linear transition, perpetuity)
  let pvThree = 0;
  d = latestDps;
  for (let t = 1; t <= 3; t++) {
    d = d * (1 + g1);
    pvThree += d / Math.pow(1 + ke, t);
  }
  for (let t = 4; t <= 7; t++) {
    const frac = (t - 3) / 4;
    const gStep = g1 * (1 - frac) + gTerm * frac;
    d = d * (1 + gStep);
    pvThree += d / Math.pow(1 + ke, t);
  }
  const tvThree = (d * (1 + gTerm)) / Math.max(0.02, ke - gTerm);
  const threeStage = pvThree + tvThree / Math.pow(1 + ke, 7);

  const latestDre = asset.incomeStatements[asset.incomeStatements.length - 1];
  const sharesM = asset.market.sharesTotal / 1_000_000;
  const lpa =
    latestDre && isFiniteNumber(latestDre.lucroLiquidoControladores ?? latestDre.lucroLiquidoTotal)
      ? (latestDre.lucroLiquidoControladores ?? latestDre.lucroLiquidoTotal)! / sharesM
      : null;
  const payoutPct = lpa && lpa > 0 ? (latestDps / lpa) * 100 : null;

  const fairValue = asset.assetType === 'fii' ? gordon * 0.5 + twoStage * 0.5 : threeStage;

  return { fairValue, gordon, twoStage, threeStage, payoutPct };
}

function computeResidualIncome(
  asset: AssetRawData,
  financial: FinancialPillarResult,
  kePct: number,
  terminalGrowthPct: number
): number | null {
  if (asset.assetType === 'fii') return null;
  const latestBs = asset.balanceSheets[asset.balanceSheets.length - 1];
  const plCurr = latestBs?.patrimonioLiquidoControladores ?? latestBs?.patrimonioLiquidoTotal ?? null;
  if (!isFiniteNumber(plCurr) || plCurr <= 0) return null;

  const roe = financial.indicators.roe?.value ?? null;
  if (roe === null) return null;

  const ke = kePct / 100;
  const roeDec = roe / 100;
  const g = Math.min(terminalGrowthPct / 100, ke - 0.02);

  // 5-year fade of ROE toward Ke + persistence factor
  let pvRi = 0;
  let book = plCurr;
  const payout = Math.min(0.85, Math.max(0.25, asset.defaultValuationAssumptions.dividendPayoutNormalizedPct / 100));
  for (let t = 1; t <= 5; t++) {
    const fadeRoe = roeDec * (1 - 0.08 * t) + ke * (0.08 * t);
    const expectedNetIncome = book * fadeRoe;
    const residualIncome = expectedNetIncome - ke * book;
    pvRi += residualIncome / Math.pow(1 + ke, t);
    book = book + expectedNetIncome * (1 - payout);
  }
  const termRi = ((book * (roeDec * 0.6 + ke * 0.4) - ke * book) * (1 + g)) / Math.max(0.025, ke - g);
  const totalEq = plCurr + pvRi + Math.max(0, termRi) / Math.pow(1 + ke, 5);
  const sharesM = asset.market.sharesTotal / 1_000_000;
  return totalEq / Math.max(1e-6, sharesM);
}

function computeFiiSpecificValuation(
  asset: AssetRawData,
  kePct: number
): { fairValue: number | null; notes: string[] } {
  const fm = asset.fiiMetrics;
  if (asset.assetType !== 'fii' || !fm) return { fairValue: null, notes: [] };

  const notes: string[] = [];
  const vp = fm.valorPatrimonialCota ?? asset.market.price;
  const annualDiv = (fm.rendimentoMensalMedioCota ?? 0) * 12;

  // Discount rate for FIIs: Ke minus inflation pass-through adjustment for Tijolo vs Nominal for Papel
  const realKe = Math.max(0.065, kePct / 100 - 0.038); // NTN-B + spread imobiliário
  let ddmFii = annualDiv > 0 ? annualDiv / realKe : vp;

  if (fm.fiiType === 'tijolo') {
    const vacPenalty = Math.max(0.75, 1 - (fm.vacanciaFinanceiraPct ?? fm.vacanciaFisicaPct ?? 0) / 200);
    const waultBonus = fm.waultAnos && fm.waultAnos >= 5 ? 1.04 : 0.98;
    ddmFii = ddmFii * vacPenalty * waultBonus;
    notes.push(`FII de Tijolo: avaliado por fluxo real de aluguéis descontado a taxa real imobiliária (${(realKe * 100).toFixed(2)}% a.a.), ajustado por vacância (${fm.vacanciaFisicaPct ?? 0}%) e WAULT (${fm.waultAnos ?? 'N/D'} anos).`);
  } else if (fm.fiiType === 'papel') {
    // Papel CRIs are marked closer to NAV / VPA adjusted by spread & credit risk
    const creditHaircut = Math.max(0.85, 1 - (fm.inadimplenciaPct ?? 0) / 100);
    ddmFii = vp * 0.65 * creditHaircut + (annualDiv / Math.max(0.085, kePct / 100 - 0.02)) * 0.35;
    notes.push(`FII de Papel (CRI): ponderação de 65% pelo Valor Patrimonial da carteira de CRIs ajustado por risco de crédito/LTV (${fm.ltvMedioPct ?? 'N/D'}%) e 35% pela capacidade de distribuição.`);
  } else if (fm.fiiType === 'fof') {
    ddmFii = vp * 0.93; // FOF structural double-fee discount
    notes.push('FOF: aplicação de desconto estrutural de dupla camada de taxa de gestão sobre o Valor Patrimonial.');
  } else {
    ddmFii = (ddmFii + vp) / 2;
    notes.push('FII Híbrido: combinação balanceada entre fluxo de rendimentos e patrimônio dos ativos.');
  }

  return { fairValue: ddmFii, notes };
}

export function runValuationAnalysis(
  asset: AssetRawData,
  financial: FinancialPillarResult,
  qualitative: QualitativePillarResult,
  customAssumptions?: Partial<ValuationAssumptions>
): ValuationPillarResult {
  const sector = SECTOR_PROFILES[asset.sectorId];
  const assumptions: ValuationAssumptions = {
    ...asset.defaultValuationAssumptions,
    ...customAssumptions,
  };

  const waccCalc = computeCapmAndWacc(asset, financial, qualitative, assumptions);
  const sharesM = Math.max(1e-6, asset.market.sharesTotal / 1_000_000);
  const latestDre = asset.incomeStatements[asset.incomeStatements.length - 1];
  const latestBs = asset.balanceSheets[asset.balanceSheets.length - 1];

  // Cross-pillar link: qualitative moat/market modulates base sustainable growth
  const modulatedGrowthPct =
    assumptions.revenueGrowthBasePct * qualitative.growthSustainabilityFactor;

  const baseRevenue = Math.max(1, latestDre?.receitaLiquida ?? financial.marketCapBrlM * 0.4);
  const initialEbitMarginPct =
    latestDre && isFiniteNumber(latestDre.ebit) && isFiniteNumber(latestDre.receitaLiquida) && latestDre.receitaLiquida > 0
      ? (latestDre.ebit / latestDre.receitaLiquida) * 100
      : assumptions.ebitMarginTargetPct;
  const taxRate = assumptions.taxRateNormalizedPct / 100;
  const netDebt = financial.netDebtBrlM ?? 0;

  // 3 Mandatory Scenarios
  const conservador = runDcfFcffScenario({
    name: 'Conservador',
    rationale: 'Menor crescimento orgânico, compressão de margem EBIT (-2,5 p.p.), WACC elevado (+1,5 p.p.) e perpetuidade prudente.',
    baseRevenue,
    sharesM,
    netDebtBrlM: netDebt,
    nonOpAdj: assumptions.nonOperatingAssetsBrl,
    contingenciesAdj: assumptions.contingenciesAdjustmentBrl,
    currentPrice: asset.market.price,
    projectionYears: assumptions.projectionYears,
    revenueCagrPct: Math.max(1.5, modulatedGrowthPct - 3.0),
    ebitMarginTargetPct: Math.max(3.0, assumptions.ebitMarginTargetPct - 2.5),
    initialEbitMarginPct,
    daPctRevenue: assumptions.daPctRevenue,
    capexPctRevenue: assumptions.capexPctRevenue + 0.8,
    wcPctDeltaRev: assumptions.workingCapitalPctDeltaRevenue + 2.0,
    taxRate,
    waccPct: waccCalc.waccPct + 1.5,
    kePct: waccCalc.kePct + 1.5,
    terminalGrowthPct: Math.max(2.5, assumptions.revenueGrowthTerminalPct - 1.0),
  });

  const base = runDcfFcffScenario({
    name: 'Base',
    rationale: 'Premissas alinhadas ao histórico normalizado, sustentabilidade competitiva (Pilar Qualitativo) e WACC corrente.',
    baseRevenue,
    sharesM,
    netDebtBrlM: netDebt,
    nonOpAdj: assumptions.nonOperatingAssetsBrl,
    contingenciesAdj: assumptions.contingenciesAdjustmentBrl,
    currentPrice: asset.market.price,
    projectionYears: assumptions.projectionYears,
    revenueCagrPct: modulatedGrowthPct,
    ebitMarginTargetPct: assumptions.ebitMarginTargetPct,
    initialEbitMarginPct,
    daPctRevenue: assumptions.daPctRevenue,
    capexPctRevenue: assumptions.capexPctRevenue,
    wcPctDeltaRev: assumptions.workingCapitalPctDeltaRevenue,
    taxRate,
    waccPct: waccCalc.waccPct,
    kePct: waccCalc.kePct,
    terminalGrowthPct: assumptions.revenueGrowthTerminalPct,
    exitMultipleEvEbitda: assumptions.exitMultipleEvEbitda,
  });

  const otimista = runDcfFcffScenario({
    name: 'Otimista',
    rationale: 'Expansão de participação de mercado, alavancagem operacional (+2,0 p.p. margem EBIT) e menor prêmio de risco (-1,0 p.p. WACC).',
    baseRevenue,
    sharesM,
    netDebtBrlM: netDebt,
    nonOpAdj: assumptions.nonOperatingAssetsBrl,
    contingenciesAdj: assumptions.contingenciesAdjustmentBrl,
    currentPrice: asset.market.price,
    projectionYears: assumptions.projectionYears,
    revenueCagrPct: modulatedGrowthPct + 2.5,
    ebitMarginTargetPct: assumptions.ebitMarginTargetPct + 2.0,
    initialEbitMarginPct,
    daPctRevenue: assumptions.daPctRevenue,
    capexPctRevenue: Math.max(1.0, assumptions.capexPctRevenue - 0.5),
    wcPctDeltaRev: Math.max(0, assumptions.workingCapitalPctDeltaRevenue - 1.5),
    taxRate,
    waccPct: Math.max(8.0, waccCalc.waccPct - 1.0),
    kePct: Math.max(8.5, waccCalc.kePct - 1.0),
    terminalGrowthPct: assumptions.revenueGrowthTerminalPct + 0.5,
  });

  const isCorporate = asset.assetType === 'stock';
  const dcfFcffFairValue = isCorporate ? base.fairValuePerShare : null;
  const fcfeFairValue = computeFcfeModel(asset, financial, assumptions, waccCalc.kePct);
  const ddmRes = computeDdmModels(asset, assumptions, waccCalc.kePct);

  // Multiples fair value (Normalized)
  const lpa =
    latestDre && isFiniteNumber(latestDre.lucroLiquidoControladores ?? latestDre.lucroLiquidoTotal)
      ? (latestDre.lucroLiquidoControladores ?? latestDre.lucroLiquidoTotal)! / sharesM
      : null;
  const latestEbitda = financial.historicalSeries[financial.historicalSeries.length - 1]?.ebitda ?? null;
  const vpa =
    latestBs && isFiniteNumber(latestBs.patrimonioLiquidoControladores ?? latestBs.patrimonioLiquidoTotal)
      ? (latestBs.patrimonioLiquidoControladores ?? latestBs.patrimonioLiquidoTotal)! / sharesM
      : asset.fiiMetrics?.valorPatrimonialCota ?? null;

  const peFair = lpa !== null && lpa > 0 ? lpa * assumptions.referencePeMultiple : null;
  const evEbitdaFair =
    isCorporate && latestEbitda !== null && latestEbitda > 0
      ? Math.max(0, (latestEbitda * assumptions.referenceEvEbitdaMultiple - netDebt) / sharesM)
      : null;
  const pvpFair = vpa !== null && vpa > 0 ? vpa * assumptions.referencePvpMultiple : null;

  const multCandidates =
    asset.assetType === 'bank' || asset.assetType === 'insurer'
      ? [peFair, pvpFair].filter(isFiniteNumber)
      : asset.assetType === 'fii'
        ? [pvpFair].filter(isFiniteNumber)
        : [peFair, evEbitdaFair].filter(isFiniteNumber);

  const multiplesFairValue =
    multCandidates.length > 0
      ? multCandidates.reduce((a, b) => a + b, 0) / multCandidates.length
      : null;

  // NAV / Patrimônio
  const navFairValue =
    vpa !== null
      ? Math.max(0, vpa + (assumptions.nonOperatingAssetsBrl - assumptions.contingenciesAdjustmentBrl) / sharesM)
      : null;

  // Residual Income
  const residualIncomeFairValue = computeResidualIncome(
    asset,
    financial,
    waccCalc.kePct,
    assumptions.revenueGrowthTerminalPct
  );

  // Sector-specific (FIIs or Bank/Insurer notes)
  const fiiSpec = computeFiiSpecificValuation(asset, waccCalc.kePct);
  const sectorSpecificNotes = [...fiiSpec.notes];
  let sectorSpecificFairValue = fiiSpec.fairValue;

  if (asset.assetType === 'bank' && asset.bankMetrics && vpa && vpa > 0) {
    const roe = (financial.indicators.roe?.value ?? 15) / 100;
    const ke = waccCalc.kePct / 100;
    const g = Math.min(assumptions.revenueGrowthTerminalPct / 100, ke - 0.02);
    const justifiedPvp = Math.max(0.4, (roe - g) / Math.max(0.02, ke - g));
    sectorSpecificFairValue = vpa * justifiedPvp;
    sectorSpecificNotes.push(
      `Modelo Bancário P/VP Justo = (ROE - g)/(Ke - g) = ${justifiedPvp.toFixed(2)}x aplicado sobre VPA de R$ ${vpa.toFixed(2)}, considerando Basileia de ${asset.bankMetrics.indiceBasileiaPct ?? 'N/D'}%.`
    );
  } else if (asset.assetType === 'insurer' && asset.insurerMetrics) {
    sectorSpecificFairValue = ddmRes.fairValue ?? residualIncomeFairValue;
    sectorSpecificNotes.push(
      `Seguradora avaliada priorizando fluxo de dividendos e Renda Residual, considerando Combined Ratio de ${asset.insurerMetrics.combinedRatioPct ?? 'N/D'}% e Sinistralidade de ${asset.insurerMetrics.sinistralidadePct ?? 'N/D'}%.`
    );
  }

  // Reverse DCF (deterministic bisection on revenueCagrPct to match current market price)
  let reverseDcf: ValuationPillarResult['reverseDcf'];
  if (!isCorporate) {
    reverseDcf = {
      applicable: false,
      impliedRevenueCagrPct: null,
      impliedTerminalGrowthPct: null,
      impliedEbitMarginPct: null,
      marketExpectationAssessment: 'Não aplicável',
      explanation: 'Reverse DCF via FCFF aplica-se a empresas operacionais não financeiras; para bancos/seguradoras/FIIs observar ROE/DY implícito no P/VP.',
    };
  } else {
    let lo = -10.0;
    let hi = 45.0;
    for (let iter = 0; iter < 32; iter++) {
      const mid = (lo + hi) / 2;
      const test = runDcfFcffScenario({
        name: 'Base',
        rationale: '',
        baseRevenue,
        sharesM,
        netDebtBrlM: netDebt,
        nonOpAdj: assumptions.nonOperatingAssetsBrl,
        contingenciesAdj: assumptions.contingenciesAdjustmentBrl,
        currentPrice: asset.market.price,
        projectionYears: assumptions.projectionYears,
        revenueCagrPct: mid,
        ebitMarginTargetPct: assumptions.ebitMarginTargetPct,
        initialEbitMarginPct,
        daPctRevenue: assumptions.daPctRevenue,
        capexPctRevenue: assumptions.capexPctRevenue,
        wcPctDeltaRev: assumptions.workingCapitalPctDeltaRevenue,
        taxRate,
        waccPct: waccCalc.waccPct,
        kePct: waccCalc.kePct,
        terminalGrowthPct: assumptions.revenueGrowthTerminalPct,
      });
      if (test.fairValuePerShare < asset.market.price) lo = mid;
      else hi = mid;
    }
    const impliedCagr = (lo + hi) / 2;
    const diffVsBase = impliedCagr - modulatedGrowthPct;
    let assessment: ValuationPillarResult['reverseDcf']['marketExpectationAssessment'] = 'Equilibrada';
    if (diffVsBase > 7) assessment = 'Muito Agressiva';
    else if (diffVsBase > 2.5) assessment = 'Exigente';
    else if (diffVsBase < -2.5) assessment = 'Conservadora';

    reverseDcf = {
      applicable: true,
      impliedRevenueCagrPct: impliedCagr,
      impliedTerminalGrowthPct: assumptions.revenueGrowthTerminalPct,
      impliedEbitMarginPct: assumptions.ebitMarginTargetPct,
      marketExpectationAssessment: assessment,
      explanation: `Ao preço atual de R$ ${asset.market.price.toFixed(2)}, o mercado embute crescimento composto de receita de ${impliedCagr.toFixed(1)}% a.a. pelos próximos ${assumptions.projectionYears} anos (mantendo margem EBIT alvo de ${assumptions.ebitMarginTargetPct.toFixed(1)}% e WACC de ${waccCalc.waccPct.toFixed(1)}%), versus ${modulatedGrowthPct.toFixed(1)}% a.a. do cenário Base.`,
    };
  }

  // Sensitivity Matrices (always populated around base scenario)
  const waccSteps = [-1.5, -0.75, 0, 0.75, 1.5].map((d) => Number((waccCalc.waccPct + d).toFixed(2)));
  const gSteps = [-1.0, -0.5, 0, 0.5, 1.0].map((d) => Number(Math.max(1.5, assumptions.revenueGrowthTerminalPct + d).toFixed(2)));
  const waccVsGCells = waccSteps.map((w) =>
    gSteps.map((gVal) =>
      runDcfFcffScenario({
        name: 'Base',
        rationale: '',
        baseRevenue,
        sharesM,
        netDebtBrlM: netDebt,
        nonOpAdj: assumptions.nonOperatingAssetsBrl,
        contingenciesAdj: assumptions.contingenciesAdjustmentBrl,
        currentPrice: asset.market.price,
        projectionYears: assumptions.projectionYears,
        revenueCagrPct: modulatedGrowthPct,
        ebitMarginTargetPct: assumptions.ebitMarginTargetPct,
        initialEbitMarginPct,
        daPctRevenue: assumptions.daPctRevenue,
        capexPctRevenue: assumptions.capexPctRevenue,
        wcPctDeltaRev: assumptions.workingCapitalPctDeltaRevenue,
        taxRate,
        waccPct: w,
        kePct: waccCalc.kePct,
        terminalGrowthPct: gVal,
      }).fairValuePerShare
    )
  );

  const growthSteps = [-4, -2, 0, 2, 4].map((d) => Number((modulatedGrowthPct + d).toFixed(1)));
  const marginSteps = [-3, -1.5, 0, 1.5, 3].map((d) => Number(Math.max(2, assumptions.ebitMarginTargetPct + d).toFixed(1)));
  const growthVsMarginCells = growthSteps.map((gr) =>
    marginSteps.map((mg) =>
      runDcfFcffScenario({
        name: 'Base',
        rationale: '',
        baseRevenue,
        sharesM,
        netDebtBrlM: netDebt,
        nonOpAdj: assumptions.nonOperatingAssetsBrl,
        contingenciesAdj: assumptions.contingenciesAdjustmentBrl,
        currentPrice: asset.market.price,
        projectionYears: assumptions.projectionYears,
        revenueCagrPct: gr,
        ebitMarginTargetPct: mg,
        initialEbitMarginPct,
        daPctRevenue: assumptions.daPctRevenue,
        capexPctRevenue: assumptions.capexPctRevenue,
        wcPctDeltaRev: assumptions.workingCapitalPctDeltaRevenue,
        taxRate,
        waccPct: waccCalc.waccPct,
        kePct: waccCalc.kePct,
        terminalGrowthPct: assumptions.revenueGrowthTerminalPct,
      }).fairValuePerShare
    )
  );

  const capexSteps = [-1.5, -0.75, 0, 0.75, 1.5].map((d) => Number(Math.max(0.5, assumptions.capexPctRevenue + d).toFixed(2)));
  const wcSteps = [-4, -2, 0, 2, 4].map((d) => Number((assumptions.workingCapitalPctDeltaRevenue + d).toFixed(1)));
  const capexVsWcCells = capexSteps.map((cx) =>
    wcSteps.map((wc) =>
      runDcfFcffScenario({
        name: 'Base',
        rationale: '',
        baseRevenue,
        sharesM,
        netDebtBrlM: netDebt,
        nonOpAdj: assumptions.nonOperatingAssetsBrl,
        contingenciesAdj: assumptions.contingenciesAdjustmentBrl,
        currentPrice: asset.market.price,
        projectionYears: assumptions.projectionYears,
        revenueCagrPct: modulatedGrowthPct,
        ebitMarginTargetPct: assumptions.ebitMarginTargetPct,
        initialEbitMarginPct,
        daPctRevenue: assumptions.daPctRevenue,
        capexPctRevenue: cx,
        wcPctDeltaRev: wc,
        taxRate,
        waccPct: waccCalc.waccPct,
        kePct: waccCalc.kePct,
        terminalGrowthPct: assumptions.revenueGrowthTerminalPct,
      }).fairValuePerShare
    )
  );

  // Reconcile models strictly using Sector-Recommended weights
  const modelValueLookup: Record<string, { val: number | null; details: string }> = {
    dcf_fcff: {
      val: dcfFcffFairValue,
      details: `VP Fluxos: R$ ${base.pvExplicitFcff.toFixed(1)} mi · VP Perpetuidade: R$ ${base.pvTerminalValue.toFixed(1)} mi (${base.terminalValueSharePct.toFixed(0)}%)`,
    },
    fcfe: {
      val: fcfeFairValue,
      details: `Descontado exclusivamente pelo Ke (${waccCalc.kePct.toFixed(2)}% a.a.)`,
    },
    ddm: {
      val: ddmRes.fairValue,
      details: `Gordon: R$ ${ddmRes.gordon?.toFixed(2) ?? 'N/D'} · 3 Estágios: R$ ${ddmRes.threeStage?.toFixed(2) ?? 'N/D'}`,
    },
    multiples: {
      val: multiplesFairValue,
      details: `${assumptions.referencePeRationale}`,
    },
    nav_patrimonio: {
      val: navFairValue,
      details: `VPA ajustado por ativos não operacionais e contingências`,
    },
    residual_income: {
      val: residualIncomeFairValue,
      details: `PL inicial + VP dos Lucros Residuais acima de Ke (${waccCalc.kePct.toFixed(2)}%)`,
    },
    fii_model: {
      val: sectorSpecificFairValue,
      details: sectorSpecificNotes[0] ?? 'Modelo específico FII',
    },
  };

  const modelsTable: ModelValuationEntry[] = sector.recommendedValuationModels.map((rec) => {
    const info = modelValueLookup[rec.modelId] ?? { val: null, details: '' };
    return {
      modelId: rec.modelId,
      label: rec.label,
      fairValuePerShare: info.val,
      applicable: info.val !== null && info.val > 0,
      weight: rec.weight,
      rationale: rec.rationale,
      details: info.details,
    };
  });

  // Normalize weights only across applicable models
  const applicableModels = modelsTable.filter((m) => m.applicable && m.fairValuePerShare !== null);
  const weightSum = applicableModels.reduce((acc, m) => acc + m.weight, 0);
  const reconciledFairValue =
    weightSum > 0
      ? applicableModels.reduce(
          (acc, m) => acc + (m.fairValuePerShare! * m.weight) / weightSum,
          0
        )
      : asset.market.price;

  const upsidePct =
    asset.market.price > 0 ? (reconciledFairValue / asset.market.price - 1) * 100 : 0;
  const marginOfSafetyPct =
    reconciledFairValue > 0 ? (1 - asset.market.price / reconciledFairValue) * 100 : -100;
  const meetsDesiredMarginOfSafety =
    marginOfSafetyPct >= assumptions.desiredMarginOfSafetyPct;

  // Confidence level based on data coverage, terminal value concentration, and dispersion across models
  const valuesForDispersion = applicableModels.map((m) => m.fairValuePerShare!);
  const maxVal = valuesForDispersion.length > 0 ? Math.max(...valuesForDispersion) : reconciledFairValue;
  const minVal = valuesForDispersion.length > 0 ? Math.min(...valuesForDispersion) : reconciledFairValue;
  const spreadRatio = reconciledFairValue > 0 ? (maxVal - minVal) / reconciledFairValue : 1;

  const confidenceReasons: string[] = [];
  let confidenceScore = 100;
  if (financial.dataCoveragePct < 80) {
    confidenceScore -= 25;
    confidenceReasons.push(`Cobertura de dados financeiros em ${financial.dataCoveragePct}%.`);
  }
  if (isCorporate && base.terminalValueSharePct > 72) {
    confidenceScore -= 20;
    confidenceReasons.push(`Valor Terminal responde por ${base.terminalValueSharePct.toFixed(0)}% do EV no DCF.`);
  }
  if (spreadRatio > 0.45) {
    confidenceScore -= 20;
    confidenceReasons.push('Dispersão relevante entre metodologias de valuation.');
  }
  if (confidenceReasons.length === 0) {
    confidenceReasons.push('Boa convergência entre metodologias aplicáveis ao setor e cobertura consistente.');
  }
  const confidenceLevel = confidenceScore >= 75 ? 'Alto' : confidenceScore >= 50 ? 'Moderado' : 'Baixo';

  return {
    assetTicker: asset.ticker,
    referenceDate: assumptions.referenceDate,
    currentPrice: asset.market.price,
    marketCapBrlM: financial.marketCapBrlM,
    enterpriseValueBrlM: financial.enterpriseValueBrlM,
    grossDebtBrlM: financial.grossDebtBrlM,
    cashBrlM: financial.cashBrlM,
    netDebtBrlM: financial.netDebtBrlM,
    sharesTotal: asset.market.sharesTotal,
    kePct: waccCalc.kePct,
    kdAfterTaxPct: waccCalc.kdAfterTaxPct,
    equityWeightPct: waccCalc.equityWeightPct,
    debtWeightPct: waccCalc.debtWeightPct,
    waccPct: waccCalc.waccPct,
    assumptionsUsed: assumptions,
    scenarios: { conservador, base, otimista },
    dcfFcffFairValue,
    fcfeFairValue,
    ddmFairValue: ddmRes.fairValue,
    ddmDetails: {
      gordon: ddmRes.gordon,
      twoStage: ddmRes.twoStage,
      threeStage: ddmRes.threeStage,
      payoutPct: ddmRes.payoutPct,
    },
    multiplesFairValue,
    multiplesBreakdown: { peFair, evEbitdaFair, pvpFair },
    navFairValue,
    residualIncomeFairValue,
    sectorSpecificFairValue,
    sectorSpecificNotes,
    reverseDcf,
    sensitivityWaccVsG: {
      title: 'Sensibilidade: WACC (%) × Crescimento Perpétuo g (%)',
      rowLabel: 'WACC',
      colLabel: 'g',
      rowValues: waccSteps,
      colValues: gSteps,
      cells: waccVsGCells,
    },
    sensitivityGrowthVsMargin: {
      title: 'Sensibilidade: Crescimento Receita (%) × Margem EBIT Alvo (%)',
      rowLabel: 'CAGR Rec.',
      colLabel: 'Margem EBIT',
      rowValues: growthSteps,
      colValues: marginSteps,
      cells: growthVsMarginCells,
    },
    sensitivityCapexVsWc: {
      title: 'Sensibilidade: CAPEX/Receita (%) × Capital de Giro/ΔReceita (%)',
      rowLabel: 'CAPEX %',
      colLabel: 'WC %',
      rowValues: capexSteps,
      colValues: wcSteps,
      cells: capexVsWcCells,
    },
    modelsTable,
    reconciledFairValue,
    upsidePct,
    marginOfSafetyPct,
    meetsDesiredMarginOfSafety,
    confidenceLevel,
    confidenceReasons,
  };
}
