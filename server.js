const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// To sprawia, że Render wyświetli Twój index.html pod głównym adresem
app.use(express.static(__dirname));

const io = new Server(server, {
    cors: { origin: "*" } 
});

const rooms = {};

const categories = {
    "Jedzenie": [
        { word: "Pizza", hints: ["Okrągłe danie", "Włoska kuchnia", "Ma sos pomidorowy"] },
        { word: "Sushi", hints: ["Ryż i surowa ryba", "Japonia", "Używa się pałeczek"] }
    ],
    "Miejsca": [
        { word: "Paryż", hints: ["Miasto miłości", "Wieża Eiffla", "Stolica Francji"] },
        { word: "Kino", hints: ["Miejsce z dużym ekranem", "Popcorn", "Ogląda się tam filmy"] }
    ],
    "Zawody": [
        { word: "Strażak", hints: ["Nosi czerwony kask", "Gasi pożary", "Jeździ dużym autem"] },
        { word: "Lekarz", hints: ["Pracuje w szpitalu", "Nosi stetoskop", "Leczy ludzi"] }
    ]
};

io.on('connection', (socket) => {
    console.log(`Połączono: ${socket.id}`);

    // Tworzenie pokoju
    socket.on('create_room', ({ playerName }) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomCode] = {
            code: roomCode, // To pole musi tu być!
            host: socket.id,
            players: [{ id: socket.id, name: playerName }],
            status: 'waiting'
        };
        socket.join(roomCode);
        socket.emit('room_created', roomCode);
        io.to(roomCode).emit('room_update', rooms[roomCode]);
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

    // Start gry z wyborem liczby impostorów i kategorii
    socket.on('start_game', ({ roomCode, category, impostorCount }) => {
        const room = rooms[roomCode];
        if (!room || room.host !== socket.id) return;

        if (room.players.length < (impostorCount + 1)) {
            return socket.emit('error', 'Zbyt mało graczy na tylu impostorów!');
        }

        const catData = categories[category];
        const selected = catData[Math.floor(Math.random() * catData.length)];
        
        // Tasowanie graczy i wybór impostorów
        let shuffled = [...room.players].sort(() => 0.5 - Math.random());
        let impostors = shuffled.slice(0, impostorCount);
        let impostorIds = impostors.map(i => i.id);

        room.status = 'playing';
        room.results = { 
            impostorNames: impostors.map(i => i.name), 
            word: selected.word 
        };

        // Wysyłanie ról
        room.players.forEach((player) => {
            const isImpostor = impostorIds.includes(player.id);
            if (isImpostor) {
                // Każdy impostor dostaje inną podpowiedź (jeśli jest ich wystarczająco dużo)
                const hintIndex = impostorIds.indexOf(player.id) % selected.hints.length;
                io.to(player.id).emit('game_start', { role: 'IMPOSTOR', data: selected.hints[hintIndex] });
            } else {
                io.to(player.id).emit('game_start', { role: 'GRACZ', data: selected.word });
            }
        });
    });

    // Sprawdzanie czy gracz jest hostem (do przycisku zakończenia)
    socket.on('check_host', (roomCode) => {
        const room = rooms[roomCode];
        if (room) socket.emit('is_host', room.host === socket.id);
    });

    // Koniec gry
    socket.on('end_game', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id) {
            io.to(roomCode).emit('game_over', room.results);
            delete rooms[roomCode]; // Usuwamy pokój po grze
        }
    });

    socket.on('disconnect', () => {
        console.log('Gracz wyszedł');
    });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});