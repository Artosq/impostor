// TRYB IMPOSTOR: gracze widzą hasło, impostor tylko podpowiedź do niego

gameModes.impostor = {
    showGame(data) {
        byId('role-display').className = data.role === 'IMPOSTOR' ? 'role-impostor' : 'role-citizen';
        byId('impostor-info').classList.remove('hidden');

        byId('starter-display').classList.remove('hidden');
        byId('starter-display').textContent = data.starter.id === myPlayerId ? 'Zaczynasz Ty!' : `Zaczyna: ${data.starter.name}`;

        byId('role-name').innerText = data.role;
        byId('role-data').style.fontSize = "150%";
        byId('role-data').innerText = data.data;
    },

    voteHeader() {
        return null;
    },

    voteTileText() {
        return null;
    },

    resultSummary: huntSummary,

    resultSections(results) {
        return [createResultSection('Hasło', results.word)];
    }
};
