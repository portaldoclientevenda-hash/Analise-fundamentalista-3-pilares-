export type AssetType = 'stock' | 'fii' | 'bank' | 'insurer';

export type SectorId =
  | 'bancos'
  | 'seguradoras'
  | 'energia_eletrica'
  | 'saneamento'
  | 'petroleo_gas'
  | 'mineracao'
  | 'siderurgia'
  | 'varejo'
  | 'construcao_civil'
  | 'incorporadoras'
  | 'agronegocio'
  | 'tecnologia'
  | 'telecomunicacoes'
  | 'transporte_logistica'
  | 'industria'
  | 'saude'
  | 'educacao'
  | 'holdings'
  | 'fiis';

export type DataStatus =
  | 'disclosed'
  | 'calculated'
  | 'estimated'
  | 'unavailable'
  | 'not_applicable'
  | 'negative'
  | 'zero';

export type PeriodGranularity = 'annual' | 'quarterly' | 'ltm';

export interface DataProvenance {
  value: number | string | null;
  unit: string;
  currency: 'BRL' | 'USD' | 'N/A';
  referencePeriod: string;
  disclosureDate: string;
  source: string;
  sourceUrl?: string;
  collectedAt: string;
  updatedAt: string;
  methodology: string;
  qualityFlag: 'verified' | 'normalized' | 'estimated' | 'stale' | 'unavailable';
}

export interface HistoricalPoint {
  period: string;
  granularity: PeriodGranularity;
  value: number | null;
  source?: string;
  disclosureDate?: string;
}

export interface StructuredAnalysisAH {
  fatoObservado: string;
  evidencia: string;
  interpretacao: string;
  contexto: string;
  impacto: string;
  risco: string;
  perspectiva: string;
  conclusao: string;
  referenceDate: string;
}

export interface IndicatorDiagnostic {
  id: string;
  name: string;
  category:
    | 'liquidez'
    | 'endividamento'
    | 'rentabilidade'
    | 'eficiencia'
    | 'crescimento'
    | 'geracao_caixa'
    | 'mercado'
    | 'qualidade_lucros'
    | 'setorial';
  formula: string;
  unit: '%' | 'x' | 'BRL' | 'BRL_M' | 'dias' | 'pts' | 'score';
  value: number | null;
  status: DataStatus;
  limitationNote?: string;
  history: HistoricalPoint[];
  historicalMean: number | null;
  historicalMedian: number | null;
  yoyVariationPct: number | null;
  trend: 'crescimento_consistente' | 'estagnacao' | 'deterioracao' | 'recuperacao' | 'volatilidade_elevada' | 'dados_insuficientes';
  sectorBenchmark?: number | null;
  positives: string[];
  negatives: string[];
  risks: string[];
  tenPointExplanation: {
    oQueMede: string;
    formula: string;
    resultado: string;
    evolucao: string;
    significado: string;
    importanciaSetorial: string;
    fatoresExplicativos: string;
    consequencias: string;
    riscos: string;
    conclusao: string;
  };
  provenance: DataProvenance;
}

export interface BalanceSheetPeriod {
  period: string;
  granularity: PeriodGranularity;
  disclosureDate: string;
  consolidated: boolean;
  // Ativo Circulante
  caixaEquivalentes: number | null;
  aplicacoesFinanceiras: number | null;
  contasReceber: number | null;
  estoques: number | null;
  tributosRecuperar: number | null;
  despesasAntecipadas: number | null;
  outrosAtivosCirculantes: number | null;
  ativoCirculante: number | null;
  // Ativo Não Circulante
  realizavelLongoPrazo: number | null;
  investimentos: number | null;
  imobilizado: number | null;
  intangivel: number | null;
  agio: number | null;
  ativoNaoCirculante: number | null;
  ativoTotal: number | null;
  // Passivo Circulante
  fornecedores: number | null;
  emprestimosCurtoPrazo: number | null;
  obrigacoesTrabalhistas: number | null;
  obrigacoesTributarias: number | null;
  dividendosPagar: number | null;
  outrasObrigacoesCP: number | null;
  passivoCirculante: number | null;
  // Passivo Não Circulante
  emprestimosLongoPrazo: number | null;
  debentures: number | null;
  provisoes: number | null;
  obrigacoesFiscaisLP: number | null;
  outrosPassivosLP: number | null;
  passivoNaoCirculante: number | null;
  // Patrimônio Líquido
  capitalSocial: number | null;
  reservasCapital: number | null;
  reservasLucros: number | null;
  lucrosPrejuizosAcumulados: number | null;
  ajustesAvaliacaoPatrimonial: number | null;
  participacaoNaoControladores: number | null;
  patrimonioLiquidoControladores: number | null;
  patrimonioLiquidoTotal: number | null;
}

