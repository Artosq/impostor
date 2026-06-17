const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

app.use(express.static(__dirname));

const io = new Server(server, {
    cors: { origin: "*" } 
});

// WCZYTYWANIE KATEGORII Z PLIKU
let categories = {};
try {
    const data = fs.readFileSync('./categories.json', 'utf8');
    categories = JSON.parse(data);
    console.log("Kategorie wczytane pomyślnie!");
} catch (err) {
    console.error("Błąd podczas wczytywania categories.json:", err);
}

const rooms = {};

io.on('connection', (socket) => {
    console.log(`Połączono: ${socket.id}`);

    socket.emit('room_list', rooms);

    // Tworzenie pokoju
    socket.on('create_room', ({ playerName ,playerBot, userId}) => {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomCode] = {
            code: roomCode,
            host: userId,
            players: [{ userId: userId, id: socket.id, name: playerName, bot: playerBot}],
            status: 'waiting',
            lastActivity: Date.now()
        };
        io.emit('room_list', rooms);
        socket.join(roomCode);
        socket.emit('room_created', roomCode);
        io.to(roomCode).emit('room_update', rooms[roomCode]);
    });

    // Dołączanie do pokoju
    socket.on('join_room', ({ playerName, roomCode ,playerBot, userId}) => {
        const room = rooms[roomCode];
        if (room && room.status === 'waiting') {
            room.players.push({ userId: userId, id: socket.id, name: playerName, bot: playerBot});
            socket.join(roomCode);
            io.to(roomCode).emit('room_update', room);
        } else {
            socket.emit('error', 'Pokój nie istnieje lub gra już trwa!');
        }
    });

    socket.on('rejoin_room', ({ roomCode, userId }) => {
    const room = rooms[roomCode];

    if (!room) {
        return socket.emit('rejoin_failed', true);
    }
    const player = room.players.find(p => p.userId === userId);

    if (player) {

        player.id = socket.id;

        if (room.host === userId) {
            socket.emit('is_host', true);
        }

        socket.join(roomCode);
        console.log(`Rejoin: Gracz ${player.name} wrócił do pokoju ${roomCode}`);

        switch (room.status) {
            case 'waiting':
                // Powrót do poczekalni
                socket.emit('room_update', room);
                break;

            case 'playing':
                socket.emit('game_start', { 
                    role: player.role, 
                    data: player.gameData, 
                    gameCat: player.gameCat 
                });
                break;

            case 'voting':
                socket.emit('game_start', { 
                    role: player.role, 
                    data: player.gameData, 
                    gameCat: player.gameCat 
                });
                socket.emit('start_vote', room);
                break;

            case 'finished':
                // Jeśli pokój jeszcze istnieje, wysyłamy wyniki końcowe
                //socket.emit('game_over', room);
                break;
        }
        socket.emit('rejoin_failed', false);
        //io.to(roomCode).emit('room_update', room);

    } else {
        socket.emit('rejoin_failed', true);
    }
});

    // Start gry
socket.on('start_game', ({ roomCode, category, impostorCount }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.lastActivity = Date.now();

    const player = room.players.find(p => p.id === socket.id);
    
    if (!player || room.host !== player.userId) return;
    
        if (room.players.length < (parseInt(impostorCount) + 1)) {
            return socket.emit('error', 'Zbyt mało graczy na tylu impostorów!');
        }

        const catData = categories[category];
        if (!catData) return socket.emit('error', 'Nie znaleziono wybranej kategorii!');

        // Losowanie hasła z kategorii
        const selected = catData[Math.floor(Math.random() * catData.length)];
        
        // Losowanie impostorów
        let shuffled = [...room.players].sort(() => 0.5 - Math.random());
        let impostors = shuffled.slice(0, impostorCount);
        let impostorIds = impostors.map(i => i.id);

        // Ustawienia pokoju
        room.category = category;
        room.status = 'playing';
        room.impostorCount = impostorCount;
        room.results = { 
            impostorNames: impostors,
            word: selected.word 
        };
    
    let sharedHint;
    let impostorsQuestion;
    let playersQuestion;

    if(category != "Pytania"){
    const sharedHintIndex = Math.floor(Math.random() * selected.hints.length);
    sharedHint = selected.hints[sharedHintIndex];
    }else{
    let impostorsIndex = Math.floor(Math.random() * selected.questions.length);
    impostorsQuestion = selected.questions[impostorsIndex];

    selected.questions.splice(impostorsIndex, 1);

    let playersIndex = Math.floor(Math.random() * selected.questions.length);
    playersQuestion = selected.questions[playersIndex];
    }

    room.players.forEach((player) => {
        const isImpostor = impostorIds.includes(player.id);
        
        player.gameCat = category;
            if(category != "Pytania"){
            if (isImpostor) {
                player.role = 'IMPOSTOR';
                player.gameData = sharedHint;
            } else {
                player.role = 'GRACZ';
                player.gameData = selected.word;
            }
        }else{
            if (isImpostor) {
                player.role = 'IMPOSTOR';
                player.gameData = impostorsQuestion;
            } else {
                player.role = 'GRACZ';
                player.gameData = playersQuestion;
            }
            room.playersQuestion = playersQuestion;
        }

        io.to(player.id).emit('game_start', { 
            role: player.role, 
            data: player.gameData, 
            gameCat: player.gameCat 
        });
    });

        io.emit('room_list', rooms);
    });

    socket.on('check_host', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            socket.emit('is_host', player && room.host === player.userId);
        }
    });

