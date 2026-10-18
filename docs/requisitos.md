# Documento de Requisitos de Software: Followw UnB

**Versão:** 0.2.0 (Escopo da Release 2 / Sprints 1 a 7)  
**Data:** 16 de Outubro de 2026

---

## 1. Visão Geral do Projeto

O **Followw UnB** é um cliente alternativo _open-source_ projetado para consolidar os sistemas da
Universidade de Brasília (UnB) em uma experiência unificada, ágil e moderna. O projeto atua sobre a
fragmentação dos serviços universitários — historicamente dispersos entre o SIGAA, sites estáticos
do Restaurante Universitário (RU), calendários acadêmicos em PDF e notícias institucionais
desarticuladas.

A solução combina uma **API pública e independente** (FastAPI) e um **front-end web progressivo**
(React, TanStack Router, Vite e Tailwind CSS). Seu grande diferencial é viabilizar o acesso rápido,
seguro e _stateless_ à área autenticada do SIGAA, empregando técnicas avançadas de cache
(_stale-while-revalidate_), sincronização concorrente em segundo plano, suporte a funcionamento
_offline_ e catálogo público estruturado.

### Pilares Filosóficos e Arquiteturais

- **Código Aberto (Open Source):** Todo o repositório é distribuído sob licença permissiva **MIT**,
  permitindo auditoria de segurança, manutenção comunitária e transparência no tratamento de dados
  estudantis.
- **Privacidade por Design e Sessão Stateless:** O Followw não cria conta própria nem armazena
  senhas institucionais em bancos de dados ou logs. A autenticação é delegada ao CAS/SIGAA da UnB e
  mantida em cookies cifrados no próprio navegador do estudante.
- **Modularidade e Baixo Acoplamento:** A arquitetura separa a biblioteca de comunicação com o SIGAA
  (`sigaa-client`), os módulos de portais públicos da UnB (`unb-browser`), a API e o front-end web.
- **Experiência Offline-First e PWA:** Dados acadêmicos consultados previamente ficam acessíveis no
  dispositivo do usuário mesmo sem conexão ativa à internet por até 14 dias.
- **Usabilidade e Acessibilidade:** Interface moderna construída sobre componentes reutilizáveis,
  suporte a tema escuro/claro, comunicação visual clara e tratamento resiliente de
  indisponibilidades dos sistemas legados da universidade.

---

## 2. Requisitos Funcionais (RF)

Os requisitos funcionais estão estruturados em **4 Épicos Centrais**, englobando suas Histórias de
Usuário, requisitos formais e critérios de aceitação testáveis.

---

### ÉPICO 1: Autenticação, Perfil e Preferências do Estudante

Conjunto de funcionalidades responsáveis por mediar o acesso autenticado ao SIGAA, gerenciar sessões
seguras e efêmeras, apresentar a situação cadastral do aluno e permitir personalizações na
interface.

#### 1.1: Autenticação de Usuário e Acesso ao SIGAA

**Histórias de Usuário:**

- **US01:** Como estudante, quero realizar login com minha matrícula e senha do SIGAA sem que as
  credenciais fiquem retidas em servidores ou bancos de dados externos.
- **US02:** Como estudante autenticado, quero acessar com rapidez os recursos e dados acadêmicos
  protegidos do portal do discente.
- **US03:** Como estudante, quero poder exibir ou ocultar os caracteres da senha digitada no
  formulário de login para conferência antes do envio.
- **US04:** Como estudante com sessão ativa, quero ser redirecionado automaticamente para a página
  inicial caso acesse a rota de login.

- **RF01 — Autenticação de Usuário via SIGAA:** O sistema deve fornecer endpoint
  (`POST /auth/sigaa`) e tela de login dedicada que recebe a matrícula e senha do estudante,
  valida-as no CAS/SIGAA da UnB e inicializa a sessão emitindo cookies cifrados (`access_token` e
  `refresh_token`), sem persistir a senha em banco de dados ou logs.

**Critérios de Aceitação:**

- Credenciais inválidas ou contas bloqueadas no SIGAA devem retornar HTTP 401 acompanhado de
  mensagem clara na interface.
- O campo de senha deve dispor de botão para alternar a visibilidade dos caracteres (_show/hide
  password_).
- A sessão do usuário dura enquanto forem válidos os cookies originais da sessão do SIGAA, sendo
  renovada automaticamente quando oportuno.
- Usuários já logados que navegam até a página `/login` devem ser redirecionados imediatamente à
  tela principal (`/`).

