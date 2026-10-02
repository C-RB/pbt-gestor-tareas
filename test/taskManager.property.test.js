import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  TaskManager,
  STATES,
  ALLOWED_TRANSITIONS,
  ValidationError,
  NotFoundError,
} from '../src/taskManager.js';

const titleArb = fc
  .tuple(fc.constantFrom(...'abcXYZ019_-.'), fc.string({ maxLength: 49 }))
  .map(([head, tail]) => head + tail);
const blankTitleArb = fc.stringMatching(/^[ \t\n]*$/, { maxLength: 10 });
const descArb = fc.string({ maxLength: 100 });
const newTaskArb = fc.record({ title: titleArb, description: descArb });
const statusArb = fc.constantFrom(...STATES);

const managerWith = (inputs) => {
  const m = new TaskManager();
  const created = inputs.map((i) => m.create(i));
  return { m, created };
};

const assertThrows = (fn, ErrorType) => assert.throws(fn, ErrorType);

test('CREATE: toda entrada válida genera una tarea pendiente con ID único recuperable', () => {
  fc.assert(
    fc.property(fc.array(newTaskArb, { maxLength: 30 }), (inputs) => {
      const { m, created } = managerWith(inputs);
      const ids = created.map((t) => t.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(m.size, inputs.length);
      created.forEach((t, i) => {
        assert.equal(t.status, 'pendiente');
        assert.equal(t.title, inputs[i].title.trim());
        assert.deepEqual(m.get(t.id), t);
      });
    }),
  );
});

test('CREATE: un título vacío o solo espacios siempre es rechazado y no altera el estado', () => {
  fc.assert(
    fc.property(blankTitleArb, descArb, (title, description) => {
      const m = new TaskManager();
      assertThrows(() => m.create({ title, description }), ValidationError);
      assert.equal(m.size, 0);
    }),
  );
});

test('READ: list() contiene exactamente las tareas creadas y get(id) es consistente con list()', () => {
  fc.assert(
    fc.property(fc.array(newTaskArb, { maxLength: 30 }), (inputs) => {
      const { m, created } = managerWith(inputs);
      const listed = m.list();
      assert.deepEqual(listed, created);
      listed.forEach((t) => assert.deepEqual(m.get(t.id), t));
    }),
  );
});

test('READ: leer es idempotente y no expone estado interno mutable', () => {
  fc.assert(
    fc.property(newTaskArb, (input) => {
      const m = new TaskManager();
      const t = m.create(input);
      assert.deepEqual(m.get(t.id), m.get(t.id));
      m.get(t.id).title = 'MUTADO';
      m.list()[0].title = 'MUTADO';
      assert.equal(m.get(t.id).title, t.title);
    }),
  );
});

test('READ: un ID inexistente siempre lanza NotFoundError', () => {
  fc.assert(
    fc.property(
      fc.array(newTaskArb, { maxLength: 10 }),
      fc.nat({ max: 1000 }),
      fc.boolean(),
      (inputs, offset, below) => {
        const { m } = managerWith(inputs);
        // los IDs creados son 1..n
        const id = below ? -offset : inputs.length + 1 + offset;
        assertThrows(() => m.get(id), NotFoundError);
      },
    ),
  );
});

test('UPDATE: modifica solo los campos indicados y conserva ID y estado', () => {
  fc.assert(
    fc.property(newTaskArb, titleArb, descArb, (input, title, description) => {
      const m = new TaskManager();
      const original = m.create(input);
      const updated = m.update(original.id, { title, description });
      assert.equal(updated.id, original.id);
      assert.equal(updated.status, original.status);
      assert.equal(updated.title, title.trim());
      assert.equal(updated.description, description);
      assert.deepEqual(m.get(original.id), updated);
      assert.equal(m.size, 1);
    }),
  );
});

test('UPDATE: es idempotente (aplicar dos veces el mismo cambio equivale a una)', () => {
  fc.assert(
    fc.property(newTaskArb, titleArb, descArb, (input, title, description) => {
      const m = new TaskManager();
      const { id } = m.create(input);
      const once = m.update(id, { title, description });
      const twice = m.update(id, { title, description });
      assert.deepEqual(twice, once);
    }),
  );
});

test('UPDATE: el estado solo cambia por transiciones permitidas de la máquina de estados', () => {
  fc.assert(
    fc.property(fc.array(statusArb, { maxLength: 20 }), newTaskArb, (targets, input) => {
      const m = new TaskManager();
      const { id } = m.create(input);
      for (const target of targets) {
        const before = m.get(id).status;
        const allowed = target === before || ALLOWED_TRANSITIONS[before].includes(target);
        if (allowed) {
          assert.equal(m.update(id, { status: target }).status, target);
        } else {
          assertThrows(() => m.update(id, { status: target }), ValidationError);
          assert.equal(m.get(id).status, before);
        }
      }
    }),
  );
});

test('UPDATE: un título inválido es rechazado y la tarea queda intacta', () => {
  fc.assert(
    fc.property(newTaskArb, blankTitleArb, (input, badTitle) => {
      const m = new TaskManager();
      const t = m.create(input);
      assertThrows(() => m.update(t.id, { title: badTitle }), ValidationError);
      assert.deepEqual(m.get(t.id), t);
    }),
  );
});

test('DELETE: elimina exactamente la tarea indicada y conserva las demás', () => {
  fc.assert(
    fc.property(
      fc.array(newTaskArb, { minLength: 1, maxLength: 30 }),
      fc.nat(),
      (inputs, pick) => {
        const { m, created } = managerWith(inputs);
        const victim = created[pick % created.length];
        m.delete(victim.id);
        assert.equal(m.size, created.length - 1);
        assertThrows(() => m.get(victim.id), NotFoundError);
        assert.deepEqual(
          m.list(),
          created.filter((t) => t.id !== victim.id),
        );
      },
    ),
  );
});

test('DELETE: eliminar dos veces falla la segunda vez y los IDs eliminados nunca se reutilizan', () => {
  fc.assert(
    fc.property(newTaskArb, newTaskArb, (a, b) => {
      const m = new TaskManager();
      const first = m.create(a);
      m.delete(first.id);
      assertThrows(() => m.delete(first.id), NotFoundError);
      const second = m.create(b);
      assert.notEqual(second.id, first.id);
    }),
  );
});

test('INVERSA: create seguido de delete restaura el contenido original', () => {
  fc.assert(
    fc.property(fc.array(newTaskArb, { maxLength: 20 }), newTaskArb, (inputs, extra) => {
      const { m, created } = managerWith(inputs);
      const t = m.create(extra);
      m.delete(t.id);
      assert.deepEqual(m.list(), created);
    }),
  );
});

test('CREATE/UPDATE: títulos como __proto__, toString o constructor se almacenan sin corromper el estado', () => {
  const dangerousArb = fc.constantFrom('__proto__', 'toString', 'valueOf', 'constructor', 'hasOwnProperty');
  fc.assert(
    fc.property(dangerousArb, dangerousArb, (a, b) => {
      const m = new TaskManager();
      const t = m.create({ title: a, description: b });
      assert.equal(t.title, a);
      assert.equal(m.get(t.id).description, b);
      assert.equal(m.update(t.id, { title: b }).title, b);
      assert.equal(Object.getPrototypeOf(m.get(t.id)), Object.prototype);
      assert.equal(m.size, 1);
    }),
  );
});
