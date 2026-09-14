import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoreHomeShell } from './auth-session.js';

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    values
  };
}

test('core homepage shell is applied without waiting for async enhancement modules', () => {
  let subtitleRemoved = false;
  const subtitle = { textContent: 'Shin-chan Style', remove: () => { subtitleRemoved = true; } };
  const addButton = { classList: classList(['absolute']) };
  const userPanel = { classList: classList(['relative', 'mt-4']) };
  const userName = { classList: classList([]) };
  const signOut = { classList: classList([]) };

  const documentRef = {
    querySelectorAll: () => [subtitle],
    getElementById(id) {
      return {
        'add-item-btn': addButton,
        'user-panel': userPanel,
        'user-name': userName,
        'sign-out-btn': signOut
      }[id] || null;
    }
  };

  applyCoreHomeShell(documentRef);

  assert.equal(subtitleRemoved, true);
  assert.equal(addButton.classList.contains('fixed'), true);
  assert.equal(addButton.classList.contains('absolute'), false);
  assert.equal(userPanel.classList.contains('absolute'), true);
  assert.equal(userPanel.classList.contains('right-4'), true);
  assert.equal(userName.classList.contains('hidden'), true);
  assert.equal(signOut.classList.contains('hidden'), true);
});
