import { SectorId } from '../types.ts';

export interface SectorProfile {
  id: SectorId;
  name: string;
  description: string;
  priorityIndicators: string[];
  notApplicableIndicators: string[];
  recommendedValuationModels: {
    modelId: 'dcf_fcff' | 'fcfe' | 'ddm' | 'multiples' | 'nav_patrimonio' | 'residual_income' | 'fii_model';
    label: string;
    weight: number;
    rationale: string;
  }[];
  comparisonCriteria: string[];
  specificRisks: string[];
  qualityCriteria: string[];
  interpretationBenchmarks: {
    healthyNetDebtEbitdaMax: number | null;
    healthyRoeMinPct: number | null;
    healthyRoicMinPct: number | null;
    healthyEbitdaMarginMinPct: number | null;
    healthyCurrentLiquidityMin: number | null;
  };
}

export const SECTOR_PROFILES: Record<SectorId, SectorProfile> = {
  bancos: {
    id: 'bancos',
    name: 'Bancos',
    description: 'Instituições financeiras de intermediação de crédito, captação e serviços bancários.',
    priorityIndicators: ['ROE', 'ROA', 'NIM', 'Inadimplência >90d', 'Índice de Cobertura PDD', 'Custo de Crédito', 'Índice de Basileia', 'Índice de Eficiência', 'P/VP', 'P/L', 'Dividend Yield'],
    notApplicableIndicators: ['Liquidez Corrente', 'Liquidez Seca', 'Giro de Estoques', 'PME', 'PMR', 'PMP', 'EV/EBITDA', 'Dívida Líquida / EBITDA', 'FCFF / DCF Tradicional', 'ROIC Operacional'],
    recommendedValuationModels: [
      { modelId: 'residual_income', label: 'Modelo de Renda Residual', weight: 0.40, rationale: 'Bancos têm patrimônio contábil marcado próximo ao valor econômico e regulação de capital (Basileia).' },
      { modelId: 'ddm', label: 'Dividend Discount Model (DDM)', weight: 0.35, rationale: 'Bancos maduros distribuem parcela previsível do lucro respeitando requerimentos de capital.' },
      { modelId: 'multiples', label: 'Múltiplos (P/VP Justo via ROE & P/L)', weight: 0.25, rationale: 'Relação P/VP = (ROE - g)/(Ke - g) captura diretamente criação de valor acima do custo do equity.' },
    ],
    comparisonCriteria: ['ROE recorrente', 'Basileia e Capital Nível 1', 'Inadimplência e Cobertura', 'Índice de Eficiência', 'P/VP vs ROE'],
    specificRisks: ['Inadimplência sistêmica e deterioração de safra de crédito', 'Compressão de spread/NIM em queda abrupta de juros', 'Risco regulatório (BCB, compulsório, JCP, CSLL)', 'Descasamento de prazos/taxas (ALM)'],
    qualityCriteria: ['Qualidade da carteira (colateral vs clean)', 'Cobertura PDD conservadora', 'Receita de serviços/seguros diversificada', 'Eficiência operacional digital'],
    interpretationBenchmarks: {
      healthyNetDebtEbitdaMax: null,
      healthyRoeMinPct: 16,
      healthyRoicMinPct: null,
      healthyEbitdaMarginMinPct: null,
      healthyCurrentLiquidityMin: null,
    },
  },
  seguradoras: {
    id: 'seguradoras',
    name: 'Seguradoras',
    description: 'Companhias de seguros, previdência, capitalização e resseguros.',
    priorityIndicators: ['Prêmios Emitidos', 'Sinistralidade', 'Combined Ratio', 'ROE', 'Resultado Financeiro / Float', 'Adequação de Capital', 'P/L', 'P/VP', 'Dividend Yield'],
    notApplicableIndicators: ['Liquidez Corrente', 'Giro de Estoques', 'EV/EBITDA', 'Dívida Líquida / EBITDA', 'FCFF / DCF Tradicional'],
    recommendedValuationModels: [
      { modelId: 'ddm', label: 'Dividend Discount Model (DDM)', weight: 0.45, rationale: 'Seguradoras asset-light com alto payout distribuem fluxo previsível aos acionistas.' },
      { modelId: 'residual_income', label: 'Modelo de Renda Residual', weight: 0.30, rationale: 'Avalia o excesso de ROE sobre Ke considerando o capital regulatório exigido (SUSEP).' },
      { modelId: 'multiples', label: 'Múltiplos (P/L e P/VP)', weight: 0.25, rationale: 'P/L ajustado pelo float e ROE normalizado permite comparação direta entre seguradoras.' },
    ],
    comparisonCriteria: ['Sinistralidade', 'Combined Ratio < 100%', 'ROE', 'Crescimento de Prêmios', 'P/L e Payout'],
    specificRisks: ['Eventos climáticos/catástrofes elevando sinistralidade', 'Dependência excessiva de resultado financeiro (Selic)', 'Concentração em canais bancários (bancassurance)', 'Alterações tributárias ou regulatórias SUSEP'],
    qualityCriteria: ['Combined Ratio consistentemente abaixo de 90%', 'Diversificação de ramos (vida, rural, prestamista, auto)', 'Subscrição disciplinada independentemente da Selic'],
    interpretationBenchmarks: {
      healthyNetDebtEbitdaMax: null,
      healthyRoeMinPct: 20,
      healthyRoicMinPct: null,
      healthyEbitdaMarginMinPct: null,
      healthyCurrentLiquidityMin: null,
    },
  },
  energia_eletrica: {
    id: 'energia_eletrica',
    name: 'Energia Elétrica',
    description: 'Geração, transmissão, distribuição e comercialização de energia elétrica.',
    priorityIndicators: ['Margem EBITDA', 'Dívida Líquida / EBITDA', 'ROIC', 'FCFF', 'CAPEX / Receita', 'Dividend Yield', 'EV/EBITDA', 'Cobertura de Juros'],
    notApplicableIndicators: ['Giro de Estoques', 'Prazo Médio de Estocagem'],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.50, rationale: 'Fluxos contratuais longos e indexados à inflação conferem alta visibilidade ao FCFF.' },
      { modelId: 'ddm', label: 'Dividend Discount Model (DDM)', weight: 0.30, rationale: 'Empresas maduras de transmissão/geração têm distribuição recorrente de dividendos.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e P/L)', weight: 0.20, rationale: 'EV/EBITDA captura estrutura de capital intensiva e depreciação regulatória.' },
    ],
    comparisonCriteria: ['Alavancagem (DL/EBITDA)', 'Prazo remanescente das concessões', 'ROIC vs WACC', 'Payout e FCF Yield'],
    specificRisks: ['Risco hidrológico (GSF) e curtailment renovável', 'Vencimento e renovação de concessões (ANEEL)', 'Inadimplência e perdas não técnicas na distribuição', 'Custo da dívida em ciclos de Selic elevada'],
    qualityCriteria: ['Contratos indexados ao IPCA/IGP-M', 'Baixo risco de volume (transmissão RAP)', 'Disciplina em leilões (TIR real adequada)'],
    interpretationBenchmarks: {
      healthyNetDebtEbitdaMax: 3.5,
      healthyRoeMinPct: 12,
      healthyRoicMinPct: 10,
      healthyEbitdaMarginMinPct: 35,
      healthyCurrentLiquidityMin: 1.0,
    },
  },
  saneamento: {
    id: 'saneamento',
    name: 'Saneamento',
    description: 'Serviços regulados de abastecimento de água e esgotamento sanitário.',
    priorityIndicators: ['Margem EBITDA', 'Dívida Líquida / EBITDA', 'CAPEX / Depreciação', 'ROIC', 'EV/EBITDA', 'Cobertura de Juros'],
    notApplicableIndicators: ['Giro de Estoques', 'Prazo Médio de Estocagem'],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.55, rationale: 'Base de ativos regulatória (RAB) e ciclo longo de investimentos exigem projeção explícita de CAPEX.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e EV/RAB)', weight: 0.25, rationale: 'EV/EBITDA e múltiplos sobre RAB refletem eficiência frente ao regulador.' },
      { modelId: 'ddm', label: 'DDM', weight: 0.20, rationale: 'Complementar para companhias em fase de menor intensidade de CAPEX.' },
    ],
    comparisonCriteria: ['Margem EBITDA', 'Índice de perdas na distribuição', 'Alavancagem vs CAPEX de universalização', 'ROIC'],
    specificRisks: ['Revisões tarifárias desfavoráveis', 'Interferência política em estatais', 'Metas rígidas de universalização (Marco do Saneamento)', 'Risco hídrico'],
    qualityCriteria: ['Eficiência PMSO abaixo do regulatório', 'Governança independente', 'Baixa inadimplência'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 3.5, healthyRoeMinPct: 12, healthyRoicMinPct: 9.5, healthyEbitdaMarginMinPct: 38, healthyCurrentLiquidityMin: 1.0 },
  },
  petroleo_gas: {
    id: 'petroleo_gas',
    name: 'Petróleo e Gás',
    description: 'Exploração, produção, refino, distribuição e comercialização de hidrocarbonetos.',
    priorityIndicators: ['FCFF', 'FCF Yield', 'ROIC', 'Margem EBITDA', 'Dívida Líquida / EBITDA', 'CAPEX / FCO', 'EV/EBITDA'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF com sensibilidade Brent/Câmbio)', weight: 0.60, rationale: 'Curva de produção, lifting cost e ciclo de CAPEX em E&P são melhor modelados no FCFF.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e FCF Yield)', weight: 0.25, rationale: 'Comparação com pares globais e locais via EV/EBITDA e retorno em caixa.' },
      { modelId: 'ddm', label: 'DDM (Fluxo de Retorno ao Acionista)', weight: 0.15, rationale: 'Captura política de distribuição de caixa excedente.' },
    ],
    comparisonCriteria: ['Lifting cost', 'Vida útil das reservas (1P/2P)', 'Breakeven Brent do FCF', 'Alavancagem'],
    specificRisks: ['Volatilidade do petróleo Brent e câmbio', 'Interferência em política de preços/dividendos', 'Risco ambiental e de descomissionamento', 'Declínio natural de campos maduros'],
    qualityCriteria: ['Lifting cost competitivo globalmente', 'Reposição orgânica de reservas > 100%', 'Disciplina de alocação de capital'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 2.0, healthyRoeMinPct: 14, healthyRoicMinPct: 12, healthyEbitdaMarginMinPct: 30, healthyCurrentLiquidityMin: 1.1 },
  },
  mineracao: {
    id: 'mineracao',
    name: 'Mineração',
    description: 'Extração, beneficiamento e logística de minério de ferro, metais básicos e minerais.',
    priorityIndicators: ['FCFF', 'FCF Yield', 'ROIC', 'Margem EBITDA', 'Dívida Líquida / EBITDA', 'EV/EBITDA', 'Cobertura de Juros'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF normalizado no ciclo)', weight: 0.60, rationale: 'Requer normalização de preços de commodities de longo prazo para evitar extrapolar picos cíclicos.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA normalizado e FCF Yield)', weight: 0.25, rationale: 'Múltiplo sobre EBITDA mid-cycle evita armadilha de P/L baixo no topo do ciclo.' },
      { modelId: 'ddm', label: 'DDM', weight: 0.15, rationale: 'Avalia retorno via dividendos/recompras ao longo do ciclo.' },
    ],
    comparisonCriteria: ['Custo caixa C1 / breakeven CFR China', 'Teor e prêmio de qualidade', 'Alavancagem líquida', 'Passivos socioambientais'],
    specificRisks: ['Desaceleração industrial chinesa / queda de minério', 'Passivos de barragens e licenciamento ambiental', 'Exposição cambial e custos de frete marítimo', 'Risco tributário/royalties (CFEM)'],
    qualityCriteria: ['Primeiro quartil da curva global de custos', 'Logística integrada porto-ferrovia', 'Balanço conservador para atravessar baixas cíclicas'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 1.5, healthyRoeMinPct: 15, healthyRoicMinPct: 13, healthyEbitdaMarginMinPct: 35, healthyCurrentLiquidityMin: 1.2 },
  },
  siderurgia: {
    id: 'siderurgia',
    name: 'Siderurgia',
    description: 'Produção de aços planos, longos e ligas metálicas.',
    priorityIndicators: ['Margem EBITDA', 'Giro de Estoques', 'Dívida Líquida / EBITDA', 'ROIC', 'FCFF', 'EV/EBITDA'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF mid-cycle)', weight: 0.55, rationale: 'Captura intensidade de capital e volatilidade de spreads metálicos.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e P/VP)', weight: 0.30, rationale: 'Útil na comparação de ativos industriais cíclicos.' },
      { modelId: 'nav_patrimonio', label: 'Valor Patrimonial Ajustado', weight: 0.15, rationale: 'Referência de piso econômico para ativos industriais pesados.' },
    ],
    comparisonCriteria: ['Spread metálico', 'Utilização de capacidade', 'Custo de energia/carvão/minério', 'Alavancagem'],
    specificRisks: ['Importação predatória de aço subsidiado', 'Ciclicidade de construção/automotivo', 'Alta necessidade de CAPEX de manutenção'],
    qualityCriteria: ['Integração vertical (minério/floresta/energia)', 'Mix de aços especiais de maior margem'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 2.0, healthyRoeMinPct: 12, healthyRoicMinPct: 10, healthyEbitdaMarginMinPct: 18, healthyCurrentLiquidityMin: 1.3 },
  },
  varejo: {
    id: 'varejo',
    name: 'Varejo',
    description: 'Comércio varejista físico, omnichannel e e-commerce.',
    priorityIndicators: ['Margem Bruta', 'Margem EBITDA', 'Giro de Estoques', 'Ciclo de Conversão de Caixa', 'ROIC', 'Dívida Líquida / EBITDA', 'FCO / Lucro Líquido'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.55, rationale: 'Capital de giro e ritmo de abertura/maturação de lojas determinam a geração de caixa.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e P/L)', weight: 0.35, rationale: 'Padrão de mercado para comparar eficiência e crescimento entre varejistas.' },
      { modelId: 'fcfe', label: 'FCFE', weight: 0.10, rationale: 'Sensível ao custo da dívida em operações alavancadas.' },
    ],
    comparisonCriteria: ['Margem bruta', 'SSS (Same-Store Sales)', 'Ciclo de conversão de caixa', 'Giro de estoque', 'ROIC vs custo de dívida'],
    specificRisks: ['Selic alta pressionando despesas financeiras e crédito ao consumo', 'Obsolescência de estoques e guerra de preços', 'Canibalização digital / competição cross-border', 'Alavancagem de aluguéis (IFRS 16)'],
    qualityCriteria: ['Ciclo de caixa negativo ou curto', 'Marca forte com baixo nível de descontos', 'Disciplina na expansão de lojas'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 2.0, healthyRoeMinPct: 14, healthyRoicMinPct: 12, healthyEbitdaMarginMinPct: 10, healthyCurrentLiquidityMin: 1.1 },
  },
  construcao_civil: {
    id: 'construcao_civil',
    name: 'Construção Civil',
    description: 'Engenharia, obras de infraestrutura e construção pesada.',
    priorityIndicators: ['Margem EBITDA', 'Prazo Médio de Recebimento', 'Liquidez Corrente', 'Dívida Líquida / EBITDA', 'ROIC', 'FCFF'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.50, rationale: 'Backlog de contratos e capital de giro comandam a conversão de EBITDA em caixa.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e P/L)', weight: 0.30, rationale: 'Avalia precificação relativa pelo backlog e margem.' },
      { modelId: 'nav_patrimonio', label: 'Patrimônio / NAV', weight: 0.20, rationale: 'Relevante quando há estoque relevante de equipamentos e recebíveis.' },
    ],
    comparisonCriteria: ['Margem bruta', 'Backlog/Receita', 'Ciclo de recebimento', 'Alavancagem'],
    specificRisks: ['Atraso de pagamentos públicos/contratantes', 'Estouro de orçamento em contratos preço-fechado', 'Inflação de insumos (INCC)'],
    qualityCriteria: ['Seleção rigorosa de contratos', 'Baixa concentração em único cliente público'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 2.2, healthyRoeMinPct: 12, healthyRoicMinPct: 11, healthyEbitdaMarginMinPct: 12, healthyCurrentLiquidityMin: 1.3 },
  },
  incorporadoras: {
    id: 'incorporadoras',
    name: 'Incorporadoras',
    description: 'Desenvolvimento imobiliário residencial e comercial (MCMV, médio e alto padrão).',
    priorityIndicators: ['Margem Bruta', 'ROE', 'Geração/Queima de Caixa (FCO)', 'Dívida Líquida / PL', 'Liquidez Corrente', 'P/VP', 'P/L'],
    notApplicableIndicators: ['Giro de Estoques tradicional sem POC'],
    recommendedValuationModels: [
      { modelId: 'nav_patrimonio', label: 'NAV / Valor Patrimonial Ajustado (Landbank + VGV)', weight: 0.40, rationale: 'Contabilidade POC e estoque de terrenos tornam o NAV essencial.' },
      { modelId: 'residual_income', label: 'Renda Residual / P/VP Justo', weight: 0.35, rationale: 'Relaciona ROE sobre patrimônio de incorporação com custo de capital.' },
      { modelId: 'multiples', label: 'Múltiplos (P/VP e P/L)', weight: 0.25, rationale: 'Comparação direta de múltiplos patrimoniais e lucros a apropriar (REF).' },
    ],
    comparisonCriteria: ['Margem bruta a apropriar (REF)', 'VSO', 'Dívida Líquida / PL', 'ROE'],
    specificRisks: ['Juros altos reduzindo capacidade de financiamento do comprador', 'Distratos e estoque pronto elevado', 'Estouro de custo de obra vs INCC'],
    qualityCriteria: ['VSO saudável', 'Baixa alavancagem corporativa fora do SFH', 'Landbank bem localizado'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 2.5, healthyRoeMinPct: 15, healthyRoicMinPct: 12, healthyEbitdaMarginMinPct: 22, healthyCurrentLiquidityMin: 1.5 },
  },
  agronegocio: {
    id: 'agronegocio',
    name: 'Agronegócio',
    description: 'Produção agrícola, terras, bioenergia, proteínas e insumos rurais.',
    priorityIndicators: ['Margem EBITDA', 'ROIC', 'Dívida Líquida / EBITDA', 'Ciclo de Conversão de Caixa', 'FCFF', 'EV/EBITDA'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.50, rationale: 'Projeta safra, produtividade e ciclo de capex biológico.' },
      { modelId: 'nav_patrimonio', label: 'NAV (Terras + Operação)', weight: 0.25, rationale: 'Essencial quando há banco de terras relevante no balanço.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA)', weight: 0.25, rationale: 'Comparação setorial por ciclo de commodity.' },
    ],
    comparisonCriteria: ['Produtividade por hectare', 'Custo unitário', 'Hedge cambial/commodities', 'Alavancagem'],
    specificRisks: ['Eventos climáticos extremos (El Niño / La Niña)', 'Oscilação de preços de grãos/açúcar/etanol', 'Risco de crédito rural e câmbio'],
    qualityCriteria: ['Hedge disciplinado', 'Irrigação/diversificação geográfica', 'Gestão eficiente de capital de giro'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 2.5, healthyRoeMinPct: 12, healthyRoicMinPct: 11, healthyEbitdaMarginMinPct: 22, healthyCurrentLiquidityMin: 1.2 },
  },
  tecnologia: {
    id: 'tecnologia',
    name: 'Tecnologia',
    description: 'Software corporativo (SaaS/ERP), serviços de TI, nuvem e plataformas digitais.',
    priorityIndicators: ['CAGR Receita', 'Margem Bruta', 'Margem EBITDA', 'ROIC', 'FCFF / Receita', 'Regra dos 40', 'EV/EBITDA', 'EV/Receita', 'P/L'],
    notApplicableIndicators: ['Giro de Estoques', 'Prazo Médio de Estocagem'],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF 7–10 anos)', weight: 0.60, rationale: 'Receita recorrente e alavancagem operacional tornam o DCF multi-estágio o modelo principal.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA, EV/Receita e PEG)', weight: 0.30, rationale: 'Captura crescimento ajustado por margem e retenção.' },
      { modelId: 'fcfe', label: 'FCFE', weight: 0.10, rationale: 'Complementar para empresas com caixa líquido relevante.' },
    ],
    comparisonCriteria: ['Crescimento orgânico ARR', 'Margem bruta > 60%', 'Conversão de EBITDA em caixa', 'ROIC sem ágio vs com ágio'],
    specificRisks: ['Obsolescência tecnológica e IA generativa disruptiva', 'Escassez e custo de talentos de engenharia', 'Integração de M&As seriais e perda de cultura', 'Churn elevado em PMEs'],
    qualityCriteria: ['Alto custo de troca (ERP/missão crítica)', 'Receita recorrente > 80%', 'Baixo CAPEX de manutenção frente a P&D'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 1.5, healthyRoeMinPct: 15, healthyRoicMinPct: 15, healthyEbitdaMarginMinPct: 22, healthyCurrentLiquidityMin: 1.2 },
  },
  telecomunicacoes: {
    id: 'telecomunicacoes',
    name: 'Telecomunicações',
    description: 'Operadoras móveis, banda larga fixa (FTTH) e serviços corporativos de conectividade.',
    priorityIndicators: ['Margem EBITDA', 'CAPEX / Receita', 'FCFF', 'Dívida Líquida / EBITDA', 'ROIC', 'Dividend Yield', 'EV/EBITDA'],
    notApplicableIndicators: ['Giro de Estoques'],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.55, rationale: 'Desaceleração do ciclo de CAPEX 5G/FTTH libera FCF relevante ao longo do horizonte.' },
      { modelId: 'ddm', label: 'DDM', weight: 0.25, rationale: 'Operadoras consolidadas operam com forte retorno em proventos.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA)', weight: 0.20, rationale: 'Compara intensidade de capital e margem EBITDAaL.' },
    ],
    comparisonCriteria: ['ARPU e Churn', 'CAPEX / Receita', 'FCF Yield', 'Alavancagem'],
    specificRisks: ['Guerra de preços na fibra óptica', 'Necessidade contínua de espectro e CAPEX tecnológico', 'Regulação Anatel'],
    qualityCriteria: ['Liderança de cobertura e marca', 'Conversão crescente de EBITDA em FCF'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 2.5, healthyRoeMinPct: 12, healthyRoicMinPct: 10, healthyEbitdaMarginMinPct: 38, healthyCurrentLiquidityMin: 0.9 },
  },
  transporte_logistica: {
    id: 'transporte_logistica',
    name: 'Transporte e Logística',
    description: 'Ferrovias, portos, rodovias concedidas, locação de frotas e logística.',
    priorityIndicators: ['ROIC', 'Margem EBITDA', 'Dívida Líquida / EBITDA', 'Cobertura de Juros', 'CAPEX / Depreciação', 'EV/EBITDA'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.60, rationale: 'Concessões com prazo definido e ciclo pesado de renovação de ativos exigem FCFF explícito.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e P/L)', weight: 0.25, rationale: 'Compara retornos sobre capital empregado e alavancagem.' },
      { modelId: 'fcfe', label: 'FCFE', weight: 0.15, rationale: 'Capta o impacto direto da estrutura de dívida no acionista.' },
    ],
    comparisonCriteria: ['Spread ROIC - Custo da dívida', 'Prazo de concessão', 'Alavancagem', 'Eficiência operacional'],
    specificRisks: ['Juros altos comprimindo lucro de empresas intensivas em dívida', 'Queda de valor residual de seminovos/ativos', 'Risco regulatório e reequilíbrio de concessões'],
    qualityCriteria: ['Contratos take-or-pay ou longo prazo', 'ROIC acima do WACC mesmo com juros altos'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 3.2, healthyRoeMinPct: 13, healthyRoicMinPct: 11, healthyEbitdaMarginMinPct: 28, healthyCurrentLiquidityMin: 1.0 },
  },
  industria: {
    id: 'industria',
    name: 'Indústria e Bens de Capital',
    description: 'Manufatura avançada, equipamentos industriais, motores, automação e bens de capital.',
    priorityIndicators: ['ROIC', 'Margem Bruta', 'Margem EBIT', 'CAGR Receita', 'Conversão Lucro em Caixa', 'Dívida Líquida / EBITDA', 'EV/EBITDA', 'P/L'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.60, rationale: 'Alta previsibilidade de ROIC, reinvestimento e expansão global se traduz diretamente em FCFF.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e P/L)', weight: 0.25, rationale: 'Referência relativa frente a pares industriais globais.' },
      { modelId: 'ddm', label: 'DDM', weight: 0.15, rationale: 'Capta distribuição crescente de lucros com baixo endividamento.' },
    ],
    comparisonCriteria: ['ROIC sustentado vs WACC', 'Margem EBIT', 'Presença internacional', 'Giro do ativo e capital de giro'],
    specificRisks: ['Desaceleração do CAPEX industrial global', 'Custo de matérias-primas (aço, cobre)', 'Variação cambial em receitas/custos', 'Competição asiática'],
    qualityCriteria: ['Verticalização eficiente', 'Engenharia proprietária e pós-venda recorrente', 'Caixa líquido ou baixa alavancagem'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 1.5, healthyRoeMinPct: 18, healthyRoicMinPct: 16, healthyEbitdaMarginMinPct: 18, healthyCurrentLiquidityMin: 1.5 },
  },
  saude: {
    id: 'saude',
    name: 'Saúde',
    description: 'Redes hospitalares, medicina diagnóstica, operadoras de saúde e varejo farmacêutico.',
    priorityIndicators: ['Margem EBITDA', 'Prazo Médio de Recebimento', 'ROIC', 'Dívida Líquida / EBITDA', 'FCO / EBITDA', 'EV/EBITDA'],
    notApplicableIndicators: [],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.55, rationale: 'Maturação de leitos/lojas e capital de giro (glosas/recebíveis) são críticos.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e P/L)', weight: 0.35, rationale: 'Comparação direta de escala e eficiência assistencial.' },
      { modelId: 'fcfe', label: 'FCFE', weight: 0.10, rationale: 'Avalia pressão do serviço da dívida em consolidadoras.' },
    ],
    comparisonCriteria: ['Taxa de ocupação / Ticket médio', 'PMR e nível de glosas', 'Alavancagem', 'ROIC incremental de M&As'],
    specificRisks: ['Sinistralidade elevada nas operadoras pressionando prestadores', 'Alongamento de recebíveis e glosas', 'Alavancagem pós-aquisições', 'Mudanças ANS/regulação'],
    qualityCriteria: ['Integração clínica e controle de custos', 'Disciplina de capital de giro', 'Poder de negociação com operadoras'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 3.0, healthyRoeMinPct: 13, healthyRoicMinPct: 11, healthyEbitdaMarginMinPct: 18, healthyCurrentLiquidityMin: 1.1 },
  },
  educacao: {
    id: 'educacao',
    name: 'Educação',
    description: 'Ensino superior presencial/EAD, cursos técnicos e sistemas de ensino básico.',
    priorityIndicators: ['Margem EBITDA', 'Prazo Médio de Recebimento', 'Conversão de Caixa (FCO/EBITDA)', 'Dívida Líquida / EBITDA', 'ROIC'],
    notApplicableIndicators: ['Giro de Estoques'],
    recommendedValuationModels: [
      { modelId: 'dcf_fcff', label: 'DCF (FCFF)', weight: 0.55, rationale: 'Evasão, ticket médio e PDD/inadimplência determinam fluxo de caixa real.' },
      { modelId: 'multiples', label: 'Múltiplos (EV/EBITDA e P/L)', weight: 0.30, rationale: 'Comparação setorial por base de alunos e mix presencial/EAD/medicina.' },
      { modelId: 'fcfe', label: 'FCFE', weight: 0.15, rationale: 'Importante em grupos com dívida financeira relevante.' },
    ],
    comparisonCriteria: ['Ticket médio e evasão', 'Share de cursos de medicina/premium', 'PMR e PDD', 'Geração de caixa livre'],
    specificRisks: ['Regulação MEC para EAD e vagas de medicina', 'Inadimplência estudantil', 'Pressão competitiva em preços no ensino digital'],
    qualityCriteria: ['Vagas de medicina e marcas consolidadas', 'Baixa PDD e forte conversão em caixa'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 2.5, healthyRoeMinPct: 12, healthyRoicMinPct: 11, healthyEbitdaMarginMinPct: 24, healthyCurrentLiquidityMin: 1.1 },
  },
  holdings: {
    id: 'holdings',
    name: 'Holdings',
    description: 'Sociedades de participações em empresas operacionais listadas ou fechadas.',
    priorityIndicators: ['Desconto de Holding (NAV)', 'Dividend Yield', 'Fluxo de Dividendos Recebidos', 'Dívida Líquida na Controladora', 'P/VP', 'ROE'],
    notApplicableIndicators: ['Giro de Estoques', 'Margem Bruta consolidada simples sem equivalência'],
    recommendedValuationModels: [
      { modelId: 'nav_patrimonio', label: 'Soma das Partes (SOTP / NAV com desconto de holding)', weight: 0.65, rationale: 'Valor econômico deriva diretamente das participações líquidas da dívida da holding.' },
      { modelId: 'ddm', label: 'Dividend Discount Model (DDM)', weight: 0.25, rationale: 'Captura repasse de dividendos menos despesas da estrutura.' },
      { modelId: 'multiples', label: 'Múltiplos (P/VP e P/L)', weight: 0.10, rationale: 'Referência secundária sobre patrimônio e equivalência patrimonial.' },
    ],
    comparisonCriteria: ['Desconto vs NAV histórico', 'Eficiência tributária (JCP/PIS-COFINS)', 'Alocação de capital dos controladores', 'Governança'],
    specificRisks: ['Ampliação do desconto de holding', 'Ineficiência tributária sobre dividendos/JCP', 'Alavancagem na holding sem fluxo próprio'],
    qualityCriteria: ['Histórico de alocação de capital geradora de valor', 'Baixo custo administrativo da holding', 'Alinhamento com minoritários'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: 1.5, healthyRoeMinPct: 14, healthyRoicMinPct: null, healthyEbitdaMarginMinPct: null, healthyCurrentLiquidityMin: 1.2 },
  },
  fiis: {
    id: 'fiis',
    name: 'Fundos Imobiliários (FIIs)',
    description: 'Fundos de Investimento Imobiliário listados na B3 (Tijolo, Papel/CRI, Híbridos e FOFs).',
    priorityIndicators: ['P/VP', 'Dividend Yield 12m', 'Rendimento Mensal / Cota', 'Vacância Física', 'Vacância Financeira', 'WAULT', 'Cap Rate Implícito', 'Liquidez Diária'],
    notApplicableIndicators: ['ROE Contábil Corporativo', 'ROIC', 'EV/EBITDA', 'Dívida Líquida / EBITDA', 'Giro de Estoques', 'FCFF Corporativo'],
    recommendedValuationModels: [
      { modelId: 'fii_model', label: 'Valuation Específico FII (DDM Rendimentos + Cap Rate + NAV)', weight: 0.70, rationale: 'FIIs distribuem >=95% do resultado caixa semestral; fluxo de rendimentos e valor patrimonial dos imóveis/CRIs determinam valor justo.' },
      { modelId: 'nav_patrimonio', label: 'Valor Patrimonial por Cota (P/VP ajustado)', weight: 0.30, rationale: 'Avalia prêmio ou desconto sobre laudos de avaliação ou marcação a mercado da carteira.' },
    ],
    comparisonCriteria: ['P/VP vs histórico', 'DY sustentável (sem ganho de capital extraordinário)', 'Vacância e WAULT (Tijolo) / LTV e Indexador (Papel)', 'Qualidade da gestão e liquidez'],
    specificRisks: ['Vacância prolongada e revisional negativa (Tijolo)', 'Default/calote de devedores de CRIs (Papel)', 'Alavancagem via CRI/securitização de recebíveis', 'Emissões abaixo do VP diluindo cotistas', 'Mudança de tributação sobre rendimentos'],
    qualityCriteria: ['Ativos triple-A ou contratos atípicos/garantias reais robustas', 'Diversificação de inquilinos/devedores', 'Transparência nos relatórios gerenciais'],
    interpretationBenchmarks: { healthyNetDebtEbitdaMax: null, healthyRoeMinPct: null, healthyRoicMinPct: null, healthyEbitdaMarginMinPct: null, healthyCurrentLiquidityMin: null },
  },
};
