import { isFiniteNumber } from '../financial/mathUtils.ts';
import { IntegratedAssetAnalysis } from './integratedEngine.ts';

export interface ComparisonPillarVerdict {
  pillar: 'Financeiro' | 'Qualitativo' | 'Valuation';
  winnerTicker: string;
  loserTicker: string;
  winnerScore: number;
  loserScore: number;
  isTie: boolean;
  why: string;
  directImpact: string;
}

export interface ComparisonVerdict {
  ranked: IntegratedAssetAnalysis[];
  best: IntegratedAssetAnalysis;
  runnerUp: IntegratedAssetAnalysis;
  hasIncompatibleTypes: boolean;
  isSplitDecision: boolean;
  headline: string;
  overallWhy: string;
  whenChooseRunnerUp: string;
  pillarVerdicts: ComparisonPillarVerdict[];
  metricWinners: Record<string, string | null>;
}

function pickHigherTicker(
  items: IntegratedAssetAnalysis[],
  getter: (a: IntegratedAssetAnalysis) => number | null | undefined
): string | null {
  const valid = items
    .map((a) => ({ ticker: a.asset.ticker, val: getter(a) }))
    .filter((x): x is { ticker: string; val: number } => isFiniteNumber(x.val));
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => b.val - a.val);
  if (Math.abs(sorted[0].val - sorted[1].val) < 1e-6) return null;
  return sorted[0].ticker;
}

function pickLowerTicker(
  items: IntegratedAssetAnalysis[],
  getter: (a: IntegratedAssetAnalysis) => number | null | undefined,
  requirePositive = false
): string | null {
  const valid = items
    .map((a) => ({ ticker: a.asset.ticker, val: getter(a) }))
    .filter(
      (x): x is { ticker: string; val: number } =>
        isFiniteNumber(x.val) && (!requirePositive || x.val > 0)
    );
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => a.val - b.val);
  if (Math.abs(sorted[0].val - sorted[1].val) < 1e-6) return null;
  return sorted[0].ticker;
}

function formatMetricDiff(
  a: number | null | undefined,
  b: number | null | undefined,
  suffix: string
): string {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return '';
  const diff = a - b;
  return `${a.toFixed(1)}${suffix} vs ${b.toFixed(1)}${suffix} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)} ${suffix === '%' ? 'p.p.' : suffix})`;
}