#### 1.2: Logout Seguro

**Histórias de Usuário:**

- **US05:** Como estudante, quero poder encerrar minha sessão a qualquer momento.
- **US06:** Como estudante, quero ter a garantia de que ao sair da conta todos os dados privados
  temporariamente salvos no dispositivo sejam removidos.

- **RF02 — Logout Seguro e Limpeza de Sessão:** O sistema deve fornecer encerramento de sessão
  (`POST /auth/logout`) que invalida imediatamente os tokens emitidos e expurga os dados pessoais
  cacheados no navegador do discente.

**Critérios de Aceitação:**

- Ao acionar logout, os cookies de autenticação devem ser expirados via cabeçalho `Set-Cookie` com
  `Max-Age=0`.
- A camada cliente deve limpar chaves de dados confidenciais do discente armazenadas em
  `localStorage` e `IndexedDB`.
- Requisições subsequentes com cookies antigos devem receber HTTP 401.

#### 1.3: Visualização de Perfil Acadêmico e Carga Horária Pendente

**Histórias de Usuário:**

- **US07:** Como estudante autenticado, quero visualizar meus dados acadêmicos básicos (nome,
  matrícula, curso, unidade e foto).
- **US08:** Como estudante autenticado, quero consultar meu Índice de Rendimento Acadêmico (IRA),
  Média Ponderada (MP) e percentual de integralização curricular.
- **US09:** Como estudante autenticado, quero visualizar quantas horas de componentes curriculares
  ainda faltam para a conclusão do curso, divididas entre obrigatórias, optativas e complementares.

- **RF03 — Perfil Acadêmico e Integralização Curricular (`GET /me`):** O sistema deve disponibilizar
  endpoint protegido e tela de perfil que retorna `name`, `registration`, `photo`, `email`, `bio`,
  `unity`, `course`, `integralization`, `ira`, `mp`, `level` e o detalhamento das horas pendentes
  (obrigatórias, optativas e complementares) obtidas do extrato de integralização do SIGAA.

**Critérios de Aceitação:**

- A foto do estudante e a dos participantes deve usar formato e proporção padronizada (3:4),
  exibindo ícone _fallback_ quando não houver imagem cadastrada.
- Valores numéricos de horas pendentes e percentual de integralização ausentes no SIGAA devem ser
  omitidos sem quebrar o layout.
- Os dados devem ser sincronizados em background, exibindo a versão em cache com carregamento
  instantâneo.

#### 1.4: Configurações e Preferências Pessoais

**Histórias de Usuário:**

- **US10:** Como estudante, quero poder escolher como meu nome é exibido no Followw, sem alterar meu
  registro civil no SIGAA.
- **US11:** Como estudante, quero ter meu campus universitário inferido corretamente sem a
  necessidade de configuração manual.
- **US12:** Como estudante, quero que as informações do Restaurante Universitário abram
  automaticamente no meu campus de preferência.

- **RF04 — Configurações Pessoais do Usuário (`GET` e `PATCH /me/settings`):** O sistema deve
  permitir ao estudante consultar e atualizar preferências locais sincronizadas com a API, incluindo
  `display_name` e `default_campus`, mantendo preferências visuais de tema persistidas no cliente.

**Critérios de Aceitação:**

- O nome de exibição, quando definido, substitui o nome civil nas saudações e cabeçalhos do Followw,
  permitindo restauração do nome original a qualquer momento.
- A alteração de preferências deve ser pontual (suportando atualização parcial de campos via PATCH).

#### 1.5: Política de Privacidade e Termos de Serviço

**Histórias de Usuário:**

- **US41:** Como estudante ou visitante, quero consultar como o Followw trata meus dados, como
  solicitar sua exclusão e quais são as regras de uso do serviço antes de entrar.

- **RF16 — Consulta Pública de Privacidade e Termos (`/privacidade`):** O sistema deve oferecer
  uma página curta e pública com política de privacidade e termos de serviço, acessível por um
  único link no rodapé do login, acompanhado do aviso de concordância ao entrar.

**Critérios de Aceitação:**

- A política deve informar os dados mantidos em cache no servidor e no dispositivo, sua finalidade,
  a ausência de descarte automático no servidor e o prazo de até 14 dias do cache de dados offline.
- O texto deve distinguir cookies e tarefas com credenciais cifradas da ausência de credenciais no
  banco e nos logs da API, e informar o uso de métricas e gravação de sessões pelo PostHog.
