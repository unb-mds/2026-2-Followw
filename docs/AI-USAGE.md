# Registro de uso de IA

Os agentes de IA compuseram um papel muito importante no desenvolvimento do Followw, inclusive para o aprendizado de cada membro da equipe. É evidente que sem o uso de IA não seria possível um desenvolvimento tão acelerado e eficiente do projeto, algumas coisas seriam quase inviáveis sem o uso dos agentes, considerando a quantidade de código legado do SIGAA que tivemos que lidar e a abrangência do projeto. Nesse sentido, é importante ressaltar que o uso da inteligência artificial não substituiu (e nem poderia) o processo criativo e o pensamento crítico de cada integrante ao trabalhar no projeto.

Este documento relata como o uso dessas ferramentas foi utilizado em cada parte do projeto, por cada membro do time e quais resultados eles trouxeram.

## Alto uso

- Arquivos de configuração: definições de workflows automáticose configuração do docker compose são arquivos pequenos e bem legíveis, fáceis de auditar e revisar. Portanto o uso da IA nesses casos serviu como forma de facilitar os processos e permitir que mais esforços fossem realizados em outras áreas mais trabalhosas.

- Scrappers: A aplicação em código dos scrappers teve uso relevante de agentes. Devido ao alto número de funções com lógicas semelhantes, foi concluído que o uso da IA seria útil para evitar esforços repetitivos. Porém, tal decisão foi tomada a partir da elaboração bem fundamentada de como os scrappers de cada área funcionariam, permitindo que, após o código ser escrito, uma análise e revisão respaldada no funcionamento idealizado fosse feita. Dessa forma, o risco de erros, vindos da inteligência artificial, foram reduzidos    de forma pertinente, garatindo que os resultados esperados viessem a ser alcançados.

- Testes: Utilizamos agentes para a escrita de uma parcela considerável dos testes automatizados. Foi entendido que, por mais que testes não fazem parte do escopo
da disciplina, é uma parte que exige menos esforço criativo e permite um certo grau de automatização. Ainda assim, isso não eliminou o acompanahmento e a verificação do código gerado, os membros atribuidos a essa função participaram ativamente na produção dos testes e sua validação, assegurando que todas as funções importantes do projeto fossem devidamente experimentadas e analisadas. 

## Uso moderado

- Endpoints: A produção em código dos endpoints teve um trabalho mesclado. Toda a projeção a priori foi feita sem o uso de agentes, a partir dos resultados obtidos nas pesquisas da primeira sprint e conhecimentos anteriores. A aplicação da elaboração feita anteriormente teve uso leve de inteligência artificial, foi utilizado apenas para facilitar parâmetros reincidentes, mensagens de resposta semelhantes e outros processos que exigem menos criatividade. 

- Modelos do banco: O processo de estruturação das tabelas foi planejado sem nenhum uso de IA. Porém, na tradução para o ORM e a aplicação em código, foi utilizado auxilio de agentes, buscando evitar processos repetitivos e acelarar o andamento do projeto.

## Uso irrelevante ou nulo

- Documentação: Os relatórios das sprints, requisitos e segurança não tiveram uso relevante de IA, todo o emprego de agentes de IA envolvido em documentação foi na organização do arquivo final, por meio da criação de templates, especificado no caso do Template.md nas sprints e no arquivo de requisitos. 

- Instalação dos arquivos base: as ferramentas de cli como `uv init`, `bun create vite`, etc. já fazem este papel, não é necessário usar IA nessas etapas.

- Organização do código: A forma de dividir o repositório entre apps e packages foi escolhida manualmente e é um padrão muito bem consolidado em monorepos. A ideia aqui foi tratar os scrappers internos como se fossem bibliotecas, enquanto a api e o site são os apps que as utilizam.

---

## Técnicas utilizadas

- Modelos:
    - Claude Soonet 5 (Eliabe)
    - Claude Opus 5.5 (Eliabe)
    - Gemini Flash 3.8 (Gaspar, Kauã, Paizão, Samuel)
    - GPT 5.6-Luna (Galvão)
    - GPT 6-Astra (Diego)
- Skills:
    - grill-me: Todos
    - scalar-docs: Kauã e Samuel
- MCPs:
    - Playwright: para ajudar na criação dos scrappers (Eliabe, Diego)
    - Vercel: para criar os projetos, as configurações de deploy foram feitas manualmente


---
Esse arquivo foi redigido de forma manual, sem nenhum uso de qualquer agente de IA, em conjunto com todos os participantes do grupo. Ele estará em atualização contínua até o lançamento da R2. 