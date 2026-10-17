# Recomendações de matérias — MVP v2

`GET /me/recommendations` usa a autenticação SIGAA existente e retorna até dez
matérias. `?limit=1..100` altera somente o tamanho da resposta. Outros parâmetros
são rejeitados com 422; o aluno não informa curso, ingresso, período ou aprovações.
A aba de busca de alunos de graduação autenticados exibe as recomendações, seus motivos
e turmas quando não há texto ou filtros aplicados. Pesquisas e filtros usam a busca padrão.
Visitantes veem a busca padrão, sem listar matérias automaticamente. As demais abas mantêm
o comportamento original.
A pontuação não é persistida no cache offline; atualizar força nova consulta.

A resposta inclui `score_version`, `total` antes do limite, `items`, `context`,
`history`, `diagnostics` e `warnings`. Cada item contém a matéria, vínculo curricular,
score, parcelas positivas, códigos desbloqueados, alvos de equivalência, selos e turmas.
A soma de `reasons[].points` é o score. `context.curriculum.code` identifica a versão
selecionada; `curriculum_selection` é sempre `estimated`.

## Fontes e inferência

A oferta é o semestre mais recente entre as turmas com `listed_in_offer=true`,
comparado por ano/período. O snapshot versionado é de **2026.2**: ele não comprova
oferta futura ou lotação em tempo real. Turmas de histórico não ampliam a oferta.
Os detalhes de horário e sala preservam os valores existentes no banco.

Perfil, lista própria de turmas e menções usam `Sync.resolve` e as tarefas existentes.
Cache ausente exige sincronização; histórico sincronizado vazio é válido. Só vínculos
próprios de aluno com semestre válido até a oferta entram no histórico. Aprovações
SS/MS/MM no semestre alvo excluem a matéria, mas somente aprovações anteriores
satisfazem pré/correquisitos. Reprovações posteriores não apagam aprovações.

A matriz ativa é estimada pelo curso/turno do perfil armazenado, vigência e primeiro
semestre disponível do histórico. Sem histórico usa-se a vigência elegível mais recente;
se o histórico preceder todas, a mais antiga elegível, com aviso. Revisão do código e
ID SIGAA desempatam. Nenhuma matriz futura ou de turno oposto é escolhida silenciosamente.
O turno disponível vem do curso resolvido pelo sync, não de uma confirmação adicional.

O período é a mediana inferior dos períodos obrigatórios em andamento. Sem eles,
usamos o primeiro período com menos da metade dos códigos obrigatórios aprovados
anteriormente; depois, o último com pendências; se todos foram aprovados, último + 1.
Códigos sem detalhes de catálogo também contam no fluxo. Sem matriz utilizável, nenhuma matéria é recomendada: não é possível distinguir módulo livre.
Com matriz e sem período inferível, permanecem os demais critérios.
`context.period` descreve a região atual do fluxo; `context.target_period` é o alvo do bônus:
período inferido + 1 quando há obrigatórias em andamento, ou o próprio período inferido
pelas pendências quando não há. Atraso compara com o período atual inferido, não com o alvo.

## Elegibilidade e score

O universo abrange toda a universidade. Só entram matérias de catálogo certificado,
com código/nome, carga positiva e unidade existente, e com turma marcada no semestre.
As exclusões são contadas uma vez, nesta ordem: catálogo, aprovada, em andamento,
pré-requisitos, correquisitos, matriz indisponível, módulo livre. Fora da matriz é módulo
livre, exceto se a candidata completar uma equivalência a obrigatória pendente. Componentes
complementares da matriz não são módulo livre. Regras são OU de grupos E; null/lista vazia só permitem
matrícula quando a ausência de regra foi certificada. Equivalências não satisfazem
requisitos e correquisitos não são projetados como matrícula simultânea.

| Parcela | Pontos |
| --- | ---: |
| Obrigatória da matriz | 50 |
| Próximo período do fluxo | 40 |
| Mesma unidade do curso | 30 |
| Desbloqueio direto incremental | 5 por código, até 20 |
| Obrigatória atrasada | 15 |
| Equivalência incremental a obrigatória pendente | 10 uma vez |
| Optativa da matriz | 5 |

