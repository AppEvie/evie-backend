// Regras de data dos lembretes. Ficam separadas do app de propósito (sem nada
// do celular) pra poder testar com datas fixas.
//
// Um lembrete guarda { texto, hora: "HH:MM", data: "AAAA-MM-DD" }. O `data`
// vem do backend quando a pessoa disse o dia ("amanhã", "sexta", "todo dia
// 10"). Vazio quer dizer "hoje" (e é o caso dos lembretes antigos).

const doisDigitos = (n) => String(n).padStart(2, '0');

const ehDataISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Data no fuso do celular, tipo "2026-10-05".
export function dataLocalISO(d = new Date()) {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

function somarDias(iso, n) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return dataLocalISO(new Date(ano, mes - 1, dia + n));
}

// O lembrete conta no briefing de hoje se não tem dia (lembretes antigos),
// ou se o dia é hoje, ou se já passou e ele ainda não foi concluído
// (atrasado). Lembrete de amanhã em diante só entra quando chegar o dia.
export function lembreteVenceAteHoje(lembrete, hojeISO = dataLocalISO()) {
  const data = lembrete && lembrete.data;
  if (!ehDataISO(data)) return true;
  return data <= hojeISO;
}

// "hoje", "amanhã" ou "15/10".
export function rotuloDiaLembrete(dataISO, hojeISO = dataLocalISO()) {
  if (!ehDataISO(dataISO)) return '';
  if (dataISO === hojeISO) return 'hoje';
  if (dataISO === somarDias(hojeISO, 1)) return 'amanhã';
  const [, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}`;
}

// Linha de apoio da lista de lembretes: "amanhã às 09:00", "15/10 às 14:30".
export function textoQuandoLembrete(lembrete, hojeISO = dataLocalISO()) {
  const dia = rotuloDiaLembrete(lembrete && lembrete.data, hojeISO);
  const hora = (lembrete && lembrete.hora) || '';
  if (dia && hora) return `${dia} às ${hora}`;
  if (dia) return dia;
  if (hora) return `às ${hora}`;
  return '';
}

// Quando o aviso deve tocar: no dia pedido, no horário pedido. Sem dia (ou
// com um dia que já passou), vale hoje. Se o horário desse dia já passou,
// toca no mesmo horário do dia seguinte. Devolve também o dia em que vai
// tocar de verdade, pra o lembrete guardar o dia certo.
export function calcularAlvoLembrete(horaTexto, dataISO, agora = new Date()) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec((horaTexto || '').trim());
  if (!m) return null;
  const hora = parseInt(m[1], 10);
  const minuto = parseInt(m[2], 10);
  if (hora > 24 || (hora === 24 && minuto !== 0) || minuto > 59) return null;

  const hojeISO = dataLocalISO(agora);
  const diaISO = ehDataISO(dataISO) && dataISO >= hojeISO ? dataISO : hojeISO;
  const [ano, mes, dia] = diaISO.split('-').map(Number);

  let alvo = new Date(ano, mes - 1, dia, hora, minuto, 0, 0);
  if (alvo <= agora) {
    alvo = new Date(ano, mes - 1, dia + 1, hora, minuto, 0, 0);
  }
  return { alvo, dataISO: dataLocalISO(alvo) };
}
