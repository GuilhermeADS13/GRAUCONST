# telegram-watchdog (DEPRECATED)

Esta pasta está vazia — a funcionalidade foi movida para o banco de dados via `pg_cron`.

## Histórico

Anteriormente, `telegram-watchdog` era uma Edge Function que
rodava a cada 5 minutos para detectar:

- Sensores offline (sem leitura > 15 min)
- Bateria baixa
- WiFi fraco

## Implementação Atual

O watchdog agora é implementado via SQL no Supabase:

- **Arquivo**: `migration_alertas.sql`
- **Agendamento**: `pg_cron` a cada 15 minutos (`*/15 * * * *`)
- **Alertas**: Disparados via `net.http_post()` para `/functions/v1/telegram-alert`

## Deploy

Não há código TypeScript para fazer deploy aqui. A lógica está no banco de dados.

Para ativar/verificar:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'watchdog-sensor';
```