export interface IncomeStatementPeriod {
  period: string;
  granularity: PeriodGranularity;
  disclosureDate: string;
  consolidated: boolean;
  receitaBruta: number | null;
  deducoesReceita: number | null;
  receitaLiquida: number | null;
  custos: number | null;
  lucroBruto: number | null;
  despesasComerciais: number | null;
  despesasAdministrativas: number | null;
  outrasDespesasReceitasOp: number | null;
  depreciacaoAmortizacao: number | null;
  ebitda: number | null;
  ebitdaDivulgado: boolean;
  ebit: number | null;
  receitasFinanceiras: number | null;
  despesasFinanceirasJuros: number | null;
  resultadoFinanceiro: number | null;
  lair: number | null;
  irCsll: number | null;
  lucroLiquidoTotal: number | null;
  lucroLiquidoControladores: number | null;
  lucroLiquidoNaoControladores: number | null;
  resultadosNaoRecorrentes: number | null;
}

export interface CashFlowPeriod {
  period: string;
  granularity: PeriodGranularity;
  disclosureDate: string;
  // FCO
  lucroLiquidoBase: number | null;
  depreciacaoAmortizacaoDFC: number | null;
  variacaoCapitalGiro: number | null;
  provisoesAjustesSemCaixa: number | null;
  fluxoCaixaOperacional: number | null;
  // FCI
  aquisicaoImobilizadoCapex: number | null;
  aquisicaoIntangivel: number | null;
  investimentosLiquidos: number | null;
  alienacaoAtivos: number | null;
  aquisicoesEmpresas: number | null;
  fluxoCaixaInvestimento: number | null;
  // FCF
  captacaoEmprestimos: number | null;
  pagamentoDividas: number | null;
  emissaoAcoes: number | null;
  recompraAcoes: number | null;
  dividendosJcpPagos: number | null;
  jurosPagosFCF: number | null;
  fluxoCaixaFinanciamento: number | null;
}

export interface DebtProfile {
  dividaCurtoPrazo: number | null;
  dividaLongoPrazo: number | null;
  custoMedioDividaPct: number | null;
  exposicaoCdiPct: number | null;
  exposicaoIpcaPct: number | null;
  exposicaoCambialPct: number | null;
  cronogramaVencimentos: { ano: string; valor: number }[];
  covenantsDescricao: string;
  liquidezCobreVencimentos24m: boolean | null;
}

export interface BankMetrics {
  margemFinanceiraBruta: number | null; // NII
  nimPct: number | null;
  carteiraCreditoTotal: number | null;
  inadimplencia90dPct: number | null;
  indiceCoberturaPddPct: number | null;
  custoCreditoPct: number | null;
  indiceBasileiaPct: number | null;
  capitalNivel1Pct: number | null;
  indiceEficienciaPct: number | null;
}

export interface InsurerMetrics {
  premiosEmitidos: number | null;
  sinistralidadePct: number | null;
  combinedRatioPct: number | null;
  reservasTecnicas: number | null;
  resultadoFinanceiroSeg: number | null;
  adequacaoCapitalPct: number | null;
  crescimentoPremiosPct: number | null;
}

