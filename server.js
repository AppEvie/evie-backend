// Backend mínimo: recebe o texto transcrito do app, chama o Gemini
// com a chave da API guardada no servidor (nunca no app), e devolve
// um JSON estruturado indicando o que o app deve fazer.
//
// Rodar local:   npm install && GEMINI_API_KEY=SUA_CHAVE npm start
// Deploy fácil:  Render, Railway ou Vercel (configurar a env var lá)

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const PORT = process.env.PORT || 3000;

if (!GEMINI_API_KEY) {
  console.warn('AVISO: variável GEMINI_API_KEY não definida. Configure antes de usar.');
}

function buildSystemPrompt(isoAgora, diaSemana) {
  return `Você é o motor de interpretação de uma secretária pessoal por voz, em português do Brasil.
Data e hora atuais: ${isoAgora} (${diaSemana}). Use isso para resolver datas relativas como "amanhã", "sexta-feira", "semana que vem".
Classifique o comando do usuário em um dos tipos: "agenda", "email", "calculo", "lembrete" ou "outro".
Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto antes ou depois, seguindo exatamente este formato:
{
  "tipo": "agenda|email|calculo|lembrete|outro",
  "resposta_falada": "confirmação curta e natural em português, no máximo uma frase",
  "agenda": {"titulo":"","data":"YYYY-MM-DD","hora":"HH:MM","duracao_min":60,"local":"","descricao":""},
  "email": {"assunto":"","corpo":"","destinatario":""},
  "calculo": {"expressao":"","resultado":""},
  "lembrete": {"texto":"","categoria":"mercado|contas|outro"}
}
Preencha apenas o campo do tipo escolhido; deixe os demais com valores vazios. Para email, escreva um corpo educado e objetivo pronto para revisão. Para cálculo, resolva a conta e coloque o resultado em "resultado".`;
}

app.post('/interpretar', async (req, res) => {
  try {
    const { texto, estiloEscrita } = req.body;
    if (!texto) return res.status(400).json({ erro: 'campo "texto" é obrigatório' });

    const agora = new Date();
    const isoAgora = agora.toISOString();
    const diaSemana = agora.toLocaleDateString('pt-BR', { weekday: 'long' });

    let systemPrompt = buildSystemPrompt(isoAgora, diaSemana);
    if (estiloEscrita) {
      systemPrompt += `\n\nAo escrever emails, siga este estilo pessoal do usuário: ${estiloEscrita}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: texto }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Erro da API Gemini:', data);
      return res.status(502).json({ erro: 'falha ao consultar o modelo', detalhe: data });
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('JSON inválido retornado pelo modelo:', raw);
      return res.status(502).json({ erro: 'resposta do modelo não é JSON válido', bruto: raw });
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});

app.get('/', (_req, res) => res.send('Backend da Secretária no ar (Gemini).'));

app.listen(PORT, () => console.log(`Backend rodando em http://localhost:${PORT}`));