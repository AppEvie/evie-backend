import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  Platform,
  Image,
  StatusBar,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Animated,
  Dimensions,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { falar } from '../lib/voz';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { interpretarComando, interpretarDocumento, gerarFala, buscarLugaresProximos, gerarPost, interpretarCurriculo, sintetizarDocumento, acordarServidor } from '../lib/api';
import * as Clipboard from 'expo-clipboard';
import { useShareIntentContext } from 'expo-share-intent';
import * as FileSystem from 'expo-file-system/legacy';
import { buscarLocalizacaoAtual, buscarCidadePorCoordenadas } from '../lib/localizacao';
import { buscarClima, resumoClima } from '../lib/clima';
import { buscarContatosPorNome } from '../lib/contatos';
import {
  agendarNotificacoesDiarias,
  agendarNotificacaoLembrete,
  cancelarNotificacaoLembrete,
  parseHorarioFalado,
} from '../lib/notificacoes';
import * as Notifications from 'expo-notifications';
import { abrirAgendaNativa, abrirWhatsapp, abrirComposerEmail, abrirCaixaDeEntradaEmail, abrirDiscador, abrirRotaNoMaps } from '../lib/quickActions';
import {
  criarEventoNaAgenda,
  pedirPermissaoAgenda,
  buscarProximosEventos,
  cancelarEventoPorTitulo,
  cancelarEventoPorId,
  normalizar,
} from '../lib/calendar';
import { abrirRascunhoEmail } from '../lib/email';
import { chavePeriodoAtual, buscarUltimaSaudacao, salvarUltimaSaudacao } from '../lib/armazenamento';
import { listarDocumentos, salvarDocumento, removerDocumento, salvarImagemPermanente, vincularDocumentoAoEvento } from '../lib/documentos';
import { salvarImagemSomaPermanente, salvarSoma, listarSomas, removerSoma, atualizarSoma, listarNomesDePastaUsados } from '../lib/somas';
import { salvarImagemSintesePermanente, salvarSintese, listarSinteses, removerSintese } from '../lib/sinteses';
import { salvarPost, listarPosts, removerPost } from '../lib/posts';
import { carregarEntradas, salvarEntradas } from '../lib/entradas';
import { buscarPerfilProfissional, salvarPerfilProfissional, removerPerfilProfissional } from '../lib/curriculo';

const LOGO_EVIE = require('../assets/evie-icon.png');

const NOME_ASSISTENTE = 'Evie';
// SafeAreaView do React Native só funciona de verdade no iOS — no Android
// ele não empurra o conteúdo pra cima da barra de navegação do sistema,
// então adicionamos essa margem extra manualmente.
const MARGEM_INFERIOR_SEGURA = Platform.OS === 'android' ? 64 : 24;
const ALTURA_TELA = Dimensions.get('window').height;

// ---- Paleta "executiva": navy profundo, papel neutro e latão — em vez
// da estética mais informal de caderno de anotações. ----
const COR = {
  papel: '#E4E4E1',
  cartao: '#FFFFFF',
  tinta: '#191919',
  tintaSuave: '#666666',
  linha: '#E0E0E0',
  navy: '#0B2545',
  navySuave: '#E8F1FB',
  dourado: '#0B2545',
  douradoSuave: '#E8F1FB',
  salvia: '#057642',
  salviaSuave: '#E1F2EA',
  ferrugem: '#B24020',
  ferrugemSuave: '#FBE7E5',
};
// Alias mantido por compatibilidade com o restante do código.
COR.ameixa = COR.navy;
COR.ameixaSuave = COR.navySuave;

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Pequeno ajuste de tom nas falas que acontecem só no app (sem passar
// pelo backend) — a mesma ideia do prompt do Gemini, só que aplicada
// localmente. Retorna um trecho extra pra encerrar a frase, ou vazio.
// "09:00" lido em voz alta soa tipo "zero, nove, zero, zero" — em vez
// disso, transforma num jeito que qualquer voz (sistema ou IA) lê como
// horário de verdade: "9 horas da manhã", "2 e 30 da tarde", etc.
function horaFalada(data) {
  const h24 = data.getHours();
  const min = data.getMinutes();
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const periodo = h24 < 12 ? 'da manhã' : h24 < 18 ? 'da tarde' : 'da noite';
  if (min === 0) return `${h12} horas ${periodo}`;
  if (min === 30) return `${h12} e meia ${periodo}`;
  return `${h12} e ${min} ${periodo}`;
}

// Frases que o app fala sozinho (sem passar pelo Gemini) — cada uma varia
// de verdade conforme a personalidade escolhida, não é só um sufixo colado.
const FRASES = {
  lembreteOk: {
    sofisticada: 'Registrei o seu lembrete com atenção.',
    pratica: 'Lembrete salvo.',
    divertida: 'Boa, já guardei isso aqui pra você!',
  },
  pronto: {
    sofisticada: 'Perfeito, já está resolvido.',
    pratica: 'Feito.',
    divertida: 'Show, tá tudo pronto!',
  },
  erroPermissaoAgenda: {
    sofisticada: 'Vou precisar que você libere o acesso à sua agenda, por gentileza.',
    pratica: 'Sem permissão pra agenda. Libera aí.',
    divertida: 'Opa, preciso que você me dê acesso à agenda primeiro!',
  },
  erroAgendarCompromisso: {
    sofisticada: 'Infelizmente esse compromisso não pôde ser registrado.',
    pratica: 'Não deu. Tenta de novo.',
    divertida: 'Eita, travou aqui! Manda de novo?',
  },
  naoAchouCancelar: {
    sofisticada: 'Não localizei nenhum item correspondente a esse nome.',
    pratica: 'Não achei nada com esse nome.',
    divertida: 'Hmm, não achei nada parecido. Tenta descrever diferente?',
  },
  semCompromissosHoje: {
    sofisticada: 'Sua agenda está inteiramente livre hoje.',
    pratica: 'Nada marcado hoje.',
    divertida: 'Dia livre hoje, sortudo(a)!',
  },
};

function frasePersonalizada(chave, personalidade) {
  const opcoes = FRASES[chave];
  if (!opcoes) return '';
  return opcoes[personalidade] || opcoes.pratica;
}

// Pede pra IA gerar a fala na hora (nunca repete igual) — se der qualquer
// problema (sem internet, servidor fora), usa a frase fixa como reserva,
// pra Evie nunca ficar muda.
async function falarGerado(situacao, personalidade, textoFallback) {
  // Prioriza velocidade: fala direto o texto de reserva, que já varia
  // por personalidade e já inclui os dados reais (hora, nome, etc) —
  // sem gastar uma segunda chamada de IA só pra reformular a frase.
  falar(textoFallback);
}

// Escreve uma distância em km por extenso, pra voz nunca precisar
// "decidir" sozinha como ler os dígitos (isso já causou palavras
// cortadas/mal pronunciadas, tipo "três" virando "tre").
const NUMEROS_POR_EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
function distanciaPorExtenso(km) {
  if (km == null) return '';
  const inteiro = Math.floor(km);
  const decimalUmaCasa = Math.round((km - inteiro) * 10);
  const parteInteira = inteiro <= 10 ? NUMEROS_POR_EXTENSO[inteiro] : String(inteiro);
  if (decimalUmaCasa === 0) return `${parteInteira} quilômetros`;
  const parteDecimal = decimalUmaCasa <= 10 ? NUMEROS_POR_EXTENSO[decimalUmaCasa] : String(decimalUmaCasa);
  return `${parteInteira} vírgula ${parteDecimal} quilômetros`;
}

function ehHoje(data) {
  const agora = new Date();
  return (
    data.getFullYear() === agora.getFullYear() &&
    data.getMonth() === agora.getMonth() &&
    data.getDate() === agora.getDate()
  );
}

function ehAmanha(data) {
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  return (
    data.getFullYear() === amanha.getFullYear() &&
    data.getMonth() === amanha.getMonth() &&
    data.getDate() === amanha.getDate()
  );
}

function formatarDiaHora(data) {
  const hoje = ehHoje(data);
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (hoje) return `Hoje · ${hora}`;
  const dataCurta = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dataCurta} · ${hora}`;
}

// "17 de Agosto" — só o mês com inicial maiúscula, "de" continua minúsculo.
function formatarDataBriefing(data) {
  const dia = data.getDate();
  const mes = data.toLocaleDateString('pt-BR', { month: 'long' });
  const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${dia} de ${mesCapitalizado}`;
}

// Cabeçalho de cada "mesa" (cartão de seção), com ícone dentro de um
// selo colorido — é o elemento que dá identidade visual às seções.
function MesaHeader({ icone, cor, corFundo, titulo, acao, aberto, onToggle }) {
  const conteudo = (
    <>
      <View style={[styles.selo, { backgroundColor: corFundo }]}>
        <FontAwesome name={icone} size={13} color={cor} />
      </View>
      <Text style={styles.mesaTitulo} numberOfLines={1}>
        {titulo}
      </Text>
      {acao}
      {onToggle && (
        <FontAwesome
          name={aberto ? 'chevron-up' : 'chevron-down'}
          size={13}
          color={COR.tintaSuave}
          style={{ marginLeft: 10 }}
        />
      )}
    </>
  );

  if (!onToggle) {
    return <View style={styles.mesaHeader}>{conteudo}</View>;
  }

  return (
    <TouchableOpacity style={styles.mesaHeader} activeOpacity={0.7} onPress={onToggle}>
      {conteudo}
    </TouchableOpacity>
  );
}

