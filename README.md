# Agenda2

Un CRM personal para mí. No es producto, al menos todavía — es una herramienta que construyo porque llevo años perdiendo información de gente que conozco en eventos y conversaciones, y termina costándome oportunidades meses después.

## El problema

Genero muchos contactos nuevos cada semana: eventos de emprendimiento, South Summit, 4YFN, cenas de founders, cafés, reuniones con inversores o clientes potenciales. Cada encuentro deja información útil — pain points que me mencionan, proyectos en los que andan, gente que tenemos en común, promesas que hacemos en el aire.

Hoy toda esa información vive en mi cabeza y alguna nota suelta. El resultado: a los 3 meses alguien me escribe, no me acuerdo del contexto, y la conversación arranca de cero cuando debería arrancar donde la dejamos.

Los CRMs estándar (HubSpot, Pipedrive, Folk, Attio...) no me cuadran porque:

- Están pensados para equipos de ventas con proceso definido, no para un operador comercial que navega relaciones fluidas entre clientes, inversores, partners, talento y amigos — a veces la misma persona es varias cosas a la vez.
- Meter datos es fricción pura: abrir la app, formulario, pestañas, guardar. Para mí el flujo real es "tomé un café con Jaime, me contó que…".
- No están diseñados para el contexto en el que yo me muevo: eventos continuos, cenas, presentaciones informales, conversaciones de pasillo.

## La idea

Un CRM pensado desde la forma en que yo vivo las relaciones profesionales:

**1. Entrada en lenguaje natural.** El modo por defecto para registrar algo no es un formulario — es una caja donde escribo:

> "Hoy quedé con Jaime, me dijo que tienen problemas con el stock en sus 42 tiendas y quiere ver una demo antes de verano. Me presentó a Marta de Kibo, le prometí el deck el lunes."

La herramienta identifica que "Jaime" es una persona concreta de mi red (y desambigua si tengo varios), crea el encuentro, extrae el pain point, añade a Marta como nuevo contacto con una arista de "me la presentó Jaime", y me genera el compromiso "enviar deck a Jaime con deadline el lunes". Sin formularios.

**2. Cada persona es un dossier vivo.** No solo datos fríos (rol, empresa, contacto). También: todos los encuentros que hemos tenido y dónde, los pain points que ha mencionado con fecha, las promesas abiertas en ambas direcciones, sus intereses declarados, cómo nos conocimos, quién me lo presentó, mi nivel de confianza y afinidad. Información que hoy pierdo.

**3. Grafo de conexiones.** Quién conoce a quién, quién me presentó a quién, qué eventos han coincidido. Útil para "necesito intro a X, ¿quién de los míos le conoce?" o "¿en qué evento nos conocimos?".

**4. Briefing pre-reunión.** Cuando tengo una reunión agendada o alguien me escribe, quiero ver en 3 segundos: última vez que hablamos, pain points pendientes, promesas abiertas, últimas interacciones. Sin rebuscar.

**5. Consulta en lenguaje natural.** No solo filtros estructurados — también búsqueda semántica sobre el texto libre de mis notas. Tipo "dame contactos que mencionaron algo de fraude en banca" o "¿quién de los míos podría invertir en salud digital?".

## Lo que NO es

- No es un CRM de ventas. No hay stages, forecasting ni KPIs.
- No es Linear/Notion/Airtable genérico. Es una herramienta específica para un tipo de operador: comercial o founder con red grande y vida de eventos.
- No es multi-usuario. Es mi herramienta personal. Si acaba siendo producto, será más adelante.
- No es un reemplazo del teléfono ni de LinkedIn — es la capa de memoria y contexto que falta entre esas cosas.

## Cómo lo estoy construyendo

Web primero, luego app móvil sincronizadas. Pensado desde el principio para que la entrada de datos sea lo menos friccional posible: voice-first en móvil (grabas 30 s saliendo de un café, la herramienta transcribe y estructura), caja de texto libre en web con extracción automática, Cmd-K global, quick-add sin diálogos.

