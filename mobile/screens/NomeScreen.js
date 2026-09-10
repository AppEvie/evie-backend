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
        <Image source={LOGO_EVIE} style={styles.logo} resizeMode="contain" />
        <Text style={styles.titulo}>Prazer em te conhecer.</Text>
        <Text style={styles.subtitulo}>Como posso te chamar?</Text>

        <TextInput
          style={styles.input}
          value={nome}
          onChangeText={setNome}
          placeholder="Seu nome"
          placeholderTextColor="#6B7688"
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
  logo: { width: 60, height: 60, marginBottom: 28 },
  titulo: {
    color: '#F5F1E8',
    fontSize: 26,
    fontFamily: 'Fraunces_700Bold',
    marginBottom: 8,
  },
  subtitulo: {
    color: '#9AA3B8',
    fontSize: 15,
    marginBottom: 28,
  },
  input: {
    borderWidth: 1.3,
    borderColor: '#2A4048',
    backgroundColor: '#0D5AA8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#F5F1E8',
    marginBottom: 20,
  },
  botao: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  botaoDesativado: { opacity: 0.4 },
  botaoTexto: { color: '#0B2545', fontSize: 15, fontWeight: '700' },
});
