// TRYB PYTANIA: wszyscy odpowiadają na pytanie, ale impostor dostał inne.
// Pole odpowiedzi zależy od kategorii: tekst (Klasyczne), wybór gracza (Kto z nas…), suwak (Skala 1–10).

function sendAnswer(answer) {
    socket.emit('game_action', currentRoomCode, 'answer', answer);
}

// "Kto z nas…": kafelki graczy z pokoju - wybrany świeci
function renderPlayerAnswer(container, players, chosen) {
    const list = createElement('div', 'answer-players');
    players.forEach(player => {
        const tile = createElement('button', 'answer-player');
        tile.classList.toggle('selected', player.id === chosen);
        const avatar = createElement('img', 'skeleton');
        avatar.src = avatarUrl(player.avatar);
        tile.append(avatar, createElement('span', '', player.name));
        tile.onclick = () => {
            list.querySelectorAll('.answer-player').forEach(t => t.classList.toggle('selected', t === tile));
            sendAnswer(player.id);
        };
        list.append(tile);
    });
    container.append(createElement('p', 'answer-label', 'Wskaż osobę:'), list);
}

// "Skala 1–10": suwak z dużą liczbą; odpowiedź wysyłana po każdej zmianie
function renderScaleAnswer(container, { min, max }, chosen) {
    const value = createElement('div', 'answer-scale-value', chosen ? String(chosen) : '?');
    const slider = createElement('input', 'answer-slider');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = 1;
    slider.value = chosen || Math.round((min + max) / 2);
    slider.oninput = () => {
        value.textContent = slider.value;
        sendAnswer(Number(slider.value));
    };
    const ends = createElement('div', 'answer-scale-ends');
    ends.append(createElement('span', '', String(min)), createElement('span', '', String(max)));
    container.append(value, slider, ends);
}

gameModes.pytania = {
    showGame(data) {
        byId('role-display').className = "role-none";

        const extra = byId('answer-extra');
        extra.replaceChildren();
        if (data.answerType === 'player') renderPlayerAnswer(extra, data.players, data.answer);
        else if (data.answerType === 'scale') renderScaleAnswer(extra, data.scale, data.answer);
        else byId('input-answer').classList.remove('hidden');
        // nowe pytanie od hosta zeruje odpowiedzi na serwerze - pole też
        if (data.skipped) byId('input-answer').value = '';
        extra.classList.toggle('hidden', !extra.childElementCount);

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
