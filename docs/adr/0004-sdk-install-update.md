# ADR 0004: `installUpdate` — troca de bundle nativo e rollback via Nitro Modules

## Status
Accepted

## Contexto
`checkForUpdate`/`downloadUpdate` já buscam e verificam (hash + assinatura
Ed25519, ADR 0003) o bundle no device. `installUpdate` ainda não existe: é
o passo que faz o app React Native efetivamente *rodar* o bundle baixado
em vez do que veio empacotado no binário nativo.

Isso é, por natureza, trabalho nativo — não existe API JS pura para trocar
qual arquivo `.js` o motor Hermes carrega. React Native resolve essa URL
uma vez, no bootstrap nativo, **antes de qualquer JS rodar**:

- **iOS**: `override func bundleURL() -> URL?` no `AppDelegate`.
- **Android**: `override fun getJSBundleFile(): String?` no
  `ReactNativeHost`.

Ou seja: **o app consumidor precisa integrar algumas linhas no
`AppDelegate`/`MainApplication`** apontando essa resolução para o nosso
módulo — não é algo que dá pra fazer só com `npm install`. Esse custo de
integração é o mesmo que qualquer solução real de OTA para RN paga.

### Pesquisa: como soluções reais resolvem isso

Antes de desenhar do zero, li o código-fonte de duas soluções OSS reais
(não resumo de blog — arquivos direto do GitHub):

