const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs'); // Dodajemy moduł systemu plików

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
            status: 'waiting'
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

    // Szukamy gracza po jego unikalnym userId (nie po socket.id!)
    const player = room.players.find(p => p.userId === userId);

    if (player) {

        player.id = socket.id;

        if (room.host === userId) {
            socket.emit('is_host', true);
        }

        // 3. Oficjalne dołączenie nowego socketu do kanału pokoju
        socket.join(roomCode);
        console.log(`Rejoin: Gracz ${player.name} wrócił do pokoju ${roomCode}`);

        // 4. Wysyłanie stanu gry na podstawie room.status
        switch (room.status) {
            case 'waiting':
                // Powrót do poczekalni
                socket.emit('room_update', room);
                break;

            case 'playing':
                // Przywracamy kartę roli i hasło/podpowiedź z obiektu gracza
                socket.emit('game_start', { 
                    role: player.role, 
                    data: player.gameData, 
                    gameCat: player.gameCat 
                });
                break;

            case 'voting':
                // Jeśli trwa głosowanie, musimy wysłać dane do UI głosowania
                // (Większość UI potrzebuje najpierw wiedzieć kim się jest, potem widzieć listę do głosowania)
                socket.emit('game_start', { 
                    role: player.role, 
                    data: player.gameData, 
                    gameCat: player.gameCat 
                });
                socket.emit('start_vote', room);
                break;

            case 'finished':
                // Jeśli pokój jeszcze istnieje, wysyłamy wyniki końcowe
                socket.emit('game_over', {
                    ...room.results,
                    votes: room.playerChoices || {},
                    kickedPlayers: room.results.kickedPlayers || []
                });
                break;
        }
        socket.emit('rejoin_failed', false);
        // Powiadamiamy innych, że ktoś wrócił (np. aby odświeżyć listę osób online)
        //io.to(roomCode).emit('room_update', room);

    } else {
        socket.emit('rejoin_failed', true);
    }
});

    // Start gry
socket.on('start_game', ({ roomCode, category, impostorCount }) => {
    const room = rooms[roomCode];
    if (!room) return;

    // Szukamy obiektu gracza po aktualnym socket.id
    const player = room.players.find(p => p.id === socket.id);
    
    // Sprawdzamy czy ten gracz (jego userId) jest hostem pokoju
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
        room.status = 'playing';
        room.impostorCount = impostorCount;
        room.results = { 
            impostorNames: impostors.map(i => i.name), 
            word: selected.word 
        };

        // Przypisywanie ról i danych każdemu graczowi z osobna
        room.players.forEach((player) => {
            const isImpostor = impostorIds.includes(player.id);
            
            player.gameCat = category; // Zapisujemy kategorię u gracza

            if (isImpostor) {
                // Przypisujemy podpowiedź (hint)
                const hintIndex = impostorIds.indexOf(player.id) % selected.hints.length;
                player.role = 'IMPOSTOR';
                player.gameData = selected.hints[hintIndex];
            } else {
                // Przypisujemy pełne słowo
                player.role = 'GRACZ';
                player.gameData = selected.word;
            }

            // Wysyłamy spersonalizowany start do każdego połączenia
            io.to(player.id).emit('game_start', { 
                role: player.role, 
                data: player.gameData, 
                gameCat: player.gameCat 
            });
        });

        // Aktualizacja listy pokojów dla osób w lobby
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

        // Znajdujemy gracza wysyłającego żądanie wewnątrz pokoju
        const requester = room.players.find(p => p.id === socket.id);

        // Sprawdzamy, czy userId tego gracza zgadza się z zapisanym userId hosta
        if (requester && room.host === requester.userId) {
            if (room.status === 'playing') {
                room.status = 'voting';
                console.log(`Głosowanie rozpoczęte przez hosta: ${requester.name}`);
                
                io.to(roomCode).emit('start_vote', room);
                io.emit('room_list', rooms); // Aktualizacja listy w lobby
            }
        } else {
            socket.emit('error', 'Tylko host może rozpocząć głosowanie!');
        }
    });

    socket.on('end_game', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;

        // Znajdujemy gracza wysyłającego żądanie
        const requester = room.players.find(p => p.id === socket.id);

        // Weryfikacja uprawnień hosta (po userId)
        if (requester && room.host === requester.userId && room.status === 'voting') {
            const finalVotes = {}; 
            
            // Zliczanie głosów
            if (room.playerChoices) {
                Object.values(room.playerChoices).forEach(choiceArray => {
                    choiceArray.forEach(targetId => {
                        finalVotes[targetId] = (finalVotes[targetId] || 0) + 1;
                    });
                });
            }

            // 1. Sortujemy ID graczy po ilości głosów
            const sortedVotedIds = Object.keys(finalVotes).sort((a, b) => finalVotes[b] - finalVotes[a]);

            // 2. Pobieramy liczbę impostorów i wyznaczamy "wyrzuconych"
            const impostorCount = parseInt(room.impostorCount) || 1;
            const kickedIds = sortedVotedIds.slice(0, impostorCount);

            // 3. Mapujemy ID na nazwy (używając find, co jest bezpieczne przy reconnectach)
            const kickedPlayerNames = kickedIds.map(id => {
                const p = room.players.find(player => player.id === id);
                return p ? p.name : "Nieznany gracz";
            });
            
            const enrichedResults = {
                ...room.results,
                votes: finalVotes,
                kickedPlayers: kickedPlayerNames
            };

            io.to(roomCode).emit('game_over', enrichedResults);
            room.status = 'finished';

            // Sprzątanie pokoju (zwiększono do 5s, by każdy zdążył odebrać wyniki)
            setTimeout(() => {
                if (rooms[roomCode] && rooms[roomCode].status === 'finished') {
                    delete rooms[roomCode];
                    io.emit('room_list', rooms);
                }
            }, 5000);
        } else if (!requester || room.host !== requester.userId) {
            socket.emit('error', 'Tylko host może zakończyć grę!');
        }
    });

