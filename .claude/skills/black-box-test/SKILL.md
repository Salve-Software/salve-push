# Instruções para Criação de Testes Black Box de Controllers/Handlers

Analise o handler/controller fornecido e crie uma suíte de testes seguindo estritamente estas regras.

## Objetivo

Os testes devem validar o **contrato público da rota**, e não sua implementação interna.

Pense como um cliente consumindo uma API HTTP, porém sem subir um servidor. A função do handler/controller deve ser chamada diretamente, mas os testes devem ser escritos como se estivessem exercitando uma requisição HTTP real.

O foco é responder:

> "Se eu fosse um cliente consumindo esta rota, o comportamento observado corresponde ao contrato esperado?"

E nunca:

> "A implementação interna executou da forma que eu imagino?"

---

## Abordagem

Utilize uma abordagem de **Black Box Testing**.

O controller/handler deve ser tratado como uma **caixa-preta**.  
Você pode conhecer a assinatura pública da função, os inputs aceitos e o formato esperado de resposta, mas não deve acoplar os testes a detalhes internos da implementação.

---

## Não faça

- Não teste funções privadas.
- Não teste métodos internos.
- Não teste dependências internas.
- Não teste chamadas específicas de services, repositories, gateways ou clients.
- Não teste quantas vezes uma função foi chamada.
- Não utilize mocks para validar comportamento interno.
- Não faça assertions sobre detalhes internos do código.
- Não acople os testes à implementação atual.
- Não valide ordem interna de execução.
- Não valide se determinada dependência foi chamada.
- Não escreva testes que falhariam apenas porque o código interno foi refatorado.
- Não teste logs internos, variáveis internas, estados privados ou detalhes invisíveis para o cliente.
- Não assuma detalhes que não fazem parte do contrato público da rota.

---

## Faça

- Teste apenas entradas e saídas observáveis.
- Trate o controller como uma caixa-preta.
- Valide o comportamento esperado pelo consumidor da API.
- Garanta que o contrato público da rota seja respeitado.
- Escreva testes resilientes a refatorações internas.
- Pense como um cliente real consumindo a API, incluindo usos corretos, incompletos, confusos e inesperados.
- Considere que consumidores da API podem enviar payloads imperfeitos, inconsistentes, malformados ou fora do padrão documentado.
- Crie testes para edge cases improváveis, mas possíveis, desde que sejam relevantes para o contrato público da rota.
- Avalie como a rota se comporta diante de entradas extremas, ambíguas, contraditórias ou parcialmente válidas.
- Teste a robustez do endpoint contra dados que um usuário real poderia enviar por erro, desconhecimento ou integração mal feita.
- Adote também a mentalidade de uma pessoa mal-intencionada tentando abusar da rota.
- Crie testes pensando em possíveis tentativas de bypass de validação, mass assignment, manipulação de campos, alteração indevida de permissões, enumeração de recursos e exposição de dados sensíveis.
- Simule cenários que um pentester black box poderia tentar explorar, sempre validando apenas respostas públicas e efeitos observáveis.
- Verifique se entradas maliciosas ou inesperadas não causam vazamento de stack trace, detalhes internos, tokens, senhas, IDs sensíveis ou mensagens técnicas indevidas.
- Garanta que campos extras, campos desconhecidos ou campos sensíveis enviados pelo cliente não alterem comportamento que não deveria ser controlável externamente.
- Valide que erros retornados ao cliente sejam previsíveis, seguros e compatíveis com o contrato público da API.
- Valide apenas comportamento observável pelo cliente: status HTTP, body de resposta, headers relevantes e efeitos públicos esperados.

---

## Mentalidade dos Testes

Escreva os testes como se você fosse um QA ou consumidor externo validando uma API pública.

Considere diferentes perfis de cliente:

### Cliente correto

Um cliente que envia exatamente o payload esperado, com todos os campos válidos.

### Cliente incompleto

Um cliente que esquece campos obrigatórios, envia payload parcial ou omite informações importantes.

### Cliente confuso