**[`stallion-tech/react-native-stallion`](https://github.com/stallion-tech/react-native-stallion)**
(MIT, SDK+CLI open source, console hospedado é o produto pago — mesmo
modelo da ADR 0001):

- `Stallion.java`/`StallionModule.h` (iOS) expõem um método nativo
  **estático e síncrono** (`getJSBundleFile(Context)` /
  `+(NSURL *)getBundleURL`), chamado direto pelo `MainApplication`/
  `AppDelegate` — sem bridge, sem JSI, sem qualquer módulo envolvido
  nesse call site específico. Confirma que essa parte do problema é
  puramente nativo-nativo, independente de qual framework (Nitro,
  TurboModule, bridge clássico) o resto do SDK usa.
- Armazenamento em "slots" (`NEW_SLOT`/`STABLE_SLOT`/`DEFAULT_SLOT`) com
  metadata persistida localmente; `mountNewProdBundle` faz `moveFile`
  (rename atômico) de uma pasta `temp` pra `new` antes de considerar o
  release "instalado".
- Rollback: `Thread.setDefaultUncaughtExceptionHandler` instalado antes
  do JS subir. Se uma exceção não tratada acontece **e** o app ainda não
  tinha confirmado boot (`isMounted == false`), reverte **na mesma
  sessão** — não espera o próximo launch do usuário. Tem ainda uma
  segunda camada: um signal handler nativo em C++ (via JNI) pra crashes
  nativos de verdade (segfault, que mata o processo antes do handler Java
  rodar) — grava um marker em disco processado no launch seguinte.
- `restart()`: iOS usa `RCTTriggerReloadCommandListeners` (recarrega a
  bridge no mesmo processo — é o mesmo mecanismo do "Reload" do menu dev,
  **não mata o processo**); Android usa a técnica "Process Phoenix"
  (`ProcessPhoenix.triggerRebirth`) pra matar e ressuscitar o processo de
  verdade. Confirma com código real a assimetria entre plataformas.
- Módulo JS-exposto é `ReactContextBaseJavaModule`/`RCTEventEmitter`
  clássico — **não é TurboModule nem Nitro** — e mesmo assim funciona sob
  New Architecture, via camada de compatibilidade do RN pra módulos sem
  view própria.

**[`microsoft/react-native-code-push`](https://github.com/microsoft/react-native-code-push)**:
correção importante — CodePush **sempre** foi MIT/open source, não "se
tornou" open source agora. O que aconteceu: a Microsoft aposentou o App
Center (backend do CodePush) em 31 de março de 2025 e **arquivou o
repositório** (está morto, sem mais commits). O próprio README deles diz:

> "React Native CodePush won't support new Architecture. In order to use
> this plugin on React Native versions starting from 0.76 you will need
> to opt out from new architecture."

CodePush está permanentemente preso à Old Architecture, e o projeto
morreu junto com o backend que o sustentava — exemplo concreto do
risco que a ADR 0001 já argumenta contra (control plane de terceiro que
pode simplesmente desligar).

### Decisões tomadas depois da pesquisa
1. **Nitro não é requisito para funcionar sob New Architecture** — o
   Stallion prova isso com módulo clássico funcionando via camada de
   compatibilidade. A escolha por Nitro (mantida abaixo) é por
   performance/type-safety/DX, não por necessidade de compatibilidade.
2. **Rollback por "N launches falhos" é pior que o padrão real do
   mercado.** Reverter na mesma sessão via exception handler é mais
   rápido pro usuário (não vê o crash de novo no próximo launch). Adoto
   esse padrão abaixo.
3. **Crash nativo (segfault) entra no MVP**, coberto com a mesma técnica
   do Stallion (signal handler POSIX + arquivo de marker) — ver seção 4.
4. **Piso de `react-native`: `0.79.0`**, com New Architecture
   obrigatória. Fecha a pergunta em aberto da versão anterior deste ADR.

PRD relevante:
- §16-17: `installUpdate()` na API pública, fluxo "download → verify →
  install → next app launch".
- §18: rollback local básico — última versão estável guardada, limite de
  tentativas, fallback pro bundle anterior.
- §31: fora de escopo do MVP — builds/signing/deploy de app nativo.

## Decisão

### 1. Framework do módulo nativo: Nitro Modules (escolha de DX/performance, não de compatibilidade)

Nitro define a interface do módulo uma vez, em TypeScript
(`*.nitro.ts`, um `HybridObject`), e o `nitrogen` (codegen do próprio
Nitro) gera os protocolos/tipos nativos exatos em C++/Swift/Kotlin a
partir dela — o app não compila se a implementação nativa não bater com o
spec. Mesma filosofia de "uma fonte única gera os dois lados" que a ADR
0002 já estabeleceu para o protocolo HTTP.

Por que Nitro em vez de módulo clássico (que, como o Stallion prova,
também funcionaria):
- **Swift nativo de verdade**: módulos clássicos/TurboModules não têm
  binding direto pra Swift no lado JS-exposto — passam por Objective-C no
  meio. Nitro fala C++↔Swift direto.
- **Sem boilerplate de bridge manual**: erro de tipo vira erro de
  compilação, não crash de bridge em runtime.
- **Chamadas síncronas type-safe**: o Stallion também tem método síncrono
  (`getActiveReleaseHash` com `isBlockingSynchronousMethod = true`), mas
  sem verificação de tipo em compile-time do lado nativo.

Custo aceito: Nitro exige JSI, ou seja, exige New Architecture habilitada
— sem fallback pro bridge legado. Isso é uma escolha deliberada, não uma
necessidade técnica (Stallion prova que dá pra ser New-Arch-compatible
sem Nitro) — aceito o corte de compatibilidade em troca de DX/performance
porque o bridge legado já está sendo removido do próprio React Native.

### 2. Layout de armazenamento no device

```
<sandbox-do-app>/salve-push/
├── releases/
│   ├── <releaseId>/bundle.js
│   └── ...
├── state.json
└── mount.marker            ← existência = "boot confirmado" (ver seção 4)
```

`state.json`:
```json
{
  "currentReleaseId": "…",
  "previousReleaseId": "…" | null,
  "bootStatus": "pending" | "confirmed"
}
```

- iOS: `Library/Application Support` (sem backup pro iCloud).
- Android: `context.getFilesDir()`.

Escrita do bundle novo em pasta temporária + rename atômico pra
`releases/<id>/` antes de apontar `currentReleaseId` pra ele (mesma
técnica do Stallion — resolve a pergunta em aberto que eu tinha deixado
sobre escrita atômica: **sim, desde o MVP**, não é opcional).

Só o bundle de `currentReleaseId` e, quando existir, o de
`previousReleaseId` ficam retidos — todo `installUpdate()` bem-sucedido
poda releases mais antigos.

Leitura/escrita de `state.json` e dos arquivos de bundle é exposta via o
`HybridObject` do Nitro (`SalvePushNative.nitro.ts`) para as chamadas que
partem do JS (`installUpdate`, `notifyAppReady`). A leitura feita por
`bundleURL()`/`getJSBundleFile()` no bootstrap é nativo-nativo direto
(mesmo padrão do `StallionModule.getBundleURL()`), sem passar pelo Nitro
nesse call site específico — a JS engine ainda nem existe nesse ponto.

### 3. Troca de bundle: aplica no próximo launch, sem restart forçado no MVP

Fluxo de `installUpdate()` (JS → método do `HybridObject`):
1. Valida que o bundle já verificado por `downloadUpdate` (hash+assinatura
   — ADR 0003) está no disco.
2. Grava o bundle em `releases/<id>/` (temp + rename atômico).
3. Escreve `state.json`: `previousReleaseId = currentReleaseId`,
   `currentReleaseId = <novo>`, `bootStatus = "pending"`.
4. Retorna — **não reinicia o app**. `bundleURL()`/`getJSBundleFile()`
   só leem esse estado no próximo bootstrap nativo.

Restart forçado fica fora do MVP: Android consegue matar+ressuscitar o
processo de verdade (técnica "Process Phoenix", confirmada em uso real
pelo Stallion); iOS não tem API pública pra isso — só "recarregar a
bridge no processo vivo" (`RCTTriggerReloadCommandListeners`, o mesmo
"Reload" do menu dev), operação com mais risco de estado JS
inconsistente. `installUpdate({ restartImmediately: true })` fica como
extensão futura opcional, fora deste ADR.

### 4. Rollback / crash-loop (PRD §18) — same-session, cobrindo crash JS e crash nativo

Corrigido em relação à primeira versão deste ADR, com base no padrão real
do Stallion — **crash nativo entra no MVP**, não fica de fora.

Três camadas de detecção, instaladas **antes** de qualquer JS rodar:

1. **Exceção JS/nativa não tratada** (mesmo processo, ainda vivo):
   `Thread.setDefaultUncaughtExceptionHandler` no Android;
   `NSSetUncaughtExceptionHandler` no iOS. Roda no mesmo processo que
   crashou — pode reverter e reagir imediatamente.
2. **Crash nativo de verdade** (segfault, SIGABRT, SIGBUS, SIGILL, SIGFPE
   — o processo está morrendo, sem chance de rodar código Java/Swift
   normal): handler de sinal POSIX (`sigaction`), **mesmo código C/C++ nos
   dois sistemas** (Android via JNI/NDK, iOS via chamada direta — a API
   POSIX é idêntica). Só pode fazer operações *async-signal-safe*: sem
   Objective-C, sem malloc, sem tocar no runtime JS/Nitro — só
   `open`/`write`/`close` crus. Por isso o estado de "montado" não é lido
   do `state.json` (JSON parsing não é async-signal-safe) — é checado só
   pela **existência** do arquivo `mount.marker` (`open()` retorna fd
   válido ou não, nada mais). No crash, grava um marker JSON minúsculo
   (`{"signal":N,"isAutoRollback":bool}`) e **encadeia pro handler
   anterior** antes de re-levantar o sinal — essencial pra não quebrar um
   crash reporter (Sentry/Crashlytics/Bugsnag) que a maioria dos apps já
   tem instalado.
3. **Marker processado no próximo launch**: como o processo morreu antes
   de conseguir reverter de verdade (só gravou o marker), o bootstrap
   seguinte lê o marker, decide se reverte, e apaga o arquivo.

Fluxo completo:
1. `bundleURL()`/`getJSBundleFile()` leem `state.json` no bootstrap. Se
   houver `mount.marker` de crash pendente (camada 3), processa a
   reversão antes de decidir qual bundle entregar.
2. Runtime JS inicializa com `currentReleaseId`.
   - **Crash em runtime, processo ainda vivo** (camada 1): handler de
     exceção detecta que `mount.marker` não existe ainda e reverte
     imediatamente — `currentReleaseId = previousReleaseId` — **na mesma
     sessão**, antes do processo morrer de vez.
   - **Crash nativo, processo morre** (camada 2): grava marker; reversão
     de fato acontece no launch seguinte (camada 3).
   - **`notifyAppReady()` chamado**: cria `mount.marker` (existência =
     confirmado) e atualiza `state.json` para `bootStatus = "confirmed"`.

Isso exige, dos dois lados:
- Nativo: decidir qual bundle carregar **antes** de qualquer JS rodar, e
  ter os três handlers instalados antes da JS engine inicializar.
- Consumidor do SDK: chamar `notifyAppReady()` cedo (ex.: primeiro
  render). Vira passo obrigatório documentado — mesma exigência que
  CodePush (`codePush(MyApp)` HOC) e Stallion (`withStallion(MyApp)`) já
  impõem; considerar oferecer um HOC equivalente
  (`withSalvePush(RootComponent)`) que chama `notifyAppReady()`
  automaticamente após o primeiro render, reduzindo o risco de o
  desenvolvedor esquecer a chamada manual.

Escopo explícito de sinais capturados (lista do Stallion, adotada igual
nos dois SOs para consistência de comportamento): `SIGABRT`, `SIGSEGV`,
`SIGILL`, `SIGBUS`, `SIGFPE`, `SIGTRAP`, `SIGPIPE`, `SIGSYS`.

### 5. Estrutura do pacote

```
packages/sdk-react-native/
├── src/                      ← API pública TS
├── nitro/
│   └── SalvePushNative.nitro.ts   ← spec HybridObject
├── ios/                      ← Swift gerado + implementado (nitrogen)
├── android/                  ← Kotlin gerado + implementado (nitrogen)
├── cpp/                      ← handler de sinal POSIX, compartilhado pelos 2 SOs
│   ├── crash_handler.cpp
│   └── CMakeLists.txt        ← build Android (NDK); iOS linka direto no Xcode target
└── nitrogen.config.json
```

`nitrogen` roda como passo de build da lib (equivalente ao
`protocol:generate` do OpenAPI) e o output vai commitado/publicado junto
— diferente do Codegen nativo do próprio RN, que roda no build do app
consumidor. CI ganha um job com toolchain iOS (Xcode) + Android (Gradle/
NDK) que hoje não existe (`sdk.yml` atual só roda `tsc`).

## Consequências
- `installUpdate()` deixa de lançar "not implemented"; `notifyAppReady()`
  vira método novo, obrigatório no fluxo real.
- `peerDependencies.react-native` sobe para `>=0.79.0`, com New
  Architecture declarada como obrigatória (não opcional).
- `react-native-nitro-modules` vira dependência direta nova.
- Consumidor do SDK precisa: (a) editar `AppDelegate`/`MainApplication`
  apontando bundle URL pro nosso módulo, (b) ter New Architecture
  habilitada, (c) chamar `notifyAppReady()` (manual ou via HOC) após o
  primeiro render.
- `react-native-salve-push` deixa de ser um pacote 100% JS: CI passa a
  precisar de Xcode + Gradle/NDK, e agora também de toolchain C/C++
  (CMake) pelo handler de sinal nativo.
- Handler de sinal POSIX é código C++ de baixo nível com restrições reais
  (async-signal-safe only — nada de malloc, Objective-C ou JSI dentro
  dele) — superfície de bug diferente do resto do SDK, exige cuidado e
  revisão específica, não é "só mais um módulo TS".
- Precisa encadear (chain) pro handler de sinal/exceção anterior, senão
  quebra qualquer crash reporter de terceiro (Sentry, Crashlytics,
  Bugsnag) que o app consumidor já tenha instalado.
- Only-JS bundle: MVP continua assumindo um único arquivo `bundle.js`;
  apps que usam `assets/` (imagens, fontes) via Metro não são cobertos
  ainda. Decisão separada, fora deste ADR.

## Riscos / perguntas em aberto
- **Confiabilidade de `bundleURL()`/`getJSBundleFile()` sob bridgeless.**
  Há relatos ([facebook/react-native#48101](https://github.com/facebook/react-native/issues/48101))
  de `getJSBundleFile()` não ser chamado de forma confiável em certos
  cenários de New Architecture recente. Precisa de spike validando o hook
  exato contra 0.79 antes de eu prosseguir com a implementação real.
- **Comando/fluxo exato de scaffold Nitro** (`nitrogen`, template de lib)
  muda de versão com frequência — confirmar contra a doc atual
  (nitro.margelo.com) no momento de implementar.
- **Alerta de debug no rollback**: o Stallion mostra um `UIAlertController`
  avisando "app foi revertido" quando o rollback acontece — útil em
  dev/staging, ruído em produção. Minha proposta (ainda não confirmada
  com você): só exibir em `__DEV__`/canais não-production, silencioso em
  produção. Decide no momento da implementação se não houver objeção.

## Alternativas consideradas
- **Módulo clássico (bridge) em vez de Nitro**: provado viável pelo
  próprio Stallion, inclusive sob New Architecture via camada de
  compatibilidade. Descartado por escolha de DX/performance, não por
  incompatibilidade real.
- **TurboModule "puro" (sem Nitro)**: meio-termo — ainda sem Swift nativo
  direto, mais boilerplate de spec que Nitro. Descartado a favor de Nitro.
- **Depender de `react-native-code-push` ou `expo-updates` como
  biblioteca**: CodePush está arquivado/morto e nunca vai suportar New
  Architecture (confirmado no README deles). Expo Updates reintroduz
  control plane de terceiro (conta Expo/EAS), o oposto da ADR 0001.
  Descartados — mas a *técnica* de override de bundle URL que os dois
  usam é pública e é a mesma que propomos aqui.
- **Rollback baseado em contagem de launches falhos** (versão anterior
  deste ADR): funciona, mas é estritamente pior que reverter na mesma
  sessão via exception handler — usuário veria o crash de novo no próximo
  launch antes da reversão acontecer. Substituído pelo padrão do Stallion.
- **Restart forçado imediato via módulo nativo estilo `RNRestart`**: mais
  parecido com `codePush.sync()`, mas exige implementação diferente por
  plataforma (Android real via Process Phoenix, iOS simulado via reload
  de bridge) com risco de estado inconsistente. Adiado para depois do MVP.
- **Rollback baseado em métrica remota**: explicitamente fora do MVP pelo
  PRD §31. Ficamos só com rollback local baseado em crash-loop.
