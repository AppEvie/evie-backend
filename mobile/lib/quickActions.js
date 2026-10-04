import { Linking, Platform, Alert } from 'react-native';
import { limparNumeroParaDiscagem } from './telefone';
// Importante: NÃO importamos expo-intent-launcher no topo do arquivo.
// Esse módulo só existe no Android — no iOS, o próprio processo de
// carregar (import) um módulo nativo que não existe na plataforma pode
// travar o app inteiro na inicialização, antes mesmo de mostrar
// qualquer tela. Por isso ele só é carregado dinamicamente, e só
// quando realmente vamos usar (dentro do bloco "if Android").

export async function abrirAgendaNativa() {
  if (Platform.OS === 'ios') {
    try {
      // No iOS, "calshow://" é um esquema exclusivo da Apple — sempre
      // abre o Calendário nativo, mesmo que a pessoa tenha escolhido usar
      // o Google Agenda nas Configurações da Evie. Se o calendário
      // escolhido for do Google, tenta abrir o app do Google Agenda
      // primeiro (esquema próprio dele), caindo pro nativo se não
      // conseguir.
      const { buscarCalendarioEscolhidoId } = await import('./armazenamento');
      const { listarCalendariosDisponiveis } = await import('./calendar');
      const idEscolhido = await buscarCalendarioEscolhidoId();
      if (idEscolhido) {
        const calendarios = await listarCalendariosDisponiveis();
        const escolhido = calendarios.find((c) => c.id === idEscolhido);
        const pareceGoogle =
          escolhido &&
          (escolhido.source?.type === 'com.google' ||
            (escolhido.source?.name || '').toLowerCase().includes('gmail') ||
            (escolhido.source?.name || '').toLowerCase().includes('google'));
        if (pareceGoogle) {
          const podeAbrirGoogle = await Linking.canOpenURL('googlecalendar://');
          if (podeAbrirGoogle) {
            await Linking.openURL('googlecalendar://');
            return;
          }
        }
      }
    } catch (e) {
      // Qualquer erro nessa checagem extra não deve impedir de abrir o
      // calendário nativo como alternativa — só segue pro padrão abaixo.
    }
  }

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
  const { buscarAppEmailEscolhido } = await import('./armazenamento');
  const appEscolhido = await buscarAppEmailEscolhido(); // 'gmail' | 'outlook' | 'nativo'

  if (Platform.OS === 'ios') {
    // No iOS, cada app de email tem seu próprio esquema de link pra abrir
    // direto na caixa de entrada — não tem um jeito genérico de "abrir o
    // email padrão" como existe pra outras coisas.
    const esquemas = {
      gmail: 'googlegmail://',
      outlook: 'ms-outlook://',
      nativo: 'message://',
    };
    const url = esquemas[appEscolhido] || esquemas.gmail;
    try {
      const podeAbrir = await Linking.canOpenURL(url);
      if (podeAbrir) {
        await Linking.openURL(url);
        return;
      }
    } catch (e) {
      // segue pro reserva abaixo
    }
    try {
      await Linking.openURL('mailto:');
      Alert.alert('App não encontrado', 'Abri o app de email padrão, já que não achei o app escolhido instalado.');
    } catch (e2) {
      Alert.alert('Não consegui abrir', 'Não achei nenhum app de email instalado no celular.');
    }
    return;
  }

  // Android: usa o nome interno do pacote de cada app, via
  // expo-intent-launcher — carregado dinamicamente porque esse módulo só
  // existe no Android.
  //
  // Atenção: o Android 11+ só deixa o app "enxergar" outro app se o
  // manifesto declarar isso. Hoje quem declara é o expo-mail-composer
  // (ele diz que enxerga qualquer app que abre mailto:, e Gmail e Outlook
  // abrem). Se um dia o expo-mail-composer for removido do projeto, isso
  // aqui para de achar o Gmail/Outlook e cai sempre no aviso de reserva.
  const pacotes = {
    gmail: 'com.google.android.gm',
    outlook: 'com.microsoft.office.outlook',
  };
  if (appEscolhido !== 'nativo' && pacotes[appEscolhido]) {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      await IntentLauncher.openApplication(pacotes[appEscolhido]);
      return;
    } catch (e) {
      // app não instalado, ou algo impediu — cai pro reserva abaixo
    }
  }
  try {
    await Linking.openURL('mailto:');
    Alert.alert('App não encontrado', 'Abri o app de email padrão, já que não achei o app escolhido instalado.');
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
  // O número vai exatamente como está na agenda (sem acrescentar código de
  // país), só sem espaço e parênteses, que o endereço "tel:" não aceita.
  const limpo = numero ? limparNumeroParaDiscagem(numero).replace(/#/g, '%23') : '';
  const url = limpo ? `tel:${limpo}` : 'tel:';
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
