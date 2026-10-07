# Documento de Arquitetura — Followw UnB

## Introdução

### Finalidade
Este documento descreve a arquitetura de software do **Followw UnB**, apresentando uma visão abrangente do sistema por meio de múltiplos modelos arquiteturais (Modelo C4), padrões de projeto, decisões técnicas e organização do código.

### Escopo
O Followw UnB é um cliente alternativo e open-source para o ecossistema de sistemas acadêmicos da Universidade de Brasília (UnB), agregando em uma experiência unificada e performática dados do **SIGAA**, **Restaurante Universitário (RU)**, calendários e editais.

O sistema não possui contas proprietárias: a autenticação é delegada ao **Centro de Autenticação da UnB** e toda requisição para o SIGAA é *stateless*, com credenciais cifradas no cliente e sincronização assíncrona inteligente.

---

## Stack Tecnológica

| Camada / Função | Tecnologia | Justificativa |
| :--- | :--- | :--- |
| **Frontend Web** | TanStack Start (React 19 / Vite) | SSR/SPA unificado, tipagem estrita de rotas com TanStack Router e cache de estado via TanStack Query. |
| **Estilização** | Tailwind CSS v4 | Estilização utilitária atômica e performática. |
| **API Client (Web)** | `openapi-fetch` + `openapi-react-query` | Consumo type-safe sincronizado diretamente com o schema OpenAPI da API FastAPI. |
| **Backend API** | FastAPI (Python >= 3.14) | Assíncrono nativo, alta performance, geração automática de documentação OpenAPI e injeção de dependências robusta. |
| **Scraper SIGAA** | `sigaa-client` | Abstração que gerencia o ciclo de vida JSF (ViewState, postback), decodificação de PDFs e sessões CAS. |
| **Scraper Sites UnB**| `unb-browser` | Extração resiliente de cardápios do RU (parser geométrico via `pdfplumber`) e calendários acadêmicos. |
| **Banco de Dados** | PostgreSQL 16+ (SQLAlchemy assíncrono) | Armazenamento de cache de turmas, cardápios e participantes, com suporte a campos JSON estruturados. |
| **Fila Assíncrona** | Upstash QStash | Execução desacoplada de jobs de sincronização via webhooks autenticados, com *flow control* e deduplicação. |
| **Segurança/Sessão**| JWE (AES-256-GCM) + HKDF | Sessão *stateless*: token e credenciais residem em cookies HttpOnly cifrados; nenhuma senha persistida no servidor. |
| **Gerenciadores** | `uv` (monorepo Python) e `bun` (web) | Resolução instantânea de dependências e execução ultra-rápida. |

---

## Diagramas da Arquitetura (Modelo C4)

Os diagramas de arquitetura adotam o padrão de **Diagrams as Code** via **C4-PlantUML**, versionados como código em [`docs/diagrams/`](diagrams/) e renderizados em formato vetorial SVG pelo pipeline do GitHub Actions.

### Diagrama de Contexto do Sistema (Nível 1)
Apresenta o Followw UnB no seu ambiente operacional, seus usuários e as integrações com os sistemas da universidade e serviços externos.

![Diagrama de Contexto - Followw UnB](assets/context.svg)

> Código-fonte: [`docs/diagrams/context.puml`](diagrams/context.puml)

---

### Diagrama de Containers (Nível 2)
Detalha as aplicações executáveis, armazenamento de dados e fronteiras de comunicação entre componentes e serviços.

![Diagrama de Containers - Followw UnB](assets/container.svg)

> Código-fonte: [`docs/diagrams/container.puml`](diagrams/container.puml)

---

### Diagrama de Componentes (Nível 3)
Apresenta a organização interna dos componentes do Frontend (`apps/web`), do Backend (`apps/api`) e suas interações com as bibliotecas do monorepo e dados.

#### Componentes do Frontend
![Diagrama de Componentes do Frontend](assets/components_frontend.svg)

> Código-fonte: [`docs/diagrams/components_frontend.puml`](diagrams/components_frontend.puml)

#### Componentes do Backend
![Diagrama de Componentes do Backend](assets/components_backend.svg)

> Código-fonte: [`docs/diagrams/components_backend.puml`](diagrams/components_backend.puml)


---

## Padrões Arquiteturais e Decisões de Design

### Sessão Stateless Criptografada (JWE)
- **Zero-Storage de Senhas**: A API do Followw não persiste credenciais nem sessões em disco ou banco de dados.
- **Cookies HttpOnly JWE**: A sessão é dividida em dois cookies protegidos por criptografia autenticada (`AES-256-GCM`), com chaves distintas derivadas via HKDF a partir de `JWT_SECRET_KEY`:
  - `access_token` (40 min): Sessão JSF ativa do SIGAA.
  - `refresh_token` (14 dias): Matrícula e senha encriptadas para renovação automática de sessão sem atrito para o usuário.

### Estratégia de Cache: Stale-While-Revalidate (SWR)
- Chamadas a dados custosos do SIGAA utilizam o `SyncEngine.resolve(task, load)`.
- Se o dado em cache estiver válido, ele é servido imediatamente.
- Se estiver expirado (*stale*), os dados do cache são servidos instantaneamente enquanto uma `Task` de sincronização é enfileirada no **QStash** para atualização assíncrona.

### Isolamento dos Scrapers em Pacotes Monorepo
- O parsing das páginas da UnB é completamente desacoplado da API REST em dois pacotes (`packages/sigaa-client` e `packages/unb-browser`).
- **Resiliência a JSF**: O `sigaa-client` trata ciclos de vida de `ViewState`, postbacks de menus laterais (`jscookMenu`) e concorrência de sessão (*context locks*).
- **Extração geométrica de PDFs**: O `unb-browser` utiliza `pdfplumber` avaliando posicionamento espacial relativo para lidar com células mescladas e formatos variados entre os campi da UnB.

### Orquestração de Background Jobs (QStash)
- Operações lentas de sincronização completa são desacopladas da requisição síncrona do usuário.
- O QStash executa *flow control* baseado na matrícula do estudante (`parallelism: 1`), evitando conflitos de concorrência na mesma sessão do SIGAA.

---

## Estrutura de Diretórios do Projeto

```
.
├── apps/
│   ├── api/                   # Backend FastAPI
│   │   ├── api/
│   │   │   ├── core/          # Configurações e variáveis de ambiente
│   │   │   ├── db/            # Modelos SQLAlchemy e inicialização do banco
│   │   │   ├── dependencies/  # Injeção de dependências (FastAPI Depends)
│   │   │   ├── modules/       # Rotas organizadas por funcionalidade
│   │   │   ├── repositories/  # Consultas e persistência no banco
│   │   │   ├── services/      # Lógica de negócio e SyncEngine
│   │   │   └── utils/         # Criptografia de sessão e helpers
│   │   └── tests/             # Testes unitários e de integração da API
│   │
│   └── web/                   # Frontend TanStack Start
│       └── src/
│           ├── components/    # Componentes React de interface
│           ├── queries/       # Clientes de API (openapi-fetch e queries tipadas)
│           └── routes/        # Rotas da aplicação (file-based routing)
│
├── packages/
│   ├── sigaa-client/          # Scraper e cliente assíncrono do SIGAA
│   └── unb-browser/           # Scraper do RU e calendários acadêmicos
│
├── docs/                      # Documentação de arquitetura, requisitos e sprints
│   ├── assets/                # Diagramas renderizados em SVG e imagens
│   └── diagrams/              # Diagramas como código em C4-PlantUML (.puml)
└── compose.yml                # Configuração do PostgreSQL local
```
