import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE_LISTA = '@evie/documentos';
const PASTA_DOCUMENTOS = FileSystem.documentDirectory + 'documentos/';

async function garantirPasta() {
  const info = await FileSystem.getInfoAsync(PASTA_DOCUMENTOS);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PASTA_DOCUMENTOS, { intermediates: true });
  }
}

// Copia a foto (que fica num cache temporário) pra dentro da pasta
// permanente do app — sem isso, o Android pode apagar o arquivo original
// a qualquer momento.
export async function salvarImagemPermanente(uriTemporaria) {
  await garantirPasta();
  const nomeArquivo = `doc-${Date.now()}.jpg`;
  const destino = PASTA_DOCUMENTOS + nomeArquivo;
  await FileSystem.copyAsync({ from: uriTemporaria, to: destino });
  return destino;
}

export async function listarDocumentos() {
  try {
    const json = await AsyncStorage.getItem(CHAVE_LISTA);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('[documentos] erro ao listar:', e);
    return [];
  }
}

export async function salvarDocumento(documento) {
  const lista = await listarDocumentos();
  const novaLista = [documento, ...lista];
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}

export async function removerDocumento(id) {
  const lista = await listarDocumentos();
  const doc = lista.find((d) => d.id === id);
  const novaLista = lista.filter((d) => d.id !== id);
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  if (doc?.imagemUri) {
    FileSystem.deleteAsync(doc.imagemUri, { idempotent: true }).catch(() => {});
  }
  return novaLista;
}

// Guarda, no próprio documento, o id do compromisso criado na agenda a
// partir dele — assim a gente consegue mostrar um botão "ver documento"
// direto na lista de compromissos.
export async function vincularDocumentoAoEvento(documentoId, eventId) {
  const lista = await listarDocumentos();
  const novaLista = lista.map((d) => (d.id === documentoId ? { ...d, eventoVinculado: eventId } : d));
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}
