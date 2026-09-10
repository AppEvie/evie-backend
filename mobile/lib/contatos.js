import * as Contacts from 'expo-contacts/legacy';

// Remove acento e deixa minúsculo, pra comparar nomes sem se importar
// com maiúscula/minúscula ou acentuação.
function normalizarNome(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
      numero: c.phoneNumbers[0].number,
    }));

  return { permitido: true, contatos: encontrados };
}