export type FiiSegmentType = 'tijolo' | 'papel' | 'hibrido' | 'fof';

export interface FiiMetrics {
  fiiType: FiiSegmentType;
  valorPatrimonialCota: number | null;
  rendimentoMensalMedioCota: number | null;
  dividendYield12mPct: number | null;
  vacanciaFisicaPct: number | null;
  vacanciaFinanceiraPct: number | null;
  inadimplenciaPct: number | null;
  quantidadeAtivos: number | null;
  quantidadeInquilinos: number | null;
  concentracaoMaiorInquilinoPct: number | null;
  waultAnos: number | null;
  capRateImplicitoPct: number | null;
  alavancagemPct: number | null;
  taxaAdministracaoGestaoPct: number | null;
  liquidezDiariaMedia: number | null;
  // Papel / CRIs
  exposicaoCdiPct?: number | null;
  exposicaoIpcaPct?: number | null;
  spreadMedioPct?: number | null;
  ltvMedioPct?: number | null;
  subordinacaoPct?: number | null;
  // FOF
  descontoDuploCamadasPct?: number | null;
  historicoDistribuicao12m: { mes: string; valorPorCota: number }[];
  qualidadeLaudos: string;
  gestora: string;
}

export interface MarketSnapshot {
  price: number;
  priceDate: string;
  priceSource: string;
  sharesTotal: number; // adjusted for splits/groupings
  shareAdjustmentNote?: string;
  freeFloatPct: number | null;
  averageDailyVolumeBrl: number | null;
  beta: number | null;
  dividendsPerShareAnnual: { year: string; dps: number }[];
  sectorPeerTickers: string[];
}

export type MoatIntensity =
  | 'muito_forte'
  | 'forte'
  | 'moderada'
  | 'fraca'
  | 'inexistente_ou_nao_demonstrada';

export interface MoatDimension {
  id: 'marca' | 'efeitos_rede' | 'custos_troca' | 'vantagem_custos' | 'ativos_intangiveis' | 'barreiras_regulatorias' | 'escala';
  label: string;
  exists: boolean | null;
  intensity: MoatIntensity;
  evidences: string[];
  durability: 'alta' | 'media' | 'baixa' | 'indeterminada';
  vulnerabilities: string[];
  neutralizingCompetitors: string[];
}

export interface SwotItem {
  id: string;
  category: 'forca' | 'fraqueza' | 'oportunidade' | 'ameaca';
  description: string;
  evidence: string;
  impact: 'alto' | 'medio' | 'baixo';
  probability: 'alta' | 'media' | 'baixa';
  horizon: 'curto' | 'medio' | 'longo';
}

export interface QualitativeRiskItem {
  category:
    | 'regulatorio'
    | 'politico'
    | 'tecnologico'
    | 'competitivo'
    | 'operacional'
    | 'reputacional'
    | 'ambiental_climatico'
    | 'social'
    | 'juridico'
    | 'concentracao';
  label: string;
  severity: 'baixo' | 'moderado' | 'alto' | 'critico' | 'dados_insuficientes';
  description: string;
  evidence: string;
  mitigation?: string;
}