Um cliente que envia tipos errados, estruturas inesperadas, valores nulos, strings vazias ou formatos inválidos.

### Cliente mal integrado

Um cliente que envia campos extras, nomes de campos errados, payloads antigos, payloads futuros ou objetos parcialmente incompatíveis.

### Cliente extremo

Um cliente que envia valores muito grandes, muito pequenos, arrays enormes, strings longas, Unicode, emojis ou caracteres especiais.

### Cliente mal-intencionado

Um cliente tentando abusar da rota para burlar validações, alterar campos indevidos, escalar privilégios ou obter dados que não deveria acessar.

Os testes devem refletir essa mentalidade.

---

## Cenários de Sucesso

Crie testes para:

- Requisição válida.
- Payload válido.
- Fluxo feliz.
- Status esperado.
- Estrutura do retorno.
- Dados retornados corretos.
- Headers relevantes, quando aplicável.
- Comportamento esperado quando campos opcionais são enviados.
- Comportamento esperado quando campos opcionais são omitidos.
- Resposta sem vazamento de informações internas.
- Garantia de que apenas campos públicos esperados aparecem no retorno.

---

## Validação de Contrato

Verifique cuidadosamente o contrato da rota.

### Campos obrigatórios

Teste:

- Campo ausente.
- Campo nulo.
- Campo undefined.
- Campo com tipo errado.
- Campo com valor vazio.
- Campo com valor inválido.
- Campo com formato inválido.
- Campo com valor fora dos limites esperados.

### Campos opcionais

Teste:

- Presença do campo opcional.
- Ausência do campo opcional.
- Campo opcional como null.
- Campo opcional como undefined.
- Campo opcional com tipo errado.
- Campo opcional com valor inválido.
- Campo opcional com estrutura inesperada.
- Campo opcional não deve ser tratado como obrigatório.

### Tipos

Teste exemplos como:

- String esperada recebendo número.
- String esperada recebendo boolean.
- String esperada recebendo objeto.
- String esperada recebendo array.
- Número esperado recebendo string.
- Número esperado recebendo boolean.
- Número esperado recebendo objeto.
- Número esperado recebendo array.
- Boolean esperado recebendo string.
- Boolean esperado recebendo número.
- Boolean esperado recebendo objeto.
- Array esperado recebendo objeto.
- Array esperado recebendo string.
- Array esperado recebendo null.
- Objeto esperado recebendo array.
- Objeto esperado recebendo string.
- Objeto esperado recebendo null.

### Estrutura

Teste:

- Payload vazio.
- Payload parcial.
- Payload malformado.
- Campos desconhecidos.
- Campos extras.
- Campos duplicados, quando aplicável.
- Objetos vazios.
- Objetos aninhados inesperados.
- Estruturas profundamente aninhadas.
- Arrays onde objetos eram esperados.
- Objetos onde arrays eram esperados.

---

## Edge Cases

Pense em todas as formas possíveis de utilização por um usuário real.

### Strings

Teste:

- String vazia.
- String com apenas espaços.
- String com tabs e quebras de linha.
- String muito curta.
- String muito longa.
- String com Unicode.
- String com emojis.
- String com acentos.
- String com caracteres especiais.
- String com HTML.
- String com SQL-like input.
- String com JSON serializado.
- String com caracteres de escape.
- String com espaços no início e no fim.
- String com casing diferente do esperado.

### Arrays

Teste:

- Array vazio.
- Array com um item.
- Array com múltiplos itens válidos.
- Array com itens inválidos.
- Array misturando tipos válidos e inválidos.
- Array muito grande.
- Array com objetos vazios.
- Array com objetos malformados.
- Array com valores duplicados.
- Array com null.
- Array com undefined.

### Números

Teste:

- Zero.
- Número positivo válido.
- Número negativo.
- Número decimal quando inteiro é esperado.
- Número inteiro quando decimal é esperado.
- Número muito grande.
- Número muito pequeno.
- Número acima do limite esperado.
- Número abaixo do limite esperado.
- NaN.
- Infinity.
- -Infinity.
- Número enviado como string.