socket.on('send_vote', (roomCode, selectedPlayers) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'voting') return;

    if (!room.playerChoices) room.playerChoices = {};

    // Nadpisujemy stary wybór tego gracza nową listą ID
    // Jeśli gracz wszystko odznaczył, selectedPlayers będzie pustą tablicą []
    room.playerChoices[socket.id] = selectedPlayers;

    console.log(`Gracz ${socket.id} zmienił wybór na:`, selectedPlayers);
});

// socket.on('disconnect', () => {
//     console.log(`🔌 Rozłączono: ${socket.id}`);

//     for (const code in rooms) {
//         const room = rooms[code];
//         const playerIndex = room.players.findIndex(p => p.id === socket.id);

//         if (playerIndex !== -1) {
//             const isHost = (room.host === socket.id);
//             const playerName = room.players[playerIndex].name;

//             // 1. Usuwamy gracza z tablicy
//             room.players.splice(playerIndex, 1);

//             console.log(`🏃 Gracz ${playerName} wyszedł z pokoju ${code}.`);

//             // 2. SPRAWDZENIE: Czy w pokoju ktokolwiek został?
//             if (room.players.length === 0) {
//                 console.log(`🗑️ Pokój ${code} jest pusty - usuwam go.`);
//                 delete rooms[code];
//             } 
//             // 3. SPRAWDZENIE: Czy wyszedł host?
//             else if (isHost && room.status == 'waiting') {
//                 console.log(`👑 Host wyszedł z pokoju ${code}. Zamykam grę dla wszystkich.`);
//                 // Informujemy pozostałych graczy, że host wyszedł i muszą przeładować stronę
//                 io.to(code).emit('force_reload', 'Host opuścił pokój. Gra została zakończona.');
//                 delete rooms[code]; // Usuwamy pokój, bo bez hosta gra nie ma sensu
//             } 
//             // 4. Jeśli wyszedł zwykły gracz i inni zostali
//             else {
//                 if(room.status == 'waiting')
//                 io.to(code).emit('room_update', room);
//             }

//             // Aktualizacja globalnej listy pokojów dla osób w lobby
//             io.emit('room_list', rooms);
//             break; 
//         }
//     }
// });
    socket.on('leave_room', (roomCode) => {
            const room = rooms[roomCode];
            if (!room) return;

            // Znajdujemy gracza po socket.id
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                const isHost = (String(room.host) === String(player.userId));

                // 1. Usuwamy gracza z tablicy
                room.players.splice(playerIndex, 1);
                socket.leave(roomCode);
                
                console.log(`Gracz ${player.name} opuścił pokój ${roomCode}`);

                // 2. Czy pokój jest pusty?
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } 
                // 3. Czy wyszedł host, ale zostali inni gracze?
                else if (isHost) {
                    // Opcja A: Przekazujemy hosta następnej osobie
                    room.host = room.players[0].userId;
                    io.to(room.players[0].id).emit('is_host', true);
                    
                    io.to(roomCode).emit('room_update', room);
                    console.log(`Nowy host w pokoju ${roomCode}: ${room.players[0].name}`);
                } 
                // 4. Wyszedł zwykły gracz
                else {
                    io.to(roomCode).emit('room_update', room);
                }

                // Informujemy wychodzącego, że pomyślnie wyszedł (można go przekierować na stronę główną)
                socket.emit('left_room_success');
                io.emit('room_list', rooms);
            }
        });

    });

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
