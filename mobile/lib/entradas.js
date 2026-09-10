import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE = '@evie/entradas';

// Carrega a lista completa (lembretes, rascunhos de email, cálculos)
// salva da última vez que o app foi usado.
export async function carregarEntradas() {
  try {
    const json = await AsyncStorage.getItem(CHAVE);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('[entradas] erro ao carregar:', e);
    return [];
  }
}

// Salva a lista inteira de uma vez — mais simples e seguro do que ficar
// atualizando item por item, já que a lista muda em vários lugares
// diferentes do app.
export async function salvarEntradas(lista) {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch (e) {
    console.error('[entradas] erro ao salvar:', e);
  }
}
