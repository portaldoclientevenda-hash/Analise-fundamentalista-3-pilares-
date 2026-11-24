import {
  AssetType,
  BalanceSheetPeriod,
  CashFlowPeriod,
  IncomeStatementPeriod,
} from '../types.ts';
import { averageTwo, isFiniteNumber, safeDivide } from './mathUtils.ts';

export interface BeneishMScoreResult {
  calculable: boolean;
  score: number | null;
  missingVariables: string[];
  variables: {
    dsri: number | null;
    gmi: number | null;
    aqi: number | null;
    sgi: number | null;
    depi: number | null;
    sgai: number | null;
    lvgi: number | null;
    tata: number | null;
  };
  interpretation: string;
  limitation: string;
}

export interface EarningsQualityReport {
  classification: 'Excelente' | 'Boa' | 'Regular' | 'Fraca' | 'Crítica' | 'Dados insuficientes';
  score: number | null; // 0-100
  fcoToNetIncomeRatio: number | null;
  accrualsRatioPct: number | null;
  receivablesGrowthVsRevenuePct: number | null;
  inventoryGrowthVsRevenuePct: number | null;
  nonRecurringSharePct: number | null;
  intangiblesToAssetsPct: number | null;
  beneishMScore: BeneishMScoreResult;
  signalsToInvestigate: string[];
  positives: string[];
  methodologyNote: string;
}

