// DŹWIĘKI I WIBRACJE
// - wibracja: gdy TY coś klikasz (przyciski, kafelki, głos, reakcja, odsłonięcie roli),
// - dźwięk: gdy robi coś ktoś inny albo dzieje się coś w grze (ktoś wchodzi, reakcja, start rundy, wyniki).
// Nic nie zależy od roli: impostor słyszy i czuje dokładnie to samo co inni, więc efekty niczego nie zdradzają.
// Dźwięki są generowane w przeglądarce (Web Audio) w stylu 8-bit - bez plików i bez licencji.

const SOUND_MUTED_KEY = 'soundMuted';
const SOUND_VOLUME = 0.12;

const sfx = (() => {
    let context = null;
    let muted = false;
    try { muted = localStorage.getItem(SOUND_MUTED_KEY) === '1'; } catch (e) { /* domyślnie włączony */ }

    // Przeglądarka pozwala grać dopiero po pierwszym dotknięciu strony
    function unlock() {
        if (!context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            context = new AudioContext();
        }
        if (context.state === 'suspended') context.resume();
    }
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });

    // Jedna nuta: kształt fali, częstotliwość (z poślizgiem do `to`), start i długość w sekundach
    function tone({ type = 'square', freq, to, start = 0, length = 0.1, volume = 1 }) {
        const t = context.currentTime + start;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(SOUND_VOLUME * volume, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
        osc.connect(gain).connect(context.destination);
        osc.start(t);
        osc.stop(t + length + 0.02);
    }

    // Krótki szum (uderzenie przy zrzuceniu przebrania)
    function noise({ start = 0, length = 0.25, volume = 1 }) {
        const t = context.currentTime + start;
        const buffer = context.createBuffer(1, Math.floor(context.sampleRate * length), context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = SOUND_VOLUME * volume;
        source.connect(gain).connect(context.destination);
        source.start(t);
    }

    const N = { C4: 262, E4: 330, G4: 392, A4: 440, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047 };
    const notes = (list, type, step, length, volume) => list.forEach((freq, i) => tone({ type, freq, start: i * step, length, volume }));

    const SOUNDS = {
        join: () => notes([N.C5, N.G5], 'square', 0.07, 0.09, 0.8),                 // ktoś wszedł do pokoju
        leave: () => notes([N.G4, N.C4], 'square', 0.08, 0.1, 0.7),                 // ktoś wyszedł
        settings: () => tone({ type: 'triangle', freq: N.E5, length: 0.08, volume: 0.9 }),   // host zmienił ustawienia
        reaction: () => tone({ type: 'square', freq: 900, to: 180, length: 0.22, volume: 0.7 }), // ktoś Cię zaczepił
        roundStart: () => notes([N.C5, N.E5, N.G5, N.C6], 'square', 0.07, 0.1, 0.8),
        voteStart: () => [0, 0.18].forEach(s => { tone({ type: 'triangle', freq: N.A4, start: s, length: 0.09 }); tone({ type: 'triangle', freq: N.E5, start: s + 0.09, length: 0.09 }); }),
        win: () => { notes([N.C5, N.E5, N.G5], 'square', 0.1, 0.12, 0.8); tone({ type: 'square', freq: N.C6, start: 0.3, length: 0.35, volume: 0.8 }); },
        lose: () => { notes([N.G4, N.E4], 'triangle', 0.16, 0.18); tone({ type: 'triangle', freq: N.C4, to: 200, start: 0.32, length: 0.5 }); },
        reveal: () => { noise({ length: 0.2, volume: 0.6 }); tone({ type: 'sawtooth', freq: 300, to: 80, length: 0.4, volume: 0.5 }); }
    };

    function play(name) {
        if (muted || !SOUNDS[name]) return;
        unlock();
        if (!context || context.state !== 'running') return;
        try { SOUNDS[name](); } catch (e) { /* dźwięk nigdy nie psuje gry */ }
    }

    function setMuted(value) {
        muted = value;
        try { localStorage.setItem(SOUND_MUTED_KEY, value ? '1' : '0'); } catch (e) { /* bez pamięci */ }
        renderSoundButton();
    }

    return { play, isMuted: () => muted, setMuted };
})();

// ===== WIBRACJE (tylko Twoje działania) =====
const canVibrate = 'vibrate' in navigator;
function haptic(ms = 10) {
    if (canVibrate) navigator.vibrate(ms);
}

// Krótkie drgnięcie przy każdym klikalnym elemencie; mocniejsze przy głosie i odsłonięciu roli
const HAPTIC_TARGETS = 'button, .vote-tile, .customize-tile, .category-card, .avatar-container, .main-avatar, .symbol, .room-row, .rules-dot, .room-privacy';
document.addEventListener('click', event => {
    const target = event.target.closest(HAPTIC_TARGETS);
    if (!target) return;
    haptic(target.classList.contains('vote-tile') ? 25 : 10);
});
document.addEventListener('DOMContentLoaded', () => {
    const role = document.getElementById('role-display');
    if (role) role.addEventListener('touchstart', () => haptic(30), { passive: true });
});

// ===== GŁOŚNIK W ROGU =====
function toggleSound() {
    sfx.setMuted(!sfx.isMuted());
    if (!sfx.isMuted()) sfx.play('settings');
}

function renderSoundButton() {
    const button = document.getElementById('btn-sound');
    if (!button) return;
    button.classList.toggle('muted', sfx.isMuted());
    button.title = sfx.isMuted() ? 'Włącz dźwięk' : 'Wycisz';
    button.setAttribute('aria-label', button.title);
}
document.addEventListener('DOMContentLoaded', renderSoundButton);