Desbloqueio compara as regras antes/depois de acrescentar a candidata às aprovações
anteriores; só conta matérias pendentes da matriz com catálogo completo, mesmo sem
oferta. Equivalência usa a mesma comparação na expressão cadastrada **no alvo**:
a expressão em Y lista alternativas que substituem Y. O alvo deve ser obrigatório,
não concluído e não estar em andamento. Optativas e complementares não dão esse bônus. Não há simetria/transitividade.
O parser `public/classrooms.py::_parse_details` lê o campo Equivalências da tela de Y;
a fixture `test_componentes_trazem_requisitos_e_carga_horaria_dos_detalhes` conserva
FGA0001 como expressão de FGA0030 e ignora o histórico inativo. O teste HTTP
`test_directional_equivalence_incremental_and_single_bonus` verifica essa direção.

Score zero é válido; máximo 150. Ordenação: score decrescente, obrigatória, menor
período positivo e código. Só depois se aplica o limite. Turmas ordenam por número/UUID.
Turma cheia ou superlotada permanece: `availability=full`, `is_locked=true`. Se vagas
ou ocupação estiverem ausentes, `unknown`, com campos desconhecidos nulos.

## Certificação e snapshots

`subjects.csv` exige `catalog_complete` (`true`/`false`). O coletor detalhado só certifica
após ler os três campos de regras e verificar código, nome, horas e unidade. O completador
de referências grava `false`; o sync nunca certifica e invalida a certificação ao mudar
nome, horas ou unidade sem validar o conjunto. O seed importa a flag explicitamente.

Verificação do dataset existente em 16/10/2026:

- `collect_subjects.subject_rows` associa a unidade consultada ao resultado de
  `iter_subjects`, cujo parser exige os três campos de regras, inclusive quando vazios.
- `complete_subjects` acrescenta referências com unidade e regras ausentes, preservando
  as linhas originais; não há outro produtor de linhas nesse pipeline.
- Todas as linhas com unidade possuem código, nome, carga positiva e unidade no CSV de
  unidades. Todas as linhas sem unidade têm os três campos de regras vazios.
- Foram certificadas as 3.487 linhas provenientes da coleta detalhada; 1.081 referências
  permanecem parciais. A distinção depende dessa proveniência, e não de inferência do seed
  por campos vazios. Não foi feita nova coleta online.

`classrooms.csv` exige `snapshot_complete=true` em todas as linhas para ser importado.
O coletor marca `false` com `--unit`, exige saída fora do CSV de produção e só marca
`true` depois de concluir todas as unidades. Falha de qualquer unidade impede publicação.
O seed rejeita arquivo vazio/parcial antes de desmarcar e troca a marcação no mesmo
commit do upsert. Turmas removidas do arquivo e seus vínculos permanecem no banco,
com `listed_in_offer=false`. Horário/sala de registros existentes são preservados.

## Instalação e limitações

As colunas novas são `Subject.catalog_complete` e `Classroom.listed_in_offer`, ambas
com padrão false. **É necessário recriar o banco de desenvolvimento e executar o seed
com os CSVs atualizados.** `db-init` não altera colunas existentes. Esta implementação
não contém migrations nem aplica alterações de schema automaticamente em produção.
Não apagar bancos com dados importantes para executar essa atualização.

A pontuação é identificada como `score_version: "v2"`.

As fontes seguem SWR, `FRESH`/`FROZEN` e diretivas de entrada `Cache-Control`.
`no-cache` revalida fontes não congeladas; cache stale permitido é sinalizado.
A saída personalizada sempre usa `Cache-Control: no-store`, sem cache de score.
Os instantes em `history` são de sync local; não são datas oficiais de publicação/coleta.

Sem autenticação: 401. Limite/parâmetros inválidos ou usuário conhecido fora da graduação:
422. Falhas de fontes seguem os handlers existentes (502/503/504). Sem oferta válida ou
candidatas elegíveis: 200 com lista vazia e diagnóstico. Não se completa a lista com
matérias parciais. O histórico não inclui todas as dispensas/aproveitamentos; equivalência
serve apenas para score/selo. O resultado não é uma grade pronta nem autorização de matrícula.

## Validação local

```bash
uv sync --all-packages
uv run ruff format .
uv run pytest apps/api/tests/test_recommendations.py
uv run pytest apps/api
uv run pytest packages/sigaa-client/tests
```

Os testes usam dados sintéticos, SQLite temporário e SIGAA simulado, sem validar produção.
