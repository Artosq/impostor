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
    socket.on('create_room', ({ playerName }) => {
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomCode] = {
            code: roomCode,
            host: socket.id,
            players: [{ id: socket.id, name: playerName }],
            status: 'waiting'
        };
        socket.join(roomCode);
        socket.emit('room_created', roomCode);
        io.to(roomCode).emit('room_update', rooms[roomCode]);
        socket.emit('room_list', rooms);
    });

    // Dołączanie do pokoju
    socket.on('join_room', ({ playerName, roomCode }) => {
        const room = rooms[roomCode];
        if (room && room.status === 'waiting') {
            room.players.push({ id: socket.id, name: playerName });
            socket.join(roomCode);
            io.to(roomCode).emit('room_update', room);
        } else {
            socket.emit('error', 'Pokój nie istnieje lub gra już trwa!');
        }
    });

    // Start gry
    socket.on('start_game', ({ roomCode, category, impostorCount }) => {
        socket.emit('room_list', rooms);
        const room = rooms[roomCode];
        if (!room || room.host !== socket.id) return;

        if (room.players.length < (impostorCount + 1)) {
            return socket.emit('error', 'Zbyt mało graczy na tylu impostorów!');
        }

        const catData = categories[category];
        if (!catData) return socket.emit('error', 'Nie znaleziono wybranej kategorii!');

        const selected = catData[Math.floor(Math.random() * catData.length)];
        
        let shuffled = [...room.players].sort(() => 0.5 - Math.random());
        let impostors = shuffled.slice(0, impostorCount);
        let impostorIds = impostors.map(i => i.id);

        room.status = 'playing';
        room.results = { 
            impostorNames: impostors.map(i => i.name), 
            word: selected.word 
        };

        room.players.forEach((player) => {
            const isImpostor = impostorIds.includes(player.id);
            if (isImpostor) {
                const hintIndex = impostorIds.indexOf(player.id) % selected.hints.length;
                io.to(player.id).emit('game_start', { role: 'IMPOSTOR', data: selected.hints[hintIndex] });
            } else {
                io.to(player.id).emit('game_start', { role: 'GRACZ', data: selected.word });
            }
        });
    });

    socket.on('check_host', (roomCode) => {
        const room = rooms[roomCode];
        if (room) socket.emit('is_host', room.host === socket.id);
    });

    socket.on('end_game', (roomCode) => {
        socket.emit('room_list', rooms);
        const room = rooms[roomCode];
        if (room && room.host === socket.id) {
            if(room.status === 'playing')
            io.to(roomCode).emit('game_over', room.results);
        
            delete rooms[roomCode];
        }
    });

socket.on('disconnect', () => {
    console.log(`🔌 Rozłączono: ${socket.id}`);

    for (const code in rooms) {
        const room = rooms[code];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);

        if (playerIndex !== -1) {
            const isHost = (room.host === socket.id);
            const playerName = room.players[playerIndex].name;

            // 1. Usuwamy gracza z tablicy
            room.players.splice(playerIndex, 1);

            console.log(`🏃 Gracz ${playerName} wyszedł z pokoju ${code}.`);

            // 2. SPRAWDZENIE: Czy w pokoju ktokolwiek został?
            if (room.players.length === 0) {
                console.log(`🗑️ Pokój ${code} jest pusty - usuwam go.`);
                delete rooms[code];
            } 
            // 3. SPRAWDZENIE: Czy wyszedł host?
            else if (isHost) {
                console.log(`👑 Host wyszedł z pokoju ${code}. Zamykam grę dla wszystkich.`);
                // Informujemy pozostałych graczy, że host wyszedł i muszą przeładować stronę
                io.to(code).emit('force_reload', 'Host opuścił pokój. Gra została zakończona.');
                delete rooms[code]; // Usuwamy pokój, bo bez hosta gra nie ma sensu
            } 
            // 4. Jeśli wyszedł zwykły gracz i inni zostali
            else {
                io.to(code).emit('room_update', room);
            }

            // Aktualizacja globalnej listy pokojów dla osób w lobby
            io.emit('room_list', rooms);
            break; 
        }
    }
});


});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
