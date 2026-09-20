import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const LOGO_EVIE = require('../assets/evie-icon.png');

// Aparece só uma vez, na primeira vez que o app é aberto — depois disso o
// nome fica guardado pra sempre, e essa tela nunca mais aparece.
export default function NomeScreen({ onSalvar }) {
  const [nome, setNome] = useState('');

  const confirmar = () => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return;
    onSalvar(nomeLimpo);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.conteudo}>
        <View style={styles.logoBadge}>
          <Image source={LOGO_EVIE} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.titulo}>Oi! Eu sou a Evie,</Text>
        <Text style={styles.subtitulo}>sua assistente pessoal por voz. Como você quer que eu te chame?</Text>

        <TextInput
          style={styles.input}
          value={nome}
          onChangeText={setNome}
          placeholder="Seu nome"
          placeholderTextColor="#6B90BC"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={confirmar}
        />

        <TouchableOpacity
          style={[styles.botao, !nome.trim() && styles.botaoDesativado]}
          activeOpacity={0.8}
          onPress={confirmar}
          disabled={!nome.trim()}
        >
          <Text style={styles.botaoTexto}>Continuar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B2545',
  },
  conteudo: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logo: { width: 32, height: 32 },
  titulo: {
    color: '#FFFFFF',
    fontSize: 23,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 8,
  },
  subtitulo: {
    color: '#B8C9DC',
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 26,
    lineHeight: 21,
  },
  input: {
    borderWidth: 1.3,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  botao: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  botaoDesativado: { opacity: 0.4 },
  botaoTexto: { color: '#0B2545', fontSize: 15, fontFamily: 'Poppins_700Bold' },
});
