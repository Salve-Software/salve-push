# ADR 0002: OpenAPI como fonte única do protocolo

## Status
Accepted

## Contexto
O contrato HTTP entre `react-native-salve-push`, `salve-push-cli` e
`salve-push-server` (seção 22 do PRD) precisa ser implementado de forma
consistente em duas linguagens: Go (server) e TypeScript (SDK e CLI). Sem
uma fonte única, cada lado escreve seus próprios tipos para
`ReleaseMetadata`, `CreateReleaseRequest`, etc., e nada impede que
divirjam silenciosamente conforme o protocolo evolui (ex.: server adiciona
um campo obrigatório, SDK não sabe até quebrar em runtime).

## Decisão
`protocol/openapi.yaml`, na raiz do monorepo `salve-push`, é a única fonte
de verdade do contrato HTTP. Tipos são gerados a partir dele, nunca escritos
à mão:
- Go: `server/pkg/protocol` via `oapi-codegen` (`go generate ./...`).
- TypeScript: `@salve-push/protocol` via `openapi-typescript`
  (`pnpm --filter @salve-push/protocol generate`), consumido por
  `react-native-salve-push` e `salve-push-cli` como dependência de
  workspace, e futuramente publicado no npm para a Platform consumir.

Mudar o protocolo é: editar o YAML → rodar os dois geradores → o
compilador (Go e TS) aponta os call sites que precisam de ajuste.

## Consequências
- Drift entre server e clientes JS vira erro de compilação, não bug
  descoberto em produção.
- Adiciona uma etapa de geração de código ao fluxo de desenvolvimento
  (`go generate`, `pnpm generate`) — precisa rodar após qualquer edição do
  YAML, e os artefatos gerados (`server/pkg/protocol/*.gen.go`,
  `packages/protocol/src/generated.ts`) não são commitados
  (`.gitignore`), reforçando que o YAML é a fonte real.
- CI de `server` e de `sdk`/`cli` já roda em `paths: ["protocol/**"]`
  também, então uma mudança no contrato dispara build nos três lados.
- Curva de entrada um pouco maior para quem só quer mexer no protocolo
  rapidamente (precisa conhecer OpenAPI), aceito em troca da garantia de
  consistência.

## Alternativas consideradas
- **Documentação em Markdown + tipos escritos à mão em cada lado**: mais
  simples de começar, mas é exatamente o cenário de drift que queremos
  evitar — descartado, especialmente por ser o contrato que atravessa a
  fronteira control-plane/data-plane, o ponto mais sensível do produto.
- **Protobuf/gRPC como contrato**: geraria tipos com mais garantias ainda,
  mas o PRD (seção 22) já define a API como RESTful/HTTP simples, e
  introduzir gRPC contradiz o princípio "Simple > Feature-rich" (seção 35)
  sem necessidade comprovada no MVP.
