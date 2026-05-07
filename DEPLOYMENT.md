# Deployment — Vercel (plan Hobby)

Guía operativa para desplegar Neonet a Vercel desde cero y verificar que el
flujo móvil/desktop funciona en producción.

## 1. Pre-requisitos

- Cuenta de Vercel (plan Hobby es suficiente).
- Proyecto Supabase de producción ya creado, con:
  - Todas las migraciones aplicadas (`npm run db:migrate` apuntando a la DB
    de prod via `SUPABASE_DB_URL`).
  - `pgvector` y `gen_random_uuid` habilitados (los habilita la migración
    `0001_init.sql`).
- Claves disponibles a mano:
  - OpenAI API key con acceso a `gpt-4o-mini`, `gpt-4o`/`gpt-5`,
    `text-embedding-3-small` y `whisper-1`.
  - Supabase service role key del proyecto de producción.
  - Una contraseña de app que solo conozcas tú.
- CLI de Vercel: `npm i -g vercel` (opcional — también se puede operar
  todo desde el dashboard).

## 2. Variables de entorno

Setear en Vercel dashboard → Project → Settings → Environment Variables.

| Nombre | Tipo | Scope | Ejemplo / nota |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | All | `https://abcd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | All | `eyJhbGciOi...` (jwt anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | All | `eyJhbGciOi...` (jwt service role) |
| `SUPABASE_DB_URL` | **Secret** | All | `postgresql://postgres.[ref]:[pwd]@aws-0-[region].pooler.supabase.com:5432/postgres` |
| `OPENAI_API_KEY` | **Secret** | All | `sk-proj-...` |
| `OPENAI_EXTRACTION_MODEL` | Public | All | opcional, default `gpt-4o-mini` |
| `OPENAI_SYNTHESIS_MODEL` | Public | All | opcional, default `gpt-5` |
| `OPENAI_RERANK_MODEL` | Public | All | opcional, default `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | Public | All | opcional, default `text-embedding-3-small` |
| `JOB_SECRET` | **Secret** | All | `openssl rand -hex 32` |
| `APP_PASSWORD` | **Secret** | All | la contraseña global del app |
| `JWT_SECRET` | **Secret** | All | `openssl rand -hex 32` |
| `BYPASS_AUTH` | Public | (no setear) | sólo para emergencias — sección 6 |

Notas:
- "All" = production + preview + development. Si quieres permitir Preview
  Deployments públicos sin auth, NO setees `APP_PASSWORD` en Preview (la
  ruta de login devolverá 500 y el middleware bloqueará todo, lo cual no
  es lo que quieres). Más simple: setea las mismas vars en los tres scopes.
- `JWT_SECRET` debe ser idéntico en los tres scopes; si difiere, las
  cookies firmadas en un environment no se validan en otro.
- Para los públicos (`NEXT_PUBLIC_*`), Vercel los embebe en el bundle del
  cliente. Cualquiera puede leerlos. Las claves anon de Supabase son
  diseñadas para esto.

Generar secretos:

```bash
openssl rand -hex 32   # para JWT_SECRET y JOB_SECRET
```

## 3. Primer deploy

```bash
# Desde la raíz del repo
vercel link               # selecciona scope + proyecto (o crea uno nuevo)
# (setea env vars en el dashboard antes del primer deploy)
vercel --prod             # primer deploy a producción
```

Si conectas el repo de GitHub a Vercel desde el dashboard, cada push a
`main` dispara un deploy a producción y cada PR genera un Preview con su
propia URL. En ese caso, `vercel --prod` se vuelve opcional (solo para
forzar un deploy manual).

Build esperado: ~1-2 min. Si falla:
- Revisa el log de "Build" en el dashboard.
- Errores típicos: env var faltante (`Missing OPENAI_API_KEY`,
  `JWT_SECRET not set`), tipos rotos, dependencias desincronizadas.
- Recuerda que `npm install` corre con `--legacy-peer-deps` (configurado
  en el `engines`/`installCommand` si Vercel pregunta).

Después del deploy:
1. Visita la URL pública.
2. Te redirige a `/login` — mete `APP_PASSWORD`.
3. Visita `/m` desde el móvil; ejecuta el checklist de la sección 4.

## 4. Checklist post-deploy

Tras cada deploy a producción, ejecutar:

- [ ] `/login` carga sin errores en la consola del navegador.
- [ ] Login con password correcta funciona y redirige al destino.
- [ ] Login con password incorrecta muestra "Contraseña incorrecta".
- [ ] `/` (desktop) carga la sidebar y los datos.
- [ ] `/m` carga tras login, sin sidebar desktop.
- [ ] Botón de mic en `/m` pide permiso al navegador y transcribe ~5s
      de prueba.
- [ ] Procesar una nota corta muestra toast "Procesando…" y luego
      "Lista para revisar" con acción "Ver".
- [ ] El badge del header de `/m` se incrementa.
- [ ] `/m/pending` muestra la nota recién procesada.
- [ ] Abrir una nota pendiente muestra mentions, observaciones y la
      sticky bar inferior con "Descartar"/"Aplicar".
- [ ] "Aplicar" persiste correctamente (verificable en Supabase:
      `select id, applied_at from nl_extractions order by created_at desc limit 1`
      → `applied_at` no nulo).
- [ ] "Descartar" → la nota desaparece de `/m/pending`.
- [ ] Logout (icono en header / sidebar) cierra la sesión y redirige
      a `/login`.

## 5. Troubleshooting

### "Timeout en /api/transcribe"

- Plan Hobby: 10s máx por server function.
- El componente de voz hace hard-stop a 30s, pero audios largos pueden
  exceder los 10s de Whisper. Mantén notas <30s.
- Si pasa repetidamente, usar la API de Web Speech (botón "Probar
  reconocimiento del navegador" tras un fallo) — corre 100% en el
  cliente, sin límites.

### "Error de auth tras deploy" / "redirige al login en bucle"

- Causa típica: `JWT_SECRET` distinto entre lo que firma el token
  (login route) y lo que lo verifica (middleware) — sucede si setas el
  env var solo en un scope (production sí, preview no).
- Fix: setea `JWT_SECRET` idéntico en production + preview + development.
- Tras cambiarlo, todas las cookies actuales quedan invalidadas; los
  usuarios deberán hacer login de nuevo.

### Pantalla blanca tras login

- Revisa **Vercel dashboard → Deployments → [latest] → Functions logs**.
  Suele ser una env var faltante (`Missing OPENAI_API_KEY` lanza al
  cargar `lib/openai.ts`).
- Si es la primera vez que se accede a `/`, el HydrationGate del desktop
  hace una primera carga grande contra Supabase — verifica que
  `SUPABASE_SERVICE_ROLE_KEY` está seteado.

### "La cookie no se setea" / sesión no persiste

- Vercel siempre sirve por HTTPS, así que `secure: true` (activo en
  prod) funciona. Si por alguna razón pruebas el deploy desde
  `http://...` (impossible en Vercel salvo Preview con dominio
  personalizado mal configurado), la cookie no se setea.
