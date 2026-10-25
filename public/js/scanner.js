// SKANER QR: ikona aparatu przy kodzie pokoju. Kod z zaproszenia (link https://<strona>/1234) od razu wpuszcza do pokoju.
// Czytnik wbudowany w przeglądarkę (BarcodeDetector: Chrome na Androidzie), a gdzie go nie ma (Safari na iPhonie) -
// biblioteka jsQR, pobierana dopiero przy pierwszym skanowaniu.
// Ładowany po app.js i invite.js (korzysta z byId, joinRoom, showError, INVITE_CLOSE_MS).

const SCAN_INTERVAL_MS = 200;
const SCAN_MAX_SIDE = 640;             // klatka zmniejszana do tylu pikseli - jsQR na telefonie działa wtedy płynnie
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

async function createDecoder() {
    if ('BarcodeDetector' in window) {
        try {
            if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
                const detector = new BarcodeDetector({ formats: ['qr_code'] });
                return async video => {
                    const [code] = await detector.detect(video);
                    return code ? code.rawValue : null;
                };
            }
        } catch (e) {}
    }

    const jsQR = await loadJsqr();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return async video => {
        const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        return code ? code.data : null;
    };
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
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
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

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeScanner();
});
// Przejście do innej aplikacji wyłącza aparat
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') closeScanner();
});
