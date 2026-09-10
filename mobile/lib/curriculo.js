import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE_PERFIL = '@evie/perfil_profissional';

// Perfil salvo: { area, cargoAtual, habilidadesChave, tomSugerido, dataUpload }
export async function buscarPerfilProfissional() {
  try {
    const json = await AsyncStorage.getItem(CHAVE_PERFIL);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.error('[curriculo] erro ao buscar perfil:', e);
    return null;
  }
}

export async function salvarPerfilProfissional(perfil) {
  await AsyncStorage.setItem(CHAVE_PERFIL, JSON.stringify(perfil));
}

export async function removerPerfilProfissional() {
  await AsyncStorage.removeItem(CHAVE_PERFIL);
}