export function computeBeneishMScore(
  assetType: AssetType,
  bsPrev: BalanceSheetPeriod | undefined,
  bsCurr: BalanceSheetPeriod | undefined,
  drePrev: IncomeStatementPeriod | undefined,
  dreCurr: IncomeStatementPeriod | undefined,
  dfcCurr: CashFlowPeriod | undefined
): BeneishMScoreResult {
  const emptyVars = {
    dsri: null,
    gmi: null,
    aqi: null,
    sgi: null,
    depi: null,
    sgai: null,
    lvgi: null,
    tata: null,
  };

  if (assetType === 'bank' || assetType === 'insurer' || assetType === 'fii') {
    return {
      calculable: false,
      score: null,
      missingVariables: ['Modelo Beneish M-Score não é aplicável a instituições financeiras ou FIIs.'],
      variables: emptyVars,
      interpretation: 'Não aplicável ao setor.',
      limitation: 'O modelo Beneish (1999) foi calibrado exclusivamente para empresas não financeiras.',
    };
  }

  const missing: string[] = [];
  if (!bsPrev || !bsCurr || !drePrev || !dreCurr || !dfcCurr) {
    return {
      calculable: false,
      score: null,
      missingVariables: ['São necessários pelo menos dois períodos anuais consecutivos completos de BP, DRE e DFC.'],
      variables: emptyVars,
      interpretation: 'Dados insuficientes para cálculo.',
      limitation: 'Ausência de série histórica mínima de 2 exercícios completos.',
    };
  }

  // Check required inputs
  const reqPairs: [string, number | null | undefined][] = [
    ['Contas a Receber (t-1)', bsPrev.contasReceber],
    ['Contas a Receber (t)', bsCurr.contasReceber],
    ['Receita Líquida (t-1)', drePrev.receitaLiquida],
    ['Receita Líquida (t)', dreCurr.receitaLiquida],
    ['Lucro Bruto (t-1)', drePrev.lucroBruto],
    ['Lucro Bruto (t)', dreCurr.lucroBruto],
    ['Ativo Circulante (t-1)', bsPrev.ativoCirculante],
    ['Ativo Circulante (t)', bsCurr.ativoCirculante],
    ['Imobilizado (t-1)', bsPrev.imobilizado],
    ['Imobilizado (t)', bsCurr.imobilizado],
    ['Ativo Total (t-1)', bsPrev.ativoTotal],
    ['Ativo Total (t)', bsCurr.ativoTotal],
    ['D&A (t-1)', drePrev.depreciacaoAmortizacao],
    ['D&A (t)', dreCurr.depreciacaoAmortizacao],
    ['Despesas Comerciais+Adm (t-1)', (drePrev.despesasComerciais ?? 0) + (drePrev.despesasAdministrativas ?? 0)],
    ['Despesas Comerciais+Adm (t)', (dreCurr.despesasComerciais ?? 0) + (dreCurr.despesasAdministrativas ?? 0)],
    ['Passivo Circulante (t-1)', bsPrev.passivoCirculante],
    ['Passivo Circulante (t)', bsCurr.passivoCirculante],
    ['Dívida LP (t-1)', bsPrev.emprestimosLongoPrazo],
    ['Dívida LP (t)', bsCurr.emprestimosLongoPrazo],
    ['Lucro Líquido (t)', dreCurr.lucroLiquidoTotal],
    ['Fluxo de Caixa Operacional (t)', dfcCurr.fluxoCaixaOperacional],
  ];

  for (const [label, v] of reqPairs) {
    if (!isFiniteNumber(v)) missing.push(label);
  }
  if (
    !isFiniteNumber(drePrev.despesasComerciais) &&
    !isFiniteNumber(drePrev.despesasAdministrativas)
  ) {
    missing.push('Despesas operacionais SG&A (t-1)');
  }
  if (
    !isFiniteNumber(dreCurr.despesasComerciais) &&
    !isFiniteNumber(dreCurr.despesasAdministrativas)
  ) {
    missing.push('Despesas operacionais SG&A (t)');
  }

  if (missing.length > 0) {
    return {
      calculable: false,
      score: null,
      missingVariables: missing,
      variables: emptyVars,
      interpretation: 'Dados insuficientes: variáveis obrigatórias ausentes impedem o cálculo íntegro do M-Score.',
      limitation: 'Por rigor metodológico, o Beneish M-Score não estima nem preenche variáveis ausentes silenciosamente.',
    };
  }

  // Compute the 8 ratios
  const recT = bsCurr.contasReceber!;
  const recPrev = bsPrev.contasReceber!;
  const revT = dreCurr.receitaLiquida!;
  const revPrev = drePrev.receitaLiquida!;

  if (revT <= 0 || revPrev <= 0 || bsCurr.ativoTotal! <= 0 || bsPrev.ativoTotal! <= 0) {
    return {
      calculable: false,
      score: null,
      missingVariables: ['Receita ou Ativo Total nulo/negativo inviabiliza razões do modelo Beneish.'],
      variables: emptyVars,
      interpretation: 'Não calculável devido a receita ou ativo não positivo.',
      limitation: 'Denominadores não positivos tornam índices Beneish estatisticamente inválidos.',
    };
  }

  const dsri = (recT / revT) / Math.max(1e-6, recPrev / revPrev);
  const gmPrev = drePrev.lucroBruto! / revPrev;
  const gmCurr = dreCurr.lucroBruto! / revT;
  const gmi = Math.abs(gmCurr) > 1e-6 ? gmPrev / gmCurr : 1;

  const nonCurrentOtherCurr = Math.max(
    0,
    bsCurr.ativoTotal! - bsCurr.ativoCirculante! - bsCurr.imobilizado!
  );
  const nonCurrentOtherPrev = Math.max(
    0,
    bsPrev.ativoTotal! - bsPrev.ativoCirculante! - bsPrev.imobilizado!
  );
  const aqiCurr = nonCurrentOtherCurr / bsCurr.ativoTotal!;
  const aqiPrev = nonCurrentOtherPrev / bsPrev.ativoTotal!;
  const aqi = aqiPrev > 1e-6 ? aqiCurr / aqiPrev : 1;

  const sgi = revT / revPrev;

  const depRatePrev = drePrev.depreciacaoAmortizacao! / Math.max(1e-6, drePrev.depreciacaoAmortizacao! + bsPrev.imobilizado!);
  const depRateCurr = dreCurr.depreciacaoAmortizacao! / Math.max(1e-6, dreCurr.depreciacaoAmortizacao! + bsCurr.imobilizado!);
  const depi = depRateCurr > 1e-6 ? depRatePrev / depRateCurr : 1;

  const sgaPrev = Math.abs(drePrev.despesasComerciais ?? 0) + Math.abs(drePrev.despesasAdministrativas ?? 0);
  const sgaCurr = Math.abs(dreCurr.despesasComerciais ?? 0) + Math.abs(dreCurr.despesasAdministrativas ?? 0);
  const sgai = (sgaPrev / revPrev) > 1e-6 ? (sgaCurr / revT) / (sgaPrev / revPrev) : 1;

  const debtCurr = (bsCurr.passivoCirculante! + (bsCurr.emprestimosLongoPrazo ?? 0) + (bsCurr.debentures ?? 0)) / bsCurr.ativoTotal!;
  const debtPrev = (bsPrev.passivoCirculante! + (bsPrev.emprestimosLongoPrazo ?? 0) + (bsPrev.debentures ?? 0)) / bsPrev.ativoTotal!;
  const lvgi = debtPrev > 1e-6 ? debtCurr / debtPrev : 1;

  const tata = (dreCurr.lucroLiquidoTotal! - dfcCurr.fluxoCaixaOperacional!) / bsCurr.ativoTotal!;

  const mScore =
    -4.84 +
    0.92 * dsri +
    0.528 * gmi +
    0.404 * aqi +
    0.892 * sgi +
    0.115 * depi -
    0.172 * sgai +
    4.679 * tata -
    0.327 * lvgi;

  const interpretation =
    mScore <= -2.22
      ? `M-Score de ${mScore.toFixed(2)} (abaixo do limiar -2,22): não há sinais estatísticos relevantes de agressividade contábil nos accruals analisados.`
      : mScore <= -1.78
        ? `M-Score de ${mScore.toFixed(2)} (zona cinzenta entre -2,22 e -1,78): recomenda-se inspeção das notas explicativas de recebíveis, depreciação e capitalização.`
        : `M-Score de ${mScore.toFixed(2)} (acima de -1,78): indicador estatístico de atenção em accruals/recebíveis/intangíveis; exige investigação contábil aprofundada (não constitui acusação de fraude).`;

  return {
    calculable: true,
    score: mScore,
    missingVariables: [],
    variables: { dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata },
    interpretation,
    limitation:
      'Indicador probabilístico desenvolvido para empresas industriais norte-americanas (Beneish, 1999); mudanças estruturais (ex.: M&A, IFRS 16, variação cambial) podem elevar o índice sem irregularidade contábil.',
  };
}

