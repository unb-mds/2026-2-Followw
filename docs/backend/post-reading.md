# Leitura de postagens de turma

Notícias, tópicos, materiais e avaliações retornam `is_read` e `version` nas listagens e nos detalhes de `/classrooms/{classroom_id}/posts`. O feed `/posts/news` inclui os mesmos campos; `/posts`, que vem diretamente da home do SIGAA, não possui identificadores individuais para esse recurso.

- `PUT /classrooms/{classroom_id}/posts/{post_id}/read`, com `{"version": "UUID recebido na consulta"}`, confirma a leitura e retorna `204`.
- `DELETE /classrooms/{classroom_id}/posts/{post_id}/read` remove a leitura do usuário autenticado e retorna `204`.
- As operações são individuais e idempotentes, exigem vínculo com a turma e retornam `404` para turma ou postagem inacessível.

Consultar uma postagem não confirma leitura. Notícias sem detalhe carregado retornam `version: null`; tentar confirmá-las retorna `409`. Um conteúdo vazio já carregado pode ser confirmado normalmente. A confirmação de uma versão superada também retorna `409`: a interface deve consultar o detalhe novamente. A comparação considera a versão persistida no cache, sem consultar o SIGAA durante a confirmação.

Alterações em título, texto, anexos, link e datas/horários de atividade geram outra versão e deixam a postagem não lida para quem havia confirmado a anterior. A data de publicação e os horários de sincronização não invalidam a leitura. Restaurar um texto antigo também gera outra versão. A leitura pertence ao usuário persistido, sobrevive ao login e fica isolada por postagem e turma.

O conteúdo completo das notícias de turmas atuais vence após uma hora: consultar o detalhe vencido devolve o cache e agenda sua atualização; a edição aparece nas consultas seguintes. Listas seguem o mesmo prazo. O feed agenda atualizações das listas e continua sem buscar detalhes de notícias. Turmas históricas não expiram; `Cache-Control: no-cache` continua permitindo atualização explícita. Não há detecção de edições na origem antes da sincronização.

Tópicos identificados pelo título/período e materiais dependentes deles podem ganhar novos IDs quando esses dados mudam; os novos registros começam não lidos, seguindo a identificação existente.

O esquema acrescenta `classroom_posts.version` e a tabela `classroom_post_reads`. Conforme a política do projeto, não há migração: um banco existente precisa ser recriado para receber a nova coluna; `db-init` sozinho apenas cria tabelas ausentes.