socket.on('cast_vote', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;
        room.lastActivity = Date.now();

        const requester = room.players.find(p => p.id === socket.id);

        if (requester && room.host === requester.userId) {
            if (room.status === 'playing') {
                room.status = 'voting';
                console.log(`Głosowanie rozpoczęte przez hosta: ${requester.name}`);
                
                io.to(roomCode).emit('start_vote', room);
                io.emit('room_list', rooms);
            }
        } else {
            socket.emit('error', 'Tylko host może rozpocząć głosowanie!');
        }
    });

socket.on('end_game', (roomCode) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.lastActivity = Date.now();

    const requester = room.players.find(p => p.id === socket.id);

    if (requester && room.host === requester.userId && room.status === 'voting') {
        const finalVotes = {}; 
        
        if (room.playerChoices) {
            Object.values(room.playerChoices).forEach(choiceArray => {
                choiceArray.forEach(targetUserId => {
                    finalVotes[targetUserId] = (finalVotes[targetUserId] || 0) + 1;
                });
            });
        }

        const sortedVotedUserIds = Object.keys(finalVotes).sort((a, b) => finalVotes[b] - finalVotes[a]);
        const impostorCount = parseInt(room.impostorCount) || 1;
        const kickedUserIds = sortedVotedUserIds.slice(0, impostorCount);

        const kickedPlayersObjects = kickedUserIds.map(uId => {
            return room.players.find(player => player.userId === uId);
        }).filter(p => p);

        const actualImpostorIds = room.results.impostorNames.map(i => i.userId);
        const allImpostorsCaught = actualImpostorIds.every(id => kickedUserIds.includes(id));

        let winner = allImpostorsCaught ? "GRACZ" : "IMPOSTOR";

        const enrichedResults = {
            ...room.results,
            votes: finalVotes,
            kickedPlayers: kickedPlayersObjects,
            winner: winner
        };

        room.results = enrichedResults; 
        room.status = 'finished';

        io.to(roomCode).emit('game_over', room);

        setTimeout(() => {
            if (rooms[roomCode] && rooms[roomCode].status === 'finished') {
                delete rooms[roomCode];
                io.to(roomCode).emit('force_reload');
                io.emit('room_list', rooms);
            }
        }, 30000);
    }
});

socket.on('send_vote', (roomCode, selectedUserIds) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'voting') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (!room.playerChoices) room.playerChoices = {};

    room.playerChoices[player.userId] = selectedUserIds;

    console.log(`Gracz ${player.name} (userId: ${player.userId}) zmienił wybór na:`, selectedUserIds);
});

socket.on('send_answer', (roomCode, answer) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if(player.gameCat =! "Pytania") return;

    player.answer = answer;
});


    socket.on('send_fuck', ({ roomCode, targetUserId }) => {
        const room = rooms[roomCode];
        if (!room) return;

        const sender = room.players.find(p => p.id === socket.id);
        if (!sender) return;

        const target = room.players.find(p => p.userId === targetUserId);
        if (!target) return;

        io.to(target.id).emit('receive_fuck', {
            name: sender.name,
            userId: sender.userId
        });
    });

    socket.on('leave_room', (roomCode) => {
            const room = rooms[roomCode];
            if (!room) return;

            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                const isHost = (String(room.host) === String(player.userId));

                room.players.splice(playerIndex, 1);
                socket.leave(roomCode);
                
                console.log(`Gracz ${player.name} opuścił pokój ${roomCode}`);

                if (room.players.length < 2 && room.status == "playing") {
                    io.to(roomCode).emit('left_room_success');
                    delete rooms[roomCode];
                } 
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } 
                else if (isHost && (room.status == "waiting" || room.status == "voting")) {
                    room.host = room.players[0].userId;
                    io.to(room.players[0].id).emit('is_host', true);
                    
                    io.to(roomCode).emit('room_update', room);
                    console.log(`Nowy host w pokoju ${roomCode}: ${room.players[0].name}`);
                } 
                else if(room.status == "waiting"){
                    io.to(roomCode).emit('room_update', room);
                }

                socket.emit('left_room_success');
                io.emit('room_list', rooms);
            }
        });

    });

    setInterval(() => {
    const now = Date.now();
    Object.keys(rooms).forEach(roomCode => {
        const room = rooms[roomCode];
        
        const isExpired = now - room.lastActivity > 10 * 60 * 1000;
        
        if (isExpired || room.players.length === 0) {
            delete rooms[roomCode];
            console.log(`Sprzątacz usunął pokój widmo: ${roomCode}`);
        }
    });
    io.emit('room_list', rooms);
    }, 30000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
