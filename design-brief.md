# Neonet — Brief de diseño para mockup de frontend

> Documento autocontenido para pedirle a un diseñador (humano o LLM) un mockup del frontend completo. No asume conocimiento previo del repo.

---

## 1. Qué es Neonet en una frase

Un CRM personal de un solo usuario, donde la forma por defecto de capturar información es escribir una nota en lenguaje natural y dejar que el sistema extraiga personas, encuentros, promesas y contexto.

## 2. El usuario (uno solo)

- Mateo Bodenlle, cofundador de OSIX Tech y Shearn (Santiago de Compostela).
- Conoce 30–80 personas nuevas cada mes en eventos de emprendimiento, cenas, cafés, reuniones, South Summit, 4YFN, etc.
- En el mismo grafo conviven clientes, inversores, partners, talento y amigos. Una misma persona suele ser varias cosas a la vez.
- Necesita: a los 3 meses retomar una conversación donde se quedó, no desde cero.
- **No es un equipo de ventas.** No hay stages, ni forecasting, ni multi-tenant, ni colaboración. Optimizar para un único operador.

## 3. Premisa de diseño dura: la fricción es el enemigo

La forma natural de registrar algo es:

> "hoy quedé con Jaime, me dijo que están con un round seed, me presentó a Marta de Bewa, le prometí el deck el lunes"

Eso debe poder escribirse en una caja de texto desde cualquier pantalla y resolverse solo. **Los formularios manuales son el último recurso, no el primero.** Cualquier flujo de diseño que requiera rellenar 6 campos para añadir un contacto está mal pensado.

Otros principios:

1. **Cada persona es un dossier vivo** — encuentros, observaciones fechadas, promesas en ambas direcciones, intereses, quién la presentó.
2. **Cercanía atemporal vs. temperatura comercial son cosas distintas.** Cercanía = cuánto la conoces como persona (desconocido → mejor-amigo). Temperatura = qué tan caliente está ahora a nivel de negocio (frío/tibio/caliente). Visualmente deben distinguirse, no fundirse.
3. **Briefing pre-reunión en 3 segundos.** Si voy a ver a alguien en 10 minutos, abrir su ficha tiene que darme: última conversación, promesas abiertas en ambas direcciones, lo último que me contó.
4. **Grafo de conexiones** — "¿quién de los míos conoce a X?", "¿en qué evento nos conocimos?".
5. **Móvil es first-class** (futuro voice-first), pero el mockup actual puede ser desktop-first siempre que no rompa en mobile.

## 4. Modelo de datos (lo que el frontend renderiza)

### Person
- `fullName`, `aliases[]`, `role`, `company`, `sector`, `seniority`, `location`.
- `handles`: linkedin, instagram, twitter, email, phone, website.
- `category`: `cliente-potencial | cliente | inversor | partner | talento | amigo | otro`.
- `temperature`: `frio | tibio | caliente` (comercial).
- `closeness`: `desconocido | conocido | amigable | amigo | amigo-cercano | mejor-amigo` (atemporal).
- `tags[]`, `interests[]`, `affinity` (1–5), `trust` (1–5), `nextStep`, `archived`.

### Event
- `name`, `location`, `date`, `endDate`, `notes`. Pensado para "South Summit 2025", "Cena founders 12-mar", etc.

### Observation (la unidad atómica del log)
- Texto reescrito por el LLM en una sola frase.
- `facets`: estructura libre con un `type` que puede ser `pain_point | promesa | evento | personal | profesional | interes | relacion`.
- Fecha. Origen (`nl-extraction`, `manual`, `import-linkedin`).
- Puede ser **superseded** por otra observación posterior (corrección sin mutar historia).
- Embedding vectorial → búsqueda semántica.
- Cada observación tiene **participantes** con rol: `primary | co_subject | related | source | mentioned | promise_target`.

### PersonProfile (digest sintetizado)
- `narrative` (texto largo), `resolved_facts`, `recurring_themes`, `active_threads`.
- Se reconstruye en background. La UI **lee este digest cacheado**, no recalcula.

### Edges (grafo)
- `conoce | trabaja-con | familiar | presentado-por | inversor-de`.

## 5. Pantallas que tiene que cubrir el mockup

### 5.1 Home / Timeline
- Caja de NL input prominente arriba (es la acción más frecuente).
- Feed cronológico mezclado: encuentros recientes, promesas que vencen, contactos nuevos auto-creados, observaciones recientes.
- Tarjeta lateral o sección de "Pendientes": promesas yo→ellos y ellos→yo, ordenadas por fecha.
- Acceso rápido a últimos contactos vistos.

### 5.2 NL Preview (crítica)
Después de escribir una nota, el sistema devuelve un **draft** que el usuario revisa antes de persistir:
- Lista de `mentions` extraídas. Cada una con su candidato resuelto, candidatos alternativos (si ambiguo) y opción de "es nueva persona".
- Lista de `observations` extraídas, con su `type` (pain_point, promesa, etc.) y participantes.
- Eventos detectados.
- Warnings ("ambiguo: 3 candidatos para 'Marta'").
- Botones: confirmar todo, editar, descartar entradas individuales.
- **Esta pantalla es la diferencia entre que la herramienta sea mágica o frustrante.** Diseñarla con cuidado.

### 5.3 Lista de contactos
- Filtros por categoría, temperatura, cercanía, tags, sector, seniority, archivados.
- Búsqueda por texto libre (futuro: semántica sobre observaciones).
- Vista de tarjeta con avatar, nombre, empresa·rol, badges de categoría/temperatura/cercanía, próximo paso si lo hay.
- Acción inline para archivar, ver ficha, abrir LinkedIn.

