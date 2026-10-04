import * as Calendar from 'expo-calendar/legacy';
import { buscarCalendarioEscolhidoId } from './armazenamento';

export async function pedirPermissaoAgenda() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function getCalendariosEditaveis() {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.filter((c) => c.allowsModifications);
}

// Lista os calendários disponíveis pra mostrar na tela de Configurações,
// pra pessoa escolher manualmente qual quer usar — mais confiável do que
// tentar adivinhar automaticamente, já que isso varia bastante entre
// aparelhos e contas configuradas.
export async function listarCalendariosDisponiveis() {
  return getCalendariosEditaveis();
}

// Escolhe o calendário certo para escrever. Ordem de prioridade:
// 1) O que a pessoa escolheu manualmente em Configurações, se ainda existir
// 2) Um calendário sincronizado com conta Google de verdade (Android)
// 3) Qualquer calendário editável disponível, como último recurso
async function getCalendarioParaEscrita() {
  const editaveis = await getCalendariosEditaveis();
  if (editaveis.length === 0) {
    throw new Error('Nenhum calendário editável encontrado no dispositivo.');
  }

  const idEscolhidoManualmente = await buscarCalendarioEscolhidoId();
  if (idEscolhidoManualmente) {
    const escolhidoManual = editaveis.find((c) => c.id === idEscolhidoManualmente);
    if (escolhidoManual) return escolhidoManual;
    // Se o calendário salvo não existe mais (foi removido, conta
    // desconectada), cai pro comportamento automático abaixo.
  }

  const doGoogle = editaveis.filter((c) => c.source?.type === 'com.google');
  const candidatos = doGoogle.length > 0 ? doGoogle : editaveis;

  return candidatos.find((c) => c.isPrimary) || candidatos[0];
}

export function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove acentos
}

// Traduz o texto de recorrência que vem do backend ("mensal", "semanal"
// etc.) pro formato que o expo-calendar entende. Usa as strings diretas
// ('monthly' etc.) em vez do objeto Calendar.Frequency, porque em algumas
// versões esse objeto não vem exportado corretamente e retorna undefined
// silenciosamente — o que cria o evento sem recorrência nenhuma, sem erro.
function montarRegraDeRecorrencia(recorrencia) {
  const mapa = {
    diaria: 'daily',
    semanal: 'weekly',
    mensal: 'monthly',
    anual: 'yearly',
  };
  const frequency = mapa[recorrencia];
  if (!frequency) return undefined;
  return { frequency };
}

// Cria o evento direto no calendário do sistema — sempre no mesmo
// calendário (escolhido manualmente pela pessoa, ou detectado
// automaticamente). Quando o compromisso é profissional, adiciona uma
// marcação no título só pra diferenciar dentro do próprio calendário
// nativo — não cria nenhum calendário separado, evitando confusão.
export async function criarEventoNaAgenda(agenda, categoria) {
  const calendario = await getCalendarioParaEscrita();
  const [ano, mes, dia] = agenda.data.split('-').map(Number);
  const [hh, mm] = (agenda.hora || '09:00').split(':').map(Number);
  const inicio = new Date(ano, mes - 1, dia, hh, mm);
  const fim = new Date(inicio.getTime() + (agenda.duracao_min || 60) * 60000);
  const recurrenceRule = montarRegraDeRecorrencia(agenda.recorrencia);

  const tituloBase = agenda.titulo || 'Evento';
  const tituloParaCalendario = categoria === 'profissional' ? `${tituloBase} (Profissional)` : tituloBase;

  console.log('[calendar] agenda.recorrencia recebida do backend:', agenda.recorrencia);
  console.log('[calendar] recurrenceRule montada:', JSON.stringify(recurrenceRule));

  const eventId = await Calendar.createEventAsync(calendario.id, {
    title: tituloParaCalendario,
    startDate: inicio,
    endDate: fim,
    location: agenda.local || '',
    notes: agenda.descricao || '',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(recurrenceRule ? { recurrenceRule } : {}),
  });

  console.log('[calendar] evento criado — id:', eventId, '| calendario:', calendario.title, '| inicio:', inicio.toString());

  if (recurrenceRule) {
    try {
      const eventoSalvo = await Calendar.getEventAsync(eventId);
      console.log('[calendar] evento relido depois de criar, recurrenceRule salva:', JSON.stringify(eventoSalvo.recurrenceRule));
    } catch (e) {
      console.log('[calendar] não consegui reler o evento pra conferir:', e);
    }
  }

  // No Android, contas Google têm source.type === 'com.google'. No iOS,
  // esse mesmo tipo não existe — contas Google aparecem lá com outro tipo
  // (geralmente CalDAV), mas o nome da fonte costuma trazer "gmail" ou
  // "google". Checando os dois jeitos, o aviso de "não achei uma conta
  // Google" fica correto nas duas plataformas.
  const nomeFonteNormalizado = (calendario.source?.name || '').toLowerCase();
  const ehGoogle =
    calendario.source?.type === 'com.google' ||
    nomeFonteNormalizado.includes('gmail') ||
    nomeFonteNormalizado.includes('google');

  return {
    eventId,
    calendarioNome: calendario.title,
    ehGoogle,
    inicioSalvo: inicio,
  };
}

