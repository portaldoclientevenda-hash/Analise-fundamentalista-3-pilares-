import { isFiniteNumber } from '../financial/mathUtils.ts';
import { IndicatorDiagnostic } from '../types.ts';
import { IntegratedAssetAnalysis, PillarScoreBreakdown } from './integratedEngine.ts';

export interface CausalDriverItem {
  label: string;
  weight: number;
  score: number | null;
  status: 'scored' | 'not_applicable' | 'unavailable';
  why: string;
  directInfluence: string;
  polarity: 'positivo' | 'neutro' | 'negativo' | 'na';
}

export interface PillarCausalExplanation {
  pillarId: 'financial' | 'qualitative' | 'valuation';
  title: string;
  score: number;
  weightInOverallPct: number;
  pointsContributed: number;
  whySummary: string;
  directImpactSummary: string;
  drivers: CausalDriverItem[];
}

export interface CrossPillarCausalFlow {
  overallScore: number;
  overallVerdict: string;
  p1ToP2AndP3: string;
  p2ToP3: string;
  p3ToDecision: string;
  pillars: PillarCausalExplanation[];
}

function classifyPolarity(score: number | null, status: string): CausalDriverItem['polarity'] {
  if (status !== 'scored' || score === null) return 'na';
  if (score >= 70) return 'positivo';
  if (score >= 52) return 'neutro';
  return 'negativo';
}

