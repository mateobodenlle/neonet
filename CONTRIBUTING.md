# Contributing to Agenda2

Convenciones de control de versiones para este repo. **Aplican siempre, sin excepciones.**

## 1. Autoría — regla estricta

Todos los commits y pushes se firman como:

- **Name:** `mateobodenlle`
- **Email:** `mateobodenlle@rai.usc.es`

**Prohibido en cualquier parte del repo (commits, mensajes, body, footer, PR titles, PR bodies, nombres de rama, comentarios de código, docs, issues):**

- Mencionar Claude, Claude Code, Anthropic, ChatGPT, Copilot, Cursor o cualquier asistente de IA.
- Incluir trailers `Co-Authored-By:` de cualquier tipo.
- Tags `🤖 Generated with ...` o equivalentes.

El historial debe quedar como si lo hubiese escrito yo a mano.

## 2. Branching

- `main` — rama por defecto, siempre deployable.
- Ramas de trabajo: `<type>/<resumen-kebab-case>`
  - `feat/voice-input`
  - `fix/search-empty-state`
  - `chore/update-deps`
  - `refactor/store-repository`
- Los tipos válidos coinciden con los de Conventional Commits (ver §3).
- Ramas cortas y vivas: cuando se mergea a `main` se borran.

## 3. Mensajes de commit — Conventional Commits

Formato:

```
<type>(<scope>)?: <subject>

<body opcional>

<footer opcional>
```

### Reglas

- **type** (obligatorio, lowercase): uno de `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **scope** (opcional, lowercase, kebab-case): área tocada — `contacts`, `events`, `graph`, `store`, `ui`, `mock-data`, `repo`.
- **subject**:
  - Modo imperativo (`add`, no `added`/`adds`).
  - En minúscula.
  - Sin punto final.
  - Máximo 72 caracteres.
- **body** (opcional): explicar el *por qué*, no el *qué*. Wrap a 72 columnas. Separado del subject por línea en blanco.
- **footer** (opcional):
  - `BREAKING CHANGE: <descripción>` para cambios incompatibles.
  - `Closes #123`, `Refs #45` para referenciar issues.

### Tipos — cuándo usar cada uno

| type | uso |
|------|-----|
| `feat` | nueva funcionalidad de usuario |
| `fix` | corrección de bug |
| `docs` | solo documentación |
| `style` | formato (no afecta lógica) |
| `refactor` | reestructuración sin cambio funcional |
| `perf` | mejora de rendimiento |
| `test` | añadir o corregir tests |
| `build` | sistema de build, deps |
| `ci` | configuración CI |
| `chore` | tareas auxiliares (limpieza, configs) |
| `revert` | revertir un commit anterior |

### Ejemplos

```
feat(contacts): add temperature filter to list view
fix(store): persist archived flag through page refresh
refactor(graph): migrate to xyflow v12
chore(deps): bump next to 15.0.3
docs(readme): document mock data reset flow
```

Con body:

```
feat(contacts): add NL input box

Receives a free-text note ("hoy quedé con Jaime y me contó...") and
extracts entities to create or update the matching person and a new
encounter. Entity resolution falls back to a confirmation dialog when
multiple candidates score above threshold.
```

## 4. Versionado — SemVer

- `MAJOR.MINOR.PATCH`.
- `MAJOR`: breaking change incompatible.
- `MINOR`: funcionalidad nueva backward-compatible.
- `PATCH`: bug fixes backward-compatible.
- Releases marcados con tags `vX.Y.Z` anotados.
- Pre-1.0: API/UI inestable; cualquier cambio puede ser breaking sin bump de major.

## 5. Pull Requests

- Una PR = un cambio cohesionado.
- Título de la PR sigue el formato Conventional Commits.
- Merge a `main` mediante **squash-merge**; el commit final hereda el título de la PR.
- No hace falta CHANGELOG manual: el log de `main` ya está estructurado.

## 6. Reglas de seguridad git

- No se commitean secretos (`.env*`, tokens, claves) — protegidos por `.gitignore`.
- Nunca `--no-verify` ni se saltan hooks.
- `git push --force` solo en ramas propias, nunca a `main`.
- Antes de operaciones destructivas (`reset --hard`, `clean -fd`), confirmar.
