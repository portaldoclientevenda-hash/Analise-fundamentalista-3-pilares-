import { FinancialPillarResult } from '../financial/financialEngine.ts';
import { isFiniteNumber } from '../financial/mathUtils.ts';
import { AssetRawData, MoatIntensity } from '../types.ts';

export interface QualitativeSubScore {
  id:
    | 'modeloNegocio'
    | 'vantagensCompetitivas'
    | 'gestao'
    | 'governanca'
    | 'alocacaoCapital'
    | 'mercadoConcorrencia'
    | 'riscosSustentabilidade';
  label: string;
  score: number | null; // 0-100
  dataStatus: 'verified' | 'partial' | 'insufficient';
  evidenceSummary: string;
}

export interface QualitativePillarResult {
  assetTicker: string;
  referenceDate: string;
  businessSummary: string;
  moatStrengthOverall: MoatIntensity;
  moatCountStrong: number;
  subScores: QualitativeSubScore[];
  evidencesSupportingScore: string[];
  investigationPoints: string[];
  keyRisksSummary: string[];
  dataCoveragePct: number;
  // Cross-pillar outputs consumed by Valuation & Integrated Engine:
  growthSustainabilityFactor: number; // 0.65 .. 1.15 multiplier on historical/base growth
  qualitativeRiskSpreadBps: number; // -50 .. +250 bps adjustment to cost of capital for risk governance/moat
  capitalAllocationCreatesValue: boolean | null;
}

function moatIntensityToScore(intensity: MoatIntensity, hasEvidence: boolean): number {
  if (!hasEvidence) return 30; // lack of evidence cannot certify a strong moat
  switch (intensity) {
    case 'muito_forte':
      return 94;
    case 'forte':
      return 82;
    case 'moderada':
      return 64;
    case 'fraca':
      return 40;
    case 'inexistente_ou_nao_demonstrada':
      return 25;
  }
}

