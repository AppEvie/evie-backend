import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE_LISTA = '@evie/sinteses';
const PASTA_SINTESES = FileSystem.documentDirectory + 'sinteses/';

async function garantirPasta() {
  const info = await FileSystem.getInfoAsync(PASTA_SINTESES);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PASTA_SINTESES, { intermediates: true });
  }
}

export async function salvarImagemSintesePermanente(uriTemporaria) {
  await garantirPasta();
  const nomeArquivo = `sintese-${Date.now()}-${Math.round(Math.random() * 9999)}.jpg`;
  const destino = PASTA_SINTESES + nomeArquivo;
  await FileSystem.copyAsync({ from: uriTemporaria, to: destino });
  return destino;
}

export async function listarSinteses() {
  try {
    const json = await AsyncStorage.getItem(CHAVE_LISTA);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('[sinteses] erro ao listar:', e);
    return [];
  }
}

// Cada síntese salva: { id, titulo, tipoDocumento, resumo, pontosPrincipais, paginas: [uri], data }
export async function salvarSintese(sintese) {
  const lista = await listarSinteses();
  const novaLista = [sintese, ...lista];
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}

export async function removerSintese(id) {
  const lista = await listarSinteses();
  const novaLista = lista.filter((s) => s.id !== id);
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}
