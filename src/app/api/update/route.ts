// ============================================================
// CousinServices — API Route: /api/update
// Pipeline completa: Scraping → Análise → Sync
// Funciona local (exec) e cloud (GitHub Actions)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

// Opções robustas para exec — scraping pode gerar muito output e demorar
const EXEC_OPTIONS = {
  cwd: path.resolve(process.cwd()),
  maxBuffer: 50 * 1024 * 1024,  // 50MB buffer (scrapers geram muito log)
  timeout: 5 * 60 * 1000,       // 5 minutos por comando
  env: { ...process.env, NODE_ENV: 'production' },
  shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
};

interface PipelineResult {
  success: boolean;
  message: string;
  phases: Array<{
    name: string;
    status: 'success' | 'error' | 'skipped';
    durationMs: number;
    details?: string;
  }>;
  totalDurationMs: number;
}

async function runLocalPipeline(): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const phases: PipelineResult['phases'] = [];
  let hasErrors = false;

  // ==================== FASE 1: SCRAPING ====================
  const phase1Start = Date.now();
  console.log('\n🚀 [Update API] FASE 1/3 — Scraping de leiloeiros...');

  try {
    // Usa npx tsx diretamente para evitar problemas com npm run
    const scraperCmd = process.platform === 'win32'
      ? 'npx tsx src/scripts/scraper-playwright.ts'
      : 'npx tsx src/scripts/scraper-playwright.ts';

    const { stdout, stderr } = await execAsync(scraperCmd, EXEC_OPTIONS);

    const phase1Duration = Date.now() - phase1Start;
    console.log(`✅ [Update API] Scraping concluído em ${(phase1Duration / 1000).toFixed(1)}s`);

    // Extrair contagem de itens do output
    const totalMatch = stdout.match(/TOTAL:\s*(\d+)\s*terrenos/);
    const totalItems = totalMatch ? totalMatch[1] : '?';

    phases.push({
      name: 'Scraping de Leiloeiros',
      status: 'success',
      durationMs: phase1Duration,
      details: `${totalItems} terrenos coletados de 11 fontes`,
    });

    if (stderr && !stderr.includes('Warning')) {
      console.warn(`⚠️ [Update API] Stderr do scraper: ${stderr.substring(0, 200)}`);
    }
  } catch (err) {
    const phase1Duration = Date.now() - phase1Start;
    const errorMsg = (err as Error).message || 'Erro desconhecido';
    console.error(`❌ [Update API] Scraping falhou: ${errorMsg}`);

    phases.push({
      name: 'Scraping de Leiloeiros',
      status: 'error',
      durationMs: phase1Duration,
      details: errorMsg.substring(0, 300),
    });

    hasErrors = true;

    // Se scraping falhou completamente, ainda tenta rodar a análise
    // com os dados que já existem (leiloes.json anterior)
    console.log('⚠️ [Update API] Tentando análise com dados existentes...');
  }

  // ==================== FASE 2: ANÁLISE FINANCEIRA ====================
  const phase2Start = Date.now();
  console.log('\n💰 [Update API] FASE 2/3 — Análise financeira...');

  try {
    const analiseCmd = 'npx tsx src/scripts/analise.ts';
    const { stdout } = await execAsync(analiseCmd, EXEC_OPTIONS);

    const phase2Duration = Date.now() - phase2Start;
    console.log(`✅ [Update API] Análise concluída em ${(phase2Duration / 1000).toFixed(1)}s`);

    // Extrair info do output
    const viableMatch = stdout.match(/(\d+)\s*com ROI/);
    const viableCount = viableMatch ? viableMatch[1] : '?';

    phases.push({
      name: 'Análise Financeira',
      status: 'success',
      durationMs: phase2Duration,
      details: `${viableCount} oportunidades viáveis identificadas`,
    });
  } catch (err) {
    const phase2Duration = Date.now() - phase2Start;
    const errorMsg = (err as Error).message || 'Erro desconhecido';
    console.error(`❌ [Update API] Análise falhou: ${errorMsg}`);

    phases.push({
      name: 'Análise Financeira',
      status: 'error',
      durationMs: phase2Duration,
      details: errorMsg.substring(0, 300),
    });

    hasErrors = true;
  }

  // ==================== FASE 3: GIT SYNC (opcional) ====================
  const phase3Start = Date.now();
  console.log('\n📤 [Update API] FASE 3/3 — Sincronização com GitHub...');

  try {
    const date = new Date().toLocaleString('pt-BR');
    const gitOpts = { ...EXEC_OPTIONS, timeout: 30000 }; // 30s para git

    // Verifica se estamos em um repo git
    await execAsync('git status --porcelain', gitOpts);

    // Adiciona apenas os arquivos de dados
    await execAsync('git add leiloes.json analise-resultado.json reports/', gitOpts);

    // Commit
    await execAsync(`git commit -m "data: update auction data ${date}" --allow-empty`, gitOpts);

    // Push
    await execAsync('git push', gitOpts);

    const phase3Duration = Date.now() - phase3Start;
    console.log(`✅ [Update API] Git sync concluído em ${(phase3Duration / 1000).toFixed(1)}s`);

    phases.push({
      name: 'Sincronização GitHub',
      status: 'success',
      durationMs: phase3Duration,
      details: 'Dados commitados e enviados ao repositório',
    });
  } catch (err) {
    const phase3Duration = Date.now() - phase3Start;
    const errorMsg = (err as Error).message || 'Erro desconhecido';
    console.warn(`⚠️ [Update API] Git sync ignorado: ${errorMsg.substring(0, 100)}`);

    phases.push({
      name: 'Sincronização GitHub',
      status: 'skipped',
      durationMs: phase3Duration,
      details: 'Git push opcional — dados já estão salvos localmente',
    });
  }

  const totalDuration = Date.now() - pipelineStart;
  const successPhases = phases.filter(p => p.status === 'success').length;

  return {
    success: !hasErrors || successPhases >= 2,
    message: hasErrors
      ? `Pipeline parcial: ${successPhases}/${phases.length} fases concluídas com sucesso`
      : `Pipeline completa em ${(totalDuration / 1000).toFixed(0)}s — dados atualizados!`,
    phases,
    totalDurationMs: totalDuration,
  };
}

