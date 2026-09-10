import { Linking, Platform, Alert } from 'react-native';

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
  try {
    // Abre o Gmail direto na caixa de entrada.
    await Linking.openURL('googlegmail://');
  } catch (e) {
    // Gmail não instalado (ou esquema bloqueado) — cai pro comportamento
    // padrão de compor um email novo, avisando o motivo.
    try {
      await Linking.openURL('mailto:');
      Alert.alert('Gmail não encontrado', 'Abri o app de email padrão pra escrever, já que não achei o Gmail instalado.');
    } catch (e2) {
      Alert.alert('Não consegui abrir', 'Não achei nenhum app de email instalado no celular.');
    }
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
