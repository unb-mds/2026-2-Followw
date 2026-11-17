# Publicação do plano de ensino

Aplicar as colunas no banco de destino antes de publicar a API. A consulta de Minhas Turmas
carrega `teaching_plan_synced_at` mesmo sem abrir a aba Plano de ensino. `db-init` não adiciona
colunas a tabelas existentes.

Verificação somente de leitura, executada no mesmo banco configurado no deploy:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'classrooms'
  AND column_name IN ('teaching_plan', 'teaching_plan_synced_at')
ORDER BY column_name;
```

O resultado deve conter `teaching_plan` (`jsonb`, nullable) e `teaching_plan_synced_at`
(`timestamp with time zone`, nullable). Uma verificação em banco local não confirma o destino.

Ordem: confirmar as duas colunas no destino, publicar a API, validar Minhas Turmas e a rota
`GET /classrooms/{classroom_id}/teaching-plan`, e publicar o frontend. A ausência de plano retorna
`200 null`. Não recriar o banco de produção para aplicar essa alteração.

**Confirmação do banco de destino pendente.** A conexão remota configurada recusou a autenticação
(`InvalidPasswordError`), impedindo a consulta do schema. O banco local foi validado; isso não
confirma o banco de publicação. É necessário acesso válido de quem administra o destino para
verificar as colunas antes de publicar a API.
