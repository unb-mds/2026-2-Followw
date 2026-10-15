# Dataset de currículos

Coletado em 14/10/2026 do portal público do SIGAA UnB, usando os 158 IDs de `courses.csv`.
`curricula.json` contém 189 estruturas ativas de 151 cursos. A janela é 2023–2026, incluindo
a versão anterior à janela por turno; sem versões nesse intervalo, fica a mais recente.
Engenharia Automotiva (414919) só tem uma estrutura ativa futura, preservada com vigência em 2027.

Cursos sem estruturas ativas na data da coleta:

| ID do curso | Curso | Situação no SIGAA |
| --- | --- | --- |
| 21916613 | Turismo | Uma estrutura inativa |
| 414345 | Engenharia Ambiental | Quatro estruturas inativas |
| 414393 | Ciências Biológicas | Nenhuma estrutura |
| 414404 | Ciências Sociais | Nenhuma estrutura |
| 414553 | Artes Visuais | Sete estruturas inativas |
| 414662 | Física Computacional | Uma estrutura inativa |
| 414882 | Educação do Campo — Ciências da Natureza e Matemática | Nenhuma estrutura |

Os arrays guardam códigos de componentes: `required_by_period` contém `{period, required}`;
`optional` reúne as optativas, inclusive as recomendadas dentro dos períodos, sem duplicatas.
`complementary` preserva componentes complementares. `valid_from` é o semestre de entrada em vigor
informado pelo SIGAA, e deve ser considerado ao selecionar um currículo por ingresso.

Para atualizar o dataset e carregar o banco, veja os comandos no [README](../README.md).