- A exclusão dos dados existentes deve ser solicitada por `removal@followw.app`, com aviso de que
  não altera registros da UnB nem impede novas coletas em sincronizações futuras.
- Os termos devem permitir automações responsáveis e proibir sobrecarga, acesso indevido,
  manipulação mal-intencionada de informações, perseguição e assédio.

---

### ÉPICO 2: Gestão de Turmas, Frequência e Rotina Acadêmica

Compreende a sincronização, organização e acompanhamento das disciplinas em que o aluno está
inscrito, histórico letivo, controle de frequência, avisos dos professores e agenda do dia.

#### 2.1: Listagem de Turmas e Histórico de Semestres com Menções

**Histórias de Usuário:**

- **US13:** Como estudante matriculado, quero listar rapidamente minhas turmas do semestre atual com
  horário, sala, número de turma e código da disciplina.
- **US14:** Como estudante, quero consultar as turmas cursadas em semestres anteriores com o
  histórico das menções finais obtidas (SS, MS, MM, MI, II, SR).

- **RF05 — Listagem de Turmas e Histórico Letivo (`GET /classrooms`):** O sistema deve fornecer
  endpoint protegido para listar turmas atuais e anteriores (`?semester=all` ou `?semester=AAAA.P`),
  informando código, nome da disciplina, turma, horários, local, carga horária e a menção final
  quando consolidada.

**Critérios de Aceitação:**

- As turmas de semestres anteriores devem exibir com destaque visual a menção recebida (colorida
  conforme a escala de rendimento).
- Turmas sem sala informada pelo SIGAA devem exibir `"Local não informado"`, sem omitir a matéria.
- Turmas com matrícula em processamento devem exibir a badge amarela `"Em processamento"`.

- **RF17 — Recuperação de Menções Ausentes:** A consulta de turmas deve revalidar menções
  vencidas independentemente do login. Menções nulas devem permanecer sujeitas à sincronização
  mesmo após a consolidação do semestre; disciplinas ausentes do relatório não devem apagar
  resultados já armazenados.

**Critérios de Aceitação:**

- `Cache-Control: no-cache` deve aguardar a atualização das menções ainda mutáveis.
- Uma menção nula consultada deve ser reavaliada após 24 horas, sem gerar reconsultas a cada acesso.
- Linhas fora de `tbody` devem ser lidas, e erros de formato devem preservar o cache anterior.
- Uma tabela de semestre inválida deve gerar aviso e preservar suas menções, sem impedir a
  sincronização dos demais semestres; se nenhuma tabela puder ser lida, a consulta deve falhar.
- A data de sincronização identifica a última leitura do relatório por usuário, inclusive parcial.
- A associação das menções deve considerar simultaneamente o código da disciplina e o semestre.

#### 2.2: Detalhes da Turma e Participantes

**Histórias de Usuário:**

- **US15:** Como estudante, quero abrir uma turma específica e navegar em abas dedicadas para
  Aulas/Frequência, Postagens e Participantes.
- **US16:** Como estudante, quero consultar a lista de docentes e colegas de classe matriculados na
  mesma turma para contato e trabalhos em grupo.

- **RF06 — Detalhes da Turma e Participantes (`GET /classrooms/{id}/members`):** O sistema deve
  disponibilizar página de detalhes da disciplina com abas dedicadas e listar discentes e docentes
  da turma (`name`, `role`, `registration`, `photo`, `email`, `course`, `unity`).

**Critérios de Aceitação:**

- Docentes devem aparecer destacados antes da lista de discentes, que deve vir em ordem alfabética.
- Caso a turma não exista ou o discente não esteja matriculado nela, deve retornar HTTP 404.

#### 2.3: Controle e Estimativa de Frequência

**Histórias de Usuário:**

- **US17:** Como estudante, quero poder marcar manualmente presença, falta ou aula cancelada nas
  datas que já ocorreram e ainda não receberam chamada oficial no SIGAA.
- **US18:** Como estudante, quero acompanhar o percentual consolidado e estimado de frequência para
  não correr risco de reprovação por falta (< 75%).
- **US19:** Como estudante, quero que as chamadas oficiais lançadas posteriormente pelo docente no
  SIGAA tenham precedência sobre as marcações manuais realizadas.

- **RF07 — Gestão e Estimativa de Frequência (`GET` e `PUT /classrooms/{id}/frequency`):** O sistema
  deve permitir ao aluno registrar marcações locais de frequência em aulas sem chamada oficial,
  calculando o percentual projetado e sinalizando em cores de alerta o risco de reprovação.

