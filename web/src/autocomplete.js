// Lightweight typeahead bound to a `.ac` container (input + ul.ac-menu).
// Calls /api/autocomplete and invokes onSelect({ lat, lon, label }).

export function attachAutocomplete(root, onSelect) {
  const input = root.querySelector('input');
  const menu = root.querySelector('.ac-menu');
  let items = [];
  let active = -1;
  let timer = null;
  let lastQuery = '';
  let selected = null;

  function close() {
    menu.hidden = true;
    menu.innerHTML = '';
    items = [];
    active = -1;
  }

  function render() {
    menu.innerHTML = '';
    items.forEach((it, i) => {
      const li = document.createElement('li');
      li.textContent = it.label;
      li.className = i === active ? 'active' : '';
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        choose(i);
      });
      menu.appendChild(li);
    });
    menu.hidden = items.length === 0;
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    selected = { lat: it.lat, lon: it.lon, label: it.label };
    input.value = it.label;
    close();
    onSelect(selected);
  }

  async function search(q) {
    try {
      const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (input.value.trim() !== q) return; // stale
      items = data.results ?? [];
      active = -1;
      render();
    } catch {
      close();
    }
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    // Typing invalidates a prior selection.
    if (selected && q !== selected.label) {
      selected = null;
      onSelect(null);
    }
    if (q.length < 2) {
      close();
      return;
    }
    if (q === lastQuery) return;
    lastQuery = q;
    clearTimeout(timer);
    timer = setTimeout(() => search(q), 180);
  });

  input.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, items.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) choose(active);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  input.addEventListener('blur', () => setTimeout(close, 120));

  return {
    get value() {
      return selected;
    },
    clear() {
      selected = null;
      input.value = '';
      close();
    },
  };
}
