// WŁASNE KATEGORIE: host wpisuje swoje hasła, a przeglądarka trzyma je w localStorage.
// Serwer dostaje treść kategorii dopiero wtedy, gdy host wybierze ją do gry.

const CUSTOM_STORAGE_KEY = 'customCategories';

let editedCategoryId = null;    // null = tworzenie nowej kategorii

function loadCustomCategories() {
    try {
        const saved = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY));
        return Array.isArray(saved) ? saved.filter(c => c && c.id && c.name && Array.isArray(c.entries)) : [];
    } catch (e) {
        return [];
    }
}

function saveCustomCategories(categories) {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(categories));
}

function customLimits() {
    return findMode(gameMode).custom.limits;
}

// ===== KAFELKI NA LIŚCIE KATEGORII =====

function createCustomCategoryTile(customCategory, isSelected) {
    const tile = createCategoryTile(
        { id: findMode(gameMode).custom.id, name: customCategory.name },
        `${customCategory.entries.length} haseł · własna`,
        () => selectCustomCategory(customCategory)
    );
    tile.classList.toggle('selected', isSelected);

    // Przycisk w przycisku nie jest poprawnym HTML-em, stąd span
    const edit = createElement('span', 'category-edit');
    edit.innerHTML = categoryArt[findMode(gameMode).custom.id].svg;
    edit.title = 'Edytuj kategorię';
    edit.onclick = (event) => {
        event.stopPropagation();
        openCategoryEditor(customCategory.id);
    };
    tile.append(edit);
    return tile;
}

function createNewCategoryTile() {
    return createCategoryTile(
        { id: 'nowa', name: 'Nowa kategoria' },
        'Wpisz własne hasła',
        () => openCategoryEditor(null)
    );
}

function selectCustomCategory(customCategory) {
    closeCategoryPicker();
    changeSettings({ category: findMode(gameMode).custom.id, custom: customCategory });
}

// ===== EDYTOR =====
// Hasła edytujemy w pamięci (editorEntries), do localStorage trafiają dopiero po "Zapisz".
// Każde hasło to wiersz: pole z hasłem i podpowiedzi dla impostora jako żetony.

let editorEntries = [];      // [{ word, hints }] w kolejności dodawania
let editorSnapshot = "";     // stan z chwili otwarcia - do pytania o niezapisane zmiany

function showPickerView(viewId) {
    ['picker-view-list', 'picker-view-editor'].forEach(id => {
        byId(id).classList.toggle('hidden', id !== viewId);
    });
}

function isCategoryEditorOpen() {
    return !byId('picker-view-editor').classList.contains('hidden');
}

function openCategoryEditor(id) {
    const edited = loadCustomCategories().find(c => c.id === id);
    const limits = customLimits();

    editedCategoryId = edited ? edited.id : null;
    editorEntries = edited ? edited.entries.map(entry => ({ word: entry.word, hints: [...entry.hints] })) : [];

    byId('editor-title').textContent = edited ? '— Edytuj kategorię —' : '— Nowa kategoria —';
    byId('editor-name').maxLength = limits.name;
    byId('editor-name').value = edited ? edited.name : "";
    byId('editor-new-word').maxLength = limits.word;
    byId('editor-new-word').value = "";
    byId('editor-delete').classList.toggle('hidden', !edited);

    editorSnapshot = editorState();
    showEditorPaste(false);
    renderEditorEntries();
    showPickerView('picker-view-editor');
}

function editorState() {
    return JSON.stringify([byId('editor-name').value.trim(), cleanEditorEntries()]);
}

// Wróć do listy - z pytaniem, jeśli coś zmieniono i nie zapisano
function closeCategoryEditor() {
    if (editorState() !== editorSnapshot && !confirm('Wyjść bez zapisywania zmian?')) return;
    leaveCategoryEditor();
}

function leaveCategoryEditor() {
    showPickerView('picker-view-list');
    renderCategoryPicker();
}

