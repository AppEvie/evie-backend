# Secretária — app de voz (protótipo)

## Formato do app

A tela principal agora é um **painel (dashboard)**, não uma lista simples:
resumo do dia no topo, e os assuntos organizados em cartões ("mesas") —
Agenda, Lembretes, Emails e Cálculos — cada um mostrando o que está
pendente ou recente. A barra de comando por voz fica fixa na parte de baixo,
sempre acessível, como uma barra de mensagem.

A assistente tem um nome único (`Ana`, defina o que preferir em
`mobile/screens/HomeScreen.js`, constante `NOME_ASSISTENTE`) e fala a
confirmação de cada ação em voz alta.


Projeto em duas partes:

- `backend/` — servidor Node/Express que guarda a chave da Anthropic e interpreta os comandos
- `mobile/` — app Expo (React Native) que roda no iPhone e no Android a partir do mesmo código

## 1. Rodando o backend

```bash
cd backend
npm install
export ANTHROPIC_API_KEY=sk-ant-sua-chave-aqui
npm start
```

Isso sobe o servidor em `http://localhost:3000`. Pegue a chave em
https://console.anthropic.com/settings/keys

Para testar no celular físico (não emulador), o celular precisa alcançar seu
computador na rede. Descubra o IP local da sua máquina:

```bash
# Mac
ipconfig getifaddr en0
# Linux
hostname -I
# Windows
ipconfig
```

E edite `mobile/lib/api.js`, trocando `BACKEND_URL` pelo IP encontrado
(ex: `http://192.168.0.10:3000`).

Quando quiser publicar de verdade (fora da sua rede local), suba o backend em
um serviço como **Render**, **Railway** ou **Vercel** (todos têm tier gratuito)
e configure `ANTHROPIC_API_KEY` como variável de ambiente lá. Depois troque
`BACKEND_URL` pela URL pública.

## 2. Rodando o app mobile

```bash
cd mobile
npm install
```

### ⚠️ Importante: isso precisa de um "development build", não do Expo Go puro

O app usa `@react-native-voice/voice`, `expo-calendar` e `expo-mail-composer`,
que são módulos nativos. O app padrão do **Expo Go** (da loja) não tem esses
módulos embutidos, então é preciso gerar um build de desenvolvimento próprio.
É simples:

**Opção A — build local (precisa de Android Studio / Xcode instalados):**
```bash
npx expo run:android   # gera e instala no emulador ou celular Android via USB
npx expo run:ios       # gera e instala no simulador ou iPhone via cabo (precisa de Mac)
```

**Opção B — build na nuvem via EAS (não precisa de Mac nem Android Studio):**
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --profile development --platform android
eas build --profile development --platform ios
```
No fim, o EAS te dá um link/QR code pra instalar o app diretamente no celular
(no iPhone, é preciso cadastrar o aparelho num perfil de desenvolvimento —
o próprio `eas build` te guia nisso).

Depois de instalado o development build uma vez, o dia a dia é normal:

```bash
npx expo start
```
e você abre o app já instalado no celular, que vai conectar automaticamente
ao servidor de desenvolvimento (hot reload funcionando).

## 3. Testando

1. Abra o app no celular
2. Segure o botão do microfone e fale, por exemplo:
   *"Marca uma reunião com o João amanhã às 15h"*
3. Solte o botão — o app manda o áudio transcrito pro backend, que devolve o
   que fazer, e o evento é criado direto na sua agenda nativa (Google/iCloud)
4. Pra email: *"Escreve um email pro cliente cancelando a reunião de sexta"*
   abre o compositor nativo de email com o rascunho pronto
5. Pra cálculo: *"Quanto é 15% de 340 mais 20"* mostra o resultado na tela e
   fala a resposta em voz alta

## O que ainda falta pro produto "de verdade"

- **Memória persistente**: hoje o histórico some ao fechar o app. Próximo
  passo é um banco de dados (ex: Supabase, que tem plano grátis e já resolve
  auth + banco juntos) pra guardar lembretes, listas e o perfil de estilo de
  escrita entre sessões.
- **Envio de email direto** (sem passar pelo compositor nativo): exige OAuth
  com Gmail/Outlook.
- **Publicação nas lojas**: precisa de conta Apple Developer (99 USD/ano) e
  Google Play Console (25 USD único), mais telas de privacidade/permissões
  bem documentadas pra passar na revisão (apps que leem calendário/microfone
  são revisados com mais cuidado).
- **Notificações proativas** (ex: lembrete de conta a vencer): precisa de
  push notifications (Expo já tem suporte integrado) e alguma rotina no
  backend que roda periodicamente.
