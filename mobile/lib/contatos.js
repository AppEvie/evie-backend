import * as Contacts from 'expo-contacts/legacy';

// Mapa de país (código ISO de 2 letras, que o sistema operacional
// costuma fornecer junto do contato) pro código de discagem
// internacional (DDI). Cobre os países mais prováveis pros usuários
// da Evie — fácil de estender se precisar de mais.
const DDI_POR_PAIS = {
  BR: '55',
  US: '1',
  CA: '1',
  PT: '351',
  AR: '54',
  MX: '52',
};

// O link "wa.me" do WhatsApp só funciona com o número completo,
// incluindo o código do país (DDI) — sem ele, o WhatsApp não acha o
// contato e oferece "convidar pro WhatsApp" por engano, mesmo que a
// pessoa já tenha WhatsApp. Essa função garante que o número final
// sempre tenha o DDI, usando o país do próprio contato quando
// disponível (dado que o sistema operacional já entrega), com o
// Brasil como padrão quando não dá pra saber.
export function normalizarNumeroParaWhatsapp(numero, codigoPaisContato) {
  const apenasDigitos = (numero || '').replace(/\D/g, '');
  if (!apenasDigitos) return '';

  const ddi = DDI_POR_PAIS[(codigoPaisContato || '').toUpperCase()] || '55';

  // Se o número já começa com o DDI certo (ex: já digitado como
  // "5511987654321"), não duplica.
  if (apenasDigitos.startsWith(ddi) && apenasDigitos.length > 11) {
    return apenasDigitos;
  }

  return ddi + apenasDigitos;
}

// Remove acento e deixa minúsculo, pra comparar nomes sem se importar
// com maiúscula/minúscula ou acentuação.
function normalizarNome(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    // Em português, várias letras/combinações soam exatamente igual,
    // mas têm grafias diferentes (comum em nomes próprios) — o
    // reconhecimento de voz pode transcrever numa grafia diferente da
    // que está salva no contato. Tratando essas trocas como
    // equivalentes aqui, a busca acerta independente de qual grafia
    // foi usada, pra qualquer nome — não é uma regra pra um nome
    // específico.
    .replace(/th/g, 't')   // Thiago/Tiago, Thomas/Tomas, Thales/Tales
    .replace(/ph/g, 'f')   // Phelipe/Felipe, Ralph/Ralf
    .replace(/wh/g, 'w')
    .replace(/k/g, 'c')    // Katia/Catia, Karla/Carla, Kevin/Cevin
    .replace(/y/g, 'i')    // Yasmin/Iasmin, Thayna/Taina
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ''); // remove qualquer resíduo de pontuação
}

// Pede permissão de contatos (se ainda não tiver) e busca todos os
// contatos cujo nome contém o texto procurado. Devolve uma lista com
// nome + número de telefone (só os que têm telefone cadastrado).
export async function buscarContatosPorNome(nome) {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') {
    return { permitido: false, contatos: [] };
  }

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  const termo = normalizarNome(nome);
  const encontrados = data
    .filter((c) => c.name && normalizarNome(c.name).includes(termo))
    .filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0)
    .map((c) => ({
      id: c.id,
      nome: c.name,
      numero: normalizarNumeroParaWhatsapp(c.phoneNumbers[0].number, c.phoneNumbers[0].countryCode),
    }));

  return { permitido: true, contatos: encontrados };
}