### 5.4 Ficha de persona (la pantalla más densa)
Layout sugerido:

- **Header**: avatar, nombre, aliases, empresa·rol, ubicación, handles sociales (iconos clicables), badges de categoría/cercanía/temperatura/affinity/trust, tags editables inline.
- **Próximo paso** (si existe): banda destacada arriba.
- **Caja de NL input "para esta persona"**: el sujeto está fijado, así que escribir "le prometí el deck el lunes" lo aplica directamente sin tener que mencionarla.
- **Narrative del PersonProfile**: el digest sintetizado, en prosa. Es lo que el usuario lee primero.
- **Active threads / Recurring themes**: bullets cortos.
- **Pendientes con esta persona**: promesas en ambas direcciones, dueDate, tick para completar.
- **Timeline de observaciones**: cronológico inverso. Cada observación muestra el texto, su tipo (chip), fecha, fuente. Las superseded se ven tachadas o colapsadas. Cada participante extra (co_subject, mentioned) se enlaza.
- **Encuentros / eventos**: lista o mini-timeline de eventos donde coincidieron.
- **Conexiones**: chips de personas relacionadas con el tipo de relación.
- **LinkedIn insight card** (si hay enriquecimiento): bloque con info externa.

### 5.5 Eventos
- Lista de eventos pasados/futuros.
- Detalle de evento: asistentes con sus avatares, observaciones generadas en ese evento, promesas que salieron de ahí.

### 5.6 Grafo
- Vista interactiva (xyflow) de personas como nodos y aristas de tipo `conoce | trabaja-con | familiar | presentado-por | inversor-de`.
- Filtros: por categoría, por evento, por cluster de conexión.
- Click en nodo → resumen lateral + link a ficha completa.

### 5.7 Review deck (revisión tipo Tinder)
- Para revisar candidatos importados (vCard, invitaciones LinkedIn) uno a uno: aceptar / archivar / merge con existente. Pensado en swipe en mobile, teclado en desktop.

### 5.8 Página /me
- Perfil del propio operador (Mateo). Sus prioridades, intereses, contexto activo. La IA usa esto como prior para extracción y síntesis.

### 5.9 Command Palette (Cmd-K)
- Búsqueda global de personas/eventos.
- Acciones rápidas: "añadir nota", "ver pendientes", "abrir grafo", "archivar X".
- Es el atajo del power-user. Tiene que existir en todas las pantallas.

## 6. Stack de implementación (para que el mockup sea realista)

- Next.js 15 + React 19 + Tailwind CSS.
- Radix UI primitives + componentes locales en `components/ui` (Button, Dialog, Popover, Command, Card, Badge, Avatar, Input, Textarea, Tooltip, Select, Tabs, ...).
- `cmdk` para el command palette.
- `@xyflow/react` para el grafo.
- `sonner` para toasts.
- Tipografía: sans serif moderna (Inter o similar). Densidad media-alta — el usuario es power-user, no necesita whitespace de marketing.

## 7. Tono visual sugerido

- **Editorial, no SaaS genérico.** Está más cerca de una bandeja de entrada bien diseñada (Things, Linear, Superhuman) que de un Salesforce.
- **Información densa pero respirable.** El usuario consulta fichas rápido; no puede scrollear 4 pantallas para ver pendientes.
- **Sin colores corporativos saturados.** Acento único, monocromo predominante, badges semánticos (categoría, temperatura, cercanía) con paletas distinguibles entre sí pero discretas.
- **Dark mode obligatorio.** Probablemente lo use de noche tomando notas tras una cena.
- **Idioma de la UI: español.** El producto es para uso personal en castellano; los enums y labels también (`pendientes`, `cercanía`, `pain points` está aceptado mezclado).

## 8. Microinteracciones que importan

- **NL preview con confirmación inline**: poder editar una mention sin abrir un modal aparte.
- **Undo en todo lo destructivo** (archivar, descartar observación). Toast con "deshacer" durante 5s.
- **Hover en una persona en cualquier pantalla** → tooltip con resumen de 3 líneas (último encuentro, próximo paso, pendientes count).
- **Marcar promesa como cumplida** desde la ficha *o* desde el feed, sin navegar.
- **Auto-creación visible**: si la nota crea una persona nueva, el feed lo señala con un badge "auto-creado · revisar" para que el usuario corrija nombre/empresa después.

## 9. Anti-patrones explícitos a evitar

- Wizards de varios pasos para añadir un contacto.
- Pipeline kanban tipo Pipedrive/HubSpot.
- Dashboards con métricas agregadas (no tiene sentido para 1 usuario).
- Vista de "deals" o "oportunidades".
- Onboarding tutorial. El usuario es el dueño del sistema, no un trial.
- Notificaciones tipo CRM corporativo. Sí avisos discretos de promesas vencidas.

## 10. Entregables esperados del mockup

1. Home / timeline.
2. NL preview con casos: mention ambigua (3 candidatos), persona nueva propuesta, observación tipo promesa, tipo pain point.
3. Lista de contactos con filtros activos.
4. Ficha de persona completa con todas las secciones del 5.4.
5. Detalle de evento.
6. Grafo con nodo seleccionado.
7. Command palette abierto.
8. Review deck (una tarjeta).
9. Página /me.
10. Versión mobile de: home, NL input, ficha de persona, pendientes.
11. Light + dark mode al menos para home y ficha.

## 11. Cosas que NO necesito en el mockup

- Pantallas de auth/login (es single-user).
- Pantallas de billing.
- Settings genéricos (sí un /me que es contenido, no configuración).
- Vistas de admin / equipo / permisos.
