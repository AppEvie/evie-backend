import * as MailComposer from 'expo-mail-composer';

// Abre o app de email nativo (o mesmo já logado com as contas do usuário)
// com o rascunho pronto para revisão e envio manual.
export async function abrirRascunhoEmail(email) {
  const disponivel = await MailComposer.isAvailableAsync();
  if (!disponivel) {
    throw new Error('Nenhum app de email configurado neste dispositivo.');
  }
  await MailComposer.composeAsync({
    recipients: email.destinatario ? [email.destinatario] : [],
    subject: email.assunto || '',
    body: email.corpo || '',
  });
}
