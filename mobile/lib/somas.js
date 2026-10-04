import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  consolidarSomas,
  mesclarSoma,
  contarArquivos,
  somarTotais,
  adicionarNomeMae,
  removerNomeMae,
  removerSubpastasDaMae,
  nomesMaeReferenciados,
  renomearSubpasta,
  renomearMae,
} from './somasEstrutura';

const CHAVE_LISTA = '@evie/somas';
const CHAVE_BACKUP = '@evie/somas_backup_antes_das_subpastas';
const CHAVE_MAES = '@evie/somas_pastas_mae';
const PASTA_SOMAS = FileSystem.documentDirectory + 'somas/';

async function garantirPasta() {
  const info = await FileSystem.getInfoAsync(PASTA_SOMAS);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PASTA_SOMAS, { intermediates: true });
  }
}

// Copia a foto pra pasta permanente do app (mesmo esquema dos documentos).
export async function salvarImagemSomaPermanente(uriTemporaria) {
  await garantirPasta();
  const nomeArquivo = `soma-${Date.now()}-${Math.round(Math.random() * 9999)}.jpg`;
  const destino = PASTA_SOMAS + nomeArquivo;
  await FileSystem.copyAsync({ from: uriTemporaria, to: destino });
  return destino;
}

export async function listarSomas() {
  try {
    const json = await AsyncStorage.getItem(CHAVE_LISTA);
    const bruta = json ? JSON.parse(json) : [];

    // Somas antigas podiam ter vários registros na mesma pasta. Agora cada
    // pasta (ou subpasta) tem um registro só, então junta os repetidos uma
    // vez e guarda. Só grava se nenhum arquivo nem valor se perdeu, e deixa
    // uma cópia da lista original antes de mexer.
    const { lista, mudou } = consolidarSomas(bruta);
    if (mudou) {
      const mesmosArquivos = contarArquivos(lista) === contarArquivos(bruta);
      const mesmoTotal = Math.abs(somarTotais(lista) - somarTotais(bruta)) < 0.005;
      if (mesmosArquivos && mesmoTotal) {
        const jaTemBackup = await AsyncStorage.getItem(CHAVE_BACKUP);
        if (!jaTemBackup) await AsyncStorage.setItem(CHAVE_BACKUP, json);
        await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(lista));
        return lista;
      }
    }
    return bruta;
  } catch (e) {
    console.error('[somas] erro ao listar:', e);
    return [];
  }
}

// Cada soma salva: { id, pasta, pastaMae?, total, arquivos: [{uri, valor, ...}], data }
// `pasta` é a pasta simples ou a subpasta; `pastaMae` só existe quando é
// uma subpasta. Se esse par já existe, os arquivos entram nele.
export async function salvarSoma(soma) {
  const lista = await listarSomas();
  const novaLista = mesclarSoma(lista, soma);
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  if (soma.pastaMae) {
    const registro = await lerRegistroMaes();
    const novo = adicionarNomeMae(registro, soma.pastaMae);
    if (novo !== registro) await gravarRegistroMaes(novo);
  }
  return novaLista;
}

// ---- Pastas mãe ----
// A mãe só agrupa subpastas e existe por conta própria: fica guardada num
// registro à parte (só o nome), então não some quando a última subpasta é
// apagada. Quem apaga uma mãe é a função removerPastaMae, de propósito.

async function lerRegistroMaes() {
  try {
    const json = await AsyncStorage.getItem(CHAVE_MAES);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('[somas] erro ao ler pastas mãe:', e);
    return [];
  }
}

async function gravarRegistroMaes(registro) {
  await AsyncStorage.setItem(CHAVE_MAES, JSON.stringify(registro));
}

// Lista as pastas mãe. Também registra qualquer mãe que já aparecia nas
// somas salvas mas ainda não estava no registro (dados de antes dele
// existir), pra elas passarem a sobreviver sem subpasta.
export async function listarPastasMae() {
  try {
    let registro = await lerRegistroMaes();
    const lista = await listarSomas();
    let mudou = false;
    for (const nome of nomesMaeReferenciados(lista)) {
      const novo = adicionarNomeMae(registro, nome);
      if (novo !== registro) {
        registro = novo;
        mudou = true;
      }
    }
    if (mudou) await gravarRegistroMaes(registro);
    return registro;
  } catch (e) {
    console.error('[somas] erro ao listar pastas mãe:', e);
    return [];
  }
}

export async function criarPastaMae(nome) {
  const registro = await listarPastasMae();
  const novo = adicionarNomeMae(registro, nome);
  if (novo !== registro) await gravarRegistroMaes(novo);
  return novo;
}

// Exclui a pasta mãe junto com todas as subpastas e notas dentro dela.
// Devolve as duas listas já atualizadas.
export async function removerPastaMae(nome) {
  const lista = await listarSomas();
  const registro = await lerRegistroMaes();
  const novaLista = removerSubpastasDaMae(lista, nome);
  const novoRegistro = removerNomeMae(registro, nome);
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  await gravarRegistroMaes(novoRegistro);
  return { somas: novaLista, maes: novoRegistro };
}

export async function removerSoma(id) {
  const lista = await listarSomas();
  const novaLista = lista.filter((s) => s.id !== id);
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}

// Atualiza uma soma já salva (usado pra adicionar mais arquivos nela
// depois, sem precisar criar um registro novo).
export async function atualizarSoma(id, dadosNovos) {
  const lista = await listarSomas();
  const novaLista = lista.map((s) => (s.id === id ? { ...s, ...dadosNovos } : s));
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(novaLista));
  return novaLista;
}

// Lista os nomes de pasta já usados antes (sem repetir), pra sugerir
// reaproveitamento na hora de salvar uma soma nova.
export async function listarNomesDePastaUsados() {
  const lista = await listarSomas();
  const nomes = [...new Set(lista.map((s) => s.pasta).filter(Boolean))];
  return nomes;
}

// Renomeia uma pasta ou subpasta. Devolve { somas } ou { erro }.
export async function renomearSoma(id, novoNome) {
  const lista = await listarSomas();
  const r = renomearSubpasta(lista, id, novoNome);
  if (r.erro) return { erro: r.erro };
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(r.lista));
  return { somas: r.lista };
}

// Renomeia uma pasta mãe, levando as subpastas junto. Devolve
// { somas, maes } ou { erro }.
export async function renomearPastaMae(nomeAntigo, novoNome) {
  const lista = await listarSomas();
  const registro = await listarPastasMae();
  const r = renomearMae(lista, registro, nomeAntigo, novoNome);
  if (r.erro) return { erro: r.erro };
  await AsyncStorage.setItem(CHAVE_LISTA, JSON.stringify(r.lista));
  await gravarRegistroMaes(r.registro);
  return { somas: r.lista, maes: r.registro };
}
