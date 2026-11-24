import { SECTOR_PROFILES } from '../sectors/sectorProfiles.ts';
import {
  AssetRawData,
  BalanceSheetPeriod,
  CashFlowPeriod,
  DataStatus,
  HistoricalPoint,
  IncomeStatementPeriod,
  IndicatorDiagnostic,
  PeriodGranularity,
} from '../types.ts';
import { analyzeEarningsQuality, EarningsQualityReport } from './earningsQuality.ts';
import {
  averageTwo,
  checkAccountingIdentity,
  classifyTrend,
  computeCagr,
  computeMean,
  computeMedian,
  formatCurrencyBrlM,
  formatNumberPtBr,
  isFiniteNumber,
  safeDivide,
} from './mathUtils.ts';

export interface HistoricalSeriesRow {
  period: string;
  granularity: PeriodGranularity;
  receitaLiquida: number | null;
  lucroBruto: number | null;
  ebitda: number | null;
  ebit: number | null;
  lucroLiquido: number | null;
  margemBrutaPct: number | null;
  margemEbitdaPct: number | null;
  margemEbitPct: number | null;
  margemLiquidaPct: number | null;
  roePct: number | null;
  roicPct: number | null;
  dividaLiquida: number | null;
  fluxoCaixaOperacional: number | null;
  fcff: number | null;
  capex: number | null;
  dividendosPagos: number | null;
}

export interface FinancialPillarResult {
  assetTicker: string;
  referencePeriod: string;
  disclosureDate: string;
  accountingIdentityChecks: { period: string; valid: boolean | null; difference: number | null; note: string }[];
  marketCapBrlM: number;
  enterpriseValueBrlM: number | null;
  grossDebtBrlM: number | null;
  cashBrlM: number | null;
  netDebtBrlM: number | null;
  normalizedTaxRatePct: number;
  waccEstimatePct: number;
  indicators: Record<string, IndicatorDiagnostic>;
  indicatorsList: IndicatorDiagnostic[];
  growthCagrs: {
    metric: string;
    cagr1y: number | null;
    cagr3y: number | null;
    cagr5y: number | null;
    cagr10y: number | null;
    note?: string;
  }[];
  earningsQuality: EarningsQualityReport;
  historicalSeries: HistoricalSeriesRow[];
  strongestIndicators: string[];
  weakestIndicators: string[];
  positiveTrends: string[];
  negativeTrends: string[];
  financialRisks: string[];
  overallDiagnosis: string;
  technicalConclusion: string;
  dataCoveragePct: number;
}

function getGrossDebt(bs: BalanceSheetPeriod): number | null {
  if (
    !isFiniteNumber(bs.emprestimosCurtoPrazo) &&
    !isFiniteNumber(bs.emprestimosLongoPrazo) &&
    !isFiniteNumber(bs.debentures)
  ) {
    return null;
  }
  return (bs.emprestimosCurtoPrazo ?? 0) + (bs.emprestimosLongoPrazo ?? 0) + (bs.debentures ?? 0);
}

function getCashAndEquivalents(bs: BalanceSheetPeriod): number | null {
  if (!isFiniteNumber(bs.caixaEquivalentes) && !isFiniteNumber(bs.aplicacoesFinanceiras)) {
    return null;
  }
  return (bs.caixaEquivalentes ?? 0) + (bs.aplicacoesFinanceiras ?? 0);
}

function getEffectiveTaxRateNormalized(dre: IncomeStatementPeriod, fallbackPct: number): number {
  if (isFiniteNumber(dre.lair) && dre.lair > 0 && isFiniteNumber(dre.irCsll)) {
    // irCsll is usually negative expense; take absolute ratio capped between 5% and 34%
    const rawRate = Math.abs(dre.irCsll) / dre.lair;
    if (rawRate >= 0.05 && rawRate <= 0.38) {
      return rawRate;
    }
  }
  return Math.max(0.05, Math.min(0.34, fallbackPct / 100));
}

function computePeriodEbitda(dre: IncomeStatementPeriod): number | null {
  if (isFiniteNumber(dre.ebitda)) return dre.ebitda;
  if (isFiniteNumber(dre.ebit) && isFiniteNumber(dre.depreciacaoAmortizacao)) {
    return dre.ebit + Math.abs(dre.depreciacaoAmortizacao);
  }
  return null;
}

function computePeriodFcff(
  dre: IncomeStatementPeriod,
  bsCurr: BalanceSheetPeriod,
  bsPrev: BalanceSheetPeriod | undefined,
  dfc: CashFlowPeriod | undefined,
  taxRate: number
): number | null {
  if (!isFiniteNumber(dre.ebit)) return null;
  const da = isFiniteNumber(dre.depreciacaoAmortizacao)
    ? Math.abs(dre.depreciacaoAmortizacao)
    : isFiniteNumber(dfc?.depreciacaoAmortizacaoDFC)
      ? Math.abs(dfc!.depreciacaoAmortizacaoDFC!)
      : 0;
  const capex = isFiniteNumber(dfc?.aquisicaoImobilizadoCapex)
    ? Math.abs(dfc!.aquisicaoImobilizadoCapex!) + Math.abs(dfc?.aquisicaoIntangivel ?? 0)
    : null;
  if (capex === null) return null;

  let deltaWc = 0;
  if (isFiniteNumber(dfc?.variacaoCapitalGiro)) {
    // In DFC, negative variacaoCapitalGiro means cash outflow (increase in WC)
    deltaWc = -dfc!.variacaoCapitalGiro!;
  } else if (bsPrev) {
    const nwcCurr = (bsCurr.contasReceber ?? 0) + (bsCurr.estoques ?? 0) - (bsCurr.fornecedores ?? 0);
    const nwcPrev = (bsPrev.contasReceber ?? 0) + (bsPrev.estoques ?? 0) - (bsPrev.fornecedores ?? 0);
    deltaWc = nwcCurr - nwcPrev;
  }

  return dre.ebit * (1 - taxRate) + da - capex - deltaWc;
}

function computePeriodFcfe(
  dre: IncomeStatementPeriod,
  bsCurr: BalanceSheetPeriod,
  bsPrev: BalanceSheetPeriod | undefined,
  dfc: CashFlowPeriod | undefined
): number | null {
  if (!isFiniteNumber(dre.lucroLiquidoTotal)) return null;
  const da = isFiniteNumber(dre.depreciacaoAmortizacao)
    ? Math.abs(dre.depreciacaoAmortizacao)
    : isFiniteNumber(dfc?.depreciacaoAmortizacaoDFC)
      ? Math.abs(dfc!.depreciacaoAmortizacaoDFC!)
      : 0;
  const capex = isFiniteNumber(dfc?.aquisicaoImobilizadoCapex)
    ? Math.abs(dfc!.aquisicaoImobilizadoCapex!) + Math.abs(dfc?.aquisicaoIntangivel ?? 0)
    : null;
  if (capex === null) return null;

  let deltaWc = 0;
  if (isFiniteNumber(dfc?.variacaoCapitalGiro)) {
    deltaWc = -dfc!.variacaoCapitalGiro!;
  } else if (bsPrev) {
    const nwcCurr = (bsCurr.contasReceber ?? 0) + (bsCurr.estoques ?? 0) - (bsCurr.fornecedores ?? 0);
    const nwcPrev = (bsPrev.contasReceber ?? 0) + (bsPrev.estoques ?? 0) - (bsPrev.fornecedores ?? 0);
    deltaWc = nwcCurr - nwcPrev;
  }

  const netBorrowing =
    isFiniteNumber(dfc?.captacaoEmprestimos) || isFiniteNumber(dfc?.pagamentoDividas)
      ? (dfc?.captacaoEmprestimos ?? 0) - Math.abs(dfc?.pagamentoDividas ?? 0)
      : bsPrev
        ? (getGrossDebt(bsCurr) ?? 0) - (getGrossDebt(bsPrev) ?? 0)
        : 0;

  return dre.lucroLiquidoTotal + da - capex - deltaWc + netBorrowing;
}

function buildDiagnostic(params: {
  id: string;
  name: string;
  category: IndicatorDiagnostic['category'];
  formula: string;
  unit: IndicatorDiagnostic['unit'];
  history: HistoricalPoint[];
  statusOverride?: DataStatus;
  limitationNote?: string;
  sectorBenchmark?: number | null;
  higherIsBetter?: boolean;
  oQueMede: string;
  importanciaSetorial: string;
  interpretFn: (val: number | null, trend: IndicatorDiagnostic['trend'], yoy: number | null) => {
    significado: string;
    fatores: string;
    consequencias: string;
    riscosText: string;
    conclusao: string;
    positives: string[];
    negatives: string[];
    risks: string[];
  };
  sourceLabel: string;
  referencePeriod: string;
  disclosureDate: string;
}): IndicatorDiagnostic {
  const latest = params.history[params.history.length - 1];
  const prev = params.history.length >= 2 ? params.history[params.history.length - 2] : undefined;
  const val = latest?.value ?? null;
  const prevVal = prev?.value ?? null;

  let status: DataStatus = params.statusOverride ?? 'calculated';
  if (!params.statusOverride) {
    if (!isFiniteNumber(val)) status = 'unavailable';
    else if (val < 0) status = 'negative';
    else if (Math.abs(val) < 1e-9) status = 'zero';
    else status = 'calculated';
  }

  let yoy: number | null = null;
  if (isFiniteNumber(val) && isFiniteNumber(prevVal) && Math.abs(prevVal) > 1e-6) {
    yoy = ((val - prevVal) / Math.abs(prevVal)) * 100;
  }

  const trend = classifyTrend(params.history, params.higherIsBetter ?? true);
  const validValues = params.history.map((h) => h.value).filter(isFiniteNumber);
  const historicalMean = computeMean(validValues);
  const historicalMedian = computeMedian(validValues);
  const interp = params.interpretFn(val, trend, yoy);

  const formattedResult =
    status === 'not_applicable'
      ? 'Não aplicável ao setor'
      : val === null
        ? 'Indisponível'
        : `${formatNumberPtBr(val, params.unit === 'BRL_M' ? 1 : 2)} ${params.unit === 'BRL_M' ? 'R$ mi' : params.unit === 'BRL' ? 'R$' : params.unit}`;

  const evolucaoText =
    yoy !== null
      ? `Variação de ${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}% frente ao período anterior; tendência classificada como ${trend.replace(/_/g, ' ')}.`
      : `Tendência: ${trend.replace(/_/g, ' ')}.`;

  return {
    id: params.id,
    name: params.name,
    category: params.category,
    formula: params.formula,
    unit: params.unit,
    value: val,
    status,
    limitationNote: params.limitationNote,
    history: params.history,
    historicalMean,
    historicalMedian,
    yoyVariationPct: yoy,
    trend,
    sectorBenchmark: params.sectorBenchmark ?? null,
    positives: interp.positives,
    negatives: interp.negatives,
    risks: interp.risks,
    tenPointExplanation: {
      oQueMede: params.oQueMede,
      formula: params.formula,
      resultado: formattedResult,
      evolucao: evolucaoText,
      significado: interp.significado,
      importanciaSetorial: params.importanciaSetorial,
      fatoresExplicativos: interp.fatores,
      consequencias: interp.consequencias,
      riscos: interp.riscosText,
      conclusao: interp.conclusao,
    },
    provenance: {
      value: val,
      unit: params.unit,
      currency: params.unit === 'BRL' || params.unit === 'BRL_M' ? 'BRL' : 'N/A',
      referencePeriod: params.referencePeriod,
      disclosureDate: params.disclosureDate,
      source: params.sourceLabel,
      collectedAt: new Date().toISOString().slice(0, 10),
      updatedAt: params.disclosureDate,
      methodology: params.formula,
      qualityFlag: status === 'unavailable' ? 'unavailable' : status === 'not_applicable' ? 'verified' : 'verified',
    },
  };
}

