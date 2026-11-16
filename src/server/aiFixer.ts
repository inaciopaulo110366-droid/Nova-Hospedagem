import { GoogleGenAI, Type } from '@google/genai';

export interface SiteInputFile {
  path: string;
  content: string;
}

export interface AiDiagnosticItem {
  file: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface AiFilePatch {
  path: string;
  reason: string;
  fixedContent: string;
}

export interface AiFixResult {
  summary: string;
  diagnostics: AiDiagnosticItem[];
  patches: AiFilePatch[];
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'Chave GEMINI_API_KEY não configurada no servidor. Configure-a em Settings > Secrets para usar a IA de correção.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function analyzeAndFixSiteWithAI(params: {
  siteName: string;
  files: SiteInputFile[];
  userPrompt?: string;
}): Promise<AiFixResult> {
  const { siteName, files, userPrompt } = params;
  if (files.length === 0) {
    throw new Error('O site não possui arquivos de texto para analisar.');
  }

  // Cap payload size safely to stay fast and focused
  const MAX_TOTAL_CHARS = 100000;
  let usedChars = 0;
  const includedFiles: SiteInputFile[] = [];
  for (const f of files.slice(0, 15)) {
    if (usedChars + f.content.length > MAX_TOTAL_CHARS) continue;
    includedFiles.push(f);
    usedChars += f.content.length;
  }

  if (includedFiles.length === 0) {
    throw new Error('Os arquivos do projeto são muito grandes para análise automática.');
  }

  const filesContext = includedFiles
    .map((f) => `--- ARQUIVO: ${f.path} ---\n${f.content}\n--- FIM: ${f.path} ---`)
    .join('\n\n');

  const prompt = [
    `Projeto estático: "${siteName}"`,
    userPrompt?.trim()
      ? `Problema relatado pelo usuário: ${userPrompt.trim()}`
      : 'Faça uma auditoria completa procurando erros de HTML, CSS, JavaScript, caminhos de arquivos quebrados, responsividade mobile e acessibilidade.',
    '',
    'Arquivos atuais do projeto:',
    filesContext,
  ].join('\n');

  const ai = getAiClient();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Você é um engenheiro especialista em sites estáticos (HTML, CSS, JavaScript) da plataforma NovaHospeda. Analise os arquivos fornecidos, identifique erros reais (tags não fechadas, erros de sintaxe JS/CSS, links ou scripts quebrados, ausência de meta viewport, problemas de layout ou erros relatados pelo usuário) e gere correções completas e funcionais apenas para os arquivos que precisam de ajuste. Sempre responda em português do Brasil. Retorne o conteúdo completo corrigido em fixedContent (não use trechos parciais ou "..." ). Se não houver erros em um arquivo, não o inclua em patches.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Resumo claro em português dos problemas encontrados e das correções propostas.',
            },
            diagnostics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  file: { type: Type.STRING, description: 'Caminho do arquivo analisado.' },
                  severity: {
                    type: Type.STRING,
                    description: 'Nivel: error, warning ou info.',
                  },
                  message: { type: Type.STRING, description: 'Descrição objetiva do erro ou melhoria.' },
                },
                required: ['file', 'severity', 'message'],
              },
            },
            patches: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING, description: 'Caminho exato do arquivo a corrigir.' },
                  reason: { type: Type.STRING, description: 'Motivo da correção neste arquivo.' },
                  fixedContent: {
                    type: Type.STRING,
                    description: 'Conteúdo completo e válido do arquivo corrigido.',
                  },
                },
                required: ['path', 'reason', 'fixedContent'],
              },
            },
          },
          required: ['summary', 'diagnostics', 'patches'],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText) as Partial<AiFixResult>;

    const diagnostics: AiDiagnosticItem[] = Array.isArray(parsed.diagnostics)
      ? parsed.diagnostics.map((d) => ({
          file: String(d.file || 'index.html'),
          severity:
            d.severity === 'error' || d.severity === 'warning' || d.severity === 'info'
              ? d.severity
              : 'info',
          message: String(d.message || ''),
        }))
      : [];

    const patches: AiFilePatch[] = Array.isArray(parsed.patches)
      ? parsed.patches
          .filter((p) => typeof p?.path === 'string' && typeof p?.fixedContent === 'string')
          .map((p) => ({
            path: p.path,
            reason: String(p.reason || 'Correção automática aplicada'),
            fixedContent: p.fixedContent,
          }))
      : [];

    return {
      summary: String(parsed.summary || 'Análise concluída.'),
      diagnostics,
      patches,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
      throw new Error(
        'A chave da API Gemini parece inválida ou sem permissão. Verifique-a no painel Settings > Secrets.'
      );
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      throw new Error('Limite temporário de requisições da IA atingido. Tente novamente em instantes.');
    }
    throw new Error(`Não foi possível executar a análise de IA: ${msg}`);
  }
}