function getDirectInfluenceForComponent(
  pillarId: 'financial' | 'qualitative' | 'valuation',
  label: string,
  score: number | null,
  status: string,
  analysis: IntegratedAssetAnalysis
): string {
  if (status === 'not_applicable') {
    return 'Excluído do denominador desta nota para não distorcer a avaliação de setores com contabilidade própria (bancos/seguradoras/FIIs).';
  }
  if (status === 'unavailable' || score === null) {
    return 'Peso redistribuído entre os demais subitens disponíveis; reduz a cobertura informacional do pilar.';
  }

  const lower = label.toLowerCase();
  if (pillarId === 'financial') {
    if (lower.includes('liquidez')) {
      return score >= 70
        ? 'Reduz o risco de aperto de caixa no curto prazo e sustenta menor prêmio de risco no custo de capital.'
        : 'Pressiona a necessidade de capital de giro ou refinanciamento de curto prazo, exigindo maior margem de segurança.';
    }
    if (lower.includes('endividamento') || lower.includes('solvência')) {
      return `Afeta diretamente a diferença entre EV e Market Cap (Dívida Líquida) e o peso do custo de dívida (Kd) no WACC (${analysis.valuation.waccPct.toFixed(2)}%).`;
    }
    if (lower.includes('rentabilidade')) {
      const roic = analysis.financial.indicators.roic?.value;
      if (isFiniteNumber(roic)) {
        const spread = roic - analysis.valuation.waccPct;
        return spread >= 0
          ? `ROIC acima do WACC (+${spread.toFixed(1)} p.p.) significa que cada real reinvestido cria valor econômico e eleva também o sub-score de Alocação de Capital no Pilar 2.`
          : `ROIC abaixo do WACC (${spread.toFixed(1)} p.p.) penaliza a criação de valor no crescimento e puxa para baixo a Alocação de Capital no Pilar 2.`;
      }
      return 'Define o retorno sobre o patrimônio dos acionistas e ancora a capacidade orgânica de autofinanciar crescimento ou dividendos.';
    }
    if (lower.includes('eficiência')) {
      return 'Determina quanto da receita vira resultado operacional; impacta diretamente a margem EBIT projetada no DCF e no FCFF.';
    }
    if (lower.includes('crescimento')) {
      return 'Serve de referência histórica para o CAGR de receita do DCF, sendo multiplicado pelo fator qualitativo de sustentabilidade.';
    }
    if (lower.includes('geração de caixa')) {
      return 'Mede o FCFF real após CAPEX e giro; quanto maior a conversão de lucro em caixa, maior o valor presente do fluxo descontado.';
    }
    if (lower.includes('qualidade dos lucros')) {
      const weak =
        analysis.financial.earningsQuality.classification === 'Fraca' ||
        analysis.financial.earningsQuality.classification === 'Crítica';
      return weak
        ? 'Como a qualidade dos lucros está pressionada, o motor trava a nota de Margem de Segurança em no máximo 62/100 no Pilar 3 para evitar "value traps".'
        : 'Alta conversão FCO/Lucro valida os lucros contábeis usados no P/L e dá confiabilidade às projeções de DCF.';
    }
  }

  if (pillarId === 'qualitative') {
    if (lower.includes('modelo')) {
      return 'Recorrência, previsibilidade de demanda e barreiras de entrada determinam a estabilidade dos fluxos futuros do DCF.';
    }
    if (lower.includes('vantagens') || lower.includes('moat')) {
      return `Moat "${analysis.qualitative.moatStrengthOverall.replace(/_/g, ' ')}" influencia diretamente o fator de sustentabilidade de crescimento (${analysis.qualitative.growthSustainabilityFactor.toFixed(2)}x) e o spread de risco no CAPM.`;
    }
    if (lower.includes('gestão')) {
      return 'Execução consistente reduz o risco de desvios entre o cenário base projetado e o resultado entregue.';
    }
    if (lower.includes('governança')) {
      return 'Governança fraca adiciona até +120 bps no spread de risco do Ke/WACC, enquanto governança sólida com moat reduz o custo de capital (-40 bps).';
    }
    if (lower.includes('alocação')) {
      return 'Conecta o discurso da diretoria ao ROIC empírico vs WACC; má alocação destrói valor mesmo em negócios com boas margens.';
    }
    if (lower.includes('mercado') || lower.includes('porter')) {
      return 'Intensidade competitiva dita se as margens atuais são defensáveis ou tendem a comprimir no longo prazo.';
    }
    if (lower.includes('riscos')) {
      return 'A presença de 3 ou mais riscos qualitativos altos/críticos adiciona +100 bps ao custo de capital (Ke/WACC), reduzindo o Valor Justo.';
    }
  }

  // Valuation components
  if (lower.includes('adequação')) {
    return 'Garante que o preço justo seja calculado apenas por métodos válidos para a contabilidade do setor (ex.: DDM/Residual Income para bancos; FFO/NAV para FIIs).';
  }
  if (lower.includes('potencial')) {
    return `Mede diretamente a distância percentual entre o Valor Justo (R$ ${analysis.valuation.reconciledFairValue.toFixed(2)}) e a cotação atual (R$ ${analysis.valuation.currentPrice.toFixed(2)}).`;
  }
  if (lower.includes('margem de segurança')) {
    return 'Principal filtro de proteção contra erros de estimativa; exige desconto mínimo configurado antes de considerar o ativo atrativo.';
  }
  if (lower.includes('sustentabilidade')) {
    return 'Verifica se o preço atual não depende de crescimento perpétuo excessivo (Valor Terminal > 75%) ou expectativas irreais no Reverse DCF.';
  }
  if (lower.includes('sensibilidade')) {
    return 'Traduz o quanto o valor justo oscila caso Selic/WACC subam ou a margem EBIT recue nas matrizes 2D.';
  }
  return 'Mede se DCF, FCFE, DDM e Múltiplos apontam na mesma direção ou divergem fortemente entre si.';
}