// Hasła gotowe do zapisu: przycięte, bez pustych i bez powtórzeń
function cleanEditorEntries() {
    const limits = customLimits();
    const seen = new Set();

    return editorEntries
        .map(entry => ({ word: entry.word.trim().slice(0, limits.word), hints: entry.hints.slice(0, limits.hints) }))
        .filter(entry => {
            const key = entry.word.toLowerCase();
            if (!entry.word || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limits.maxEntries);
}

function hasEditorWord(word) {
    return editorEntries.some(entry => entry.word.trim().toLowerCase() === word.toLowerCase());
}

// ===== WIERSZE HASEŁ =====

function renderEditorEntries() {
    const list = byId('editor-list');
    list.replaceChildren(...editorEntries.map(createEditorRow));
    if (editorEntries.length === 0) {
        list.append(createElement('p', 'picker-empty', 'Brak haseł - wpisz pierwsze poniżej'));
    }
    updateEditorStatus();
}

function createEditorRow(entry) {
    const limits = customLimits();
    const row = createElement('div', 'editor-entry');

    const word = createElement('input', 'editor-word');
    word.value = entry.word;
    word.maxLength = limits.word;
    word.placeholder = 'Hasło';
    word.oninput = () => {
        entry.word = word.value;
        updateEditorStatus();
    };

    const remove = createElement('button', 'editor-remove', '✕');
    remove.title = 'Usuń hasło';
    remove.onclick = () => {
        editorEntries = editorEntries.filter(e => e !== entry);
        if (editorEntries.length === 0) return renderEditorEntries();
        row.remove();
        updateEditorStatus();
    };

    const head = createElement('div', 'editor-entry-head');
    head.append(word, remove);

    const hints = createElement('div', 'editor-hints');
    entry.hints.forEach((hint, index) => {
        const chip = createElement('span', 'editor-chip', hint);
        const removeHint = createElement('button', 'editor-chip-remove', '✕');
        removeHint.title = 'Usuń podpowiedź';
        removeHint.onclick = () => {
            entry.hints.splice(index, 1);
            refreshEditorRow(row, entry, false);
        };
        chip.append(removeHint);
        hints.append(chip);
    });
    if (entry.hints.length < limits.hints) hints.append(createHintInput(row, entry));

    row.append(head, hints);
    return row;
}

// Podpowiedź dodaje Enter, przecinek albo wyjście z pola; Backspace w pustym polu usuwa ostatnią
function createHintInput(row, entry) {
    const input = createElement('input', 'editor-hint-input');
    input.maxLength = customLimits().hint;
    input.placeholder = entry.hints.length > 0 ? '+ podpowiedź' : '+ podpowiedź dla impostora';
    input.enterKeyHint = 'enter';

    input.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            addEditorHint(row, entry, input, true);
        } else if (event.key === 'Backspace' && !input.value && entry.hints.length > 0) {
            entry.hints.pop();
            refreshEditorRow(row, entry, true);
        }
    };
    input.onblur = () => addEditorHint(row, entry, input, false);
    return input;
}

function addEditorHint(row, entry, input, keepFocus) {
    const hint = input.value.trim();
    if (!hint) return;

    // Pole czyścimy od razu, bo podmiana wiersza może wywołać jeszcze jedno "blur"
    input.value = "";
    if (!entry.hints.some(h => h.toLowerCase() === hint.toLowerCase())) entry.hints.push(hint);
    refreshEditorRow(row, entry, keepFocus);
}

// Przerysowuje jeden wiersz, żeby lista nie skakała i nie gubiła tego, co wpisano w innych
function refreshEditorRow(row, entry, focusHint) {
    const fresh = createEditorRow(entry);
    row.replaceWith(fresh);
    if (focusHint) {
        const input = fresh.querySelector('.editor-hint-input');
        if (input) input.focus();
    }
    updateEditorStatus();
}

