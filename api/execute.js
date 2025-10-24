/**
 * 🎬 Vercel Serverless Function - Browserbase Executor (COM DEBUG)
 */

import { Stagehand } from '@browserbasehq/stagehand';

export const config = {
  maxDuration: 10,
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Use POST method' 
    });
  }

  // 🐛 DEBUG: Verificar se as variáveis existem
  console.log('🔍 Verificando variáveis de ambiente...');
  console.log('BROWSERBASE_API_KEY existe?', !!process.env.BROWSERBASE_API_KEY);
  console.log('BROWSERBASE_PROJECT_ID existe?', !!process.env.BROWSERBASE_PROJECT_ID);
  console.log('ANTHROPIC_API_KEY existe?', !!process.env.ANTHROPIC_API_KEY);
  
  // Mostrar primeiros caracteres (seguro)
  if (process.env.BROWSERBASE_API_KEY) {
    console.log('BROWSERBASE_API_KEY começa com:', process.env.BROWSERBASE_API_KEY.substring(0, 10) + '...');
  }
  if (process.env.BROWSERBASE_PROJECT_ID) {
    console.log('BROWSERBASE_PROJECT_ID:', process.env.BROWSERBASE_PROJECT_ID.substring(0, 10) + '...');
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY começa com:', process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...');
  }

  const { prompt, url } = req.body;

  if (!prompt) {
    return res.status(400).json({ 
      error: 'Prompt é obrigatório',
      example: {
        prompt: 'Entre no Google e pesquise por IA',
        url: 'https://google.com'
      }
    });
  }

  // Verificar se as chaves estão presentes
  if (!process.env.BROWSERBASE_API_KEY) {
    return res.status(500).json({
      error: 'BROWSERBASE_API_KEY não configurada',
      message: 'Adicione a variável no dashboard da Vercel'
    });
  }

  if (!process.env.BROWSERBASE_PROJECT_ID) {
    return res.status(500).json({
      error: 'BROWSERBASE_PROJECT_ID não configurada',
      message: 'Adicione a variável no dashboard da Vercel'
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY não configurada',
      message: 'Adicione a variável no dashboard da Vercel'
    });
  }

  console.log('🎬 Iniciando execução...');
  console.log('📝 Prompt:', prompt);
  console.log('🌐 URL:', url || 'Nenhuma');

  const passos = [];
  let stagehand;
  let sessionId;

  try {
    // 1️⃣ Inicializar Stagehand com Browserbase
    console.log('🔌 Conectando ao Browserbase...');
    
    stagehand = new Stagehand({
      env: 'BROWSERBASE',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      verbose: 1,
      modelName: 'anthropic/claude-sonnet-4-20250514',
      modelClientOptions: {
        apiKey: process.env.ANTHROPIC_API_KEY
      },
      enableCaching: true
    });

    console.log('⏳ Inicializando Stagehand...');
    await stagehand.init();
    sessionId = stagehand.sessionId;
    console.log('✅ Sessão criada:', sessionId);

    const page = stagehand.page;

    // 2️⃣ Navegar para URL se fornecida
    if (url) {
      console.log(`🌍 Navegando para ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle' });
      
      const screenshot1 = await page.screenshot({ type: 'png' });
      passos.push({
        numero: 1,
        acao: `Navegou para ${url}`,
        screenshot: screenshot1.toString('base64'),
        timestamp: new Date().toISOString()
      });
    }

    // 3️⃣ Criar agent e executar
    console.log('🤖 Criando agent...');
    
    const agent = stagehand.agent({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      instructions: 'Você é um assistente que executa tarefas no navegador.',
      options: {
        apiKey: process.env.ANTHROPIC_API_KEY
      }
    });

    console.log('⚡ Executando tarefa...');
    const resultado = await agent.execute({
      instruction: prompt,
      maxSteps: 5 // Reduzido para caber no timeout de 10s
    });

    console.log('✅ Tarefa concluída!');

    // 4️⃣ Capturar screenshots dos passos
    if (resultado.steps && resultado.steps.length > 0) {
      console.log(`📸 Capturando ${resultado.steps.length} passos...`);
      
      for (let i = 0; i < resultado.steps.length; i++) {
        const step = resultado.steps[i];
        const screenshot = await page.screenshot({ type: 'png' });
        
        passos.push({
          numero: passos.length + 1,
          acao: step.action || step.thought || step.observation || 'Ação executada',
          screenshot: screenshot.toString('base64'),
          timestamp: new Date().toISOString()
        });
      }
    }

    // 5️⃣ Screenshot final
    const finalScreenshot = await page.screenshot({ type: 'png' });
    passos.push({
      numero: passos.length + 1,
      acao: 'Estado final da página',
      screenshot: finalScreenshot.toString('base64'),
      timestamp: new Date().toISOString()
    });

    // 6️⃣ Montar veredito
    const veredito = {
      sucesso: resultado.success || true,
      resumo: resultado.result || resultado.observation || 'Tarefa executada',
      totalPassos: passos.length,
      detalhes: resultado.steps 
        ? resultado.steps.map(s => s.action || s.thought).join(' → ')
        : 'Execução concluída',
      statusFinal: resultado.success 
        ? '✅ Concluído com sucesso' 
        : '⚠️ Concluído com ressalvas'
    };

    console.log('📊 Veredito:', veredito.resumo);

    // 7️⃣ Fechar sessão
    await stagehand.close();
    console.log('🔒 Sessão encerrada');

    // 8️⃣ Retornar resultado
    return res.status(200).json({
      sucesso: true,
      sessionId,
      prompt,
      url: url || null,
      veredito,
      passos: passos.map(p => ({
        numero: p.numero,
        acao: p.acao,
        print: `data:image/png;base64,${p.screenshot}`,
        timestamp: p.timestamp
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro completo:', error);
    console.error('❌ Stack:', error.stack);
    console.error('❌ Message:', error.message);

    // Tentar fechar sessão em caso de erro
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (e) {
        console.error('Erro ao fechar sessão:', e);
      }
    }

    return res.status(500).json({
      sucesso: false,
      erro: error.message,
      erroCompleto: error.stack,
      sessionId: sessionId || null,
      passos: passos.map(p => ({
        numero: p.numero,
        acao: p.acao,
        print: p.screenshot ? `data:image/png;base64,${p.screenshot}` : null,
        timestamp: p.timestamp
      })),
      veredito: {
        sucesso: false,
        resumo: `Erro durante execução: ${error.message}`,
        statusFinal: '❌ Falhou'
      }
    });
  }
}
