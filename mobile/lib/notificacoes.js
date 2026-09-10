import * as Notifications from 'expo-notifications';

// Identificadores fixos, pra sempre reconhecermos essas duas notificações
// específicas (e não duplicar, e saber qual foi tocada).
export const ID_NOTIFICACAO_MANHA = 'evie-briefing-manha';
export const ID_NOTIFICACAO_NOITE = 'evie-briefing-noite';

// Faz a notificação aparecer normalmente mesmo com o app aberto em primeiro
// plano (por padrão o Android/iOS esconderia ela nesse caso).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function pedirPermissaoNotificacao() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Agenda as duas notificações diárias (manhã e noite), repetindo todo dia
// no mesmo horário. É seguro chamar de novo — cada uma tem um id fixo, então
// reagendar substitui a anterior em vez de duplicar.
export async function agendarNotificacoesDiarias({ horaManha = 8, minutoManha = 0, horaNoite = 20, minutoNoite = 0 } = {}) {
  const permitido = await pedirPermissaoNotificacao();
  if (!permitido) return false;

  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_MANHA).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_NOITE).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: ID_NOTIFICACAO_MANHA,
    content: {
      title: 'Bom dia! ☀️',
      body: 'Confira seus compromissos de hoje — toque aqui pra eu te contar.',
      data: { tipo: 'briefing-manha' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: horaManha,
      minute: minutoManha,
    },
  });

  await Notifications.scheduleNotificationAsync({
    identifier: ID_NOTIFICACAO_NOITE,
    content: {
      title: 'Boa noite! 🌙',
      body: 'Vamos ver o que te espera amanhã — toque aqui pra eu te contar.',
      data: { tipo: 'briefing-noite' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: horaNoite,
      minute: minutoNoite,
    },
  });

  return true;
}

export async function cancelarNotificacoesDiarias() {
  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_MANHA).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_NOITE).catch(() => {});
}

// Agenda uma notificação única (não repete) pro horário certo de um
// lembrete específico. Se o horário já passou hoje, agenda pra amanhã
// no mesmo horário.
export async function agendarNotificacaoLembrete(lembreteId, texto, horaTexto) {
  const permitido = await pedirPermissaoNotificacao();
  if (!permitido) return false;

  const [horaStr, minutoStr] = horaTexto.split(':');
  const hora = parseInt(horaStr, 10);
  const minuto = parseInt(minutoStr, 10);
  if (isNaN(hora) || isNaN(minuto)) return false;

  const agora = new Date();
  const alvo = new Date();
  alvo.setHours(hora, minuto, 0, 0);
  if (alvo <= agora) {
    alvo.setDate(alvo.getDate() + 1);
  }

  const idNotificacao = `evie-lembrete-${lembreteId}`;
  await Notifications.cancelScheduledNotificationAsync(idNotificacao).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: idNotificacao,
    content: {
      title: 'Lembrete 🔔',
      body: texto,
      data: { tipo: 'lembrete', lembreteId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alvo },
  });

  return true;
}

export async function cancelarNotificacaoLembrete(lembreteId) {
  await Notifications.cancelScheduledNotificationAsync(`evie-lembrete-${lembreteId}`).catch(() => {});
}

// Tenta entender um horário falado em formatos numéricos comuns
// ("21:30", "21h30", "9h", "14 horas"). Devolve "HH:MM" ou null se não
// conseguir entender — nesse caso, a tela sempre tem o campo de digitar
// como alternativa garantida.
export function parseHorarioFalado(texto) {
  const limpo = (texto || '').toLowerCase().trim();

  // Expressões por extenso, sem números — checa antes de tudo.
  if (/meio[\s-]?dia\s+e\s+meia/.test(limpo)) return '12:30';
  if (/meio[\s-]?dia/.test(limpo)) return '12:00';
  if (/meia[\s-]?noite\s+e\s+meia/.test(limpo)) return '00:30';
  if (/meia[\s-]?noite/.test(limpo)) return '00:00';

  // "21:30" ou "9:5"
  let m = limpo.match(/(\d{1,2}):(\d{1,2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;

  // "21h30" ou "9h5"
  m = limpo.match(/(\d{1,2})h(\d{1,2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;

  // "9 horas e meia" ou "9 e meia" (sem "da noite/tarde" — assume meia hora)
  m = limpo.match(/(\d{1,2})\s*(horas?)?\s*e\s*meia\b/);
  if (m) return `${m[1].padStart(2, '0')}:30`;

  // "9 da noite" ou "9 da tarde" → soma 12h (vira horário 24h)
  m = limpo.match(/(\d{1,2})\s*(horas?)?\s*da\s*(noite|tarde)/);
  if (m) {
    const hora = parseInt(m[1], 10);
    const hora24 = hora < 12 ? hora + 12 : hora;
    return `${String(hora24).padStart(2, '0')}:00`;
  }

  // "9 da manhã" → mantém como está
  m = limpo.match(/(\d{1,2})\s*(horas?)?\s*da\s*manh[ãa]/);
  if (m) return `${m[1].padStart(2, '0')}:00`;

  // "21h" ou "9 horas" (sem minutos)
  m = limpo.match(/(\d{1,2})\s*h(oras)?\b/);
  if (m) return `${m[1].padStart(2, '0')}:00`;

  // só um número solto, tipo "21" ou "9"
  m = limpo.match(/^(\d{1,2})$/);
  if (m) return `${m[1].padStart(2, '0')}:00`;

  return null;
}