export interface QualitativeProfile {
  referenceDate: string;
  dataAvailabilityScore: number; // 0-100 separate from performance score
  businessModel: {
    objectiveDescription: string;
    whatItSells: string;
    productsServices: string[];
    clients: string;
    monetization: string;
    supplyChainDistribution: string;
    mainCosts: string[];
    economicAdvantages: string;
    diagnosticQuestions: {
      isSimple: { answer: 'Sim' | 'Moderado' | 'Complexo'; note: string };
      easyToUnderstandProfit: { answer: 'Sim' | 'Parcial' | 'Não'; note: string };
      recurringRevenue: { answer: 'Alta' | 'Média' | 'Baixa'; note: string };
      clientConcentrationRisk: { answer: 'Baixo' | 'Moderado' | 'Alto'; note: string };
      supplierConcentrationRisk: { answer: 'Baixo' | 'Moderado' | 'Alto'; note: string };
      scalable: { answer: 'Sim' | 'Parcial' | 'Limitado'; note: string };
      predictableDemand: { answer: 'Alta' | 'Média' | 'Baixa'; note: string };
      economicCycleDependence: { answer: 'Baixa' | 'Moderada' | 'Alta'; note: string };
      entryBarriers: { answer: 'Altas' | 'Moderadas' | 'Baixas'; note: string };
      longTermProspects: { answer: 'Positivas' | 'Neutras' | 'Desafiadoras'; note: string };
    };
  };
  moats: MoatDimension[];
  management: {
    executivesSummary: string;
    tenureAndTrackRecord: string;
    guidanceExecution: string;
    shareholderCommunication: string;
    consistencySpeechVsResults: string;
    keyDecisions: {
      acquisitions: string;
      divestments: string;
      expansion: string;
      leverage: string;
      equityIssuanceOrBuybacks: string;
      dividends: string;
    };
    valueCreationVerdict: 'cria_valor' | 'neutro' | 'destroi_valor' | 'dados_insuficientes';
  };
  capitalAllocation: {
    reinvestmentQuality: string;
    rdAndInnovation: string;
    maTrackRecord: string;
    debtManagement: string;
    dividendAndBuybackDiscipline: string;
    incrementalRoicVsWaccNote: string;
    redFlags: string[];
    rating: number | null; // 0-100
  };
  governance: {
    listingSegment: string;
    boardIndependencePct: number | null;
    controllingShareholders: string;
    tagAlongPct: number | null;
    shareholdersAgreement: string;
    compensationPolicy: string;
    auditCommitteeAndAuditor: string;
    relatedPartyTransactions: string;
    minorityRisks: string[];
    transparencyRating: number | null;
  };
  ownershipStructure: {
    controllersPct: number | null;
    institutionalPct: number | null;
    retailPct: number | null;
    treasuryPct: number | null;
    shareClasses: string;
    dilutionHistoryNote: string;
    buybackHistoryNote: string;
    crossShareholdings: string;
  };
  productQuality: {
    differentiation: string;
    perceivedQuality: string;
    retentionAndLoyalty: string;
    innovationCapacity: string;
    obsolescenceRisk: string;
    pricingPower: 'alto' | 'moderado' | 'baixo' | 'dados_insuficientes';
    publicEvidenceNote: string;
  };
  marketAndCompetition: {
    marketSizeAndGrowth: string;
    marketShareNote: string;
    directCompetitors: string[];
    indirectCompetitors: string[];
    substitutes: string;
    porterFiveForces: {
      rivalry: { level: 'Alta' | 'Média' | 'Baixa'; analysis: string };
      newEntrants: { level: 'Alta' | 'Média' | 'Baixa'; analysis: string };
      substitutes: { level: 'Alta' | 'Média' | 'Baixa'; analysis: string };
      supplierPower: { level: 'Alta' | 'Média' | 'Baixa'; analysis: string };
      buyerPower: { level: 'Alta' | 'Média' | 'Baixa'; analysis: string };
    };
  };
  growthProspects: {
    realDrivers: string[];
    speculativeExpectations: string[];
    geographicAndProductExpansion: string;
    digitalizationAndEfficiency: string;
  };
  risks: QualitativeRiskItem[];
  esg: {
    companyDisclosed: {
      environmental: string;
      social: string;
      governance: string;
    };
    independentAssessment: {
      summary: string;
      criteriaUsed: string[];
      controversiesOrGaps: string;
    };
  };
  swot: SwotItem[];
  macroSensitivity: {
    classification: (
      | 'Defensiva'
      | 'Cíclica'
      | 'Sensível a Juros'
      | 'Sensível ao Câmbio'
      | 'Sensível a Commodities'
      | 'Dependente de Crédito'
    )[];
    factors: {
      factor: 'Selic' | 'Inflação' | 'Câmbio' | 'PIB' | 'Juros Internacionais' | 'Commodities' | 'Desemprego' | 'Consumo' | 'Crédito' | 'Política Fiscal';
      sensitivity: 'Positiva' | 'Neutra' | 'Negativa' | 'Mista';
      intensity: 'Alta' | 'Média' | 'Baixa';
      mechanism: string;
    }[];
  };
  investigationPoints: string[];
  sources: { name: string; document: string; referencePeriod: string; url?: string }[];
}

