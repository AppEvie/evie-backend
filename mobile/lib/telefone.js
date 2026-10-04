// Regras de telefone. Ficam separadas de propósito (sem nada do celular)
// pra poder testar com muitos formatos de número.

const DDI_POR_PAIS = {
  BR: '55',
  US: '1',
  CA: '1',
  PT: '351',
  AR: '54',
  MX: '52',
};

// Formatos que a gente reconhece pelo desenho do número (só dígitos):
//  - EUA/Canadá: 10 dígitos, o código de área e a central não começam com 0 nem 1
//  - Celular do Brasil: 11 dígitos, DDD + 9 + 8 dígitos. Nenhum código de área
//    dos EUA tem 9 na segunda posição, então não confunde com os americanos
//    escritos com o 1 na frente
//  - Fixo do Brasil: 10 dígitos, DDD + 8 dígitos começando de 2 a 5
const ehEUA = (d) => /^[2-9]\d{2}[2-9]\d{6}$/.test(d);
const ehCelularBR = (d) => /^[1-9][1-9]9\d{8}$/.test(d);
const ehFixoBR = (d) => /^[1-9][1-9][2-5]\d{7}$/.test(d);

// País do aparelho (ex: "US"), tirado do idioma/região configurados.
export function regiaoDoAparelho() {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const m = loc.match(/[-_]([A-Za-z]{2})(?:$|[-_])/);
    return m ? m[1].toUpperCase() : '';
  } catch (e) {
    return '';
  }
}

// O link wa.me do WhatsApp precisa do número completo, com o código do
// país (DDI). A ordem de decisão é:
//  1. Se o número já diz o país (começa com "+" ou "00"), vale o que está
//     escrito e nada é acrescentado.
//  2. Senão, o desenho do número mostra de onde ele é (veja acima).
//  3. Só se não der pra saber pelo desenho, usa o país que o sistema
//     informou pro contato, depois o país do aparelho, e por fim o Brasil.
//
// Importante: o "+" precisa ser olhado ANTES de tirar a pontuação, senão
// um número de fora que já estava certo na agenda ganha um código errado.
export function normalizarNumeroParaWhatsapp(numero, codigoPaisContato, regiao) {
  const texto = (numero || '').trim();
  let d = texto.replace(/\D/g, '');
  if (!d) return '';

  // 1) país explícito
  if (texto.startsWith('+')) return d;
  if (d.startsWith('00') && d.length > 6) return d.slice(2);

  // Zero na frente (prefixo de discagem nacional, ex: "011 98765-4321").
  d = d.replace(/^0+/, '');
  if (!d) return '';

  // 2) pelo desenho do número
  // Brasil com o 55 digitado, mas sem o "+".
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    const resto = d.slice(2);
    if (ehCelularBR(resto) || ehFixoBR(resto)) return d;
  }
  if (ehCelularBR(d)) return `55${d}`;
  // EUA/Canadá com o 1 na frente.
  if (d.length === 11 && d.startsWith('1') && ehEUA(d.slice(1))) return d;
  if (ehEUA(d)) return `1${d}`;
  if (ehFixoBR(d)) return `55${d}`;

  // 3) não deu pra saber pelo desenho
  const pais = (codigoPaisContato || '').toUpperCase();
  const reg = (regiao === undefined ? regiaoDoAparelho() : regiao || '').toUpperCase();
  const ddi = DDI_POR_PAIS[pais] || DDI_POR_PAIS[reg] || '55';
  if (d.startsWith(ddi) && d.length >= 11) return d;
  return `${ddi}${d}`;
}

// Número pra discar: exatamente como está na agenda (é o que o app de
// Contatos do próprio celular faz), só sem espaço, parênteses e traço, que
// o endereço "tel:" não aceita. Mantém o "+" do começo, e * # , ; que
// servem pra ramal e pausa.
export function limparNumeroParaDiscagem(numero) {
  const texto = (numero || '').trim();
  const mais = texto.startsWith('+') ? '+' : '';
  return mais + texto.replace(/[^\d*#,;]/g, '');
}
