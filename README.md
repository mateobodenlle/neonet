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

La inteligencia (entrada natural, desambiguación de entidades, consultas semánticas) se apoya en Claude. El resto es Postgres + sincronización trivial.

## Estado actual

Versión web funcional con el CRM básico: contactos con ficha rica y editable, eventos con la gente conocida en ellos, grafo de conexiones, pendientes con undo, pain points, timeline unificado, búsqueda global con Cmd-K, archive de contactos, etc.

Lo que queda para que sea "mi herramienta" de verdad:

- Persistencia real (hoy vive en el navegador).
- Importer de LinkedIn y contactos del móvil para la carga inicial.
- Input en lenguaje natural con Claude — el feature que justifica el proyecto.
- App móvil Android con voice-first.

Lo demás es polish.
