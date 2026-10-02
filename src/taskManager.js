export const STATES = ['pendiente', 'en_progreso', 'completada', 'cancelada'];

export const ALLOWED_TRANSITIONS = {
  pendiente: ['en_progreso', 'cancelada'],
  en_progreso: ['completada', 'cancelada', 'pendiente'],
  completada: [],
  cancelada: [],
};

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

function normalizeTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new ValidationError('El título no puede estar vacío');
  }
  return title.trim();
}

export class TaskManager {
  #tasks = new Map();
  #nextId = 1;

  create({ title, description = '' }) {
    const task = {
      id: this.#nextId++,
      title: normalizeTitle(title),
      description,
      status: 'pendiente',
    };
    this.#tasks.set(task.id, task);
    return { ...task };
  }

  get(id) {
    const task = this.#tasks.get(id);
    if (!task) throw new NotFoundError(`Tarea ${id} no existe`);
    return { ...task };
  }

  list() {
    return [...this.#tasks.values()].map((t) => ({ ...t }));
  }

  update(id, changes) {
    const current = this.#tasks.get(id);
    if (!current) throw new NotFoundError(`Tarea ${id} no existe`);

    const next = { ...current };
    if ('title' in changes) next.title = normalizeTitle(changes.title);
    if ('description' in changes) next.description = changes.description;
    if ('status' in changes && changes.status !== current.status) {
      if (!ALLOWED_TRANSITIONS[current.status].includes(changes.status)) {
        throw new ValidationError(
          `Transición inválida: ${current.status} -> ${changes.status}`,
        );
      }
      next.status = changes.status;
    }
    this.#tasks.set(id, next);
    return { ...next };
  }

  delete(id) {
    if (!this.#tasks.delete(id)) throw new NotFoundError(`Tarea ${id} no existe`);
  }

  get size() {
    return this.#tasks.size;
  }
}