function buildPillarExplanation(
  pillarId: 'financial' | 'qualitative' | 'valuation',
  title: string,
  breakdown: PillarScoreBreakdown,
  weightPct: number,
  analysis: IntegratedAssetAnalysis
): PillarCausalExplanation {
  const scored = breakdown.components.filter((c) => c.status === 'scored' && c.score !== null);
  const sortedDesc = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topDriver = sortedDesc[0];
  const dragDriver = sortedDesc[sortedDesc.length - 1];

  let whySummary = `Nota ${breakdown.pillarScore}/100 calculada com ${breakdown.dataCoveragePct}% de cobertura de dados.`;
  if (topDriver && dragDriver && topDriver.label !== dragDriver.label) {
    whySummary = `Nota ${breakdown.pillarScore}/100 puxada positivamente por ${topDriver.label} (${topDriver.score}/100, peso ${topDriver.weight}%) e pressionada por ${dragDriver.label} (${dragDriver.score}/100, peso ${dragDriver.weight}%).`;
  } else if (topDriver) {
    whySummary = `Nota ${breakdown.pillarScore}/100 ancorada principalmente em ${topDriver.label} (${topDriver.score}/100).`;
  }

  let directImpactSummary = '';
  const pointsContributed = Number(((breakdown.pillarScore * weightPct) / 100).toFixed(1));
  if (pillarId === 'financial') {
    directImpactSummary = `Contribui com ${pointsContributed} pontos para a Nota Geral (peso ${weightPct}%) e alimenta diretamente o Pilar 2 (ROIC vs WACC) e o Pilar 3 (FCFF, Dívida Líquida e trava de qualidade de lucros).`;
  } else if (pillarId === 'qualitative') {
    const spreadBps = analysis.qualitative.qualitativeRiskSpreadBps;
    const gFactor = analysis.qualitative.growthSustainabilityFactor;
    directImpactSummary = `Contribui com ${pointsContributed} pontos para a Nota Geral (peso ${weightPct}%) e ajusta diretamente o Valuation via spread de ${spreadBps >= 0 ? '+' : ''}${spreadBps} bps no Ke/WACC e fator de ${gFactor.toFixed(2)}x no crescimento projetado.`;
  } else {
    directImpactSummary = `Contribui com ${pointsContributed} pontos para a Nota Geral (peso ${weightPct}%) e define a atratividade de preço: Valor Justo R$ ${analysis.valuation.reconciledFairValue.toFixed(2)} vs Cotação R$ ${analysis.valuation.currentPrice.toFixed(2)} (MoS ${analysis.valuation.marginOfSafetyPct.toFixed(1)}%).`;
  }

  return {
    pillarId,
    title,
    score: breakdown.pillarScore,
    weightInOverallPct: weightPct,
    pointsContributed,
    whySummary,
    directImpactSummary,
    drivers: breakdown.components.map((c) => ({
      label: c.label,
      weight: c.weight,
      score: c.score,
      status: c.status,
      why: c.rationale,
      directInfluence: getDirectInfluenceForComponent(pillarId, c.label, c.score, c.status, analysis),
      polarity: classifyPolarity(c.score, c.status),
    })),
  };
}