**Critérios de Aceitação:**

- As chamadas oficiais registradas pelo docente não podem ser sobrescritas por marcações manuais do
  aluno.
- O sistema deve sinalizar visualmente com a tag `"Estimada"` quando o cálculo de frequência incluir
  anotações manuais do estudante.
- A barra e texto de frequência devem tingir em verde (> 80%), amarelo (75%–80%) e vermelho (< 75%).

#### 2.4: Notícias da Disciplina em Markdown

**Histórias de Usuário:**

- **US20:** Como estudante, quero ler os comunicados postados pelo docente com formatação completa
  (Markdown), incluindo tabelas, listas e links.
- **US21:** Como estudante, quero acessar os comunicados da matéria mesmo se estiver sem internet ou
  se a publicação for apagada do portal legado.

- **RF08 — Notícias da Disciplina com Suporte a Markdown (`GET /classrooms/{id}/news`):** O sistema
  deve extrair e exibir comunicados das turmas convertendo a marcação para Markdown higienizado,
  salvando-os em cache com validade de 60 minutos e retenção persistente.

**Critérios de Aceitação:**

- Links externos presentes nas notícias devem abrir obrigatoriamente em nova aba
  (`target="_blank" rel="noopener noreferrer"`).
- Notícias consultadas anteriormente devem permanecer legíveis em modo offline.

#### 2.5: Agenda Diária e Calendário Acadêmico

**Histórias de Usuário:**

- **US22:** Como estudante, quero consultar na tela inicial minhas aulas do dia atual ordenadas por
  horário, sabendo qual está em andamento e qual será a próxima.
- **US23:** Como estudante, quero poder verificar se vai haver aula em um determinado dia em virtude
  de feriado, ponto facultativo, Semana Universitária ou período de férias.

- **RF09 — Agenda Diária e Sincronização com o Calendário Acadêmico:** O sistema deve integrar o
  horário das turmas ao calendário oficial da UnB, exibindo a sequência de aulas do dia selecionado,
  destacando status `"Em andamento"` / `"Próxima"` e unificando horários contínuos entre turnos
  (ex.: `12:00–13:50` e `18:00–19:50`).

**Critérios de Aceitação:**

- Em dias sem aula previstos no calendário acadêmico, o card de aulas deve ser substituído por
  informativo com o motivo oficial do evento.
- Horários contínuos com transição entre turnos (como `M5T1` e `T6N1`) devem ser fundidos em um
  único cartão de horário.

#### 2.6: Sincronização Concorrente e Atualização de Cache

**Histórias de Usuário:**

- **US24:** Como estudante, quero que as páginas carreguem de imediato com os últimos dados salvos,
  enquanto atualizações ocorrem em segundo plano.
- **US25:** Como estudante, quero poder forçar uma revalidação imediata das turmas com o SIGAA
  puxando a tela para atualizar.

- **RF10 — Sincronização Paralela e Invalidação de Cache:** A API deve suportar requisições
  concorrentes com sessões independentes do SIGAA, servindo respostas imediatas via cache e
  aceitando o parâmetro `?refresh=true` ou cabeçalho `Cache-Control: no-cache` para atualização
  manual.

**Critérios de Aceitação:**

- Turmas já consolidadas ou de semestres findados não devem disparar novas requisições de raspagem
  ao SIGAA.
- Caso o SIGAA apresente erro temporário durante uma revalidação, a versão em cache deve ser
  preservada e entregue ao discente.

---

### ÉPICO 3: Busca, Catálogo e Descoberta de Turmas

Funcionalidades de pesquisa e descoberta, permitindo consultar todo o catálogo geral da UnB,
analisar concorrência de vagas, pré-requisitos e estatísticas históricas de aprovação.

#### 3.1: Catálogo Geral e Consulta Pública de Turmas da UnB

**Histórias de Usuário:**

- **US26:** Como qualquer estudante ou visitante, quero pesquisar as turmas ofertadas na UnB sem
  precisar de login, filtrando por departamento, código, nome ou professor.
- **US27:** Como estudante, quero consultar uma matéria diretamente pelo código da disciplina (ex.:
  `MAT0031` ou `FGA0312`) sem saber previamente o departamento ofertante.
- **US28:** Como estudante em fase de matrícula, quero visualizar o total de vagas e a ocupação em
  tempo real de cada turma, identificando turmas lotadas.