export function runFinancialAnalysis(
  asset: AssetRawData,
  options?: { waccEstimatePct?: number; normalizedTaxRatePct?: number }
): FinancialPillarResult {
  const sector = SECTOR_PROFILES[asset.sectorId];
  const bsList = asset.balanceSheets;
  const dreList = asset.incomeStatements;
  const dfcList = asset.cashFlows;
  const latestBs = bsList[bsList.length - 1];
  const latestDre = dreList[dreList.length - 1];
  const latestDfc = dfcList[dfcList.length - 1];

  const referencePeriod = latestDre?.period ?? latestBs?.period ?? 'N/D';
  const disclosureDate = latestDre?.disclosureDate ?? latestBs?.disclosureDate ?? asset.market.priceDate;
  const sourceLabel = asset.sources[0]?.source ?? 'DFP / ITR / Relatório Gerencial Oficial';

  // Accounting equation check across all BS periods
  const accountingIdentityChecks = bsList.map((bs) => ({
    period: bs.period,
    ...checkAccountingIdentity(
      bs.ativoTotal,
      bs.passivoCirculante,
      bs.passivoNaoCirculante,
      bs.patrimonioLiquidoTotal
    ),
  }));

  // Market Cap & EV
  const marketCapBrlM = (asset.market.price * asset.market.sharesTotal) / 1_000_000;
  const grossDebtBrlM = latestBs ? getGrossDebt(latestBs) : null;
  const cashBrlM = latestBs ? getCashAndEquivalents(latestBs) : null;
  const netDebtBrlM =
    isFiniteNumber(grossDebtBrlM) && isFiniteNumber(cashBrlM)
      ? grossDebtBrlM - cashBrlM
      : null;

  const nonControlling = latestBs?.participacaoNaoControladores ?? 0;
  const enterpriseValueBrlM =
    asset.assetType === 'bank' || asset.assetType === 'insurer'
      ? null
      : isFiniteNumber(netDebtBrlM)
        ? marketCapBrlM + netDebtBrlM + nonControlling
        : marketCapBrlM;

  const fallbackTax = options?.normalizedTaxRatePct ?? asset.defaultValuationAssumptions.taxRateNormalizedPct;
  const normalizedTaxRate = latestDre
    ? getEffectiveTaxRateNormalized(latestDre, fallbackTax)
    : fallbackTax / 100;
  const waccEstimatePct = options?.waccEstimatePct ?? 12.5;

  // Build aligned historical series
  const historicalSeries: HistoricalSeriesRow[] = dreList.map((dre, idx) => {
    const bs = bsList.find((b) => b.period === dre.period) ?? bsList[idx];
    const bsPrev = idx > 0 ? bsList.find((b) => b.period === dreList[idx - 1].period) ?? bsList[idx - 1] : undefined;
    const dfc = dfcList.find((c) => c.period === dre.period) ?? dfcList[idx];

    const ebitda = computePeriodEbitda(dre);
    const grossDebt = bs ? getGrossDebt(bs) : null;
    const cash = bs ? getCashAndEquivalents(bs) : null;
    const netDebt = isFiniteNumber(grossDebt) && isFiniteNumber(cash) ? grossDebt - cash : null;

    const avgPl = averageTwo(bsPrev?.patrimonioLiquidoControladores ?? bsPrev?.patrimonioLiquidoTotal, bs?.patrimonioLiquidoControladores ?? bs?.patrimonioLiquidoTotal);
    const roePct =
      isFiniteNumber(dre.lucroLiquidoControladores ?? dre.lucroLiquidoTotal) && isFiniteNumber(avgPl) && avgPl > 0
        ? ((dre.lucroLiquidoControladores ?? dre.lucroLiquidoTotal)! / avgPl) * 100
        : null;

    // ROIC = NOPAT / Invested Capital Avg (avoiding double counting)
    const calcInvestedCapital = (b: BalanceSheetPeriod | undefined): number | null => {
      if (!b) return null;
      const gd = getGrossDebt(b);
      const pl = b.patrimonioLiquidoTotal;
      const cx = getCashAndEquivalents(b) ?? 0;
      if (!isFiniteNumber(gd) || !isFiniteNumber(pl)) return null;
      return gd + pl - cx;
    };
    const avgIc = averageTwo(calcInvestedCapital(bsPrev), calcInvestedCapital(bs));
    const tax = getEffectiveTaxRateNormalized(dre, fallbackTax);
    const roicPct =
      asset.assetType === 'stock' && isFiniteNumber(dre.ebit) && isFiniteNumber(avgIc) && avgIc > 0
        ? ((dre.ebit * (1 - tax)) / avgIc) * 100
        : null;

    const fcff =
      asset.assetType === 'stock' && bs
        ? computePeriodFcff(dre, bs, bsPrev, dfc, tax)
        : null;

    return {
      period: dre.period,
      granularity: dre.granularity,
      receitaLiquida: dre.receitaLiquida,
      lucroBruto: dre.lucroBruto,
      ebitda,
      ebit: dre.ebit,
      lucroLiquido: dre.lucroLiquidoControladores ?? dre.lucroLiquidoTotal,
      margemBrutaPct:
        isFiniteNumber(dre.lucroBruto) && isFiniteNumber(dre.receitaLiquida) && dre.receitaLiquida > 0
          ? (dre.lucroBruto / dre.receitaLiquida) * 100
          : null,
      margemEbitdaPct:
        isFiniteNumber(ebitda) && isFiniteNumber(dre.receitaLiquida) && dre.receitaLiquida > 0
          ? (ebitda / dre.receitaLiquida) * 100
          : null,
      margemEbitPct:
        isFiniteNumber(dre.ebit) && isFiniteNumber(dre.receitaLiquida) && dre.receitaLiquida > 0
          ? (dre.ebit / dre.receitaLiquida) * 100
          : null,
      margemLiquidaPct:
        isFiniteNumber(dre.lucroLiquidoTotal) && isFiniteNumber(dre.receitaLiquida) && dre.receitaLiquida > 0
          ? (dre.lucroLiquidoTotal / dre.receitaLiquida) * 100
          : null,
      roePct,
      roicPct,
      dividaLiquida: netDebt,
      fluxoCaixaOperacional: dfc?.fluxoCaixaOperacional ?? null,
      fcff,
      capex: isFiniteNumber(dfc?.aquisicaoImobilizadoCapex)
        ? Math.abs(dfc!.aquisicaoImobilizadoCapex!) + Math.abs(dfc?.aquisicaoIntangivel ?? 0)
        : null,
      dividendosPagos: isFiniteNumber(dfc?.dividendosJcpPagos) ? Math.abs(dfc!.dividendosJcpPagos!) : null,
    };
  });

  const indicators: Record<string, IndicatorDiagnostic> = {};
  const isBankOrInsurer = asset.assetType === 'bank' || asset.assetType === 'insurer';
  const isFii = asset.assetType === 'fii';
  const isCorporate = asset.assetType === 'stock';

  // Helper to build BS-aligned historical array
  const makeBsHist = (fn: (bs: BalanceSheetPeriod, prev?: BalanceSheetPeriod) => number | null): HistoricalPoint[] =>
    bsList.map((bs, idx) => ({
      period: bs.period,
      granularity: bs.granularity,
      value: fn(bs, idx > 0 ? bsList[idx - 1] : undefined),
      disclosureDate: bs.disclosureDate,
    }));

  // 1. LIQUIDEZ
  indicators.liquidez_corrente = buildDiagnostic({
    id: 'liquidez_corrente',
    name: 'Liquidez Corrente',
    category: 'liquidez',
    formula: 'Ativo Circulante / Passivo Circulante',
    unit: 'x',
    statusOverride: isBankOrInsurer ? 'not_applicable' : undefined,
    limitationNote: isBankOrInsurer ? 'Não aplicável a bancos/seguradoras pela natureza de intermediação financeira.' : undefined,
    sectorBenchmark: sector.interpretationBenchmarks.healthyCurrentLiquidityMin,
    history: isBankOrInsurer
      ? []
      : makeBsHist((bs) => safeDivide(bs.ativoCirculante, bs.passivoCirculante).value),
    oQueMede: 'Capacidade da companhia de honrar suas obrigações de curto prazo com ativos realizáveis em até 12 meses.',
    importanciaSetorial: 'Indica folga financeira imediata, mas liquidez excessiva pode sinalizar capital ocioso em estoques ou recebíveis.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      if (isBankOrInsurer) {
        return {
          significado: 'Indicador não aplicável a instituições financeiras.',
          fatores: 'Balanços bancários e de seguradoras utilizam índices regulatórios como Basileia e Liquidez de Curto Prazo (LCR).',
          consequencias: 'Avaliar adequação de capital regulatório em vez de liquidez corrente.',
          riscosText: 'N/A.',
          conclusao: 'Não aplicável ao setor.',
          positives: [],
          negatives: [],
          risks: [],
        };
      }
      if (val === null) {
        return {
          significado: 'Dados indisponíveis para cálculo.',
          fatores: 'Ativo ou Passivo Circulante ausente.',
          consequencias: 'Impede verificação de folga de curto prazo.',
          riscosText: 'Lacuna informacional.',
          conclusao: 'Dados insuficientes.',
          positives: [],
          negatives: [],
          risks: ['Ausência de dados circulantes.'],
        };
      }
      if (val < 1.0) {
        return {
          significado: `Liquidez corrente de ${val.toFixed(2)}x indica passivos de curto prazo superiores aos ativos circulantes.`,
          fatores: 'Concentração de vencimentos no curto prazo ou ciclo financeiro financiado por fornecedores.',
          consequencias: 'Pressão potencial de refinanciamento caso haja choque de receita.',
          riscosText: 'Risco de descasamento de caixa no curto prazo se não houver linhas compromissadas.',
          conclusao: 'Atenção à gestão de capital de giro e vencimentos em 12 meses.',
          positives: [],
          negatives: [`Liquidez corrente abaixo de 1,00x (${val.toFixed(2)}x).`],
          risks: ['Pressão potencial de liquidez em 12 meses.'],
        };
      }
      if (val > 2.8) {
        return {
          significado: `Liquidez corrente elevada (${val.toFixed(2)}x). Embora denote conforto contra insolvência imediata, exige verificar se há excesso de caixa ocioso ou acúmulo de estoques/recebíveis de giro lento.`,
          fatores: 'Caixa robusto, baixa dívida de CP ou capital de giro elevado.',
          consequencias: 'Baixo risco de liquidez imediata, porém potencial redução de giro do capital se concentrada em estoques.',
          riscosText: 'Ineficiência na alocação de caixa ou perda de valor em recebíveis atrasados.',
          conclusao: 'Folga financeira sólida, devendo-se auditar a qualidade dos ativos circulantes.',
          positives: [`Forte cobertura de passivos de curto prazo (${val.toFixed(2)}x).`],
          negatives: ['Verificar possível ociosidade de capital ou acúmulo de estoques/recebíveis.'],
          risks: ['Risco de eficiência de capital se houver excesso de capital de giro parado.'],
        };
      }
      return {
        significado: `Liquidez corrente equilibrada de ${val.toFixed(2)}x, demonstrando capacidade saudável de cobertura de curto prazo sem excesso aparente de imobilização circulante.`,
        fatores: 'Equilíbrio entre recebíveis, estoques, caixa e obrigações operacionais.',
        consequencias: 'Sustentação adequada da operação diária.',
        riscosText: 'Monitorar qualidade de contas a receber.',
        conclusao: 'Posição de liquidez adequada.',
        positives: [`Liquidez corrente saudável (${val.toFixed(2)}x).`],
        negatives: [],
        risks: [],
      };
    },
  });

  indicators.liquidez_seca = buildDiagnostic({
    id: 'liquidez_seca',
    name: 'Liquidez Seca',
    category: 'liquidez',
    formula: '(Ativo Circulante - Estoques - Despesas Antecipadas) / Passivo Circulante',
    unit: 'x',
    statusOverride: isBankOrInsurer ? 'not_applicable' : undefined,
    history: isBankOrInsurer
      ? []
      : makeBsHist((bs) =>
          bs.ativoCirculante !== null && bs.passivoCirculante !== null
            ? safeDivide(bs.ativoCirculante - (bs.estoques ?? 0) - (bs.despesasAntecipadas ?? 0), bs.passivoCirculante).value
            : null
        ),
    oQueMede: 'Capacidade de pagamento de curto prazo excluindo a necessidade de vender estoques.',
    importanciaSetorial: 'Crucial no varejo e indústria onde estoques podem sofrer obsolescência ou descontos forçados.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado:
        val === null
          ? 'Não aplicável ou dados indisponíveis.'
          : `Liquidez seca de ${val.toFixed(2)}x mede a cobertura de obrigações de curto prazo sem depender da venda de estoques.`,
      fatores: 'Diferença entre liquidez corrente e seca reflete o peso dos estoques no circulante.',
      consequencias: val !== null && val < 0.8 ? 'Dependência relevante da realização de estoques para honrar passivos CP.' : 'Boa cobertura líquida imediata/recebíveis.',
      riscosText: val !== null && val < 0.8 ? 'Risco em caso de desaceleração abrupta de vendas.' : 'Risco contido caso recebíveis tenham boa adimplência.',
      conclusao: val !== null && val >= 1.0 ? 'Cobertura de curto prazo resiliente mesmo sem conversão de estoques.' : 'Acompanhar giro de estoques e recebimento de vendas.',
      positives: val !== null && val >= 1.0 ? [`Liquidez seca acima de 1,00x (${val.toFixed(2)}x).`] : [],
      negatives: val !== null && val < 0.8 ? [`Liquidez seca apertada (${val.toFixed(2)}x).`] : [],
      risks: val !== null && val < 0.8 ? ['Dependência de giro de estoques no curto prazo.'] : [],
    }),
  });

  indicators.liquidez_imediata = buildDiagnostic({
    id: 'liquidez_imediata',
    name: 'Liquidez Imediata',
    category: 'liquidez',
    formula: 'Disponibilidades (Caixa e Equivalentes + Aplicações CP) / Passivo Circulante',
    unit: 'x',
    statusOverride: isBankOrInsurer ? 'not_applicable' : undefined,
    history: isBankOrInsurer
      ? []
      : makeBsHist((bs) => safeDivide(getCashAndEquivalents(bs), bs.passivoCirculante).value),
    oQueMede: 'Parcela das obrigações de curto prazo coberta instantaneamente por caixa e aplicações líquidas.',
    importanciaSetorial: 'Indica resiliência a choques de crédito e capacidade oportunística de investimento ou M&A.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `Caixa cobre ${val.toFixed(2)}x todo o passivo circulante imediatamente.`,
      fatores: 'Política de caixa mínimo e geração livre de caixa.',
      consequencias: val !== null && val > 1.2 ? 'Altíssimo colchão de liquidez; avaliar custo de oportunidade se não remunerado adequadamente.' : 'Estrutura de caixa ajustada ao fluxo operacional.',
      riscosText: 'Em cenários de Selic alta, caixa bem aplicado gera receita financeira, mas excesso prolongado reduz ROIC se não distribuído.',
      conclusao: val !== null && val >= 0.3 ? 'Reserva de caixa confortável para contingências.' : 'Posição de caixa enxuta; depende do fluxo operacional contínuo.',
      positives: val !== null && val >= 0.5 ? [`Disponibilidades cobrem ${(val * 100).toFixed(0)}% do passivo circulante.`] : [],
      negatives: [],
      risks: val !== null && val < 0.15 ? ['Reserva imediata reduzida frente ao passivo circulante.'] : [],
    }),
  });

  indicators.liquidez_geral = buildDiagnostic({
    id: 'liquidez_geral',
    name: 'Liquidez Geral',
    category: 'liquidez',
    formula: '(Ativo Circulante + Realizável a Longo Prazo) / (Passivo Circulante + Passivo Não Circulante)',
    unit: 'x',
    statusOverride: isBankOrInsurer ? 'not_applicable' : undefined,
    history: isBankOrInsurer
      ? []
      : makeBsHist((bs) =>
          bs.ativoCirculante !== null && bs.passivoCirculante !== null && bs.passivoNaoCirculante !== null
            ? safeDivide(bs.ativoCirculante + (bs.realizavelLongoPrazo ?? 0), bs.passivoCirculante + bs.passivoNaoCirculante).value
            : null
        ),
    oQueMede: 'Relação entre ativos financeiros/realizáveis de curto e longo prazo frente ao passivo exigível total.',
    importanciaSetorial: 'Empresas intensivas em ativos fixos (energia, indústria, FIIs) têm liquidez geral naturalmente menor que 1,0x sem que isso indique insolvência.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `Liquidez geral de ${val.toFixed(2)}x (não inclui imobilizado/intangível gerador de caixa).`,
      fatores: 'Estrutura de financiamento de ativos permanentes por capital de terceiros de longo prazo.',
      consequencias: 'Deve ser lida em conjunto com geração de EBITDA/FCFF e cronograma da dívida.',
      riscosText: 'Interpretação isolada pode penalizar indevidamente negócios intensivos em ativos fixos.',
      conclusao: 'Indicador estrutural complementar à análise de alavancagem.',
      positives: val !== null && val >= 1.0 ? ['Ativos realizáveis superam todo o passivo exigível.'] : [],
      negatives: [],
      risks: [],
    }),
  });

  // 2. ENDIVIDAMENTO
  indicators.endividamento_geral = buildDiagnostic({
    id: 'endividamento_geral',
    name: 'Endividamento Geral',
    category: 'endividamento',
    formula: '(Passivo Circulante + Passivo Não Circulante) / Ativo Total',
    unit: '%',
    higherIsBetter: false,
    history: makeBsHist((bs) => {
      if (bs.passivoCirculante === null || bs.passivoNaoCirculante === null) return null;
      const r = safeDivide(bs.passivoCirculante + bs.passivoNaoCirculante, bs.ativoTotal);
      return r.value !== null ? r.value * 100 : null;
    }),
    oQueMede: 'Proporção dos ativos totais financiada por capital de terceiros (passivo exigível total).',
    importanciaSetorial: 'Bancos operam tipicamente entre 85%–92% pela captação de depósitos; indústrias conservadoras ficam abaixo de 60%.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      if (val === null) return { significado: 'Indisponível.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'Dados insuficientes.', positives: [], negatives: [], risks: [] };
      const isNegativeEquity = val > 100;
      return {
        significado: isNegativeEquity
          ? `Endividamento geral de ${val.toFixed(1)}% (>100%) indica Patrimônio Líquido negativo — passivos exigíveis superam ativos totais.`
          : `${val.toFixed(1)}% dos ativos totais são financiados por terceiros.`,
        fatores: 'Combinação de dívida financeira, fornecedores, provisões e obrigações operacionais.',
        consequencias: isNegativeEquity ? 'Risco elevado de reestruturação societária ou diluição.' : 'Estrutura de passivos compatível com acompanhamento do custo da dívida.',
        riscosText: isNegativeEquity ? 'Patrimônio líquido negativo compromete solvência de longo prazo.' : 'Monitorar parcela onerosa (dívida financeira) vs passivo operacional.',
        conclusao: isNegativeEquity ? 'Situação crítica de passivo a descoberto.' : 'Estrutura patrimonial verificada.',
        positives: !isBankOrInsurer && val < 55 ? [`Baixa participação de passivos exigíveis sobre ativos (${val.toFixed(1)}%).`] : [],
        negatives: isNegativeEquity ? ['Patrimônio Líquido negativo (Passivo Exigível > Ativo Total).'] : [],
        risks: isNegativeEquity ? ['Passivo a descoberto / solvência comprometida.'] : [],
      };
    },
  });

  indicators.divida_liquida_ebitda = buildDiagnostic({
    id: 'divida_liquida_ebitda',
    name: 'Dívida Líquida / EBITDA',
    category: 'endividamento',
    formula: '(Dívida Bruta - Caixa e Equivalentes) / EBITDA',
    unit: 'x',
    higherIsBetter: false,
    statusOverride: isBankOrInsurer || isFii ? 'not_applicable' : undefined,
    limitationNote: isBankOrInsurer || isFii ? 'Não aplicável a instituições financeiras ou FIIs.' : undefined,
    sectorBenchmark: sector.interpretationBenchmarks.healthyNetDebtEbitdaMax,
    history:
      isBankOrInsurer || isFii
        ? []
        : historicalSeries.map((row, idx) => {
            const dre = dreList[idx];
            const ebitda = row.ebitda;
            if (row.dividaLiquida === null || ebitda === null) {
              return { period: row.period, granularity: row.granularity, value: null };
            }
            if (ebitda <= 0) {
              return { period: row.period, granularity: row.granularity, value: null };
            }
            return { period: row.period, granularity: row.granularity, value: row.dividaLiquida / ebitda, disclosureDate: dre?.disclosureDate };
          }),
    oQueMede: 'Quantos anos de geração operacional bruta (EBITDA) seriam necessários para quitar a dívida líquida atual.',
    importanciaSetorial: 'Principal termômetro de alavancagem corporativa; limites saudáveis variam conforme previsibilidade de receita (utilities até 3,5x; cíclicas < 2,0x).',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val, trend) => {
      if (isBankOrInsurer || isFii) {
        return { significado: 'Não aplicável ao setor.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'N/A.', positives: [], negatives: [], risks: [] };
      }
      const latestEbitda = historicalSeries[historicalSeries.length - 1]?.ebitda ?? null;
      if (latestEbitda !== null && latestEbitda <= 0) {
        return {
          significado: 'EBITDA nulo ou negativo torna o múltiplo Dívida Líquida/EBITDA matematicamente inválido para mensurar capacidade de pagamento.',
          fatores: 'Operação em prejuízo operacional no período analisado.',
          consequencias: 'Qualquer nível de dívida líquida positiva pressiona a liquidez sem geração operacional.',
          riscosText: 'Alto risco de estresse financeiro se o EBITDA não se recuperar rapidamente.',
          conclusao: 'Situação especial: EBITDA negativo exige foco em caixa disponível e cronograma de dívida.',
          positives: [],
          negatives: ['EBITDA negativo inviabiliza cobertura operacional da dívida.'],
          risks: ['Queima operacional sem capacidade atual de desalavancagem pelo EBITDA.'],
        };
      }
      if (val === null) return { significado: 'Dados insuficientes.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'Indisponível.', positives: [], negatives: [], risks: [] };
      if (val < 0) {
        return {
          significado: `Posição de Caixa Líquido (${val.toFixed(2)}x): caixa e aplicações superam toda a dívida financeira bruta.`,
          fatores: 'Forte geração de caixa acumulada e política financeira conservadora.',
          consequencias: 'Elevada proteção em ciclos de juros altos e flexibilidade para dividendos/M&A.',
          riscosText: 'Acompanhar eficiência na alocação do caixa excedente.',
          conclusao: 'Balanço extremamente sólido (caixa líquido).',
          positives: [`Empresa opera com caixa líquido (Dív. Líq./EBITDA de ${val.toFixed(2)}x).`],
          negatives: [],
          risks: [],
        };
      }
      const limit = sector.interpretationBenchmarks.healthyNetDebtEbitdaMax ?? 2.5;
      if (val > limit) {
        return {
          significado: `Alavancagem de ${val.toFixed(2)}x supera a referência setorial (${limit.toFixed(1)}x), com tendência ${trend.replace(/_/g, ' ')}.`,
          fatores: 'Ciclo elevado de CAPEX, aquisições financiadas por dívida ou contração de EBITDA.',
          consequencias: 'Maior parcela do EBIT consumida por despesas financeiras e menor margem para dividendos.',
          riscosText: 'Risco de quebra de covenants e custo elevado de refinanciamento.',
          conclusao: 'Alavancagem exige monitoramento de desalavancagem e cobertura de juros.',
          positives: [],
          negatives: [`Alavancagem elevada (${val.toFixed(2)}x vs teto setorial ${limit.toFixed(1)}x).`],
          risks: ['Pressão de despesas financeiras e risco de refinanciamento.'],
        };
      }
      return {
        significado: `Alavancagem controlada em ${val.toFixed(2)}x EBITDA, dentro dos parâmetros saudáveis do setor (até ${limit.toFixed(1)}x).`,
        fatores: 'Equilíbrio entre custo da dívida e geração operacional de caixa.',
        consequencias: 'Capacidade confortável de serviço da dívida e investimentos.',
        riscosText: 'Manter atenção à exposição ao CDI/IPCA/câmbio.',
        conclusao: 'Endividamento líquido sob controle.',
        positives: [`Alavancagem confortável (${val.toFixed(2)}x EBITDA).`],
        negatives: [],
        risks: [],
      };
    },
  });

  indicators.cobertura_juros = buildDiagnostic({
    id: 'cobertura_juros',
    name: 'Cobertura de Juros (EBIT / Juros)',
    category: 'endividamento',
    formula: 'EBIT / Despesas Financeiras com Juros',
    unit: 'x',
    statusOverride: isBankOrInsurer || isFii ? 'not_applicable' : undefined,
    history:
      isBankOrInsurer || isFii
        ? []
        : dreList.map((dre) => {
            const juros = dre.despesasFinanceirasJuros !== null ? Math.abs(dre.despesasFinanceirasJuros) : null;
            return {
              period: dre.period,
              granularity: dre.granularity,
              value: dre.ebit !== null && juros !== null && juros > 1e-3 ? dre.ebit / juros : null,
              disclosureDate: dre.disclosureDate,
            };
          }),
    oQueMede: 'Quantas vezes o lucro operacional (EBIT) cobre as despesas financeiras brutas de juros.',
    importanciaSetorial: 'Fundamental no Brasil devido ao patamar estrutural elevado da Selic/CDI.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      if (isBankOrInsurer || isFii) return { significado: 'Não aplicável ao setor.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'N/A.', positives: [], negatives: [], risks: [] };
      if (val === null) return { significado: 'Despesa financeira líquida de juros muito baixa, nula ou indisponível.', fatores: 'Empresa possivelmente sem dívida financeira relevante.', consequencias: '-', riscosText: '-', conclusao: 'Verificar perfil da dívida.', positives: [], negatives: [], risks: [] };
      if (val < 1.5) {
        return {
          significado: `Cobertura crítica de ${val.toFixed(2)}x: o EBIT mal cobre os juros da dívida.`,
          fatores: 'Dívida onerosa elevada combinada com juros altos ou queda operacional.',
          consequencias: 'Erosão severa do lucro líquido e eventual consumo de caixa para pagar juros.',
          riscosText: 'Alto risco de deterioração financeira e necessidade de capitalização.',
          conclusao: 'Sinal de alerta financeiro crítico na estrutura de capital.',
          positives: [],
          negatives: [`Cobertura de juros baixa (${val.toFixed(2)}x).`],
          risks: ['Risco de insolvência se juros subirem ou EBIT cair.'],
        };
      }
      return {
        significado: `EBIT cobre ${val.toFixed(2)}x as despesas financeiras com juros.`,
        fatores: 'Rentabilidade operacional superior ao custo médio da dívida.',
        consequencias: 'Folga financeira para atravessar ciclos restritivos de juros.',
        riscosText: 'Acompanhar vencimentos e indexação ao CDI.',
        conclusao: val >= 4 ? 'Cobertura de juros muito confortável.' : 'Cobertura adequada, requer acompanhamento em cenários de Selic elevada.',
        positives: val >= 4 ? [`Forte cobertura de juros (${val.toFixed(2)}x).`] : [],
        negatives: [],
        risks: [],
      };
    },
  });

  indicators.divida_bruta_pl = buildDiagnostic({
    id: 'divida_bruta_pl',
    name: 'Dívida Bruta / Patrimônio Líquido',
    category: 'endividamento',
    formula: 'Dívida Financeira Bruta / Patrimônio Líquido',
    unit: 'x',
    higherIsBetter: false,
    statusOverride: isBankOrInsurer ? 'not_applicable' : undefined,
    history: isBankOrInsurer
      ? []
      : makeBsHist((bs) => {
          const gd = getGrossDebt(bs);
          if (gd === null || bs.patrimonioLiquidoTotal === null || bs.patrimonioLiquidoTotal <= 0) return null;
          return gd / bs.patrimonioLiquidoTotal;
        }),
    oQueMede: 'Relação entre dívida financeira bruta e capital próprio contábil.',
    importanciaSetorial: 'Mede alavancagem bruta independentemente do caixa em conta, relevante para risco de refinanciamento.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      const pl = latestBs?.patrimonioLiquidoTotal ?? null;
      if (pl !== null && pl <= 0) {
        return {
          significado: 'Patrimônio Líquido negativo ou nulo inviabiliza o quociente positivo Dívida/PL.',
          fatores: 'Prejuízos acumulados consumiram o capital próprio contábil.',
          consequencias: 'Alavancagem contábil extrema.',
          riscosText: 'Risco patrimonial severo.',
          conclusao: 'Patrimônio líquido negativo exige cautela máxima.',
          positives: [],
          negatives: ['Patrimônio líquido negativo.'],
          risks: ['Risco de diluição ou recuperação judicial/extrajudicial.'],
        };
      }
      return {
        significado: val === null ? 'Indisponível ou N/A.' : `Dívida bruta equivale a ${val.toFixed(2)}x o patrimônio líquido.`,
        fatores: 'Estrutura de financiamento entre credores financeiros e acionistas.',
        consequencias: val !== null && val > 1.5 ? 'Maior dependência de rolagem de dívida bruta.' : 'Alavancagem bruta equilibrada.',
        riscosText: val !== null && val > 1.5 ? 'Exposição a fechamento de mercado de crédito.' : 'Risco financeiro moderado/baixo.',
        conclusao: val !== null && val <= 1.0 ? 'Estrutura conservadora de capital.' : 'Monitorar perfil de vencimentos.',
        positives: val !== null && val <= 0.6 ? [`Baixa dívida bruta sobre PL (${val.toFixed(2)}x).`] : [],
        negatives: val !== null && val > 1.8 ? [`Dívida bruta elevada frente ao PL (${val.toFixed(2)}x).`] : [],
        risks: [],
      };
    },
  });

  // 3. RENTABILIDADE
  indicators.roe = buildDiagnostic({
    id: 'roe',
    name: 'ROE (Retorno sobre Patrimônio Líquido Médio)',
    category: 'rentabilidade',
    formula: 'Lucro Líquido / Patrimônio Líquido Médio',
    unit: '%',
    statusOverride: isFii ? 'not_applicable' : undefined,
    sectorBenchmark: sector.interpretationBenchmarks.healthyRoeMinPct,
    history: isFii
      ? []
      : historicalSeries.map((r) => ({ period: r.period, granularity: r.granularity, value: r.roePct })),
    oQueMede: 'Rentabilidade gerada sobre o capital próprio médio dos acionistas controladores.',
    importanciaSetorial: 'Indicador central em bancos e seguradoras; em empresas não financeiras deve ser confrontado com o endividamento para separar mérito operacional de alavancagem.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      if (isFii) return { significado: 'Não aplicável a FIIs; utilizar Dividend Yield e Cap Rate.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'N/A.', positives: [], negatives: [], risks: [] };
      const pl = latestBs?.patrimonioLiquidoTotal ?? null;
      if (pl !== null && pl <= 0) {
        return {
          significado: 'Patrimônio Líquido negativo invalida o ROE tradicional (divisão por PL negativo pode gerar falso ROE positivo se houver prejuízo).',
          fatores: 'Base patrimonial negativa.',
          consequencias: 'Não utilizar ROE como indicador de qualidade.',
          riscosText: 'Distorção matemática se interpretado mecanicamente.',
          conclusao: 'ROE inaplicável com PL negativo.',
          positives: [],
          negatives: ['PL negativo impede cálculo válido de ROE.'],
          risks: ['Patrimônio líquido erodido.'],
        };
      }
      if (val === null) return { significado: 'Indisponível.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'Dados insuficientes.', positives: [], negatives: [], risks: [] };
      const minBench = sector.interpretationBenchmarks.healthyRoeMinPct ?? 14;
      return {
        significado: `ROE de ${val.toFixed(1)}% indica que cada R$ 100 de patrimônio médio geraram R$ ${val.toFixed(1)} de lucro líquido no período.`,
        fatores: 'Combinação de margem líquida, giro do ativo e alavancagem financeira.',
        consequencias: val >= minBench ? 'Capacidade sólida de compor valor patrimonial ao acionista.' : 'Retorno abaixo do custo típico de capital próprio no Brasil.',
        riscosText: val > 35 && isCorporate ? 'Verificar se ROE elevado decorre de patrimônio comprimido por alavancagem ou recompra.' : 'Compressão de margens ou juros altos.',
        conclusao: val >= minBench ? 'Rentabilidade sobre capital próprio atrativa.' : 'Retorno modesto frente ao custo de oportunidade.',
        positives: val >= minBench ? [`ROE de ${val.toFixed(1)}% acima da referência setorial (${minBench}%).`] : [],
        negatives: val < 10 ? [`ROE comprimido (${val.toFixed(1)}%), potencialmente abaixo do Ke.`] : [],
        risks: val < 0 ? ['Prejuízo líquido destruindo patrimônio.'] : [],
      };
    },
  });

  indicators.roa = buildDiagnostic({
    id: 'roa',
    name: 'ROA (Retorno sobre Ativo Total Médio)',
    category: 'rentabilidade',
    formula: 'Lucro Líquido / Ativo Total Médio',
    unit: '%',
    statusOverride: isFii ? 'not_applicable' : undefined,
    history: isFii
      ? []
      : dreList.map((dre, idx) => {
          const bs = bsList[idx];
          const bsPrev = idx > 0 ? bsList[idx - 1] : undefined;
          const avgAt = averageTwo(bsPrev?.ativoTotal, bs?.ativoTotal);
          return {
            period: dre.period,
            granularity: dre.granularity,
            value: isFiniteNumber(dre.lucroLiquidoTotal) && isFiniteNumber(avgAt) && avgAt > 0 ? (dre.lucroLiquidoTotal / avgAt) * 100 : null,
          };
        }),
    oQueMede: 'Eficiência econômica com que a totalidade dos ativos gera lucro líquido, independentemente da estrutura de capital.',
    importanciaSetorial: 'Em bancos, ROA > 1,5% indica excelente eficiência de balanço; em indústrias/varejo varia conforme giro de ativos.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `ROA de ${val.toFixed(2)}% sobre ativo médio.`,
      fatores: 'Margem líquida multiplicada pelo giro dos ativos.',
      consequencias: 'Permite detectar quando um ROE alto depende exclusivamente de alavancagem excessiva.',
      riscosText: 'Ativos inchados por ágio ou baixa ocupação reduzem o ROA.',
      conclusao: val !== null && val > (asset.assetType === 'bank' ? 1.4 : 6) ? 'Boa produtividade econômica da base de ativos.' : 'Produtividade moderada/baixa dos ativos totais.',
      positives: val !== null && val > (asset.assetType === 'bank' ? 1.5 : 8) ? [`ROA sólido (${val.toFixed(2)}%).`] : [],
      negatives: val !== null && val < 0 ? [`ROA negativo (${val.toFixed(2)}%).`] : [],
      risks: [],
    }),
  });

  indicators.roic = buildDiagnostic({
    id: 'roic',
    name: 'ROIC (Retorno sobre Capital Investido)',
    category: 'rentabilidade',
    formula: 'NOPAT / Capital Investido Médio, onde NOPAT = EBIT×(1-T) e Cap. Inv. = Dívida Financeira + PL - Caixa',
    unit: '%',
    statusOverride: !isCorporate ? 'not_applicable' : undefined,
    limitationNote: !isCorporate ? 'ROIC operacional não se aplica a bancos, seguradoras ou FIIs.' : undefined,
    sectorBenchmark: sector.interpretationBenchmarks.healthyRoicMinPct,
    history: !isCorporate
      ? []
      : historicalSeries.map((r) => ({ period: r.period, granularity: r.granularity, value: r.roicPct })),
    oQueMede: 'Retorno operacional após impostos sobre todo o capital produtivo investido (próprio + dívida líquida), sem dupla contagem.',
    importanciaSetorial: 'Principal métrica de criação de valor econômico quando comparada diretamente ao WACC.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      if (!isCorporate) return { significado: 'Não aplicável ao setor.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'N/A.', positives: [], negatives: [], risks: [] };
      if (val === null) return { significado: 'Indisponível ou capital investido líquido negativo/nulo.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'Verificar base de capital.', positives: [], negatives: [], risks: [] };
      const spread = val - waccEstimatePct;
      return {
        significado: `ROIC de ${val.toFixed(1)}% frente a um WACC estimado de ${waccEstimatePct.toFixed(1)}% resulta em spread econômico de ${spread >= 0 ? '+' : ''}${spread.toFixed(1)} pontos percentuais.`,
        fatores: 'Margem operacional EBIT, alíquota efetiva normalizada e giro do capital investido.',
        consequencias:
          spread > 2
            ? 'Criação consistente de valor econômico: cada real reinvestido a taxas próximas gera VPL positivo.'
            : spread < 0
              ? 'Destruição de valor econômico nas premissas atuais: crescimento consome mais custo de capital do que gera retorno.'
              : 'Retorno próximo ao custo de capital (empate econômico).',
        riscosText: 'Verificar se o ROIC atual é recorrente, sustentado por vantagens competitivas e se não é distorcido por ativos antigos totalmente depreciados.',
        conclusao: spread > 0 ? 'Empresa cria valor econômico (ROIC > WACC).' : 'Empresa opera abaixo do custo de capital (ROIC < WACC).',
        positives: spread > 2 ? [`ROIC (${val.toFixed(1)}%) supera WACC estimado (${waccEstimatePct.toFixed(1)}%) em +${spread.toFixed(1)} p.p.`] : [],
        negatives: spread < 0 ? [`ROIC (${val.toFixed(1)}%) inferior ao WACC estimado (${waccEstimatePct.toFixed(1)}%).`] : [],
        risks: spread < 0 ? ['Crescimento sem ganho de retorno destrói valor ao acionista.'] : [],
      };
    },
  });

  indicators.margem_bruta = buildDiagnostic({
    id: 'margem_bruta',
    name: 'Margem Bruta',
    category: 'rentabilidade',
    formula: 'Lucro Bruto / Receita Líquida',
    unit: '%',
    statusOverride: isBankOrInsurer || isFii ? 'not_applicable' : undefined,
    history: isBankOrInsurer || isFii ? [] : historicalSeries.map((r) => ({ period: r.period, granularity: r.granularity, value: r.margemBrutaPct })),
    oQueMede: 'Percentual da receita que remanesce após os custos diretos dos produtos vendidos ou serviços prestados.',
    importanciaSetorial: 'Reflete poder de precificação e eficiência produtiva/suprimentos.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val, trend) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `Margem bruta de ${val.toFixed(1)}% (${trend.replace(/_/g, ' ')}).`,
      fatores: 'Mix de produtos, repasse de preços e custo de insumos/mercadorias.',
      consequencias: 'Define a folga disponível para absorver despesas comerciais e administrativas.',
      riscosText: trend === 'deterioracao' ? 'Compressão de margem bruta sinaliza perda de poder de preço ou pressão de custos.' : 'Volatilidade de commodities/câmbio.',
      conclusao: val !== null && val >= 30 ? 'Boa capacidade de agregação de valor sobre custos diretos.' : 'Margem estrutural mais comprimida, exigindo alto giro.',
      positives: trend === 'crescimento_consistente' ? ['Expansão consistente de margem bruta.'] : [],
      negatives: trend === 'deterioracao' ? ['Contração recorrente de margem bruta.'] : [],
      risks: [],
    }),
  });

  indicators.margem_ebitda = buildDiagnostic({
    id: 'margem_ebitda',
    name: 'Margem EBITDA',
    category: 'rentabilidade',
    formula: 'EBITDA / Receita Líquida',
    unit: '%',
    statusOverride: isBankOrInsurer || isFii ? 'not_applicable' : undefined,
    sectorBenchmark: sector.interpretationBenchmarks.healthyEbitdaMarginMinPct,
    history: isBankOrInsurer || isFii ? [] : historicalSeries.map((r) => ({ period: r.period, granularity: r.granularity, value: r.margemEbitdaPct })),
    oQueMede: 'Geração operacional potencial de caixa antes de juros, impostos, depreciação e amortização por unidade de receita.',
    importanciaSetorial: 'Permite comparar eficiência operacional pura antes da estrutura de capital.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val, trend) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `Margem EBITDA de ${val.toFixed(1)}%.`,
      fatores: 'Alavancagem operacional e controle de SG&A.',
      consequencias: 'Base para capacidade de serviço da dívida e financiamento de CAPEX.',
      riscosText: 'EBITDA ignora necessidade recorrente de CAPEX de manutenção e variação de capital de giro.',
      conclusao: val !== null && val >= (sector.interpretationBenchmarks.healthyEbitdaMarginMinPct ?? 15) ? 'Eficiência operacional competitiva no setor.' : 'Margem operacional pressionada.',
      positives: trend === 'crescimento_consistente' ? ['Ganho de margem operacional EBITDA.'] : [],
      negatives: trend === 'deterioracao' ? ['Deterioração da margem EBITDA.'] : [],
      risks: [],
    }),
  });

  indicators.margem_ebit = buildDiagnostic({
    id: 'margem_ebit',
    name: 'Margem EBIT',
    category: 'rentabilidade',
    formula: 'EBIT / Receita Líquida',
    unit: '%',
    statusOverride: isBankOrInsurer || isFii ? 'not_applicable' : undefined,
    history: isBankOrInsurer || isFii ? [] : historicalSeries.map((r) => ({ period: r.period, granularity: r.granularity, value: r.margemEbitPct })),
    oQueMede: 'Lucratividade operacional após o desgaste econômico dos ativos (depreciação e amortização).',
    importanciaSetorial: 'Mais conservadora que a margem EBITDA por refletir a intensidade de ativos.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `Margem EBIT de ${val.toFixed(1)}%.`,
      fatores: 'Eficiência operacional líquida da depreciação.',
      consequencias: 'Direciona diretamente o NOPAT e o FCFF.',
      riscosText: val !== null && val < 0 ? 'Prejuízo operacional.' : 'Sensível a alavancagem operacional em quedas de receita.',
      conclusao: val !== null && val > 12 ? 'Sólida rentabilidade operacional.' : 'Acompanhar absorção de custos fixos.',
      positives: [],
      negatives: val !== null && val < 0 ? ['Margem EBIT negativa (prejuízo operacional).'] : [],
      risks: [],
    }),
  });

  indicators.margem_liquida = buildDiagnostic({
    id: 'margem_liquida',
    name: 'Margem Líquida',
    category: 'rentabilidade',
    formula: 'Lucro Líquido / Receita Líquida',
    unit: '%',
    statusOverride: isFii ? 'not_applicable' : undefined,
    history: isFii ? [] : historicalSeries.map((r) => ({ period: r.period, granularity: r.granularity, value: r.margemLiquidaPct })),
    oQueMede: 'Percentual final da receita convertido em lucro líquido após resultado financeiro e impostos.',
    importanciaSetorial: 'Capta o peso dos juros sobre a operação.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `Margem líquida de ${val.toFixed(1)}%.`,
      fatores: 'Resultado operacional, resultado financeiro (Selic/câmbio) e alíquota efetiva de IR/CSLL.',
      consequencias: 'Determina capacidade de retenção de lucros e distribuição de dividendos.',
      riscosText: 'Ganhos ou perdas não recorrentes podem distorcer temporariamente a margem líquida.',
      conclusao: val !== null && val > 10 ? 'Conversão líquida saudável.' : 'Margem líquida apertada ou negativa.',
      positives: [],
      negatives: val !== null && val < 0 ? ['Margem líquida negativa.'] : [],
      risks: [],
    }),
  });

  // 4. EFICIÊNCIA OPERACIONAL
  indicators.giro_ativo = buildDiagnostic({
    id: 'giro_ativo',
    name: 'Giro do Ativo',
    category: 'eficiencia',
    formula: 'Receita Líquida / Ativo Total Médio',
    unit: 'x',
    statusOverride: isBankOrInsurer || isFii ? 'not_applicable' : undefined,
    history: isBankOrInsurer || isFii
      ? []
      : dreList.map((dre, idx) => {
          const avgAt = averageTwo(idx > 0 ? bsList[idx - 1]?.ativoTotal : undefined, bsList[idx]?.ativoTotal);
          return {
            period: dre.period,
            granularity: dre.granularity,
            value: isFiniteNumber(dre.receitaLiquida) && isFiniteNumber(avgAt) && avgAt > 0 ? dre.receitaLiquida / avgAt : null,
          };
        }),
    oQueMede: 'Receita líquida gerada por cada real investido no ativo total médio.',
    importanciaSetorial: 'Empresas asset-light e varejo possuem giro alto; utilities e mineração têm giro menor compensado por margens mais altas.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `Cada R$ 1,00 de ativo gera R$ ${val.toFixed(2)} de receita líquida.`,
      fatores: 'Uso de capacidade produtiva e disciplina de capital de giro.',
      consequencias: 'Componente multiplicador direto do ROA e do ROIC.',
      riscosText: 'Queda persistente de giro pode sinalizar ociosidade ou aquisições caras.',
      conclusao: 'Avaliar evolução histórica dentro do modelo de negócios.',
      positives: [],
      negatives: [],
      risks: [],
    }),
  });

  indicators.ciclo_conversao_caixa = buildDiagnostic({
    id: 'ciclo_conversao_caixa',
    name: 'Ciclo de Conversão de Caixa (CCC)',
    category: 'eficiencia',
    formula: 'PME + PMR - PMP (em dias, base 360d)',
    unit: 'dias',
    higherIsBetter: false,
    statusOverride: !isCorporate ? 'not_applicable' : undefined,
    history: !isCorporate
      ? []
      : dreList.map((dre, idx) => {
          const bs = bsList[idx];
          const bsPrev = idx > 0 ? bsList[idx - 1] : undefined;
          if (!bs || !isFiniteNumber(dre.receitaLiquida) || dre.receitaLiquida <= 0 || !isFiniteNumber(dre.custos)) {
            return { period: dre.period, granularity: dre.granularity, value: null };
          }
          const avgRec = averageTwo(bsPrev?.contasReceber, bs.contasReceber);
          const avgFor = averageTwo(bsPrev?.fornecedores, bs.fornecedores);
          const avgEst = averageTwo(bsPrev?.estoques, bs.estoques);
          const cmvAbs = Math.abs(dre.custos);
          if (avgRec === null || avgFor === null || cmvAbs <= 1e-6) {
            return { period: dre.period, granularity: dre.granularity, value: null };
          }
          const pmr = (avgRec / dre.receitaLiquida) * 360;
          const pmp = (avgFor / cmvAbs) * 360;
          const pme = avgEst !== null ? (avgEst / cmvAbs) * 360 : 0;
          return { period: dre.period, granularity: dre.granularity, value: pme + pmr - pmp };
        }),
    oQueMede: 'Número de dias entre o desembolso a fornecedores e o efetivo recebimento das vendas.',
    importanciaSetorial: 'Ciclos menores ou negativos reduzem necessidade de capital de giro e liberam fluxo de caixa livre.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val, trend) => ({
      significado:
        val === null
          ? 'Dados de estoques, recebíveis ou fornecedores indisponíveis ou não aplicáveis ao modelo.'
          : val < 0
            ? `Ciclo negativo de ${val.toFixed(0)} dias: fornecedores financiam integralmente a operação.`
            : `Ciclo de conversão de caixa de ${val.toFixed(0)} dias.`,
      fatores: 'Prazos de recebimento (PMR), estocagem (PME) e pagamento (PMP).',
      consequencias: val !== null && val > 90 ? 'Crescimento de receita exige injeção relevante de capital de giro.' : 'Necessidade controlada de capital de giro.',
      riscosText: trend === 'deterioracao' ? 'Alongamento do ciclo consome caixa operacional.' : 'Manter disciplina comercial.',
      conclusao: val !== null && val <= 45 ? 'Eficiência saudável no ciclo financeiro.' : 'Monitorar necessidade de capital de giro.',
      positives: val !== null && val < 30 ? [`Ciclo de caixa curto (${val.toFixed(0)} dias).`] : [],
      negatives: trend === 'deterioracao' ? ['Alongamento recente do ciclo de conversão de caixa.'] : [],
      risks: [],
    }),
  });

  // 5. GERAÇÃO DE CAIXA
  indicators.fcff = buildDiagnostic({
    id: 'fcff',
    name: 'Fluxo de Caixa Livre para a Firma (FCFF)',
    category: 'geracao_caixa',
    formula: 'EBIT×(1-T) + D&A - CAPEX - ΔCapital de Giro',
    unit: 'BRL_M',
    statusOverride: !isCorporate ? 'not_applicable' : undefined,
    history: !isCorporate ? [] : historicalSeries.map((r) => ({ period: r.period, granularity: r.granularity, value: r.fcff })),
    oQueMede: 'Caixa livre gerado pela operação disponível para remunerar credores e acionistas após reinvestimentos necessários.',
    importanciaSetorial: 'Base primária do DCF e principal prova de sustentabilidade de dividendos e desalavancagem.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      if (!isCorporate) return { significado: 'Não aplicável ao setor.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'N/A.', positives: [], negatives: [], risks: [] };
      if (val === null) return { significado: 'Indisponível.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'Dados insuficientes.', positives: [], negatives: [], risks: [] };
      const negCount = historicalSeries.filter((r) => r.fcff !== null && r.fcff < 0).length;
      return {
        significado: `FCFF de ${formatCurrencyBrlM(val)} no período de referência.`,
        fatores: 'Geração de NOPAT, intensidade de CAPEX e variação do capital de giro.',
        consequencias: val > 0 ? 'Capacidade orgânica de pagar dívida, dividendos e financiar crescimento.' : 'Necessidade de caixa em caixa existente ou financiamento externo.',
        riscosText: negCount >= 2 ? 'Fluxo de caixa livre negativo recorrente pressiona dívida líquida.' : 'Oscilações pontuais por ciclos de expansão de CAPEX.',
        conclusao: val > 0 ? 'Negócio gerador líquido de caixa livre.' : 'Fluxo de caixa livre negativo; verificar se decorre de CAPEX expansionista com bom retorno ou deterioração.',
        positives: val > 0 ? [`FCFF positivo de ${formatCurrencyBrlM(val)}.`] : [],
        negatives: negCount >= 2 ? [`FCFF negativo em ${negCount} períodos analisados.`] : [],
        risks: val < 0 ? ['Dependência de caixa prévio ou captações para cobrir CAPEX/dividendos.'] : [],
      };
    },
  });

  indicators.fcf_yield = buildDiagnostic({
    id: 'fcf_yield',
    name: 'FCF Yield (FCFF / Enterprise Value)',
    category: 'geracao_caixa',
    formula: 'FCFF / Enterprise Value',
    unit: '%',
    statusOverride: !isCorporate ? 'not_applicable' : undefined,
    history: !isCorporate
      ? []
      : historicalSeries.map((r) => ({
          period: r.period,
          granularity: r.granularity,
          value: r.fcff !== null && enterpriseValueBrlM && enterpriseValueBrlM > 0 ? (r.fcff / enterpriseValueBrlM) * 100 : null,
        })),
    oQueMede: 'Taxa de retorno implícita em fluxo de caixa livre sobre o valor total da firma (EV).',
    importanciaSetorial: 'Permite comparar diretamente o retorno em caixa com taxas de juros reais e custo de capital.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `FCF Yield de ${val.toFixed(2)}% sobre Enterprise Value.`,
      fatores: 'Nível de geração de FCFF relativo ao preço pago pelo mercado + dívida líquida.',
      consequencias: val !== null && val > 8 ? 'Retorno em caixa atrativo se recorrente.' : 'Mercado precifica crescimento futuro ou exige normalização de CAPEX.',
      riscosText: 'Picos cíclicos de commodities podem inflar FCF Yield temporariamente.',
      conclusao: 'Analisar em conjunto com sustentabilidade das margens e CAPEX normalizado.',
      positives: val !== null && val >= 7 ? [`FCF Yield atrativo (${val.toFixed(2)}%).`] : [],
      negatives: val !== null && val < 0 ? ['FCF Yield negativo.'] : [],
      risks: [],
    }),
  });

  indicators.capex_receita = buildDiagnostic({
    id: 'capex_receita',
    name: 'CAPEX / Receita Líquida',
    category: 'geracao_caixa',
    formula: 'CAPEX / Receita Líquida',
    unit: '%',
    higherIsBetter: false,
    statusOverride: isBankOrInsurer || isFii ? 'not_applicable' : undefined,
    history: isBankOrInsurer || isFii
      ? []
      : historicalSeries.map((r) => ({
          period: r.period,
          granularity: r.granularity,
          value: r.capex !== null && r.receitaLiquida && r.receitaLiquida > 0 ? (r.capex / r.receitaLiquida) * 100 : null,
        })),
    oQueMede: 'Parcela da receita consumida em investimentos em imobilizado e intangível.',
    importanciaSetorial: 'Distingue modelos asset-light (software) de modelos capital-intensivos (energia, telecom, mineração).',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A.' : `CAPEX absorve ${val.toFixed(1)}% da receita líquida.`,
      fatores: 'Fase de expansão de capacidade vs manutenção da base de ativos.',
      consequencias: 'Impacta diretamente a conversão de EBITDA em FCFF.',
      riscosText: 'CAPEX mal alocado com retorno abaixo do WACC destrói valor.',
      conclusao: 'Avaliar relação CAPEX/Depreciação e ROIC incremental.',
      positives: [],
      negatives: [],
      risks: [],
    }),
  });

  indicators.dividendos_fcf = buildDiagnostic({
    id: 'dividendos_fcf',
    name: 'Dividendos / Fluxo de Caixa Livre',
    category: 'geracao_caixa',
    formula: 'Dividendos & JCP Pagos / Fluxo de Caixa Livre (FCFF ou FCO-CAPEX)',
    unit: '%',
    higherIsBetter: false,
    statusOverride: isFii ? 'not_applicable' : undefined,
    history: isFii
      ? []
      : historicalSeries.map((r) => {
          const fcfBase = r.fcff ?? (r.fluxoCaixaOperacional !== null && r.capex !== null ? r.fluxoCaixaOperacional - r.capex : null);
          if (r.dividendosPagos === null || fcfBase === null || fcfBase <= 0) {
            return { period: r.period, granularity: r.granularity, value: null };
          }
          return { period: r.period, granularity: r.granularity, value: (r.dividendosPagos / fcfBase) * 100 };
        }),
    oQueMede: 'Verifica se os dividendos pagos são efetivamente financiados pela geração livre de caixa, e não por dívida.',
    importanciaSetorial: 'Essencial para evitar armadilhas de dividend yield alto sustentado por endividamento.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      const latestRow = historicalSeries[historicalSeries.length - 1];
      const fcfBase = latestRow?.fcff ?? (latestRow?.fluxoCaixaOperacional !== null && latestRow?.capex !== null ? (latestRow?.fluxoCaixaOperacional ?? 0) - (latestRow?.capex ?? 0) : null);
      if ((latestRow?.dividendosPagos ?? 0) > 0 && fcfBase !== null && fcfBase <= 0) {
        return {
          significado: 'Empresa pagou dividendos mesmo com Fluxo de Caixa Livre negativo/nulo.',
          fatores: 'Distribuição financiada por caixa acumulado ou emissão de dívida.',
          consequencias: 'Insustentável no longo prazo caso não haja reversão do FCF.',
          riscosText: 'Risco elevado de corte de proventos ou aumento de alavancagem.',
          conclusao: 'Dividendos atualmente não cobertos pelo fluxo de caixa livre.',
          positives: [],
          negatives: ['Dividendos pagos sem cobertura de Fluxo de Caixa Livre.'],
          risks: ['Sustentabilidade dos dividendos comprometida se FCF permanecer negativo.'],
        };
      }
      return {
        significado: val === null ? 'Indisponível ou sem distribuição no período.' : `Proventos representam ${val.toFixed(1)}% do FCF.`,
        fatores: 'Política de payout vs necessidade de reinvestimento.',
        consequencias: val !== null && val <= 85 ? 'Distribuição confortável e coberta pelo caixa.' : 'Payout próximo ou acima do limite do caixa gerado.',
        riscosText: val !== null && val > 100 ? 'Payout acima de 100% do FCF consome reservas ou eleva dívida.' : 'Risco baixo de corte estrutural.',
        conclusao: val !== null && val <= 90 ? 'Dividendos sustentáveis pela geração de caixa.' : 'Monitorar cobertura em caixa dos proventos.',
        positives: val !== null && val <= 85 ? [`Proventos bem cobertos pelo caixa (${val.toFixed(0)}% do FCF).`] : [],
        negatives: val !== null && val > 105 ? [`Dividendos superam o FCF gerado (${val.toFixed(0)}%).`] : [],
        risks: [],
      };
    },
  });

  // 6. INDICADORES DE MERCADO (MULTIPLOS)
  const latestSharesM = asset.market.sharesTotal / 1_000_000;
  const latestLpa =
    latestDre && isFiniteNumber(latestDre.lucroLiquidoControladores ?? latestDre.lucroLiquidoTotal)
      ? (latestDre.lucroLiquidoControladores ?? latestDre.lucroLiquidoTotal)! / latestSharesM
      : null;
  const latestVpa =
    latestBs && isFiniteNumber(latestBs.patrimonioLiquidoControladores ?? latestBs.patrimonioLiquidoTotal)
      ? (latestBs.patrimonioLiquidoControladores ?? latestBs.patrimonioLiquidoTotal)! / latestSharesM
      : isFii && asset.fiiMetrics?.valorPatrimonialCota
        ? asset.fiiMetrics.valorPatrimonialCota
        : null;
  const latestDps =
    asset.market.dividendsPerShareAnnual[asset.market.dividendsPerShareAnnual.length - 1]?.dps ??
    (isFii && asset.fiiMetrics?.rendimentoMensalMedioCota ? asset.fiiMetrics.rendimentoMensalMedioCota * 12 : null);

  indicators.pl = buildDiagnostic({
    id: 'pl',
    name: 'P/L (Preço / Lucro)',
    category: 'mercado',
    formula: 'Preço da Ação / Lucro por Ação (LPA)',
    unit: 'x',
    higherIsBetter: false,
    statusOverride: isFii ? 'not_applicable' : undefined,
    history: isFii
      ? []
      : dreList.map((dre) => {
          const ll = dre.lucroLiquidoControladores ?? dre.lucroLiquidoTotal;
          if (!isFiniteNumber(ll) || ll <= 0) return { period: dre.period, granularity: dre.granularity, value: null };
          return { period: dre.period, granularity: dre.granularity, value: marketCapBrlM / ll };
        }),
    oQueMede: 'Relação entre o preço atual de mercado e o lucro líquido por ação (múltiplo implícito usando preço atual sobre lucros históricos para comparação de base).',
    importanciaSetorial: 'Nunca interpretar isoladamente: P/L baixo pode significar desconto ou expectativa de queda abrupta de lucros (ex: topo de ciclo de commodities).',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => {
      if (isFii) return { significado: 'Não aplicável a FIIs.', fatores: '-', consequencias: '-', riscosText: '-', conclusao: 'N/A.', positives: [], negatives: [], risks: [] };
      if (latestLpa !== null && latestLpa <= 0) {
        return {
          significado: 'Prejuízo líquido no período torna o P/L negativo/não significativo.',
          fatores: 'LPA negativo.',
          consequencias: 'Utilizar EV/EBITDA, P/VP ou DCF normalizado.',
          riscosText: 'Prejuízo recorrente exige foco em liquidez e turnaround.',
          conclusao: 'P/L inaplicável devido a prejuízo.',
          positives: [],
          negatives: ['Prejuízo líquido impede uso de P/L.'],
          risks: [],
        };
      }
      return {
        significado: val === null ? 'Indisponível.' : `P/L atual de ${val.toFixed(1)}x (Earnings Yield de ${val > 0 ? ((1 / val) * 100).toFixed(1) : '0'}%).`,
        fatores: 'Expectativa de crescimento, ROIC/ROE, risco percebido e juros reais.',
        consequencias: 'P/L elevado exige entregas consistentes de crescimento; P/L baixo demanda checagem de recorrência e qualidade.',
        riscosText: 'Armadilha de valor se o lucro atual estiver no pico cíclico ou inflado por não recorrentes.',
        conclusao: 'Interpretar junto ao CAGR de lucros, ROIC e DCF.',
        positives: [],
        negatives: [],
        risks: [],
      };
    },
  });

  indicators.pvp = buildDiagnostic({
    id: 'pvp',
    name: 'P/VP (Preço / Valor Patrimonial)',
    category: 'mercado',
    formula: isFii ? 'Preço da Cota / Valor Patrimonial por Cota' : 'Preço da Ação / Valor Patrimonial por Ação (VPA)',
    unit: 'x',
    higherIsBetter: false,
    history: isFii
      ? [{ period: referencePeriod, granularity: 'ltm', value: latestVpa && latestVpa > 0 ? asset.market.price / latestVpa : null }]
      : bsList.map((bs) => {
          const pl = bs.patrimonioLiquidoControladores ?? bs.patrimonioLiquidoTotal;
          return {
            period: bs.period,
            granularity: bs.granularity,
            value: isFiniteNumber(pl) && pl > 0 ? marketCapBrlM / pl : null,
          };
        }),
    oQueMede: 'Quanto o mercado paga por cada real de patrimônio líquido contábil (ou patrimonial da cota em FIIs).',
    importanciaSetorial: 'Fundamental em Bancos, Seguradoras, Incorporadoras e FIIs; menos informativo isoladamente em empresas de tecnologia asset-light.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado:
        latestVpa !== null && latestVpa <= 0
          ? 'Patrimônio Líquido negativo impede o cálculo positivo de P/VP.'
          : val === null
            ? 'Indisponível.'
            : `P/VP de ${val.toFixed(2)}x.`,
      fatores: 'Relação direta com ROE esperado vs Ke (em bancos/empresas) ou qualidade dos laudos/vacância (em FIIs).',
      consequencias: val !== null && val < 0.85 ? 'Desconto patrimonial relevante; validar se há destruição de ROE/vacância ou oportunidade.' : 'Avaliação alinhada ao retorno patrimonial.',
      riscosText: 'Patrimônio contábil pode estar defasado ou sujeito a baixas contábeis (impairment).',
      conclusao: 'Confrontar P/VP com ROE (empresas) ou Cap Rate/Vacância (FIIs).',
      positives: [],
      negatives: latestVpa !== null && latestVpa <= 0 ? ['Patrimônio líquido negativo.'] : [],
      risks: [],
    }),
  });

  indicators.ev_ebitda = buildDiagnostic({
    id: 'ev_ebitda',
    name: 'EV / EBITDA',
    category: 'mercado',
    formula: 'Enterprise Value / EBITDA',
    unit: 'x',
    higherIsBetter: false,
    statusOverride: isBankOrInsurer || isFii ? 'not_applicable' : undefined,
    history:
      isBankOrInsurer || isFii
        ? []
        : historicalSeries.map((r) => ({
            period: r.period,
            granularity: r.granularity,
            value:
              enterpriseValueBrlM !== null && r.ebitda !== null && r.ebitda > 0
                ? enterpriseValueBrlM / r.ebitda
                : null,
          })),
    oQueMede: 'Múltiplo do valor total da firma (incluindo dívida líquida) sobre sua geração operacional bruta.',
    importanciaSetorial: 'Padrão de mercado para comparar empresas com estruturas de alavancagem distintas.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível ou N/A (ou EBITDA negativo).' : `EV/EBITDA atual de ${val.toFixed(1)}x.`,
      fatores: 'ROIC, crescimento esperado, intensidade de CAPEX e nível de risco.',
      consequencias: 'Empresas com maior conversão de EBITDA em FCF e maior ROIC justificam EV/EBITDA mais elevado.',
      riscosText: 'Não captura diferenças de alíquota tributária nem intensidade de CAPEX.',
      conclusao: 'Usar em conjunto com EV/EBIT e FCF Yield.',
      positives: [],
      negatives: [],
      risks: [],
    }),
  });

  indicators.dividend_yield = buildDiagnostic({
    id: 'dividend_yield',
    name: 'Dividend Yield (12m)',
    category: 'mercado',
    formula: 'Dividendos / Rendimentos por Ação (12m) / Preço Atual',
    unit: '%',
    history: asset.market.dividendsPerShareAnnual.map((d) => ({
      period: d.year,
      granularity: 'annual',
      value: asset.market.price > 0 ? (d.dps / asset.market.price) * 100 : null,
    })),
    oQueMede: 'Retorno direto em proventos distribuídos nos últimos 12 meses frente ao preço atual.',
    importanciaSetorial: 'Indicador central em FIIs, elétricas, saneamento, bancos e seguradoras.',
    sourceLabel,
    referencePeriod,
    disclosureDate,
    interpretFn: (val) => ({
      significado: val === null ? 'Indisponível.' : `Dividend Yield de ${val.toFixed(2)}% ao ano.`,
      fatores: 'Payout adotado, lucro/FFO gerado e cotação atual.',
      consequencias: 'Deve ser avaliado pela recorrência (sem ganho de capital pontual ou dívida).',
      riscosText: 'Yield artificialmente elevado por queda de preço ou dividendo extraordinário não se sustenta.',
      conclusao: 'Verificar cobertura pelo Fluxo de Caixa Livre.',
      positives: val !== null && val >= 6 ? [`Dividend Yield robusto (${val.toFixed(2)}%).`] : [],
      negatives: [],
      risks: [],
    }),
  });

  // Sector-specific indicator injection (Bank, Insurer, FII)
  if (asset.assetType === 'bank' && asset.bankMetrics) {
    const bm = asset.bankMetrics;
    indicators.basileia = buildDiagnostic({
      id: 'basileia',
      name: 'Índice de Basileia',
      category: 'setorial',
      formula: 'Patrimônio de Referência / Ativos Ponderados pelo Risco (RWA)',
      unit: '%',
      history: [{ period: referencePeriod, granularity: 'ltm', value: bm.indiceBasileiaPct }],
      oQueMede: 'Solvência regulatória do banco frente ao risco de sua carteira de crédito e mercado.',
      importanciaSetorial: 'Mínimo regulatório no Brasil fica em torno de 10,5%–11,5%; bancos sólidos operam acima de 13,5%.',
      sourceLabel,
      referencePeriod,
      disclosureDate,
      interpretFn: (val) => ({
        significado: val === null ? 'Indisponível.' : `Índice de Basileia em ${val.toFixed(1)}% (Capital Nível 1: ${bm.capitalNivel1Pct?.toFixed(1) ?? 'N/D'}%).`,
        fatores: 'Retenção de lucros, emissão de instrumentos híbridos e expansão da carteira RWA.',
        consequencias: val !== null && val >= 13.5 ? 'Folga confortável para crescer carteira e pagar dividendos.' : 'Espaço mais restrito de capital.',
        riscosText: 'Basileia próxima do mínimo restringe payout.',
        conclusao: val !== null && val >= 13 ? 'Solidez de capital adequada.' : 'Monitorar capital regulatório.',
        positives: val !== null && val >= 14 ? [`Basileia robusta (${val.toFixed(1)}%).`] : [],
        negatives: val !== null && val < 12 ? [`Folga estreita de Basileia (${val.toFixed(1)}%).`] : [],
        risks: [],
      }),
    });
    indicators.inadimplencia = buildDiagnostic({
      id: 'inadimplencia',
      name: 'Inadimplência (>90 dias)',
      category: 'setorial',
      formula: 'Créditos Vencidos > 90 dias / Carteira de Crédito Total',
      unit: '%',
      higherIsBetter: false,
      history: [{ period: referencePeriod, granularity: 'ltm', value: bm.inadimplencia90dPct }],
      oQueMede: 'Qualidade dos recebíveis de crédito da instituição.',
      importanciaSetorial: 'Antecipa necessidade de provisões (PDD) e compressão de lucro líquido.',
      sourceLabel,
      referencePeriod,
      disclosureDate,
      interpretFn: (val) => ({
        significado: val === null ? 'Indisponível.' : `Inadimplência acima de 90 dias em ${val.toFixed(2)}% (Cobertura PDD: ${bm.indiceCoberturaPddPct?.toFixed(0) ?? 'N/D'}%).`,
        fatores: 'Mix entre crédito consignado/imobiliário vs cartão/PME e ciclo econômico.',
        consequencias: 'Exige monitoramento conjunto do índice de cobertura.',
        riscosText: 'Cobertura abaixo de 150% reduz colchão contra perdas inesperadas.',
        conclusao: 'Qualidade de crédito compatível com mix reportado.',
        positives: val !== null && val <= 3.2 ? [`Inadimplência controlada (${val.toFixed(2)}%).`] : [],
        negatives: val !== null && val > 5.0 ? [`Inadimplência elevada (${val.toFixed(2)}%).`] : [],
        risks: [],
      }),
    });
  }

  if (asset.assetType === 'insurer' && asset.insurerMetrics) {
    const im = asset.insurerMetrics;
    indicators.combined_ratio = buildDiagnostic({
      id: 'combined_ratio',
      name: 'Índice Combinado (Combined Ratio)',
      category: 'setorial',
      formula: '(Sinistros + Despesas Administrativas + Comerciais) / Prêmios Ganhos',
      unit: '%',
      higherIsBetter: false,
      history: [{ period: referencePeriod, granularity: 'ltm', value: im.combinedRatioPct }],
      oQueMede: 'Eficiência operacional pura da subscrição de seguros (abaixo de 100% indica lucro técnico antes do resultado financeiro).',
      importanciaSetorial: 'Separa seguradoras com vantagem técnica real daquelas dependentes apenas da Selic alta.',
      sourceLabel,
      referencePeriod,
      disclosureDate,
      interpretFn: (val) => ({
        significado: val === null ? 'Indisponível.' : `Índice combinado de ${val.toFixed(1)}% (Sinistralidade: ${im.sinistralidadePct?.toFixed(1) ?? 'N/D'}%).`,
        fatores: 'Precificação atuarial, sinistros e eficiência comercial.',
        consequencias: val !== null && val < 90 ? 'Forte lucro operacional de subscrição somado ao resultado financeiro.' : 'Menor margem técnica.',
        riscosText: 'Eventos climáticos ou desvios atuariais.',
        conclusao: val !== null && val < 95 ? 'Subscrição altamente rentável.' : 'Acompanhar sinistralidade.',
        positives: val !== null && val < 85 ? [`Combined Ratio excelente (${val.toFixed(1)}%).`] : [],
        negatives: val !== null && val > 100 ? ['Prejuízo técnico na subscrição (>100%).'] : [],
        risks: [],
      }),
    });
  }

  if (asset.assetType === 'fii' && asset.fiiMetrics) {
    const fm = asset.fiiMetrics;
    indicators.vacancia_fisica = buildDiagnostic({
      id: 'vacancia_fisica',
      name: fm.fiiType === 'papel' ? 'Inadimplência / LTV Médio da Carteira' : 'Vacância Física',
      category: 'setorial',
      formula: fm.fiiType === 'papel' ? 'Garantias Reais / Saldo Devedor (LTV)' : 'Área Vaga / Área Bruta Locável Total',
      unit: '%',
      higherIsBetter: false,
      history: [{ period: referencePeriod, granularity: 'ltm', value: fm.fiiType === 'papel' ? (fm.inadimplenciaPct ?? 0) : fm.vacanciaFisicaPct }],
      oQueMede: fm.fiiType === 'papel' ? 'Nível de inadimplência nos CRIs da carteira.' : 'Percentual físico dos imóveis atualmente desocupado.',
      importanciaSetorial: 'Direciona diretamente a previsibilidade dos rendimentos por cota.',
      sourceLabel,
      referencePeriod,
      disclosureDate,
      interpretFn: (val) => ({
        significado:
          val === null
            ? 'Indisponível.'
            : fm.fiiType === 'papel'
              ? `Inadimplência de ${val.toFixed(2)}% e LTV médio de ${fm.ltvMedioPct?.toFixed(0) ?? 'N/D'}%.`
              : `Vacância física de ${val.toFixed(1)}% (Financeira: ${fm.vacanciaFinanceiraPct?.toFixed(1) ?? 'N/D'}%, WAULT: ${fm.waultAnos?.toFixed(1) ?? 'N/D'} anos).`,
        fatores: fm.fiiType === 'papel' ? 'Qualidade de crédito dos devedores e subordinação.' : 'Qualidade construtiva, localização e ciclo imobiliário.',
        consequencias: 'Impacta o rendimento mensal recorrente por cota.',
        riscosText: fm.fiiType === 'papel' ? 'Risco de default em CRIs concentrados.' : 'Custos condominiais absorvidos pelo fundo em áreas vagas.',
        conclusao: val !== null && val <= 8 ? 'Carteira com ocupação/adimplência saudável.' : 'Monitorar absorção de vacância/crédito.',
        positives: val !== null && val <= 5 ? ['Ocupação/adimplência muito saudável.'] : [],
        negatives: val !== null && val > 15 ? ['Vacância/inadimplência elevada pressionando rendimentos.'] : [],
        risks: [],
      }),
    });
  }

  // Growth CAGRs (1y, 3y, 5y, 10y)
  const buildCagrRow = (label: string, series: (number | null)[]): {
    metric: string;
    cagr1y: number | null;
    cagr3y: number | null;
    cagr5y: number | null;
    cagr10y: number | null;
    note?: string;
  } => {
    const len = series.length;
    const latest = len >= 1 ? series[len - 1] : null;
    const getHorizon = (yrs: number) => {
      if (len < yrs + 1) return null;
      return computeCagr(series[len - 1 - yrs], latest, yrs).value;
    };
    return {
      metric: label,
      cagr1y: getHorizon(1),
      cagr3y: getHorizon(3),
      cagr5y: getHorizon(5),
      cagr10y: getHorizon(10),
      note: len < 11 ? 'Série histórica disponível cobre ' + Math.max(0, len - 1) + ' anos completos.' : undefined,
    };
  };

  const growthCagrs = [
    buildCagrRow('Receita Líquida', historicalSeries.map((r) => r.receitaLiquida)),
    buildCagrRow('EBITDA', historicalSeries.map((r) => r.ebitda)),
    buildCagrRow('EBIT', historicalSeries.map((r) => r.ebit)),
    buildCagrRow('Lucro Líquido', historicalSeries.map((r) => r.lucroLiquido)),
    buildCagrRow('Patrimônio Líquido', bsList.map((b) => b.patrimonioLiquidoTotal)),
    buildCagrRow('Ativo Total', bsList.map((b) => b.ativoTotal)),
    buildCagrRow('Fluxo de Caixa Operacional', historicalSeries.map((r) => r.fluxoCaixaOperacional)),
    buildCagrRow('Fluxo de Caixa Livre (FCFF)', historicalSeries.map((r) => r.fcff)),
    buildCagrRow('Dividendos por Ação', asset.market.dividendsPerShareAnnual.map((d) => d.dps)),
  ];

  // Earnings Quality
  const earningsQuality = analyzeEarningsQuality(asset.assetType, bsList, dreList, dfcList);

  const indicatorsList = Object.values(indicators);

  // Aggregate findings
  const strongestIndicators: string[] = [];
  const weakestIndicators: string[] = [];
  const positiveTrends: string[] = [];
  const negativeTrends: string[] = [];
  const financialRisks: string[] = [];

  for (const ind of indicatorsList) {
    if (ind.status === 'not_applicable' || ind.status === 'unavailable') continue;
    strongestIndicators.push(...ind.positives);
    weakestIndicators.push(...ind.negatives);
    financialRisks.push(...ind.risks);
    if (ind.trend === 'crescimento_consistente' || ind.trend === 'recuperacao') {
      positiveTrends.push(`${ind.name}: tendência de ${ind.trend.replace(/_/g, ' ')}.`);
    } else if (ind.trend === 'deterioracao') {
      negativeTrends.push(`${ind.name}: tendência de deterioração.`);
    }
  }

  // Coverage metric
  const applicableIndicators = indicatorsList.filter((i) => i.status !== 'not_applicable');
  const availableIndicators = applicableIndicators.filter((i) => i.status !== 'unavailable');
  const dataCoveragePct =
    applicableIndicators.length > 0
      ? Math.round((availableIndicators.length / applicableIndicators.length) * 100)
      : 0;

  const overallDiagnosis = isFii
    ? `Fundo Imobiliário (${asset.fiiMetrics?.fiiType.toUpperCase() ?? 'FII'}) negociando a P/VP de ${formatNumberPtBr(indicators.pvp?.value)}x e DY de ${formatNumberPtBr(indicators.dividend_yield?.value)}%.`
    : `Ativo do setor ${sector.name}: ROE de ${formatNumberPtBr(indicators.roe?.value)}%, Margem Líquida de ${formatNumberPtBr(indicators.margem_liquida?.value)}%${isCorporate ? `, ROIC de ${formatNumberPtBr(indicators.roic?.value)}% e Dív. Líq./EBITDA de ${formatNumberPtBr(indicators.divida_liquida_ebitda?.value)}x` : ''}.`;

  const technicalConclusion =
    `Análise financeira de ${asset.ticker} (${referencePeriod}, divulgação ${disclosureDate}) apresenta cobertura de dados de ${dataCoveragePct}% dos indicadores aplicáveis ao setor ${sector.name}. ` +
    (earningsQuality.classification !== 'Dados insuficientes'
      ? `Qualidade dos lucros classificada como "${earningsQuality.classification}". `
      : '') +
    (weakestIndicators.length > 0
      ? `Pontos críticos financeiros demandam atenção: ${weakestIndicators.slice(0, 2).join(' ')}`
      : 'Fundamentos financeiros não apresentam sinais agudos de estresse de liquidez ou solvência na base observada.');

  return {
    assetTicker: asset.ticker,
    referencePeriod,
    disclosureDate,
    accountingIdentityChecks,
    marketCapBrlM,
    enterpriseValueBrlM,
    grossDebtBrlM,
    cashBrlM,
    netDebtBrlM,
    normalizedTaxRatePct: normalizedTaxRate * 100,
    waccEstimatePct,
    indicators,
    indicatorsList,
    growthCagrs,
    earningsQuality,
    historicalSeries,
    strongestIndicators: strongestIndicators.slice(0, 6),
    weakestIndicators: weakestIndicators.slice(0, 6),
    positiveTrends: positiveTrends.slice(0, 5),
    negativeTrends: negativeTrends.slice(0, 5),
    financialRisks: [...new Set(financialRisks)].slice(0, 6),
    overallDiagnosis,
    technicalConclusion,
    dataCoveragePct,
  };
}
