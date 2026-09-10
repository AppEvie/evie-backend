import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { BACKEND_URL } from './api';

// Voz do sistema (a de sempre) — usada como reserva se o ElevenLabs
// falhar por qualquer motivo (sem internet, servidor fora, etc), pra a
// Evie nunca ficar muda.
function falarComVozDoSistema(texto, opcoesExtras = {}) {
  try {
    Speech.speak(texto, {
      language: 'pt-BR',
      pitch: 1.0,
      rate: 0.96,
      ...opcoesExtras,
    });
  } catch (e) {
    console.error('[voz] erro na voz de reserva:', e);
  }
}

// Guarda o player da última fala, pra poder parar ele antes de começar
// uma nova — evita duas falas tocando ao mesmo tempo (ficava com som
// embolado/estranho quando a Evie falava várias vezes seguidas rápido).
let playerAtual = null;
let contadorFala = 0;

// O Android às vezes deixa uma conexão de rede "presa" logo depois de usar
// o reconhecimento de voz — causa um erro de TLS na primeira tentativa
// seguinte. Tenta de novo automaticamente nesse caso específico.
async function fetchComNovaTentativa(url, opcoes, tentativas = 4) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fetch(url, opcoes);
    } catch (e) {
      const ehErroDeConexao =
        String(e?.message || e).includes('TLS') || String(e?.message || e).includes('fetch failed');
      const ultimaTentativa = i === tentativas - 1;
      if (!ehErroDeConexao || ultimaTentativa) throw e;
      const pausa = 800 * (i + 1);
      console.log(`[voz] erro de conexão (${e?.message || e}), tentando de novo em ${pausa}ms...`);
      await new Promise((r) => setTimeout(r, pausa));
    }
  }
}

// Voz por IA (ElevenLabs) — soa muito mais natural que a voz do sistema,
// mas depende de internet e leva um instante a mais pra responder.
export async function falar(texto, opcoesExtras = {}) {
  console.log('[voz] iniciando, tentando o serviço de voz. texto:', texto);

  // Cada chamada pega o "número" dela ANTES de esperar a rede. Se, quando
  // a resposta chegar, já existir uma chamada mais nova em andamento,
  // essa aqui desiste de tocar — evita o efeito de duas falas cortando
  // uma a outra no meio da palavra quando uma pergunta é feita rápido
  // demais depois da outra.
  contadorFala += 1;
  const numeroDestaChamada = contadorFala;

  try {
    await setAudioModeAsync({ playsInSilentMode: true });

    const response = await fetchComNovaTentativa(`${BACKEND_URL}/falar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ texto }),
    });

    console.log('[voz] resposta do backend, status:', response.status);

    if (!response.ok) {
      const corpoErro = await response.text().catch(() => '(sem corpo)');
      console.log('[voz] corpo do erro:', corpoErro);
      throw new Error(`Backend de voz respondeu ${response.status}`);
    }

    const { audioBase64 } = await response.json();
    if (!audioBase64) throw new Error('Resposta sem áudio');

    if (numeroDestaChamada !== contadorFala) {
      console.log('[voz] descartando fala antiga (já existe uma mais nova):', texto);
      return;
    }

    console.log('[voz] audio recebido, tamanho base64:', audioBase64.length, '— tocando agora');

    // Arquivo com nome único por fala — nunca sobrescreve um áudio que
    // ainda pode estar tocando.
    const arquivoDestaFala = `${FileSystem.cacheDirectory}fala-evie-${Date.now()}-${numeroDestaChamada}.mp3`;

    await FileSystem.writeAsStringAsync(arquivoDestaFala, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Confere de novo bem antes de tocar — escrever o arquivo no disco
    // também leva um tempinho, e uma chamada mais nova pode ter chegado
    // durante essa espera também.
    if (numeroDestaChamada !== contadorFala) {
      console.log('[voz] descartando fala antiga depois de gravar (já existe uma mais nova):', texto);
      FileSystem.deleteAsync(arquivoDestaFala, { idempotent: true }).catch(() => {});
      return;
    }

    // Para a fala anterior (se ainda estiver tocando) antes de começar
    // a nova, pra nunca sobrepor duas vozes ao mesmo tempo.
    if (playerAtual) {
      try {
        playerAtual.pause();
        playerAtual.release();
      } catch (e) {
        // player já pode ter sido liberado sozinho, sem problema
      }
    }

    const player = createAudioPlayer(arquivoDestaFala);
    playerAtual = player;
    player.play();
    console.log('[voz] Áudio gerado tocando com sucesso. arquivo:', arquivoDestaFala);

    // Limpa o arquivo temporário depois de um tempo generoso (a fala já
    // deve ter terminado de tocar), pra não acumular lixo no aparelho.
    setTimeout(() => {
      FileSystem.deleteAsync(arquivoDestaFala, { idempotent: true }).catch(() => {});
    }, 30000);
  } catch (e) {
    console.log('[voz] CAIU NA VOZ DE RESERVA (sistema). Motivo:', e?.message || e);
    if (numeroDestaChamada === contadorFala) {
      falarComVozDoSistema(texto, opcoesExtras);
    }
  }
}