export default function HomeScreen({ nomeUsuario, personalidade, onAtualizarNome, onAtualizarPersonalidade }) {
  // ---- Arquivo recebido por compartilhamento (ex: do WhatsApp) ----
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [arquivoCompartilhado, setArquivoCompartilhado] = useState(null);
  const [processandoCompartilhado, setProcessandoCompartilhado] = useState(false);

  useEffect(() => {
    if (hasShareIntent && shareIntent?.files?.length > 0) {
      const arquivo = shareIntent.files[0];
      if (arquivo.mimeType?.startsWith('image/')) {
        setArquivoCompartilhado({ uri: arquivo.path });
      }
    }
  }, [hasShareIntent, shareIntent]);

  // ---- Configurações (mudar nome / personalidade) ----
  // Referência da rolagem principal, pra os ícones do menu de baixo
  // poderem levar até a seção certa da tela.
  const scrollRef = useRef(null);
  const documentosYRef = useRef(0);

  const [modalDocumentosAberto, setModalDocumentosAberto] = useState(false);
  const [modalLembretesAberto, setModalLembretesAberto] = useState(false);
  const [modalRascunhosAberto, setModalRascunhosAberto] = useState(false);
  // Guarda um compromisso "pendente" enquanto esperamos a pessoa dizer se
  // é pessoal ou profissional, antes de criar de verdade na agenda.
  const [perguntaCategoria, setPerguntaCategoria] = useState(null);
  // Lembrete esperando a pessoa dizer/digitar a que horas avisar
  const [perguntaHorarioLembrete, setPerguntaHorarioLembrete] = useState(null);
  const [horarioDigitado, setHorarioDigitado] = useState('');
  // Resultados da última busca por lugares próximos (null = modal fechado)
  const [lugaresEncontrados, setLugaresEncontrados] = useState(null);
  // Contatos encontrados numa busca por "ligar pro Fulano" (null = fechado)
  const [contatosEncontrados, setContatosEncontrados] = useState(null);
  // Opções de post geradas (null = modal fechado)
  const [postsGerados, setPostsGerados] = useState(null);
  // Histórico permanente de posts já gerados antes
  const [historicoPosts, setHistoricoPosts] = useState([]);
  // Perfil profissional extraído do currículo (null = ainda não subiu nenhum)
  const [perfilProfissional, setPerfilProfissional] = useState(null);
  const [clima, setClima] = useState(null);

  // Sintetizar documento (contrato, relatório, artigo)
  const [historicoSinteses, setHistoricoSinteses] = useState([]);
  const [modalSinteseAberto, setModalSinteseAberto] = useState(false);
  const [paginasSintese, setPaginasSintese] = useState([]); // [{chave, uri, base64}]
  const [processandoSintese, setProcessandoSintese] = useState(false);
  const [sinteseResultado, setSinteseResultado] = useState(null);
  const [sinteseAbertaDetalhe, setSinteseAbertaDetalhe] = useState(null);
  const [processandoCurriculo, setProcessandoCurriculo] = useState(false);
  const [modalConfigAberto, setModalConfigAberto] = useState(false);
  const [nomeEditando, setNomeEditando] = useState('');
  const [personalidadeEditando, setPersonalidadeEditando] = useState('');

  const abrirConfiguracoes = useCallback(() => {
    setNomeEditando(nomeUsuario || '');
    setPersonalidadeEditando(personalidade || '');
    setModalConfigAberto(true);
  }, [nomeUsuario, personalidade]);

  // Primeira vez usando o app (sem nome salvo ainda) — abre Configurações
  // sozinha, pra pessoa já personalizar de cara, sem precisar de telas
  // separadas de onboarding.
  useEffect(() => {
    if (!nomeUsuario) {
      abrirConfiguracoes();
    }
  }, []);

  const salvarConfiguracoes = useCallback(async () => {
    const nomeLimpo = nomeEditando.trim();
    if (nomeLimpo && onAtualizarNome) await onAtualizarNome(nomeLimpo);
    if (personalidadeEditando && onAtualizarPersonalidade) await onAtualizarPersonalidade(personalidadeEditando);
    setModalConfigAberto(false);
  }, [nomeEditando, personalidadeEditando, onAtualizarNome, onAtualizarPersonalidade]);

  const OPCOES_PERSONALIDADE = [
    { chave: 'sofisticada', icone: 'diamond', titulo: 'Sofisticada' },
    { chave: 'pratica', icone: 'briefcase', titulo: 'Prática' },
    { chave: 'divertida', icone: 'smile-o', titulo: 'Divertida' },
  ];

  const [ouvindo, setOuvindo] = useState(false);

  // Barrinhas da "forma de onda" decorativa — cada uma pula em looping,
  // com um tempo levemente diferente da vizinha, pra parecer áudio de
  // verdade em vez de um movimento sincronizado e robótico.
  const alturasOnda = useRef([
    6, 10, 7, 14, 9, 16, 8, 12, 6, 15, 9, 18, 7, 13, 10, 16, 8, 11, 6, 14, 9, 17, 7, 10,
  ]).current;
  const ondaAnimada = useRef(alturasOnda.map(() => new Animated.Value(0))).current;
  // Cores que se repetem em ciclo pelas barrinhas, criando o efeito de
  // equalizador colorido em vez de um branco só sólido.
  const opacidadesOnda = useRef([1, 0.6, 0.85, 0.5, 1, 0.7, 0.9, 0.55, 1, 0.65, 0.8, 0.5]).current;

  // Entrada suave da tela inteira (fade + um leve deslize de baixo pra
  // cima), só na primeira vez que o app abre — dá uma sensação de
  // "chegada" mais elegante em vez de tudo aparecer de repente.
  const entradaOpacidade = useRef(new Animated.Value(0)).current;
  const entradaDeslize = useRef(new Animated.Value(40)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(entradaOpacidade, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(entradaDeslize, { toValue: 0, duration: 750, useNativeDriver: true }),
    ]).start();
  }, []);

  // Brilho pulsante bem sutil ao redor do cartão da Evie, dando uma
  // sensação de "presença viva" mesmo quando ela não está ouvindo.
  const brilhoPulso = useRef(new Animated.Value(0.15)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(brilhoPulso, { toValue: 0.35, duration: 2200, useNativeDriver: true }),
        Animated.timing(brilhoPulso, { toValue: 0.15, duration: 2200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    const animacoes = ondaAnimada.map((valor, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(valor, {
            toValue: 1,
            duration: 380 + i * 45,
            useNativeDriver: true,
          }),
          Animated.timing(valor, {
            toValue: 0,
            duration: 380 + i * 45,
            useNativeDriver: true,
          }),
        ])
      )
    );
    animacoes.forEach((a) => a.start());
    return () => animacoes.forEach((a) => a.stop());
  }, []);
  const [pensando, setPensando] = useState(false);
  const [status, setStatus] = useState('');
  const [mostrarStatus, setMostrarStatus] = useState(false);
  const [entradas, setEntradas] = useState([]);
  const entradasJaCarregadas = useRef(false);
  // Cada cartão (compromissos, lembretes, emails, cálculos) começa fechado,
  // mostrando só uma prévia — toca no cabeçalho pra ver a lista inteira.
  const [abasAbertas, setAbasAbertas] = useState({});
  const alternarAba = useCallback((chave) => {
    setAbasAbertas((prev) => ({ ...prev, [chave]: !prev[chave] }));
  }, []);
  const LIMITE_PREVIA = 3;
  const [proximosEventos, setProximosEventos] = useState([]);
  const [agendaCarregada, setAgendaCarregada] = useState(false);
  const timerEsconderStatus = useRef(null);

  const mostrar = useCallback((texto, duracaoMs = 4500) => {
    if (timerEsconderStatus.current) clearTimeout(timerEsconderStatus.current);
    setStatus(texto);
    setMostrarStatus(true);
    timerEsconderStatus.current = setTimeout(() => setMostrarStatus(false), duracaoMs);
  }, []);
  const processando = useRef(false);
  const recebeuResultado = useRef(false);
  const timerSegurancaMic = useRef(null);

  const recarregarAgenda = useCallback(async () => {
    try {
      const permitido = await pedirPermissaoAgenda();
      if (!permitido) return;
      const eventos = await buscarProximosEventos(14);
      setProximosEventos(eventos);
    } catch (e) {
      console.error('Erro ao carregar agenda:', e);
    } finally {
      setAgendaCarregada(true);
    }
  }, []);

  useEffect(() => {
    recarregarAgenda();
  }, [recarregarAgenda]);

  // ---- Documentos (faturas, boletos, notas) ----
  const [documentos, setDocumentos] = useState([]);
  const [processandoDocumento, setProcessandoDocumento] = useState(false);
  const [confirmacaoDocumento, setConfirmacaoDocumento] = useState(null);
  const [documentoAberto, setDocumentoAberto] = useState(null);

  // Somas de notas/faturas em lote
  const [somasGuardadas, setSomasGuardadas] = useState([]);
  const [modalSomaAberto, setModalSomaAberto] = useState(false);
  const [arquivosSoma, setArquivosSoma] = useState([]); // [{uri, valor, tipoDocumento, processando}]
  const [nomePastaSoma, setNomePastaSoma] = useState('');
  const [nomesPastaSugeridos, setNomesPastaSugeridos] = useState([]);
  const [somaAbertaDetalhe, setSomaAbertaDetalhe] = useState(null);
  const [processandoAdicaoNaSoma, setProcessandoAdicaoNaSoma] = useState(false);

  useEffect(() => {
    acordarServidor();
    listarDocumentos().then(setDocumentos);
    listarSomas().then(setSomasGuardadas);
    listarPosts().then(setHistoricoPosts);
    buscarPerfilProfissional().then(setPerfilProfissional);
    listarSinteses().then(setHistoricoSinteses);
    carregarEntradas().then((lista) => {
      setEntradas(lista);
      entradasJaCarregadas.current = true;
    });

    // Clima é só um "extra" — se der qualquer problema (sem permissão,
    // sem internet), some silenciosamente, sem incomodar com alerta.
    (async () => {
      try {
        const posicao = await buscarLocalizacaoAtual();
        if (!posicao) return;
        const dadosClima = await buscarClima(posicao.lat, posicao.lng);
        const resumo = resumoClima(dadosClima);
        const cidade = await buscarCidadePorCoordenadas(posicao.lat, posicao.lng);
        setClima(resumo ? { ...resumo, cidade } : null);
      } catch (e) {
        console.log('[clima] não consegui buscar:', e?.message || e);
      }
    })();
  }, []);

  // Salva as entradas (lembretes, rascunhos de email, cálculos) toda vez
  // que a lista mudar — mas só depois que o carregamento inicial já
  // terminou, senão sobrescreveríamos o que já estava salvo com uma
  // lista vazia por uma fração de segundo.
  useEffect(() => {
    if (!entradasJaCarregadas.current) return;
    salvarEntradas(entradas);
  }, [entradas]);

  // Documentos ordenados pelo vencimento (quem vence primeiro aparece
  // primeiro) — os sem data de vencimento ficam por último, ordenados pela
  // data em que foram adicionados.
  // Mapa rápido: id do compromisso na agenda -> documento vinculado a ele
  // (se algum foi vinculado quando o lembrete foi criado a partir dele).
  const documentoPorEvento = useMemo(() => {
    const mapa = {};
    documentos.forEach((d) => {
      if (d.eventoVinculado) mapa[d.eventoVinculado] = d;
    });
    return mapa;
  }, [documentos]);

  const documentosOrdenados = useMemo(() => {
    return [...documentos].sort((a, b) => {
      if (a.vencimento && b.vencimento) return a.vencimento.localeCompare(b.vencimento);
      if (a.vencimento) return -1;
      if (b.vencimento) return 1;
      return (b.criadoEm || '').localeCompare(a.criadoEm || '');
    });
  }, [documentos]);

  // Texto do banner "Não esquece" — pega o documento com vencimento mais
  // próximo (se for nos próximos 7 dias), senão null (banner some).
  const itemUrgente = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const emSeteDias = new Date(hoje);
    emSeteDias.setDate(emSeteDias.getDate() + 7);

    const proximo = documentosOrdenados.find((d) => {
      if (!d.vencimento) return false;
      const [ano, mes, dia] = d.vencimento.split('-').map(Number);
      const dataVencimento = new Date(ano, mes - 1, dia);
      return dataVencimento >= hoje && dataVencimento <= emSeteDias;
    });
    if (!proximo) return null;

    const [ano, mes, dia] = proximo.vencimento.split('-').map(Number);
    const dataVencimento = new Date(ano, mes - 1, dia);
    const ehHojeVenc = dataVencimento.getTime() === hoje.getTime();
    const dataTexto = ehHojeVenc ? 'hoje' : `dia ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
    const valorTexto = proximo.valor ? ` — R$ ${proximo.valor}` : '';
    return `${proximo.tipoDocumento} vence ${dataTexto}${valorTexto}.`;
  }, [documentosOrdenados]);

  // Busca por nome (ou parte do nome) do documento — compara o tipo e o
  // remetente, ignorando maiúsculas/minúsculas e acentos.
  const [buscaDocumentoAberta, setBuscaDocumentoAberta] = useState(false);
  const [buscaDocumento, setBuscaDocumento] = useState('');

  const documentosFiltrados = useMemo(() => {
    const termo = normalizar(buscaDocumento.trim());
    if (!termo) return documentosOrdenados;
    return documentosOrdenados.filter((d) => {
      const alvo = normalizar(`${d.tipoDocumento || ''} ${d.remetente || ''}`);
      return alvo.includes(termo);
    });
  }, [documentosOrdenados, buscaDocumento]);

  // Agrupa por mês (usando o vencimento quando existe, senão a data em que
  // foi guardado) — cada "pasta" é um mês, com os documentos já ordenados
  // por vencimento dentro dele. Meses mais próximos aparecem primeiro.
  const documentosPorMes = useMemo(() => {
    const grupos = {};
    documentosOrdenados.forEach((d) => {
      const base = d.vencimento || d.criadoEm;
      const data = new Date(base);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      if (!grupos[chave]) grupos[chave] = [];
      grupos[chave].push(d);
    });
    return Object.keys(grupos)
      .sort()
      .map((chave) => {
        const [ano, mes] = chave.split('-').map(Number);
        const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return {
          chave,
          titulo: nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1),
          documentos: grupos[chave],
        };
      });
  }, [documentosOrdenados]);

  const [mesesAbertos, setMesesAbertos] = useState({});
  const alternarMes = useCallback((chave) => {
    setMesesAbertos((prev) => ({ ...prev, [chave]: !prev[chave] }));
  }, []);

  const processarFotoDocumento = useCallback(async (uriTemporaria, base64) => {
    setProcessandoDocumento(true);
    try {
      // Copia a foto pra um lugar permanente ANTES de mandar pra IA —
      // o arquivo temporário da câmera/galeria pode sumir enquanto
      // esperamos a resposta do Gemini (que demora alguns segundos).
      const imagemUri = await salvarImagemPermanente(uriTemporaria);
      const extraido = await interpretarDocumento(base64, 'image/jpeg', personalidade);
      setConfirmacaoDocumento({
        imagemUri,
        tipoDocumento: extraido.tipoDocumento || 'Documento',
        remetente: extraido.remetente || '',
        valor: extraido.valor || '',
        vencimento: extraido.vencimento || '',
        resumo: extraido.resumo || 'Não consegui identificar os detalhes — confira a imagem.',
      });
    } catch (e) {
      console.error('[documentos] erro ao interpretar:', e);
      Alert.alert('Não consegui ler o documento', `Motivo técnico: ${e?.message || String(e)}`);
    } finally {
      setProcessandoDocumento(false);
    }
  }, []);

  // Quando um arquivo chega por compartilhamento (ex: do WhatsApp), lê ele
  // como base64 e reaproveita o MESMO fluxo de "ler documento" de sempre —
  // o modal de confirmação que já existe já serve como a pergunta
  // "quer guardar isso nos documentos?".
  const processarArquivoCompartilhado = useCallback(async (uri) => {
    setProcessandoCompartilhado(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      await processarFotoDocumento(uri, base64);
    } catch (e) {
      console.error('[compartilhado] erro ao processar:', e);
      Alert.alert('Não consegui ler o arquivo', `Motivo técnico: ${e?.message || String(e)}`);
    } finally {
      setProcessandoCompartilhado(false);
      setArquivoCompartilhado(null);
      resetShareIntent();
    }
  }, [processarFotoDocumento, resetShareIntent]);


  const tirarFotoDocumento = useCallback(async () => {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Preciso da câmera pra fotografar o documento.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      base64: true,
      exif: false,
    });
    if (!resultado.canceled && resultado.assets?.[0]) {
      const foto = resultado.assets[0];
      processarFotoDocumento(foto.uri, foto.base64);
    }
  }, [processarFotoDocumento]);

  const escolherFotoDocumento = useCallback(async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Preciso acessar suas fotos pra escolher o documento.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!resultado.canceled && resultado.assets?.[0]) {
      const foto = resultado.assets[0];
      processarFotoDocumento(foto.uri, foto.base64);
    }
  }, [processarFotoDocumento]);

  const abrirEscolhaDeFoto = useCallback(() => {
    Alert.alert('Guardar documento', 'Como você quer adicionar o documento?', [
      { text: 'Tirar foto', onPress: tirarFotoDocumento },
      { text: 'Escolher da galeria', onPress: escolherFotoDocumento },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [tirarFotoDocumento, escolherFotoDocumento]);

  // ---- Somar notas/faturas em lote ----

  // Converte "1.234,56" ou "230,00" (formato brasileiro) num número de
  // verdade, pra dar pra somar. Se não conseguir entender, devolve 0.
  function parseValorBR(texto) {
    if (!texto) return 0;
    const limpo = String(texto)
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3},)/g, '') // remove ponto de milhar antes da vírgula decimal
      .replace(',', '.');
    const numero = parseFloat(limpo);
    return isNaN(numero) ? 0 : numero;
  }

  const processarFotoSoma = useCallback(async (uriTemporaria, base64, mimeType = 'image/jpeg', ehPdf = false) => {
    const indiceProvisorio = Date.now() + Math.random();
    setArquivosSoma((prev) => [
      ...prev,
      { chave: indiceProvisorio, uri: uriTemporaria, valor: '', tipoDocumento: '', processando: true, ehPdf },
    ]);
    try {
      const extraido = await interpretarDocumento(base64, mimeType, personalidade);
      setArquivosSoma((prev) =>
        prev.map((a) =>
          a.chave === indiceProvisorio
            ? { ...a, valor: extraido.valor || '0', tipoDocumento: extraido.tipoDocumento || 'Documento', processando: false }
            : a
        )
      );
    } catch (e) {
      console.error('[soma] erro ao ler arquivo:', e);
      setArquivosSoma((prev) =>
        prev.map((a) => (a.chave === indiceProvisorio ? { ...a, valor: '0', tipoDocumento: 'Erro ao ler', processando: false } : a))
      );
    }
  }, [personalidade]);

  const escolherPdfSoma = useCallback(async () => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (resultado.canceled || !resultado.assets?.[0]) return;
      const arquivo = resultado.assets[0];
      const base64 = await FileSystem.readAsStringAsync(arquivo.uri, { encoding: FileSystem.EncodingType.Base64 });
      // Copia pra pasta permanente JÁ na hora de escolher — o arquivo
      // temporário do seletor de documentos pode ser apagado pelo
      // sistema antes da hora de salvar de verdade (que só acontece
      // depois de digitar o nome da pasta).
      const uriPermanente = await salvarImagemSomaPermanente(arquivo.uri);
      processarFotoSoma(uriPermanente, base64, 'application/pdf', true);
    } catch (e) {
      console.error('[soma] erro ao escolher PDF:', e);
      Alert.alert('Não consegui abrir o PDF', `Motivo técnico: ${e?.message || String(e)}`);
    }
  }, [processarFotoSoma]);

  const tirarFotoSoma = useCallback(async () => {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Preciso da câmera pra fotografar o documento.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, exif: false });
    if (!resultado.canceled && resultado.assets?.[0]) {
      const foto = resultado.assets[0];
      processarFotoSoma(foto.uri, foto.base64);
    }
  }, [processarFotoSoma]);

  const escolherFotosSoma = useCallback(async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Preciso acessar suas fotos pra escolher os documentos.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
    });
    if (!resultado.canceled && resultado.assets?.length > 0) {
      resultado.assets.forEach((foto) => processarFotoSoma(foto.uri, foto.base64));
    }
  }, [processarFotoSoma]);

  const abrirEscolhaFotoSoma = useCallback(() => {
    Alert.alert('Adicionar notas/faturas', 'Como você quer adicionar?', [
      { text: 'Tirar foto', onPress: tirarFotoSoma },
      { text: 'Escolher da galeria (várias)', onPress: escolherFotosSoma },
      { text: 'Escolher arquivo PDF', onPress: escolherPdfSoma },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [tirarFotoSoma, escolherFotosSoma, escolherPdfSoma]);

  // ---- Currículo profissional (usado pra dar "a pegada" certa nos posts) ----
  const processarFotoCurriculo = useCallback(async (base64, mimeType = 'image/jpeg') => {
    setProcessandoCurriculo(true);
    try {
      const extraido = await interpretarCurriculo(base64, mimeType);
      const perfil = {
        area: extraido.area || '',
        cargoAtual: extraido.cargoAtual || '',
        habilidadesChave: extraido.habilidadesChave || '',
        tomSugerido: extraido.tomSugerido || '',
        dataUpload: new Date().toISOString(),
      };
      await salvarPerfilProfissional(perfil);
      setPerfilProfissional(perfil);
      mostrar(`Currículo lido! Área: ${perfil.area}.`);
    } catch (e) {
      console.error('[curriculo] erro ao interpretar:', e);
      Alert.alert('Não consegui ler o currículo', `Motivo técnico: ${e?.message || String(e)}`);
    } finally {
      setProcessandoCurriculo(false);
    }
  }, []);

  const tirarFotoCurriculo = useCallback(async () => {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Preciso da câmera pra fotografar o currículo.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, exif: false });
    if (!resultado.canceled && resultado.assets?.[0]) {
      processarFotoCurriculo(resultado.assets[0].base64);
    }
  }, [processarFotoCurriculo]);

  const escolherFotoCurriculo = useCallback(async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Preciso acessar suas fotos pra escolher o currículo.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!resultado.canceled && resultado.assets?.[0]) {
      processarFotoCurriculo(resultado.assets[0].base64);
    }
  }, [processarFotoCurriculo]);

  const escolherPdfCurriculo = useCallback(async () => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (resultado.canceled || !resultado.assets?.[0]) return;
      const arquivo = resultado.assets[0];
      const base64 = await FileSystem.readAsStringAsync(arquivo.uri, { encoding: FileSystem.EncodingType.Base64 });
      processarFotoCurriculo(base64, 'application/pdf');
    } catch (e) {
      console.error('[curriculo] erro ao escolher PDF:', e);
      Alert.alert('Não consegui abrir o PDF', `Motivo técnico: ${e?.message || String(e)}`);
    }
  }, [processarFotoCurriculo]);

  const abrirEscolhaFotoCurriculo = useCallback(() => {
    Alert.alert('Currículo profissional', 'Como você quer adicionar?', [
      { text: 'Tirar foto', onPress: tirarFotoCurriculo },
      { text: 'Escolher da galeria', onPress: escolherFotoCurriculo },
      { text: 'Escolher arquivo PDF', onPress: escolherPdfCurriculo },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [tirarFotoCurriculo, escolherFotoCurriculo, escolherPdfCurriculo]);

  const removerCurriculoSalvo = useCallback(async () => {
    await removerPerfilProfissional();
    setPerfilProfissional(null);
  }, []);

  // ---- Sintetizar documento (contrato, relatório, artigo) ----
  const adicionarPaginaSintese = useCallback((uri, base64, mimeType = 'image/jpeg', ehPdf = false) => {
    setPaginasSintese((prev) => [...prev, { chave: Date.now() + Math.random(), uri, base64, mimeType, ehPdf }]);
  }, []);

  const escolherPdfSintese = useCallback(async () => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (resultado.canceled || !resultado.assets?.[0]) return;
      const arquivo = resultado.assets[0];
      const base64 = await FileSystem.readAsStringAsync(arquivo.uri, { encoding: FileSystem.EncodingType.Base64 });
      const uriPermanente = await salvarImagemSintesePermanente(arquivo.uri);
      adicionarPaginaSintese(uriPermanente, base64, 'application/pdf', true);
    } catch (e) {
      console.error('[sintese] erro ao escolher PDF:', e);
      Alert.alert('Não consegui abrir o PDF', `Motivo técnico: ${e?.message || String(e)}`);
    }
  }, [adicionarPaginaSintese]);

  const tirarFotoSintese = useCallback(async () => {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Preciso da câmera pra fotografar o documento.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, exif: false });
    if (!resultado.canceled && resultado.assets?.[0]) {
      adicionarPaginaSintese(resultado.assets[0].uri, resultado.assets[0].base64);
    }
  }, [adicionarPaginaSintese]);

  const escolherFotosSintese = useCallback(async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Preciso acessar suas fotos pra escolher o documento.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
    });
    if (!resultado.canceled && resultado.assets?.length > 0) {
      resultado.assets.forEach((foto) => adicionarPaginaSintese(foto.uri, foto.base64));
    }
  }, [adicionarPaginaSintese]);

  const abrirEscolhaFotoSintese = useCallback(() => {
    Alert.alert('Adicionar páginas', 'Como você quer adicionar?', [
      { text: 'Tirar foto', onPress: tirarFotoSintese },
      { text: 'Escolher da galeria (várias)', onPress: escolherFotosSintese },
      { text: 'Escolher arquivo PDF', onPress: escolherPdfSintese },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [tirarFotoSintese, escolherFotosSintese, escolherPdfSintese]);

  const removerPaginaSintese = useCallback((chave) => {
    setPaginasSintese((prev) => prev.filter((p) => p.chave !== chave));
  }, []);

  const abrirModalSintese = useCallback(() => {
    setPaginasSintese([]);
    setSinteseResultado(null);
    setModalSinteseAberto(true);
  }, []);

  const gerarSintese = useCallback(async () => {
    if (paginasSintese.length === 0) {
      Alert.alert('Nenhuma página', 'Adicione pelo menos uma foto do documento antes de sintetizar.');
      return;
    }
    setProcessandoSintese(true);
    try {
      const imagens = paginasSintese.map((p) => ({ base64: p.base64, mimeType: p.mimeType || 'image/jpeg' }));
      const resultado = await sintetizarDocumento(imagens);
      setSinteseResultado(resultado);
    } catch (e) {
      console.error('[sintese] erro ao gerar:', e);
      Alert.alert('Não consegui sintetizar', `Motivo técnico: ${e?.message || String(e)}`);
    } finally {
      setProcessandoSintese(false);
    }
  }, [paginasSintese]);

  const descartarSintese = useCallback(() => {
    setModalSinteseAberto(false);
    setPaginasSintese([]);
    setSinteseResultado(null);
  }, []);

  const salvarSinteseAtual = useCallback(async () => {
    if (!sinteseResultado) return;
    try {
      const paginasPermanentes = await Promise.all(
        paginasSintese.map(async (p) => ({
          uri: await salvarImagemSintesePermanente(p.uri),
          ehPdf: !!p.ehPdf,
        }))
      );
      const novaSintese = {
        id: String(Date.now()),
        ...sinteseResultado,
        paginas: paginasPermanentes,
        data: new Date().toISOString(),
      };
      const listaAtualizada = await salvarSintese(novaSintese);
      setHistoricoSinteses(listaAtualizada);
      setModalSinteseAberto(false);
      setPaginasSintese([]);
      setSinteseResultado(null);
      mostrar(`Síntese salva: "${novaSintese.titulo}".`);
    } catch (e) {
      console.error('[sintese] erro ao salvar:', e);
      Alert.alert('Não consegui salvar', `Motivo técnico: ${e?.message || String(e)}`);
    }
  }, [sinteseResultado, paginasSintese]);

  const excluirSinteseGuardada = useCallback(async (id) => {
    const listaAtualizada = await removerSintese(id);
    setHistoricoSinteses(listaAtualizada);
    setSinteseAbertaDetalhe(null);
  }, []);

  const copiarTextoSintese = useCallback(async (sintese) => {
    if (!sintese) return;
    const pontos = (sintese.pontosPrincipais || []).map((p) => `• ${p}`).join('\n');
    const texto = `${sintese.titulo}\n\n${sintese.resumo}\n\n${pontos}`;
    await Clipboard.setStringAsync(texto);
    mostrar('Síntese copiada!');
  }, []);

  const removerArquivoSoma = useCallback((chave) => {
    setArquivosSoma((prev) => prev.filter((a) => a.chave !== chave));
  }, []);

  const totalSomaAtual = useMemo(
    () => arquivosSoma.reduce((acc, a) => acc + parseValorBR(a.valor), 0),
    [arquivosSoma]
  );

  const abrirModalSoma = useCallback(async () => {
    setArquivosSoma([]);
    setNomePastaSoma('');
    const nomes = await listarNomesDePastaUsados();
    setNomesPastaSugeridos(nomes);
    setModalSomaAberto(true);
  }, []);

  const descartarSomaAtual = useCallback(() => {
    setModalSomaAberto(false);
    setArquivosSoma([]);
    setNomePastaSoma('');
  }, []);

  const salvarSomaAtual = useCallback(async () => {
    if (!nomePastaSoma.trim()) {
      Alert.alert('Falta o nome da pasta', 'Digite um nome pra organizar essa soma antes de salvar.');
      return;
    }
    if (arquivosSoma.length === 0) {
      Alert.alert('Nenhum arquivo', 'Adicione pelo menos uma nota ou fatura antes de salvar.');
      return;
    }
    try {
      const arquivosPermanentes = await Promise.all(
        arquivosSoma.map(async (a) => ({
          uri: await salvarImagemSomaPermanente(a.uri),
          valor: a.valor,
          tipoDocumento: a.tipoDocumento,
          ehPdf: !!a.ehPdf,
        }))
      );
      const novaSoma = {
        id: String(Date.now()),
        pasta: nomePastaSoma.trim(),
        total: totalSomaAtual,
        arquivos: arquivosPermanentes,
        data: new Date().toISOString(),
      };
      const listaAtualizada = await salvarSoma(novaSoma);
      setSomasGuardadas(listaAtualizada);
      setModalSomaAberto(false);
      setArquivosSoma([]);
      setNomePastaSoma('');
      mostrar(`Soma salva em "${novaSoma.pasta}" — total de R$ ${totalSomaAtual.toFixed(2).replace('.', ',')}.`);
    } catch (e) {
      console.error('[soma] erro ao salvar:', e);
      Alert.alert('Não consegui salvar', `Motivo técnico: ${e?.message || String(e)}`);
    }
  }, [nomePastaSoma, arquivosSoma, totalSomaAtual]);

  const excluirSomaGuardada = useCallback(async (id) => {
    const listaAtualizada = await removerSoma(id);
    setSomasGuardadas(listaAtualizada);
    setSomaAbertaDetalhe(null);
  }, []);

  // Remove um arquivo específico de dentro de uma soma já salva,
  // recalculando o total — sem precisar apagar a soma inteira.
  const removerArquivoDeSomaSalva = useCallback(async (indice) => {
    if (!somaAbertaDetalhe) return;
    const novosArquivos = somaAbertaDetalhe.arquivos.filter((_, i) => i !== indice);
    const novoTotal = novosArquivos.reduce((acc, a) => acc + parseValorBR(a.valor), 0);

    if (novosArquivos.length === 0) {
      // Sem arquivo nenhum sobrando, não faz sentido manter a soma —
      // apaga ela inteira em vez de deixar um registro vazio.
      await excluirSomaGuardada(somaAbertaDetalhe.id);
      return;
    }

    const listaAtualizada = await atualizarSoma(somaAbertaDetalhe.id, {
      arquivos: novosArquivos,
      total: novoTotal,
    });
    setSomasGuardadas(listaAtualizada);
    setSomaAbertaDetalhe({ ...somaAbertaDetalhe, arquivos: novosArquivos, total: novoTotal });
  }, [somaAbertaDetalhe, excluirSomaGuardada]);

  // Adiciona mais um arquivo direto numa soma que já foi salva antes,
  // recalculando o total dela — sem precisar criar um registro novo.
  const adicionarArquivoNaSomaAberta = useCallback(async () => {
    if (!somaAbertaDetalhe) return;

    const escolherOrigem = () =>
      new Promise((resolve) => {
        Alert.alert('Adicionar arquivo', 'Como você quer adicionar?', [
          { text: 'Tirar foto', onPress: () => resolve('camera') },
          { text: 'Escolher da galeria', onPress: () => resolve('galeria') },
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
        ]);
      });

    const origem = await escolherOrigem();
    if (!origem) return;

    let foto;
    if (origem === 'camera') {
      const permissao = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Preciso da câmera pra fotografar o documento.');
        return;
      }
      const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, exif: false });
      if (resultado.canceled || !resultado.assets?.[0]) return;
      foto = resultado.assets[0];
    } else {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Preciso acessar suas fotos pra escolher o documento.');
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({
        quality: 0.6,
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (resultado.canceled || !resultado.assets?.[0]) return;
      foto = resultado.assets[0];
    }

    setProcessandoAdicaoNaSoma(true);
    try {
      const extraido = await interpretarDocumento(foto.base64, 'image/jpeg', personalidade);
      const uriPermanente = await salvarImagemSomaPermanente(foto.uri);
      const novoArquivo = {
        uri: uriPermanente,
        valor: extraido.valor || '0',
        tipoDocumento: extraido.tipoDocumento || 'Documento',
      };
      const novosArquivos = [...(somaAbertaDetalhe.arquivos || []), novoArquivo];
      const novoTotal = novosArquivos.reduce((acc, a) => acc + parseValorBR(a.valor), 0);

      const listaAtualizada = await atualizarSoma(somaAbertaDetalhe.id, {
        arquivos: novosArquivos,
        total: novoTotal,
      });
      setSomasGuardadas(listaAtualizada);
      setSomaAbertaDetalhe({ ...somaAbertaDetalhe, arquivos: novosArquivos, total: novoTotal });
      mostrar(`Adicionado! Novo total: R$ ${novoTotal.toFixed(2).replace('.', ',')}.`);
    } catch (e) {
      console.error('[soma] erro ao adicionar arquivo:', e);
      Alert.alert('Não consegui adicionar', `Motivo técnico: ${e?.message || String(e)}`);
    } finally {
      setProcessandoAdicaoNaSoma(false);
    }
  }, [somaAbertaDetalhe, personalidade]);

  // Agrupa as somas guardadas por nome de pasta, pra exibir organizadinho.
  const somasPorPasta = useMemo(() => {
    const grupos = {};
    somasGuardadas.forEach((s) => {
      if (!grupos[s.pasta]) grupos[s.pasta] = [];
      grupos[s.pasta].push(s);
    });
    return Object.entries(grupos).map(([pasta, itens]) => ({
      pasta,
      itens,
      totalPasta: itens.reduce((acc, s) => acc + (s.total || 0), 0),
    }));
  }, [somasGuardadas]);

  // Depois de guardar o documento, sempre pergunta se quer um lembrete —
  // se ela achou uma data de vencimento, oferece ela pronta; senão, deixa
  // a pessoa escolher (data digitada ou um atalho tipo "em 7 dias").
  const [perguntaLembrete, setPerguntaLembrete] = useState(null);
  const [dataLembreteDigitada, setDataLembreteDigitada] = useState('');

  const confirmarDocumento = useCallback(async () => {
    if (!confirmacaoDocumento) return;
    const novoDocumento = { id: String(Date.now()), criadoEm: new Date().toISOString(), ...confirmacaoDocumento };
    const listaAtualizada = await salvarDocumento(novoDocumento);
    setDocumentos(listaAtualizada);
    setConfirmacaoDocumento(null);
    setDataLembreteDigitada('');
    setPerguntaLembrete(novoDocumento);
  }, [confirmacaoDocumento]);

  // Cria o compromisso de verdade na agenda certa (pessoal ou profissional)
  // — reaproveitada tanto quando a categoria já vem no comando de voz,
  // quanto depois que a pessoa responde à pergunta.
  const criarCompromissoComCategoria = useCallback(
    async (agenda, categoria, respostaFaladaPronta) => {
      try {
        const { calendarioNome, ehGoogle } = await criarEventoNaAgenda(agenda, categoria);
        await recarregarAgenda();
        if (!ehGoogle) {
          Alert.alert(
            'Atenção',
            `Não achei uma conta Google configurada no celular. O evento foi salvo no calendário local "${calendarioNome}", que não sincroniza com o Google Agenda. Adicione sua conta Google em Configurações > Contas do celular para sincronizar.`
          );
        }
        mostrar(respostaFaladaPronta || frasePersonalizada('pronto', personalidade));
        if (respostaFaladaPronta) {
          falar(respostaFaladaPronta);
        } else {
          falarGerado(
            `Você acabou de marcar um compromisso ${categoria} na agenda do usuário com sucesso. Confirme rapidinho.`,
            personalidade,
            frasePersonalizada('pronto', personalidade)
          );
        }
      } catch (erroCriacao) {
        if (erroCriacao?.message === 'AGENDA_PROFISSIONAL_INDISPONIVEL') {
          console.log('[agenda] agenda Profissional indisponível, salvando na Pessoal como reserva e avisando.');
          try {
            await criarEventoNaAgenda(agenda, 'pessoal');
            await recarregarAgenda();
          } catch (erroReserva) {
            console.error('[agenda] até a reserva na Pessoal falhou:', erroReserva);
          }
          mostrar('Não consegui criar a agenda Profissional automaticamente — salvei em Pessoal por enquanto.');
          falarGerado(
            'Você tentou marcar um compromisso profissional, mas o celular não deixou criar uma agenda "Profissional" nova automaticamente — isso é uma limitação do Android, só o app oficial do Google Agenda pode criar agendas novas. Avise o usuário que salvou o compromisso em "Pessoal" por enquanto, e explique rapidinho que ele pode abrir o app do Google Agenda e criar manualmente uma agenda chamada exatamente "Profissional" (com esse nome certinho) — depois disso a Evie passa a usar ela sozinha.',
            personalidade,
            'Não consegui criar a agenda Profissional automaticamente, então salvei esse compromisso em Pessoal. Pra separar de vez, abre o Google Agenda e cria manualmente uma agenda chamada "Profissional" — aí eu passo a usar ela sozinha.'
          );
          return;
        }
        console.error('[agenda] erro ao criar o evento de verdade:', erroCriacao);
        mostrar('Não consegui marcar esse compromisso na agenda. Tenta de novo.');
        falarGerado(
          'Você tentou marcar um compromisso na agenda do usuário, mas deu erro técnico e não conseguiu. Avise que não deu certo e peça pra tentar de novo.',
          personalidade,
          frasePersonalizada('erroAgendarCompromisso', personalidade)
        );
      }
    },
    [personalidade, recarregarAgenda]
  );

  const criarLembreteDoDocumento = useCallback(
    async (dataISO) => {
      if (!perguntaLembrete) return;
      try {
        const permitido = await pedirPermissaoAgenda();
        if (!permitido) return;
        const { eventId } = await criarEventoNaAgenda({
          titulo: perguntaLembrete.tipoDocumento,
          data: dataISO,
          hora: '09:00',
          duracao_min: 30,
          descricao: perguntaLembrete.resumo,
        });
        await recarregarAgenda();
        if (eventId) {
          const listaAtualizada = await vincularDocumentoAoEvento(perguntaLembrete.id, eventId);
          setDocumentos(listaAtualizada);
        }
        falarGerado('O usuário acabou de pedir pra você marcar um lembrete na agenda pra um documento, e você acabou de marcar com sucesso. Confirme rapidinho.', personalidade, frasePersonalizada('lembreteOk', personalidade));
      } catch (e) {
        console.error('[documentos] erro ao criar lembrete do documento:', e);
        Alert.alert('Não consegui marcar o lembrete.');
      } finally {
        setPerguntaLembrete(null);
        setDataLembreteDigitada('');
      }
    },
    [perguntaLembrete, recarregarAgenda]
  );

  function dataDaquiA(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Aceita "15/08" ou "15/08/2026" — se não disser o ano e a data já
  // tiver passado esse ano, assume o ano que vem.
  function interpretarDataDigitada(texto) {
    const partes = texto.trim().split('/');
    if (partes.length < 2) return null;
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10);
    if (!dia || !mes || dia > 31 || mes > 12) return null;
    let ano = partes[2] ? parseInt(partes[2], 10) : new Date().getFullYear();
    if (ano < 100) ano += 2000;
    let data = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (!partes[2] && data < hoje) data = new Date(ano + 1, mes - 1, dia);
    if (Number.isNaN(data.getTime())) return null;
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  }

  const excluirDocumento = useCallback((id) => {
    Alert.alert('Excluir documento', 'Quer mesmo excluir esse documento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const listaAtualizada = await removerDocumento(id);
          setDocumentos(listaAtualizada);
        },
      },
    ]);
  }, []);

  // Exclui um compromisso direto pelo ícone de lixeira na lista, sem
  // precisar falar com a Evie — pede confirmação antes, pra evitar toque
  // sem querer.
  const excluirCompromisso = useCallback(
    (evento) => {
      Alert.alert(
        'Excluir compromisso',
        `Quer mesmo excluir "${evento.titulo}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir',
            style: 'destructive',
            onPress: async () => {
              try {
                await cancelarEventoPorId(evento.id);
                await recarregarAgenda();
              } catch (e) {
                console.error('Erro ao excluir compromisso:', e);
                Alert.alert('Não consegui excluir', 'Tenta de novo em instantes.');
              }
            },
          },
        ]
      );
    },
    [recarregarAgenda]
  );

  useSpeechRecognitionEvent('start', () => {
    setOuvindo(true);
    setStatus('Ouvindo... pode falar'); setMostrarStatus(true);
    setMostrarStatus(true);
    if (timerEsconderStatus.current) clearTimeout(timerEsconderStatus.current);
  });
  useSpeechRecognitionEvent('end', () => {
    if (timerSegurancaMic.current) clearTimeout(timerSegurancaMic.current);
    setOuvindo(false);
    // Só avisa "não ouvi nada" se realmente não veio resultado nenhum —
    // o evento "result" já entrega o texto entendido, mas o "end" pode
    // chegar um instante antes dele ser processado (por causa da pausa
    // de 300ms proposital). Sem essa checagem, aparecia um "não ouvi
    // nada" enganoso bem na hora que ela tinha entendido perfeitamente,
    // o que confundia e fazia parecer que o comando seguinte falhava.
    if (!processando.current && !recebeuResultado.current) {
      mostrar('Não ouvi nada. Toque e tente de novo.');
    }
    recebeuResultado.current = false;
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (timerSegurancaMic.current) clearTimeout(timerSegurancaMic.current);
    setOuvindo(false);
    recebeuResultado.current = false;
    mostrar(`Erro: ${event.error} — ${event.message || ''}`);
  });
  useSpeechRecognitionEvent('result', (event) => {
    if (timerSegurancaMic.current) clearTimeout(timerSegurancaMic.current);
    const texto = event.results?.[0]?.transcript;
    if (texto && event.isFinal !== false) {
      recebeuResultado.current = true;
      // Pequena pausa antes de chamar a rede — a tela nativa de
      // reconhecimento de voz do Android às vezes deixa a conexão
      // instável por uma fração de segundo logo ao fechar.
      setTimeout(() => processarComando(texto), 300);
    }
  });

  async function alternarEscuta() {
    console.log('[mic] alternarEscuta chamada. ouvindo atualmente:', ouvindo);
    if (ouvindo) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    let permissao;
    try {
      console.log('[mic] checando permissao...');
      const permissaoAtual = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      console.log('[mic] permissao atual:', JSON.stringify(permissaoAtual));
      permissao = permissaoAtual;
      if (!permissaoAtual.granted) {
        console.log('[mic] pedindo permissao...');
        permissao = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        console.log('[mic] resultado do pedido:', JSON.stringify(permissao));
      }
    } catch (erroPermissao) {
      console.log('[mic] ERRO ao checar/pedir permissao:', erroPermissao?.message || erroPermissao);
      mostrar(`Erro de permissão: ${String(erroPermissao)}`);
      return;
    }

    if (!permissao.granted) {
      mostrar('Permissão de microfone negada nas configurações do celular.');
      Alert.alert(
        'Permissão necessária',
        'O app não tem permissão de microfone. Vá em Configurações > Apps > Evie > Permissões e ative o Microfone manualmente.'
      );
      return;
    }

    setStatus('Ouvindo... pode falar'); setMostrarStatus(true);
    try {
      console.log('[mic] iniciando reconhecimento...');
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: false,
        continuous: false,
      });
      console.log('[mic] start() chamado sem erro imediato.');

      // Rede de segurança: se por algum motivo nenhum evento (start, end,
      // error, result) disparar em 20 segundos, força o reset do estado
      // pra nunca ficar "preso" ouvindo pra sempre.
      if (timerSegurancaMic.current) clearTimeout(timerSegurancaMic.current);
      timerSegurancaMic.current = setTimeout(() => {
        console.log('[mic] tempo limite de segurança atingido, resetando estado.');
        setOuvindo(false);
        recebeuResultado.current = false;
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch (e) {
          // já pode ter parado sozinho, sem problema
        }
      }, 20000);
    } catch (e) {
      console.log('[mic] ERRO ao iniciar:', e?.message || e);
      mostrar(`Não consegui iniciar: ${String(e)}`);
    }
  }

  async function processarComando(texto) {
    if (processando.current) {
      const textoFallback = 'Ainda estou terminando o que você pediu — repete em instantinho.';
      mostrar(textoFallback);
      falar(textoFallback);
      return;
    }

    // Se estamos esperando a pessoa responder "pessoal" ou "profissional"
    // pra um compromisso pendente, trata isso primeiro — sem passar pelo
    // processamento normal de comando.
    if (perguntaCategoria) {
      const textoNormalizado = normalizar(texto);
      const disseProfissional = textoNormalizado.includes('profissional') || textoNormalizado.includes('trabalho');
      const dissePessoal = textoNormalizado.includes('pessoal');

      if (disseProfissional || dissePessoal) {
        const agenda = perguntaCategoria;
        setPerguntaCategoria(null);
        criarCompromissoComCategoria(agenda, disseProfissional ? 'profissional' : 'pessoal', agenda._respostaFaladaOriginal);
        return;
      }
      // Se a pessoa falou outra coisa (não respondeu a pergunta), pede de
      // novo em vez de tentar interpretar como um comando novo qualquer.
      falarGerado(
        'A pessoa não respondeu claramente "pessoal" ou "profissional" pra pergunta que você fez sobre o compromisso. Peça de novo, rapidinho, só essas duas opções.',
        personalidade,
        'Não entendi. É pessoal ou profissional?'
      );
      return;
    }

    // Mesma ideia, mas pra quando estamos esperando a pessoa dizer a que
    // horas quer ser avisada sobre um lembrete.
    if (perguntaHorarioLembrete) {
      const horaEntendida = parseHorarioFalado(texto);
      if (horaEntendida) {
        const lembretePendente = perguntaHorarioLembrete;
        setPerguntaHorarioLembrete(null);
        agendarNotificacaoLembrete(lembretePendente.id, lembretePendente.texto, horaEntendida).catch((e) =>
          console.log('[notificacoes] erro ao agendar lembrete:', e?.message || e)
        );
        setEntradas((prev) =>
          prev.map((e) => (e.id === lembretePendente.id ? { ...e, lembrete: { ...e.lembrete, hora: horaEntendida } } : e))
        );
        falarGerado(
          `Você acabou de marcar o horário ${horaEntendida} pra avisar o usuário sobre o lembrete "${lembretePendente.texto}". Confirme rapidinho.`,
          personalidade,
          `Combinado, vou te avisar às ${horaEntendida.replace(':', ' e ')}.`
        );
        return;
      }
      falarGerado(
        'A pessoa tentou dizer um horário pro lembrete, mas você não conseguiu entender. Peça pra ela falar de um jeito mais simples, tipo "9 horas" ou "21:30".',
        personalidade,
        'Não entendi o horário. Pode falar de novo? Tipo "9 horas" ou "21:30".'
      );
      return;
    }

    processando.current = true;
    setPensando(true);
    setStatus(`"${texto}"`);
    setMostrarStatus(true);
    if (timerEsconderStatus.current) clearTimeout(timerEsconderStatus.current);

    try {
      const resultado = await interpretarComando(texto, undefined, personalidade);
      const idNovaEntrada = String(Date.now());
      setEntradas((prev) => [
        { ...resultado, id: idNovaEntrada, ts: Date.now(), concluido: false },
        ...prev,
      ]);

      if (resultado.tipo === 'lembrete') {
        const horaFalada = resultado.lembrete?.hora || '';
        if (horaFalada) {
          agendarNotificacaoLembrete(idNovaEntrada, resultado.lembrete.texto, horaFalada).catch((e) =>
            console.log('[notificacoes] erro ao agendar lembrete:', e?.message || e)
          );
        } else {
          setPerguntaHorarioLembrete({ id: idNovaEntrada, texto: resultado.lembrete?.texto || '' });
          falarGerado(
            'Você acabou de guardar um lembrete pro usuário, mas ele não disse a que horas quer ser avisado. Pergunte isso rapidinho.',
            personalidade,
            'A que horas você quer que eu te avise sobre isso?'
          );
          return;
        }
      }

      if (resultado.tipo === 'agenda' && resultado.agenda?.data) {
        const permitido = await pedirPermissaoAgenda();
        if (!permitido) {
          mostrar('Preciso de permissão pra acessar sua agenda. Ative em Configurações > Apps > Evie > Permissões.');
          falarGerado('O usuário pediu pra marcar um compromisso, mas você (a assistente) ainda não tem permissão pra acessar a agenda do celular dele. Avise disso, pedindo pra ele liberar o acesso nas configurações do app.', personalidade, frasePersonalizada('erroPermissaoAgenda', personalidade));
        } else if (resultado.agenda.categoria === 'pessoal' || resultado.agenda.categoria === 'profissional') {
          await criarCompromissoComCategoria(resultado.agenda, resultado.agenda.categoria, resultado.resposta_falada);
        } else {
          // Categoria não veio definida — guarda o compromisso pendente
          // (junto com a resposta que a IA já tinha gerado) e pergunta
          // pro usuário antes de criar de verdade.
          setPerguntaCategoria({ ...resultado.agenda, _respostaFaladaOriginal: resultado.resposta_falada });
          falarGerado(
            'Você está prestes a marcar um compromisso pro usuário, mas antes precisa saber se é um compromisso pessoal ou profissional, pra guardar na agenda certa. Pergunte isso rapidinho.',
            personalidade,
            'Isso é um compromisso pessoal ou profissional?'
          );
        }
      } else if (resultado.tipo === 'cancelar') {
        const buscaTitulo = resultado.cancelar?.titulo || '';
        const cancelado = await cancelarEventoPorTitulo(buscaTitulo, resultado.cancelar?.data || null);
        await recarregarAgenda();

        if (cancelado) {
          const fala = `Cancelei "${cancelado.titulo}".`;
          mostrar(fala);
          falar(fala);
        } else {
          const busca = normalizar(buscaTitulo);

          const bateConteudo = (e) => {
            if (e.tipo === 'email') {
              return normalizar(e.email?.assunto).includes(busca) || normalizar(e.email?.corpo).includes(busca);
            }
            if (e.tipo === 'lembrete') {
              return normalizar(e.lembrete?.texto).includes(busca);
            }
            if (e.tipo === 'calculo') {
              return (
                normalizar(e.calculo?.expressao).includes(busca) ||
                normalizar(e.calculo?.resultado).includes(busca)
              );
            }
            return false;
          };

          let alvo = entradas.find(bateConteudo);

          if (!alvo) {
            let tipoAlvo = null;
            if (busca.includes('calculo')) tipoAlvo = 'calculo';
            else if (busca.includes('email')) tipoAlvo = 'email';
            else if (busca.includes('lembrete')) tipoAlvo = 'lembrete';
            if (tipoAlvo) {
              alvo = entradas.find((e) => e.tipo === tipoAlvo);
            }
          }

          if (alvo) {
            const descricao =
              alvo.tipo === 'email'
                ? alvo.email?.assunto
                : alvo.tipo === 'lembrete'
                ? alvo.lembrete?.texto
                : alvo.calculo?.expressao;
            setEntradas((prev) => prev.filter((e) => e.id !== alvo.id));
            const fala = `Apaguei "${descricao}".`;
            mostrar(fala);
            falar(fala);
          } else {
            const fala = frasePersonalizada('naoAchouCancelar', personalidade);
            mostrar(fala);
            falarGerado('O usuário pediu pra você cancelar/apagar algo (um compromisso, email, lembrete ou cálculo), mas você não achou nada com esse nome pra cancelar. Avise disso.', personalidade, frasePersonalizada('naoAchouCancelar', personalidade));
          }
        }
      } else if (resultado.tipo === 'calculo') {
        const res = resultado.calculo?.resultado || 'Não consegui calcular isso.';
        const fala = `O resultado é ${res}.`;
        mostrar(fala);
        falar(fala);
      } else if (resultado.tipo === 'buscar_documento') {
        const termoBusca = resultado.buscar_documento?.termo || '';
        setBuscaDocumento(termoBusca);
        setModalDocumentosAberto(true);

        const termoNormalizado = normalizar(termoBusca.trim());
        const encontrados = documentosOrdenados.filter((d) => {
          const alvo = normalizar(`${d.tipoDocumento || ''} ${d.remetente || ''}`);
          return alvo.includes(termoNormalizado);
        });

        if (encontrados.length === 0) {
          mostrar(`Não achei nenhum documento com "${termoBusca}".`);
          falarGerado(
            `O usuário pediu pra buscar um documento com o termo "${termoBusca}", mas você não achou nenhum documento guardado com esse nome. Avise disso.`,
            personalidade,
            `Não achei nenhum documento com "${termoBusca}".`
          );
        } else {
          const listaDescricao = encontrados
            .map((d) => `${d.tipoDocumento}${d.vencimento ? `, vencendo ${d.vencimento.split('-').reverse().join('/')}` : ''}${d.valor ? `, R$ ${d.valor}` : ''}`)
            .join('; ');
          mostrar(`Achei ${encontrados.length} documento${encontrados.length > 1 ? 's' : ''} com "${termoBusca}".`);
          falarGerado(
            `O usuário pediu pra buscar documentos com o termo "${termoBusca}". Você encontrou estes: ${listaDescricao}. Conte o que achou de forma natural.`,
            personalidade,
            `Achei ${encontrados.length} documento${encontrados.length > 1 ? 's' : ''} com "${termoBusca}".`
          );
        }
      } else if (resultado.tipo === 'buscar_lugar') {
        const termoLugar = resultado.buscar_lugar?.termo || '';
        const quantidade = resultado.buscar_lugar?.quantidade || 3;
        mostrar(`Procurando "${termoLugar}" perto de você...`);

        try {
          const posicao = await buscarLocalizacaoAtual();
          if (!posicao) {
            mostrar('Preciso de permissão pra acessar sua localização.');
            falarGerado(
              'O usuário pediu pra buscar um lugar perto dele, mas você não tem permissão pra acessar a localização do celular. Avise disso, pedindo pra ele liberar o acesso.',
              personalidade,
              'Preciso que você libere o acesso à localização pra eu buscar lugares perto de você.'
            );
          } else {
            const lugares = await buscarLugaresProximos(posicao.lat, posicao.lng, termoLugar, quantidade);
            if (!lugares || lugares.length === 0) {
              mostrar(`Não achei nenhum lugar com "${termoLugar}" perto de você.`);
              falarGerado(
                `O usuário pediu pra buscar "${termoLugar}" perto dele, mas você não achou nenhum resultado. Avise disso.`,
                personalidade,
                `Não achei nenhum lugar com "${termoLugar}" perto de você.`
              );
            } else {
              setLugaresEncontrados({ termo: termoLugar, lista: lugares });
              const listaDescricao = lugares
                .map((l) => `${l.nome}${l.distanciaKm != null ? `, a ${distanciaPorExtenso(l.distanciaKm)}` : ''}`)
                .join('; ');
              const textoFallback =
                lugares.length === 1
                  ? `Achei: ${lugares[0].nome}${lugares[0].distanciaKm != null ? `, a ${distanciaPorExtenso(lugares[0].distanciaKm)} daqui` : ''}.`
                  : `Achei ${lugares.length} opções: ${listaDescricao}.`;
              mostrar(textoFallback);
              falarGerado(
                `O usuário pediu pra buscar "${termoLugar}" perto dele. Aqui estão os resultados reais, com nome e distância — conte de forma natural, sem inventar nada: ${listaDescricao}.`,
                personalidade,
                textoFallback
              );
            }
          }
        } catch (erroLugar) {
          console.error('[lugares] erro ao buscar:', erroLugar);
          mostrar('Não consegui buscar lugares agora. Tenta de novo.');
          falarGerado(
            'Você tentou buscar um lugar perto do usuário, mas deu erro técnico. Avise que não deu certo.',
            personalidade,
            'Não consegui buscar lugares agora. Tenta de novo.'
          );
        }
      } else if (resultado.tipo === 'ligar') {
        const nomeContato = resultado.ligar?.nome || '';
        mostrar(`Procurando "${nomeContato}" nos seus contatos...`);

        try {
          const { permitido, contatos } = await buscarContatosPorNome(nomeContato);
          if (!permitido) {
            mostrar('Preciso de permissão pra acessar seus contatos.');
            falarGerado(
              'O usuário pediu pra ligar pra alguém, mas você não tem permissão pra acessar os contatos do celular dele. Avise disso, pedindo pra ele liberar o acesso.',
              personalidade,
              'Preciso que você libere o acesso aos contatos pra eu conseguir ligar.'
            );
          } else if (contatos.length === 0) {
            mostrar(`Não achei nenhum contato chamado "${nomeContato}".`);
            falarGerado(
              `O usuário pediu pra ligar pra "${nomeContato}", mas você não achou nenhum contato com esse nome na agenda dele. Avise disso.`,
              personalidade,
              `Não achei nenhum contato chamado "${nomeContato}".`
            );
          } else {
            setContatosEncontrados({ termo: nomeContato, lista: contatos, acao: 'ligar' });
            if (contatos.length === 1) {
              const textoFallback = `Achei ${contatos[0].nome}. Toca pra confirmar a ligação.`;
              mostrar(textoFallback);
              falarGerado(
                `Você achou um contato chamado "${nomeContato}" (${contatos[0].nome}). Ele já está na tela, esperando o usuário confirmar tocando pra ligar. Avise isso rapidinho.`,
                personalidade,
                textoFallback
              );
            } else {
              const listaNomes = contatos.map((c) => c.nome).join('; ');
              const textoFallback = `Achei ${contatos.length} contatos chamados "${nomeContato}": ${listaNomes}. Toca no certo pra ligar.`;
              mostrar(textoFallback);
              falarGerado(
                `O usuário pediu pra ligar pra "${nomeContato}", mas você achou mais de um contato com esse nome: ${listaNomes}. Peça pra ele escolher qual, mostrando que a lista já está na tela.`,
                personalidade,
                textoFallback
              );
            }
          }
        } catch (erroContato) {
          console.error('[contatos] erro ao buscar:', erroContato);
          mostrar('Não consegui acessar seus contatos agora. Tenta de novo.');
          falarGerado(
            'Você tentou buscar um contato pra ligar, mas deu erro técnico. Avise que não deu certo.',
            personalidade,
            'Não consegui acessar seus contatos agora. Tenta de novo.'
          );
        }
      } else if (resultado.tipo === 'whatsapp_mensagem') {
        const nomeContato = resultado.whatsapp_mensagem?.nome || '';
        const mensagemRascunho = resultado.whatsapp_mensagem?.mensagem || '';
        mostrar(`Procurando "${nomeContato}" nos seus contatos...`);

        try {
          const { permitido, contatos } = await buscarContatosPorNome(nomeContato);
          if (!permitido) {
            mostrar('Preciso de permissão pra acessar seus contatos.');
            falarGerado(
              'O usuário pediu pra mandar mensagem no WhatsApp pra alguém, mas você não tem permissão pra acessar os contatos do celular dele. Avise disso, pedindo pra ele liberar o acesso.',
              personalidade,
              'Preciso que você libere o acesso aos contatos.'
            );
          } else if (contatos.length === 0) {
            mostrar(`Não achei nenhum contato chamado "${nomeContato}".`);
            falarGerado(
              `O usuário pediu pra mandar mensagem pra "${nomeContato}", mas você não achou nenhum contato com esse nome. Avise disso.`,
              personalidade,
              `Não achei nenhum contato chamado "${nomeContato}".`
            );
          } else {
            setContatosEncontrados({ termo: nomeContato, lista: contatos, acao: 'whatsapp', mensagem: mensagemRascunho });
            if (contatos.length === 1) {
              const textoFallback = `Rascunho pronto pra ${contatos[0].nome}. Toca pra abrir o WhatsApp.`;
              mostrar(textoFallback);
              falarGerado(
                `Você já escreveu o rascunho da mensagem pra "${nomeContato}" (${contatos[0].nome}) e ele já está na tela, esperando o usuário confirmar tocando pra abrir o WhatsApp. Avise isso rapidinho.`,
                personalidade,
                textoFallback
              );
            } else {
              const listaNomes = contatos.map((c) => c.nome).join('; ');
              const textoFallback = `Achei ${contatos.length} contatos chamados "${nomeContato}": ${listaNomes}. Toca no certo.`;
              mostrar(textoFallback);
              falarGerado(
                `O usuário pediu pra mandar mensagem pra "${nomeContato}", mas você achou mais de um contato com esse nome: ${listaNomes}. Peça pra ele escolher qual.`,
                personalidade,
                textoFallback
              );
            }
          }
        } catch (erroContato) {
          console.error('[contatos] erro ao buscar:', erroContato);
          mostrar('Não consegui acessar seus contatos agora. Tenta de novo.');
          falarGerado(
            'Você tentou mandar mensagem, mas deu erro técnico ao buscar o contato. Avise que não deu certo.',
            personalidade,
            'Não consegui acessar seus contatos agora. Tenta de novo.'
          );
        }
      } else if (resultado.tipo === 'gerar_post') {
        const tema = resultado.gerar_post?.tema || '';
        const rede = resultado.gerar_post?.rede || '';
        mostrar(`Pensando em ideias sobre "${tema}"...`);

        try {
          const opcoes = await gerarPost(tema, rede, perfilProfissional);
          setPostsGerados({ tema, rede, opcoes });
          const novoRegistro = { id: String(Date.now()), tema, rede, opcoes, data: new Date().toISOString() };
          const listaAtualizada = await salvarPost(novoRegistro);
          setHistoricoPosts(listaAtualizada);
          const textoFallback = `Prontas ${opcoes.length} opções de post sobre "${tema}". Dá uma olhada na tela.`;
          mostrar(textoFallback);
          falarGerado(
            `Você acabou de gerar ${opcoes.length} opções de post sobre "${tema}" pro usuário. Elas já estão na tela. Avise isso rapidinho.`,
            personalidade,
            textoFallback
          );
        } catch (erroPost) {
          console.error('[post] erro ao gerar:', erroPost);
          mostrar('Não consegui gerar as ideias de post agora. Tenta de novo.');
          falarGerado(
            'Você tentou gerar ideias de post pro usuário, mas deu erro técnico. Avise que não deu certo.',
            personalidade,
            'Não consegui gerar as ideias agora. Tenta de novo.'
          );
        }
      } else if (resultado.tipo === 'consultar_agenda') {
        const textoBriefing = montarTextoBriefing();
        if (textoBriefing) {
          mostrar(textoBriefing);
          falar(textoBriefing);
        } else {
          const semCompromissos = 'Você não tem nenhum compromisso nem lembrete pendente por enquanto.';
          mostrar(semCompromissos);
          falar(semCompromissos);
        }
      } else {
        const fala = resultado.resposta_falada || frasePersonalizada('pronto', personalidade);
        mostrar(fala);
        if (resultado.resposta_falada) {
          falar(resultado.resposta_falada);
        } else {
          falarGerado('Você acabou de atender um pedido do usuário com sucesso. Confirme rapidinho, de forma genérica.', personalidade, frasePersonalizada('pronto', personalidade));
        }
      }
    } catch (err) {
      console.error(err);
      mostrar('Não consegui processar esse comando.');
    } finally {
      setPensando(false);
      processando.current = false;
    }
  }

  function toggleLembrete(id) {
    setEntradas((prev) =>
      prev.map((e) => (e.id === id ? { ...e, concluido: !e.concluido } : e))
    );
  }

  // Remove um lembrete, rascunho de email ou cálculo direto pelo ícone de
  // lixeira, sem precisar pedir por voz.
  function removerEntrada(id) {
    cancelarNotificacaoLembrete(id).catch(() => {});
    setEntradas((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleAbrirEmail(email) {
    try {
      await abrirRascunhoEmail(email);
    } catch (e) {
      Alert.alert('Não foi possível abrir o email', e.message);
    }
  }

  const eventosHoje = useMemo(
    () => proximosEventos.filter((e) => ehHoje(e.inicio)),
    [proximosEventos]
  );

  const eventosAmanha = useMemo(
    () => proximosEventos.filter((e) => ehAmanha(e.inicio)),
    [proximosEventos]
  );

  // Texto do resumo de cima: se tem compromisso hoje, avisa quantos e o
  // primeiro horário. Se não tem hoje mas tem algo mais pra frente, avisa
  // qual é o próximo (em vez de simplesmente dizer "nada marcado", o que
  // confundia quando já tinha algo marcado pra amanhã, por exemplo).
  const textoResumo = useMemo(() => {
    if (eventosHoje.length > 0) {
      const primeiro = eventosHoje[0];
      const hora = primeiro.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `Você tem ${eventosHoje.length} compromisso${eventosHoje.length > 1 ? 's' : ''} hoje, o primeiro às ${hora}.`;
    }
    if (proximosEventos.length > 0) {
      return 'Nenhum compromisso hoje. Confira os próximos compromissos abaixo.';
    }
    return 'Nenhum compromisso marcado ainda.';
  }, [eventosHoje, proximosEventos]);

  // Tela (modal) com todos os compromissos de hoje, aberta ao tocar no
  // resumo do briefing — a Evie narra a lista em voz alta ao abrir.
  const [modalHojeAberto, setModalHojeAberto] = useState(false);

  const abrirCompromissosDeHoje = useCallback(async () => {
    setModalHojeAberto(true);
    const nome = nomeUsuario ? nomeUsuario.trim().split(' ')[0] : '';
    const chamada = nome ? `${nome}, ` : '';

    if (eventosHoje.length === 0) {
      falarGerado(
        `O usuário${nome ? ` (nome: ${nome})` : ''} acabou de pedir pra ver os compromissos de hoje, e não tem nenhum marcado. Avise isso, chamando pelo nome se tiver um.`,
        personalidade,
        `${chamada}${frasePersonalizada('semCompromissosHoje', personalidade)}`
      );
      return;
    }
    const listaDescricao = eventosHoje
      .map((e) => `às ${horaFalada(e.inicio)}: ${e.titulo}`)
      .join('; ');
    const listaFallback = eventosHoje.map((e) => `às ${horaFalada(e.inicio)}, ${e.titulo}`).join('. ');
    const textoFallback =
      eventosHoje.length === 1
        ? `${chamada}você tem 1 compromisso hoje: ${listaFallback}.`
        : `${chamada}você tem ${eventosHoje.length} compromissos hoje: ${listaFallback}.`;
    falarGerado(
      `O usuário${nome ? ` (nome: ${nome})` : ''} acabou de pedir pra ver os compromissos de hoje. Aqui está a lista real, com hora e título — narre ela de forma natural, sem inventar nada: ${listaDescricao}.`,
      personalidade,
      textoFallback
    );
  }, [eventosHoje, nomeUsuario, personalidade]);

  // Mesma ideia da de hoje, só que pra amanhã — usada pela notificação da
  // noite ("veja o que te espera amanhã").
  const abrirCompromissosDeAmanha = useCallback(async () => {
    setModalHojeAberto(true);
    const nome = nomeUsuario ? nomeUsuario.trim().split(' ')[0] : '';
    const chamada = nome ? `${nome}, ` : '';

    if (eventosAmanha.length === 0) {
      falarGerado(
        `O usuário${nome ? ` (nome: ${nome})` : ''} acabou de pedir pra ver os compromissos de amanhã, e não tem nenhum marcado. Avise isso, chamando pelo nome se tiver um.`,
        personalidade,
        `${chamada}você não tem nenhum compromisso marcado pra amanhã.`
      );
      return;
    }
    const listaDescricao = eventosAmanha
      .map((e) => `às ${horaFalada(e.inicio)}: ${e.titulo}`)
      .join('; ');
    const listaFallback = eventosAmanha.map((e) => `às ${horaFalada(e.inicio)}, ${e.titulo}`).join('. ');
    const textoFallback =
      eventosAmanha.length === 1
        ? `${chamada}amanhã você tem 1 compromisso: ${listaFallback}.`
        : `${chamada}amanhã você tem ${eventosAmanha.length} compromissos: ${listaFallback}.`;
    falarGerado(
      `O usuário${nome ? ` (nome: ${nome})` : ''} acabou de pedir pra ver os compromissos de amanhã. Aqui está a lista real, com hora e título — narre ela de forma natural, sem inventar nada: ${listaDescricao}.`,
      personalidade,
      textoFallback
    );
  }, [eventosAmanha, nomeUsuario, personalidade]);

  // Compromissos do mês inteiro — busca uma janela maior (45 dias, cobre
  // qualquer dia do mês em que a pessoa esteja) e filtra só o que cai no
  // mês atual, já que "Próximos compromissos" só olha 14 dias à frente.
  const [modalMesAberto, setModalMesAberto] = useState(false);
  const [compromissosDoMes, setCompromissosDoMes] = useState([]);
  const [carregandoMes, setCarregandoMes] = useState(false);

  const abrirCompromissosDoMes = useCallback(async () => {
    setModalMesAberto(true);
    setCarregandoMes(true);
    try {
      const hoje = new Date();
      const eventosNaJanela = await buscarProximosEventos(45);
      const doMesAtual = eventosNaJanela.filter(
        (e) => e.inicio.getMonth() === hoje.getMonth() && e.inicio.getFullYear() === hoje.getFullYear()
      );
      setCompromissosDoMes(doMesAtual);
    } catch (e) {
      console.error('[agenda] erro ao buscar compromissos do mês:', e);
    } finally {
      setCarregandoMes(false);
    }
  }, []);

  // Agenda as notificações diárias (8h e 20h) uma vez, assim que sabemos o
  // nome da pessoa. Reagendar é seguro (não duplica, só substitui).
  useEffect(() => {
    if (!nomeUsuario) return;
    agendarNotificacoesDiarias().catch((e) => console.log('[notificacoes] erro ao agendar:', e?.message || e));
  }, [nomeUsuario]);

  // Escuta quando a pessoa toca numa das notificações diárias, e abre a
  // narração certa (compromissos de hoje pela manhã, de amanhã à noite).
  useEffect(() => {
    const assinatura = Notifications.addNotificationResponseReceivedListener((resposta) => {
      const tipo = resposta.notification.request.content.data?.tipo;
      console.log('[notificacoes] notificação tocada, tipo:', tipo);
      if (tipo === 'briefing-manha') {
        abrirCompromissosDeHoje();
      } else if (tipo === 'briefing-noite') {
        abrirCompromissosDeAmanha();
      } else if (tipo === 'lembrete') {
        const texto = resposta.notification.request.content.body || 'Você tem um lembrete.';
        falarGerado(
          `Você está avisando o usuário sobre um lembrete que ele pediu, no horário certo. O lembrete é: "${texto}". Fale isso de forma natural.`,
          personalidade,
          texto
        );
      }
    });
    return () => assinatura.remove();
  }, [abrirCompromissosDeHoje, abrirCompromissosDeAmanha, personalidade]);

  // Assim que a agenda termina de carregar, confere se já saudou a pessoa
  // nesse período do dia (manhã/tarde/noite) — se não, fala sozinha, sem
  // precisar tocar em nada. Só acontece uma vez por período, mesmo que a
  // pessoa feche e abra o app várias vezes seguidas.
  useEffect(() => {
    console.log('[saudacao-auto] verificando... agendaCarregada:', agendaCarregada, '| nomeUsuario:', nomeUsuario);
    if (!agendaCarregada || !nomeUsuario) return;

    (async () => {
      const chaveAgora = chavePeriodoAtual();
      const ultima = await buscarUltimaSaudacao();
      console.log('[saudacao-auto] chave atual:', chaveAgora, '| última salva:', ultima);
      if (ultima === chaveAgora) {
        console.log('[saudacao-auto] já saudou nesse período, não vai falar de novo.');
        return;
      }
      console.log('[saudacao-auto] vai falar agora. eventosHoje.length:', eventosHoje.length);

      const nome = nomeUsuario.trim().split(' ')[0];
      const periodoDoDia = saudacao();
      const inicioFallback = `${periodoDoDia}, ${nome}.`;

      let situacao;
      let textoFallback;
      if (eventosHoje.length === 0) {
        situacao = `Você está saudando o usuário (nome: ${nome}) pela primeira vez nesse período do dia (${periodoDoDia}). Ele não tem nenhum compromisso marcado hoje. Cumprimente e avise disso, chamando pelo nome.`;
        textoFallback = `${inicioFallback} Você não tem nenhum compromisso hoje.`;
      } else {
        const listaDescricao = eventosHoje
          .map((e) => `às ${horaFalada(e.inicio)}: ${e.titulo}`)
          .join('; ');
        situacao = `Você está saudando o usuário (nome: ${nome}) pela primeira vez nesse período do dia (${periodoDoDia}). Aqui está a lista real dos compromissos de hoje dele, com hora e título — cumprimente, chame pelo nome, e narre a lista de forma natural, sem inventar nada: ${listaDescricao}.`;
        const listaFallback = eventosHoje.map((e) => `às ${horaFalada(e.inicio)}, ${e.titulo}`).join('. ');
        textoFallback =
          eventosHoje.length === 1
            ? `${inicioFallback} Hoje você tem 1 compromisso: ${listaFallback}.`
            : `${inicioFallback} Hoje você tem ${eventosHoje.length} compromissos: ${listaFallback}.`;
      }

      falarGerado(situacao, personalidade, textoFallback);
      await salvarUltimaSaudacao(chaveAgora);
    })();
  }, [agendaCarregada, nomeUsuario, eventosHoje, personalidade]);

  const lembretes = useMemo(
    () => entradas.filter((e) => e.tipo === 'lembrete'),
    [entradas]
  );
  const lembretesPendentes = lembretes.filter((e) => !e.concluido).length;

  // Monta o texto do briefing do dia — usada tanto pro cartão visual
  // quanto pra resposta falada quando a pessoa pergunta pelos compromissos.
  const montarTextoBriefing = useCallback(() => {
    const itens = [];
    if (eventosHoje.length > 0) {
      itens.push(
        eventosHoje.length === 1
          ? `${eventosHoje[0].titulo} às ${horaFalada(eventosHoje[0].inicio)}`
          : `${eventosHoje.length} compromissos hoje, o primeiro às ${horaFalada(eventosHoje[0].inicio)}`
      );
    }
    if (lembretesPendentes > 0) itens.push(`${lembretesPendentes} lembrete${lembretesPendentes > 1 ? 's' : ''} pendente${lembretesPendentes > 1 ? 's' : ''}`);
    if (itemUrgente) itens.push(itemUrgente.replace(/\.$/, ''));
    if (itens.length === 0) return null;
    return itens.join(' · ') + '.';
  }, [eventosHoje, lembretesPendentes, itemUrgente]);

  const emails = useMemo(
    () => entradas.filter((e) => e.tipo === 'email'),
    [entradas]
  );

  const calculos = useMemo(
    () => entradas.filter((e) => e.tipo === 'calculo'),
    [entradas]
  );

  return (
    <LinearGradient colors={['#E9E9E6', '#DCE3EC']} style={styles.container}>
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
      >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <Animated.View
          style={{
            opacity: entradaOpacidade,
            transform: [{ translateY: entradaDeslize }],
          }}
        >
        <View style={styles.headerClaro}>
          <View style={styles.headerClaroTopo}>
            <View style={styles.headerClaroPerfil}>
              <View>
                <Text style={styles.saudacaoClara}>
                  {saudacao()}, <Text style={styles.headerNomeTexto}>{nomeUsuario ? nomeUsuario.trim().split(' ')[0] : 'Ana'}</Text>
                </Text>
                {clima && (
                  <View style={styles.climaLinha}>
                    <MaterialCommunityIcons name={clima.icone} size={11} color={clima.cor} />
                    <Text style={styles.climaTexto} numberOfLines={1}>
                      {clima.texto}{clima.cidade ? ` · ${clima.cidade}` : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={abrirConfiguracoes} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <FontAwesome name="ellipsis-v" size={18} color={COR.tintaSuave} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroCardGlowWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.heroCardHalo,
              {
                opacity: brilhoPulso,
                transform: [
                  {
                    scale: brilhoPulso.interpolate({
                      inputRange: [0.15, 0.35],
                      outputRange: [0.97, 1.04],
                    }),
                  },
                ],
              },
            ]}
          />
          <LinearGradient
            colors={['#0B2545', '#004182']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
          <View style={styles.heroCardTopo}>
            <View style={styles.heroStatusBadge}>
              <View style={styles.heroStatusPonto} />
              <Text style={styles.heroStatusTexto}>EVIE · PRONTA</Text>
            </View>
            <Text style={styles.heroVozTag}>VOZ</Text>
          </View>
          <Text style={styles.h1Claro} numberOfLines={1} adjustsFontSizeToFit>No que posso ajudar hoje?</Text>

          <TouchableOpacity
            style={styles.heroMicBarra}
            activeOpacity={0.85}
            onPressIn={() => { if (!ouvindo) alternarEscuta(); }}
            onPressOut={() => { if (ouvindo) alternarEscuta(); }}
          >
            <View style={[styles.heroMicCirculo, ouvindo && styles.micBtnAtivo]}>
              {ouvindo ? (
                <FontAwesome name="stop" size={16} color="#FFFFFF" />
              ) : (
                <Image source={LOGO_EVIE} style={styles.heroMicLogo} resizeMode="contain" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroMicTitulo}>{ouvindo ? 'Ouvindo...' : 'Toque e fale comigo'}</Text>
              <Text style={styles.heroMicSub}>segure para falar · solte para enviar</Text>
              <View style={styles.heroOnda}>
                {alturasOnda.map((alturaBase, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.heroOndaBarra,
                      {
                        height: alturaBase,
                        transform: [
                          {
                            scaleY: ondaAnimada[i].interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.3, 1],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
            <FontAwesome name="chevron-right" size={14} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </LinearGradient>
        </View>

        <View style={styles.atalhos}>
          <TouchableOpacity style={styles.atalhoBtn} activeOpacity={0.7} onPress={abrirAgendaNativa}>
            <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.atalhoIconeBox}>
              <FontAwesome name="calendar" size={22} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.atalhoLabel} numberOfLines={1}>Calendário</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.atalhoBtn} activeOpacity={0.7} onPress={() => abrirWhatsapp()}>
            <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.atalhoIconeBox}>
              <FontAwesome name="whatsapp" size={22} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.atalhoLabel} numberOfLines={1}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.atalhoBtn} activeOpacity={0.7} onPress={abrirCaixaDeEntradaEmail}>
            <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.atalhoIconeBox}>
              <FontAwesome name="envelope" size={20} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.atalhoLabel} numberOfLines={1}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.atalhoBtn} activeOpacity={0.7} onPress={() => abrirDiscador()}>
            <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.atalhoIconeBox}>
              <FontAwesome name="phone" size={21} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.atalhoLabel} numberOfLines={1}>Ligar</Text>
          </TouchableOpacity>
        </View>

        {(() => {
          const textoBriefing = montarTextoBriefing();
          if (!textoBriefing) return null;
          const totalItens = eventosHoje.length + lembretesPendentes + (itemUrgente ? 1 : 0);
          return (
            <TouchableOpacity style={styles.briefingCard} activeOpacity={0.8} onPress={abrirCompromissosDeHoje}>
              <View style={styles.briefingTopo}>
                <Text style={styles.briefingTitulo}>Briefing do dia</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.briefingContagem}>{totalItens} ITE{totalItens > 1 ? 'NS' : 'M'}</Text>
                  <FontAwesome name="chevron-right" size={11} color={COR.tintaSuave} />
                </View>
              </View>
              <Text style={styles.briefingTexto}>{textoBriefing}</Text>
            </TouchableOpacity>
          );
        })()}

        <View style={styles.statsGrade}>
          <TouchableOpacity
            style={styles.statsCartao}
            activeOpacity={0.8}
            onPress={() => setModalLembretesAberto(true)}
          >
            <View style={styles.statsTopo}>
              <View style={styles.statsIconeBox}>
                <FontAwesome name="check-circle-o" size={15} color={COR.dourado} />
              </View>
              <Text style={styles.statsContagem}>{lembretes.length}</Text>
            </View>
            <Text style={styles.statsTitulo} numberOfLines={1} adjustsFontSizeToFit>Lembretes</Text>
            <Text style={styles.statsSub} numberOfLines={1}>
              {lembretes[0]?.lembrete?.texto || 'Nenhum ainda'}
            </Text>
            <Text style={styles.statsExpandir}>EXPANDIR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statsCartao}
            activeOpacity={0.8}
            onPress={abrirCompromissosDoMes}
          >
            <View style={styles.statsTopo}>
              <View style={styles.statsIconeBox}>
                <FontAwesome name="calendar" size={14} color={COR.dourado} />
              </View>
              <Text style={styles.statsContagem}>{proximosEventos.length}</Text>
            </View>
            <Text style={styles.statsTitulo} numberOfLines={1} adjustsFontSizeToFit>Agenda do mês</Text>
            <Text style={styles.statsSub} numberOfLines={1}>
              {proximosEventos[0]?.titulo || 'Nada marcado ainda'}
            </Text>
            <Text style={styles.statsExpandir}>EXPANDIR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statsCartao}
            activeOpacity={0.8}
            onPress={() => setModalRascunhosAberto(true)}
          >
            <View style={styles.statsTopo}>
              <View style={styles.statsIconeBox}>
                <FontAwesome name="envelope-o" size={14} color={COR.dourado} />
              </View>
              <Text style={styles.statsContagem}>{emails.length}</Text>
            </View>
            <Text style={styles.statsTitulo} numberOfLines={1} adjustsFontSizeToFit>Rascunhos Email</Text>
            <Text style={styles.statsSub} numberOfLines={1}>
              {emails[0]?.email?.assunto || 'Nenhum ainda'}
            </Text>
            <Text style={styles.statsExpandir}>EXPANDIR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statsCartao}
            activeOpacity={0.8}
            onPress={() => setModalDocumentosAberto(true)}
          >
            <View style={styles.statsTopo}>
              <View style={styles.statsIconeBox}>
                <FontAwesome name="file-text-o" size={14} color={COR.dourado} />
              </View>
              <Text style={styles.statsContagem}>{documentos.length}</Text>
            </View>
            <Text style={styles.statsTitulo} numberOfLines={1} adjustsFontSizeToFit>Documentos</Text>
            <Text style={styles.statsSub} numberOfLines={1}>
              {documentos[0]?.tipoDocumento || 'Nenhum ainda'}
            </Text>
            <Text style={styles.statsExpandir}>EXPANDIR</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mesa}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={styles.statsIconeBox}>
              <FontAwesome name="file-text-o" size={13} color={COR.dourado} />
            </View>
            <Text style={styles.mesaTitulo} numberOfLines={1}>Somar notas/faturas</Text>
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={abrirModalSoma}>
            <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaBotaoNovoLargo}>
              <FontAwesome name="plus" size={12} color="#FFFFFF" />
              <Text style={styles.somaBotaoNovoTexto}>Nova soma</Text>
            </LinearGradient>
          </TouchableOpacity>

          {somasPorPasta.length === 0 ? (
            <Text style={[styles.vazio, { marginTop: 12 }]}>Some várias notas ou faturas de uma vez, e guarde organizado por pasta.</Text>
          ) : (
            somasPorPasta.map((grupo) => (
              <View key={grupo.pasta} style={styles.somaPastaLinha}>
                <FontAwesome name="folder" size={13} color={COR.dourado} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.linhaTitulo}>{grupo.pasta}</Text>
                  <Text style={styles.linhaSub}>
                    {grupo.itens.length} soma{grupo.itens.length > 1 ? 's' : ''} · total R${' '}
                    {grupo.totalPasta.toFixed(2).replace('.', ',')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSomaAbertaDetalhe(grupo.itens[0])}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="chevron-right" size={14} color={COR.tintaSuave} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.mesa}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={styles.statsIconeBox}>
              <FontAwesome name="align-left" size={13} color={COR.dourado} />
            </View>
            <Text style={styles.mesaTitulo} numberOfLines={1}>Sintetizar documento</Text>
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={abrirModalSintese}>
            <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaBotaoNovoLargo}>
              <FontAwesome name="plus" size={12} color="#FFFFFF" />
              <Text style={styles.somaBotaoNovoTexto}>Nova síntese</Text>
            </LinearGradient>
          </TouchableOpacity>

          {historicoSinteses.length === 0 ? (
            <Text style={[styles.vazio, { marginTop: 12 }]}>
              Envie a foto de um contrato, relatório ou artigo, e receba um resumo com os pontos principais.
            </Text>
          ) : (
            historicoSinteses.map((sintese) => (
              <TouchableOpacity
                key={sintese.id}
                style={styles.somaPastaLinha}
                onPress={() => setSinteseAbertaDetalhe(sintese)}
              >
                <FontAwesome name="file-text-o" size={13} color={COR.dourado} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.linhaTitulo} numberOfLines={1}>{sintese.titulo}</Text>
                  <Text style={styles.linhaSub} numberOfLines={1}>{sintese.tipoDocumento}</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color={COR.tintaSuave} />
              </TouchableOpacity>
            ))
          )}
        </View>

                      <View style={styles.mesa}>
          <View style={styles.somaCabecalho}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={styles.statsIconeBox}>
                <FontAwesome name="bullhorn" size={13} color={COR.dourado} />
              </View>
              <Text style={styles.mesaTitulo}>Ideias de Post</Text>
            </View>
          </View>

          {historicoPosts.length === 0 ? (
            <Text style={styles.vazio}>Peça uma ideia de post por voz pra ver o histórico aqui.</Text>
          ) : (
            historicoPosts.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={styles.somaPastaLinha}
                onPress={() => setPostsGerados(post)}
              >
                <FontAwesome
                  name={post.rede === 'instagram' ? 'instagram' : post.rede === 'linkedin' ? 'linkedin' : 'bullhorn'}
                  size={13}
                  color={COR.dourado}
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.linhaTitulo} numberOfLines={1}>{post.tema}</Text>
                  <Text style={styles.linhaSub} numberOfLines={1}>{post.opcoes?.length || 0} opções</Text>
                </View>
                <TouchableOpacity
                  onPress={() => removerPost(post.id).then(setHistoricoPosts)}
                  style={styles.linhaExcluir}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>

<View style={styles.mesa}>
          <MesaHeader
            icone="calculator"
            cor={COR.tintaSuave}
            corFundo={COR.linha}
            titulo="Cálculos recentes"
            aberto={abasAbertas.calculos}
            onToggle={() => alternarAba('calculos')}
          />
          {calculos.length === 0 ? (
            <Text style={styles.vazio}>Peça uma conta pra ver aqui.</Text>
          ) : (
            <>
              {(abasAbertas.calculos ? calculos : calculos.slice(0, LIMITE_PREVIA)).map((e) => (
                <View key={e.id} style={styles.linha}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaSub}>{e.calculo.expressao}</Text>
                  </View>
                  <Text style={styles.resultadoNumero}>{e.calculo.resultado}</Text>
                  <TouchableOpacity
                    onPress={() => removerEntrada(e.id)}
                    style={styles.linhaExcluir}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                  </TouchableOpacity>
                </View>
              ))}
              {!abasAbertas.calculos && calculos.length > LIMITE_PREVIA && (
                <TouchableOpacity onPress={() => alternarAba('calculos')}>
                  <Text style={styles.verMais}>
                    +{calculos.length - LIMITE_PREVIA} cálculo{calculos.length - LIMITE_PREVIA > 1 ? 's' : ''} — toque pra ver tudo
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
        </Animated.View>

      </ScrollView>

      <View style={styles.barraInferior}>
        {(pensando || ouvindo || mostrarStatus) && (
          <View style={styles.statusPill}>
            <Text numberOfLines={2} style={styles.statusPillTexto}>
              {pensando
                ? `${NOME_ASSISTENTE} está processando...`
                : ouvindo
                ? 'Ouvindo — pode falar'
                : status}
            </Text>
          </View>
        )}
        <View style={styles.barraInferiorIcones}>
          <TouchableOpacity
            style={styles.barraInferiorItem}
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome name="home" size={18} color={COR.dourado} />
            <Text style={[styles.barraInferiorLabel, { color: COR.dourado }]}>Início</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.barraInferiorItem}
            onPress={abrirCompromissosDoMes}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome name="calendar" size={18} color={COR.tintaSuave} />
            <Text style={styles.barraInferiorLabel}>Agenda</Text>
          </TouchableOpacity>
          <View style={{ width: 52 }} />
          <TouchableOpacity
            style={styles.barraInferiorItem}
            onPress={() => setModalDocumentosAberto(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome name="file-text-o" size={18} color={COR.tintaSuave} />
            <Text style={styles.barraInferiorLabel}>Docs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.barraInferiorItem}
            onPress={abrirConfiguracoes}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome name="user-o" size={18} color={COR.tintaSuave} />
            <Text style={styles.barraInferiorLabel}>Perfil</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.micBtnFlutuante}
          activeOpacity={0.8}
          onPressIn={() => { if (!ouvindo) alternarEscuta(); }}
          onPressOut={() => { if (ouvindo) alternarEscuta(); }}
        >
          <LinearGradient
            colors={ouvindo ? [COR.ferrugem, COR.ferrugem] : ['#164A87', '#0A2C56']}
            style={styles.micBtnFlutuanteMiolo}
          >
            {ouvindo ? (
              <FontAwesome name="stop" size={22} color="#FFFFFF" />
            ) : (
              <Image source={LOGO_EVIE} style={styles.micBtnFlutuanteLogo} resizeMode="contain" />
            )}
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.micBtnFlutuanteLabel}>Falar</Text>
      </View>
      </KeyboardAvoidingView>

      <Modal
        visible={modalHojeAberto}
        animationType="slide"
        transparent
        onRequestClose={() => setModalHojeAberto(false)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Compromissos de hoje</Text>
              <TouchableOpacity
                onPress={() => setModalHojeAberto(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalData}>{formatarDataBriefing(new Date())}</Text>

            <ScrollView style={{ maxHeight: 420 }}>
              {eventosHoje.length === 0 ? (
                <Text style={styles.vazio}>Nenhum compromisso marcado pra hoje.</Text>
              ) : (
                eventosHoje.map((e) => (
                  <View key={e.id} style={styles.modalLinha}>
                    <Text style={styles.modalHora}>
                      {e.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalTituloCompromisso}>{e.titulo}</Text>
                      {!!e.local && <Text style={styles.linhaSub}>{e.local}</Text>}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalBotaoOuvir}
              activeOpacity={0.8}
              onPress={abrirCompromissosDeHoje}
            >
              <FontAwesome name="volume-up" size={14} color="#FFFFFF" />
              <Text style={styles.modalBotaoOuvirTexto}>Ouvir de novo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalMesAberto}
        animationType="slide"
        transparent
        onRequestClose={() => setModalMesAberto(false)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Compromissos do mês</Text>
              <TouchableOpacity
                onPress={() => setModalMesAberto(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalData}>
              {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </Text>

            <ScrollView style={{ maxHeight: 420 }}>
              {carregandoMes ? (
                <Text style={styles.vazio}>Carregando...</Text>
              ) : compromissosDoMes.length === 0 ? (
                <Text style={styles.vazio}>Nenhum compromisso marcado pra esse mês.</Text>
              ) : (
                compromissosDoMes.map((e) => (
                  <View key={e.id} style={styles.modalLinha}>
                    <Text style={styles.modalHora}>
                      {e.inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      {'\n'}
                      {e.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalTituloCompromisso}>{e.titulo}</Text>
                      {!!e.local && <Text style={styles.linhaSub}>{e.local}</Text>}
                    </View>
                    {!!documentoPorEvento[e.id] && (
                      <TouchableOpacity
                        onPress={() => setDocumentoAberto(documentoPorEvento[e.id])}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <FontAwesome name="paperclip" size={16} color={COR.dourado} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!arquivoCompartilhado}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setArquivoCompartilhado(null);
          resetShareIntent();
        }}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Arquivo recebido</Text>
              <TouchableOpacity
                onPress={() => {
                  setArquivoCompartilhado(null);
                  resetShareIntent();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            {arquivoCompartilhado && (
              <Image source={{ uri: arquivoCompartilhado.uri }} style={styles.docImagemGrande} />
            )}
            <Text style={[styles.modalData, { marginTop: 12 }]}>
              Quer guardar esse arquivo nos seus documentos?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={styles.somaBotaoDescartar}
                onPress={() => {
                  setArquivoCompartilhado(null);
                  resetShareIntent();
                }}
              >
                <Text style={styles.somaBotaoDescartarTexto}>Não</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                disabled={processandoCompartilhado}
                onPress={() => processarArquivoCompartilhado(arquivoCompartilhado.uri)}
              >
                <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaBotaoSalvar}>
                {processandoCompartilhado ? (
                  <FontAwesome name="hourglass-half" size={14} color="#FFFFFF" />
                ) : (
                  <Text style={styles.somaBotaoSalvarTexto}>Sim, guardar</Text>
                )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!confirmacaoDocumento}
        animationType="slide"
        transparent
        onRequestClose={() => setConfirmacaoDocumento(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Documento lido</Text>
              <TouchableOpacity
                onPress={() => setConfirmacaoDocumento(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            {confirmacaoDocumento && (
              <ScrollView style={{ maxHeight: 420 }}>
                <Image source={{ uri: confirmacaoDocumento.imagemUri }} style={styles.docImagemGrande} />
                <Text style={styles.modalTituloCompromisso}>{confirmacaoDocumento.tipoDocumento}</Text>
                {!!confirmacaoDocumento.remetente && (
                  <Text style={styles.linhaSub}>{confirmacaoDocumento.remetente}</Text>
                )}
                <Text style={[styles.linhaSub, { marginTop: 8, lineHeight: 19 }]}>
                  {confirmacaoDocumento.resumo}
                </Text>
                <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
                  {!!confirmacaoDocumento.valor && (
                    <Text style={styles.docCampoDestaque}>R$ {confirmacaoDocumento.valor}</Text>
                  )}
                  {!!confirmacaoDocumento.vencimento && (
                    <Text style={styles.docCampoDestaque}>
                      Vence {confirmacaoDocumento.vencimento.split('-').reverse().join('/')}
                    </Text>
                  )}
                </View>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalBotaoOuvir} activeOpacity={0.8} onPress={confirmarDocumento}>
              <FontAwesome name="check" size={14} color="#FFFFFF" />
              <Text style={styles.modalBotaoOuvirTexto}>Guardar documento</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!perguntaLembrete}
        animationType="slide"
        transparent
        onRequestClose={() => setPerguntaLembrete(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Quer um lembrete?</Text>
              <TouchableOpacity
                onPress={() => setPerguntaLembrete(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalData}>
              Documento guardado. Quer que eu marque um lembrete na agenda pra ele?
            </Text>

            {perguntaLembrete?.vencimento && (
              <TouchableOpacity
                style={styles.lembreteOpcaoDestaque}
                activeOpacity={0.8}
                onPress={() => criarLembreteDoDocumento(perguntaLembrete.vencimento)}
              >
                <FontAwesome name="calendar-check-o" size={14} color="#FFFFFF" />
                <Text style={styles.lembreteOpcaoDestaqueTexto}>
                  No vencimento — {perguntaLembrete.vencimento.split('-').reverse().join('/')}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.lembreteSubtitulo}>ou escolha outra data</Text>
            <View style={styles.lembreteChips}>
              <TouchableOpacity style={styles.lembreteChip} onPress={() => criarLembreteDoDocumento(dataDaquiA(1))}>
                <Text style={styles.lembreteChipTexto}>Amanhã</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.lembreteChip} onPress={() => criarLembreteDoDocumento(dataDaquiA(7))}>
                <Text style={styles.lembreteChipTexto}>Em 7 dias</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.lembreteChip} onPress={() => criarLembreteDoDocumento(dataDaquiA(15))}>
                <Text style={styles.lembreteChipTexto}>Em 15 dias</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.lembreteChip} onPress={() => criarLembreteDoDocumento(dataDaquiA(30))}>
                <Text style={styles.lembreteChipTexto}>Em 30 dias</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.lembreteSubtitulo}>ou digite uma data</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TextInput
                style={styles.lembreteInput}
                value={dataLembreteDigitada}
                onChangeText={setDataLembreteDigitada}
                placeholder="DD/MM ou DD/MM/AAAA"
                placeholderTextColor={COR.tintaSuave}
                keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity
                style={styles.lembreteBotaoUsar}
                onPress={() => {
                  const dataISO = interpretarDataDigitada(dataLembreteDigitada);
                  if (!dataISO) {
                    Alert.alert('Data inválida', 'Digita no formato DD/MM ou DD/MM/AAAA.');
                    return;
                  }
                  criarLembreteDoDocumento(dataISO);
                }}
              >
                <Text style={styles.lembreteBotaoUsarTexto}>Usar</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setPerguntaLembrete(null)} style={{ marginTop: 16 }}>
              <Text style={[styles.verMais, { textDecorationLine: 'underline' }]}>Agora não, obrigado</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!documentoAberto}
        animationType="fade"
        transparent
        onRequestClose={() => setDocumentoAberto(null)}
      >
        <TouchableOpacity
          style={styles.modalVisualizadorFundo}
          activeOpacity={1}
          onPress={() => setDocumentoAberto(null)}
        >
          {documentoAberto && (
            <Image source={{ uri: documentoAberto.imagemUri }} style={styles.docImagemTelaCheia} resizeMode="contain" />
          )}
          <TouchableOpacity
            style={styles.modalVisualizadorFechar}
            onPress={() => setDocumentoAberto(null)}
          >
            <FontAwesome name="times" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={modalDocumentosAberto}
        animationType="slide"
        onRequestClose={() => setModalDocumentosAberto(false)}
      >
        <LinearGradient colors={['#E9E9E6', '#DCE3EC']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
          <View style={styles.telaDocumentosTopo}>
            <TouchableOpacity
              onPress={() => setModalDocumentosAberto(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FontAwesome name="chevron-left" size={20} color={COR.tinta} />
            </TouchableOpacity>
            <Text style={styles.telaDocumentosTitulo}>Documentos</Text>
            <TouchableOpacity
              onPress={abrirEscolhaDeFoto}
              disabled={processandoDocumento}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FontAwesome
                name={processandoDocumento ? 'hourglass-half' : 'plus'}
                size={20}
                color={COR.dourado}
              />
            </TouchableOpacity>
          </View>

          <View style={[styles.buscaDocumentoLinha, { marginHorizontal: 20, marginTop: 4 }]}>
            <FontAwesome name="search" size={13} color={COR.tintaSuave} />
            <TextInput
              style={styles.buscaDocumentoInput}
              value={buscaDocumento}
              onChangeText={setBuscaDocumento}
              placeholder="Buscar por nome (fale ou digite)"
              placeholderTextColor={COR.tintaSuave}
            />
            {buscaDocumento.length > 0 && (
              <TouchableOpacity onPress={() => setBuscaDocumento('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <FontAwesome name="times-circle" size={14} color={COR.tintaSuave} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPressIn={() => { if (!ouvindo) alternarEscuta(); }}
              onPressOut={() => { if (ouvindo) alternarEscuta(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 4 }}
            >
              <FontAwesome
                name={ouvindo ? 'stop' : 'microphone'}
                size={16}
                color={ouvindo ? COR.ferrugem : COR.dourado}
              />
            </TouchableOpacity>
          </View>
          {ouvindo && (
            <Text style={{ color: COR.dourado, fontSize: 11.5, marginHorizontal: 24, marginTop: 6 }}>
              Ouvindo — fale o que você procura...
            </Text>
          )}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 100 }}>
            {processandoDocumento && (
              <Text style={styles.vazio}>Lendo o documento, um instante...</Text>
            )}
            {documentos.length === 0 ? (
              <Text style={styles.vazio}>Toca no "+" pra fotografar ou escolher uma fatura, boleto ou nota.</Text>
            ) : buscaDocumento.trim() ? (
              documentosFiltrados.length === 0 ? (
                <Text style={styles.vazio}>Nenhum documento encontrado com "{buscaDocumento.trim()}".</Text>
              ) : (
                documentosFiltrados.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.linha}
                    activeOpacity={0.7}
                    onPress={() => setDocumentoAberto(d)}
                  >
                    <Image source={{ uri: d.imagemUri }} style={styles.docMiniatura} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaTitulo} numberOfLines={1}>{d.tipoDocumento}</Text>
                      <Text style={styles.linhaSub} numberOfLines={1}>
                        {d.valor ? `R$ ${d.valor}` : ''}
                        {d.valor && d.vencimento ? ' · ' : ''}
                        {d.vencimento ? `vence ${d.vencimento.split('-').reverse().join('/')}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => excluirDocumento(d.id)}
                      style={styles.linhaExcluir}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )
            ) : (
              documentosPorMes.map((grupo, idx) => {
                const aberto = !!mesesAbertos[grupo.chave];
                return (
                  <View key={grupo.chave} style={styles.pastaMes}>
                    <TouchableOpacity
                      style={styles.pastaMesTopo}
                      activeOpacity={0.7}
                      onPress={() => alternarMes(grupo.chave)}
                    >
                      <FontAwesome name="folder" size={13} color={COR.dourado} />
                      <Text style={[styles.pastaMesTitulo, !aberto && { color: '#0A2C56' }]}>{grupo.titulo}</Text>
                      <Text style={styles.pastaMesContagem}>
                        {grupo.documentos.length} documento{grupo.documentos.length > 1 ? 's' : ''}
                      </Text>
                      <FontAwesome
                        name={aberto ? 'chevron-up' : 'chevron-down'}
                        size={12}
                        color={COR.tintaSuave}
                      />
                    </TouchableOpacity>
                    {aberto &&
                      grupo.documentos.map((d) => (
                        <TouchableOpacity
                          key={d.id}
                          style={styles.linha}
                          activeOpacity={0.7}
                          onPress={() => setDocumentoAberto(d)}
                        >
                          <Image source={{ uri: d.imagemUri }} style={styles.docMiniatura} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.linhaTitulo} numberOfLines={1}>{d.tipoDocumento}</Text>
                            <Text style={styles.linhaSub} numberOfLines={1}>
                              {d.valor ? `R$ ${d.valor}` : ''}
                              {d.valor && d.vencimento ? ' · ' : ''}
                              {d.vencimento ? `vence ${d.vencimento.split('-').reverse().join('/')}` : ''}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => excluirDocumento(d.id)}
                            style={styles.linhaExcluir}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.barraInferior}>
            {(pensando || ouvindo || mostrarStatus) && (
              <View style={styles.statusPill}>
                <Text numberOfLines={2} style={styles.statusPillTexto}>
                  {pensando
                    ? `${NOME_ASSISTENTE} está processando...`
                    : ouvindo
                    ? 'Ouvindo — pode falar'
                    : status}
                </Text>
              </View>
            )}
            <View style={styles.barraInferiorIcones}>
              <TouchableOpacity
                onPress={() => setModalDocumentosAberto(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="home" size={19} color={COR.tintaSuave} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setModalDocumentosAberto(false);
                  abrirCompromissosDoMes();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="calendar" size={19} color={COR.tintaSuave} />
              </TouchableOpacity>
              <View style={{ width: 46 }} />
              <FontAwesome name="file-text-o" size={19} color={COR.dourado} />
              <TouchableOpacity
                onPress={() => {
                  setModalDocumentosAberto(false);
                  abrirConfiguracoes();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="user-o" size={19} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.micBtnFlutuante}
              activeOpacity={0.8}
              onPressIn={() => { if (!ouvindo) alternarEscuta(); }}
              onPressOut={() => { if (ouvindo) alternarEscuta(); }}
            >
              <LinearGradient
                colors={ouvindo ? [COR.ferrugem, COR.ferrugem] : ['#164A87', '#0A2C56']}
                style={styles.micBtnFlutuanteMiolo}
              >
                {ouvindo ? (
                  <FontAwesome name="stop" size={22} color="#FFFFFF" />
                ) : (
                  <Image source={LOGO_EVIE} style={styles.micBtnFlutuanteLogo} resizeMode="contain" />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={modalLembretesAberto}
        animationType="slide"
        onRequestClose={() => setModalLembretesAberto(false)}
      >
        <LinearGradient colors={['#E9E9E6', '#DCE3EC']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
          <View style={styles.telaDocumentosTopo}>
            <TouchableOpacity
              onPress={() => setModalLembretesAberto(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FontAwesome name="chevron-left" size={20} color={COR.tinta} />
            </TouchableOpacity>
            <Text style={styles.telaDocumentosTitulo}>Lembretes</Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }}>
            {lembretes.length === 0 ? (
              <Text style={styles.vazio}>Nada pendente por aqui.</Text>
            ) : (
              lembretes.map((e) => (
                <View key={e.id} style={styles.linha}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                    onPress={() => toggleLembrete(e.id)}
                  >
                    <View style={[styles.checkbox, e.concluido && styles.checkboxOn]}>
                      {e.concluido && <FontAwesome name="check" size={11} color="#FFFFFF" />}
                    </View>
                    <Text
                      style={[
                        styles.linhaTitulo,
                        e.concluido && { textDecorationLine: 'line-through', color: COR.tintaSuave },
                      ]}
                    >
                      {e.lembrete.texto}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removerEntrada(e.id)}
                    style={styles.linhaExcluir}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={modalRascunhosAberto}
        animationType="slide"
        onRequestClose={() => setModalRascunhosAberto(false)}
      >
        <LinearGradient colors={['#E9E9E6', '#DCE3EC']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
          <View style={styles.telaDocumentosTopo}>
            <TouchableOpacity
              onPress={() => setModalRascunhosAberto(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <FontAwesome name="chevron-left" size={20} color={COR.tinta} />
            </TouchableOpacity>
            <Text style={styles.telaDocumentosTitulo}>Rascunhos de email</Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }}>
            {emails.length === 0 ? (
              <Text style={styles.vazio}>Nenhum rascunho ainda.</Text>
            ) : (
              emails.map((e) => (
                <View key={e.id} style={styles.linha}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaTitulo}>{e.email.assunto}</Text>
                    <Text style={styles.linhaSub} numberOfLines={1}>
                      {e.email.destinatario || 'sem destinatário definido'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.botaoPill} onPress={() => handleAbrirEmail(e.email)}>
                    <Text style={styles.botaoPillTexto}>Abrir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removerEntrada(e.id)}
                    style={styles.linhaExcluir}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={!!lugaresEncontrados}
        animationType="slide"
        transparent
        onRequestClose={() => setLugaresEncontrados(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>"{lugaresEncontrados?.termo}" perto de você</Text>
              <TouchableOpacity
                onPress={() => setLugaresEncontrados(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {(lugaresEncontrados?.lista || []).map((lugar) => (
                <View key={lugar.id} style={styles.lugarLinha}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaTitulo} numberOfLines={1}>{lugar.nome}</Text>
                    <Text style={styles.linhaSub} numberOfLines={1}>
                      {lugar.distanciaKm != null ? `${lugar.distanciaKm} km` : ''}
                      {lugar.nota ? ` · ${lugar.nota} ★` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.lugarBotaoRota}
                    onPress={() => abrirRotaNoMaps(lugar.lat, lugar.lng, lugar.nome)}
                  >
                    <FontAwesome name="location-arrow" size={13} color="#FFFFFF" />
                    <Text style={styles.lugarBotaoRotaTexto}>Rota</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!contatosEncontrados}
        animationType="slide"
        transparent
        onRequestClose={() => setContatosEncontrados(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Quem é "{contatosEncontrados?.termo}"?</Text>
              <TouchableOpacity
                onPress={() => setContatosEncontrados(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            {contatosEncontrados?.acao === 'whatsapp' && contatosEncontrados?.mensagem && (
              <View style={styles.whatsappPreview}>
                <Text style={styles.whatsappPreviewLabel}>Rascunho da mensagem:</Text>
                <Text style={styles.whatsappPreviewTexto}>{contatosEncontrados.mensagem}</Text>
              </View>
            )}

            <ScrollView style={{ maxHeight: 420 }}>
              {(contatosEncontrados?.lista || []).map((contato) => (
                <TouchableOpacity
                  key={contato.id}
                  style={styles.lugarLinha}
                  onPress={() => {
                    const acao = contatosEncontrados.acao;
                    const mensagem = contatosEncontrados.mensagem;
                    setContatosEncontrados(null);
                    if (acao === 'whatsapp') {
                      abrirWhatsapp(contato.numero, mensagem);
                    } else {
                      abrirDiscador(contato.numero);
                    }
                  }}
                >
                  <View style={styles.statsIconeBox}>
                    <FontAwesome name="user" size={13} color={COR.dourado} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.linhaTitulo} numberOfLines={1}>{contato.nome}</Text>
                    <Text style={styles.linhaSub} numberOfLines={1}>{contato.numero}</Text>
                  </View>
                  <FontAwesome
                    name={contatosEncontrados?.acao === 'whatsapp' ? 'whatsapp' : 'phone'}
                    size={16}
                    color={contatosEncontrados?.acao === 'whatsapp' ? COR.salvia : COR.dourado}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!postsGerados}
        animationType="slide"
        transparent
        onRequestClose={() => setPostsGerados(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Ideias de post</Text>
              <TouchableOpacity
                onPress={() => setPostsGerados(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            <Text style={styles.lembreteSubtitulo}>Sobre "{postsGerados?.tema}"</Text>

            <ScrollView style={{ maxHeight: 460, marginTop: 10 }}>
              {(postsGerados?.opcoes || []).map((texto, i) => (
                <View key={i} style={styles.postOpcaoCartao}>
                  <Text style={styles.postOpcaoTexto}>{texto}</Text>
                  <TouchableOpacity
                    style={styles.postOpcaoBotaoCopiar}
                    onPress={async () => {
                      await Clipboard.setStringAsync(texto);
                      mostrar('Copiado! Já pode colar no Instagram ou LinkedIn.');
                    }}
                  >
                    <FontAwesome name="copy" size={13} color={COR.navy} />
                    <Text style={styles.postOpcaoBotaoCopiarTexto}>Copiar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalSomaAberto}
        animationType="slide"
        onRequestClose={descartarSomaAtual}
      >
        <LinearGradient colors={['#E9E9E6', '#DCE3EC']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
          <View style={styles.telaDocumentosTopo}>
            <TouchableOpacity onPress={descartarSomaAtual} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <FontAwesome name="chevron-left" size={20} color={COR.tinta} />
            </TouchableOpacity>
            <Text style={styles.telaDocumentosTitulo}>Somar notas/faturas</Text>
            <View style={{ width: 20 }} />
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
          >
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20 + MARGEM_INFERIOR_SEGURA }}>
            <TouchableOpacity style={styles.somaAdicionarBtn} onPress={abrirEscolhaFotoSoma}>
              <FontAwesome name="camera" size={16} color={COR.dourado} />
              <Text style={styles.somaAdicionarBtnTexto}>Adicionar nota/fatura</Text>
            </TouchableOpacity>

            {arquivosSoma.length === 0 ? (
              <Text style={[styles.vazio, { marginTop: 16 }]}>Nenhum arquivo adicionado ainda.</Text>
            ) : (
              arquivosSoma.map((a) => (
                <View key={a.chave} style={styles.linha}>
                  {a.ehPdf ? (
                    <View style={[styles.docMiniatura, styles.pdfMiniaturaBox]}>
                      <FontAwesome name="file-pdf-o" size={20} color={COR.ferrugem} />
                    </View>
                  ) : (
                    <Image source={{ uri: a.uri }} style={styles.docMiniatura} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaTitulo} numberOfLines={1}>
                      {a.processando ? 'Lendo...' : a.tipoDocumento}
                    </Text>
                    <Text style={styles.linhaSub}>
                      {a.processando ? '' : `R$ ${a.valor}`}
                    </Text>
                  </View>
                  {a.processando ? (
                    <FontAwesome name="hourglass-half" size={16} color={COR.tintaSuave} />
                  ) : (
                    <TouchableOpacity
                      onPress={() => removerArquivoSoma(a.chave)}
                      style={styles.linhaExcluir}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {arquivosSoma.length > 0 && (
              <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaTotalCartao}>
                <Text style={styles.somaTotalLabel}>TOTAL</Text>
                <Text style={styles.somaTotalValor}>R$ {totalSomaAtual.toFixed(2).replace('.', ',')}</Text>
              </LinearGradient>
            )}

            <Text style={[styles.configLabel, { marginTop: 20 }]}>Nome da pasta pra guardar</Text>
            <TextInput
              style={styles.configInput}
              value={nomePastaSoma}
              onChangeText={setNomePastaSoma}
              placeholder="Ex: Notas fiscais de Agosto"
              placeholderTextColor={COR.tintaSuave}
            />
            {nomesPastaSugeridos.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {nomesPastaSugeridos.map((nome) => (
                  <TouchableOpacity key={nome} style={styles.somaChipSugestao} onPress={() => setNomePastaSoma(nome)}>
                    <Text style={styles.somaChipSugestaoTexto}>{nome}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
              <TouchableOpacity style={styles.somaBotaoDescartar} onPress={descartarSomaAtual}>
                <Text style={styles.somaBotaoDescartarTexto}>Descartar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} onPress={salvarSomaAtual}>
                <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaBotaoSalvar}>
                  <Text style={styles.somaBotaoSalvarTexto}>Salvar</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={!!somaAbertaDetalhe}
        animationType="slide"
        transparent
        onRequestClose={() => setSomaAbertaDetalhe(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>{somaAbertaDetalhe?.pasta}</Text>
              <TouchableOpacity
                onPress={() => setSomaAbertaDetalhe(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {(somaAbertaDetalhe?.arquivos || []).map((a, i) => (
                <View key={i} style={styles.linha}>
                  {a.ehPdf ? (
                    <View style={[styles.docMiniatura, styles.pdfMiniaturaBox]}>
                      <FontAwesome name="file-pdf-o" size={20} color={COR.ferrugem} />
                    </View>
                  ) : (
                    <Image source={{ uri: a.uri }} style={styles.docMiniatura} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaTitulo} numberOfLines={1}>{a.tipoDocumento}</Text>
                    <Text style={styles.linhaSub}>R$ {a.valor}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removerArquivoDeSomaSalva(i)}
                    style={styles.linhaExcluir}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaTotalCartao}>
              <Text style={styles.somaTotalLabel}>TOTAL</Text>
              <Text style={styles.somaTotalValor}>
                R$ {(somaAbertaDetalhe?.total || 0).toFixed(2).replace('.', ',')}
              </Text>
            </LinearGradient>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.somaBotaoDescartar}
                onPress={() => somaAbertaDetalhe && excluirSomaGuardada(somaAbertaDetalhe.id)}
              >
                <Text style={styles.somaBotaoDescartarTexto}>Excluir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                disabled={processandoAdicaoNaSoma}
                onPress={adicionarArquivoNaSomaAberta}
              >
                <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaBotaoSalvar}>
                {processandoAdicaoNaSoma ? (
                  <FontAwesome name="hourglass-half" size={14} color="#FFFFFF" />
                ) : (
                  <Text style={styles.somaBotaoSalvarTexto}>Adicionar</Text>
                )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalSinteseAberto}
        animationType="slide"
        onRequestClose={descartarSintese}
      >
        <LinearGradient colors={['#E9E9E6', '#DCE3EC']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
          <View style={styles.telaDocumentosTopo}>
            <TouchableOpacity onPress={descartarSintese} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <FontAwesome name="chevron-left" size={20} color={COR.tinta} />
            </TouchableOpacity>
            <Text style={styles.telaDocumentosTitulo}>Sintetizar documento</Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20 + MARGEM_INFERIOR_SEGURA }}>
            {!sinteseResultado ? (
              <>
                <TouchableOpacity style={styles.somaAdicionarBtn} onPress={abrirEscolhaFotoSintese}>
                  <FontAwesome name="camera" size={16} color={COR.dourado} />
                  <Text style={styles.somaAdicionarBtnTexto}>Adicionar página</Text>
                </TouchableOpacity>

                {paginasSintese.length === 0 ? (
                  <Text style={[styles.vazio, { marginTop: 16 }]}>
                    Adicione uma ou mais páginas do documento (contrato, relatório, artigo).
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                    {paginasSintese.map((p) => (
                      <View key={p.chave} style={{ position: 'relative' }}>
                        {p.ehPdf ? (
                          <View style={[styles.docMiniaturaGrande, styles.pdfMiniaturaBox]}>
                            <FontAwesome name="file-pdf-o" size={28} color={COR.ferrugem} />
                          </View>
                        ) : (
                          <Image source={{ uri: p.uri }} style={styles.docMiniaturaGrande} />
                        )}
                        <TouchableOpacity
                          style={styles.sintesePaginaExcluir}
                          onPress={() => removerPaginaSintese(p.chave)}
                        >
                          <FontAwesome name="times" size={11} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {paginasSintese.length > 0 && (
                  <TouchableOpacity
                    style={{ marginTop: 20 }}
                    onPress={gerarSintese}
                    disabled={processandoSintese}
                  >
                    <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaBotaoSalvar}>
                    {processandoSintese ? (
                      <FontAwesome name="hourglass-half" size={14} color="#FFFFFF" />
                    ) : (
                      <Text style={styles.somaBotaoSalvarTexto}>Sintetizar {paginasSintese.length} página{paginasSintese.length > 1 ? 's' : ''}</Text>
                    )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <View style={styles.sinteseResultadoTopo}>
                  <Text style={styles.sinteseTipoTag}>{sinteseResultado.tipoDocumento}</Text>
                  <Text style={styles.sinteseTitulo}>{sinteseResultado.titulo}</Text>
                </View>
                <Text style={styles.sinteseResumo}>{sinteseResultado.resumo}</Text>

                <Text style={[styles.configLabel, { marginTop: 16 }]}>Pontos principais</Text>
                {(sinteseResultado.pontosPrincipais || []).map((ponto, i) => (
                  <View key={i} style={styles.sintesePontoLinha}>
                    <View style={styles.sintesePontoBolinha} />
                    <Text style={styles.sintesePontoTexto}>{ponto}</Text>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.postOpcaoBotaoCopiar, { marginTop: 16 }]}
                  onPress={() => copiarTextoSintese(sinteseResultado)}
                >
                  <FontAwesome name="copy" size={13} color={COR.navy} />
                  <Text style={styles.postOpcaoBotaoCopiarTexto}>Copiar</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity style={styles.somaBotaoDescartar} onPress={descartarSintese}>
                    <Text style={styles.somaBotaoDescartarTexto}>Descartar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={salvarSinteseAtual}>
                    <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaBotaoSalvar}>
                      <Text style={styles.somaBotaoSalvarTexto}>Salvar</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
        </LinearGradient>
      </Modal>

      <Modal
        visible={!!sinteseAbertaDetalhe}
        animationType="slide"
        transparent
        onRequestClose={() => setSinteseAbertaDetalhe(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo} numberOfLines={1}>{sinteseAbertaDetalhe?.titulo}</Text>
              <TouchableOpacity
                onPress={() => setSinteseAbertaDetalhe(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.sinteseTipoTag}>{sinteseAbertaDetalhe?.tipoDocumento}</Text>
              <Text style={styles.sinteseResumo}>{sinteseAbertaDetalhe?.resumo}</Text>

              <Text style={[styles.configLabel, { marginTop: 14 }]}>Pontos principais</Text>
              {(sinteseAbertaDetalhe?.pontosPrincipais || []).map((ponto, i) => (
                <View key={i} style={styles.sintesePontoLinha}>
                  <View style={styles.sintesePontoBolinha} />
                  <Text style={styles.sintesePontoTexto}>{ponto}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.somaBotaoDescartar}
                onPress={() => sinteseAbertaDetalhe && excluirSinteseGuardada(sinteseAbertaDetalhe.id)}
              >
                <FontAwesome name="trash-o" size={14} color={COR.tintaSuave} />
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => copiarTextoSintese(sinteseAbertaDetalhe)}
              >
                <LinearGradient
                  colors={['#164A87', '#0A2C56']}
                  style={[styles.somaBotaoSalvar, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                >
                  <FontAwesome name="copy" size={13} color="#FFFFFF" />
                  <Text style={styles.somaBotaoSalvarTexto}>Copiar</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!perguntaCategoria}
        animationType="slide"
        transparent
        onRequestClose={() => setPerguntaCategoria(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Pessoal ou profissional?</Text>
              <TouchableOpacity
                onPress={() => setPerguntaCategoria(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            <Text style={styles.lembreteSubtitulo}>
              {perguntaCategoria?.titulo || 'Esse compromisso'} — diga "pessoal" ou "profissional".
            </Text>

            <TouchableOpacity
              style={[styles.perguntaCategoriaMic, ouvindo && styles.micBtnAtivo]}
              activeOpacity={0.8}
              onPressIn={() => { if (!ouvindo) alternarEscuta(); }}
              onPressOut={() => { if (ouvindo) alternarEscuta(); }}
            >
              <FontAwesome name={ouvindo ? 'stop' : 'microphone'} size={26} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.perguntaCategoriaDica}>
              {ouvindo ? 'Ouvindo...' : 'Segure o microfone e fale'}
            </Text>

            <View style={styles.perguntaCategoriaSeparador}>
              <View style={styles.perguntaCategoriaLinha} />
              <Text style={styles.perguntaCategoriaOu}>ou toque</Text>
              <View style={styles.perguntaCategoriaLinha} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.configOpcao, { flex: 1 }]}
                activeOpacity={0.8}
                onPress={() => {
                  const agenda = perguntaCategoria;
                  setPerguntaCategoria(null);
                  if (agenda) criarCompromissoComCategoria(agenda, 'pessoal', agenda._respostaFaladaOriginal);
                }}
              >
                <FontAwesome name="home" size={14} color={COR.dourado} />
                <Text style={styles.configOpcaoTexto} numberOfLines={1} adjustsFontSizeToFit>Pessoal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.configOpcao, { flex: 1 }]}
                activeOpacity={0.8}
                onPress={() => {
                  const agenda = perguntaCategoria;
                  setPerguntaCategoria(null);
                  if (agenda) criarCompromissoComCategoria(agenda, 'profissional', agenda._respostaFaladaOriginal);
                }}
              >
                <FontAwesome name="briefcase" size={14} color={COR.dourado} />
                <Text style={styles.configOpcaoTexto} numberOfLines={1} adjustsFontSizeToFit>Profissional</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!perguntaHorarioLembrete}
        animationType="slide"
        transparent
        onRequestClose={() => setPerguntaHorarioLembrete(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>A que horas te aviso?</Text>
              <TouchableOpacity
                onPress={() => setPerguntaHorarioLembrete(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>
            <Text style={styles.lembreteSubtitulo}>
              {perguntaHorarioLembrete?.texto || 'Esse lembrete'} — diga ou digite um horário.
            </Text>

            <TouchableOpacity
              style={[styles.perguntaCategoriaMic, ouvindo && styles.micBtnAtivo]}
              activeOpacity={0.8}
              onPressIn={() => { if (!ouvindo) alternarEscuta(); }}
              onPressOut={() => { if (ouvindo) alternarEscuta(); }}
            >
              <FontAwesome name={ouvindo ? 'stop' : 'microphone'} size={26} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.perguntaCategoriaDica}>
              {ouvindo ? 'Ouvindo...' : 'Segure o microfone e fale'}
            </Text>

            <View style={styles.perguntaCategoriaSeparador}>
              <View style={styles.perguntaCategoriaLinha} />
              <Text style={styles.perguntaCategoriaOu}>ou digite (HH:MM)</Text>
              <View style={styles.perguntaCategoriaLinha} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                style={[styles.configInput, { flex: 1 }]}
                value={horarioDigitado}
                onChangeText={setHorarioDigitado}
                placeholder="Ex: 21:30"
                placeholderTextColor={COR.tintaSuave}
                keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => {
                  const horaEntendida = parseHorarioFalado(horarioDigitado);
                  if (!horaEntendida) {
                    Alert.alert('Horário inválido', 'Digite no formato HH:MM, tipo 21:30.');
                    return;
                  }
                  const lembretePendente = perguntaHorarioLembrete;
                  setPerguntaHorarioLembrete(null);
                  setHorarioDigitado('');
                  agendarNotificacaoLembrete(lembretePendente.id, lembretePendente.texto, horaEntendida).catch(() => {});
                  setEntradas((prev) =>
                    prev.map((e) =>
                      e.id === lembretePendente.id ? { ...e, lembrete: { ...e.lembrete, hora: horaEntendida } } : e
                    )
                  );
                  mostrar(`Combinado, vou te avisar às ${horaEntendida}.`);
                  falar(`Combinado, vou te avisar às ${horaEntendida.replace(':', ' e ')}.`);
                }}
              >
                <LinearGradient colors={['#164A87', '#0A2C56']} style={styles.somaBotaoSalvar}>
                  <Text style={styles.somaBotaoSalvarTexto}>OK</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalConfigAberto}
        animationType="slide"
        transparent
        onRequestClose={() => setModalConfigAberto(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View style={styles.modalFundo}>
          <View style={[styles.modalCartao, { maxHeight: '85%' }]}>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: ALTURA_TELA * 0.65 }}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>Configurações</Text>
              <TouchableOpacity
                onPress={() => setModalConfigAberto(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome name="times" size={20} color={COR.tintaSuave} />
              </TouchableOpacity>
            </View>

            <Text style={styles.configLabel}>Seu nome</Text>
            <TextInput
              style={styles.configInput}
              value={nomeEditando}
              onChangeText={setNomeEditando}
              placeholder="Como a Evie deve te chamar"
              placeholderTextColor={COR.tintaSuave}
            />

            <Text style={[styles.configLabel, { marginTop: 18 }]}>Personalidade da Evie</Text>
            {OPCOES_PERSONALIDADE.map((op) => {
              const ativa = personalidadeEditando === op.chave;
              return (
                <TouchableOpacity
                  key={op.chave}
                  style={[styles.configOpcao, ativa && styles.configOpcaoAtiva]}
                  activeOpacity={0.8}
                  onPress={() => setPersonalidadeEditando(op.chave)}
                >
                  <FontAwesome name={op.icone} size={16} color={ativa ? COR.navy : COR.dourado} />
                  <Text style={styles.configOpcaoTexto}>{op.titulo}</Text>
                  {ativa && <FontAwesome name="check-circle" size={18} color={COR.dourado} />}
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.configLabel, { marginTop: 18 }]}>Currículo profissional (opcional)</Text>
            <Text style={styles.lembreteSubtitulo}>
              Não é obrigatório — a Evie funciona normalmente sem ele. Se enviar, ela usa pra dar a pegada certa nos posts de rede social que gerar.
            </Text>
            {perfilProfissional ? (
              <View style={styles.curriculoCartao}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linhaTitulo} numberOfLines={1}>{perfilProfissional.area}</Text>
                  <Text style={styles.linhaSub} numberOfLines={2}>
                    {perfilProfissional.cargoAtual} · {perfilProfissional.habilidadesChave}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={removerCurriculoSalvo}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="trash-o" size={16} color={COR.tintaSuave} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.somaAdicionarBtn}
                onPress={abrirEscolhaFotoCurriculo}
                disabled={processandoCurriculo}
              >
                {processandoCurriculo ? (
                  <FontAwesome name="hourglass-half" size={16} color={COR.dourado} />
                ) : (
                  <>
                    <FontAwesome name="upload" size={15} color={COR.dourado} />
                    <Text style={styles.somaAdicionarBtnTexto}>Enviar foto do currículo</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {perfilProfissional && (
              <TouchableOpacity onPress={abrirEscolhaFotoCurriculo} disabled={processandoCurriculo}>
                <Text style={[styles.verMais, { textAlign: 'left', paddingVertical: 8 }]}>
                  {processandoCurriculo ? 'Lendo...' : 'Trocar currículo'}
                </Text>
              </TouchableOpacity>
            )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalBotaoOuvir, styles.modalConfigBotaoFixo]}
              activeOpacity={0.8}
              onPress={salvarConfiguracoes}
            >
              <Text style={styles.modalBotaoOuvirTexto}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 0,
  },
  headerClaro: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  headerClaroTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  headerClaroPerfil: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatarCirculo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COR.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarLogo: { width: 42, height: 42 },
  headerNomeTexto: { color: '#0B2545', fontSize: 14.5, fontFamily: 'Poppins_700Bold' },
  climaLinha: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: -2 },
  climaTexto: { fontSize: 10.5, fontFamily: 'Poppins_500Medium', color: '#3D4A5C' },
  headerMenuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COR.linha,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoImagem: { width: 20, height: 20 },
  saudacaoClara: { color: '#0B2545', fontSize: 14.5, fontFamily: 'Poppins_700Bold' },
  h1Claro: { color: '#FFFFFF', fontSize: 21, fontFamily: 'Poppins_700Bold', lineHeight: 27 },

  naoEsqueceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COR.navy,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  naoEsqueceTitulo: {
    color: COR.dourado,
    fontSize: 10.5,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1,
    marginBottom: 6,
  },
  naoEsqueceTexto: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 18 },

  heroCardGlowWrap: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 20,
    position: 'relative',
  },
  heroCardHalo: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 24,
    backgroundColor: '#B8C9DC',
  },
  heroCard: {
    borderRadius: 20,
    padding: 18,
  },
  heroOnda: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  heroOndaBarra: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  heroCardTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroStatusPonto: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  heroStatusTexto: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10.5,
    letterSpacing: 1,
    fontFamily: 'Poppins_600SemiBold',
  },
  heroVozTag: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'Poppins_500Medium',
  },
  heroMicBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    padding: 12,
    paddingLeft: 8,
    marginTop: 18,
  },
  heroMicCirculo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMicLogo: { width: 22, height: 22 },
  heroMicTitulo: { color: '#FFFFFF', fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  heroMicSub: { color: 'rgba(255,255,255,0.55)', fontSize: 10.5, marginTop: 2 },

  briefingCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: COR.cartao,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COR.linha,
    borderLeftWidth: 3,
    borderLeftColor: COR.dourado,
  },
  briefingTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  briefingTitulo: { color: COR.tinta, fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  briefingContagem: {
    color: COR.dourado,
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'Poppins_600SemiBold',
  },
  briefingTexto: { color: COR.tintaSuave, fontSize: 12.5, lineHeight: 19 },

  statsGrade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 10,
  },
  statsCartao: {
    width: '47%',
    backgroundColor: COR.cartao,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COR.linha,
  },
  statsTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statsIconeBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COR.douradoSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContagem: { color: COR.tintaSuave, fontSize: 12, fontFamily: 'Poppins_500Medium' },
  statsTitulo: { color: COR.tinta, fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginBottom: 3 },
  statsSub: { color: COR.tintaSuave, fontSize: 11, marginBottom: 8 },
  statsExpandir: {
    color: COR.dourado,
    fontSize: 9.5,
    letterSpacing: 0.5,
    fontFamily: 'Poppins_600SemiBold',
  },

  atalhos: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 10,
  },
  atalhoBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  atalhoIconeBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A2C56',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  atalhoLabel: { fontSize: 9.5, color: COR.tintaSuave, fontFamily: 'Poppins_400Regular' },

  resumoCard: {
    marginHorizontal: 20,
    backgroundColor: COR.cartao,
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    borderTopWidth: 3,
    borderTopColor: COR.dourado,
    shadowColor: COR.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  resumoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  resumoEyebrow: { color: COR.dourado, fontSize: 10.5, letterSpacing: 1.3, fontFamily: 'Poppins_700Bold' },
  resumoData: { color: COR.tintaSuave, fontSize: 11, fontFamily: 'Poppins_400Regular' },
  resumoTexto: {
    color: COR.tinta,
    fontSize: 16.5,
    lineHeight: 24,
    fontFamily: 'Poppins_600SemiBold',
  },
  resumoAssinatura: {
    color: COR.tintaSuave,
    fontSize: 11.5,
    marginTop: 14,
    fontStyle: 'italic',
  },

  mesa: {
    marginHorizontal: 20,
    backgroundColor: COR.cartao,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: COR.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  mesaHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  selo: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mesaTitulo: {
    fontSize: 14.5,
    color: COR.tinta,
    flex: 1,
    fontFamily: 'Poppins_600SemiBold',
  },
  atualizarBtn: { padding: 4 },
  vazio: { color: COR.tintaSuave, fontSize: 13, paddingVertical: 6, lineHeight: 19 },
  verMais: {
    color: COR.dourado,
    fontSize: 12.5,
    fontFamily: 'Poppins_500Medium',
    paddingVertical: 10,
    textAlign: 'center',
  },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: COR.linha,
  },
  linhaHora: { color: COR.dourado, fontSize: 11.5, fontFamily: 'Poppins_700Bold', width: 108 },
  linhaTitulo: { color: COR.tinta, fontSize: 14.5, fontFamily: 'Poppins_500Medium' },
  linhaSub: { color: COR.tintaSuave, fontSize: 12.5, marginTop: 2 },
  linhaExcluir: { padding: 4 },

  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COR.linha,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: COR.salvia, borderColor: COR.salvia },

  botaoPill: {
    backgroundColor: COR.douradoSuave,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
  },
  botaoPillTexto: { color: COR.dourado, fontSize: 12, fontFamily: 'Poppins_700Bold' },
  resultadoNumero: { color: COR.tinta, fontSize: 15.5, fontFamily: 'Poppins_600SemiBold' },

  barraInferior: {
    backgroundColor: COR.cartao,
    paddingBottom: MARGEM_INFERIOR_SEGURA,
    borderTopWidth: 1,
    borderTopColor: COR.linha,
    position: 'relative',
    shadowColor: COR.navy,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  statusPill: {
    position: 'absolute',
    top: -70,
    left: 20,
    right: 20,
    backgroundColor: COR.navy,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  statusPillTexto: { color: '#FFFFFF', fontSize: 12, textAlign: 'center' },
  barraInferiorIcones: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 14,
  },
  micBtnFlutuante: {
    position: 'absolute',
    top: -32,
    left: '50%',
    marginLeft: -33,
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 4,
    borderColor: COR.papel,
    shadowColor: '#0B2545',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  micBtnFlutuanteMiolo: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnAtivo: { backgroundColor: COR.ferrugem },
  micBtnFlutuanteLogo: { width: 38, height: 38 },
  micBtnFlutuanteLabel: {
    position: 'absolute',
    top: 36,
    left: '50%',
    marginLeft: -22,
    width: 44,
    textAlign: 'center',
    color: COR.dourado,
    fontSize: 9.5,
    fontFamily: 'Poppins_600SemiBold',
  },
  barraInferiorItem: { alignItems: 'center', gap: 3 },
  barraInferiorLabel: { color: COR.tintaSuave, fontSize: 9.5, fontFamily: 'Poppins_500Medium' },

  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCartao: {
    backgroundColor: COR.cartao,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: COR.linha,
    borderBottomWidth: 0,
    padding: 22,
    paddingBottom: 22 + MARGEM_INFERIOR_SEGURA,
    maxHeight: '80%',
  },
  modalTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitulo: { color: COR.tinta, fontSize: 19, fontFamily: 'Poppins_700Bold' },
  modalData: { color: COR.tintaSuave, fontSize: 12, marginTop: 4, marginBottom: 16 },
  modalLinha: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COR.linha,
  },
  modalHora: { color: COR.dourado, fontSize: 12, fontFamily: 'Poppins_700Bold', width: 62, lineHeight: 17 },
  modalTituloCompromisso: { color: COR.tinta, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  modalBotaoOuvir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COR.dourado,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 18,
  },
  modalBotaoOuvirTexto: { color: '#FFFFFF', fontSize: 13.5, fontFamily: 'Poppins_700Bold' },
  modalConfigBotaoFixo: {
    marginTop: 14,
    marginBottom: 0,
  },

  pastaMes: {
    marginBottom: 4,
  },
  pastaMesTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COR.linha,
  },
  pastaMesTitulo: {
    color: COR.tinta,
    fontSize: 13.5,
    fontFamily: 'Poppins_700Bold',
    flex: 1,
  },
  pastaMesContagem: {
    color: COR.tintaSuave,
    fontSize: 11.5,
  },
  buscaDocumentoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COR.cartao,
    borderWidth: 1,
    borderColor: COR.linha,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  buscaDocumentoInput: {
    flex: 1,
    fontSize: 12,
    color: COR.tinta,
    minHeight: 40,
    paddingVertical: 9,
  },
  docMiniatura: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COR.linha,
  },
  pdfMiniaturaBox: {
    backgroundColor: COR.ferrugemSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docImagemGrande: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    backgroundColor: COR.linha,
    marginBottom: 14,
  },
  docCampoDestaque: {
    color: COR.dourado,
    fontSize: 14,
    fontFamily: 'Poppins_700Bold',
  },
  docImagemTelaCheia: {
    width: '100%',
    height: '80%',
  },
  modalVisualizadorFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalVisualizadorFechar: {
    position: 'absolute',
    top: 50,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  lembreteOpcaoDestaque: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COR.dourado,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 16,
  },
  lembreteOpcaoDestaqueTexto: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Poppins_700Bold' },
  lembreteSubtitulo: {
    color: COR.tintaSuave,
    fontSize: 12,
    marginTop: 18,
    marginBottom: 10,
  },
  lembreteChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lembreteChip: {
    borderWidth: 1,
    borderColor: COR.linha,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  lembreteChipTexto: { color: COR.tinta, fontSize: 12.5, fontFamily: 'Poppins_500Medium' },
  lembreteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COR.linha,
    backgroundColor: COR.cartao,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: COR.tinta,
  },
  lembreteBotaoUsar: {
    backgroundColor: COR.dourado,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  lembreteBotaoUsarTexto: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Poppins_700Bold' },

  configLabel: {
    color: COR.tintaSuave,
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 8,
  },
  configInput: {
    borderWidth: 1,
    borderColor: COR.linha,
    backgroundColor: COR.cartao,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COR.tinta,
    fontFamily: 'Poppins_400Regular',
  },
  configOpcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COR.linha,
    backgroundColor: COR.cartao,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  configOpcaoAtiva: { borderColor: COR.dourado },
  configOpcaoTexto: { flex: 1, color: COR.tinta, fontSize: 13.5, fontFamily: 'Poppins_500Medium' },

  lugarLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COR.linha,
  },
  lugarBotaoRota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COR.dourado,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  lugarBotaoRotaTexto: { color: '#FFFFFF', fontSize: 11.5, fontFamily: 'Poppins_700Bold' },

  whatsappPreview: {
    backgroundColor: COR.salviaSuave,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  whatsappPreviewLabel: { color: COR.salvia, fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },
  whatsappPreviewTexto: { color: COR.tinta, fontSize: 13, lineHeight: 18 },

  postOpcaoCartao: {
    backgroundColor: COR.papel,
    borderWidth: 1,
    borderColor: COR.linha,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  postOpcaoTexto: { color: COR.tinta, fontSize: 13.5, lineHeight: 20, marginBottom: 10 },
  postOpcaoBotaoCopiar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COR.douradoSuave,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  postOpcaoBotaoCopiarTexto: { color: COR.navy, fontSize: 12, fontFamily: 'Poppins_600SemiBold' },

  somaCabecalho: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  somaBotaoNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COR.dourado,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  somaBotaoNovoLargo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    shadowColor: '#0A2C56',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  somaBotaoNovoTexto: { color: '#FFFFFF', fontSize: 11.5, fontFamily: 'Poppins_600SemiBold' },
  somaPastaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COR.linha,
  },
  somaAdicionarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COR.douradoSuave,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  somaAdicionarBtnTexto: { color: COR.navy, fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  somaTotalCartao: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
  },
  somaTotalLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Poppins_600SemiBold', letterSpacing: 1 },
  somaTotalValor: { color: '#FFFFFF', fontSize: 20, fontFamily: 'Poppins_700Bold' },
  somaChipSugestao: {
    backgroundColor: COR.cartao,
    borderWidth: 1,
    borderColor: COR.linha,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  somaChipSugestaoTexto: { color: COR.tintaSuave, fontSize: 11.5, fontFamily: 'Poppins_500Medium' },
  somaBotaoDescartar: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COR.linha,
  },
  somaBotaoDescartarTexto: { color: COR.tintaSuave, fontSize: 13.5, fontFamily: 'Poppins_600SemiBold' },
  somaBotaoSalvar: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 10,
  },
  somaBotaoSalvarTexto: { color: '#FFFFFF', fontSize: 13.5, fontFamily: 'Poppins_700Bold' },

  curriculoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COR.papel,
    borderWidth: 1,
    borderColor: COR.linha,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },

  docMiniaturaGrande: { width: 90, height: 90, borderRadius: 8, backgroundColor: COR.linha },
  sintesePaginaExcluir: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COR.ferrugem,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinteseResultadoTopo: { marginBottom: 10 },
  sinteseTipoTag: {
    color: COR.dourado,
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sinteseTitulo: { color: COR.tinta, fontSize: 17, fontFamily: 'Poppins_700Bold' },
  sinteseResumo: { color: COR.tintaSuave, fontSize: 13, lineHeight: 20, marginTop: 4 },
  sintesePontoLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  sintesePontoBolinha: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COR.dourado,
    marginTop: 6,
  },
  sintesePontoTexto: { flex: 1, color: COR.tinta, fontSize: 13, lineHeight: 19 },

  perguntaCategoriaMic: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COR.navy,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 20,
  },
  perguntaCategoriaDica: {
    textAlign: 'center',
    color: COR.tintaSuave,
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 10,
  },
  perguntaCategoriaSeparador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 18,
  },
  perguntaCategoriaLinha: { flex: 1, height: 1, backgroundColor: COR.linha },
  perguntaCategoriaOu: { color: COR.tintaSuave, fontSize: 11, fontFamily: 'Poppins_400Regular' },

  telaDocumentosTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 14 : 12,
    paddingBottom: 16,
  },
  telaDocumentosTitulo: { color: COR.tinta, fontSize: 18, fontFamily: 'Poppins_700Bold' },
});
