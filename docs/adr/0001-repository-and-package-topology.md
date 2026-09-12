# ADR 0001: Topologia de repositórios e pacotes

## Status
Accepted

## Contexto
O PRD (`docs/MVP.txt`) define quatro componentes: `salve-push-server` (Go,
open source), `react-native-salve-push` (SDK, open source),
`salve-push-cli` (open source), e `salve-push-platform` (SaaS, proprietário).
Precisávamos decidir quantos repositórios git usar e como agrupar esses
componentes dentro deles, antes de começar a implementar o caminho crítico
descrito na seção 33 do PRD.

Forças em jogo:
- Server é Go; SDK e CLI são TypeScript/Node — ecossistemas de build
  diferentes.
- O contrato HTTP entre server, SDK, CLI e (futuramente) Platform precisa
  evoluir em conjunto — mudanças no protocolo tendem a tocar múltiplos
  componentes na mesma PR.
- A Platform é o único componente proprietário; misturá-la com código OSS no
  mesmo repositório complicaria licenciamento e controle de acesso.
- Falta, hoje, um front real de administração para testar o server
  manualmente durante o desenvolvimento, antes de a Platform existir.

## Decisão
Dois repositórios:

1. **`salve-push`** (público, Apache-2.0) — monorepo contendo tudo que é
   open source:
   - `server/` — módulo Go independente (`module .../salve-push/server`),
     não publicado via `go get` por terceiros (é um binário/app, não uma
     lib), então não sofre a dor usual de versionamento de módulo Go em
     subdiretório.
   - `packages/` — workspace pnpm com `protocol`, `sdk-react-native`, `cli`.
   - `playground/` — front descartável só para exercitar a API do server
     manualmente enquanto a Platform não existe. Não é o produto SaaS e
     pode ser descartado quando a Platform nascer.
   - `examples/react-native-demo/` — app RN de referência (a ser gerado
     pela própria CLI do React Native quando o SDK estiver funcional).
   - `protocol/openapi.yaml` — contrato compartilhado (ver ADR 0002).
   - Um único `LICENSE` (Apache-2.0) cobre o repositório inteiro.

2. **`salve-push-platform`** (privado) — SaaS real, repositório separado,
   consumindo `@salve-push/protocol` como dependência npm publicada, nunca
   duplicando tipos do contrato à mão.

Dentro do monorepo público: pnpm workspaces para os pacotes TS, sem
Turborepo/Nx (não necessário no tamanho atual — princípio "Simple >
Feature-rich" do PRD, seção 35). Versionamento de `sdk-react-native`, `cli`
e `protocol` via Changesets, independente entre si. CI dividido por
componente (`server.yml`, `sdk.yml`, `cli.yml`) com `paths:` filtrados, para
que mudança em um não dispare/bloqueie build de outro.

## Consequências
- Mudança no protocolo (`protocol/openapi.yaml`) e nos três componentes que
  o consomem cabe numa única PR/commit, com CI cobrindo os três.
- A Platform nunca vê o código do server/SDK/CLI diretamente — só a
  interface publicada (`@salve-push/protocol`), reforçando a separação
  control-plane/data-plane que é a proposta de valor do produto.
- Se o `server/` algum dia precisar ser consumido como lib Go por terceiros,
  temos que adotar tags `server/vX.Y.Z` (custo aceito, hoje não se aplica).
- Escolha de pnpm (em vez de npm/yarn) e Changesets é reversível sem impacto
  estrutural — não elevada a ADR própria.

## Alternativas consideradas
- **Server em repositório próprio, SDK+CLI em outro**: evita qualquer
  fricção de Go-em-subdiretório, mas separa o protocolo do código que o
  consome em dois lugares, aumentando o risco de PRs desalinhadas ao mudar
  o contrato. Descartado porque a fricção de Go-em-subdiretório não se
  aplica aqui (server não é lib).
- **Um único repositório para tudo, incluindo a Platform**: mais simples de
  navegar, mas mistura licença Apache-2.0 (OSS) com código proprietário no
  mesmo histórico git, complicando forks legítimos do server/SDK/CLI feitos
  por terceiros. Descartado.
- **Turborepo/Nx desde o início**: adiciona cache e orquestração de build,
  mas é overhead não justificado pelo tamanho atual (3 pacotes TS). Pode ser
  revisitado numa ADR futura se o build ficar lento.