// Busca os próximos compromissos (padrão: 14 dias a partir de agora)
// direto do calendário do sistema — é a fonte da verdade, funciona
// mesmo depois de fechar e abrir o app de novo.
export async function buscarProximosEventos(dias = 14) {
  const editaveis = await getCalendariosEditaveis();
  if (editaveis.length === 0) return [];

  const agora = new Date();
  const fim = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);

  const eventos = await Calendar.getEventsAsync(
    editaveis.map((c) => c.id),
    agora,
    fim
  );

  return eventos
    .map((e) => ({
      id: e.id,
      // Remove a marcação "(Profissional)" do título aqui — ela só deve
      // aparecer no calendário nativo (onde ajuda a diferenciar), nunca
      // dentro do próprio app da Evie (cartões, briefing, resposta
      // falada), pra não parecer repetitivo ou confuso.
      titulo: (e.title || '').replace(/\s*\(Profissional\)\s*$/i, ''),
      local: e.location,
      inicio: new Date(e.startDate),
      fim: new Date(e.endDate),
    }))
    .sort((a, b) => a.inicio - b.inicio);
}

// Cancela um compromisso procurando por palavras-chave no título
// (ignorando acentos e maiúsculas/minúsculas) e opcionalmente uma data,
// e apagando do calendário do sistema.
// Retorna o evento cancelado, ou null se não achou nenhum correspondente.
export async function cancelarEventoPorTitulo(tituloBusca, dataISO) {
  if (!tituloBusca) return null;
  const proximos = await buscarProximosEventos(60);
  const busca = normalizar(tituloBusca);

  const candidatos = proximos.filter((e) => {
    const bateTitulo = normalizar(e.titulo).includes(busca);
    if (!bateTitulo) return false;
    if (dataISO) {
      const dataEvento = `${e.inicio.getFullYear()}-${String(e.inicio.getMonth() + 1).padStart(2, '0')}-${String(e.inicio.getDate()).padStart(2, '0')}`;
      return dataEvento === dataISO;
    }
    return true;
  });

  if (candidatos.length === 0) return null;

  const alvo = candidatos[0];
  await Calendar.deleteEventAsync(alvo.id);
  return alvo;
}

// Cancela um compromisso direto pelo id — usado quando a pessoa toca no
// ícone de lixeira em vez de pedir por voz.
export async function cancelarEventoPorId(id) {
  await Calendar.deleteEventAsync(id);
}

// Lista os calendários disponíveis no aparelho, útil para diagnóstico.
export async function listarCalendarios() {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.map((c) => ({
    titulo: c.title,
    editavel: c.allowsModifications,
    fonte: c.source?.name,
    tipoFonte: c.source?.type,
    primario: c.isPrimary,
  }));
}
