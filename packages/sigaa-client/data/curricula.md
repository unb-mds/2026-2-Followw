# Dataset de currículos

Coletado em 14/10/2026 do portal público do SIGAA UnB, usando os 158 IDs de `courses.csv`.
`curricula.csv` contém 189 estruturas ativas de 151 cursos. A janela é 2023–2026, incluindo
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

`curricula.csv` guarda `sigaa_id,course_sigaa_id,code,created_year,active,shift,valid_from,matrix`.
`shift` usa `D` (diurno) ou `N` (noturno); turno indefinido fica vazio.
`curriculum_components.csv` guarda `course_sigaa_id,curriculum_sigaa_id,period,kind,subject_codes`.
São 1.824 linhas, uma por período de cada currículo, preservando 46.208 vínculos de componentes.
`subject_codes` contém os códigos separados por espaço; uma lista vazia deixa o campo vazio.
O par curso e ID da matriz relaciona os arquivos. `kind` distingue obrigatórias (`required`,
período maior que zero), optativas (`optional`, período zero) e complementares (`complementary`,
período vazio). Optativas recomendadas em períodos também ficam no período zero, sem duplicatas.
Períodos obrigatórios vazios retornados pelo SIGAA também são preservados na coleta.
`valid_from` é o semestre de entrada em vigor
informado pelo SIGAA e deve ser considerado ao selecionar uma matriz por ingresso.

Para atualizar o dataset e carregar o banco, veja os comandos no [README](../README.md).
