import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE_LISTA = '@evie/posts';

export async function listarPosts() {
  try {
    const json = await AsyncStorage.getItem(CHAVE_LISTA);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('[posts] erro ao listar:', e);
    return [];
  }
}

// Cada post salvo: { id, tema, rede, opcoes: [string, string, string], data }
export async function salvarPost(post) {
  const lista = await listarPosts();
  const novaLista = [post, ...lista];
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}

export async function removerPost(id) {
  const lista = await listarPosts();
  const novaLista = lista.filter((p) => p.id !== id);
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}
