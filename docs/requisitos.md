# Documento de Requisitos de Software: Followw UnB
Versão: 0.1.0 (Escopo da Release 1 / MVP)
Data: 15 de Setembro de 2026

## 1. **Visão Geral do Projeto**

* O projeto **Followw UnB** nasce de um problema simples e conhecido de qualquer estudante da Universidade de Brasília (UnB): informações vitais da rotina acadêmica estão dispersas em dezenas de plataformas distintas, com interfaces datadas, falta de padronização visual e funcional e, na grande maioria das vezes, ausência completa de integração. Acessar o cardápio do Restaurante Universitário (RU), acompanhar editais de assistência estudantil e pesquisa, consultar o calendário acadêmico oficial ou simplesmente verificar o andamento e os participantes de suas turmas exige navegar por portais desconexos e burocráticos.

* O **Followw UnB** se propõe a solucionar essa fragmentação por de uma API centralizadora concebida para unificar e estruturar os dados espalhados da UnB. Inspirado em ecossistemas modernos de outras universidades, o projeto vai além da simples agregação de dados públicos: seu grande diferencial é viabilizar o acesso seguro e autenticado a dados e operações da área logada do **SIGAA** (Sistema Integrado de Gestão de Atividades Acadêmicas) — o sistema mais crítico, lento e historicamente deficitário em usabilidade na universidade.

* **Natureza e Governança:** O Followw UnB é uma iniciativa independente, de caráter estritamente acadêmico e educacional, sem vínculo institucional formal com a administração da UnB ou com a mantenedora do SIGAA. O projeto visa investigar a interoperabilidade com sistemas legados e fornecer aos próprios estudantes uma experiência moderna, rápida e confiável. O uso é facultativo e de responsabilidade de cada usuário.

### Pilares Filosóficos e Arquiteturais:
  * **Código Aberto (Open Source):** Todo o repositório é distribuído sob a licença permissiva **MIT**, permitindo auditoria, modificação, reprodução e contribuições comunitárias.
  * **Modularidade:** A arquitetura é construída com um núcleo (*core*) reduzido e desacoplado, dividindo scrapers, adaptadores de fontes e regras de negócio em componentes isolados e independentes.
  * **Extensibilidade:** A plataforma é projetada para ser facilmente estendida por novos módulos, provedores de dados e clientes (front-end web, mobile, bots e integrações externas) sem comprometer o núcleo estável do sistema.

---

## 2. **Requisitos Funcionais (RF)**
* Os requisitos funcionais descrevem o comportamento observável e as capacidades que a API e seus serviços oferecem. Estão estruturados em Épicos e Histórias de Usuário, seguidos de seus respectivos requisitos formais e critérios de aceitação.

---

### **ÉPICO 1: Autenticação e Gestão de Perfil**
* Conjunto de funcionalidades responsáveis por mediar o acesso autenticado ao SIGAA, gerenciar a sessão do usuário de forma segura e stateless e disponibilizar os dados cadastrais do perfil do estudante.

#### **História de Usuário 1.1: Autenticação no SIGAA**
Como um estudante da UnB:
* Eu quero realizar login na plataforma utilizando minhas credenciais institucionais do SIGAA (matrícula e senha), para que a aplicação possa acessar minhas informações acadêmicas sem necessidade de criar credenciais paralelas.

* **RF01: Autenticação de Usuário via SIGAA:** O sistema deve fornecer um endpoint de login que recebe as credenciais do usuário (matrícula e senha), autentica-as na camada legada do SIGAA e inicializa a sessão mantendo cookies de sessão ativos sem persistir a senha do usuário em banco de dados ou logs.

**Critérios de Aceitação:**
* O sistema deve validar o par matrícula/senha diretamente contra o SIGAA.
* Caso as credenciais sejam inválidas ou haja bloqueio no SIGAA, o sistema deve retornar mensagem de erro clara e código de status HTTP correspondente (401 Unauthorized).
* Nenhuma senha ou credencial sensível deve ser registrada em logs ou retida em armazenamento persistente.
* A sessão do usuário deve ser mantida enquanto durar a validade dos cookies da sessão original ou até logout explícito/expiração por inatividade.

#### **História de Usuário 1.2: Consulta de Perfil Pessoal**
Como um estudante autenticado:
* Eu quero visualizar os dados básicos do meu perfil acadêmico (/me), para conferir minha identidade, curso e situação cadastral no sistema.

