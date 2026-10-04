// Despesa digitada à mão ("Aluguel", R$ 5000), pro Controle financeiro.
// Fica separada do app (sem nada do celular) pra poder testar com muitos
// jeitos de escrever um valor.
//
// Uma despesa digitada entra na mesma lista de itens de uma subpasta que as
// notas e faturas fotografadas, só que marcada como manual e sem imagem.
// Assim o total, a contagem e a junção das subpastas funcionam igual.

// Lê o que a pessoa digitou e devolve o valor em número, ou null se não for
// um valor válido (vazio, texto, zero, negativo ou absurdamente grande).
//
// Aceita os dois jeitos de escrever: 5.000,00 (Brasil) e 5,000.00 (EUA).
// Quando tem os dois sinais, o último é o decimal. Sozinho, um ponto ou uma
// vírgula seguido de exatamente 3 dígitos conta como separador de milhar
// ("5.000" e "5,000" são cinco mil). Qualquer outro caso é decimal.
export function lerValorDigitado(texto) {
  const limpo = String(texto == null ? '' : texto)
    .toLowerCase()
    .replace(/us\$|r\$|\$|reais|real/g, '')
    .replace(/\s/g, '');
  if (!limpo || !/^[\d.,]+$/.test(limpo)) return null;

  const temPonto = limpo.includes('.');
  const temVirgula = limpo.includes(',');
  let numeroTexto;

  if (temPonto && temVirgula) {
    const decimal = limpo.lastIndexOf('.') > limpo.lastIndexOf(',') ? '.' : ',';
    const milhar = decimal === '.' ? ',' : '.';
    numeroTexto = limpo.split(milhar).join('').replace(decimal, '.');
  } else if (temVirgula || temPonto) {
    const sinal = temVirgula ? ',' : '.';
    const partes = limpo.split(sinal);
    const ehMilhar =
      partes.length > 1 &&
      partes[0].length >= 1 &&
      partes[0].length <= 3 &&
      partes.slice(1).every((p) => p.length === 3);
    if (ehMilhar) numeroTexto = partes.join('');
    else if (partes.length === 2) numeroTexto = `${partes[0]}.${partes[1]}`;
    else return null; // vários sinais iguais que não formam milhar, ex: "1.2.3"
  } else {
    numeroTexto = limpo;
  }

  const numero = parseFloat(numeroTexto);
  // Teto de 1 bilhão: barra erro de digitação (um zero a mais) que inflaria
  // o total sem ninguém perceber.
  if (!isFinite(numero) || numero <= 0 || numero >= 1e9) return null;
  return Math.round(numero * 100) / 100;
}

// Monta o item da despesa, ou diz o que está faltando.
// O valor é guardado como "5000,00" (vírgula decimal, sem ponto de milhar),
// o mesmo formato que o app já sabe somar.
export function montarDespesa(descricao, valorTexto) {
  const nome = String(descricao == null ? '' : descricao).trim().replace(/\s+/g, ' ');
  if (!nome) return { erro: 'descricao' };
  const valor = lerValorDigitado(valorTexto);
  if (valor === null) return { erro: 'valor' };
  return {
    item: {
      manual: true,
      uri: null,
      ehPdf: false,
      tipoDocumento: nome.slice(0, 60),
      valor: valor.toFixed(2).replace('.', ','),
    },
  };
}

// "1 item", "3 itens".
export function rotuloItens(n) {
  return `${n} ${n === 1 ? 'item' : 'itens'}`;
}
