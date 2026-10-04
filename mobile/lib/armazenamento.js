import AsyncStorage from '@react-native-async-storage/async-storage';

// Guarda coisas que precisam sobreviver ao fechar e abrir o app de novo —
// diferente do estado normal do React, que reseta toda vez.
const CHAVE_NOME = '@evie/nome_usuario';
const CHAVE_ULTIMA_SAUDACAO = '@evie/ultima_saudacao_periodo';
const CHAVE_PERSONALIDADE = '@evie/personalidade';
const CHAVE_CALENDARIO_ESCOLHIDO = '@evie/calendario_escolhido_id';
const CHAVE_SEPARAR_CATEGORIAS = '@evie/separar_pessoal_profissional';
const CHAVE_APP_EMAIL_ESCOLHIDO = '@evie/app_email_escolhido';

// 'gmail' | 'outlook' | 'nativo' — controla qual aplicativo abre quando a
// pessoa toca no atalho "Email". Sem nada salvo ainda, usa 'gmail' como
// padrão (mantém o comportamento de sempre).
export async function buscarAppEmailEscolhido() {
  try {
    return (await AsyncStorage.getItem(CHAVE_APP_EMAIL_ESCOLHIDO)) || 'gmail';
  } catch (e) {
    console.error('[armazenamento] erro ao buscar app de email escolhido:', e);
    return 'gmail';
  }
}

export async function salvarAppEmailEscolhido(app) {
  try {
    await AsyncStorage.setItem(CHAVE_APP_EMAIL_ESCOLHIDO, app);
  } catch (e) {
    console.error('[armazenamento] erro ao salvar app de email escolhido:', e);
  }
}

// Controla se a Evie pergunta "pessoal ou profissional" e usa calendários
// separados pra cada um, ou se trata tudo igual, sempre no mesmo
// calendário escolhido. Por padrão (nada salvo ainda) mantém o
// comportamento de sempre: true = separa.
export async function buscarSepararCategorias() {
  try {
    const valor = await AsyncStorage.getItem(CHAVE_SEPARAR_CATEGORIAS);
    return valor === null ? true : valor === 'true';
  } catch (e) {
    console.error('[armazenamento] erro ao buscar preferência de categorias:', e);
    return true;
  }
}

export async function salvarSepararCategorias(separar) {
  try {
    await AsyncStorage.setItem(CHAVE_SEPARAR_CATEGORIAS, separar ? 'true' : 'false');
  } catch (e) {
    console.error('[armazenamento] erro ao salvar preferência de categorias:', e);
  }
}

export async function buscarCalendarioEscolhidoId() {
  try {
    return await AsyncStorage.getItem(CHAVE_CALENDARIO_ESCOLHIDO);
  } catch (e) {
    console.error('[armazenamento] erro ao buscar calendário escolhido:', e);
    return null;
  }
}

export async function salvarCalendarioEscolhidoId(id) {
  try {
    if (id) {
      await AsyncStorage.setItem(CHAVE_CALENDARIO_ESCOLHIDO, id);
    } else {
      await AsyncStorage.removeItem(CHAVE_CALENDARIO_ESCOLHIDO);
    }
  } catch (e) {
    console.error('[armazenamento] erro ao salvar calendário escolhido:', e);
  }
}

export async function buscarNomeUsuario() {
  try {
    return await AsyncStorage.getItem(CHAVE_NOME);
  } catch (e) {
    console.error('[armazenamento] erro ao buscar nome:', e);
    return null;
  }
}

export async function salvarNomeUsuario(nome) {
  try {
    await AsyncStorage.setItem(CHAVE_NOME, nome.trim());
  } catch (e) {
    console.error('[armazenamento] erro ao salvar nome:', e);
  }
}

// 'sofisticada' | 'pratica' | 'divertida'
export async function buscarPersonalidade() {
  try {
    return await AsyncStorage.getItem(CHAVE_PERSONALIDADE);
  } catch (e) {
    console.error('[armazenamento] erro ao buscar personalidade:', e);
    return null;
  }
}

export async function salvarPersonalidade(personalidade) {
  try {
    await AsyncStorage.setItem(CHAVE_PERSONALIDADE, personalidade);
  } catch (e) {
    console.error('[armazenamento] erro ao salvar personalidade:', e);
  }
}

// Retorna algo como "2026-08-18-tarde" — usado pra saber se a Evie já
// saudou a pessoa nesse período do dia, mesmo depois de fechar o app.
export function chavePeriodoAtual() {
  const agora = new Date();
  const hora = agora.getHours();
  const periodo = hora < 12 ? 'manha' : hora < 18 ? 'tarde' : 'noite';
  const dataISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(
    agora.getDate()
  ).padStart(2, '0')}`;
  return `${dataISO}-${periodo}`;
}

export async function buscarUltimaSaudacao() {
  try {
    return await AsyncStorage.getItem(CHAVE_ULTIMA_SAUDACAO);
  } catch (e) {
    console.error('[armazenamento] erro ao buscar última saudação:', e);
    return null;
  }
}

export async function salvarUltimaSaudacao(chave) {
  try {
    await AsyncStorage.setItem(CHAVE_ULTIMA_SAUDACAO, chave);
  } catch (e) {
    console.error('[armazenamento] erro ao salvar última saudação:', e);
  }
}
