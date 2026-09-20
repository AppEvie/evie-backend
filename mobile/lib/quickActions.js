import { Linking, Platform, Alert } from 'react-native';
// Importante: NÃO importamos expo-intent-launcher no topo do arquivo.
// Esse módulo só existe no Android — no iOS, o próprio processo de
// carregar (import) um módulo nativo que não existe na plataforma pode
// travar o app inteiro na inicialização, antes mesmo de mostrar
// qualquer tela. Por isso ele só é carregado dinamicamente, e só
// quando realmente vamos usar (dentro do bloco "if Android").

export async function abrirAgendaNativa() {
  const url = Platform.OS === 'ios' ? 'calshow://' : 'content://com.android.calendar/time/';
  try {
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert('Não consegui abrir', 'Não achei um app de agenda instalado no celular.');
  }
}

export async function abrirWhatsapp(numero, mensagem) {
  if (numero) {
    const url = `https://wa.me/${numero.replace(/\D/g, '')}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Não consegui abrir', `Detalhe técnico: ${e?.message || String(e)}`);
    }
    return;
  }

  // Sem número específico: o WhatsApp não aceita um link de "conversa em
  // branco", então tentamos abrir só o app em si, por mais de um caminho
  // (o Android às vezes bloqueia um formato mas aceita outro).
  const tentativas =
    Platform.OS === 'android'
      ? ['android-app://com.whatsapp', 'whatsapp://']
      : ['whatsapp://'];

  for (const url of tentativas) {
    try {
      await Linking.openURL(url);
      return;
    } catch (e) {
      // tenta a próxima opção
    }
  }

  Alert.alert('Não consegui abrir', 'O WhatsApp não parece estar instalado neste celular.');
}

export async function abrirCaixaDeEntradaEmail() {
  if (Platform.OS === 'android') {
    try {
      // Abre o Gmail de verdade (direto na caixa de entrada), usando o
      // nome interno do pacote do app no Android — é o jeito confiável
      // de fazer isso, diferente de um link comum que só sabe compor
      // um email novo. Carregado dinamicamente aqui dentro (e não no
      // topo do arquivo) porque esse módulo só existe no Android.
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.openApplication('com.google.android.gm');
      return;
    } catch (e) {
      // Gmail não instalado, ou algo impediu — cai pro comportamento
      // padrão de compor um email novo, avisando o motivo.
    }
  }
  try {
    await Linking.openURL('mailto:');
    Alert.alert('Gmail não encontrado', 'Abri o app de email padrão pra escrever, já que não achei o Gmail instalado.');
  } catch (e2) {
    Alert.alert('Não consegui abrir', 'Não achei nenhum app de email instalado no celular.');
  }
}

export async function abrirComposerEmail() {
  try {
    await Linking.openURL('mailto:');
  } catch (e) {
    Alert.alert('Não consegui abrir', 'Não achei um app de email instalado no celular.');
  }
}

export async function abrirDiscador(numero) {
  const url = numero ? `tel:${numero}` : 'tel:';
  try {
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert('Não consegui abrir', 'Não consegui abrir o discador do celular.');
  }
}

// Abre o Google Maps (app ou navegador) já com a rota até o lugar.
export async function abrirRotaNoMaps(lat, lng, nome) {
  const destino = encodeURIComponent(nome || `${lat},${lng}`);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&q=${destino}&travelmode=driving`;
  try {
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert('Não consegui abrir', 'Não consegui abrir o mapa com a rota.');
  }
}