* **RF02: Visualização de Perfil Pessoal (/me):** O sistema deve disponibilizar um endpoint protegido (GET /me) que consulta o SIGAA e retorna `name`, `registration`, `photo`, `email`, `bio`, `unity`, `course`, `integralization`, `ira`, `mp` e `level`, com os mesmos nomes das colunas do banco.

**Critérios de Aceitação:**
* O endpoint deve exigir autenticação válida (sessão ativa).
* Os dados retornados devem ser padronizados em formato JSON legível e normalizado.
* A autenticação utiliza os cookies emitidos por `POST /auth/sigaa`. A sessão do SIGAA é renovada quando possível; credenciais ausentes ou inválidas retornam HTTP 401 e falhas do SIGAA retornam HTTP 502 nesta rota.
* Foto, bio, integralização, IRA e MP indisponíveis são retornados como `null`. O e-mail também é `null` enquanto o cliente não conseguir obter o endereço completo; o portal do discente só exibe o endereço truncado.
* A consulta não persiste o perfil nem as credenciais e não depende de conexão com o banco. O `UserRepository` estabelece o acesso ao banco por matrícula para os módulos que precisarem de dados persistidos.

---

### **ÉPICO 2: Sincronização e Gestão de Turmas Matriculadas**
* Conjunto de funcionalidades voltadas à extração, armazenamento em cache de alta performance e exibição das turmas e membros em que o aluno está formalmente matriculado.

#### **História de Usuário 2.1: Listagem e Detalhes das Turmas do Aluno**
Como um estudante autenticado:
* Eu quero listar rapidamente as turmas em que estou matriculado no semestre atual e visualizar os detalhes de cada turma (horários, local, docentes e lista de colegas de classe), para me organizar academicamente e identificar contatos na disciplina.

* **RF03: Listagem de Turmas Matriculadas (/classrooms):** O sistema deve disponibilizar um endpoint protegido (GET /classrooms) que consulta as turmas atuais do estudante no SIGAA. Cada item retorna `number`, `semester`, `schedule`, `room` e `subject` com `name`, `code`, `hours` e `unity`, além dos identificadores fornecidos pelo cliente SIGAA.
* **RF04: Detalhes da Turma e Relação de Colegas (/turmas/<id>):** O sistema deve fornecer um endpoint protegido (GET /turmas/<id>) para consultar os dados específicos de uma disciplina selecionada, incluindo código, nome, horário, local/sala, docentes e a lista completa de colegas matriculados na mesma turma.

**Critérios de Aceitação:**
* A listagem usa os cookies de `POST /auth/sigaa` e retorna HTTP 401 para credenciais ausentes ou inválidas e HTTP 502 para falhas do SIGAA.
* Sem turmas atuais, o retorno é HTTP 200 com `[]`. Campos opcionais indisponíveis são `null`. A consulta não persiste dados nem depende do banco; cache e sincronização pertencem ao RF05.
* A visualização detalhada deve expor a lista de colegas de turma com nome e matrícula (ou identificador único retornado pelo SIGAA).
* Requisições para turmas inexistentes ou para as quais o usuário não tem permissão de visualização devem retornar código 404 (Not Found) ou 403 (Forbidden).

#### **História de Usuário 2.2: Sincronização e Atualização do Cache**
Como um estudante autenticado:
* Eu quero que as minhas turmas e colegas fiquem disponíveis rapidamente a partir de cache, mas com a opção de forçar uma nova sincronização com o SIGAA a qualquer momento, para que o app seja rápido e eu possa refletir alterações recentes de matrícula (como ajustes ou trancamentos).

* **RF05: Sincronização e Invalidação de Cache sob Demanda:** O sistema deve armazenar em cache os dados de turmas e colegas obtidos do SIGAA para reduzir a latência de consultas subsequentes, oferecendo parâmetros ou endpoints específicos para forçar a re-extração e atualização imediata desse cache.

**Critérios de Aceitação:**
* Quando o RF05 for implementado, as consultas a /classrooms e /turmas/<id> deverão responder com base no cache pré-carregado sempre que disponível e válido.
* Ao acionar a opção de atualização manual (forçar sincronização), a API deve refazer as requisições ao SIGAA, atualizar a base de cache e retornar a versão recém-sincronizada.
* Caso o SIGAA esteja temporariamente indisponível durante uma solicitação de atualização forçada, o sistema deve registrar o erro e manter intactos os dados armazenados no cache anterior.