- Verifica desde DevTools → Application → Cookies que aparece
  `neonet-auth` con `Secure`, `HttpOnly`, `SameSite=Lax`,
  `Path=/`, expiración 30 días.

### Voice no funciona en producción

- En HTTPS (siempre en Vercel), `getUserMedia` está disponible.
- Si Chrome bloquea el mic: revisa `chrome://settings/content/microphone`.
- Si la transcripción tarda >10s y devuelve 504, usar el fallback
  Web Speech.

### `/api/jobs/synthesize` devuelve 401 al hacer curl

- El middleware deja pasar si el header `x-job-secret` está presente.
  Si recibes 401, comprueba que pasas el header correctamente:
  ```bash
  curl -X POST https://<tu-dominio>/api/jobs/synthesize \
    -H "x-job-secret: $JOB_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"mode":"process-dirty","batchSize":5}'
  ```

## 6. Bypass de emergencia (`BYPASS_AUTH`)

Si la auth se rompe y necesitas recuperar acceso sin debug:

1. Vercel dashboard → Settings → Environment Variables.
2. Añadir `BYPASS_AUTH` = `true` (scope: Production).
3. **Redeploy** (las env vars no se aplican en caliente — botón
   "Redeploy" del último deployment).
4. Ahora cualquier ruta es accesible sin login. **Solo para diagnóstico.**
5. Cuando hayas resuelto el problema:
   - Borra la env var (o pónla a `false`).
   - Redeploy.
   - **Rota `JWT_SECRET`** por si alguien probó URLs durante el bypass.

⚠ Mientras `BYPASS_AUTH=true`, todo el CRM está públicamente accesible
si alguien adivina la URL. No olvides quitarlo.

## 7. Operativa habitual

- **Migrar la DB**: corre localmente, no desde Vercel.
  ```bash
  SUPABASE_DB_URL='<prod url>' npm run db:migrate
  ```
- **Job de síntesis** (recomputa `person_profiles` marcados dirty):
  ```bash
  curl -X POST https://<tu-dominio>/api/jobs/synthesize \
    -H "x-job-secret: $JOB_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"mode":"process-dirty","batchSize":5}'
  ```
  Vercel Hobby no tiene cron nativo. Si quieres automatizarlo, un cron
  externo (cron-job.org, GitHub Actions schedule) que invoque ese curl.

- **Reporte de coste OpenAI**: corre localmente contra prod:
  ```bash
  SUPABASE_DB_URL='<prod url>' npx tsx scripts/cost-report.ts --days=7
  ```

## 8. Limitaciones conocidas

- Plan Hobby: 10s timeout. La extracción NL puede acercarse al límite
  con directorio grande (>200 contactos). Si pasa, plan B en
  `lib/nl-actions-v2.ts:loadContextObservations` — comentar la llamada
  ahorra 1-2s a costa de perder contexto histórico en la extracción.
- No hay PWA / service worker. El móvil pide login otra vez si limpias
  cookies del navegador.
- No hay soporte iOS Safari testeado (objetivo: Chrome Android). En
  iOS Safari, MediaRecorder usa MP4 en vez de webm; el endpoint
  `/api/transcribe` lo acepta pero no está validado en producción.
