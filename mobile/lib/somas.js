import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE_LISTA = '@evie/somas';
const PASTA_SOMAS = FileSystem.documentDirectory + 'somas/';

async function garantirPasta() {
  const info = await FileSystem.getInfoAsync(PASTA_SOMAS);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PASTA_SOMAS, { intermediates: true });
  }
}

// Copia a foto pra pasta permanente do app (mesmo esquema dos documentos).
export async function salvarImagemSomaPermanente(uriTemporaria) {
  await garantirPasta();
  const nomeArquivo = `soma-${Date.now()}-${Math.round(Math.random() * 9999)}.jpg`;
  const destino = PASTA_SOMAS + nomeArquivo;
  await FileSystem.copyAsync({ from: uriTemporaria, to: destino });
  return destino;
}

export async function listarSomas() {
  try {
    const json = await AsyncStorage.getItem(CHAVE_LISTA);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('[somas] erro ao listar:', e);
    return [];
  }
}

// Cada soma salva: { id, pasta, total, arquivos: [{uri, valor, nome}], data }
export async function salvarSoma(soma) {
  const lista = await listarSomas();
  const novaLista = [soma, ...lista];
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}

export async function removerSoma(id) {
  const lista = await listarSomas();
  const novaLista = lista.filter((s) => s.id !== id);
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}

// Atualiza uma soma já salva (usado pra adicionar mais arquivos nela
// depois, sem precisar criar um registro novo).
export async function atualizarSoma(id, dadosNovos) {
  const lista = await listarSomas();
  const novaLista = lista.map((s) => (s.id === id ? { ...s, ...dadosNovos } : s));
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}

// Lista os nomes de pasta já usados antes (sem repetir), pra sugerir
// reaproveitamento na hora de salvar uma soma nova.
export async function listarNomesDePastaUsados() {
  const lista = await listarSomas();
  const nomes = [...new Set(lista.map((s) => s.pasta).filter(Boolean))];
  return nomes;
}