- **US29:** Como estudante autenticado, quero que o catálogo me informe se já atendi aos
  pré-requisitos ou equivalências da turma com base no meu histórico acadêmico.

- **RF11 — Catálogo Geral e Pesquisa Pública de Turmas (`GET /public/classrooms`):** O sistema deve
  oferecer busca pública aberta no catálogo geral da UnB, suportando filtros por unidade, código
  completo ou prefixo, nome da matéria e docente, integrando dataset estruturado para respostas em
  milissegundos.

**Critérios de Aceitação:**

- A busca pública não deve exigir autenticação e deve tolerar variações de acentuação e caixa
  alta/baixa.
- A visualização da turma deve exibir barra de progresso com vagas ocupadas sobre o total (ex.:
  `64 de 80 vagas ocupadas`).
- Para estudantes autenticados, o sistema deve avaliar o histórico escolar e indicar se a turma está
  liberada ou impedida por pré-requisitos não atendidos.

#### 3.2: Estatísticas Históricas de Aprovação

**Histórias de Usuário:**

- **US30:** Como estudante planejando minha matrícula, quero consultar a taxa histórica consolidada
  de aprovação e reprovação de cada professor na matéria.
- **US31:** Como estudante, quero compartilhar um link direto com as estatísticas de aprovação da
  disciplina com meus colegas.

- **RF12 — Estatísticas Consolidadas de Rendimento (`GET /classrooms/{id}/statistics`):** O sistema
  deve prover métricas históricas de aprovação e reprovação agrupadas por disciplina e docente,
  permitindo compartilhamento via URL pública.

**Critérios de Aceitação:**

- Nenhuma informação ou menção individual de alunos pode ser exposta nas estatísticas públicas.
- Turmas sem registros históricos de rendimento devem exibir mensagem informativa orientando o
  usuário.

#### 3.3: Recomendações de Disciplinas

**Histórias de Usuário:**

- **US42:** Como estudante autenticado, quero recomendações que excluam disciplinas já cursadas ou
  em andamento, inclusive equivalentes, permitindo repetição somente com reprovação confirmada.

- **RF16 — Exclusão de Disciplinas Cursadas e Equivalências (`GET /public/subjects`):** O sistema
  deve excluir aprovações, matrículas atuais e tentativas sem resultado, considerando as expressões
  de equivalência do catálogo.

**Critérios de Aceitação:**

- A falta de menção após a consolidação não deve ser interpretada como reprovação.
- Vínculos trancados, removidos ou indeferidos não contam como tentativa sem resultado.
- MI, II ou SR permitem repetir somente sem aprovação, matrícula atual ou outra tentativa incerta.
- Equivalências devem respeitar grupos E/OU e sua direção, sem inferir reciprocidade ou
  transitividade.
- Tentativas sem menção devem presumir aprovação no ranking, liberar pré/correquisitos diretos e por
  equivalência e contar como concluídas no fluxo, sem alterar a menção armazenada.

---

### ÉPICO 4: Restaurante Universitário (RU) e Serviços Estudantis

Módulo dedicado aos serviços do RU e facilidades da vida universitária, agregando cardápio
multi-campus, controle financeiro de refeições, carteirinha digital e emissão de declarações
acadêmicas.

#### 4.1: Cardápio Multi-Campus

**Histórias de Usuário:**

- **US32:** Como estudante da UnB, quero consultar o cardápio do RU por dia e campus (Darcy Ribeiro,
  Gama, Ceilândia, Planaltina e Fazenda Água Limpa) sem necessidade de login.
- **US33:** Como estudante com restrição alimentar, quero identificar claramente os pratos
  principais e complementos nas opções padrão, ovolactovegetariana e vegetariana estrita (vegana).
- **US34:** Como estudante residente ou frequentador do RU aos fins de semana, quero poder consultar
  o cardápio aos domingos e ser informado em datas sem expediente ou sem cardápio publicado.
- **US41:** Como estudante, quero compartilhar o cardápio de um dia, refeição e campus específicos
  com uma prévia visual que identifique o Followw.

- **RF13 — Consulta Pública do Cardápio do RU (`GET /public/restaurant`):** O sistema deve extrair,
  estruturar e disponibilizar o cardápio semanal das refeições (café da manhã, almoço e jantar) para
  todos os campi da universidade, cobrindo o ciclo completo de Segunda a Domingo e sinalizando
  feriados e dias sem refeição.

**Critérios de Aceitação:**

- O seletor de dias deve exibir 7 dias (`SEG` a `DOM`), mantendo a semana correta mesmo quando
  consultado no domingo.