export function buildCrossPillarCausalFlow(
  analysis: IntegratedAssetAnalysis
): CrossPillarCausalFlow {
  const w = analysis.scores.weightsUsed.overall;
  const wSum = Math.max(0.01, w.financialWeight + w.qualitativeWeight + w.valuationWeight);
  const finPct = Math.round((w.financialWeight / wSum) * 100);
  const qualPct = Math.round((w.qualitativeWeight / wSum) * 100);
  const valPct = Math.round((w.valuationWeight / wSum) * 100);

  const finScore = analysis.scores.financial.pillarScore;
  const qualScore = analysis.scores.qualitative.pillarScore;
  const valScore = analysis.scores.valuation.pillarScore;
  const overall = analysis.scores.overallScore;

  const roic = analysis.financial.indicators.roic?.value;
  const roe = analysis.financial.indicators.roe?.value;
  const dlEbitda = analysis.financial.indicators.divida_liquida_ebitda?.value;
  const eqClass = analysis.financial.earningsQuality.classification;

  const returnMetricText = isFiniteNumber(roic)
    ? `ROIC de ${roic.toFixed(1)}% frente ao WACC de ${analysis.valuation.waccPct.toFixed(2)}% (spread ${roic - analysis.valuation.waccPct >= 0 ? '+' : ''}${(roic - analysis.valuation.waccPct).toFixed(1)} p.p.)`
    : isFiniteNumber(roe)
      ? `ROE de ${roe.toFixed(1)}% frente ao Ke de ${analysis.valuation.kePct.toFixed(2)}%`
      : 'retorno histórico limitado pela base contábil';

  const debtText =
    analysis.financial.indicators.divida_liquida_ebitda?.status === 'not_applicable'
      ? 'estrutura de capital regulatória avaliada fora do múltiplo Dívida/EBITDA'
      : isFiniteNumber(dlEbitda)
        ? dlEbitda < 0
          ? `caixa líquido (${dlEbitda.toFixed(2)}x EBITDA), o que reduz o EV e elimina risco financeiro`
          : `alavancagem de ${dlEbitda.toFixed(2)}x EBITDA`
        : 'alavancagem sem dado completo de EBITDA positivo';

  const p1ToP2AndP3 = `O Pilar Financeiro (${finScore}/100) registra ${returnMetricText}, ${debtText} e qualidade dos lucros "${eqClass}". Isso influencia diretamente a nota de Alocação de Capital no Pilar 2 e define a base de caixa (FCFF/dividendos) e o risco de crédito que entram no Valuation.`;

  const spreadBps = analysis.qualitative.qualitativeRiskSpreadBps;
  const gFactor = analysis.qualitative.growthSustainabilityFactor;
  const spreadLabel =
    spreadBps < 0
      ? `reduz o custo de capital (Ke/WACC) em ${Math.abs(spreadBps)} bps pela solidez de moat e governança`
      : spreadBps > 0
        ? `eleva o custo de capital (Ke/WACC) em +${spreadBps} bps por lacunas de governança ou riscos críticos`
        : 'mantém o custo de capital neutro (0 bps de spread qualitativo)';

  const p2ToP3 = `O Pilar Qualitativo (${qualScore}/100), com Moat "${analysis.qualitative.moatStrengthOverall.replace(/_/g, ' ')}", ${spreadLabel} e aplica fator de ${gFactor.toFixed(2)}x sobre o ritmo de crescimento projetado no DCF.`;

  const mos = analysis.valuation.marginOfSafetyPct;
  const minMos = analysis.valuation.assumptionsUsed.desiredMarginOfSafetyPct;
  const p3ToDecision = `No Pilar Valuation (${valScore}/100), o desconto a WACC de ${analysis.valuation.waccPct.toFixed(2)}% e Ke de ${analysis.valuation.kePct.toFixed(2)}% resulta em Valor Justo de R$ ${analysis.valuation.reconciledFairValue.toFixed(2)} contra cotação de R$ ${analysis.valuation.currentPrice.toFixed(2)}. Isso gera Margem de Segurança de ${mos.toFixed(1)}% (${mos >= minMos ? `acima do mínimo de ${minMos}%` : `abaixo do mínimo configurado de ${minMos}%`}).`;

  let overallVerdict = '';
  if (overall >= 75 && analysis.valuation.meetsDesiredMarginOfSafety) {
    overallVerdict = `Pontuação integrada forte (${overall}/100): combina execução operacional sólida, vantagens competitivas comprovadas e margem de segurança suficiente.`;
  } else if (finScore >= 70 && qualScore >= 70 && !analysis.valuation.meetsDesiredMarginOfSafety) {
    overallVerdict = `Pontuação integrada ${overall}/100 reflete negócio de alta qualidade (Fin ${finScore} / Qual ${qualScore}), porém contido pelo Pilar Valuation (${valScore}/100) devido ao preço atual já descontar boa parte dos fundamentos.`;
  } else if (finScore < 55) {
    overallVerdict = `Pontuação integrada ${overall}/100 penalizada pelo Pilar Financeiro (${finScore}/100): fragilidade operacional, alavancagem ou qualidade de lucros pressionam o risco da tese mesmo que múltiplos pareçam baixos.`;
  } else {
    overallVerdict = `Pontuação integrada equilibrada (${overall}/100): desempenho moderado entre qualidade dos fundamentos (${finScore}/${qualScore}) e retorno implícito no preço (${valScore}).`;
  }

  return {
    overallScore: overall,
    overallVerdict,
    p1ToP2AndP3,
    p2ToP3,
    p3ToDecision,
    pillars: [
      buildPillarExplanation('financial', 'Pilar 1 · Financeiro', analysis.scores.financial, finPct, analysis),
      buildPillarExplanation('qualitative', 'Pilar 2 · Qualitativo', analysis.scores.qualitative, qualPct, analysis),
      buildPillarExplanation('valuation', 'Pilar 3 · Valuation', analysis.scores.valuation, valPct, analysis),
    ],
  };
}

export interface IndicatorDirectImpact {
  whyCurrentValue: string;
  directInfluence: string;
  watchTrigger: string;
}