---

### **ÉPICO 3: Busca e Descoberta de Turmas**
* Conjunto de recursos para pesquisa e exploração de turmas, tanto no âmbito das matrículas individuais do aluno quanto no catálogo aberto da UnB.

#### **História de Usuário 3.1: Pesquisa de Turmas**
Como um estudante:
* Eu quero buscar turmas tanto entre as disciplinas em que estou matriculado quanto na listagem geral de turmas ofertadas pela UnB no período, para que eu possa localizar matérias de interesse, verificar horários e checar professores ofertantes.

* **RF06: Busca em Turmas Matriculadas:** O sistema deve permitir filtragem e busca textual sobre a lista de turmas em que o aluno está inscrito, filtrando por nome da matéria, código ou docente.
* **RF07: Consulta Geral de Turmas da UnB:** O sistema deve disponibilizar funcionalidade de busca no catálogo completo de turmas e componentes curriculares ofertados na universidade, aceitando filtros por departamento/unidade acadêmica, código ou nome da disciplina, nome do professor e semestre letivo.

**Critérios de Aceitação:**
* A busca deve ser insensível a maiúsculas/minúsculas e tolerar acentuação.
* A busca pública/geral não deve depender de credenciais privadas caso consulte a listagem aberta de turmas do SIGAA.
* Os resultados devem ser paginados ou limitados para garantir tempos de resposta eficientes.


#### **História de Usuário 3.2: Visualização e Compartilhamento de Estatísticas de Turmas Anteriores**
Como um estudante:
* Eu quero poder optar por compartilhar anonimamente estatísticas de aprovação de turmas anteriores e, em contrapartida, consultar a taxa consolidada de aprovação e reprovação de semestres anteriores de outras turmas (por disciplina e professor), para que eu e meus colegas possamos analisar o histórico da matéria e tomar decisões embasadas no período de matrícula.

* **RF08: Visualização e Compartilhamento de Estatísticas de Aprovação:** O sistema deve disponibilizar funcionalidade e endpoints para compartilhar opcionalmente e consultar porcentagens consolidadas de aprovação e reprovação de turmas de semestres anteriores ofertadas na UnB, agrupadas por disciplina e docente. Pedindo que o usuário seja recíproco em também compartilhar anonimamente suas turmas anteriores em troca de visualizar as informações.

**Critérios de Aceitação:**
* As estatísticas devem apresentar métricas gerais consolidadas da turma (% de aprovação e % de reprovação), sem qualquer exposição de menções individuais, notas nominais ou dados pessoais de estudantes.
* A base histórica deve ser obtida e estruturada a partir de fontes de dados abertos e relatórios públicos da UnB.
* O sistema deve disponibilizar um identificador/URL direta pública para que o estudante possa compartilhar os dados estatísticos da disciplina/professor com colegas.
* Caso uma disciplina ou docente não possua registros históricos consolidados, o sistema deve indicar expressamente a ausência de dados para o termo pesquisado.
---

3. **Requisitos Não Funcionais (RNF)**
* Os requisitos não funcionais definem os atributos de qualidade, confiabilidade, arquitetura e manutenibilidade do sistema.

* **RNF01: Documentação Completa de Endpoints**
  * Todos os endpoints da API devem ser rigorosamente documentados seguindo o padrão OpenAPI/Swagger (gerado nativamente pelo FastAPI).
  * Cada rota deve documentar modelos de entrada (*request schemas*), respostas de sucesso e respostas de erro (*HTTP 400, 401, 403, 404, 500*), acompanhadas de descrições e exemplos claros.

* **RNF02: Cobertura de Testes e Garantia de Qualidade**
  * Toda a suíte de endpoints, adaptadores de scraping e serviços de cache deve contar com testes automatizados utilizando **Pytest**.
  * A suíte deve incluir testes unitários para funções de parsing/transformação de dados e testes de integração com *mocks* para chamadas externas ao SIGAA.