function addEditorEntry() {
    const input = byId('editor-new-word');
    const word = input.value.trim();
    input.focus();
    if (!word) return;

    const { maxEntries } = customLimits();
    if (editorEntries.length >= maxEntries) return showEditorNotice(`Maksymalnie ${maxEntries} haseł`);
    if (hasEditorWord(word)) return showEditorNotice('To hasło już jest na liście');

    editorEntries.push({ word, hints: [] });
    input.value = "";
    renderEditorEntries();
    scrollEditorToEnd();
}

function scrollEditorToEnd() {
    const list = byId('editor-list');
    list.scrollTop = list.scrollHeight;
}

// ===== WKLEJANIE LISTY =====

function showEditorPaste(show) {
    byId('editor-main').classList.toggle('hidden', show);
    byId('editor-paste').classList.toggle('hidden', !show);
    if (show) {
        byId('editor-paste-text').value = "";
        byId('editor-paste-text').focus();
    }
}

// Jedno hasło w linii. Numeracja i myślniki (np. z listy od AI) są pomijane,
// a stary zapis "hasło | podpowiedź, podpowiedź" dalej działa.
function importEditorPaste() {
    const limits = customLimits();

    byId('editor-paste-text').value.split('\n').forEach(line => {
        const [wordPart, hintsPart = ''] = line.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').split('|');
        const word = wordPart.trim().slice(0, limits.word);
        if (!word || hasEditorWord(word) || editorEntries.length >= limits.maxEntries) return;

        const hints = hintsPart.split(',')
            .map(hint => hint.trim().slice(0, limits.hint))
            .filter(Boolean)
            .slice(0, limits.hints);
        editorEntries.push({ word, hints });
    });

    showEditorPaste(false);
    renderEditorEntries();
    scrollEditorToEnd();
}

// ===== ZAPIS =====

// Zwraca komunikat błędu albo null, gdy kategorię można zapisać
function validateEditor(name, entries) {
    const limits = customLimits();
    const missing = limits.minEntries - entries.length;

    if (!name) return 'Podaj nazwę kategorii';
    if (missing > 0) return `Dodaj jeszcze ${missing} ${missing === 1 ? 'hasło' : 'hasła'}`;
    return null;
}

function updateEditorStatus() {
    const entries = cleanEditorEntries();
    const error = validateEditor(byId('editor-name').value.trim(), entries);
    const withHints = entries.filter(entry => entry.hints.length > 0).length;

    byId('editor-status').classList.toggle('editor-status-ready', !error);
    byId('editor-status').textContent = error || `Haseł: ${entries.length} · z podpowiedzią: ${withHints}`;
}

// Chwilowy komunikat w miejscu statusu - znika przy następnej zmianie
function showEditorNotice(text) {
    byId('editor-status').classList.remove('editor-status-ready');
    byId('editor-status').textContent = text;
}

function saveCategoryEditor() {
    const name = byId('editor-name').value.trim();
    const entries = cleanEditorEntries();
    if (validateEditor(name, entries)) return updateEditorStatus();

    const categories = loadCustomCategories();
    const saved = { id: editedCategoryId || `c-${Date.now().toString(36)}`, name: name, entries: entries };
    const index = categories.findIndex(c => c.id === saved.id);

    if (index === -1) categories.push(saved);
    else categories[index] = saved;
    saveCustomCategories(categories);

    showPickerView('picker-view-list');
    selectCustomCategory(saved);
}

function deleteCategoryEditor() {
    if (!confirm('Usunąć tę kategorię? Tej operacji nie da się cofnąć.')) return;

    const wasSelected = isCustomCategorySelected(editedCategoryId);
    saveCustomCategories(loadCustomCategories().filter(c => c.id !== editedCategoryId));

    // Usunięta kategoria nie może zostać wybrana w pokoju - wracamy do domyślnej
    if (wasSelected) changeSettings({ category: null });
    leaveCategoryEditor();
}
