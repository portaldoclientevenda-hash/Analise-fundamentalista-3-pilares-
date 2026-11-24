import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { buildAppZipArchive } from './server/zipExport.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

interface BcbSeriesResult {
  seriesId: number;
  label: string;
  unit: string;
  value: number | null;
  referenceDate: string | null;
  source: string;
  sourceUrl: string;
  collectedAt: string;
  status: 'live' | 'unavailable';
  error?: string;
}

interface MacroCacheEntry {
  expiresAt: number;
  data: {
    selicMetaPct: BcbSeriesResult;
    cdiAnualPct: BcbSeriesResult;
    ipca12mPct: BcbSeriesResult;
    ptaxUsdBrl: BcbSeriesResult;
    collectedAt: string;
  };
}

let macroCache: MacroCacheEntry | null = null;
const quoteCache = new Map<string, { expiresAt: number; payload: unknown }>();

async function fetchBcbSeries(seriesId: number, label: string, unit: string): Promise<BcbSeriesResult> {
  const sourceUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados/ultimos/1?formato=json`;
  const collectedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ApiceResearch/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        seriesId,
        label,
        unit,
        value: null,
        referenceDate: null,
        source: 'Banco Central do Brasil (SGS)',
        sourceUrl,
        collectedAt,
        status: 'unavailable',
        error: `HTTP ${res.status}`,
      };
    }
    const rows = (await res.json()) as Array<{ data: string; valor: string }>;
    const latest = Array.isArray(rows) ? rows[rows.length - 1] : undefined;
    const parsed = latest ? Number(String(latest.valor).replace(',', '.')) : NaN;
    if (!latest || !Number.isFinite(parsed)) {
      return {
        seriesId,
        label,
        unit,
        value: null,
        referenceDate: null,
        source: 'Banco Central do Brasil (SGS)',
        sourceUrl,
        collectedAt,
        status: 'unavailable',
        error: 'Resposta sem valor numérico válido',
      };
    }
    return {
      seriesId,
      label,
      unit,
      value: parsed,
      referenceDate: latest.data,
      source: 'Banco Central do Brasil (SGS)',
      sourceUrl,
      collectedAt,
      status: 'live',
    };
  } catch (err) {
    return {
      seriesId,
      label,
      unit,
      value: null,
      referenceDate: null,
      source: 'Banco Central do Brasil (SGS)',
      sourceUrl,
      collectedAt,
      status: 'unavailable',
      error: err instanceof Error ? err.message : 'Falha de conexão com BCB',
    };
  }
}

async function fetchB3Quote(rawTicker: string) {
  const ticker = rawTicker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const now = Date.now();
  const cached = quoteCache.get(ticker);
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const collectedAt = new Date().toISOString();
  // 1) Try brapi.dev public endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const brapiUrl = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`;
    const res = await fetch(brapiUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ApiceResearch/1.0' },
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = (await res.json()) as {
        results?: Array<{
          symbol?: string;
          regularMarketPrice?: number;
          regularMarketChangePercent?: number;
          regularMarketTime?: string;
          currency?: string;
        }>;
      };
      const item = json.results?.[0];
      if (item && typeof item.regularMarketPrice === 'number' && Number.isFinite(item.regularMarketPrice)) {
        const payload = {
          ticker,
          price: item.regularMarketPrice,
          changePct: typeof item.regularMarketChangePercent === 'number' ? item.regularMarketChangePercent : null,
          currency: item.currency ?? 'BRL',
          marketTime: item.regularMarketTime ?? collectedAt,
          source: 'brapi.dev (B3)',
          sourceUrl: brapiUrl,
          collectedAt,
          status: 'live' as const,
        };
        quoteCache.set(ticker, { expiresAt: now + 5 * 60 * 1000, payload });
        return payload;
      }
    }
  } catch {
    // Fallback to Yahoo Finance chart endpoint
  }

  // 2) Try Yahoo Finance .SA public chart endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.SA?interval=1d&range=5d`;
    const res = await fetch(yfUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = (await res.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              chartPreviousClose?: number;
              currency?: string;
              regularMarketTime?: number;
            };
          }>;
        };
      };
      const meta = json.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === 'number' && Number.isFinite(meta.regularMarketPrice)) {
        const prev = meta.chartPreviousClose ?? meta.regularMarketPrice;
        const changePct = prev > 0 ? ((meta.regularMarketPrice - prev) / prev) * 100 : null;
        const payload = {
          ticker,
          price: meta.regularMarketPrice,
          changePct,
          currency: meta.currency ?? 'BRL',
          marketTime: meta.regularMarketTime
            ? new Date(meta.regularMarketTime * 1000).toISOString()
            : collectedAt,
          source: 'Yahoo Finance (.SA)',
          sourceUrl: yfUrl,
          collectedAt,
          status: 'live' as const,
        };
        quoteCache.set(ticker, { expiresAt: now + 5 * 60 * 1000, payload });
        return payload;
      }
    }
  } catch {
    // Return explicit unavailable status below
  }

  return {
    ticker,
    price: null,
    changePct: null,
    currency: 'BRL',
    marketTime: null,
    source: 'Provedores públicos (brapi.dev / Yahoo Finance)',
    sourceUrl: `https://brapi.dev/api/quote/${ticker}`,
    collectedAt,
    status: 'unavailable' as const,
    error: 'Cotação pública indisponível no momento; valor de referência local mantido com registro de data.',
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const AI_SYSTEM_INSTRUCTION = `Você é o analista-chefe institucional da plataforma Ápice Research.
Regras inegociáveis:
1. NUNCA invente, altere ou estime números que não estejam explicitamente no payload determinístico recebido. Se um dado for nulo/N/A, declare expressamente como "dado indisponível / não aplicável".
2. Diferencie claramente: (a) Fato observado nas demonstrações, (b) Estimativa/Premissa de modelo e (c) Opinião analítica.
3. Cite sempre as fontes e datas de referência fornecidas no contexto.
4. Nunca faça recomendação personalizada de compra ou venda (CVM); produza análise fundamentalista institucional baseada em qualidade financeira, vantagens competitivas e margem de segurança.
5. Estruture respostas executivas em português claro e objetivo seguindo os blocos A-H quando aplicável: (A) Fato observado, (B) Evidência, (C) Interpretação, (D) Contexto, (E) Impacto, (F) Risco, (G) Perspectiva, (H) Conclusão.`;

async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'apice-research-api',
      aiConfigured: Boolean(getGeminiClient()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/collector/macro', async (_req, res) => {
    const now = Date.now();
    if (macroCache && macroCache.expiresAt > now) {
      res.json(macroCache.data);
      return;
    }
    const [selicMetaPct, cdiAnualPct, ipca12mPct, ptaxUsdBrl] = await Promise.all([
      fetchBcbSeries(432, 'Selic Meta (% a.a.)', '%'),
      fetchBcbSeries(4389, 'CDI Anualizado (% a.a.)', '%'),
      fetchBcbSeries(13522, 'IPCA Acumulado 12m (%)', '%'),
      fetchBcbSeries(1, 'Dólar PTAX Venda (R$)', 'BRL'),
    ]);

    const data = {
      selicMetaPct,
      cdiAnualPct,
      ipca12mPct,
      ptaxUsdBrl,
      collectedAt: new Date().toISOString(),
    };
    const anyLive =
      selicMetaPct.status === 'live' ||
      cdiAnualPct.status === 'live' ||
      ipca12mPct.status === 'live' ||
      ptaxUsdBrl.status === 'live';
    if (anyLive) {
      macroCache = { expiresAt: now + 30 * 60 * 1000, data };
    }
    res.json(data);
  });

  app.get('/api/collector/quote/:ticker', async (req, res) => {
    const ticker = String(req.params.ticker || '').trim();
    if (!/^[a-zA-Z0-9]{4,8}$/.test(ticker)) {
      res.status(400).json({ error: 'Ticker inválido para consulta na B3.' });
      return;
    }
    const quote = await fetchB3Quote(ticker);
    res.json(quote);
  });

  app.get('/api/collector/cvm/status', async (_req, res) => {
    const url = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv';
    const checkedAt = new Date().toISOString();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const r = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      res.json({
        source: 'Portal Dados Abertos CVM (DFP / ITR / FCA / FRE)',
        url,
        status: r.ok ? 'reachable' : 'unavailable',
        httpStatus: r.status,
        checkedAt,
      });
    } catch (err) {
      res.json({
        source: 'Portal Dados Abertos CVM (DFP / ITR / FCA / FRE)',
        url,
        status: 'unavailable',
        checkedAt,
        error: err instanceof Error ? err.message : 'Timeout ao consultar CVM',
      });
    }
  });

  app.post('/api/assets/validate-import', (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ valid: false, errors: ['Payload JSON ausente ou inválido.'] });
      return;
    }
    const errors: string[] = [];
    const ticker = typeof body.ticker === 'string' ? body.ticker.toUpperCase().trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!/^[A-Z0-9]{4,8}$/.test(ticker)) errors.push('Ticker B3 inválido (esperado ex.: WEGE3, HGLG11).');
    if (name.length < 2) errors.push('Nome da companhia/fundo é obrigatório.');
    if (!Array.isArray(body.balanceSheets) || body.balanceSheets.length === 0) {
      errors.push('Ao menos 1 período de Balanço Patrimonial é obrigatório.');
    } else {
      for (const bs of body.balanceSheets as Array<Record<string, unknown>>) {
        const at = Number(bs.ativoTotal);
        const pc = Number(bs.passivoCirculante);
        const pnc = Number(bs.passivoNaoCirculante);
        const pl = Number(bs.patrimonioLiquidoTotal);
        if ([at, pc, pnc, pl].some((v) => !Number.isFinite(v))) {
          errors.push(`Período ${String(bs.period ?? '?')}: valores numéricos ausentes na equação contábil.`);
        } else if (Math.abs(at - (pc + pnc + pl)) > Math.max(1.5, Math.abs(at) * 0.005)) {
          errors.push(
            `Período ${String(bs.period ?? '?')}: Ativo (${at}) difere de Passivo + PL (${pc + pnc + pl}).`
          );
        }
      }
    }
    if (!Array.isArray(body.incomeStatements) || body.incomeStatements.length === 0) {
      errors.push('Ao menos 1 período de DRE é obrigatório.');
    }
    if (!Array.isArray(body.cashFlows) || body.cashFlows.length === 0) {
      errors.push('Ao menos 1 período de Fluxo de Caixa (DFC) é obrigatório.');
    }
    if (errors.length > 0) {
      res.status(422).json({ valid: false, errors });
      return;
    }
    res.json({ valid: true, ticker, periodsCount: (body.balanceSheets as unknown[]).length });
  });

  app.post('/api/ai/interpret', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Serviço de IA indisponível: GEMINI_API_KEY não configurada no ambiente do servidor.',
      });
      return;
    }
    const { context } = req.body as { context?: unknown };
    if (!context) {
      res.status(400).json({ error: 'Contexto fundamentalista ausente.' });
      return;
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analise exclusivamente os dados determinísticos abaixo e produza uma síntese executiva nos blocos A a H, destacando qualidade financeira, vantagens competitivas, alinhamento ROIC vs WACC, sensibilidades de valuation e eventuais lacunas de dados.\n\nDADOS DETERMINÍSTICOS:\n${JSON.stringify(context)}`,
        config: {
          systemInstruction: AI_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      res.json({
        text: response.text ?? '',
        model: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erro ao consultar modelo Gemini no servidor.',
      });
    }
  });

  app.post('/api/ai/qa', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Serviço de IA indisponível: GEMINI_API_KEY não configurada no ambiente do servidor.',
      });
      return;
    }
    const { question, context } = req.body as { question?: string; context?: unknown };
    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      res.status(400).json({ error: 'Pergunta inválida.' });
      return;
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Pergunta do analista: "${question.trim()}"\n\nResponda usando exclusivamente os números e fatos do contexto abaixo. Se a resposta depender de dado não presente no contexto, explicite essa lacuna.\n\nCONTEXTO DO ATIVO:\n${JSON.stringify(context)}`,
        config: {
          systemInstruction: AI_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      res.json({
        text: response.text ?? '',
        model: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erro ao consultar modelo Gemini no servidor.',
      });
    }
  });

  app.post('/api/ai/executive-report', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Serviço de IA indisponível: GEMINI_API_KEY não configurada no ambiente do servidor.',
      });
      return;
    }
    const { context, reportType } = req.body as { context?: unknown; reportType?: string };
    if (!context) {
      res.status(400).json({ error: 'Contexto do relatório ausente.' });
      return;
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Gere um memorando executivo de comitê de investimentos (formato: ${reportType ?? 'completo'}) com base estrita no JSON abaixo. Separe explicitamente fatos históricos, premissas de valuation e riscos/alertas.\n\nJSON:\n${JSON.stringify(context)}`,
        config: {
          systemInstruction: AI_SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      res.json({
        text: response.text ?? '',
        model: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erro ao gerar relatório executivo via Gemini.',
      });
    }
  });

  app.get('/api/export/app-zip', (_req, res) => {
    try {
      const archive = buildAppZipArchive(__dirname);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="apice-research-app.zip"');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Archive-Files', String(archive.fileCount));
      res.send(archive.buffer);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Falha ao empacotar código-fonte do aplicativo.',
      });
    }
  });

  const distDir = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production';
  let mountedVite = false;

  if (!isProd) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      mountedVite = true;
    } catch {
      mountedVite = false;
    }
  }

  if (!mountedVite) {
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Endpoint de API não encontrado.' });
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build dist/index.html não encontrado. Execute npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Apice Research] Servidor ativo na porta ${PORT}`);
  });
}

createAppServer().catch((err) => {
  console.error('Erro fatal ao iniciar servidor:', err);
  process.exit(1);
});
