import { useEffect, useRef } from 'react';
import { View, Image, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const LOGO_EVIE = require('../assets/evie-icon.png');
const SOM_ABERTURA = require('../assets/intro-chime.wav');

// Tela de abertura: dois "anéis de pulso" saem do ícone como uma onda sonora,
// uma linha de luz varre a logo, o nome surge depois, e uma barra fina de
// carregamento passa embaixo — como uma tela de boot de um aparelho.
// Chama onFinish() quando a animação de saída termina.
export default function IntroScreen({ onFinish }) {
  const anelUmEscala = useRef(new Animated.Value(0.4)).current;
  const anelUmOpacidade = useRef(new Animated.Value(0)).current;
  const anelDoisEscala = useRef(new Animated.Value(0.4)).current;
  const anelDoisOpacidade = useRef(new Animated.Value(0)).current;

  const iconeOpacidade = useRef(new Animated.Value(0)).current;
  const iconeEscala = useRef(new Animated.Value(0.75)).current;

  const varreduraY = useRef(new Animated.Value(-85)).current;
  const varreduraOpacidade = useRef(new Animated.Value(0)).current;

  const nomeOpacidade = useRef(new Animated.Value(0)).current;
  const nomeSubida = useRef(new Animated.Value(10)).current;

  const progresso = useRef(new Animated.Value(0)).current;
  const saida = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Toca o som de abertura. Fica isolado em try/catch porque som é só um
    // "tempero" — se falhar por qualquer motivo (aparelho no silencioso,
    // módulo indisponível, etc.), a animação não pode travar por causa disso.
    let player = null;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        player = createAudioPlayer(SOM_ABERTURA);
        player.volume = 0.7;
        player.play();
      } catch (e) {
        console.error('[intro] não consegui tocar o som de abertura:', e);
      }
    })();

    return () => {
      if (player) {
        try {
          player.release();
        } catch (e) {
          // já pode ter sido liberado, sem problema
        }
      }
    };
  }, []);

  useEffect(() => {
    function pulso(escalaVal, opacidadeVal, atraso) {
      return Animated.sequence([
        Animated.delay(atraso),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacidadeVal, { toValue: 0.55, duration: 120, useNativeDriver: true }),
            Animated.timing(opacidadeVal, { toValue: 0, duration: 700, useNativeDriver: true }),
          ]),
          Animated.timing(escalaVal, {
            toValue: 1.9,
            duration: 820,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]);
    }

    Animated.parallel([
      Animated.timing(iconeOpacidade, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(iconeEscala, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      pulso(anelUmEscala, anelUmOpacidade, 0),
      pulso(anelDoisEscala, anelDoisOpacidade, 260),
      Animated.sequence([
        Animated.delay(420),
        Animated.parallel([
          Animated.timing(varreduraOpacidade, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(varreduraY, {
            toValue: 85,
            duration: 480,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(varreduraOpacidade, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(650),
        Animated.parallel([
          Animated.timing(nomeOpacidade, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(nomeSubida, {
            toValue: 0,
            duration: 400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.timing(progresso, {
        toValue: 1,
        duration: 1700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // largura não aceita o driver nativo
      }),
    ]).start();

    const espera = setTimeout(() => {
      Animated.timing(saida, { toValue: 0, duration: 380, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onFinish();
      });
    }, 1900);

    return () => clearTimeout(espera);
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity: saida }}>
      <LinearGradient colors={['#0B2545', '#004182']} style={styles.container}>
      <View style={styles.centro}>
        <Animated.View
          style={[styles.anel, { opacity: anelUmOpacidade, transform: [{ scale: anelUmEscala }] }]}
        />
        <Animated.View
          style={[styles.anel, { opacity: anelDoisOpacidade, transform: [{ scale: anelDoisEscala }] }]}
        />

        <Animated.View style={{ opacity: iconeOpacidade, transform: [{ scale: iconeEscala }] }}>
          <View style={styles.iconeWrap}>
            <Image source={LOGO_EVIE} style={styles.logo} resizeMode="contain" />
            <Animated.View
              style={[
                styles.varredura,
                { opacity: varreduraOpacidade, transform: [{ translateY: varreduraY }] },
              ]}
            />
          </View>
        </Animated.View>
      </View>

      <Animated.Text
        style={[styles.wordmark, { opacity: nomeOpacidade, transform: [{ translateY: nomeSubida }] }]}
      >
        Evie
      </Animated.Text>

      <View style={styles.progressoTrilho}>
        <Animated.View
          style={[
            styles.progressoBarra,
            {
              width: progresso.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centro: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anel: {
    position: 'absolute',
    width: 164,
    height: 164,
    borderRadius: 82,
    borderWidth: 1.6,
    borderColor: '#FFFFFF',
  },
  iconeWrap: {
    width: 156,
    height: 156,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 156, height: 156 },
  varredura: {
    position: 'absolute',
    left: -16,
    right: -16,
    height: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 40,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  progressoTrilho: {
    position: 'absolute',
    bottom: 64,
    width: 120,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressoBarra: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
});