export function runQualitativeAnalysis(
  asset: AssetRawData,
  financialResult: FinancialPillarResult
): QualitativePillarResult {
  const q = asset.qualitative;
  const dq = q.businessModel.diagnosticQuestions;

  // 1. Modelo de negócio score
  let bmPoints = 0;
  let bmChecks = 0;
  const scoreMapRecurrence: Record<string, number> = { Alta: 90, Média: 65, Baixa: 35 };
  const scoreMapRiskInv: Record<string, number> = { Baixo: 90, Moderado: 60, Alto: 25 };
  const scoreMapScale: Record<string, number> = { Sim: 90, Parcial: 62, Limitado: 35 };
  const scoreMapDemand: Record<string, number> = { Alta: 88, Média: 62, Baixa: 35 };
  const scoreMapCycle: Record<string, number> = { Baixa: 88, Moderada: 62, Alta: 38 };
  const scoreMapBarriers: Record<string, number> = { Altas: 90, Moderadas: 64, Baixas: 32 };
  const scoreMapProspects: Record<string, number> = { Positivas: 88, Neutras: 58, Desafiadoras: 32 };

  const bmMetrics = [
    scoreMapRecurrence[dq.recurringRevenue.answer],
    scoreMapRiskInv[dq.clientConcentrationRisk.answer],
    scoreMapRiskInv[dq.supplierConcentrationRisk.answer],
    scoreMapScale[dq.scalable.answer],
    scoreMapDemand[dq.predictableDemand.answer],
    scoreMapCycle[dq.economicCycleDependence.answer],
    scoreMapBarriers[dq.entryBarriers.answer],
    scoreMapProspects[dq.longTermProspects.answer],
  ];
  for (const m of bmMetrics) {
    if (isFiniteNumber(m)) {
      bmPoints += m;
      bmChecks++;
    }
  }
  const modeloNegocioScore = bmChecks > 0 ? Math.round(bmPoints / bmChecks) : null;

  // 2. Vantagens competitivas (Moat) - require evidence
  const moatScores = q.moats.map((m) =>
    moatIntensityToScore(m.intensity, m.evidences.length > 0 && m.exists !== null)
  );
  const sortedMoats = [...moatScores].sort((a, b) => b - a);
  const topMoatsAvg =
    sortedMoats.length >= 2
      ? Math.round(sortedMoats[0] * 0.45 + sortedMoats[1] * 0.35 + (sortedMoats[2] ?? sortedMoats[1]) * 0.2)
      : sortedMoats[0] ?? null;

  const moatCountStrong = q.moats.filter(
    (m) => (m.intensity === 'muito_forte' || m.intensity === 'forte') && m.evidences.length > 0
  ).length;

  let moatStrengthOverall: MoatIntensity = 'inexistente_ou_nao_demonstrada';
  if (topMoatsAvg !== null) {
    if (topMoatsAvg >= 88 && moatCountStrong >= 2) moatStrengthOverall = 'muito_forte';
    else if (topMoatsAvg >= 75 && moatCountStrong >= 1) moatStrengthOverall = 'forte';
    else if (topMoatsAvg >= 58) moatStrengthOverall = 'moderada';
    else if (topMoatsAvg >= 38) moatStrengthOverall = 'fraca';
  }

  // 3. Gestão
  let gestaoScore: number | null = null;
  if (q.management.valueCreationVerdict !== 'dados_insuficientes') {
    gestaoScore =
      q.management.valueCreationVerdict === 'cria_valor'
        ? 85
        : q.management.valueCreationVerdict === 'neutro'
          ? 60
          : 28;
  }

  // 4. Alocação de capital (interlinked with Pillar 1 ROIC vs WACC)
  const roicVal = financialResult.indicators.roic?.value ?? null;
  const roeVal = financialResult.indicators.roe?.value ?? null;
  let alocacaoScore = q.capitalAllocation.rating;
  let capitalAllocationCreatesValue: boolean | null = null;
  if (roicVal !== null) {
    const spread = roicVal - financialResult.waccEstimatePct;
    capitalAllocationCreatesValue = spread > 0;
    if (alocacaoScore !== null) {
      // Blend qualitative rating with empirical ROIC-WACC spread
      const roicBonus = spread > 4 ? 8 : spread < -2 ? -12 : 0;
      alocacaoScore = Math.max(10, Math.min(98, alocacaoScore + roicBonus));
    }
  } else if (roeVal !== null) {
    capitalAllocationCreatesValue = roeVal > 14;
  }

  // 5. Governança
  let govScore = q.governance.transparencyRating;
  if (govScore !== null && q.governance.tagAlongPct !== null) {
    if (q.governance.tagAlongPct < 80) govScore = Math.max(20, govScore - 15);
    if (q.governance.minorityRisks.length >= 3) govScore = Math.max(15, govScore - 10);
  }

  // 6. Mercado e Concorrência (Porter 5 Forces)
  const pf = q.marketAndCompetition.porterFiveForces;
  const forceToScore = (lvl: 'Alta' | 'Média' | 'Baixa') =>
    lvl === 'Baixa' ? 88 : lvl === 'Média' ? 62 : 34;
  const mercadoConcorrenciaScore = Math.round(
    (forceToScore(pf.rivalry.level) +
      forceToScore(pf.newEntrants.level) +
      forceToScore(pf.substitutes.level) +
      forceToScore(pf.supplierPower.level) +
      forceToScore(pf.buyerPower.level)) /
      5
  );

  // 7. Riscos e Sustentabilidade
  const highCritRisks = q.risks.filter(
    (r) => r.severity === 'alto' || r.severity === 'critico'
  ).length;
  const insufRisks = q.risks.filter((r) => r.severity === 'dados_insuficientes').length;
  const riscosScore =
    q.risks.length > 0 && insufRisks < q.risks.length
      ? Math.max(20, 88 - highCritRisks * 13)
      : null;

  const subScores: QualitativeSubScore[] = [
    {
      id: 'modeloNegocio',
      label: 'Modelo de Negócio',
      score: modeloNegocioScore,
      dataStatus: modeloNegocioScore !== null ? 'verified' : 'insufficient',
      evidenceSummary: q.businessModel.objectiveDescription,
    },
    {
      id: 'vantagensCompetitivas',
      label: 'Vantagens Competitivas (Moat)',
      score: topMoatsAvg,
      dataStatus: moatCountStrong > 0 || q.moats.some((m) => m.evidences.length > 0) ? 'verified' : 'partial',
      evidenceSummary: `${moatCountStrong} vantagem(ns) competitiva(s) classificada(s) como forte/muito forte com evidência documental.`,
    },
    {
      id: 'gestao',
      label: 'Gestão e Administração',
      score: gestaoScore,
      dataStatus: gestaoScore !== null ? 'verified' : 'insufficient',
      evidenceSummary: q.management.consistencySpeechVsResults,
    },
    {
      id: 'governanca',
      label: 'Governança Corporativa',
      score: govScore,
      dataStatus: govScore !== null ? 'verified' : 'insufficient',
      evidenceSummary: `${q.governance.listingSegment} · Tag along ${q.governance.tagAlongPct ?? 'N/D'}% · Independência do conselho ${q.governance.boardIndependencePct ?? 'N/D'}%.`,
    },
    {
      id: 'alocacaoCapital',
      label: 'Alocação de Capital',
      score: alocacaoScore,
      dataStatus: alocacaoScore !== null ? 'verified' : 'insufficient',
      evidenceSummary: q.capitalAllocation.incrementalRoicVsWaccNote,
    },
    {
      id: 'mercadoConcorrencia',
      label: 'Mercado e Concorrência (Porter)',
      score: mercadoConcorrenciaScore,
      dataStatus: 'verified',
      evidenceSummary: q.marketAndCompetition.marketSizeAndGrowth,
    },
    {
      id: 'riscosSustentabilidade',
      label: 'Riscos Estratégicos & ESG',
      score: riscosScore,
      dataStatus: riscosScore !== null ? 'verified' : 'insufficient',
      evidenceSummary: `${highCritRisks} risco(s) qualitativo(s) classificados como alto/crítico.`,
    },
  ];

  // Cross-pillar outputs
  let growthSustainabilityFactor = 1.0;
  if (topMoatsAvg !== null) {
    if (topMoatsAvg >= 80 && dq.longTermProspects.answer === 'Positivas') growthSustainabilityFactor = 1.08;
    else if (topMoatsAvg < 48 || dq.longTermProspects.answer === 'Desafiadoras') growthSustainabilityFactor = 0.80;
  }

  let qualitativeRiskSpreadBps = 0;
  if (govScore !== null && govScore < 55) qualitativeRiskSpreadBps += 120;
  if (highCritRisks >= 3) qualitativeRiskSpreadBps += 100;
  if (moatCountStrong >= 2 && (govScore ?? 0) >= 80) qualitativeRiskSpreadBps -= 40;

  const evidencesSupportingScore = [
    ...q.moats
      .filter((m) => m.evidences.length > 0 && (m.intensity === 'forte' || m.intensity === 'muito_forte'))
      .map((m) => `${m.label} (${m.intensity.replace(/_/g, ' ')}): ${m.evidences[0]}`),
    ...q.growthProspects.realDrivers.slice(0, 2).map((d) => `Vetor de crescimento: ${d}`),
  ];

  const keyRisksSummary = q.risks
    .filter((r) => r.severity === 'alto' || r.severity === 'critico')
    .map((r) => `${r.label} (${r.severity}): ${r.description}`);

  return {
    assetTicker: asset.ticker,
    referenceDate: q.referenceDate,
    businessSummary: q.businessModel.objectiveDescription,
    moatStrengthOverall,
    moatCountStrong,
    subScores,
    evidencesSupportingScore,
    investigationPoints: q.investigationPoints,
    keyRisksSummary,
    dataCoveragePct: q.dataAvailabilityScore,
    growthSustainabilityFactor,
    qualitativeRiskSpreadBps,
    capitalAllocationCreatesValue,
  };
}
