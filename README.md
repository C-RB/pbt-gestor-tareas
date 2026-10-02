# Gestor de tareas con Property-Based Testing

Laboratorio de Pruebas de Software (ICC735). Sistema CRUD en memoria para la entidad **Tarea**, validado con pruebas basadas en propiedades usando [fast-check](https://fast-check.dev/).

## Uso

```bash
npm install
npm test
```

Requiere Node.js 20 o superior.

## Dominio

Una tarea tiene `id`, `title`, `description` y `status`.

Reglas de negocio:
- El título es obligatorio (no vacío ni solo espacios) y se recorta.
- Los IDs son únicos, autoincrementales y nunca se reutilizan.
- Todo estado inicial es `pendiente`.
- Transiciones de estado permitidas:
  - `pendiente` -> `en_progreso`, `cancelada`
  - `en_progreso` -> `completada`, `cancelada`, `pendiente`
  - `completada` y `cancelada` son estados finales.

## Estructura

- `src/taskManager.js`: implementación (`create`, `get`, `list`, `update`, `delete`).
- `test/taskManager.property.test.js`: propiedades.

## Propiedades implementadas

| Operación | Propiedad | Tipo |
|-----------|-----------|------|
| Create | Entradas válidas generan tareas `pendiente` con IDs únicos, recuperables y con conteo correcto | Negocio (unicidad, conservación) |
| Create | Título vacío o en blanco siempre se rechaza sin alterar el estado | Negocio |
| Read | `list()` contiene exactamente lo creado y `get(id)` coincide con `list()` | Estructural |
| Read | Leer es idempotente y no expone estado interno mutable | Algebraica (idempotencia) |
| Read | ID inexistente siempre lanza `NotFoundError` | Negocio |
| Update | Solo cambian los campos indicados; `id` y `status` se conservan | Estructural |
| Update | Aplicar el mismo cambio dos veces equivale a una | Algebraica (idempotencia) |
| Update | El estado solo cambia por transiciones permitidas | Negocio (máquina de estados) |
| Update | Título inválido se rechaza y la tarea queda intacta | Negocio |
| Delete | Se elimina exactamente la tarea indicada y las demás se conservan | Estructural |
| Delete | Borrar dos veces falla; los IDs eliminados no se reutilizan | Negocio |
| Create + Delete | `create` seguido de `delete` restaura el estado original | Inversa |

Los generadores (`fc.string`, `fc.array`, `fc.record`, `fc.constantFrom`) producen títulos, descripciones, listas de tareas y secuencias de estados aleatorios; fast-check ejecuta 100 casos por propiedad y reduce (shrinking) los contraejemplos.