export function buildIndicatorDirectImpact(indicator: IndicatorDiagnostic): IndicatorDirectImpact {
  const meanText = isFiniteNumber(indicator.historicalMean)
    ? `${indicator.historicalMean.toFixed(2)}${indicator.unit === '%' ? '%' : indicator.unit === 'x' ? 'x' : ''}`
    : 'N/D';
  const benchText = isFiniteNumber(indicator.sectorBenchmark)
    ? `${indicator.sectorBenchmark.toFixed(2)}${indicator.unit === '%' ? '%' : indicator.unit === 'x' ? 'x' : ''}`
    : null;

  let whyCurrentValue = indicator.tenPointExplanation.fatoresExplicativos;
  if (indicator.status === 'not_applicable') {
    whyCurrentValue = indicator.limitationNote ?? 'Indicador estruturalmente inaplicável à contabilidade deste setor.';
  } else if (isFiniteNumber(indicator.value)) {
    const compareParts: string[] = [];
    if (meanText !== 'N/D') {
      compareParts.push(`média histórica de ${meanText}`);
    }
    if (benchText) {
      compareParts.push(`referência setorial de ${benchText}`);
    }
    if (compareParts.length > 0) {
      whyCurrentValue = `${indicator.tenPointExplanation.fatoresExplicativos} Compara-se frente à ${compareParts.join(' e ')}.`;
    }
  }

  const id = indicator.id;
  let directInfluence = indicator.tenPointExplanation.consequencias;
  let watchTrigger = indicator.tenPointExplanation.riscos;

  if (id === 'roic' || id === 'roe' || id === 'roa') {
    directInfluence =
      'Influência direta dupla: compõe o bloco de Rentabilidade (20% da Nota Financeira) e mede se o capital reinvestido gera retorno acima do WACC/Ke, alterando também a nota de Alocação de Capital no Pilar 2.';
    watchTrigger =
      'Queda abaixo do WACC (ou Ke no ROE) sinaliza que o crescimento futuro passa a destruir valor por ação no DCF.';
  } else if (id === 'divida_liquida_ebitda' || id === 'cobertura_juros' || id === 'basileia') {
    directInfluence =
      'Influência direta no Pilar Financeiro (Endividamento, 15% da nota) e no Valuation: maior dívida líquida reduz o Equity Value subtraído do Enterprise Value e eleva o risco de crédito.';
    watchTrigger =
      'Ultrapassar o teto setorial de alavancagem ou cair abaixo de 1,8x na cobertura de juros dispara alerta automático de risco.';
  } else if (id.startsWith('margem_') || id === 'ebitda' || id === 'combined_ratio') {
    directInfluence =
      'Influência direta na Eficiência Operacional (10% da Nota Financeira) e nas projeções de margem EBIT do DCF: cada 1 p.p. perdido na margem reduz o NOPAT e o FCFF de todos os anos futuros.';
    watchTrigger =
      'Tendência classificada como deterioração aciona alerta automático de compressão operacional.';
  } else if (id === 'fcff' || id === 'fco_lucro_liquido' || id === 'accruals_ratio' || id === 'dividendos_fcf') {
    directInfluence =
      'Influência direta em Geração de Caixa (20%) e Qualidade dos Lucros (15%). Se a conversão em caixa cair e classificar a qualidade como Fraca/Crítica, o motor limita a nota de Margem de Segurança no Valuation para evitar armadilha de valor.';
    watchTrigger =
      'FCFF negativo recorrente ou dividendos acima do FCFF indicam necessidade de dívida para pagar investimentos/proventos.';
  } else if (id === 'pl' || id === 'ev_ebitda' || id === 'pvp' || id === 'dividend_yield') {
    directInfluence =
      'Influência direta nos modelos comparativos de Múltiplos e DDM (Pilar 3). Sozinho não garante compra: o sistema cruza o múltiplo com ROIC/ROE e qualidade de lucros antes de pontuar o Valuation.';
    watchTrigger =
      'Múltiplo baixo com ROIC < WACC ou lucro não recorrente costuma indicar deterioração precificada, não barganha.';
  }

  return { whyCurrentValue, directInfluence, watchTrigger };
}
