import test from 'node:test';
import assert from 'node:assert/strict';

import { initHomeLocationDisplay } from '../../src/client/app/home-location-display.js';

class FakeClassList {
  constructor(...values) {
    this.values = new Set(values);
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }
}

function createButton(label) {
  return {
    textContent: label,
    classList: new FakeClassList('bg-pastelYellow'),
    parentElement: null,
    remove() {
      this.parentElement?.removeChild(this);
    }
  };
}

function createContainer(children = []) {
  const container = {
    children: [],
    appendChild(child) {
      child.parentElement?.removeChild(child);
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      if (child.parentElement === this) child.parentElement = null;
    },
    querySelectorAll(selector) {
      if (selector === 'button') return [...this.children];
      if (selector === 'button[aria-label^="在 Google 地圖搜尋"]') return [...this.children];
      if (selector === '.home-location-map-action') {
        return this.children.filter((child) => child.classList?.contains('home-location-map-action'));
      }
      return [];
    }
  };
  children.forEach((child) => container.appendChild(child));
  return container;
}

function createHarness(labels) {
  const metaRow = createContainer();
  let actions = createContainer(labels.map(createButton));
  const card = {
    id: '',
    querySelector(selector) {
      if (selector === '.enhanced-item-actions') return actions;
      if (selector === '.home-item-meta-row') return metaRow;
      if (selector === 'i.fa-tag') return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a[target="_blank"]') return [];
      return [];
    }
  };
  const list = { children: [card] };
  const documentRef = {
    getElementById(id) {
      return id === 'item-list' ? list : null;
    }
  };

  return {
    documentRef,
    metaRow,
    refreshActions() {
      actions = createContainer(labels.map(createButton));
    }
  };
}

for (const labels of [
  ['THE JUMP SHOP'],
  ['LOFT', 'Welcia ウエルシア薬局', 'Tsuruha Drug ツルハドラッグ', 'くすりの福太郎']
]) {
  test(`home location display stays unique after enhancement refresh: ${labels.join(' / ')}`, () => {
    const harness = createHarness(labels);

    initHomeLocationDisplay({ documentRef: harness.documentRef, MutationObserverImpl: null });
    harness.refreshActions();
    initHomeLocationDisplay({ documentRef: harness.documentRef, MutationObserverImpl: null });

    assert.deepEqual(
      harness.metaRow.children.map((button) => button.textContent),
      labels
    );
  });
}