### Booleanos

Teste:

- true.
- false.
- "true" como string.
- "false" como string.
- 1.
- 0.
- null.
- undefined.
- objeto no lugar de boolean.
- array no lugar de boolean.

### Objetos

Teste:

- Objeto vazio.
- Objeto válido.
- Objeto parcial.
- Objeto com campos extras.
- Objeto com campos desconhecidos.
- Objeto com campos sensíveis.
- Objeto aninhado inesperado.
- Objeto com valores null.
- Objeto com valores undefined.
- Objeto com tipos inválidos.

---

## Casos de Erro

Valide comportamentos como:

- Requisição inválida.
- Payload inválido.
- Payload vazio.
- Payload malformado.
- Recurso inexistente.
- Conflito de negócio.
- Estado inválido.
- Operação não permitida.
- Dados inconsistentes.
- Dados duplicados.
- Dados fora do domínio permitido.
- Falta de autenticação, quando aplicável.
- Falta de autorização, quando aplicável.
- Tentativa de acessar recurso de outro usuário, quando aplicável.
- Tentativa de alterar recurso que não deveria ser alterável.
- Erros previsíveis para o consumidor da API.

Para cada erro, valide:

- Status HTTP esperado.
- Estrutura do body de erro.
- Mensagem de erro segura e previsível.
- Ausência de stack trace.
- Ausência de detalhes internos.
- Ausência de dados sensíveis.
- Consistência do formato de erro entre cenários semelhantes.

---

## Segurança

Analise o endpoint apenas pela perspectiva de alguém que possui acesso à rota.

Crie testes que tentem identificar riscos visíveis em black box.

### Testes de abuso e bypass

Considere:

- Bypass de validações.
- Mass assignment.
- Campos extras inesperados.
- Campos internos enviados pelo cliente.
- Tentativa de alterar `id`, `userId`, `ownerId`, `role`, `permissions`, `isAdmin`, `status`, `createdAt`, `updatedAt` ou campos semelhantes.
- Escalação de privilégios.
- Manipulação de parâmetros.
- Manipulação de query string.
- Manipulação de path params.
- Manipulação de headers relevantes.
- Inconsistências de autorização.
- Acesso indevido a recursos de outro usuário.
- Operações em recursos inexistentes.
- Operações em recursos pertencentes a outro usuário.
- Operações fora do estado permitido.

### Inputs maliciosos

Teste payloads contendo:

- HTML.
- Script tags.
- SQL-like strings.
- JSON inesperado.
- Strings com escape.
- Strings com path traversal.
- Strings com comandos shell-like.
- Unicode estranho.
- Caracteres invisíveis.
- Emojis.
- Strings extremamente longas.
- Arrays extremamente grandes.
- Objetos profundamente aninhados.

O objetivo não é testar internals de segurança, mas garantir que a rota responda de forma segura, previsível e sem vazamento de informações.

### Vazamento de informações

Garanta que respostas não exponham:

- Stack traces.
- Mensagens técnicas internas.
- Nomes de tabelas.
- Queries SQL.
- Paths de arquivos.
- Variáveis de ambiente.
- Tokens.
- Senhas.
- Hashes sensíveis.
- Secrets.
- Dados privados de outros usuários.
- Campos internos do domínio.
- Informações que permitam enumeração indevida de recursos.

---

## Contrato de Resposta

Para respostas de sucesso, valide:

- Status HTTP.
- Estrutura do body.
- Campos obrigatórios no retorno.
- Tipos dos campos retornados.
- Valores importantes retornados.
- Ausência de campos sensíveis.
- Headers relevantes, quando aplicável.
- Formato consistente com o contrato público.

Para respostas de erro, valide:

- Status HTTP.
- Estrutura padronizada do erro.
- Código de erro, quando aplicável.
- Mensagem segura.
- Ausência de dados internos.
- Ausência de stack trace.
- Ausência de informações sensíveis.
- Consistência com outros erros da API.

---

## Critérios de Qualidade

Os testes devem:

- Ser orientados ao comportamento.
- Ser orientados ao contrato.
- Ser independentes da implementação.
- Cobrir cenários reais de uso.
- Cobrir edge cases relevantes.
- Cobrir riscos de segurança visíveis ao consumidor da API.
- Ser fáceis de entender.
- Ter nomes descritivos.
- Expressar a intenção do teste.
- Evitar duplicação excessiva.
- Usar helpers apenas quando eles melhorarem clareza.
- Manter o foco no comportamento público da rota.
- Continuar válidos mesmo se a implementação interna for refatorada.

Os testes não devem falhar caso a implementação interna mude, desde que o contrato externo permaneça o mesmo.

---

## Estilo dos Testes

Nomeie os testes com foco no comportamento observado.

Prefira nomes como:

```ts
it("returns 201 and the created user when payload is valid", async () => {})
it("returns 400 when required email is missing", async () => {})
it("ignores unknown fields instead of allowing mass assignment", async () => {})
it("does not expose sensitive fields in the response", async () => {})
it("returns 403 when trying to access another user's resource", async () => {})
```

Evite nomes como:

```ts
it("calls userService.create once", async () => {})
it("calls repository with correct params", async () => {})
it("throws ValidationError from service", async () => {})
it("uses mapper correctly", async () => {})
```

---

## Organização Esperada

Organize a suíte de testes de forma clara.

Sugestão:

```ts
describe("POST /example", () => {
  describe("success", () => {
    // fluxo feliz e variações válidas
  })

  describe("validation", () => {
    // campos obrigatórios, tipos inválidos, payloads ruins
  })

  describe("edge cases", () => {
    // strings extremas, arrays, valores limites, unicode, etc.
  })

  describe("security", () => {
    // mass assignment, payload malicioso, vazamento de dados, autorização
  })

  describe("error handling", () => {
    // conflitos, recurso inexistente, estado inválido, operação proibida
  })
})
```

Adapte a organização conforme a rota analisada.

---

## Importante Sobre Dependências

Se for necessário substituir dependências para permitir que o controller rode isoladamente, faça isso apenas como mecanismo de ambiente de teste.

Não faça assertions sobre essas dependências.

Permitido:

* Criar fixtures.
* Criar fake data stores.
* Criar stubs mínimos para permitir o comportamento observável.
* Configurar o contexto necessário para chamar o handler.
* Simular usuário autenticado quando isso fizer parte do contrato da rota.
* Simular diferentes estados públicos do sistema, como recurso existente, recurso inexistente, conflito, usuário sem permissão, etc.

Não permitido:

* Verificar se um service foi chamado.
* Verificar quantidade de chamadas.
* Verificar argumentos internos enviados para repositório.
* Testar detalhes do fluxo interno.
* Fazer o teste depender da estrutura interna do domínio.

O teste pode preparar o cenário, mas deve validar apenas a resposta pública e os efeitos observáveis.

---

## Resultado Esperado

Gere uma suíte de testes que valide:

* Contrato da rota.
* Comportamento observável.
* Casos de sucesso.
* Casos de erro.
* Edge cases.
* Robustez.
* Segurança.
* Ausência de vazamento de dados sensíveis.
* Resiliência contra inputs inesperados.
* Comportamento esperado para clientes reais e clientes mal-intencionados.

Considere o handler/controller uma **caixa-preta** e escreva os testes exatamente como um cliente externo, QA ou pentester black box validaria uma API pública.

---

## Saída Esperada

Ao gerar os testes:

1. Identifique brevemente o contrato público inferido da rota.
2. Liste os principais cenários que serão cobertos.
3. Gere a suíte de testes completa.
4. Use nomes de teste descritivos.
5. Não inclua testes de implementação interna.
6. Não inclua asserts sobre chamadas internas.
7. Não inclua mocks usados para verificar detalhes internos.
8. Garanta que os testes chamem diretamente o handler/controller, sem subir servidor HTTP.
9. Ainda assim, escreva os testes como se estivessem validando uma requisição HTTP real.
10. Priorize qualidade, clareza e cobertura de comportamento observável.