export interface ValuationAssumptions {
  referenceDate: string;
  rfPct: number; // Taxa livre de risco (ex: NTN-B real ou nominal Brasil, registrada com origem)
  rfSource: string;
  rmMinusRfPct: number; // Prêmio de risco de mercado (ERP)
  erpSource: string;
  countryRiskPct: number; // Embutido apenas se Rf for USD; 0 se Rf já for soberano BRL para evitar dupla contagem!
  countryRiskNote: string;
  beta: number;
  kdPreTaxPct: number;
  taxRateNormalizedPct: number;
  projectionYears: number; // 5..10
  revenueGrowthBasePct: number;
  revenueGrowthTerminalPct: number; // g
  ebitMarginTargetPct: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  workingCapitalPctDeltaRevenue: number;
  exitMultipleEvEbitda?: number;
  desiredMarginOfSafetyPct: number;
  // DDM & multiples
  dividendPayoutNormalizedPct: number;
  dividendGrowthStage1Pct: number;
  dividendGrowthTerminalPct: number;
  referencePeMultiple: number;
  referencePeRationale: string;
  referenceEvEbitdaMultiple: number;
  referenceEvEbitdaRationale: string;
  referencePvpMultiple: number;
  referencePvpRationale: string;
  // Adjustments
  nonOperatingAssetsBrl: number;
  contingenciesAdjustmentBrl: number;
}

export interface AssetRawData {
  ticker: string;
  name: string;
  cnpj?: string;
  assetType: AssetType;
  sectorId: SectorId;
  segment: string;
  description: string;
  market: MarketSnapshot;
  balanceSheets: BalanceSheetPeriod[]; // ordered chronologically ascending
  incomeStatements: IncomeStatementPeriod[];
  cashFlows: CashFlowPeriod[];
  debtProfile: DebtProfile;
  bankMetrics?: BankMetrics;
  insurerMetrics?: InsurerMetrics;
  fiiMetrics?: FiiMetrics;
  qualitative: QualitativeProfile;
  defaultValuationAssumptions: ValuationAssumptions;
  sources: DataProvenance[];
}

export interface PillarWeightsConfig {
  financial: {
    liquidez: number;
    endividamento: number;
    rentabilidade: number;
    eficiencia: number;
    crescimento: number;
    geracaoCaixa: number;
    qualidadeLucros: number;
  };
  qualitative: {
    modeloNegocio: number;
    vantagensCompetitivas: number;
    gestao: number;
    governanca: number;
    alocacaoCapital: number;
    mercadoConcorrencia: number;
    riscosSustentabilidade: number;
  };
  valuation: {
    adequacaoMetodologica: number;
    potencialValorizacao: number;
    margemSeguranca: number;
    sustentabilidadePremissas: number;
    sensibilidadeRiscos: number;
    consistenciaMetodos: number;
  };
  overall: {
    financialWeight: number; // default 0.35
    qualitativeWeight: number; // default 0.35
    valuationWeight: number; // default 0.30
    rationale: string;
  };
}

export type AlertSeverity = 'informativo' | 'atencao' | 'alto_risco' | 'critico';

export interface RiskAlert {
  id: string;
  severity: AlertSeverity;
  pillar: 'financeiro' | 'qualitativo' | 'valuation' | 'dados';
  relatedIndicator: string;
  evidence: string;
  period: string;
  potentialImpact: string;
  explanation: string;
  investigationRecommendation: string;
}

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  action: string;
  targetTicker?: string;
  details: string;
  timestamp: string;
}
