import * as Contacts from 'expo-contacts/legacy';
import { normalizarNumeroParaWhatsapp } from './telefone';

// As regras de telefone (código do país pro WhatsApp, número pra discar)
// ficam em telefone.js.

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
    .map((c) => {
      const telefone = c.phoneNumbers[0];
      return {
        id: c.id,
        nome: c.name,
        // Como está na agenda: é o que aparece na tela e o que é discado.
        numero: telefone.number || '',
        // Com o código do país, só pro link do WhatsApp.
        numeroWhatsapp: normalizarNumeroParaWhatsapp(telefone.number, telefone.countryCode),
      };
    });

  return { permitido: true, contatos: encontrados };
}
