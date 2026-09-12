# ADR 0003: Release bundle signing scheme

## Status
Accepted

## Contexto
PRD seção 15.2 exige que todo release seja assinado: a CLI assina o bundle
depois de calcular seu hash, o `salve-push-server` armazena a assinatura mas
nunca a chave privada, e o SDK (`react-native-salve-push`) verifica a
assinatura antes de instalar. Isso é o que impede um server self-hosted
comprometido (ou um MITM na infra do cliente) de empurrar código arbitrário
para o app — é o ponto de segurança mais crítico do produto, então precisa
de decisão explícita antes de implementar SDK/CLI.

Três perguntas independentes, mas que precisam ser respondidas juntas
porque uma decide a forma da outra:

1. **Algoritmo de assinatura.**
2. **Como o SDK obtém a chave pública para verificar** (ela não pode vir do
   mesmo lugar que a identidade do server — PRD seções 9-10 já definem uma
   chave de identidade do `salve-push-server`, para challenge/response com
   a Platform; a chave de assinatura de release é uma chave **diferente**,
   controlada pelo desenvolvedor do app, não pela instalação do server).
3. **Formato de codificação** do hash e da assinatura no JSON do protocolo
   (`ReleaseMetadata.bundle_hash` / `.signature` já existem no
   `openapi.yaml`, mas hoje são só `string` sem formato definido).

## Decisão

### 1. Algoritmo: Ed25519

| | Ed25519 | RSA-2048 (PSS) | ECDSA P-256 |
|---|---|---|---|
| Tamanho da chave pública | 32 bytes | 270+ bytes | 65 bytes |
| Tamanho da assinatura | 64 bytes | 256 bytes | ~70 bytes (variável) |
| Velocidade de verificação em JS/mobile | Rápida | Lenta | Rápida |
| Superfície de erro de implementação | Baixa (sem escolha de padding/curva, nonce determinístico por design) | Média (precisa forçar PSS, não PKCS1v1.5) | Alta (nonce reuso = vazamento da chave privada, como no exploit do PS3) |
| Bibliotecas disponíveis (Node/CLI e RN/Hermes) | `@noble/ed25519` / `tweetnacl` (puro JS, sem binding nativo) | `node:crypto`, mas RN precisa de polyfill mais pesado | Igual RSA, com o risco extra de nonce |
| Precedente no ecossistema de assinatura de release | minisign, signify (OpenBSD), sigstore, SSH (`ed25519` é o default atual) | apt/dpkg (legado) | menos comum para este caso de uso |

Ed25519 é a escolha padrão hoje para "assinar um artefato, verificar em
qualquer lugar, sem servidor de chaves": chave e assinatura pequenas
(cabem tranquilamente no JSON de `ReleaseMetadata`), verificação rápida no
runtime Hermes do React Native sem depender de binding nativo, e nenhuma
decisão de parâmetro que possa ser escolhida errado (ao contrário de RSA
com padding, ou ECDSA com geração de nonce).

### 2. Distribuição da chave pública: embutida na configuração do SDK, não buscada em runtime

```ts
SalvePush.configure({
  serverUrl: 'https://ota.example.com',
  channel: 'production',
  runtimeVersion: '1.5',
  signingPublicKey: 'base64:MCowBQYDK2VwAyEA...', // novo campo
});
```

A chave pública de assinatura é o **trust anchor** de "quem pode empurrar
código para este app" — decidida pelo desenvolvedor do app no build-time,
igual a um pinned certificate. Buscá-la em runtime (do server ou da
Platform) reintroduziria exatamente o problema que a assinatura existe
para resolver: se o server self-hosted for comprometido, ele não pode
conseguir trocar a chave pública que o app usa para confiar nele.

A CLI gera o par de chaves uma vez (`salve-push keys generate`, fora de
qualquer comando de release), imprime a chave pública para o desenvolvedor
colar no `configure()`, e guarda a privada localmente / em secret de CI —
nunca no request para o server.

### 3. Mensagem assinada: hash + metadata canonicalizado, não só os bytes do bundle

Assinar apenas o hash (ou apenas os bytes) do bundle prova "estes bytes
vieram de mim", mas não prova "estes bytes são a versão 1.5.0 do canal
production". Um `salve-push-server` self-hosted comprometido poderia
republicar um bundle legitimamente assinado sob outro `version`,
`channel` ou `rollout_percentage` — mesma assinatura, metadata trocado.

A mensagem assinada é uma string canônica que amarra o hash ao restante
do metadata do release:

```
message = bundle_hash + "\n" + version + "\n" + platform + "\n" + channel + "\n" + runtime_version
signature = Ed25519_Sign(privateKey, utf8(message))
```

