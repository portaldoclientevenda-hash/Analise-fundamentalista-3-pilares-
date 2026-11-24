import React, { useEffect, useState } from 'react';
import { Building2, Download, PackageCheck, RefreshCw, Save, Shield, Sliders } from 'lucide-react';
import { PillarWeightsConfig } from '../engine/types.ts';
import { FirestoreAuditEntry, OrganizationRecord } from '../firebase.ts';

export function AdminWorkspace({
  weights,
  onChangeWeights,
  onSaveWeights,
  orgs,
  activeOrg,
  onSwitchOrg,
  onCreateOrg,
  auditLogs,
  isAuthenticated,
  onDownloadAppZip,
  downloadingZip = false,
}: {
  weights: PillarWeightsConfig;
  onChangeWeights: (next: PillarWeightsConfig) => void;
  onSaveWeights: () => Promise<void>;
  orgs: OrganizationRecord[];
  activeOrg: OrganizationRecord | null;
  onSwitchOrg: (orgId: string) => void;
  onCreateOrg: (name: string, cnpj?: string) => Promise<void>;
  auditLogs: FirestoreAuditEntry[];
  isAuthenticated: boolean;
  onDownloadAppZip: () => void;
  downloadingZip?: boolean;
}) {
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCnpj, setNewOrgCnpj] = useState('');
  const [cvmStatus, setCvmStatus] = useState<{ status: string; checkedAt?: string; error?: string } | null>(null);
  const [savingWeights, setSavingWeights] = useState(false);

  const checkCvm = async () => {
    try {
      const res = await fetch('/api/collector/cvm/status');
      const json = (await res.json()) as { status: string; checkedAt?: string; error?: string };
      setCvmStatus(json);
    } catch {
      setCvmStatus({ status: 'unavailable', error: 'Falha ao consultar API local do coletor.' });
    }
  };

  useEffect(() => {
    void checkCvm();
  }, []);

  const handleSaveWeights = async () => {
    setSavingWeights(true);
    try {
      await onSaveWeights();
    } finally {
      setSavingWeights(false);
    }
  };

  const canManageWeights = !isAuthenticated || activeOrg?.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Multi-Tenant Organization Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-teal-600" />
          <div>
            <h2 className="text-base font-bold">Organização & Isolamento Multi-Tenant</h2>
            <p className="text-xs text-slate-500">
              {isAuthenticated
                ? `Tenant ativo: ${activeOrg?.name ?? 'Nenhum'} · Papel RBAC: ${activeOrg?.role?.toUpperCase() ?? 'N/D'}`
                : 'Conecte sua conta Google no topo para persistir organizações, pesos e logs de auditoria no Firestore.'}
            </p>
          </div>
        </div>

        {isAuthenticated && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="font-semibold">Suas Organizações</div>
              <div className="space-y-1.5">
                {orgs.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onSwitchOrg(o.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border flex items-center justify-between cursor-pointer ${
                      activeOrg?.id === o.id
                        ? 'border-teal-600 bg-teal-50/40 dark:bg-teal-950/30 font-semibold'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span>{o.name}</span>
                    <span className="font-mono uppercase text-[11px]">{o.role}</span>
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newOrgName.trim()) return;
                await onCreateOrg(newOrgName.trim(), newOrgCnpj.trim() || undefined);
                setNewOrgName('');
                setNewOrgCnpj('');
              }}
              className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5"
            >
              <div className="font-semibold">Criar Novo Escritório / Tenant</div>
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Nome do Escritório / Fundo (ex.: Vértice Capital)"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5"
              />
              <input
                type="text"
                value={newOrgCnpj}
                onChange={(e) => setNewOrgCnpj(e.target.value)}
                placeholder="CNPJ opcional"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5"
              />
              <button
                type="submit"
                disabled={!newOrgName.trim()}
                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium disabled:opacity-50 cursor-pointer"
              >
                Criar Organização Isolada
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Calibratable Scoring Weights */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="text-sm font-bold">Calibração de Pesos do Motor de Scoring (3 Pilares)</h3>
              <p className="text-xs text-slate-500">
                Padrão institucional: 35% Financeiro / 35% Qualitativo / 30% Valuation.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!canManageWeights || savingWeights}
            onClick={handleSaveWeights}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingWeights ? 'Salvando...' : 'Salvar Política de Pesos'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {[
            { key: 'financialWeight' as const, label: 'Peso Pilar 1 — Financeiro' },
            { key: 'qualitativeWeight' as const, label: 'Peso Pilar 2 — Qualitativo' },
            { key: 'valuationWeight' as const, label: 'Peso Pilar 3 — Valuation' },
          ].map((item) => (
            <label key={item.key} className="block border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between font-medium">
                <span>{item.label}</span>
                <span className="font-mono font-bold">
                  {(weights.overall[item.key] * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.6}
                step={0.05}
                value={weights.overall[item.key]}
                onChange={(e) =>
                  onChangeWeights({
                    ...weights,
                    overall: { ...weights.overall, [item.key]: Number(e.target.value) },
                  })
                }
                className="w-full accent-teal-700"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Collector Status & Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Coletor Automatizado (BCB / CVM / B3)</h3>
            <button
              type="button"
              onClick={checkCvm}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Testar CVM
            </button>
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            Status Portal CVM Dados Abertos:{' '}
            <strong className="font-mono">{cvmStatus?.status ?? 'verificando...'}</strong>
          </p>
          <p className="text-slate-500">
            Rotina agendada em <code className="font-mono">.github/workflows/coletar.yml</code> executando <code className="font-mono">coletor/coletar.ts</code> nos dias úteis após o fechamento do pregão.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold">Trilha de Auditoria Imutável (Tenant Ativo)</h3>
          </div>
          {auditLogs.length === 0 ? (
            <p className="text-slate-500">
              {isAuthenticated
                ? 'Nenhum evento registrado ainda nesta organização.'
                : 'Faça login para visualizar os logs auditáveis da sua organização.'}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {auditLogs.map((l) => (
                <div
                  key={l.id}
                  className="border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1.5 flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    <strong className="font-mono">{l.action}</strong>{' '}
                    {l.targetTicker ? `(${l.targetTicker})` : ''} · {l.details}
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">{l.userDisplayName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Export Full Application Package (.zip) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <PackageCheck className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold">Baixar Código-Fonte Completo do App (.zip)</h3>
            <p className="text-xs text-slate-500 max-w-2xl">
              Gera o pacote <code className="font-mono">apice-research-app.zip</code> com frontend React, motor fundamentalista, servidor Express (<code className="font-mono">server.ts</code>), regras Firestore, testes e <code className="font-mono">README.md</code> para rodar localmente com <code className="font-mono">npm install &amp;&amp; npm run dev</code> (sem incluir chaves privadas ou <code className="font-mono">node_modules</code>).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDownloadAppZip}
          disabled={downloadingZip}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-60 cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4" />
          {downloadingZip ? 'Empacotando .zip...' : 'Baixar apice-research-app.zip'}
        </button>
      </div>
    </div>
  );
}
