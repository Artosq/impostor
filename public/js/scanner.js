// SKANER QR: ikona aparatu przy kodzie pokoju. Kod z zaproszenia (link https://<strona>/1234) od razu wpuszcza do pokoju.
// Czytnik wbudowany w przeglądarkę (BarcodeDetector: Chrome na Androidzie), a gdzie go nie ma (Safari na iPhonie) -
// biblioteka jsQR, pobierana dopiero przy pierwszym skanowaniu.
// Ładowany po app.js i invite.js (korzysta z byId, joinRoom, showError, INVITE_CLOSE_MS).

const SCAN_INTERVAL_MS = 200;
const SCAN_MAX_SIDE = 640;             // klatka zmniejszana do tylu pikseli - jsQR na telefonie działa wtedy płynnie
const SCAN_CENTER_SHARE = 0.75;        // druga próba: środek kadru (część krótszego boku)...
const SCAN_CENTER_SIDE = 480;          // ...zmniejszony do tylu pikseli
const SCAN_HINT = 'Skieruj aparat na kod QR z ekranu hosta';

let scannerStream = null;
let scannerTimer = null;
let scannerDecoder = null;             // funkcja: klatka wideo -> tekst z kodu albo null
let jsqrLibrary = null;

// Kod pokoju z zeskanowanego tekstu: sam kod, link /1234 albo /?kod=1234
function roomCodeFrom(text) {
    const value = (text || '').trim();
    if (/^\d{4}$/.test(value)) return value;
    try {
        const url = new URL(value, location.origin);
        const fromPath = url.pathname.match(/^\/(\d{4})\/?$/);
        if (fromPath) return fromPath[1];
        const fromQuery = url.searchParams.get('kod');
        if (/^\d{4}$/.test(fromQuery || '')) return fromQuery;
    } catch (e) {}
    return null;
}

function loadJsqr() {
    if (!jsqrLibrary) {
        jsqrLibrary = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'vendor/jsqr.js';
            script.onload = () => resolve(window.jsQR);
            script.onerror = () => { jsqrLibrary = null; reject(new Error('Nie udało się wczytać skanera')); };
            document.head.append(script);
        });
    }
    return jsqrLibrary;
}

// jsQR: najpierw cała klatka (zmniejszona - to uśrednia szum aparatu), a gdy nic - sam środek kadru,
// gdzie gracz zwykle trzyma kod (więcej pikseli na kwadracik kodu)
async function createJsqrDecoder() {
    const jsQR = await loadJsqr();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const read = (video, sx, sy, sw, sh, maxSide) => {
        const scale = Math.min(1, maxSide / Math.max(sw, sh));
        canvas.width = Math.round(sw * scale);
        canvas.height = Math.round(sh * scale);
        context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        return code ? code.data : null;
    };

    return video => {
        const width = video.videoWidth, height = video.videoHeight;
        const side = Math.round(Math.min(width, height) * SCAN_CENTER_SHARE);
        return read(video, 0, 0, width, height, SCAN_MAX_SIDE)
            || read(video, (width - side) / 2, (height - side) / 2, side, side, SCAN_CENTER_SIDE);
    };
}

// Czytnik przeglądarki bywa "pusty" bez błędu (na części Androidów brakuje modułu z Usług Google Play),
// więc gdy nic nie znajduje, co drugą klatkę sprawdza też jsQR
async function createDecoder() {
    if ('BarcodeDetector' in window) {
        try {
            if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
                const detector = new BarcodeDetector({ formats: ['qr_code'] });
                let fallback = null;
                let frame = 0;
                createJsqrDecoder().then(decoder => { fallback = decoder; }, () => {});
                return async video => {
                    const [code] = await detector.detect(video).catch(() => []);
                    if (code) return code.rawValue;
                    frame++;
                    return fallback && frame % 2 === 0 ? fallback(video) : null;
                };
            }
        } catch (e) {}
    }
    return createJsqrDecoder();
}

function isScannerOpen() {
    const scanner = byId('scanner');
    return !scanner.classList.contains('hidden') && !scanner.classList.contains('closing');
}

async function openScanner() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Ta przeglądarka nie daje dostępu do aparatu - wpisz kod');
        return;
    }
    byId('scanner-hint').textContent = SCAN_HINT;
    byId('scanner').classList.remove('hidden', 'closing');

    try {
        // bez prośby o rozdzielczość przeglądarki często dają 640x480 - za mało na kod pokazany na ekranie telefonu
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        if (!isScannerOpen()) {                 // okno zamknięte, zanim aparat się włączył
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        scannerStream = stream;
        const video = byId('scanner-video');
        video.srcObject = stream;
        await video.play();
        scannerDecoder = scannerDecoder || await createDecoder();
        scanFrame();
    } catch (e) {
        closeScanner();
        showError(e && e.name === 'NotAllowedError' ? 'Brak zgody na aparat - wpisz kod' : 'Nie udało się włączyć aparatu - wpisz kod');
    }
}

async function scanFrame() {
    if (!scannerStream) return;
    const video = byId('scanner-video');
    let text = null;
    if (video.readyState >= 2 && video.videoWidth) {
        try { text = await scannerDecoder(video); } catch (e) {}
    }
    if (!scannerStream) return;

    const code = roomCodeFrom(text);
    if (code) {
        closeScanner();
        if (navigator.vibrate) navigator.vibrate(30);
        byId('input-code').value = code;
        joinRoom(code);
        return;
    }
    if (text) byId('scanner-hint').textContent = 'To nie jest kod z tej gry';
    scannerTimer = setTimeout(scanFrame, SCAN_INTERVAL_MS);
}

function closeScanner() {
    clearTimeout(scannerTimer);
    if (scannerStream) scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
    byId('scanner-video').srcObject = null;

    const scanner = byId('scanner');
    if (scanner.classList.contains('hidden') || scanner.classList.contains('closing')) return;
    scanner.classList.add('closing');
    setTimeout(() => {
        if (!scanner.classList.contains('closing')) return;
        scanner.classList.add('hidden');
        scanner.classList.remove('closing');
    }, INVITE_CLOSE_MS);
}

// Ikona tylko na telefonach i tabletach z aparatem - na komputerze (nawet z kamerką) menu wygląda jak dawniej.
// Lista urządzeń mówi, czy jest aparat, bez pytania o zgodę.
async function updateScanButton() {
    let hasCamera = false;
    if (window.matchMedia('(pointer: coarse)').matches && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
            hasCamera = (await navigator.mediaDevices.enumerateDevices()).some(device => device.kind === 'videoinput');
        } catch (e) {}
    }
    byId('btn-scan').classList.toggle('hidden', !hasCamera);
}
updateScanButton();
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', updateScanButton);
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeScanner();
});
// Przejście do innej aplikacji wyłącza aparat
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') closeScanner();
});