async function triggerCloudUpdate(): Promise<PipelineResult> {
  const start = Date.now();

  const GITHUB_TOKEN = process.env.GH_TOKEN;
  const REPO_OWNER = 'mantolatv-cmyk';
  const REPO_NAME = 'cousinservices';

  if (!GITHUB_TOKEN) {
    return {
      success: false,
      message: 'GH_TOKEN não configurado nas variáveis de ambiente da Vercel.',
      phases: [{ name: 'GitHub Actions', status: 'error', durationMs: 0, details: 'Token ausente' }],
      totalDurationMs: 0,
    };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'CousinServices-App',
      },
      body: JSON.stringify({ event_type: 'update_data' }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`GitHub API respondeu ${res.status}: ${errorText}`);
    }

    return {
      success: true,
      message: '🤖 GitHub Action disparada! Os dados serão atualizados em 3-5 minutos.',
      phases: [{ name: 'GitHub Actions Dispatch', status: 'success', durationMs: Date.now() - start }],
      totalDurationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      message: `Erro ao disparar GitHub Action: ${(err as Error).message}`,
      phases: [{ name: 'GitHub Actions Dispatch', status: 'error', durationMs: Date.now() - start, details: (err as Error).message }],
      totalDurationMs: Date.now() - start,
    };
  }
}

export async function POST(req: NextRequest) {
  const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 [Update API] Iniciando atualização (${isLocal ? 'LOCAL' : 'CLOUD'})...`);
  console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
  console.log(`${'═'.repeat(60)}\n`);

  try {
    const result = isLocal
      ? await runLocalPipeline()
      : await triggerCloudUpdate();

    console.log(`\n${result.success ? '✅' : '⚠️'} [Update API] ${result.message}`);

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (err) {
    console.error(`\n💥 [Update API] Erro fatal: ${(err as Error).message}`);

    return NextResponse.json({
      success: false,
      message: `Erro fatal: ${(err as Error).message}`,
      phases: [],
      totalDurationMs: 0,
    }, { status: 500 });
  }
}