- Cada refeição deve listar o prato principal, guarnições, saladas, sobremesas e bebidas, marcando
  opções vegetarianas e veganas com ícones dedicados.
- Dias sem cardápio disponível devem apresentar mensagem explicativa com o motivo (ex.:
  `"Cardápio não publicado para esta data"`).
- O compartilhamento deve preservar dia, refeição e campus nos parâmetros da URL e apresentar uma
  imagem dinâmica do cardápio com a identidade visual do Followw, acessível sem login. As seções
  devem manter a ordem exibida no site, com os rótulos dos acompanhamentos em negrito. As
  alternativas ovolactovegetarianas e vegetarianas estritas devem usar os ícones de ovo e folha. A
  imagem usa um tema fixo, definido no gerador, sem parâmetro de tema na URL.

#### 4.2: Gestão de Saldo e Extrato do RU

**Histórias de Usuário:**

- **US35:** Como estudante cadastrado no RU, quero consultar o meu grupo tarifário e horário atual.
- **US36:** Como estudante, quero visualizar meu extrato com créditos (recargas) e débitos
  (refeições) consumidos recentemente.
- **US37:** Como estudante, quero receber um aviso preventivo quando meu saldo for menor que o custo
  da refeição correspondente ao horário atual.

- **RF14 — Saldo, Extrato e Alertas Financeiros do RU (`GET /me/ru-statement`):** O sistema deve
  consultar a conta do estudante no sistema do RU e fornecer saldo, grupo de gratuidade/tarifa e
  histórico recente de transações, calculando o saldo faltante para a refeição iminente.

**Critérios de Aceitação:**

- Caso o estudante pertença a grupo com isenção total (refeição gratuita) ou tenha saldo suficiente,
  o alerta de saldo faltante não deve ser exibido.
- O extrato deve conter data, tipo de operação (crédito/débito), valor e descrição da transação.

#### 4.3: Carteirinha Digital e Emissão de Documentos

**Histórias de Usuário:**

- **US38:** Como estudante, quero apresentar a carteirinha estudantil digital com QR Code no meu
  celular para ingressar no Restaurante Universitário.
- **US39:** Como estudante, quero ser informado caso minha carteirinha estudantil esteja com a
  validade mensal expirada, recebendo instruções para emissão de nova via.
- **US40:** Como estudante, quero realizar o download direto do PDF da minha carteirinha estudantil
  e da declaração de vínculo do SIGAA pelo Followw.

- **RF15 — Carteirinha Digital e Emissão de Documentos Estudantis (`GET /me/ru-token` e
  `/me/documents`):** O sistema deve extrair o código de barras/QR Code da carteirinha estudantil do
  SIGAA, gerar o SVG local com verificação de vigência mensal e disponibilizar o download de
  comprovantes acadêmicos em formato PDF.

**Critérios de Aceitação:**

- O QR Code deve ser gerado e renderizado localmente no cliente no momento da exibição, abrindo em
  gaveta/gaveta modal (_drawer_) sem expor dados desnecessários na tela.
- Carteirinhas vencidas devem exibir alerta destacado indicando que o estudante deve emitir novo
  documento no portal institucional.
- O sistema deve oferecer botões diretos de download para o PDF da Carteirinha e para a Declaração
  de Vínculo Oficial.

---

## 3. Requisitos Não Funcionais (RNF)

Os requisitos não funcionais definem os critérios técnicos de qualidade, confiabilidade, desempenho,
conformidade de arquitetura e segurança da informação.

- **RNF01 — Documentação Interativa de Endpoints (Scalar / OpenAPI):**
    - Todos os endpoints da API devem ser documentados com modelos rigorosos de entrada, códigos de
      retorno HTTP (200, 401, 404, 422, 502) e exemplos claros via OpenAPI, renderizados pela
      interface Scalar integrada.

- **RNF02 — Cobertura Abrangente de Testes Automatizados:**
    - Toda funcionalidade e correção deve conter testes automatizados. O back-end utiliza **Pytest**
      com clientes assíncronos e _mocks_ de requisições externas; o front-end web utiliza a suíte de
      testes ultrarrápida do **Bun** (`bun test`).

- **RNF03 — Segurança, Privacidade e Sessão Efêmera:**
    - O sistema não deve, sob qualquer condição, persistir senhas de usuários em bancos de dados
      relacionais, discos ou logs.
    - O transporte de dados na web deve ocorrer exclusivamente por HTTPS/TLS com atributos de
      cookies `HttpOnly`, `SameSite` e `Secure`.
    - Os dados pessoais salvos no dispositivo devem ser descartados no momento do logout ou ao
      expirar a sessão.

