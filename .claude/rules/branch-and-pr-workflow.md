# Branch and PR workflow

A partir de agora, nenhuma feature nova é commitada direto em `main`.

## Regra

- Toda feature, fix ou mudança não-trivial começa numa branch própria,
  nunca em `main`.
- Nomenclatura de branch:
  - `feat/<descricao-curta>` para funcionalidade nova (ex.: `feat/sdk-install-update`).
  - `fix/<descricao-curta>` para correção de bug (ex.: `fix/release-invalid-id-500`).
  - `docs/<descricao-curta>` para ADRs/documentação isolada, quando não acompanha código.
  - `chore/<descricao-curta>` para tooling/CI/infra sem mudança de comportamento.
- Commits semânticos (Conventional Commits) continuam a regra de sempre,
  dentro da branch.
- Ao terminar a feature: abrir PR de `feat/...`/`fix/...` para `main` via
  `gh pr create`, com descrição do que mudou e como foi verificado
  (testes rodados, evidência de execução — não só "deveria funcionar").
- Nunca dar `git push` direto pra `main`; nunca merge sem PR, mesmo
  trabalhando sozinho — o PR é o registro histórico da mudança e o ponto
  de review.
- Uma branch cobre uma feature/fix coesa. Não empilhar múltiplas features
  não relacionadas na mesma branch/PR.

## Exceção

Nenhuma. Hotfix urgente também passa por `fix/...` + PR — só o tempo de
review pode ser comprimido, o fluxo não.
