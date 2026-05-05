import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;

  try {
    if (isLocal) {
      // --- AMBIENTE LOCAL: Roda scripts diretamente ---
      console.log('🚀 Iniciando atualização local...');
      await execAsync('npm run scrape:pw');
      await execAsync('npm run analise');
      const date = new Date().toLocaleString('pt-BR');
      await execAsync(`git add . && git commit -m "data: local update ${date}" && git push`);
      
      return NextResponse.json({ success: true, message: 'Dados atualizados localmente!' });
    } else {
      // --- AMBIENTE NUVEM (VERCEL): Dispara o GitHub Action ---
      console.log('☁️ Iniciando atualização remota via GitHub Actions...');
      
      const GITHUB_TOKEN = process.env.GH_TOKEN; // Você precisará configurar isso na Vercel
      const REPO_OWNER = 'mantolatv-cmyk';
      const REPO_NAME = 'cousinservices';

      if (!GITHUB_TOKEN) {
        throw new Error('GH_TOKEN não configurado nas variáveis de ambiente da Vercel.');
      }

      const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'CousinServices-App'
        },
        body: JSON.stringify({
          event_type: 'update_data'
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Falha ao disparar GitHub Action: ${errorText}`);
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Robô do GitHub ativado! Os dados serão atualizados em alguns minutos.' 
      });
    }
  } catch (error) {
    console.error('❌ Erro na atualização:', error);
    return NextResponse.json({ 
      success: false, 
      message: (error as Error).message 
    }, { status: 500 });
  }
}