- **RNF04 — Desempenho e Sincronização Concorrente da API:**
    - A API deve utilizar chamadas paralelas não bloqueantes (`asyncio`) para a extração do SIGAA,
      reduzindo o tempo de sincronização inicial.
    - Consultas a recursos previamente armazenados no cache relacional ou local devem responder com
      latência média inferior a **300 ms**.

- **RNF05 — Modularidade e Extensibilidade Arquitetural:**
    - O código deve seguir separação rigorosa de pacotes: scrapers e clientes do SIGAA isolados em
      bibliotecas próprias (`sigaa-client`, `unb-browser`), permitindo a evolução independente do
      front-end e da API.

- **RNF06 — Licenciamento e Governança de Código Aberto:**
    - O código-fonte integral deve permanecer sob licença permissiva **MIT**, em repositório público
      com rastreabilidade de commits, diretrizes de contribuição e convenções de código limpo.

- **RNF07 — Suporte Offline e Instalação (Progressive Web App - PWA):**
    - O front-end deve funcionar como uma aplicação web progressiva instalável na tela inicial de
      celulares (Android e iOS) e desktops, com manifesto de aplicativo válido (`manifest.json`) e
      Service Worker.
    - O aplicativo deve permitir navegação completa pelas páginas já visitadas mesmo sem acesso à
      internet, mantendo os dados locais por até 14 dias em armazenamento seguro (`IndexedDB` e
      `localStorage`), exibindo banner indicativo de modo offline.

- **RNF08 — Padronização Visual e Acessibilidade (Design System):**
    - A interface deve adotar componentes reutilizáveis padronizados construídos com **shadcn/ui**,
      **Base UI** e **Tailwind CSS**.
    - A paleta de cores deve garantir contraste adequado para legibilidade e oferecer suporte
      dinâmico a temas claro (_light_) e escuro (_dark_) com persistência automática no navegador.

- **RNF09 — Otimização para Mecanismos de Busca (SEO) em Rotas Públicas:**
    - As páginas de acesso público (Início, Cardápio do RU e Busca de Turmas) devem conter títulos
      semânticos, meta tags OpenGraph, dados estruturados Schema.org, canonical tags, `sitemap.xml`
      e `robots.txt`.
    - Rotas que exigem login e tratam dados privados (perfil, turmas do discente) devem incluir
      obrigatoriamente a diretiva `noindex`.

- **RNF10 — Resiliência e Tolerância a Falhas do SIGAA:**
    - Em caso de indisponibilidade, lentidão extrema ou instabilidade dos servidores do SIGAA/UnB, o
      sistema deve exibir tela de erro temática em português, explicando ao estudante que o problema
      tem origem na plataforma institucional e oferecendo botão para tentar novamente.

- **RNF11 — Observabilidade e Monitoramento de Produção:**
    - A API deve emitir logs estruturados padronizados contendo identificadores de requisição e
      tempos de execução, e o front-end deve integrar telemetria analítica e de erros (PostHog)
      preservando o anonimato de dados sensíveis.

---

## 4. Aprimoramentos de Engenharia e Infraestrutura

Melhorias técnicas internas que sustentam as capacidades funcionais do produto, sem constituir telas
ou regras de negócio isoladas para o usuário final:

1. **Automação de Diagramas C4 via Script Local:** Script em Python (`scripts/generate_diagrams.py`)
   para geração autônoma de diagramas arquiteturais em SVG (C4 Context, Container, Componentes),
   reduzindo a dependência de esteiras externas de CI.
2. **Repositório Centralizado de Armazenamento no Navegador:** Engine unificada de persistência para
   tratar leituras e escritas em `localStorage` e `IndexedDB`, gerenciando cotas, tratamento de
   erros de gravação e _namespaces_ isolados (`followw:`).
3. **Dataset Local Estruturado de Ofertas:** Compilação e indexação de turmas abertas da
   universidade para permitir pesquisas com tempo de resposta sub-milissegundo no catálogo público.
4. **Otimização de Índices no Banco de Dados:** Criação de índices estratégicos em tabelas de
   menções, turmas e docentes para garantir alto desempenho durante sincronizações em lote.

---

## 5. Escopo das Releases e Evolução do Projeto

