// TRYB PYTANIA: wszyscy odpowiadają na pytanie, ale impostor dostał inne

function sendAnswer(answer) {
    socket.emit('game_action', currentRoomCode, 'answer', answer);
}

gameModes.pytania = {
    showGame(data) {
        byId('role-display').className = "role-none";
        byId('input-answer').classList.remove('hidden');

        byId('role-data').style.fontSize = "120%";
        byId('role-data').innerText = data.question;
    },

    voteHeader(vote) {
        return vote.question;
    },

    voteTileText(player) {
        return player.answer || '—';
    },

    resultSummary: huntSummary,

    resultSections(results) {
        return [
            createResultSection('Pytanie graczy', results.playersQuestion, 'res-value-long'),
            createResultSection('Pytanie impostora', results.impostorsQuestion, 'res-value-impostor')
        ];
    }
};
