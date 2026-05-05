import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    // In local development, we can run shell commands.
    // We execute the scripts sequentially to match update.bat logic, but without the 'pause'
    console.log('🚀 Iniciando atualização remota via Dashboard...');

    // Step 1: Scraping
    console.log('  [1/3] Rodando scraper...');
    await execAsync('npm run scrape:pw');

    // Step 2: Analysis
    console.log('  [2/3] Rodando análise...');
    await execAsync('npm run analise');

    // Step 3: Git Sync (Optional but requested as per update.bat integration)
    console.log('  [3/3] Sincronizando com GitHub...');
    const date = new Date().toLocaleString('pt-BR');
    await execAsync(`git add . && git commit -m "data: dashboard auto-update ${date}" && git push`);

    console.log('✅ Atualização concluída com sucesso!');

    return NextResponse.json({ 
      success: true, 
      message: 'Dados atualizados e sincronizados com sucesso!' 
    });
  } catch (error) {
    console.error('❌ Erro na atualização:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Erro durante a atualização: ' + (error as Error).message 
    }, { status: 500 });
  }
}