export function compareAssets(chosen: IntegratedAssetAnalysis[]): ComparisonVerdict | null {
  if (chosen.length < 2) return null;

  const assetTypes = new Set(chosen.map((c) => c.asset.assetType));
  const hasIncompatibleTypes = assetTypes.size > 1;

  // Deterministic ranking: overallScore -> marginOfSafety -> financial score -> fewer critical/high alerts
  const ranked = [...chosen].sort((a, b) => {
    if (b.scores.overallScore !== a.scores.overallScore) {
      return b.scores.overallScore - a.scores.overallScore;
    }
    if (Math.abs(b.valuation.marginOfSafetyPct - a.valuation.marginOfSafetyPct) > 0.5) {
      return b.valuation.marginOfSafetyPct - a.valuation.marginOfSafetyPct;
    }
    if (b.scores.financial.pillarScore !== a.scores.financial.pillarScore) {
      return b.scores.financial.pillarScore - a.scores.financial.pillarScore;
    }
    const aCrit = a.alerts.filter((al) => al.severity === 'critico' || al.severity === 'alto_risco').length;
    const bCrit = b.alerts.filter((al) => al.severity === 'critico' || al.severity === 'alto_risco').length;
    return aCrit - bCrit;
  });

  const best = ranked[0];
  const runnerUp = ranked[1];
  const scoreDiff = best.scores.overallScore - runnerUp.scores.overallScore;

  // Pillar verdicts between best vs runnerUp (always highlights the top-2 duel clearly)
  const finBestFirst = best.scores.financial.pillarScore >= runnerUp.scores.financial.pillarScore;
  const finWin = finBestFirst ? best : runnerUp;
  const finLose = finBestFirst ? runnerUp : best;

  const qualBestFirst = best.scores.qualitative.pillarScore >= runnerUp.scores.qualitative.pillarScore;
  const qualWin = qualBestFirst ? best : runnerUp;
  const qualLose = qualBestFirst ? runnerUp : best;

  const valBestFirst = best.scores.valuation.pillarScore >= runnerUp.scores.valuation.pillarScore;
  const valWin = valBestFirst ? best : runnerUp;
  const valLose = valBestFirst ? runnerUp : best;

  // Build Financial Why
  const finReasons: string[] = [];
  const winRoe = finWin.financial.indicators.roe?.value;
  const loseRoe = finLose.financial.indicators.roe?.value;
  if (isFiniteNumber(winRoe) && isFiniteNumber(loseRoe) && Math.abs(winRoe - loseRoe) >= 1) {
    finReasons.push(`ROE de ${formatMetricDiff(winRoe, loseRoe, '%')}`);
  }
  const winRoic = finWin.financial.indicators.roic?.value;
  const loseRoic = finLose.financial.indicators.roic?.value;
  if (
    finWin.financial.indicators.roic?.status !== 'not_applicable' &&
    finLose.financial.indicators.roic?.status !== 'not_applicable' &&
    isFiniteNumber(winRoic) &&
    isFiniteNumber(loseRoic)
  ) {
    finReasons.push(`ROIC de ${formatMetricDiff(winRoic, loseRoic, '%')}`);
  }
  const winDebt = finWin.financial.indicators.divida_liquida_ebitda?.value;
  const loseDebt = finLose.financial.indicators.divida_liquida_ebitda?.value;
  if (
    finWin.financial.indicators.divida_liquida_ebitda?.status !== 'not_applicable' &&
    finLose.financial.indicators.divida_liquida_ebitda?.status !== 'not_applicable' &&
    isFiniteNumber(winDebt) &&
    isFiniteNumber(loseDebt)
  ) {
    finReasons.push(
      `Dív. Líq./EBITDA de ${winDebt.toFixed(2)}x vs ${loseDebt.toFixed(2)}x`
    );
  }
  const finWhy =
    finWin.scores.financial.pillarScore === finLose.scores.financial.pillarScore
      ? `Empate técnico no Pilar Financeiro (${finWin.scores.financial.pillarScore}/100).`
      : `${finWin.asset.ticker} vence por +${finWin.scores.financial.pillarScore - finLose.scores.financial.pillarScore} pts (${finWin.scores.financial.pillarScore} vs ${finLose.scores.financial.pillarScore})${
          finReasons.length > 0 ? `, sustentado por ${finReasons.join(', ')}` : ''
        }.`;

  // Build Qualitative Why
  const qualWhy =
    qualWin.scores.qualitative.pillarScore === qualLose.scores.qualitative.pillarScore
      ? `Empate técnico no Pilar Qualitativo (${qualWin.scores.qualitative.pillarScore}/100).`
      : `${qualWin.asset.ticker} lidera por +${qualWin.scores.qualitative.pillarScore - qualLose.scores.qualitative.pillarScore} pts (${qualWin.scores.qualitative.pillarScore} vs ${qualLose.scores.qualitative.pillarScore}), com Moat "${qualWin.qualitative.moatStrengthOverall.replace(/_/g, ' ')}" vs "${qualLose.qualitative.moatStrengthOverall.replace(/_/g, ' ')}" e spread de risco qualitativo de ${qualWin.qualitative.qualitativeRiskSpreadBps >= 0 ? '+' : ''}${qualWin.qualitative.qualitativeRiskSpreadBps} bps vs ${qualLose.qualitative.qualitativeRiskSpreadBps >= 0 ? '+' : ''}${qualLose.qualitative.qualitativeRiskSpreadBps} bps.`;

  // Build Valuation Why
  const valWhy =
    valWin.scores.valuation.pillarScore === valLose.scores.valuation.pillarScore
      ? `Empate técnico no Pilar Valuation (${valWin.scores.valuation.pillarScore}/100).`
      : `${valWin.asset.ticker} oferece melhor atratividade relativa (+${valWin.scores.valuation.pillarScore - valLose.scores.valuation.pillarScore} pts: ${valWin.scores.valuation.pillarScore} vs ${valLose.scores.valuation.pillarScore}), com Margem de Segurança de ${valWin.valuation.marginOfSafetyPct.toFixed(1)}% (upside ${valWin.valuation.upsidePct >= 0 ? '+' : ''}${valWin.valuation.upsidePct.toFixed(1)}%) frente a ${valLose.valuation.marginOfSafetyPct.toFixed(1)}% (upside ${valLose.valuation.upsidePct >= 0 ? '+' : ''}${valLose.valuation.upsidePct.toFixed(1)}%) em ${valLose.asset.ticker}.`;

  const pillarVerdicts: ComparisonPillarVerdict[] = [
    {
      pillar: 'Financeiro',
      winnerTicker: finWin.asset.ticker,
      loserTicker: finLose.asset.ticker,
      winnerScore: finWin.scores.financial.pillarScore,
      loserScore: finLose.scores.financial.pillarScore,
      isTie: finWin.scores.financial.pillarScore === finLose.scores.financial.pillarScore,
      why: finWhy,
      directImpact:
        'Impacta diretamente a resiliência a juros altos, capacidade de autofinanciamento e confiabilidade dos lucros projetados no DCF.',
    },
    {
      pillar: 'Qualitativo',
      winnerTicker: qualWin.asset.ticker,
      loserTicker: qualLose.asset.ticker,
      winnerScore: qualWin.scores.qualitative.pillarScore,
      loserScore: qualLose.scores.qualitative.pillarScore,
      isTie: qualWin.scores.qualitative.pillarScore === qualLose.scores.qualitative.pillarScore,
      why: qualWhy,
      directImpact:
        'Altera diretamente o custo de capital (Ke/WACC via spread em bps) e o fator de sustentabilidade do crescimento no valuation.',
    },
    {
      pillar: 'Valuation',
      winnerTicker: valWin.asset.ticker,
      loserTicker: valLose.asset.ticker,
      winnerScore: valWin.scores.valuation.pillarScore,
      loserScore: valLose.scores.valuation.pillarScore,
      isTie: valWin.scores.valuation.pillarScore === valLose.scores.valuation.pillarScore,
      why: valWhy,
      directImpact:
        'Define o potencial de valorização implícito no preço de tela hoje e o colchão de proteção contra erros de estimativa.',
    },
  ];

  // Overall headline and why
  const qualityBest =
    best.scores.financial.pillarScore + best.scores.qualitative.pillarScore;
  const qualityRunner =
    runnerUp.scores.financial.pillarScore + runnerUp.scores.qualitative.pillarScore;
  const isSplitDecision =
    (qualityBest > qualityRunner &&
      runnerUp.scores.valuation.pillarScore > best.scores.valuation.pillarScore) ||
    (qualityRunner > qualityBest &&
      best.scores.valuation.pillarScore > runnerUp.scores.valuation.pillarScore);

  const pillarsWonByBest = pillarVerdicts
    .filter((pv) => !pv.isTie && pv.winnerTicker === best.asset.ticker)
    .map((pv) => pv.pillar);

  const headline =
    chosen.length === 2
      ? scoreDiff === 0
        ? `Empate Técnico no Score Geral (${best.scores.overallScore}/100) — Vantagem de desempate para ${best.asset.ticker}`
        : `Melhor entre os dois: ${best.asset.ticker} supera ${runnerUp.asset.ticker} (+${scoreDiff} pts no Score Geral)`
      : `Melhor no Ranking (${chosen.length} ativos): ${best.asset.ticker} (${best.scores.overallScore}/100 vs ${runnerUp.asset.ticker} ${runnerUp.scores.overallScore}/100)`;

  const overallWhyParts: string[] = [];
  if (pillarsWonByBest.length === 3) {
    overallWhyParts.push(
      `${best.asset.ticker} domina os 3 pilares da análise (${pillarsWonByBest.join(', ')}), entregando melhor equilíbrio entre qualidade fundamentalista e retorno ajustado ao risco.`
    );
  } else if (pillarsWonByBest.length > 0) {
    overallWhyParts.push(
      `${best.asset.ticker} conquista a melhor nota integrada (${best.scores.overallScore} vs ${runnerUp.scores.overallScore}) por vencer em ${pillarsWonByBest.join(' e ')}.`
    );
  } else {
    overallWhyParts.push(
      `${best.asset.ticker} e ${runnerUp.asset.ticker} empatam no score geral (${best.scores.overallScore}/100), com desempate favorável a ${best.asset.ticker} pela combinação de Margem de Segurança (${best.valuation.marginOfSafetyPct.toFixed(1)}% vs ${runnerUp.valuation.marginOfSafetyPct.toFixed(1)}%) e solidez financeira.`
    );
  }

  if (isSplitDecision) {
    if (best.scores.valuation.pillarScore < runnerUp.scores.valuation.pillarScore) {
      overallWhyParts.push(
        `Há um trade-off claro: ${best.asset.ticker} é superior em fundamentos/qualidade, enquanto ${runnerUp.asset.ticker} está mais descontado no preço hoje (MoS ${runnerUp.valuation.marginOfSafetyPct.toFixed(1)}% vs ${best.valuation.marginOfSafetyPct.toFixed(1)}%).`
      );
    } else {
      overallWhyParts.push(
        `Há um trade-off claro: ${best.asset.ticker} vence pela maior atratividade de preço (MoS ${best.valuation.marginOfSafetyPct.toFixed(1)}%), mas ${runnerUp.asset.ticker} possui qualidade fundamentalista superior.`
      );
    }
  }

  if (hasIncompatibleTypes) {
    overallWhyParts.push(
      `Ressalva metodológica: como os ativos pertencem a modelos contábeis diferentes (${Array.from(assetTypes).join(' vs ')}), a comparação prioriza os scores normalizados por setor em vez de múltiplos brutos.`
    );
  }

  // Honest counterpoint: when to choose runnerUp
  const runnerAdvantages: string[] = [];
  if (runnerUp.valuation.marginOfSafetyPct > best.valuation.marginOfSafetyPct + 1) {
    runnerAdvantages.push(
      `maior Margem de Segurança (${runnerUp.valuation.marginOfSafetyPct.toFixed(1)}% vs ${best.valuation.marginOfSafetyPct.toFixed(1)}%)`
    );
  }
  const runDy = runnerUp.financial.indicators.dividend_yield?.value;
  const bestDy = best.financial.indicators.dividend_yield?.value;
  if (isFiniteNumber(runDy) && isFiniteNumber(bestDy) && runDy > bestDy + 0.5) {
    runnerAdvantages.push(`maior Dividend Yield (${runDy.toFixed(1)}% vs ${bestDy.toFixed(1)}%)`);
  }
  if (runnerUp.scores.financial.pillarScore > best.scores.financial.pillarScore) {
    runnerAdvantages.push(
      `melhor Pilar Financeiro (${runnerUp.scores.financial.pillarScore} vs ${best.scores.financial.pillarScore})`
    );
  }
  if (runnerUp.scores.qualitative.pillarScore > best.scores.qualitative.pillarScore) {
    runnerAdvantages.push(
      `melhor Pilar Qualitativo (${runnerUp.scores.qualitative.pillarScore} vs ${best.scores.qualitative.pillarScore})`
    );
  }
  const runAlerts = runnerUp.alerts.filter((a) => a.severity === 'critico' || a.severity === 'alto_risco').length;
  const bestAlerts = best.alerts.filter((a) => a.severity === 'critico' || a.severity === 'alto_risco').length;
  if (runAlerts < bestAlerts) {
    runnerAdvantages.push(`menos alertas críticos/altos (${runAlerts} vs ${bestAlerts})`);
  }

  const whenChooseRunnerUp =
    runnerAdvantages.length > 0
      ? `Quando considerar ${runnerUp.asset.ticker}: se o mandato da carteira priorizar ${runnerAdvantages.join(', ')}.`
      : `${best.asset.ticker} não apenas vence no consolidado, como também iguala ou supera ${runnerUp.asset.ticker} na maioria das métricas individuais avaliadas.`;

  const metricWinners: Record<string, string | null> = {
    mos: pickHigherTicker(chosen, (a) => a.valuation.marginOfSafetyPct),
    overall: pickHigherTicker(chosen, (a) => a.scores.overallScore),
    fin: pickHigherTicker(chosen, (a) => a.scores.financial.pillarScore),
    qual: pickHigherTicker(chosen, (a) => a.scores.qualitative.pillarScore),
    val: pickHigherTicker(chosen, (a) => a.scores.valuation.pillarScore),
    roe: pickHigherTicker(chosen, (a) => a.financial.indicators.roe?.value),
    roic: hasIncompatibleTypes
      ? null
      : pickHigherTicker(chosen, (a) =>
          a.financial.indicators.roic?.status === 'not_applicable'
            ? null
            : a.financial.indicators.roic?.value
        ),
    dl_ebitda: hasIncompatibleTypes
      ? null
      : pickLowerTicker(
          chosen,
          (a) =>
            a.financial.indicators.divida_liquida_ebitda?.status === 'not_applicable'
              ? null
              : a.financial.indicators.divida_liquida_ebitda?.value,
          false
        ),
    pl: pickLowerTicker(chosen, (a) => a.financial.indicators.pl?.value, true),
    pvp: pickLowerTicker(chosen, (a) => a.financial.indicators.pvp?.value, true),
    dy: pickHigherTicker(chosen, (a) => a.financial.indicators.dividend_yield?.value),
  };

  return {
    ranked,
    best,
    runnerUp,
    hasIncompatibleTypes,
    isSplitDecision,
    headline,
    overallWhy: overallWhyParts.join(' '),
    whenChooseRunnerUp,
    pillarVerdicts,
    metricWinners,
  };
}
