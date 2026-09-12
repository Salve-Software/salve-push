# Architecture Decision Records

Este diretório registra decisões arquiteturais significativas do Salve Push —
aquelas com alternativas reais, consequências duradouras, e custo de reversão
não trivial. Detalhes de implementação reversíveis sem impacto estrutural
(escolha de lib, nome de variável, formatação) não viram ADR.

## Formato

Cada ADR é um arquivo `NNNN-titulo-curto.md`, numerado sequencialmente,
nunca reordenado ou renumerado mesmo se depreciado.

```markdown
# ADR NNNN: Título

## Status
Proposed | Accepted | Deprecated | Superseded by ADR NNNN

## Contexto
Qual problema/força nos levou a decidir algo aqui. Sem viés pela decisão tomada.

## Decisão
O que decidimos, de forma direta.

## Consequências
O que fica mais fácil, o que fica mais difícil, o que isso nos obriga a manter.

## Alternativas consideradas
O que foi descartado e por quê.
```

## Regras

- Uma decisão por ADR. Se a discussão mistura dois assuntos independentes,
  vira duas ADRs.
- ADR é imutável depois de `Accepted`: mudou de ideia → nova ADR com
  `Status: Superseded by ADR NNNN`, e a antiga vira `Deprecated`.
- Escreva a ADR quando a decisão for tomada, não meses depois — o objetivo é
  capturar o *porquê* enquanto o contexto ainda está fresco.

## Índice

- [0001 — Topologia de repositórios e pacotes](0001-repository-and-package-topology.md)
- [0002 — OpenAPI como fonte única do protocolo](0002-openapi-as-protocol-source-of-truth.md)
