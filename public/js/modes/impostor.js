// TRYB IMPOSTOR: gracze widzą hasło, impostor tylko podpowiedź do niego.
// W głosowaniu impostor może raz zgadnąć hasło (okno #guess): trafi - wygrywa, pomyli się - przegrywa.

let impostorRole = null;     // rola z początku rundy - przycisk zgadywania widzi tylko impostor

// Wygląd ról: nazwa na karcie, kolor karty i jedno zdanie celu
const ROLE_INFO = {
    IMPOSTOR: { label: 'IMPOSTOR', card: 'role-impostor', goal: 'Nie daj się złapać' },
    GRACZ: { label: 'GRACZ', card: 'role-citizen', goal: '' },
    WSPOLNIK: { label: 'WSPÓLNIK', card: 'role-accomplice', goal: 'Chroń impostora - wygrywasz razem z nim' },
    BLAZEN: { label: 'BŁAZEN', card: 'role-jester', goal: 'Daj się wyrzucić - wtedy wygrywasz sam' },
    DETEKTYW: { label: 'DETEKTYW', card: 'role-detective', goal: 'Pomóż złapać impostora' },
    PODMIENIEC: { label: 'PODMIENIEC', card: 'role-citizen', goal: '' }
};
const ROLE_NAMES = { WSPOLNIK: 'Wspólnik', BLAZEN: 'Błazen', DETEKTYW: 'Detektyw', PODMIENIEC: 'Podmieniec' };

function openGuess() {
    byId('guess-input').value = '';
    byId('guess').classList.remove('hidden', 'closing');
    setTimeout(() => byId('guess-input').focus(), 50);
}

function closeGuess() {
    const guess = byId('guess');
    if (guess.classList.contains('hidden') || guess.classList.contains('closing')) return;
    guess.classList.add('closing');
    setTimeout(() => {
        if (!guess.classList.contains('closing')) return;
        guess.classList.add('hidden');
        guess.classList.remove('closing');
    }, 250);
}

function submitGuess() {
    const text = byId('guess-input').value.trim();
    if (!text) return byId('guess-input').focus();
    socket.emit('game_action', currentRoomCode, 'guess', text);
    closeGuess();
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeGuess();
});

gameModes.impostor = {
    showGame(data) {
        impostorRole = data.role;
        const info = ROLE_INFO[data.role] || ROLE_INFO.GRACZ;
        byId('role-display').className = info.card;
        byId('impostor-info').classList.remove('hidden');

        // zdanie celu roli i notatka (kto jest impostorem dla Wspólnika, oczyszczona osoba dla Detektywa)
        const note = [info.goal, data.note].filter(Boolean).join(' · ');
        byId('role-note').classList.toggle('hidden', !note);
        byId('role-note').textContent = note;

        // jawna lista ról w tej rundzie
        const roles = (data.roles || []).map(role => ROLE_NAMES[role]).filter(Boolean);
        byId('game-roles').classList.toggle('hidden', roles.length === 0);
        byId('game-roles').textContent = roles.length ? `W grze: ${roles.join(', ')}` : '';

        byId('starter-display').classList.remove('hidden');
        byId('starter-display').textContent = data.starter.id === myPlayerId ? 'Zaczynasz Ty!' : `Zaczyna: ${data.starter.name}`;

        byId('role-name').innerText = info.label;
        byId('role-data').style.fontSize = "150%";
        byId('role-data').innerText = data.data;
    },

    voteHeader() {
        return null;
    },

    voteTileText() {
        return null;
    },

    // Pod kafelkami głosowania: przycisk zgadywania - tylko dla impostora
    voteExtras(vote) {
        if (impostorRole !== 'IMPOSTOR' || !vote.canGuess) return [];
        const button = createElement('button', 'btn-end btn-guess', 'Zgadnij hasło');
        button.onclick = openGuess;
        return [button];
    },

    // pod nickiem na wynikach: rola (dla specjalnych ról)
    resultRoleTag(player) {
        return ROLE_NAMES[player.role] || null;
    },

    resultSummary(results) {
        if (results.winner === 'BLAZEN') return 'Błazen dał się wyrzucić i wygrywa!';
        if (!results.guess) return huntSummary(results);
        return results.guess.correct ? 'Impostor odgadł hasło!' : 'Impostor nie odgadł hasła';
    },

    resultSections(results) {
        const sections = [createResultSection('Hasło', results.word)];
        if (results.changelingWord) sections.push(createResultSection('Hasło Podmieńca', results.changelingWord, 'res-value-long'));
        if (results.guess) {
            sections.push(createResultSection('Odpowiedź impostora', `„${results.guess.text}”`, results.guess.correct ? 'res-value-guess-ok' : 'res-value-impostor'));
        }
        return sections;
    }
};
