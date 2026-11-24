import { FinancialPillarResult, runFinancialAnalysis } from '../financial/financialEngine.ts';
import { isFiniteNumber } from '../financial/mathUtils.ts';
import { QualitativePillarResult, runQualitativeAnalysis } from '../qualitative/qualitativeEngine.ts';
import { SECTOR_PROFILES } from '../sectors/sectorProfiles.ts';
import {
  AssetRawData,
  PillarWeightsConfig,
  RiskAlert,
  StructuredAnalysisAH,
  ValuationAssumptions,
} from '../types.ts';
import { runValuationAnalysis, ValuationPillarResult } from '../valuation/valuationEngine.ts';

export const DEFAULT_WEIGHTS_CONFIG: PillarWeightsConfig = {
  financial: {
    liquidez: 10,
    endividamento: 15,
    rentabilidade: 20,
    eficiencia: 10,
    crescimento: 10,
    geracaoCaixa: 20,
    qualidadeLucros: 15,
  },
  qualitative: {
    modeloNegocio: 15,
    vantagensCompetitivas: 20,
    gestao: 15,
    governanca: 15,
    alocacaoCapital: 15,
    mercadoConcorrencia: 10,
    riscosSustentabilidade: 10,
  },
  valuation: {
    adequacaoMetodologica: 15,
    potencialValorizacao: 20,
    margemSeguranca: 25,
    sustentabilidadePremissas: 15,
    sensibilidadeRiscos: 15,
    consistenciaMetodos: 10,
  },
  overall: {
    financialWeight: 0.35,
    qualitativeWeight: 0.35,
    valuationWeight: 0.30,
    rationale:
      'Ponderação equilibrada 35% Financeiro / 35% Qualitativo / 30% Valuation evita armadilhas de múltiplos baratos em negócios deteriorados ou qualidade sem margem de segurança.',
  },
};

export interface PillarScoreBreakdown {
  pillarScore: number; // 0-100
  dataCoveragePct: number; // 0-100
  components: {
    label: string;
    weight: number;
    score: number | null; // null = N/A or unavailable (never scored as 0!)
    status: 'scored' | 'not_applicable' | 'unavailable';
    rationale: string;
  }[];
}

