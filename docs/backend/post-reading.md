# Leitura de postagens de turma

Notícias, tópicos, materiais e avaliações retornam `is_read` nas listagens e detalhes de `/classrooms/{classroom_id}/posts` e no feed `/posts/news`. O feed `/posts`, vindo da home do SIGAA, não possui identificadores individuais para esse recurso.

- `PUT /classrooms/{classroom_id}/posts/{post_id}/read`, sem corpo, confirma a leitura e retorna `204`.
- `DELETE /classrooms/{classroom_id}/posts/{post_id}/read` remove a leitura e retorna `204`.
- Ambas as operações são individuais e idempotentes, exigem vínculo com a turma e retornam `404` para turma ou postagem inacessível.
- Confirmar uma notícia cujo detalhe não foi carregado retorna `409`; conteúdo vazio já carregado pode ser confirmado.

Consultar uma postagem não confirma leitura. A marcação pertence ao usuário persistido e à postagem, sobrevive ao login e à troca de matrícula, e só é removida por ação explícita do usuário. Atualizar conteúdo não faz uma postagem lida voltar a não lida. Não há coluna ou token de versão.

O conteúdo carregado não expira e só é buscado novamente com `Cache-Control: no-cache`, inclusive nas turmas atuais. `max-age` não força essa atualização. Jobs de conteúdo também ignoram notícias já carregadas.

As listas de turmas atuais continuam vencendo após uma hora para descobrir novas postagens, sem sobrescrever os posts cujo conteúdo já foi carregado. Tópicos, materiais e avaliações vêm na própria listagem do SIGAA; não há consulta individual separada para esses tipos. Listas históricas não expiram. `no-cache` permite atualizar os dados existentes. O feed continua sem buscar detalhes das notícias.

Tópicos identificados pelo título/período e materiais dependentes deles podem ganhar novos IDs quando esses dados mudam; os novos registros começam não lidos, seguindo a identificação existente.

O esquema acrescenta somente a tabela `classroom_post_reads`, sem alterar as colunas de `classroom_posts`. Bancos que já receberam a implementação com versões precisam ser recriados conforme a política do projeto; `db-init` não remove colunas antigas.
