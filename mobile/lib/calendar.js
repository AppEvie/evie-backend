import * as Calendar from 'expo-calendar/legacy';

export async function pedirPermissaoAgenda() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function getCalendariosEditaveis() {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.filter((c) => c.allowsModifications);
}

// Escolhe o calendário certo para escrever: prioriza um calendário
// sincronizado com uma conta Google de verdade (source.type === 'com.google'
// no Android), e só usa um calendário "local"/sem conta como último recurso.
// Isso evita o bug de criar eventos num calendário que nunca aparece no
// app do Google Agenda.
async function getCalendarioParaEscrita() {
  const editaveis = await getCalendariosEditaveis();
  console.log('[calendar] calendarios editaveis encontrados:', JSON.stringify(
    editaveis.map((c) => ({ titulo: c.title, tipoConta: c.source?.type, isPrimary: c.isPrimary }))
  ));
  if (editaveis.length === 0) {
    throw new Error('Nenhum calendário editável encontrado no dispositivo.');
  }

  const doGoogle = editaveis.filter((c) => c.source?.type === 'com.google');
  const candidatos = doGoogle.length > 0 ? doGoogle : editaveis;

  const escolhido =
    candidatos.find((c) => c.isPrimary) || candidatos[0];

  console.log('[calendar] calendario escolhido pra escrever:', escolhido?.title, '| conta:', escolhido?.source?.type);

  return escolhido;
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

// Acha a agenda "Profissional" se ela já existe, ou cria uma nova
// (dentro da mesma conta Google do calendário principal) se ainda não
// existir. Assim dá pra separar compromissos pessoais de profissionais
// por cor, direto no Google Agenda.
export async function getOuCriarCalendarioProfissional() {
  const editaveis = await getCalendariosEditaveis();
  const existente = editaveis.find((c) => normalizar(c.title) === 'profissional');
  if (existente) {
    console.log('[calendar] agenda Profissional já existia:', existente.id);
    return existente;
  }

  const principal = await getCalendarioParaEscrita();
  const fonte = principal.source;

  console.log('[calendar] agenda Profissional não existe ainda, tentando criar na fonte:', JSON.stringify(fonte));

  try {
    const novoId = await Calendar.createCalendarAsync({
      title: 'Profissional',
      color: '#C9A227',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: fonte.id,
      source: fonte,
      name: 'Profissional',
      ownerAccount: fonte.name,
      accessLevel: 'owner',
    });

    const atualizados = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const criado = atualizados.find((c) => c.id === novoId);

    if (!criado) {
      // Alguns Androids "aceitam" o pedido mas não criam de verdade
      // (só o app oficial do Google Agenda tem essa permissão) — sem
      // erro nenhum, só não aparece na lista depois. Trata isso como
      // se tivesse falhado mesmo.
      console.log('[calendar] tentativa de criar Profissional não resultou em agenda encontrável.');
      throw new Error('AGENDA_PROFISSIONAL_INDISPONIVEL');
    }

    console.log('[calendar] agenda Profissional criada de verdade — id:', novoId);
    return criado;
  } catch (e) {
    console.log('[calendar] não foi possível criar a agenda Profissional automaticamente:', e?.message || e);
    throw new Error('AGENDA_PROFISSIONAL_INDISPONIVEL');
  }
}

// Cria o evento direto no calendário do sistema. Se houver uma conta
// Google configurada no aparelho, o evento é criado nela e sincroniza
// sozinho com o Google Agenda.
export async function criarEventoNaAgenda(agenda, categoria) {
  const calendario =
    categoria === 'profissional'
      ? await getOuCriarCalendarioProfissional()
      : await getCalendarioParaEscrita();
  const [ano, mes, dia] = agenda.data.split('-').map(Number);
  const [hh, mm] = (agenda.hora || '09:00').split(':').map(Number);
  const inicio = new Date(ano, mes - 1, dia, hh, mm);
  const fim = new Date(inicio.getTime() + (agenda.duracao_min || 60) * 60000);
  const recurrenceRule = montarRegraDeRecorrencia(agenda.recorrencia);

  console.log('[calendar] agenda.recorrencia recebida do backend:', agenda.recorrencia);
  console.log('[calendar] recurrenceRule montada:', JSON.stringify(recurrenceRule));

  const eventId = await Calendar.createEventAsync(calendario.id, {
    title: agenda.titulo || 'Evento',
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

  return {
    eventId,
    calendarioNome: calendario.title,
    ehGoogle: calendario.source?.type === 'com.google',
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
      titulo: e.title,
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