La ingesta inicial viene del export de LinkedIn y los contactos del móvil — acepto que la primera sesión sea dura. A partir de ahí crece orgánicamente con el uso diario.

La inteligencia (entrada natural, desambiguación de entidades, consultas semánticas) se apoya en un LLM (OpenAI). El resto es Postgres + sincronización trivial.

## Estado actual

Versión web + móvil funcional, sobre Supabase de prod, con auth simple por contraseña global:

- Persistencia real en Postgres + pgvector (RLS server-only via service role).
- Importer LinkedIn (contactos, invitaciones, contenido) y vCard.
- Input en lenguaje natural sobre observaciones — el feature que justifica el proyecto. Extracción → preview → apply, con persistencia de cada extracción para revisión posterior.
- Síntesis de perfil por persona, batch + on-demand.
- Grafo, eventos, ficha rica, búsqueda Cmd-K, archive, merge manual, multi-select.
- Rutas móviles `/m/*` con captura por voz (Whisper + fallback Web Speech), buffer de notas pendientes y revisión vertical pensada para una mano.

Además, hay una **demo pública sin login** (`/demo`) con datos ficticios para que cualquiera pueda probar el flujo sin tocar mi CRM real — más detalle abajo.

Polish y siguientes:

- Bajar el coste de la llamada de extracción (hoy manda directorio entero — ver `PROJECT.md`).
- Síntesis automática programada (hoy se dispara manualmente).
- iOS Safari: el voice path está implementado pero no probado en producción.

---

## Setup local

```bash
npm install --legacy-peer-deps
cp .env.example .env.local       # rellena con las claves del proyecto Supabase
npm run db:migrate                # aplica migraciones SQL pendientes
npm run db:seed                   # carga el dataset mock (idempotente; usa --force para re-sembrar)
npm run dev
```

`.env.local` requiere (ver `.env.example` para el set completo):

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` — públicas, las usa el navegador.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypass de RLS (scripts y server actions).
- `SUPABASE_DB_URL` — connection string Postgres directa, sólo para `db:migrate`.
- `OPENAI_API_KEY` — extracción NL, síntesis, embeddings, transcripción Whisper.
- `JOB_SECRET` — protege `/api/jobs/*` (curl manuales, scripts).
- `APP_PASSWORD` y `JWT_SECRET` — auth global por contraseña + cookie firmada con jose.
  Generar `JWT_SECRET` con `openssl rand -hex 32`.

## Modo demo público

`/demo` es una variante completamente aislada del CRM real, accesible desde el botón "Probar demo" en `/login` (sin contraseña).

- **Datos ficticios en memoria:** 12 contactos representativos, observaciones, eventos, encuentros, edges y narrativas. Se cargan frescos cada sesión y se evaporan a los 30 min (o en cualquier redeploy / cold start).
- **Extracción real con OpenAI:** la nota natural se envía al mismo prompt que el CRM real, pero con el directorio de la demo. Con rate limit por IP: 30 extracciones/día, 5/min (transcripción: 15/día, 3/min).
- **El botón "Aplicar" no escribe nada en la base de datos** — las mutaciones quedan en el store en memoria de la sesión.
- **Aislamiento por construcción:** cookie distinta (`neonet-demo` vs `neonet-auth`), middleware que rechaza cookies cruzadas, regla ESLint `no-restricted-imports` que prohíbe a `lib/demo/**` / `app/demo/**` importar nada que toque Supabase o las server actions reales. Ver detalle en `CLAUDE.md` → "Public demo".
- **Rutas:** `/demo` (escritorio: home, contactos, grafo), `/demo/m` (móvil: captura, pendientes, revisión). La sidebar desktop tiene Cmd+Shift+J para abrir el extractor.

## Deployment

`DEPLOYMENT.md` cubre el despliegue a Vercel (Hobby): pre-requisitos, variables
de entorno, pasos de primer deploy, checklist post-deploy, troubleshooting y
válvula de bypass de auth para emergencias.

## Convenciones

Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md) para estándares de commits, branching, versionado y reglas de autoría.
