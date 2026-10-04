// Lógica de pastas do Controle financeiro. Fica separada do armazenamento
// (somas.js) de propósito: aqui não tem nada do celular, só conta, então dá
// pra testar isolada.
//
// Modelo: cada registro de soma tem `pasta` (a subpasta, ou a pasta simples)
// e, opcionalmente, `pastaMae`. Sem `pastaMae`, é uma pasta simples, igual
// sempre foi. Com `pastaMae`, é uma subpasta dentro dela. Existe no máximo
// UM registro por par (pastaMae, pasta).
//
// A pasta mãe só agrupa subpastas: ela não guarda nota nenhuma e existe por
// conta própria (um registro à parte, só com o nome). Por isso continua
// existindo mesmo depois de apagar todas as subpastas, e só some quando a
// pessoa manda excluir. Uma subpasta pode ficar sem nota, pelo mesmo motivo.

export function chaveNome(nome) {
  return (nome || '').trim().toLowerCase();
}

function chaveRegistro(soma) {
  return `${chaveNome(soma.pastaMae)}||${chaveNome(soma.pasta)}`;
}

// R$ no padrão brasileiro, com ponto nos milhares: 18450 -> "18.450,00".
export function formatarReais(valor) {
  const n = Number(valor) || 0;
  const [inteiro, decimal] = n.toFixed(2).split('.');
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal}`;
}

export function contarArquivos(lista) {
  return lista.reduce((acc, s) => acc + (s.arquivos || []).length, 0);
}

export function somarTotais(lista) {
  return lista.reduce((acc, s) => acc + (s.total || 0), 0);
}

// Junta registros repetidos do mesmo par (pastaMae, pasta). A lista vem da
// mais nova pra mais antiga, então o primeiro registro de cada par é o que
// fica (mantém id e data) e os arquivos dos mais antigos entram na frente,
// pra pasta ficar em ordem cronológica.
export function consolidarSomas(lista) {
  const porChave = new Map();
  const resultado = [];
  let mudou = false;
  for (const soma of lista) {
    const chave = chaveRegistro(soma);
    const existente = porChave.get(chave);
    if (!existente) {
      const copia = { ...soma, arquivos: [...(soma.arquivos || [])] };
      porChave.set(chave, copia);
      resultado.push(copia);
    } else {
      existente.arquivos = [...(soma.arquivos || []), ...existente.arquivos];
      existente.total = (existente.total || 0) + (soma.total || 0);
      mudou = true;
    }
  }
  return { lista: resultado, mudou };
}

// Guarda uma soma nova. Se o par (pastaMae, pasta) já existe, os arquivos
// entram nele e o total cresce; senão cria o registro. O que foi mexido
// por último vai pro começo da lista.
export function mesclarSoma(lista, nova) {
  const chave = chaveRegistro(nova);
  const indice = lista.findIndex((s) => chaveRegistro(s) === chave);
  if (indice < 0) return [nova, ...lista];
  const existente = lista[indice];
  const mesclada = {
    ...existente,
    arquivos: [...(existente.arquivos || []), ...(nova.arquivos || [])],
    total: (existente.total || 0) + (nova.total || 0),
    data: nova.data,
  };
  return [mesclada, ...lista.filter((_, i) => i !== indice)];
}

// Transforma a lista de registros no que a tela mostra:
//   { tipo: 'simples', nome, soma, notas, total }
//   { tipo: 'mae', nome, subpastas: [{ nome, soma, notas, total }], notas, total }
// O total da pasta mãe é a soma de todas as subpastas.
export function montarEstrutura(lista, nomesMae = []) {
  const itens = [];
  const simplesPorChave = new Map();
  const maesPorChave = new Map();

  lista.forEach((soma) => {
    const nomeMae = (soma.pastaMae || '').trim();
    const notas = (soma.arquivos || []).length;
    const total = soma.total || 0;

    if (!nomeMae) {
      const chave = chaveNome(soma.pasta);
      const existente = simplesPorChave.get(chave);
      if (existente) {
        existente.notas += notas;
        existente.total += total;
        return;
      }
      const item = { tipo: 'simples', nome: soma.pasta, soma, notas, total };
      simplesPorChave.set(chave, item);
      itens.push(item);
      return;
    }

    const chaveMae = chaveNome(nomeMae);
    let mae = maesPorChave.get(chaveMae);
    if (!mae) {
      mae = { tipo: 'mae', nome: nomeMae, subpastas: [], notas: 0, total: 0 };
      maesPorChave.set(chaveMae, mae);
      itens.push(mae);
    }
    const chaveSub = chaveNome(soma.pasta);
    let sub = mae.subpastas.find((s) => chaveNome(s.nome) === chaveSub);
    if (!sub) {
      sub = { nome: soma.pasta, soma, notas: 0, total: 0 };
      mae.subpastas.push(sub);
    }
    sub.notas += notas;
    sub.total += total;
    mae.notas += notas;
    mae.total += total;
  });

  // Pastas mãe que existem mas não têm nenhuma subpasta (acabaram de ser
  // criadas, ou foram esvaziadas) também aparecem, com total zerado.
  nomesMae.forEach((nome) => {
    const limpo = (nome || '').trim();
    if (!limpo) return;
    const chave = chaveNome(limpo);
    if (maesPorChave.has(chave)) return;
    const mae = { tipo: 'mae', nome: limpo, subpastas: [], notas: 0, total: 0 };
    maesPorChave.set(chave, mae);
    itens.push(mae);
  });

  return itens;
}

// ---- Registro das pastas mãe: [{ id, nome }], da mais nova pra mais antiga ----

// Devolve o MESMO array se o nome já existe (ou é vazio), pra quem chama
// poder saber se mudou comparando com `!==`.
export function adicionarNomeMae(registro, nome) {
  const limpo = (nome || '').trim();
  if (!limpo) return registro;
  const chave = chaveNome(limpo);
  if (registro.some((m) => chaveNome(m.nome) === chave)) return registro;
  const id = `${Date.now()}-${Math.round(Math.random() * 9999)}`;
  return [{ id, nome: limpo }, ...registro];
}

export function removerNomeMae(registro, nome) {
  const chave = chaveNome(nome);
  if (!chave) return registro;
  return registro.filter((m) => chaveNome(m.nome) !== chave);
}

// Tira da lista todas as subpastas de uma pasta mãe. Nunca mexe nas pastas
// simples (as que não têm mãe).
export function removerSubpastasDaMae(lista, nome) {
  const chave = chaveNome(nome);
  if (!chave) return lista;
  return lista.filter((s) => chaveNome(s.pastaMae) !== chave);
}

// Nomes de pasta mãe citados pelos registros (sem repetir).
export function nomesMaeReferenciados(lista) {
  const vistos = new Map();
  lista.forEach((s) => {
    const nome = (s.pastaMae || '').trim();
    if (nome && !vistos.has(chaveNome(nome))) vistos.set(chaveNome(nome), nome);
  });
  return [...vistos.values()];
}

// ---- Renomear ----
// Ambas devolvem { erro } se não puderem renomear ('vazio' ou 'duplicado'),
// ou o resultado novo. Trocar só maiúscula/minúscula do próprio nome vale.

// Renomeia uma pasta (simples) ou subpasta, identificada pelo id do registro.
// Não pode repetir o nome de outra pasta do mesmo nível, ou seja, dentro da
// mesma pasta mãe (ou entre as pastas simples).
export function renomearSubpasta(lista, id, novoNome) {
  const novo = (novoNome || '').trim();
  if (!novo) return { erro: 'vazio' };
  const alvo = lista.find((s) => s.id === id);
  if (!alvo) return { erro: 'inexistente' };
  const chaveMae = chaveNome(alvo.pastaMae);
  const repetido = lista.some(
    (s) => s.id !== id && chaveNome(s.pastaMae) === chaveMae && chaveNome(s.pasta) === chaveNome(novo)
  );
  if (repetido) return { erro: 'duplicado' };
  return { lista: lista.map((s) => (s.id === id ? { ...s, pasta: novo } : s)) };
}

// Renomeia uma pasta mãe: o registro dela e o `pastaMae` de todas as
// subpastas, pra elas continuarem dentro dela.
export function renomearMae(lista, registro, nomeAntigo, novoNome) {
  const novo = (novoNome || '').trim();
  if (!novo) return { erro: 'vazio' };
  const chaveAntiga = chaveNome(nomeAntigo);
  const chaveNova = chaveNome(novo);
  if (chaveNova !== chaveAntiga) {
    const jaExiste =
      registro.some((m) => chaveNome(m.nome) === chaveNova) ||
      lista.some((s) => chaveNome(s.pastaMae) === chaveNova);
    if (jaExiste) return { erro: 'duplicado' };
  }
  return {
    lista: lista.map((s) => (chaveNome(s.pastaMae) === chaveAntiga ? { ...s, pastaMae: novo } : s)),
    registro: registro.map((m) => (chaveNome(m.nome) === chaveAntiga ? { ...m, nome: novo } : m)),
  };
}
