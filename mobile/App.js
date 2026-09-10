import { useState, useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';
import {
  useFonts,
  Fraunces_600SemiBold,
  Fraunces_500Medium_Italic,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import HomeScreen from './screens/HomeScreen';
import IntroScreen from './screens/IntroScreen';
import NomeScreen from './screens/NomeScreen';
import PersonalidadeScreen from './screens/PersonalidadeScreen';
import {
  buscarNomeUsuario,
  salvarNomeUsuario,
  buscarPersonalidade,
  salvarPersonalidade,
} from './lib/armazenamento';

export default function App() {
  return (
    <ShareIntentProvider>
      <AppConteudo />
    </ShareIntentProvider>
  );
}

function AppConteudo() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
    Fraunces_700Bold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [introConcluida, setIntroConcluida] = useState(false);

  // null = ainda não checou o armazenamento; '' = checou e não tem valor
  // salvo ainda; string = valor de verdade, já salvo antes.
  const [nomeUsuario, setNomeUsuario] = useState(null);
  const [personalidade, setPersonalidade] = useState(null);

  useEffect(() => {
    buscarNomeUsuario().then((nome) => setNomeUsuario(nome || ''));
    buscarPersonalidade().then((p) => setPersonalidade(p || ''));
  }, []);

  if (!fontsLoaded || nomeUsuario === null || personalidade === null) {
    return <View style={{ flex: 1, backgroundColor: '#0B2545' }} />;
  }

  if (!introConcluida) {
    return (
      <>
        <StatusBar style="light" />
        <IntroScreen onFinish={() => setIntroConcluida(true)} />
      </>
    );
  }

  if (!nomeUsuario) {
    return (
      <>
        <StatusBar style="light" />
        <NomeScreen
          onSalvar={async (nome) => {
            await salvarNomeUsuario(nome);
            setNomeUsuario(nome);
          }}
        />
      </>
    );
  }

  if (!personalidade) {
    return (
      <>
        <StatusBar style="light" />
        <PersonalidadeScreen
          onEscolher={async (escolha) => {
            await salvarPersonalidade(escolha);
            setPersonalidade(escolha);
          }}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <HomeScreen
        nomeUsuario={nomeUsuario}
        personalidade={personalidade}
        onAtualizarNome={async (nome) => {
          await salvarNomeUsuario(nome);
          setNomeUsuario(nome);
        }}
        onAtualizarPersonalidade={async (escolha) => {
          await salvarPersonalidade(escolha);
          setPersonalidade(escolha);
        }}
      />
    </>
  );
}