O desenvolvimento do Followw UnB é conduzido de forma incremental através de sprints ágeis:

### Funcionalidades Entregues na Release 1 (MVP — 15/09/2026)

- Autenticação via SIGAA sem retenção de senhas e Logout seguro.
- Consulta básica do perfil do discente (nome, matrícula, IRA, MP).
- Listagem simples de turmas matriculadas no semestre corrente.
- Sincronização inicial de turmas com o SIGAA.
- Documentação dos endpoints em OpenAPI.

### Funcionalidades Entregues na Release 2 (Escopo Atual — Sprints 4 a 7 — 16/10/2026)

- **Módulo do RU Completo:** Cardápio de 5 campi, suporte a domingos e dias sem cardápio, extrato,
  saldo e avisos de saldo insuficiente.
- **Carteirinha Digital e Documentos:** Emissão de QR Code com checagem de validade e download
  direto de comprovantes em PDF.
- **Gestão de Frequência:** Marcação manual de presenças/faltas e cálculo em tempo real de
  frequência estimada com alertas de infrequência.
- **Histórico Completo de Turmas:** Visualização de menções finais (SS a SR) no semestre atual e em
  semestres anteriores.
- **Notícias das Turmas:** Renderização em Markdown higienizado e retenção persistente em cache.
- **Agenda Diária e Calendário Acadêmico:** Identificação de feriados, recessos e junção de horários
  de aulas contínuas.
- **Perfil Avançado e Preferências:** Detalhamento de horas pendentes (obrigatórias, optativas,
  complementares) e definição de nome social/exibição.
- **Catálogo Público de Turmas:** Pesquisa por código/nome/docente/local com dataset local,
  visualização de vagas e análise de pré-requisitos.
- **PWA e Suporte Offline Total:** Instalação na tela inicial do celular/desktop e navegação
  completa por até 14 dias sem conexão.
- **Design System e Resiliência:** Padronização com shadcn/ui, suporte a temas e tela dedicada para
  indisponibilidades do SIGAA.

### Backlog Evolutivo (Próximas Releases)

- **Ações Ativas de Matrícula:** Solicitação interativa de trancamento de matrícula e ajuste de
  inscrição direto pelo Followw.
- **Realização de Matrícula e visualização de resultados:** Realização de matrícula, rematrícula e
  matrícula extraordinária no período oficial permitido e exposição dos resultados obtidos nas
  tentativas diretamente no Followw.

---

## 6. Restrições e Premissas do Projeto

- **Independência Operacional:** O Followw UnB é um projeto acadêmico de código aberto mantido por
  estudantes da UnB, sem vínculo institucional com a reitoria ou com os fornecedores oficiais do
  SIGAA.
- **Resiliência a Mudanças de Layout:** Por realizar _scraping_ em portais web legados da UnB, a
  arquitetura deve isolar os seletores em adaptadores específicos, cobertos por testes frequentes de
  regressão.
- **Responsabilidade pelo Uso:** O fornecimento de credenciais institucionais é uma escolha
  voluntária do estudante, pautada na transparência do código aberto e na garantia de arquitetura
  estritamente sem retenção de senhas.

---

## 7. Artefatos e Documentos Relacionados

- **Repositório do Projeto no GitHub:**
  [unb-mds/2026-2-Followw](https://github.com/unb-mds/2026-2-Followw)
- **Quadro de Requisitos e Storymap (FigJam / Figma):**
  [Quadro MDS Followw](https://www.figma.com/board/JqtNZhLBFlsVIbthMYOdzB/Template-MDS--c%C3%B3pia-limpa-?node-id=0-1&p=f&t=PFwLBexPkq3KOM8L-0)
- **Documentação de Arquitetura C4-PlantUML:** [`docs/arquitetura.md`](./arquitetura.md)
- **Documentação de Cache e Sincronização:**
  [`docs/cache-e-sincronizacao.md`](./cache-e-sincronizacao.md)
- **Documentação de Uso Offline:** [`docs/offline.md`](./offline.md)
- **Documentação de Segurança:** [`docs/segurança.md`](./segurança.md)
- **Documentação de Recomendação de Matérias:** [`docs/recommendations.md`](./recommendations.md)
- **Documentação de Observabilidade e Logs:** [`docs/observability.md`](./observability.md)
- **Registro de Uso de IA:** [`docs/AI-USAGE.md`](./AI-USAGE.md)
- **Atas de Sprints:** Diretório [`docs/sprints/`](./sprints/) (Sprints 01 a 07)
