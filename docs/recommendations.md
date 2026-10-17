# Recomendações de matérias — v3

`GET /public/subjects` sem `q`, `code` e `unit` devolve as recomendações do aluno de
graduação logado, no lugar da listagem padrão da unidade. Visitantes recebem 422, como
antes, e usuários fora da graduação também. Com qualquer filtro, a busca é a comum.

A resposta é a mesma lista de `CatalogSubject` da busca, com as turmas do semestre da oferta,
ordenada pelo ranking e com `recommendation: {score, reasons}` em cada matéria. Na busca
comum, `recommendation` é `null`. A soma de `reasons[].points` é o score; nos critérios
acumulativos, `reasons[].value` traz a quantidade medida (semestres, matérias ou horas).

Para quem está logado, toda resposta do `/public/subjects` (busca ou recomendação) traz
`kind`: `mandatory`, `optional` (inclui complementares) ou `free` (fora da matriz). Na busca
comum, a matriz é estimada só com o que está gravado, sem ir ao SIGAA; sem login ou sem
matriz, `kind` é `null`.

A aba de busca exibe as recomendações, seus motivos e turmas para alunos de graduação quando
não há texto ou filtros aplicados. A pontuação não é persistida no cache offline.

O código fica em `api/modules/recommendations`: `ranking.py` é puro (sem banco ou rede),
`repository.py` carrega histórico, matriz e oferta, e `service.py` sincroniza as fontes.
O `public_subjects` só anexa o resultado ao catálogo.

## Fontes e inferência

A oferta é o semestre mais recente entre as turmas gravadas, comparado por ano/período.
O `classrooms.csv` é mantido com as turmas do semestre corrente; lotação não é em tempo real.

Perfil, lista própria de turmas e menções usam `Sync.resolve` e as tarefas existentes.
Cache ausente exige sincronização; histórico sincronizado vazio é válido. Só vínculos
próprios de aluno com semestre válido até a oferta entram no histórico. A recomendação
é para o próximo semestre: matérias aprovadas (SS/MS/MM) ou em andamento contam como
concluídas, saem da lista e satisfazem pré/correquisitos. Reprovações posteriores não
apagam aprovações.

A matriz ativa é estimada pelo curso/turno do perfil armazenado, vigência e primeiro
semestre disponível do histórico. Sem histórico usa-se a vigência elegível mais recente;
se o histórico preceder todas, a mais antiga elegível. Revisão do código e
ID SIGAA desempatam. Nenhuma matriz futura ou de turno oposto é escolhida silenciosamente.
O turno disponível vem do curso resolvido pelo sync, não de uma confirmação adicional.

O período alvo é a mediana inferior dos períodos obrigatórios em andamento + 1. Sem eles,
é o primeiro período com menos da metade das obrigatórias concluídas; depois, o último com
pendências; se todas foram concluídas, último + 1. Códigos sem detalhes de catálogo também
contam no fluxo. Sem matriz utilizável, nenhuma matéria é recomendada, porque não é possível
distinguir módulo livre. Com matriz e sem período inferível, permanecem os demais critérios.
Atraso é uma obrigatória pendente de período anterior ao alvo.

## Elegibilidade e score

O universo abrange toda a universidade: entra toda matéria com turma no semestre da oferta.
As exclusões são contadas uma vez, nesta ordem: aprovada, em andamento, pré-requisitos,
correquisitos, matriz indisponível, módulo livre. Fora da matriz é módulo livre;
componentes optativos e complementares da matriz não são. Regras são OU de grupos E.
Equivalências não satisfazem requisitos e correquisitos não são projetados como matrícula
simultânea.

Critérios absolutos:

| Parcela | Pontos |
| --- | ---: |
| Obrigatória da matriz | 50 |
| Próximo período do fluxo | 25 |
| Obrigatória atrasada | 15 |
| Mesma unidade do curso | 5 |

Critérios acumulativos:

| Parcela | Pontos |
| --- | ---: |
| Cadeia mais longa (`chain_length`) | 10 por semestre |
| Cadeia mais larga (`chain_width`) | 5 por matéria |
| Carga horária (`hours`) | 1 a cada 15 h, arredondado para baixo |

As cadeias só valem para candidatas obrigatórias e usam o grafo de pré-requisitos das
obrigatórias pendentes da matriz (não aprovadas nem em andamento), com ou sem oferta. A cadeia mais longa conta os semestres que vêm
depois da candidata (A → B → C → D vale 30); a mais larga conta todas as descendentes,
diretas ou indiretas. Basta a candidata aparecer em algum grupo de pré-requisito.

Ordenação: score decrescente, obrigatória, menor período positivo e código. Turmas cheias
permanecem; as turmas vêm como na busca comum.

## Cache e limitações

As fontes seguem SWR, `FRESH`/`FROZEN` e diretivas de entrada `Cache-Control`.
`no-cache` revalida fontes não congeladas. A resposta sempre usa `Cache-Control: no-store`.

Sessão inválida: 401. Sem filtros, visitante ou usuário fora da graduação: 422. Falhas de
fontes seguem os handlers existentes (502/503/504). Sem oferta ou candidatas: lista vazia.
O histórico não inclui todas as dispensas/aproveitamentos. O resultado não é uma grade
pronta nem autorização de matrícula.

## Validação local

```bash
uv sync --all-packages
uv run ruff format .
uv run pytest apps/api/tests/test_recommendations.py
uv run pytest apps/api
uv run pytest packages/sigaa-client/tests
```

Os testes usam dados sintéticos, SQLite temporário e SIGAA simulado, sem validar produção.