* **RNF03: Segurança e Privacidade de Dados**
  * O sistema não deve, em nenhuma hipótese, persistir senhas de acesso do SIGAA em discos, bancos de dados relacionais ou registros de log.
  * A comunicação externa deve ocorrer exclusivamente via canais cifrados (HTTPS/TLS).
  * As sessões e caches de usuários devem ser isolados, garantindo que um aluno não acesse informações privadas de outro estudante.

* **RNF04: Desempenho e Eficiência**
  * Consultas a turmas e detalhes já cacheados devem retornar respostas com tempo médio inferior a 300 ms.
  * O mecanismo de extração direta do SIGAA deve implementar limites de taxa (*rate limiting*) e controle de timeout para prevenir sobrecarga de requisições ao portal acadêmico legado.

* **RNF05: Modularidade e Extensibilidade Arquitetural**
  * A base de código deve manter um núcleo desacoplado, estruturada de modo que novos módulos (scrapers de RU, notícias e editais) possam ser adicionados como plugins/serviços independentes sem refatorar a camada central da API.

* **RNF06: Licenciamento de Código Aberto**
  * O código-fonte integral do projeto deve ser mantido sob a licença livre **MIT**, com repositório público contendo diretrizes de contribuição, código de conduta e documentação de arquitetura.

---

4. **Escopo para o MVP (Produto Mínimo Viável - Release 1)**
* O desenvolvimento é segmentado em entregas incrementais. A Release 1 concentra-se no núcleo de integração autenticada com o SIGAA e infraestrutura básica da API.

**Funcionalidades INCLUÍDAS na Release 1:**
* Autenticação de usuário via SIGAA sem retenção de senhas (RF01).
* Endpoint de perfil acadêmico pessoal GET /me (RF02).
* Listagem de turmas matriculadas GET /classrooms (RF03), com cache previsto no RF05.
* Detalhamento de turma com relação de colegas GET /turmas/ (RF04).
* Mecanismo de sincronização e atualização sob demanda do cache de turmas/colegas (RF05).
* Mecanismo de busca tanto em turmas matriculadas quanto no catálogo geral de turmas da UnB (RF06, RF07).
* Documentação interativa Swagger/OpenAPI de 100% dos endpoints (RNF01).
* Cobertura de testes automatizados com Pytest em todos os endpoints e parsers (RNF02).

**Funcionalidades para Versões Futuras (PÓS-MVP / Release 2 - Visão de Alto Nível):**
* **Módulo Restaurante Universitário (RU):** Extração automatizada e centralização do cardápio diário dos quatro campi da UnB.
* **Módulo Calendário Acadêmico:** Consulta estruturada de datas limites, períodos de matrícula, trancamento e feriados acadêmicos.
* **Módulo de Notícias e Editais:** Agregador de comunicados oficiais, processos seletivos, editais de extensão e bolsas de assistência.
* **Módulo de Ações Interativas no SIGAA:** Habilitação de operações ativas autenticadas diretamente pela API (ex: download em lote de materiais de aula e emissão de declarações).
* **Interface do Usuário (Front-end):** Aplicação visual completa (Web e/ou Mobile) consumindo a API com design moderno e responsivo.

---

5. **Restrições e Premissas do Projeto**

* **Padrões de Software Livre:** O projeto adota a licença MIT e promoverá práticas de colaboração aberta, com revisão por pares e rastreabilidade via Git.
* **Independência Operacional:** O projeto não possui apoio nem responsabilidade da UnB, sendo concebido como iniciativa estudantil de engenharia de software e pesquisa de sistemas legados.
* **Fragilidade de Scraping em Sistema Legado:** Por depender de raspagem de dados em páginas HTML do SIGAA, qualquer mudança estrutural ou atualização de layout nos portais da UnB pode impactar os parsers, exigindo arquitetura resiliente e testes de regressão frequentes.
* **Responsabilidade pelo Uso:** O fornecimento de credenciais institucionais é de livre decisão do estudante, sendo a aplicação estritamente transparente quanto à forma como trata a sessão e preserva o sigilo dos dados.

---

6. **Artefatos Relacionados**

* **Repositório do Projeto no GitHub:** [unb-mds/G5-2026-2](https://github.com/unb-mds/2026-2-Followw)
* **Documentação das Sprints:** [docs/sprints/](https://github.com/unb-mds/2026-2-Followw/tree/main/docs/sprints)
* **Controle de Tarefas e Backlog:** Issues e Milestones do repositório oficial do projeto.
