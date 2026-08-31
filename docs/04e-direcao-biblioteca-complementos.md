# Direção de experiência — Épico 4E

## Superfície e intenção

A biblioteca de complementos é uma extensão da superfície **Operate** do gestor Tempero. Ela atende quem organiza o cardápio durante a rotina do restaurante e precisa provar, de relance, onde cada grupo aparece, se está disponível e qual será o alcance de uma alteração.

Não houve comp visual aprovado para esta fatia. A direção é **code-led** e deriva dos padrões já presentes no backoffice, do `PRODUCT.md` e de `docs/04-brand-design-system.md`.

## FORM e semente

- **FORM:** biblioteca operacional compacta, combinando linhas escaneáveis com edição progressiva dentro do próprio card. A visão fechada serve para localizar e agir; a visão aberta concentra vínculo, regras e opções sem trocar de contexto.
- **Semente:** linguagem visual do backoffice existente — Inter, cards de 20 px, controles de 14 px, Brasa reservado à ação e ao estado selecionado, fundos neutros e microcopy de restaurante.
- **Referência de produto:** o grupo é um ativo reutilizável do cardápio, não um detalhe preso a um único produto.

## Promessas verificáveis

1. O gestor consegue buscar, filtrar e comparar grupos sem abrir cada produto.
2. Toda edição compartilhada explicita quantos produtos serão afetados e oferece a saída de criar uma cópia independente.
3. Pausar, remover e desvincular são estados distintos; ações destrutivas ou de alcance amplo pedem confirmação contextual.
4. Um grupo opcional de escolha única permite voltar ao estado sem escolha no storefront.
5. A interface funciona a 390 px sem rolagem horizontal e mantém alvos interativos de pelo menos 44 px.
6. Campos têm borda forte e foco Tempero visível; estados críticos usam os tokens com contraste AA.
7. Carregamento, vazio, erro e sucesso permanecem compreensíveis sem depender de toast efêmero.

## Limites desta extensão

- Não cria um novo universo visual nem altera a navegação global.
- Não adiciona promoções, combos, estoque automático ou integrações de marketplace.
- Não transforma reutilização em sincronização implícita: o vínculo compartilhado e a cópia independente continuam sendo decisões explícitas.
