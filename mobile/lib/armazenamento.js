import AsyncStorage from '@react-native-async-storage/async-storage';

// Guarda coisas que precisam sobreviver ao fechar e abrir o app de novo —
// diferente do estado normal do React, que reseta toda vez.
const CHAVE_NOME = '@evie/nome_usuario';
const CHAVE_ULTIMA_SAUDACAO = '@evie/ultima_saudacao_periodo';
const CHAVE_PERSONALIDADE = '@evie/personalidade';

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