export interface IntegratedAssetAnalysis {
  asset: AssetRawData;
  sectorName: string;
  financial: FinancialPillarResult;
  qualitative: QualitativePillarResult;
  valuation: ValuationPillarResult;
  scores: {
    financial: PillarScoreBreakdown;
    qualitative: PillarScoreBreakdown;
    valuation: PillarScoreBreakdown;
    overallScore: number;
    overallDataCoveragePct: number;
    weightsUsed: PillarWeightsConfig;
    warningFlags: string[];
  };
  alerts: RiskAlert[];
  structuredConclusion: StructuredAnalysisAH;
  strengths: string[];
  weaknesses: string[];
  recommendationSummary: string;
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function weightedAverageAvailable(
  items: { weight: number; score: number | null }[]
): number {
  const valid = items.filter((i) => isFiniteNumber(i.score));
  const wSum = valid.reduce((acc, i) => acc + i.weight, 0);
  if (wSum <= 0) return 50;
  const total = valid.reduce((acc, i) => acc + i.score! * i.weight, 0);
  return Math.round(total / wSum);
}

function scoreFinancialPillar(
  asset: AssetRawData,
  fin: FinancialPillarResult,
  weights: PillarWeightsConfig['financial']
): PillarScoreBreakdown {
  const sector = SECTOR_PROFILES[asset.sectorId];
  const ind = fin.indicators;
  const isBankOrInsurer = asset.assetType === 'bank' || asset.assetType === 'insurer';
  const isFii = asset.assetType === 'fii';

  // 1. Liquidez
  let liqScore: number | null = null;
  let liqStatus: 'scored' | 'not_applicable' | 'unavailable' = 'scored';
  let liqNote = '';
  if (isBankOrInsurer) {
    liqStatus = 'not_applicable';
    liqNote = 'Liquidez corrente corporativa não aplicável a bancos/seguradoras; avaliada via Basileia/capital regulatório.';
  } else if (isFii) {
    const liqDiaria = asset.fiiMetrics?.liquidezDiariaMedia ?? null;
    if (liqDiaria !== null) {
      liqScore = liqDiaria >= 2.0 ? 88 : liqDiaria >= 0.8 ? 72 : 48;
      liqNote = `Liquidez média diária em bolsa de R$ ${liqDiaria.toFixed(1)} mi.`;
    } else {
      liqStatus = 'unavailable';
      liqNote = 'Liquidez diária indisponível.';
    }
  } else if (ind.liquidez_corrente?.value !== null && ind.liquidez_corrente?.value !== undefined) {
    const lc = ind.liquidez_corrente.value;
    // Balanced scoring: neither <1.0 nor excessive idle >3.5 gets max blindly
    if (lc >= 1.3 && lc <= 2.6) liqScore = 88;
    else if (lc > 2.6) liqScore = 76;
    else if (lc >= 1.0) liqScore = 68;
    else liqScore = 34;
    liqNote = `Liquidez corrente de ${lc.toFixed(2)}x e imediata de ${ind.liquidez_imediata?.value?.toFixed(2) ?? 'N/D'}x.`;
  } else {
    liqStatus = 'unavailable';
    liqNote = 'Dados de ativo/passivo circulante ausentes.';
  }

  // 2. Endividamento
  let debtScore: number | null = null;
  let debtStatus: 'scored' | 'not_applicable' | 'unavailable' = 'scored';
  let debtNote = '';
  if (asset.assetType === 'bank' && asset.bankMetrics?.indiceBasileiaPct !== null && asset.bankMetrics?.indiceBasileiaPct !== undefined) {
    const bas = asset.bankMetrics.indiceBasileiaPct;
    debtScore = bas >= 14 ? 90 : bas >= 12.5 ? 76 : bas >= 11 ? 55 : 28;
    debtNote = `Basileia de ${bas.toFixed(1)}% (Capital Nível 1: ${asset.bankMetrics.capitalNivel1Pct?.toFixed(1) ?? 'N/D'}%).`;
  } else if (asset.assetType === 'insurer' && asset.insurerMetrics?.adequacaoCapitalPct !== null && asset.insurerMetrics?.adequacaoCapitalPct !== undefined) {
    const cap = asset.insurerMetrics.adequacaoCapitalPct;
    debtScore = cap >= 180 ? 90 : cap >= 140 ? 75 : 50;
    debtNote = `Adequação de capital regulatório SUSEP em ${cap.toFixed(0)}%.`;
  } else if (isFii && asset.fiiMetrics) {
    const alav = asset.fiiMetrics.alavancagemPct ?? 0;
    debtScore = alav <= 5 ? 92 : alav <= 15 ? 76 : alav <= 28 ? 55 : 30;
    debtNote = `Alavancagem do FII em ${alav.toFixed(1)}% do patrimônio.`;
  } else if (ind.divida_liquida_ebitda?.value !== null && ind.divida_liquida_ebitda?.value !== undefined) {
    const dl = ind.divida_liquida_ebitda.value;
    const bench = sector.interpretationBenchmarks.healthyNetDebtEbitdaMax ?? 2.5;
    if (dl < 0) debtScore = 95;
    else if (dl <= bench * 0.5) debtScore = 86;
    else if (dl <= bench) debtScore = 72;
    else if (dl <= bench * 1.4) debtScore = 46;
    else debtScore = 22;
    debtNote = `Dívida Líquida/EBITDA de ${dl.toFixed(2)}x (referência setorial <= ${bench.toFixed(1)}x).`;
  } else if (fin.historicalSeries[fin.historicalSeries.length - 1]?.ebitda !== null && (fin.historicalSeries[fin.historicalSeries.length - 1]?.ebitda ?? 0) <= 0) {
    debtScore = 20;
    debtNote = 'EBITDA negativo compromete cobertura da dívida.';
  } else {
    debtStatus = 'unavailable';
    debtNote = 'Dados de dívida ou EBITDA indisponíveis.';
  }

  // 3. Rentabilidade
  let profScore: number | null = null;
  let profStatus: 'scored' | 'not_applicable' | 'unavailable' = 'scored';
  let profNote = '';
  if (isFii && asset.fiiMetrics) {
    const dy = ind.dividend_yield?.value ?? asset.fiiMetrics.dividendYield12mPct ?? null;
    const vac = asset.fiiMetrics.fiiType === 'papel' ? (asset.fiiMetrics.inadimplenciaPct ?? 0) : (asset.fiiMetrics.vacanciaFinanceiraPct ?? 0);
    if (dy !== null) {
      profScore = clamp((dy >= 9 ? 85 : dy >= 7 ? 72 : 55) - vac * 1.2, 20, 95);
      profNote = `DY 12m de ${dy.toFixed(1)}% com vacância/inadimplência de ${vac.toFixed(1)}%.`;
    } else {
      profStatus = 'unavailable';
    }
  } else if (asset.assetType === 'bank' || asset.assetType === 'insurer') {
    const roe = ind.roe?.value ?? null;
    if (roe !== null) {
      const bench = sector.interpretationBenchmarks.healthyRoeMinPct ?? 16;
      profScore = clamp(50 + (roe - bench) * 2.5, 15, 96);
      profNote = `ROE de ${roe.toFixed(1)}% frente à referência setorial de ${bench}%.`;
    } else {
      profStatus = 'unavailable';
    }
  } else if (ind.roic?.value !== null && ind.roic?.value !== undefined) {
    const roic = ind.roic.value;
    const spread = roic - fin.waccEstimatePct;
    profScore = clamp(62 + spread * 4.0, 15, 98);
    profNote = `ROIC de ${roic.toFixed(1)}% (spread de ${spread >= 0 ? '+' : ''}${spread.toFixed(1)} p.p. vs WACC estimado).`;
  } else if (ind.roe?.value !== null && ind.roe?.value !== undefined) {
    profScore = clamp(52 + ind.roe.value * 1.5, 10, 90);
    profNote = `ROE de ${ind.roe.value.toFixed(1)}%.`;
  } else {
    profStatus = 'unavailable';
    profNote = 'Rentabilidade indisponível.';
  }

  // 4. Eficiência Operacional
  let effScore: number | null = null;
  let effStatus: 'scored' | 'not_applicable' | 'unavailable' = 'scored';
  let effNote = '';
  if (asset.assetType === 'bank' && asset.bankMetrics?.indiceEficienciaPct !== null && asset.bankMetrics?.indiceEficienciaPct !== undefined) {
    const ef = asset.bankMetrics.indiceEficienciaPct;
    effScore = ef <= 40 ? 92 : ef <= 48 ? 78 : ef <= 56 ? 60 : 40;
    effNote = `Índice de eficiência bancária de ${ef.toFixed(1)}% (menor = melhor).`;
  } else if (asset.assetType === 'insurer' && asset.insurerMetrics?.combinedRatioPct !== null && asset.insurerMetrics?.combinedRatioPct !== undefined) {
    const cr = asset.insurerMetrics.combinedRatioPct;
    effScore = cr <= 78 ? 94 : cr <= 88 ? 80 : cr <= 98 ? 62 : 30;
    effNote = `Combined Ratio de ${cr.toFixed(1)}%.`;
  } else if (isFii) {
    effStatus = 'not_applicable';
    effNote = 'Eficiência industrial não aplicável a FIIs; vacância e taxa de adm avaliadas em rentabilidade/qualitativo.';
  } else if (ind.margem_ebitda?.value !== null && ind.margem_ebitda?.value !== undefined) {
    const m = ind.margem_ebitda.value;
    const bench = sector.interpretationBenchmarks.healthyEbitdaMarginMinPct ?? 16;
    effScore = clamp(65 + (m - bench) * 1.3, 15, 95);
    effNote = `Margem EBITDA de ${m.toFixed(1)}% e Giro do Ativo de ${ind.giro_ativo?.value?.toFixed(2) ?? 'N/D'}x.`;
  } else {
    effStatus = 'unavailable';
  }

  // 5. Crescimento
  const revCagr3 = fin.growthCagrs.find((g) => g.metric === 'Receita Líquida')?.cagr3y ?? null;
  const llCagr3 = fin.growthCagrs.find((g) => g.metric === 'Lucro Líquido')?.cagr3y ?? null;
  let growthScore: number | null = null;
  let growthStatus: 'scored' | 'not_applicable' | 'unavailable' = 'scored';
  let growthNote = '';
  if (isFii) {
    growthStatus = 'not_applicable';
    growthNote = 'FIIs distribuem ~95% do caixa e crescem via emissões/reajustes inflacionários.';
  } else if (revCagr3 !== null || llCagr3 !== null) {
    const baseG = llCagr3 ?? revCagr3 ?? 0;
    growthScore = clamp(52 + baseG * 2.1, 18, 95);
    growthNote = `CAGR 3a Receita: ${revCagr3 !== null ? revCagr3.toFixed(1) + '%' : 'N/D'} · CAGR 3a Lucro: ${llCagr3 !== null ? llCagr3.toFixed(1) + '%' : 'N/D'}.`;
  } else {
    growthStatus = 'unavailable';
    growthNote = 'Série de crescimento insuficiente ou base negativa.';
  }

  // 6. Geração de Caixa
  let cfScore: number | null = null;
  let cfStatus: 'scored' | 'not_applicable' | 'unavailable' = 'scored';
  let cfNote = '';
  if (isBankOrInsurer) {
    cfStatus = 'not_applicable';
    cfNote = 'FCFF tradicional não se aplica a instituições financeiras.';
  } else if (isFii) {
    const dy = ind.dividend_yield?.value ?? null;
    cfScore = dy !== null ? clamp(45 + dy * 4.0, 35, 92) : null;
    if (cfScore === null) cfStatus = 'unavailable';
    cfNote = `Distribuição de rendimentos anualizada de ${dy?.toFixed(2) ?? 'N/D'}%.`;
  } else {
    const fcff = ind.fcff?.value ?? null;
    const conv = fin.earningsQuality.fcoToNetIncomeRatio;
    if (fcff !== null || conv !== null) {
      let s = 60;
      if (fcff !== null) s = fcff > 0 ? 78 : 34;
      if (conv !== null) s = Math.round((s + clamp(conv * 78, 20, 96)) / 2);
      cfScore = s;
      cfNote = `FCFF atual: ${fcff !== null ? 'R$ ' + fcff.toFixed(1) + ' mi' : 'N/D'} · Conversão FCO/LL: ${conv !== null ? (conv * 100).toFixed(0) + '%' : 'N/D'}.`;
    } else {
      cfStatus = 'unavailable';
      cfNote = 'Dados de fluxo de caixa indisponíveis.';
    }
  }

  // 7. Qualidade dos Lucros
  const eqScore = fin.earningsQuality.score;
  const eqStatus: 'scored' | 'not_applicable' | 'unavailable' =
    eqScore !== null ? 'scored' : 'unavailable';

  const components: PillarScoreBreakdown['components'] = [
    { label: 'Liquidez', weight: weights.liquidez, score: liqScore, status: liqStatus, rationale: liqNote },
    { label: 'Endividamento / Solvência', weight: weights.endividamento, score: debtScore, status: debtStatus, rationale: debtNote },
    { label: 'Rentabilidade', weight: weights.rentabilidade, score: profScore, status: profStatus, rationale: profNote },
    { label: 'Eficiência Operacional', weight: weights.eficiencia, score: effScore, status: effStatus, rationale: effNote },
    { label: 'Crescimento', weight: weights.crescimento, score: growthScore, status: growthStatus, rationale: growthNote },
    { label: 'Geração de Caixa', weight: weights.geracaoCaixa, score: cfScore, status: cfStatus, rationale: cfNote },
    {
      label: 'Qualidade dos Lucros',
      weight: weights.qualidadeLucros,
      score: eqScore,
      status: eqStatus,
      rationale: `Classificação "${fin.earningsQuality.classification}" (${fin.earningsQuality.signalsToInvestigate.length} sinal(is) de atenção).`,
    },
  ];

  return {
    pillarScore: weightedAverageAvailable(components),
    dataCoveragePct: fin.dataCoveragePct,
    components,
  };
}

function scoreQualitativePillar(
  qual: QualitativePillarResult,
  weights: PillarWeightsConfig['qualitative']
): PillarScoreBreakdown {
  const components = qual.subScores.map((s) => ({
    label: s.label,
    weight: weights[s.id],
    score: s.score,
    status: (s.score !== null ? 'scored' : 'unavailable') as 'scored' | 'unavailable',
    rationale: s.evidenceSummary,
  }));

  return {
    pillarScore: weightedAverageAvailable(components),
    dataCoveragePct: qual.dataCoveragePct,
    components,
  };
}

function scoreValuationPillar(
  asset: AssetRawData,
  fin: FinancialPillarResult,
  qual: QualitativePillarResult,
  val: ValuationPillarResult,
  weights: PillarWeightsConfig['valuation']
): PillarScoreBreakdown {
  const applicableCount = val.modelsTable.filter((m) => m.applicable).length;
  const methodScore = applicableCount >= 3 ? 92 : applicableCount === 2 ? 78 : applicableCount === 1 ? 60 : 30;

  // Potencial de valorização
  const upsideScore = clamp(50 + val.upsidePct * 1.15, 12, 95);

  // Margem de segurança (25 pts) — NEVER blindly reward low multiples if business/earnings quality is weak
  const mos = val.marginOfSafetyPct;
  let mosScore = clamp(45 + mos * 1.4, 10, 96);
  const finWeakPenalty =
    fin.earningsQuality.classification === 'Fraca' || fin.earningsQuality.classification === 'Crítica';
  if (finWeakPenalty && mosScore > 62) {
    mosScore = 62; // Cap attractiveness if earnings quality is weak (avoid value trap!)
  }

  // Sustentabilidade das premissas
  const tvShare = val.scenarios.base.terminalValueSharePct;
  let premScore = 82;
  if (asset.assetType === 'stock' && tvShare > 75) premScore -= 18;
  if (val.reverseDcf.applicable && val.reverseDcf.marketExpectationAssessment === 'Muito Agressiva') premScore -= 18;
  if (qual.moatCountStrong >= 1) premScore += 6;
  premScore = clamp(premScore, 25, 95);

  // Sensibilidade e riscos
  const sensScore =
    val.confidenceLevel === 'Alto' ? 85 : val.confidenceLevel === 'Moderado' ? 68 : 45;

  // Consistência entre métodos
  const modelVals = val.modelsTable
    .filter((m) => m.applicable && m.fairValuePerShare !== null)
    .map((m) => m.fairValuePerShare!);
  let consScore = 72;
  if (modelVals.length >= 2) {
    const spread = (Math.max(...modelVals) - Math.min(...modelVals)) / Math.max(1, val.reconciledFairValue);
    consScore = clamp(92 - spread * 65, 30, 95);
  }

  const components: PillarScoreBreakdown['components'] = [
    {
      label: 'Adequação Metodológica Setorial',
      weight: weights.adequacaoMetodologica,
      score: methodScore,
      status: 'scored',
      rationale: `${applicableCount} modelos específicos do setor aplicados com reconciliação ponderada.`,
    },
    {
      label: 'Potencial de Valorização',
      weight: weights.potencialValorizacao,
      score: Math.round(upsideScore),
      status: 'scored',
      rationale: `Upside estimado de ${val.upsidePct >= 0 ? '+' : ''}${val.upsidePct.toFixed(1)}% sobre o preço de R$ ${val.currentPrice.toFixed(2)}.`,
    },
    {
      label: 'Margem de Segurança',
      weight: weights.margemSeguranca,
      score: Math.round(mosScore),
      status: 'scored',
      rationale: `Margem de segurança de ${val.marginOfSafetyPct.toFixed(1)}% (mínima desejada: ${val.assumptionsUsed.desiredMarginOfSafetyPct}%).`,
    },
    {
      label: 'Sustentabilidade das Premissas',
      weight: weights.sustentabilidadePremissas,
      score: Math.round(premScore),
      status: 'scored',
      rationale: val.reverseDcf.applicable ? val.reverseDcf.explanation : 'Premissas alinhadas ao setor.',
    },
    {
      label: 'Sensibilidade e Riscos',
      weight: weights.sensibilidadeRiscos,
      score: sensScore,
      status: 'scored',
      rationale: `Grau de confiança ${val.confidenceLevel}. ${val.confidenceReasons[0] ?? ''}`,
    },
    {
      label: 'Consistência entre Métodos',
      weight: weights.consistenciaMetodos,
      score: Math.round(consScore),
      status: 'scored',
      rationale: `Convergência avaliada entre ${modelVals.length} metodologias válidas.`,
    },
  ];

  return {
    pillarScore: weightedAverageAvailable(components),
    dataCoveragePct: Math.round((fin.dataCoveragePct + qual.dataCoveragePct) / 2),
    components,
  };
}

function generateRiskAlerts(
  asset: AssetRawData,
  fin: FinancialPillarResult,
  qual: QualitativePillarResult,
  val: ValuationPillarResult
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const period = fin.referencePeriod;
  const series = fin.historicalSeries;
  const n = series.length;
  const latestBs = asset.balanceSheets[asset.balanceSheets.length - 1];

  // 1. Dívida líquida crescente mais rápido que EBITDA
  if (n >= 2) {
    const curr = series[n - 1];
    const prev = series[n - 2];
    if (
      isFiniteNumber(curr.dividaLiquida) &&
      isFiniteNumber(prev.dividaLiquida) &&
      curr.dividaLiquida > prev.dividaLiquida &&
      isFiniteNumber(curr.ebitda) &&
      isFiniteNumber(prev.ebitda) &&
      prev.ebitda > 0
    ) {
      const debtGrowth = (curr.dividaLiquida - prev.dividaLiquida) / Math.max(1, Math.abs(prev.dividaLiquida));
      const ebitdaGrowth = (curr.ebitda - prev.ebitda) / prev.ebitda;
      if (debtGrowth > ebitdaGrowth + 0.15 && curr.dividaLiquida > 0) {
        alerts.push({
          id: 'alert_debt_growth',
          severity: 'atencao',
          pillar: 'financeiro',
          relatedIndicator: 'Dívida Líquida / EBITDA',
          evidence: `Dívida líquida variou +${(debtGrowth * 100).toFixed(1)}% vs EBITDA ${(ebitdaGrowth * 100).toFixed(1)}%.`,
          period,
          potentialImpact: 'Aumento gradual de alavancagem e despesa financeira.',
          explanation: 'Endividamento líquido cresce acima da geração operacional bruta.',
          investigationRecommendation: 'Verificar destino das captações (CAPEX expansivo vs queima de capital de giro).',
        });
      }
    }
  }

  // 2. Patrimônio Líquido Negativo
  if (latestBs && isFiniteNumber(latestBs.patrimonioLiquidoTotal) && latestBs.patrimonioLiquidoTotal < 0) {
    alerts.push({
      id: 'alert_neg_equity',
      severity: 'critico',
      pillar: 'financeiro',
      relatedIndicator: 'Patrimônio Líquido',
      evidence: `PL negativo de R$ ${latestBs.patrimonioLiquidoTotal.toFixed(1)} mi.`,
      period,
      potentialImpact: 'Risco extremo de insolvência ou diluição severa via aumento de capital.',
      explanation: 'Passivos exigíveis superam a totalidade dos ativos contábeis.',
      investigationRecommendation: 'Analisar plano de reestruturação, renegociação de dívida e cronograma de vencimentos.',
    });
  }

  // 3. Cobertura de Juros baixa
  const cov = fin.indicators.cobertura_juros?.value;
  if (isFiniteNumber(cov) && cov < 1.8) {
    alerts.push({
      id: 'alert_interest_cov',
      severity: cov < 1.1 ? 'critico' : 'alto_risco',
      pillar: 'financeiro',
      relatedIndicator: 'Cobertura de Juros (EBIT / Juros)',
      evidence: `Cobertura de apenas ${cov.toFixed(2)}x no período ${period}.`,
      period,
      potentialImpact: 'Compressão severa do lucro líquido e vulnerabilidade a juros altos.',
      explanation: 'EBIT operacional tem margem estreita para absorver o custo da dívida.',
      investigationRecommendation: 'Checar proporção da dívida atrelada ao CDI e covenants financeiros.',
    });
  }

  // 4. Fluxo de caixa livre negativo recorrente
  const negFcffCount = series.filter((s) => isFiniteNumber(s.fcff) && s.fcff < 0).length;
  if (negFcffCount >= 2 && asset.assetType === 'stock') {
    alerts.push({
      id: 'alert_neg_fcff',
      severity: negFcffCount >= 3 ? 'alto_risco' : 'atencao',
      pillar: 'financeiro',
      relatedIndicator: 'FCFF',
      evidence: `FCFF negativo em ${negFcffCount} dos ${series.length} períodos históricos avaliados.`,
      period,
      potentialImpact: 'Dependência de financiamento externo ou consumo de caixa para sustentar investimentos.',
      explanation: 'Geração operacional não tem coberto CAPEX e variações de capital de giro.',
      investigationRecommendation: 'Separar CAPEX de expansão (com ROIC > WACC) de CAPEX de manutenção ou deterioração operacional.',
    });
  }

  // 5. Dividendos não cobertos pelo caixa
  const divFcf = fin.indicators.dividendos_fcf?.value;
  const latestRow = series[n - 1];
  if (
    asset.assetType === 'stock' &&
    latestRow &&
    (latestRow.dividendosPagos ?? 0) > 0 &&
    ((isFiniteNumber(divFcf) && divFcf > 110) || (isFiniteNumber(latestRow.fcff) && latestRow.fcff <= 0))
  ) {
    alerts.push({
      id: 'alert_div_uncovered',
      severity: 'alto_risco',
      pillar: 'financeiro',
      relatedIndicator: 'Dividendos / FCF',
      evidence: `Dividendos pagos (R$ ${latestRow.dividendosPagos?.toFixed(1)} mi) superam o FCFF do período.`,
      period,
      potentialImpact: 'Sustentabilidade dos proventos ameaçada ou financiamento via dívida.',
      explanation: 'Empresa distribuiu mais caixa aos acionistas do que gerou livremente após investimentos.',
      investigationRecommendation: 'Avaliar se houve venda de ativos ou uso pontual de caixa excedente.',
    });
  }

  // 6. ROIC inferior ao WACC
  const roic = fin.indicators.roic?.value;
  if (asset.assetType === 'stock' && isFiniteNumber(roic) && roic < val.waccPct - 1.0) {
    alerts.push({
      id: 'alert_roic_below_wacc',
      severity: roic < val.waccPct - 4 ? 'alto_risco' : 'atencao',
      pillar: 'financeiro',
      relatedIndicator: 'ROIC vs WACC',
      evidence: `ROIC de ${roic.toFixed(1)}% abaixo do WACC calculado de ${val.waccPct.toFixed(1)}%.`,
      period,
      potentialImpact: 'Destruição econômica de valor caso a empresa cresça sem elevar o retorno operacional.',
      explanation: 'Spread econômico negativo indica retorno inferior ao custo de oportunidade do capital.',
      investigationRecommendation: 'Investigar se há ativos em maturação (CAPEX recente) ou perda estrutural de competitividade.',
    });
  }

  // 7. Margens em deterioração
  if (fin.indicators.margem_ebitda?.trend === 'deterioracao') {
    alerts.push({
      id: 'alert_margin_deterioration',
      severity: 'atencao',
      pillar: 'financeiro',
      relatedIndicator: 'Margem EBITDA',
      evidence: `Tendência classificada como deterioração (atual ${fin.indicators.margem_ebitda.value?.toFixed(1) ?? 'N/D'}%).`,
      period,
      potentialImpact: 'Redução da capacidade de geração de caixa por unidade vendida.',
      explanation: 'Custos ou despesas crescem acima da receita líquida.',
      investigationRecommendation: 'Avaliar poder de repasse de preços e pressão de custos fixos.',
    });
  }

  // 8. Qualidade dos lucros / Recebíveis / Não recorrentes
  for (const sig of fin.earningsQuality.signalsToInvestigate.slice(0, 2)) {
    alerts.push({
      id: `alert_eq_${alerts.length}`,
      severity: 'atencao',
      pillar: 'financeiro',
      relatedIndicator: 'Qualidade dos Lucros',
      evidence: sig,
      period,
      potentialImpact: 'Divergência entre lucro contábil e caixa real pode mascarar fundamentos.',
      explanation: 'Sinal identificado pelo módulo de accruals e qualidade de resultados.',
      investigationRecommendation: 'Inspecionar notas explicativas de contas a receber, provisões e outras receitas operacionais.',
    });
  }

  // 9. Governança / Riscos Qualitativos críticos
  for (const risk of asset.qualitative.risks.filter((r) => r.severity === 'critico' || r.severity === 'alto').slice(0, 2)) {
    alerts.push({
      id: `alert_qual_${risk.category}`,
      severity: risk.severity === 'critico' ? 'critico' : 'alto_risco',
      pillar: 'qualitativo',
      relatedIndicator: risk.label,
      evidence: risk.evidence,
      period: asset.qualitative.referenceDate,
      potentialImpact: risk.description,
      explanation: `Risco estratégico/qualitativo de severidade ${risk.severity}.`,
      investigationRecommendation: risk.mitigation ?? 'Acompanhar fatos relevantes e Formulário de Referência.',
    });
  }

  // 10. Valuation dependente de premissas agressivas
  if (val.reverseDcf.applicable && val.reverseDcf.marketExpectationAssessment === 'Muito Agressiva') {
    alerts.push({
      id: 'alert_aggressive_valuation',
      severity: 'atencao',
      pillar: 'valuation',
      relatedIndicator: 'Reverse DCF',
      evidence: `Preço atual embute CAGR de receita de ${val.reverseDcf.impliedRevenueCagrPct?.toFixed(1)}% a.a.`,
      period: val.referenceDate,
      potentialImpact: 'Risco de compressão severa de múltiplos caso entregas fiquem abaixo do consenso implícito.',
      explanation: 'Expectativa embutida na cotação supera significativamente o cenário base fundamentado.',
      investigationRecommendation: 'Exigir margem de segurança maior ou validar novos vetores de crescimento.',
    });
  }

  // 11. Cobertura de dados baixa
  if (fin.dataCoveragePct < 75) {
    alerts.push({
      id: 'alert_low_coverage',
      severity: 'informativo',
      pillar: 'dados',
      relatedIndicator: 'Cobertura de Dados',
      evidence: `Cobertura atual de ${fin.dataCoveragePct}% dos indicadores aplicáveis.`,
      period,
      potentialImpact: 'Menor precisão nas estimativas e notas.',
      explanation: 'Parte das demonstrações ou variáveis setoriais encontra-se indisponível.',
      investigationRecommendation: 'Complementar coleta via DFP/ITR CVM ou Relatório Gerencial.',
    });
  }

  return alerts;
}

export function runIntegratedAnalysis(
  asset: AssetRawData,
  options?: {
    weights?: PillarWeightsConfig;
    valuationOverrides?: Partial<ValuationAssumptions>;
  }
): IntegratedAssetAnalysis {
  const weights = options?.weights ?? DEFAULT_WEIGHTS_CONFIG;
  const sector = SECTOR_PROFILES[asset.sectorId];

  // Phase 2
  const preWacc =
    asset.defaultValuationAssumptions.rfPct +
    asset.defaultValuationAssumptions.beta * asset.defaultValuationAssumptions.rmMinusRfPct;
  const financial = runFinancialAnalysis(asset, {
    waccEstimatePct: Math.min(18, Math.max(9.5, preWacc * 0.9)),
    normalizedTaxRatePct: options?.valuationOverrides?.taxRateNormalizedPct ?? asset.defaultValuationAssumptions.taxRateNormalizedPct,
  });

  // Phase 3 (uses Pillar 1 ROIC vs WACC)
  const qualitative = runQualitativeAnalysis(asset, financial);

  // Phase 4 (uses Pillar 1 statements & Pillar 2 growthSustainabilityFactor + riskSpread)
  const valuation = runValuationAnalysis(
    asset,
    financial,
    qualitative,
    options?.valuationOverrides
  );

  // Re-run financial WACC reference cleanly to stay 100% consistent
  financial.waccEstimatePct = Number(valuation.waccPct.toFixed(2));

  // Phase 5 Scoring
  const finScore = scoreFinancialPillar(asset, financial, weights.financial);
  const qualScore = scoreQualitativePillar(qualitative, weights.qualitative);
  const valScore = scoreValuationPillar(asset, financial, qualitative, valuation, weights.valuation);

  const wSum =
    weights.overall.financialWeight +
    weights.overall.qualitativeWeight +
    weights.overall.valuationWeight;
  const overallScore = Math.round(
    (finScore.pillarScore * weights.overall.financialWeight +
      qualScore.pillarScore * weights.overall.qualitativeWeight +
      valScore.pillarScore * weights.overall.valuationWeight) /
      Math.max(0.01, wSum)
  );

  const overallDataCoveragePct = Math.round(
    (finScore.dataCoveragePct + qualScore.dataCoveragePct) / 2
  );

  const warningFlags: string[] = [];
  if (finScore.pillarScore < 45) {
    warningFlags.push(`Nota Financeira baixa (${finScore.pillarScore}/100): fragilidade operacional ou financeira relevante.`);
  }
  if (qualScore.pillarScore < 50) {
    warningFlags.push(`Nota Qualitativa baixa (${qualScore.pillarScore}/100): vantagens competitivas fracas ou riscos de governança.`);
  }
  if (valScore.pillarScore < 45) {
    warningFlags.push(`Nota de Valuation baixa (${valScore.pillarScore}/100): margem de segurança insuficiente ao preço atual.`);
  }

  const alerts = generateRiskAlerts(asset, financial, qualitative, valuation);

  const strengths = [
    ...financial.strongestIndicators.slice(0, 3),
    ...qualitative.evidencesSupportingScore.slice(0, 3),
    ...(valuation.marginOfSafetyPct >= valuation.assumptionsUsed.desiredMarginOfSafetyPct
      ? [`Margem de segurança de ${valuation.marginOfSafetyPct.toFixed(1)}% atende ao critério mínimo (${valuation.assumptionsUsed.desiredMarginOfSafetyPct}%).`]
      : []),
  ];

  const weaknesses = [
    ...financial.weakestIndicators.slice(0, 3),
    ...qualitative.keyRisksSummary.slice(0, 2),
    ...(valuation.marginOfSafetyPct < 0
      ? [`Preço atual (R$ ${valuation.currentPrice.toFixed(2)}) acima do valor justo reconciliado (R$ ${valuation.reconciledFairValue.toFixed(2)}).`]
      : []),
  ];

  const structuredConclusion: StructuredAnalysisAH = {
    fatoObservado: `${asset.name} (${asset.ticker}) negocia a R$ ${valuation.currentPrice.toFixed(2)} (Market Cap de R$ ${(valuation.marketCapBrlM / 1000).toFixed(2)} bi) no setor ${sector.name}, obtendo Nota Financeira ${finScore.pillarScore}/100, Qualitativa ${qualScore.pillarScore}/100 e Valuation ${valScore.pillarScore}/100 (Geral: ${overallScore}/100).`,
    evidencia: `${financial.overallDiagnosis} Moat geral classificado como "${qualitative.moatStrengthOverall.replace(/_/g, ' ')}". Valor justo reconciliado de R$ ${valuation.reconciledFairValue.toFixed(2)} (${valuation.modelsTable.filter((m) => m.applicable).map((m) => m.label).join(', ')}).`,
    interpretacao:
      finScore.pillarScore >= 70 && qualScore.pillarScore >= 70
        ? 'Negócio apresenta fundamentos sólidos e vantagens competitivas defensáveis; a decisão de alocação depende da margem de segurança exigida pelo comitê.'
        : finScore.pillarScore < 50
          ? 'Fundamentos financeiros pressionados exigem cautela mesmo diante de eventuais descontos em múltiplos.'
          : 'Qualidade operacional e posicionamento moderados, demandando acompanhamento estrito dos catalisadores e riscos setoriais.',
    contexto: `Data de referência das demonstrações: ${financial.referencePeriod} (divulgação ${financial.disclosureDate}). Cobertura informacional de ${overallDataCoveragePct}% e confiança do valuation classificada como "${valuation.confidenceLevel}".`,
    impacto: `Nos parâmetros atuais (WACC ${valuation.waccPct.toFixed(2)}% / Ke ${valuation.kePct.toFixed(2)}%), a diferença entre preço e valor justo resulta em potencial de ${valuation.upsidePct >= 0 ? '+' : ''}${valuation.upsidePct.toFixed(1)}% e margem de segurança de ${valuation.marginOfSafetyPct.toFixed(1)}%.`,
    risco:
      alerts.filter((a) => a.severity === 'critico' || a.severity === 'alto_risco').length > 0
        ? alerts
            .filter((a) => a.severity === 'critico' || a.severity === 'alto_risco')
            .map((a) => `${a.relatedIndicator}: ${a.evidence}`)
            .join(' ')
        : 'Principais sensibilidades residem em variações de taxa de desconto (Selic/WACC), crescimento terminal e ciclo setorial.',
    perspectiva: `Cenário Conservador projeta R$ ${valuation.scenarios.conservador.fairValuePerShare.toFixed(2)} e Cenário Otimista R$ ${valuation.scenarios.otimista.fairValuePerShare.toFixed(2)} (Base: R$ ${valuation.scenarios.base.fairValuePerShare.toFixed(2)}).`,
    conclusao:
      valuation.meetsDesiredMarginOfSafety && finScore.pillarScore >= 65 && qualScore.pillarScore >= 65
        ? `Tese atrativa sob os critérios configurados: combinação de qualidade fundamentalista (Fin ${finScore.pillarScore} / Qual ${qualScore.pillarScore}) e margem de segurança de ${valuation.marginOfSafetyPct.toFixed(1)}%.`
        : finScore.pillarScore >= 70 && qualScore.pillarScore >= 70 && !valuation.meetsDesiredMarginOfSafety
          ? `Empresa de alta qualidade (Fin ${finScore.pillarScore} / Qual ${qualScore.pillarScore}), porém preço atual oferece margem de segurança de ${valuation.marginOfSafetyPct.toFixed(1)}%, abaixo do mínimo configurado (${valuation.assumptionsUsed.desiredMarginOfSafetyPct}%).`
          : `Relação risco-retorno exige diligência adicional nos alertas levantados (${alerts.length} alerta(s)) antes de eventual alocação.`,
    referenceDate: financial.disclosureDate,
  };

  return {
    asset,
    sectorName: sector.name,
    financial,
    qualitative,
    valuation,
    scores: {
      financial: finScore,
      qualitative: qualScore,
      valuation: valScore,
      overallScore,
      overallDataCoveragePct,
      weightsUsed: weights,
      warningFlags,
    },
    alerts,
    structuredConclusion,
    strengths: strengths.slice(0, 6),
    weaknesses: weaknesses.slice(0, 6),
    recommendationSummary: structuredConclusion.conclusao,
  };
}
