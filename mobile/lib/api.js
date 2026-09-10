// URL pública do backend, gerada pelo ngrok.
// Toda vez que você reiniciar o ngrok (ngrok http 3000), uma URL NOVA é gerada
// no plano gratuito — se isso acontecer, atualize a linha abaixo com a nova URL.
export const BACKEND_URL = 'https://gargle-trustless-groggy.ngrok-free.dev';

// O Android às vezes deixa uma conexão de rede "presa"/corrompida logo
// depois de abrir outra tela nativa por cima do app (como a interface de
// reconhecimento de voz) — isso causa um erro de TLS na primeira tentativa
// seguinte. A segunda tentativa, com uma conexão nova, quase sempre
// funciona. Esse helper tenta de novo automaticamente nesses casos.
async function fetchComNovaTentativa(url, opcoes, tentativas = 4) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fetch(url, opcoes);
    } catch (e) {
      const ehErroDeConexao =
        String(e?.message || e).includes('TLS') || String(e?.message || e).includes('fetch failed');
      const ultimaTentativa = i === tentativas - 1;
      if (!ehErroDeConexao || ultimaTentativa) throw e;
      const pausa = 800 * (i + 1); // 800ms, depois 1600ms, depois 2400ms
      console.log(`[api] erro de conexão (${e?.message || e}), tentando de novo em ${pausa}ms...`);
      await new Promise((r) => setTimeout(r, pausa));
    }
  }
}

export async function interpretarComando(texto, estiloEscrita, personalidade) {
  const response = await fetchComNovaTentativa(`${BACKEND_URL}/interpretar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ texto, estiloEscrita, personalidade }),
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.erro || 'Falha ao interpretar o comando');
  }
  return response.json();
}

// Manda a foto de um documento (fatura, boleto, nota) pro backend, que usa
// o Gemini pra "ler" e extrair valor, vencimento e um resumo.
export async function interpretarDocumento(imagemBase64, mimeType = 'image/jpeg', personalidade) {
  const response = await fetchComNovaTentativa(`${BACKEND_URL}/interpretar-documento`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ imagemBase64, mimeType, personalidade }),
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.erro || 'Falha ao interpretar o documento');
  }
  return response.json();
}

// Pede pra IA gerar, na hora, a frase certa pra uma situação (em vez de
// usar um texto fixo sempre igual) — descreve a situação em "situacao" e
// ela devolve algo natural, variado, no tom da personalidade escolhida.
export async function gerarFala(situacao, personalidade) {
  const response = await fetchComNovaTentativa(`${BACKEND_URL}/gerar-fala`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ situacao, personalidade }),
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.erro || 'Falha ao gerar a fala');
  }
  const { fala } = await response.json();
  return fala;
}

// Busca lugares próximos (restaurantes, mercados, etc) perto de uma
// localização, usando o Google Places por trás.
export async function buscarLugaresProximos(lat, lng, termo, quantidade) {
  const response = await fetchComNovaTentativa(`${BACKEND_URL}/lugares-proximos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ lat, lng, termo, quantidade }),
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.erro || 'Falha ao buscar lugares');
  }
  const { lugares } = await response.json();
  return lugares;
}

// Gera 3 opções de texto pra post de rede social, a partir de um tema.
export async function gerarPost(tema, rede, perfilProfissional) {
  const response = await fetchComNovaTentativa(`${BACKEND_URL}/gerar-post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ tema, rede, perfilProfissional }),
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.erro || 'Falha ao gerar o post');
  }
  const { opcoes } = await response.json();
  return opcoes;
}

// Lê a foto/print de um currículo e devolve um resumo do perfil
// profissional (área, cargo, habilidades, tom sugerido).
export async function interpretarCurriculo(imagemBase64, mimeType = 'image/jpeg') {
  const response = await fetchComNovaTentativa(`${BACKEND_URL}/interpretar-curriculo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ imagemBase64, mimeType }),
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.erro || 'Falha ao interpretar o currículo');
  }
  return response.json();
}

// Sintetiza um documento de uma ou mais páginas (contrato, relatório,
// artigo). "imagens" é um array de { base64, mimeType }.
export async function sintetizarDocumento(imagens) {
  const response = await fetchComNovaTentativa(`${BACKEND_URL}/sintetizar-documento`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({ imagens }),
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(erro.erro || 'Falha ao sintetizar o documento');
  }
  return response.json();
}
