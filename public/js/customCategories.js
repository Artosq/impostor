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

// ===== TEKST W EDYTORZE =====
// Jedno hasło w linii; podpowiedzi opcjonalnie po znaku "|", oddzielone przecinkami

function parseEntries(text) {
    const limits = customLimits();
    const seen = new Set();
    const entries = [];

    text.split('\n').forEach(line => {
        const [wordPart, hintsPart = ''] = line.split('|');
        const word = wordPart.trim().slice(0, limits.word);
        if (!word || seen.has(word.toLowerCase())) return;
        seen.add(word.toLowerCase());

        const hints = hintsPart.split(',')
            .map(hint => hint.trim().slice(0, limits.hint))
            .filter(Boolean)
            .slice(0, limits.hints);
        entries.push({ word, hints });
    });

    return entries.slice(0, limits.maxEntries);
}

function formatEntries(entries) {
    return entries
        .map(entry => (entry.hints.length > 0 ? `${entry.word} | ${entry.hints.join(', ')}` : entry.word))
        .join('\n');
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
    byId('editor-title').textContent = edited ? '— Edytuj kategorię —' : '— Nowa kategoria —';
    byId('editor-name').maxLength = limits.name;
    byId('editor-name').value = edited ? edited.name : "";
    byId('editor-entries').value = edited ? formatEntries(edited.entries) : "";
    byId('editor-delete').classList.toggle('hidden', !edited);

    updateEditorStatus();
    showPickerView('picker-view-editor');
}

function closeCategoryEditor() {
    showPickerView('picker-view-list');
    renderCategoryPicker();
}

// Zwraca komunikat błędu albo null, gdy kategorię można zapisać
function validateEditor(name, entries) {
    const limits = customLimits();
    const missing = limits.minEntries - entries.length;

    if (!name) return 'Podaj nazwę kategorii';
    if (missing > 0) return `Dodaj jeszcze ${missing} ${missing === 1 ? 'hasło' : 'hasła'}`;
    return null;
}

function updateEditorStatus() {
    const entries = parseEntries(byId('editor-entries').value);
    const error = validateEditor(byId('editor-name').value.trim(), entries);
    const withHints = entries.filter(entry => entry.hints.length > 0).length;

    byId('editor-status').classList.toggle('editor-status-ready', !error);
    byId('editor-status').textContent = error || `Haseł: ${entries.length} · z podpowiedzią: ${withHints}`;
}

function saveCategoryEditor() {
    const name = byId('editor-name').value.trim();
    const entries = parseEntries(byId('editor-entries').value);
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
    closeCategoryEditor();
}