export function analyzeEarningsQuality(
  assetType: AssetType,
  balanceSheets: BalanceSheetPeriod[],
  incomeStatements: IncomeStatementPeriod[],
  cashFlows: CashFlowPeriod[]
): EarningsQualityReport {
  const n = incomeStatements.length;
  if (n === 0 || balanceSheets.length === 0 || cashFlows.length === 0) {
    return {
      classification: 'Dados insuficientes',
      score: null,
      fcoToNetIncomeRatio: null,
      accrualsRatioPct: null,
      receivablesGrowthVsRevenuePct: null,
      inventoryGrowthVsRevenuePct: null,
      nonRecurringSharePct: null,
      intangiblesToAssetsPct: null,
      beneishMScore: computeBeneishMScore(assetType, undefined, undefined, undefined, undefined, undefined),
      signalsToInvestigate: ['Demonstrações financeiras incompletas para avaliação de qualidade dos lucros.'],
      positives: [],
      methodologyNote: 'Avalia conversão de lucro em caixa operacional, accruals sobre ativo médio, variação de capital de giro, itens não recorrentes e crescimento de intangíveis.',
    };
  }

  const dreCurr = incomeStatements[n - 1];
  const drePrev = n >= 2 ? incomeStatements[n - 2] : undefined;
  const bsCurr = balanceSheets[balanceSheets.length - 1];
  const bsPrev = balanceSheets.length >= 2 ? balanceSheets[balanceSheets.length - 2] : undefined;
  const dfcCurr = cashFlows[cashFlows.length - 1];

  const signalsToInvestigate: string[] = [];
  const positives: string[] = [];

  // 1. FCO / Lucro Líquido
  let fcoToNetIncomeRatio: number | null = null;
  if (isFiniteNumber(dfcCurr.fluxoCaixaOperacional) && isFiniteNumber(dreCurr.lucroLiquidoTotal)) {
    if (dreCurr.lucroLiquidoTotal > 0) {
      fcoToNetIncomeRatio = dfcCurr.fluxoCaixaOperacional / dreCurr.lucroLiquidoTotal;
      if (fcoToNetIncomeRatio >= 1.0) {
        positives.push(`Conversão de lucro em caixa operacional sólida (${(fcoToNetIncomeRatio * 100).toFixed(0)}%).`);
      } else if (fcoToNetIncomeRatio < 0.7) {
        signalsToInvestigate.push(
          `Caixa operacional representa apenas ${(fcoToNetIncomeRatio * 100).toFixed(1)}% do lucro líquido; verificar consumo de capital de giro ou receitas sem efeito caixa.`
        );
      }
    } else if (dfcCurr.fluxoCaixaOperacional < 0) {
      signalsToInvestigate.push('Lucro líquido negativo acompanhado de fluxo de caixa operacional negativo.');
    }
  }

  // 2. Accruals Ratio = (LL - FCO) / Ativo Médio
  let accrualsRatioPct: number | null = null;
  const avgAssets = averageTwo(bsPrev?.ativoTotal, bsCurr.ativoTotal);
  if (
    isFiniteNumber(dreCurr.lucroLiquidoTotal) &&
    isFiniteNumber(dfcCurr.fluxoCaixaOperacional) &&
    isFiniteNumber(avgAssets) &&
    avgAssets > 0
  ) {
    accrualsRatioPct = ((dreCurr.lucroLiquidoTotal - dfcCurr.fluxoCaixaOperacional) / avgAssets) * 100;
    if (accrualsRatioPct > 5) {
      signalsToInvestigate.push(
        `Accruals elevados (+${accrualsRatioPct.toFixed(1)}% do ativo médio): lucro contábil excede significativamente a geração operacional de caixa.`
      );
    } else if (accrualsRatioPct <= 0) {
      positives.push(`Accruals conservadores (${accrualsRatioPct.toFixed(1)}% do ativo médio), indicando lucro suportado por caixa.`);
    }
  }

  // 3. Contas a receber vs Receita
  let receivablesGrowthVsRevenuePct: number | null = null;
  if (
    assetType === 'stock' &&
    isFiniteNumber(bsCurr.contasReceber) &&
    isFiniteNumber(bsPrev?.contasReceber) &&
    bsPrev!.contasReceber > 0 &&
    isFiniteNumber(dreCurr.receitaLiquida) &&
    isFiniteNumber(drePrev?.receitaLiquida) &&
    drePrev!.receitaLiquida > 0
  ) {
    const recGrowth = (bsCurr.contasReceber - bsPrev!.contasReceber) / bsPrev!.contasReceber;
    const revGrowth = (dreCurr.receitaLiquida - drePrev!.receitaLiquida) / drePrev!.receitaLiquida;
    receivablesGrowthVsRevenuePct = (recGrowth - revGrowth) * 100;
    if (receivablesGrowthVsRevenuePct > 12) {
      signalsToInvestigate.push(
        `Contas a receber cresceram ${receivablesGrowthVsRevenuePct.toFixed(1)} p.p. acima da receita líquida; investigar relaxamento de crédito ou risco de PDD.`
      );
    }
  }

  // 4. Estoques vs Receita
  let inventoryGrowthVsRevenuePct: number | null = null;
  if (
    assetType === 'stock' &&
    isFiniteNumber(bsCurr.estoques) &&
    isFiniteNumber(bsPrev?.estoques) &&
    bsPrev!.estoques > 0 &&
    isFiniteNumber(dreCurr.receitaLiquida) &&
    isFiniteNumber(drePrev?.receitaLiquida) &&
    drePrev!.receitaLiquida > 0
  ) {
    const invGrowth = (bsCurr.estoques - bsPrev!.estoques) / bsPrev!.estoques;
    const revGrowth = (dreCurr.receitaLiquida - drePrev!.receitaLiquida) / drePrev!.receitaLiquida;
    inventoryGrowthVsRevenuePct = (invGrowth - revGrowth) * 100;
    if (inventoryGrowthVsRevenuePct > 15) {
      signalsToInvestigate.push(
        `Estoques avançaram ${inventoryGrowthVsRevenuePct.toFixed(1)} p.p. acima das vendas; risco de obsolescência ou menor giro.`
      );
    }
  }

  // 5. Resultados não recorrentes
  let nonRecurringSharePct: number | null = null;
  if (isFiniteNumber(dreCurr.resultadosNaoRecorrentes) && isFiniteNumber(dreCurr.lucroLiquidoTotal) && Math.abs(dreCurr.lucroLiquidoTotal) > 1e-6) {
    nonRecurringSharePct = (Math.abs(dreCurr.resultadosNaoRecorrentes) / Math.abs(dreCurr.lucroLiquidoTotal)) * 100;
    if (nonRecurringSharePct > 20) {
      signalsToInvestigate.push(
        `Itens não recorrentes representam ${nonRecurringSharePct.toFixed(1)}% do lucro líquido; exige normalização para valuation.`
      );
    }
  }

  // 6. Intangíveis + ágio / Ativo total
  let intangiblesToAssetsPct: number | null = null;
  const intang = safeDivide((bsCurr.intangivel ?? 0) + (bsCurr.agio ?? 0), bsCurr.ativoTotal);
  if (intang.value !== null) {
    intangiblesToAssetsPct = intang.value * 100;
    if (intangiblesToAssetsPct > 35 && assetType === 'stock') {
      signalsToInvestigate.push(
        `Intangível/Ágio equivale a ${intangiblesToAssetsPct.toFixed(1)}% do ativo total; acompanhar risco de impairment em aquisições.`
      );
    }
  }

  const beneishMScore = computeBeneishMScore(assetType, bsPrev, bsCurr, drePrev, dreCurr, dfcCurr);
  if (beneishMScore.calculable && beneishMScore.score !== null && beneishMScore.score > -1.78) {
    signalsToInvestigate.push(
      `Beneish M-Score (${beneishMScore.score.toFixed(2)}) acima de -1,78 sugere investigar variações de accruals e recebíveis em notas explicativas.`
    );
  }

  // Deterministic score calculation based only on available checks
  let points = 0;
  let maxPoints = 0;

  if (fcoToNetIncomeRatio !== null) {
    maxPoints += 35;
    if (fcoToNetIncomeRatio >= 1.0) points += 35;
    else if (fcoToNetIncomeRatio >= 0.8) points += 28;
    else if (fcoToNetIncomeRatio >= 0.6) points += 18;
    else if (fcoToNetIncomeRatio >= 0.3) points += 8;
  } else if (assetType === 'fii') {
    maxPoints += 35;
    points += 28; // FIIs distribute cash FFO directly
  }

  if (accrualsRatioPct !== null) {
    maxPoints += 25;
    if (accrualsRatioPct <= 0) points += 25;
    else if (accrualsRatioPct <= 3) points += 20;
    else if (accrualsRatioPct <= 6) points += 12;
    else points += 4;
  }

  if (nonRecurringSharePct !== null) {
    maxPoints += 20;
    if (nonRecurringSharePct <= 5) points += 20;
    else if (nonRecurringSharePct <= 15) points += 14;
    else if (nonRecurringSharePct <= 30) points += 8;
    else points += 2;
  }

  if (receivablesGrowthVsRevenuePct !== null || assetType !== 'stock') {
    maxPoints += 20;
    if (receivablesGrowthVsRevenuePct === null || receivablesGrowthVsRevenuePct <= 5) points += 20;
    else if (receivablesGrowthVsRevenuePct <= 12) points += 13;
    else points += 5;
  }

  const score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : null;
  let classification: EarningsQualityReport['classification'] = 'Dados insuficientes';
  if (score !== null) {
    if (score >= 85) classification = 'Excelente';
    else if (score >= 70) classification = 'Boa';
    else if (score >= 52) classification = 'Regular';
    else if (score >= 35) classification = 'Fraca';
    else classification = 'Crítica';
  }

  return {
    classification,
    score,
    fcoToNetIncomeRatio,
    accrualsRatioPct,
    receivablesGrowthVsRevenuePct,
    inventoryGrowthVsRevenuePct,
    nonRecurringSharePct,
    intangiblesToAssetsPct,
    beneishMScore,
    signalsToInvestigate,
    positives,
    methodologyNote:
      'Diagnóstico baseado em conversão FCO/Lucro Líquido, accruals sobre ativo médio, evolução de recebíveis/estoques, peso de não recorrentes e Beneish M-Score quando integralmente calculável.',
  };
}