Qualquer alteração de metadata pós-assinatura invalida a verificação no
SDK, não só alteração dos bytes do bundle. Essa construção (e a
verificação correspondente) vive em `@salve-push/protocol` — mesmo pacote
que já é fonte única do contrato de wire (ADR 0002) — para que CLI (assina)
e SDK (verifica) nunca possam divergir na forma de montar a mensagem.

### 4. Biblioteca: `@noble/ed25519` nos dois lados

CLI (Node) e SDK (Hermes/React Native) usam a mesma lib, pura JS, sem
binding nativo: gera chaves e assinaturas como bytes brutos (`Uint8Array`),
sem PEM/DER. Usar `node:crypto` na CLI geraria chaves em PKCS8/DER que
precisariam de conversão para casar com o que o SDK consegue verificar em
Hermes — complexidade sem benefício.

### 5. Armazenamento da chave privada na CLI

`salve-push keys generate` escreve a chave privada em `.salve-push/signing.key`
(gitignored) e imprime a chave pública em base64 para colar no
`configure()` do app. `salve-push release` lê a chave de
`.salve-push/signing.key` por padrão, ou de `SALVE_PUSH_SIGNING_KEY`
(env var) quando definida — cobre CI/CD sem exigir o arquivo no repositório
(PRD exige a CLI funcionar em CI/CD). Isso é ortogonal a quem hospeda o
`salve-push-server`: a chave nunca é enviada a ele, seja instalação de
referência ou fork de terceiro.

### 6. Codificação no protocolo

- `bundle_hash`: continua **hex** (já implementado — SHA-256 em hex é a
  convenção universal, mesma usada por `git`, checksums de download, etc.
  Não há motivo para trocar algo que já está em produção sem necessidade).
- `signature`: **base64** (assinatura Ed25519 de 64 bytes vira 88
  caracteres em base64 contra 128 em hex — e é o padrão de fato para
  assinaturas binárias em APIs JSON, usado por sigstore/minisign/JWS).

`signature` continua `type: string` no OpenAPI (não `format: byte`): esse
format faz o oapi-codegen gerar `[]byte` em Go, que o `encoding/json`
volta a base64-codificar sozinho na serialização — duplo encode em cima do
valor que já guardamos como texto base64. Mantemos `string` simples com a
convenção documentada na `description`.

## Consequências
- CLI ganha um comando novo (`salve-push keys generate`) e passa a exigir
  a chave privada configurada (arquivo local ou variável de ambiente) para
  `salve-push release` funcionar — um passo a mais no fluxo do PRD §7.
- SDK ganha um campo obrigatório novo em `configure()`
  (`signingPublicKey`); apps existentes que adotarem o SDK antes desta ADR
  precisarão de uma migração de config (não há apps em produção ainda, MVP
  não lançado, custo zero agora).
- `server` nunca decodifica nem entende a assinatura — só armazena e
  repassa o campo `signature` como está, mantendo a garantia do PRD de que
  a chave privada de assinatura nunca toca o server.
- Perda de chave privada de assinatura = impossível publicar novos
  releases confiáveis para instalações existentes desse app (não há
  rotação automática no MVP — aceito, mesmo trade-off que qualquer signing
  key de produção; rotação fica fora de escopo do MVP, seção 31 do PRD).

## Alternativas consideradas
- **RSA-2048/PSS**: mais familiar em ambientes enterprise, mas assinatura
  4x maior, verificação mais lenta no Hermes, e mais fácil de implementar
  errado (padding). Descartado para o MVP.
- **ECDSA P-256**: compacto como Ed25519, mas depende de geração correta
  de nonce por assinatura — reuso de nonce vaza a chave privada
  inteira (caso real: PS3). Ed25519 remove essa classe de erro por
  construção (nonce derivado deterministicamente do hash da mensagem +
  chave). Descartado.
- **Buscar a chave pública do endpoint `/.well-known/salve-push`**: reusaria
  a identidade criptográfica do server (PRD §9), mas isso mistura duas
  responsabilidades diferentes — "este server é uma instalação legítima do
  salve-push-server" (identidade do server, verificada pela Platform) não é
  o mesmo fato que "este bundle foi assinado por quem o desenvolvedor do
  app autoriza" (assinatura de release, verificada pelo SDK no device).
  Um server comprometido não deveria conseguir se auto-certificar como
  fonte confiável de código. Descartado.
- **Assinar só o hash ou só os bytes do bundle, sem metadata**: mais simples
  de implementar, mas permite que um server comprometido republique um
  bundle validamente assinado sob outra versão/canal/rollout, já que a
  assinatura nunca amarrou a esses campos. Descartado em favor da mensagem
  canônica hash+metadata.
