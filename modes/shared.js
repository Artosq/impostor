// Wspólne klocki dla trybów, w których gracze szukają impostorów głosowaniem.
// Tryb z innymi rolami albo innym zakończeniem po prostu z nich nie korzysta.

const { shuffle, randomItem, publicPlayer } = require('../utils');

const ROLE_IMPOSTOR = 'IMPOSTOR';
const ROLE_PLAYER = 'GRACZ';
const MAX_IMPOSTORS = 4;

function checkImpostorCount(room, impostorCount) {
    if (!Number.isInteger(impostorCount) || impostorCount < 1 || impostorCount > MAX_IMPOSTORS) {
        return 'Nieprawidłowa liczba impostorów!';
    }
    if (room.players.length < impostorCount + 1) {
        return 'Zbyt mało graczy na tylu impostorów!';
    }
    return null;
}

// Losuje impostorów i nadaje role wszystkim graczom
function assignImpostors(room, impostorCount) {
    const impostors = shuffle(room.players).slice(0, impostorCount);
    room.players.forEach(player => {
        player.role = impostors.includes(player) ? ROLE_IMPOSTOR : ROLE_PLAYER;
    });
    return impostors;
}

// Rozmowa toczy się na żywo - gra rozstrzyga tylko, kto mówi pierwszy
function pickStarter(room) {
    return publicPlayer(randomItem(room.players));
}

// Każdy gracz może wskazać tylu podejrzanych, ilu jest impostorów
function voteView(room) {
    return {
        maxVotes: room.round.impostors.length,
        players: room.players.map(publicPlayer)
    };
}

function countVotes(room, maxVotes) {
    const votes = {};
    room.playerChoices.forEach(targetIds => {
        targetIds.slice(0, maxVotes).forEach(targetId => {
            votes[targetId] = (votes[targetId] || 0) + 1;
        });
    });
    return votes;
}

// Wylatuje tylu graczy, ilu jest impostorów; remis na granicy nie wyrzuca nikogo z remisujących
function pickKicked(room, votes, kickCount) {
    const votesFor = player => votes[player.publicId] || 0;
    const ranked = room.players
        .filter(p => votesFor(p) > 0)
        .sort((a, b) => votesFor(b) - votesFor(a));

    if (ranked.length <= kickCount) return ranked;

    const firstSafeVotes = votesFor(ranked[kickCount]);
    return ranked.slice(0, kickCount).filter(p => votesFor(p) > firstSafeVotes);
}

// Gracze wygrywają, gdy wyrzucą wszystkich impostorów
function huntResults(room) {
    const { impostors } = room.round;
    const votes = countVotes(room, impostors.length);
    const kickedPlayers = pickKicked(room, votes, impostors.length);

    // Impostor, który wyszedł w trakcie gry, liczy się jak złapany
    const remainingImpostors = impostors.filter(i => room.players.includes(i));
    const allImpostorsCaught = remainingImpostors.every(i => kickedPlayers.includes(i));

    return {
        winner: allImpostorsCaught ? ROLE_PLAYER : ROLE_IMPOSTOR,
        impostors: impostors.map(publicPlayer),
        kickedPlayers: kickedPlayers.map(publicPlayer),
        players: room.players.map(p => ({ ...publicPlayer(p), votes: votes[p.publicId] || 0 }))
    };
}

function huntPlayerResult(room, player, results) {
    return { role: player.role, won: results.winner === player.role };
}

module.exports = {
    ROLE_IMPOSTOR,
    checkImpostorCount,
    assignImpostors,
    pickStarter,
    voteView,
    huntResults,
    huntPlayerResult
};
