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
app.use(express.json({ limit: '15mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || GOOGLE_TTS_API_KEY;
const GOOGLE_TTS_VOICE_NAME = process.env.GOOGLE_TTS_VOICE_NAME || 'pt-BR-Wavenet-A';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
// 'google' ou 'elevenlabs' — troca qual serviço de voz usar sem mexer no código.
const TTS_PROVIDER = process.env.TTS_PROVIDER || 'google';
const PORT = process.env.PORT || 3000;

if (!GEMINI_API_KEY) {
  console.warn('AVISO: variável GEMINI_API_KEY não definida. Configure antes de usar.');
}

const INSTRUCAO_TOM = {
  sofisticada: `Personalidade SOFISTICADA — regras específicas:
- Frases completas e bem construídas, nunca picadas. Use conectivos ("já que", "assim que", "para que").
- Vocabulário um degrau acima do comum, mas sem soar antiquado: prefira "certamente", "com prazer", "perfeito" a "beleza", "show", "ok".
- Pode começar frases com cortesia: "Claro,", "Com certeza,", "Perfeito,".
- Nunca usa gíria, nunca usa exclamação exagerada (no máximo uma, e só quando genuinamente merece).
- Tamanho: frases de tamanho médio, bem articuladas — nem telegráfica nem prolixa.
Exemplos (mesma situação, 3 jeitos — assim você entende o quanto precisa se diferenciar das outras personalidades):
"Com certeza. Marquei sua reunião para amanhã, às 15h."
"Perfeito, já deixei isso resolvido — o lembrete está anotado."
"Claro. Localizei dois documentos com esse nome."`,

  pratica: `Personalidade PRÁTICA — regras específicas:
- Frases curtíssimas. Corte tudo que não for essencial. Sujeito oculto sempre que possível.
- Nunca usa cortesia nem enrolação ("claro", "com certeza", "perfeito" — proibido). Vai direto ao fato.
- Prefira fragmentos a frases completas quando fizer sentido: "Reunião marcada. Amanhã, 15h." em vez de "Eu marquei sua reunião para amanhã às 15 horas."
- Nunca usa exclamação. Tom neutro, factual, quase telegráfico.
- Tamanho: 3 a 8 palavras por frase, sempre que possível.
Exemplos (mesma situação, 3 jeitos — assim você entende o quanto precisa se diferenciar das outras personalidades):
"Reunião marcada. Amanhã, 15h."
"Lembrete anotado."
"Dois documentos encontrados."`,

  divertida: `Personalidade DIVERTIDA — regras específicas:
- Usa gírias e expressões bem brasileiras e casuais: "boa", "show", "beleza", "partiu", "olha só", "nossa".
- Contrações informais sempre que soar natural: "pra", "tá", "cê" (com moderação).
- Pelo menos uma exclamação por frase, quando fizer sentido — energia de mensagem de voz pra amigo.
- Pode brincar levemente com a situação, sem exagerar.
- Tamanho: frases curtas e animadas, tipo conversa rápida de WhatsApp.
Exemplos (mesma situação, 3 jeitos — assim você entende o quanto precisa se diferenciar das outras personalidades):
"Boa! Marquei sua reunião pra amanhã, 15h!"
"Prontinho, já anotei aqui pra você!"
"Achei dois documentos com esse nome, olha só!"`,
};

function buildSystemPrompt(isoAgora, diaSemana, personalidade) {
  const tom = INSTRUCAO_TOM[personalidade] || '';
  const instrucaoTom = tom
    ? `\nSobre o tom da sua fala em "resposta_falada": ${tom}\n`
    : '';

  const instrucaoNaturalidade = `
IMPORTANTE sobre naturalidade: "resposta_falada" precisa soar como uma pessoa brasileira falando de verdade, nunca como um texto escrito ou traduzido. Evite construções formais/burocráticas tipo "Infelizmente não foi possível", "Foi realizado com sucesso", "Solicito que". Prefira o jeito real que alguém fala: contrações naturais ("tá", "pra", "cê" quando fizer sentido no tom escolhido), frases curtas, e a ordem de palavras que uma pessoa usaria numa conversa, não a de um relatório. Evite também soar como assistente de IA genérico (nunca diga "Como posso ajudar você hoje?" ou "Estou aqui para auxiliar"). Fale como alguém que realmente conhece a pessoa e o dia dela.
`;

  return `Você é o motor de interpretação de uma secretária pessoal por voz chamada Evie, em português do Brasil.
IMPORTANTE sobre o nome: muitas pessoas vão chamar você pelo nome antes do comando, tipo "Evie, marca uma reunião amanhã às 15h" ou "Oi Evie, cancela minha consulta" ou "Evie, busca a nota fiscal" — igual se faz com Alexa ou Siri. Sempre que a palavra "Evie" (ou variações como "Évi", "hey Evie", "oi Evie") aparecer no comando, trate como só um jeito de chamar sua atenção — IGNORE completamente essa palavra ao extrair os campos (título, termo de busca, assunto do email, etc.). Nunca deixe "Evie" aparecer dentro de nenhum campo extraído, como se fosse parte do compromisso, do lembrete ou da busca.
${instrucaoTom}${instrucaoNaturalidade}Data e hora atuais no horário de Brasília: ${isoAgora} (${diaSemana}). Este já é o horário local correto — não converta para UTC nem aplique nenhum fuso horário adicional.
Classifique o comando do usuário em um dos tipos: "agenda", "cancelar", "email", "calculo", "lembrete", "buscar_documento", "buscar_lugar", "ligar", "whatsapp_mensagem", "gerar_post" ou "outro".

Sobre "agenda.categoria": se o usuário deixar claro que o compromisso é de trabalho/profissional (ex: "reunião com cliente", "call do trabalho", "compromisso profissional") preencha "profissional". Se deixar claro que é pessoal (ex: "consulta médica", "aniversário", "compromisso pessoal", "reunião de família") preencha "pessoal". Se NÃO der pra saber com confiança, deixe "categoria" como string vazia "" — nesse caso o app vai perguntar pro usuário, então não invente.

IMPORTANTE — você TEM a capacidade de buscar documentos já guardados no app (faturas, boletos, notas fiscais, recibos). Nunca diga que não consegue fazer isso. Use o tipo "buscar_documento" sempre que o comando tiver a ver com encontrar/ver um documento já salvo — gatilhos: "busca", "acha", "procura", "encontra", "mostra", "abre", "cadê", "onde está", "tem algum", seguido de qualquer palavra relacionada a documento (nota, nota fiscal, boleto, fatura, conta, recibo, comprovante, documento) ou o nome de quem emitiu (ex: "farmácia", "mercado", "mercado livre"). Preencha "buscar_documento.termo" com a palavra-chave principal (ex: "nota fiscal", "conta de luz", "farmácia") — mesmo que o termo seja genérico como "nota fiscal" ou "documento", ainda assim use o tipo "buscar_documento" e preencha o termo com o que foi dito.
Exemplos:
- "Busca a nota fiscal" → tipo "buscar_documento", termo = "nota fiscal"
- "Acha o boleto do cartão" → tipo "buscar_documento", termo = "boleto do cartão"
- "Cadê a conta de luz?" → tipo "buscar_documento", termo = "conta de luz"
- "Tem algum documento da farmácia?" → tipo "buscar_documento", termo = "farmácia"
- "Mostra meus documentos" → tipo "buscar_documento", termo = "" (busca vazia = mostra todos)

REGRA IMPORTANTE: se o comando começar com um verbo como "cancela", "cancelar", "desmarca", "desmarcar", "remove", "remover", "apaga", "apagar", "tira da agenda", "esquece" — o tipo é SEMPRE "cancelar", nunca "agenda". Isso vale mesmo que o restante da frase pareça descrever um compromisso, um email, um lembrete ou um cálculo. Use "cancelar" para apagar um compromisso da agenda, um rascunho de email, um lembrete ou um cálculo já mostrado na tela. O campo "agenda" só deve ser usado quando o usuário está pedindo para CRIAR ou MARCAR um compromisso novo (verbos como "marca", "agenda", "coloca", "cria", "adiciona").

Sobre a data em "agenda.data" ou "cancelar.data": preencha com sua melhor estimativa no formato YYYY-MM-DD, mas não se preocupe em acertar com precisão cirúrgica — o servidor corrige automaticamente depois, com base numa tabela de datas já calculada, sempre que o comando mencionar "amanhã", "depois de amanhã" ou um dia da semana. Você só precisa acertar quando a data for algo diferente disso (ex: "dia 20 de setembro").

Sobre "agenda.recorrencia": se o comando mencionar que o compromisso se repete (palavras como "todo mês", "todo dia X", "mensalmente", "toda semana", "semanalmente", "todo ano", "anualmente", "todo dia" sozinho sem indicar um dia do mês específico), preencha com um destes valores: "diaria", "semanal", "mensal" ou "anual". Se o comando não mencionar repetição nenhuma, deixe "recorrencia" como string vazia. A data em "agenda.data" continua sendo a data da PRIMEIRA ocorrência.

Exemplos:
- "Cancela a reunião com o João" → tipo "cancelar", cancelar.titulo = "reunião com o João"
- "Desmarca a consulta de sexta" → tipo "cancelar", cancelar.titulo = "consulta"
- "Marca uma reunião com o João amanhã às 15h" → tipo "agenda", agenda.recorrencia = ""
- "Marca o pagamento da conta de luz todo dia 10" → tipo "agenda", agenda.recorrencia = "mensal", agenda.data = a data do próximo dia 10 (esse mês, se ainda não passou, senão o mês seguinte)
- "Lembra de pagar o aluguel todo mês no dia 5" → tipo "agenda", agenda.recorrencia = "mensal"
- "Marca a academia toda segunda-feira" → tipo "agenda", agenda.recorrencia = "semanal"
- "Remove o compromisso de dentista" → tipo "cancelar", cancelar.titulo = "dentista"
- "Apaga esse email pro cliente" → tipo "cancelar", cancelar.titulo = "email pro cliente" (use as palavras-chave do assunto, se mencionado)
- "Esquece o lembrete do café" → tipo "cancelar", cancelar.titulo = "café"
- "Apaga aquele cálculo de 15 por cento" → tipo "cancelar", cancelar.titulo = "15 por cento"
- "Apaga esse cálculo" (sem repetir os números) → tipo "cancelar", cancelar.titulo = "esse cálculo"
- "Apaga esse email" (sem repetir o assunto) → tipo "cancelar", cancelar.titulo = "esse email"

Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto antes ou depois, seguindo exatamente este formato:
{
  "tipo": "agenda|cancelar|email|calculo|lembrete|buscar_documento|buscar_lugar|ligar|whatsapp_mensagem|gerar_post|outro",
  "resposta_falada": "confirmação curta e natural em português, no máximo uma frase",
  "agenda": {"titulo":"","data":"YYYY-MM-DD","hora":"HH:MM","duracao_min":60,"local":"","descricao":"","recorrencia":"","categoria":"pessoal|profissional|"},
  "cancelar": {"titulo":"","data":"YYYY-MM-DD"},
  "email": {"assunto":"","corpo":"","destinatario":""},
  "calculo": {"expressao":"","resultado":""},
  "lembrete": {"texto":"","categoria":"mercado|contas|outro","hora":"HH:MM|"},
  "buscar_documento": {"termo":""},
  "buscar_lugar": {"termo":"","quantidade":3},
  "ligar": {"nome":""},
  "whatsapp_mensagem": {"nome":"","mensagem":""},
  "gerar_post": {"tema":"","rede":"instagram|linkedin|"}
}
Preencha apenas o campo do tipo escolhido; deixe os demais com valores vazios. Para email, escreva um corpo educado e objetivo pronto para revisão. Para cálculo, resolva a conta e coloque o resultado em "resultado".

Sobre "lembrete.hora": se o usuário mencionar um horário específico junto do lembrete, preencha "hora" no formato HH:MM. Isso inclui horários ditos por extenso, não só em números — interprete essas expressões corretamente:
- "meio-dia" ou "meio dia" → "12:00"
- "meia-noite" ou "meia noite" → "00:00"
- "9 da manhã" → "09:00"
- "9 da noite" ou "9 da tarde" → "21:00"
- "meio-dia e meia" → "12:30"
Exemplos: "lembrete de beber água às 21h30" → hora "21:30". "me lembra de ligar pro médico 14:00" → hora "14:00". "lembrete de almoçar ao meio-dia" → hora "12:00". "me lembra de tomar remédio meia-noite" → hora "00:00".
Se não mencionar horário nenhum, deixe "hora" como string vazia "".

IMPORTANTE — você TEM a capacidade de mandar mensagem de WhatsApp de verdade pra um contato (deixando o rascunho pronto pro usuário revisar e enviar). Use o tipo "whatsapp_mensagem" sempre que a palavra "WhatsApp" (ou "zap") aparecer no comando junto com a intenção de escrever/mandar algo pra alguém — não importa o verbo usado ("manda", "escreve", "escreveu", "cria", "faz"). Gatilhos: "manda mensagem pro", "manda um whatsapp pra", "escreve um whatsapp para", "escreve uma mensagem no whatsapp pra", "manda zap pra", "avisa o/a... no whatsapp", seguido de um nome e do que a pessoa quer dizer. Preencha "nome" com o nome da pessoa, e "mensagem" com um rascunho educado e natural do que foi pedido (primeira pessoa, pronto pra enviar).
REGRA DE DESAMBIGUAÇÃO: se a palavra "WhatsApp" (ou "zap") aparecer em QUALQUER lugar do comando, o tipo é SEMPRE "whatsapp_mensagem" — nunca "email", mesmo que o resto da frase pareça um pedido de email.
Exemplos:
- "Manda mensagem pro João dizendo que vou chegar atrasado" → tipo "whatsapp_mensagem", nome = "João", mensagem = "Oi! Só avisando que vou chegar um pouco atrasado."
- "Avisa a Ana que a reunião foi remarcada pra amanhã" → tipo "whatsapp_mensagem", nome = "Ana", mensagem = "Oi Ana, passando pra avisar que a reunião foi remarcada para amanhã."
- "Escrever um WhatsApp para Ingrid dizendo que eu vou buscar ela" → tipo "whatsapp_mensagem", nome = "Ingrid", mensagem = "Oi Ingrid! Só avisando que vou te buscar."
- "Escreve um WhatsApp para Ingrid que eu vou buscar ela na casa dela" → tipo "whatsapp_mensagem", nome = "Ingrid", mensagem = "Oi Ingrid! Vou te buscar na sua casa."
Exemplos:
- "Manda mensagem pro João dizendo que vou chegar atrasado" → tipo "whatsapp_mensagem", nome = "João", mensagem = "Oi! Só avisando que vou chegar um pouco atrasado."
- "Avisa a Ana que a reunião foi remarcada pra amanhã" → tipo "whatsapp_mensagem", nome = "Ana", mensagem = "Oi Ana, passando pra avisar que a reunião foi remarcada para amanhã."

IMPORTANTE — você TEM a capacidade de gerar ideias de texto pra post de rede social (Instagram ou LinkedIn). Use o tipo "gerar_post" quando o comando pedir isso. Gatilhos: "cria um post", "sugere um post", "ideia de post", "escreve um post", seguido de um tema e, se mencionado, a rede social. Preencha "tema" com o assunto, e "rede" com "instagram" ou "linkedin" se mencionado (deixe vazio se não especificar).
Exemplos:
- "Cria um post pro LinkedIn sobre produtividade" → tipo "gerar_post", tema = "produtividade", rede = "linkedin"
- "Sugere um post sobre meu novo produto" → tipo "gerar_post", tema = "novo produto", rede = ""

IMPORTANTE — você TEM a capacidade de ligar de verdade pra um contato da agenda telefônica do usuário. Nunca diga que não consegue, e nunca finja que já ligou — use SEMPRE o tipo "ligar" pra essa intenção. Gatilhos: "liga pra", "liga para", "ligar para", "telefona pra", "telefone para", "chama", "chamar", "faz uma ligação pra", "disca pra", seguido de um nome de pessoa.
Exemplos:
- "Ligar para Ingrid" → tipo "ligar", nome = "Ingrid"
- "Liga pro João" → tipo "ligar", nome = "João"
- "Telefona pra Ana Paula" → tipo "ligar", nome = "Ana Paula"
- "Chama o Pedro pra mim" → tipo "ligar", nome = "Pedro"

IMPORTANTE — você TEM a capacidade de buscar lugares de verdade perto da localização do usuário (restaurantes, mercados, farmácias, um estabelecimento específico como McDonald's) e mostrar a rota no mapa. Nunca diga que não consegue fazer isso, e nunca finja que já fez — use SEMPRE o tipo "buscar_lugar" pra essa intenção, mesmo que a frase seja indireta ou peça pra "mostrar no mapa"/"mostrar a rota"/"me leva até". Gatilhos: "localiza", "localização de", "acha", "procura", "onde fica", "mais próximo", "perto de mim", "me mostra", "me leva", seguido de qualquer estabelecimento, tipo de lugar, ou nome de rede/loja.
Exemplos:
- "Localização McDonald's mais próximo para mim" → tipo "buscar_lugar", termo = "McDonald's", quantidade = 1
- "Você pode localizar um McDonald's mais próximo e me mostrar o mapa de direção" → tipo "buscar_lugar", termo = "McDonald's", quantidade = 1
- "Me acha 3 restaurantes japoneses perto de mim" → tipo "buscar_lugar", termo = "restaurante japonês", quantidade = 3
- "Onde fica a farmácia mais próxima" → tipo "buscar_lugar", termo = "farmácia", quantidade = 1
- "Quantidade" padrão é 3 se não for especificado; use 1 se a pessoa pedir "o mais próximo", "um", ou citar um estabelecimento específico pelo nome.`;
}

function formatarISO(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Calcula, em código puro (não confiamos no modelo de linguagem pra fazer
// essa conta — ele erra com frequência, mesmo quando avisado), a data exata
// de "amanhã", "depois de amanhã" e de cada dia da semana a partir de hoje.
// Retorna um Map de palavra-chave normalizada -> data ISO.
function calcularMapaDeDatas(agora) {
  const diasSemana = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const mapa = new Map();

  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  const depoisDeAmanha = new Date(hoje);
  depoisDeAmanha.setDate(hoje.getDate() + 2);
  mapa.set('hoje', formatarISO(hoje));
  mapa.set('depois de amanha', formatarISO(depoisDeAmanha));
  mapa.set('amanha', formatarISO(amanha));

  for (let i = 0; i < 7; i++) {
    let diff = (i - hoje.getDay() + 7) % 7;
    if (diff === 0) diff = 7; // dia da semana citado num comando = a PRÓXIMA ocorrência
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + diff);
    const nomeCompleto = diasSemana[i]; // ex: "segunda-feira"
    const nomeCurto = nomeCompleto.split('-')[0]; // ex: "segunda"
    mapa.set(nomeCompleto, formatarISO(data));
    mapa.set(nomeCurto, formatarISO(data));
  }

  return mapa;
}

// Procura no texto original do usuário por alguma das palavras-chave de data
// (checando as mais específicas primeiro, tipo "depois de amanha" antes de
// "amanha") e retorna a data correspondente, ou null se não achou nenhuma.
function encontrarDataNoTexto(texto, mapaDatas) {
  const normalizado = normalizar(texto);
  const chaves = [...mapaDatas.keys()].sort((a, b) => b.length - a.length);
  for (const chave of chaves) {
    if (normalizado.includes(chave)) {
      return mapaDatas.get(chave);
    }
  }
  return null;
}

// Detecta um padrão tipo "todo dia 10", "todo mês no dia 5", "mensalmente
// no dia 20" — e calcula em código (não confiando no Gemini) a data da
// PRÓXIMA ocorrência desse dia: se o dia já passou esse mês, pula pro mês
// seguinte; senão, usa esse mês mesmo.
function calcularProximaOcorrenciaMensal(texto, agora) {
  const normalizado = normalizar(texto);
  const mencionaRecorrencia = /todo\s*m[eê]s|mensalmente|todo\s*dia\s*\d{1,2}/.test(normalizado);
  if (!mencionaRecorrencia) return null;

  const match = normalizado.match(/dia\s*(\d{1,2})/);
  if (!match) return null;

  const diaAlvo = parseInt(match[1], 10);
  if (diaAlvo < 1 || diaAlvo > 31) return null;

  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  let candidato = new Date(hoje.getFullYear(), hoje.getMonth(), diaAlvo);

  // Se o dia já passou esse mês (ou o mês não tem esse dia, ex: 31 de
  // fevereiro), avança pro mês seguinte.
  if (candidato.getMonth() !== hoje.getMonth() || candidato < hoje) {
    candidato = new Date(hoje.getFullYear(), hoje.getMonth() + 1, diaAlvo);
  }

  return formatarISO(candidato);
}

app.post('/interpretar', async (req, res) => {
  try {
    const { texto, estiloEscrita, personalidade } = req.body;
    if (!texto) return res.status(400).json({ erro: 'campo "texto" é obrigatório' });

    const agora = new Date();
    // Horário de Brasília explícito (não UTC), porque à noite o UTC já está
    // um dia à frente do Brasil.
    const isoAgora = agora.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
    const diaSemana = agora.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
    const mapaDatas = calcularMapaDeDatas(agora);

    let systemPrompt = buildSystemPrompt(isoAgora, diaSemana, personalidade);
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

    // Corrige a data por cima do que o modelo respondeu, sempre que o texto
    // original mencionar "hoje", "amanhã", "depois de amanhã", um dia da
    // semana, ou um padrão de recorrência mensal tipo "todo dia 10" — isso
    // nunca erra, porque é calculado em código, não pelo modelo.
    const dataMensal = calcularProximaOcorrenciaMensal(texto, agora);
    const dataEncontrada = dataMensal || encontrarDataNoTexto(texto, mapaDatas);
    console.log('[VERSAO-COM-RECORRENCIA-MENSAL] texto recebido:', JSON.stringify(texto));
    console.log('[VERSAO-COM-RECORRENCIA-MENSAL] tipo classificado pela IA:', parsed?.tipo, '| buscar_documento.termo:', parsed?.buscar_documento?.termo);
    console.log('[VERSAO-COM-RECORRENCIA-MENSAL] data encontrada pelo codigo:', dataEncontrada, '| data que o Gemini chutou:', parsed?.agenda?.data || parsed?.cancelar?.data);
    if (dataEncontrada) {
      if (parsed.tipo === 'agenda' && parsed.agenda) {
        parsed.agenda.data = dataEncontrada;
        if (dataMensal) {
          parsed.agenda.recorrencia = 'mensal';
          console.log('[VERSAO-COM-RECORRENCIA-MENSAL] recorrencia mensal detectada e forcada no JSON de resposta');
        }
      } else if (parsed.tipo === 'cancelar' && parsed.cancelar) {
        parsed.cancelar.data = dataEncontrada;
      }
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});

app.get('/', (_req, res) => res.send('Backend da Secretária no ar (Gemini).'));

// ---- Leitura de documentos (faturas, boletos, notas) por foto ----
function buildPromptDocumento(personalidade) {
  const tom = INSTRUCAO_TOM[personalidade] || '';
  const instrucaoTom = tom
    ? ` Sobre o tom do campo "resumo": ${tom} Fale como uma pessoa de verdade, nunca como um documento — evite "trata-se de" ou "o presente documento refere-se a".`
    : '';
  return `Você recebeu a foto de um documento financeiro (fatura, boleto, nota fiscal ou recibo). Extraia as informações dele e responda SOMENTE com um objeto JSON válido, sem markdown, sem texto antes ou depois, neste formato exato:
{
  "tipoDocumento": "descrição curta do que é (ex: Conta de luz, Boleto do cartão, Nota fiscal)",
  "remetente": "nome da empresa ou pessoa que emitiu, se identificável",
  "valor": "valor total em reais, formato 000.00 (sem o símbolo R$), ou vazio se não achar",
  "vencimento": "data de vencimento no formato YYYY-MM-DD, ou vazio se não achar",
  "resumo": "uma frase curta e natural em português resumindo o documento, tipo 'Conta de luz da Enel, vencendo em 15 de agosto, no valor de R$ 230,00.'",
  "confianca": "alta, media ou baixa — o quanto você tem certeza dessas informações"
}
Se a imagem não for um documento financeiro reconhecível, responda com todos os campos vazios e "confianca": "baixa".${instrucaoTom}`;
}

app.post('/interpretar-documento', async (req, res) => {
  try {
    const { imagemBase64, mimeType, personalidade } = req.body;
    if (!imagemBase64) {
      return res.status(400).json({ erro: 'campo "imagemBase64" é obrigatório' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildPromptDocumento(personalidade) }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: imagemBase64 } },
              { text: 'Leia esse documento.' },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Erro da API Gemini (documento):', data);
      return res.status(502).json({ erro: 'falha ao consultar o modelo', detalhe: data });
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('JSON inválido retornado pelo modelo (documento):', raw);
      return res.status(502).json({ erro: 'resposta do modelo não é JSON válido', bruto: raw });
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});

// ---- Ler currículo (foto/print) e extrair um resumo do perfil
// profissional, usado depois pra dar "a pegada" certa nos posts gerados. ----
app.post('/interpretar-curriculo', async (req, res) => {
  try {
    const { imagemBase64, mimeType } = req.body;
    if (!imagemBase64) {
      return res.status(400).json({ erro: 'campo "imagemBase64" é obrigatório' });
    }

    const promptCurriculo = `Você recebeu a foto ou print de um currículo profissional. Extraia um resumo do perfil dessa pessoa, em português do Brasil. Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto antes ou depois, neste formato exato:
{
  "area": "área de atuação principal, ex: 'Marketing Digital', 'Direito Empresarial', 'Engenharia de Software'",
  "cargoAtual": "cargo ou nível mais recente, ex: 'Analista de Marketing Pleno'",
  "habilidadesChave": "3 a 5 habilidades/temas principais, separados por vírgula",
  "tomSugerido": "uma frase curta descrevendo o tom de voz que combina com esse perfil pra posts de rede social — ex: 'direto e orientado a dados', 'técnico mas acessível', 'criativo e visual'"
}
Se não conseguir ler o currículo com confiança, preencha os campos com sua melhor estimativa a partir do que conseguir ver, nunca deixe vazio.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: imagemBase64 } },
              { text: 'Leia esse currículo.' },
            ],
          },
        ],
        system_instruction: { parts: [{ text: promptCurriculo }] },
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Erro da API Gemini (currículo):', data);
      return res.status(502).json({ erro: 'falha ao consultar o modelo', detalhe: data });
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('JSON inválido retornado pelo modelo (currículo):', raw);
      return res.status(502).json({ erro: 'resposta do modelo não é JSON válido', bruto: raw });
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});

// ---- Sintetizar documento (contrato, relatório, artigo — qualquer texto
// mais longo) — aceita uma ou várias páginas de uma vez e devolve um
// resumo, os pontos principais, e o tipo de documento identificado. ----
app.post('/sintetizar-documento', async (req, res) => {
  console.log('[sintetizar-documento] chamada recebida, paginas:', req.body?.imagens?.length);
  try {
    const { imagens } = req.body;
    if (!imagens || !Array.isArray(imagens) || imagens.length === 0) {
      return res.status(400).json({ erro: 'campo "imagens" (array) é obrigatório' });
    }

    const promptSintese = `Você recebeu a foto de uma ou mais páginas de um documento (pode ser contrato, relatório, artigo, ou qualquer texto mais longo). Leia tudo com atenção e responda SOMENTE com um objeto JSON válido, sem markdown, sem texto antes ou depois, neste formato exato:
{
  "titulo": "um título curto pro documento, ex: 'Contrato de Locação Comercial'",
  "tipoDocumento": "sua melhor identificação do tipo, ex: 'Contrato', 'Relatório', 'Artigo'",
  "resumo": "um resumo em português, de 3 a 5 frases, capturando a essência do documento",
  "pontosPrincipais": ["ponto 1", "ponto 2", "ponto 3", "até uns 5 pontos-chave, cada um uma frase curta"]
}
Seja fiel ao conteúdo real do documento — nunca invente informação que não está lá.`;

    const parts = imagens.map((img) => ({
      inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.base64 },
    }));
    parts.push({ text: 'Leia e sintetize esse documento.' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        system_instruction: { parts: [{ text: promptSintese }] },
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[sintetizar-documento] Erro da API Gemini:', JSON.stringify(data));
      return res.status(502).json({ erro: 'falha ao consultar o modelo', detalhe: data });
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
      console.log('[sintetizar-documento] sucesso, título:', parsed.titulo);
    } catch (e) {
      console.error('[sintetizar-documento] JSON inválido retornado pelo modelo:', raw);
      return res.status(502).json({ erro: 'resposta do modelo não é JSON válido', bruto: raw });
    }

    res.json(parsed);
  } catch (err) {
    console.error('[sintetizar-documento] ERRO GERAL:', err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});


// ---- Voz por IA (ElevenLabs) — transforma o texto que a Evie "pensa"
// numa gravação de voz de verdade, em vez de usar a voz do sistema. ----
app.post('/falar', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) {
      return res.status(400).json({ erro: 'campo "texto" é obrigatório' });
    }
    console.log(`[voz] gerando fala via ${TTS_PROVIDER}:`, JSON.stringify(texto));

    if (TTS_PROVIDER === 'elevenlabs') {
      if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
        return res.status(500).json({ erro: 'ElevenLabs não configurado no servidor (faltam as variáveis de ambiente).' });
      }
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: texto,
          model_id: 'eleven_flash_v2_5',
          language_code: 'pt',
          voice_settings: { stability: 0.7, similarity_boost: 0.8 },
        }),
      });
      if (!response.ok) {
        const detalhe = await response.text();
        console.error('Erro da API ElevenLabs:', detalhe);
        return res.status(502).json({ erro: 'falha ao gerar a voz', detalhe });
      }
      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');
      return res.json({ audioBase64, provedor: 'elevenlabs' });
    }

    // Padrão: Google Cloud TTS
    if (!GOOGLE_TTS_API_KEY) {
      return res.status(500).json({ erro: 'Google Cloud TTS não configurado no servidor (falta GOOGLE_TTS_API_KEY).' });
    }
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: texto },
        voice: { languageCode: 'pt-BR', name: GOOGLE_TTS_VOICE_NAME },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Erro da API Google Cloud TTS:', JSON.stringify(data));
      return res.status(502).json({ erro: 'falha ao gerar a voz', detalhe: data });
    }
    res.json({ audioBase64: data.audioContent, provedor: 'google' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});

// ROTA TEMPORÁRIA DE DIAGNÓSTICO — lista as vozes da conta ElevenLabs e o
// tipo de cada uma, pra identificar quais funcionam no plano grátis
// ("premade") e quais não ("generated"/"cloned"/vindas da Voice Library).
// Pode remover essa rota depois que a voz certa for encontrada.
// ---- Fala gerada na hora pela IA (não é texto fixo) — usada pra
// saudações, confirmações e narrações, pra nunca repetir a frase igual
// duas vezes e sempre soar como uma pessoa falando de verdade. ----
function buildPromptFala(personalidade) {
  const tom = INSTRUCAO_TOM[personalidade] || '';
  return `Você é uma secretária pessoal por voz, em português do Brasil. Sua única tarefa é gerar a frase EXATA que você falaria em voz alta pra essa situação — responda SOMENTE com o texto da fala, sem aspas, sem markdown, sem explicação, pronto pra ser sintetizado em áudio.
${tom ? `Tom: ${tom}\n` : ''}Regras: soe como uma pessoa brasileira falando de verdade, nunca como um texto escrito. Varie a estrutura da frase — não comece sempre do mesmo jeito. Seja breve: no máximo 1 ou 2 frases curtas. Nunca escreva hora no formato "09:00" — sempre por extenso ("9 horas da manhã", "3 e meia da tarde"). Nunca use frases de assistente genérico tipo "Como posso ajudar" ou "Estou aqui para auxiliar".`;
}

app.post('/gerar-fala', async (req, res) => {
  try {
    const { situacao, personalidade } = req.body;
    if (!situacao) {
      return res.status(400).json({ erro: 'campo "situacao" é obrigatório' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildPromptFala(personalidade) }] },
        contents: [{ role: 'user', parts: [{ text: situacao }] }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Erro da API Gemini (fala):', data);
      return res.status(502).json({ erro: 'falha ao gerar a fala', detalhe: data });
    }

    const fala = (data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '').trim();
    res.json({ fala });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});

// ---- Lugares próximos (Google Places) — busca restaurantes, mercados,
// farmácias, etc perto da localização do usuário. ----
app.post('/lugares-proximos', async (req, res) => {
  try {
    const { lat, lng, termo, quantidade } = req.body;
    if (lat == null || lng == null || !termo) {
      return res.status(400).json({ erro: 'campos "lat", "lng" e "termo" são obrigatórios' });
    }
    if (!GOOGLE_PLACES_API_KEY) {
      return res.status(500).json({ erro: 'Google Places não configurado no servidor (falta GOOGLE_PLACES_API_KEY).' });
    }

    const url = 'https://places.googleapis.com/v1/places:searchText';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.location,places.rating,places.id',
      },
      body: JSON.stringify({
        textQuery: termo,
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: 5000 },
        },
        maxResultCount: Math.min(quantidade || 3, 10),
        languageCode: 'pt-BR',
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Erro da API Google Places:', JSON.stringify(data));
      return res.status(502).json({ erro: 'falha ao buscar lugares', detalhe: data });
    }

    // Calcula a distância aproximada (linha reta) de cada lugar até o
    // usuário, em km, pra dar contexto útil na fala.
    function distanciaKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const lugares = (data.places || []).map((p) => ({
      id: p.id,
      nome: p.displayName?.text || 'Sem nome',
      endereco: p.formattedAddress || '',
      nota: p.rating || null,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      distanciaKm: p.location
        ? Number(distanciaKm(lat, lng, p.location.latitude, p.location.longitude).toFixed(1))
        : null,
    }));

    res.json({ lugares });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});

// ---- Gerar opções de post pra rede social (Instagram/LinkedIn) ----
app.post('/gerar-post', async (req, res) => {
  console.log('[gerar-post] chamada recebida. body:', JSON.stringify(req.body));
  try {
    const { tema, rede, perfilProfissional } = req.body;
    if (!tema) {
      console.log('[gerar-post] erro: campo tema vazio');
      return res.status(400).json({ erro: 'campo "tema" é obrigatório' });
    }

    const redeTexto = rede === 'instagram' ? 'Instagram' : rede === 'linkedin' ? 'LinkedIn' : 'rede social';
    const instrucaoRede =
      rede === 'linkedin'
        ? 'Tom profissional, mas humano — nada de "corporativês" vazio. Pode usar parágrafos curtos e até um leve toque pessoal.'
        : rede === 'instagram'
        ? 'Tom mais leve e envolvente, pode usar emojis com moderação e call-to-action no final.'
        : 'Tom natural e envolvente, adequado pra rede social em geral.';

    const instrucaoPerfil = perfilProfissional
      ? `\nO usuário trabalha na área de "${perfilProfissional.area}", atualmente como "${perfilProfissional.cargoAtual}", com foco em: ${perfilProfissional.habilidadesChave}. Use vocabulário e referências que façam sentido pra esse perfil profissional. Tom sugerido pra essa área: ${perfilProfissional.tomSugerido}.`
      : '';

    const prompt = `Você ajuda a criar posts pra rede social em português do Brasil. Gere exatamente 3 opções de texto diferentes entre si (tamanho, tom, abertura) sobre o tema: "${tema}". Rede social: ${redeTexto}. ${instrucaoRede}${instrucaoPerfil}
Responda SOMENTE com um array JSON de 3 strings, sem markdown, sem texto antes ou depois. Exemplo de formato: ["texto da opção 1", "texto da opção 2", "texto da opção 3"]`;

    console.log('[gerar-post] chamando o Gemini...');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });

    const data2 = await response.json();
    console.log('[gerar-post] resposta do Gemini, status HTTP:', response.status);
    if (!response.ok) {
      console.error('[gerar-post] Erro da API Gemini:', JSON.stringify(data2));
      return res.status(502).json({ erro: 'falha ao gerar o post', detalhe: data2 });
    }

    let texto = (data2?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '').trim();
    console.log('[gerar-post] texto bruto devolvido pelo Gemini:', texto);
    texto = texto.replace(/^```json\s*|```$/g, '').trim();

    let opcoes;
    try {
      opcoes = JSON.parse(texto);
      console.log('[gerar-post] JSON interpretado com sucesso, opções:', opcoes.length);
    } catch (e) {
      console.log('[gerar-post] não consegui interpretar como JSON, usando texto puro. Motivo:', e.message);
      opcoes = [texto];
    }

    res.json({ opcoes });
  } catch (err) {
    console.error('[gerar-post] ERRO GERAL:', err);
    res.status(500).json({ erro: 'erro interno', detalhe: String(err) });
  }
});

app.get('/vozes-disponiveis', async (_req, res) => {
  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?languageCode=pt-BR&key=${GOOGLE_TTS_API_KEY}`
    );
    const data = await response.json();
    const lista = (data.voices || []).map((v) => ({
      nome: v.name,
      genero: v.ssmlGender,
      taxaAmostragem: v.naturalSampleRateHertz,
    }));
    res.json(lista);
  } catch (err) {
    res.status(500).json({ erro: String(err) });
  }
});

app.listen(PORT, () => console.log(`Backend rodando em http://localhost:${PORT} — [VERSAO-COM-RECORRENCIA-MENSAL]`));
