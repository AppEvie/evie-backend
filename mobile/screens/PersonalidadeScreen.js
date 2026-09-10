import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

const OPCOES = [
  {
    chave: 'sofisticada',
    icone: 'diamond',
    titulo: 'Sofisticada',
    descricao: 'Elegante e refinada, com um toque de classe.',
    exemplo: '"Reunião agendada — cuidadosamente organizada para amanhã às 15h."',
  },
  {
    chave: 'pratica',
    icone: 'briefcase',
    titulo: 'Prática',
    descricao: 'Direta e eficiente, sem rodeios.',
    exemplo: '"Reunião marcada. Amanhã, 15h."',
  },
  {
    chave: 'divertida',
    icone: 'smile-o',
    titulo: 'Divertida',
    descricao: 'Leve e descontraída no jeito de falar.',
    exemplo: '"Prontinho! Reunião marcada pra amanhã, 15h!"',
  },
];

// Aparece só uma vez, logo depois da tela de nome — a pessoa escolhe o
// jeito que a Evie fala com ela. Fica guardado pra sempre.
export default function PersonalidadeScreen({ onEscolher }) {
  const [selecionada, setSelecionada] = useState(null);

  return (
    <View style={styles.container}>
      <View style={styles.conteudo}>
        <Text style={styles.titulo}>Que jeito você prefere?</Text>
        <Text style={styles.subtitulo}>Você pode mudar isso depois, se quiser.</Text>

        <View style={{ marginTop: 28 }}>
          {OPCOES.map((op) => {
            const ativa = selecionada === op.chave;
            return (
              <TouchableOpacity
                key={op.chave}
                style={[styles.cartao, ativa && styles.cartaoAtivo]}
                activeOpacity={0.8}
                onPress={() => setSelecionada(op.chave)}
              >
                <View style={[styles.iconeBox, ativa && styles.iconeBoxAtivo]}>
                  <FontAwesome name={op.icone} size={18} color={ativa ? '#0B2545' : '#FFFFFF'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartaoTitulo}>{op.titulo}</Text>
                  <Text style={styles.cartaoDescricao}>{op.descricao}</Text>
                  <Text style={styles.cartaoExemplo}>{op.exemplo}</Text>
                </View>
                {ativa && <FontAwesome name="check-circle" size={20} color="#FFFFFF" />}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.botao, !selecionada && styles.botaoDesativado]}
          activeOpacity={0.8}
          onPress={() => selecionada && onEscolher(selecionada)}
          disabled={!selecionada}
        >
          <Text style={styles.botaoTexto}>Continuar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B2545' },
  conteudo: { flex: 1, justifyContent: 'center', paddingHorizontal: 26 },
  titulo: {
    color: '#F5F1E8',
    fontSize: 24,
    fontFamily: 'Fraunces_700Bold',
    marginBottom: 6,
  },
  subtitulo: { color: '#9AA3B8', fontSize: 13.5 },
  cartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.3,
    borderColor: '#2A4048',
    backgroundColor: '#0D5AA8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cartaoAtivo: { borderColor: '#FFFFFF' },
  iconeBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#0B2545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeBoxAtivo: { backgroundColor: '#FFFFFF' },
  cartaoTitulo: { color: '#F5F1E8', fontSize: 15.5, fontWeight: '700', marginBottom: 2 },
  cartaoDescricao: { color: '#9AA3B8', fontSize: 12.5, marginBottom: 4 },
  cartaoExemplo: { color: '#FFFFFF', fontSize: 11.5, fontStyle: 'italic' },
  botao: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  botaoDesativado: { opacity: 0.4 },
  botaoTexto: { color: '#0B2545', fontSize: 15, fontWeight: '700' },
});
