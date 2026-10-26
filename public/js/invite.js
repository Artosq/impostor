// ZAPROSZENIA: okno z kodem QR, kopiowaniem linku i systemowym udostępnianiem (Messenger, WhatsApp, SMS...).
// Link ma postać https://<strona>/1234 - serwer przekierowuje go do menu z wpisanym kodem.
// Ładowany po app.js (korzysta z byId, currentRoomCode, showError).

const INVITE_CLOSE_MS = 250;           // długość animacji wyjścia okna (style.css)
const COPIED_LABEL_MS = 1800;
let qrLibrary = null;                  // biblioteka QR pobierana dopiero przy pierwszym otwarciu okna

function inviteLink() {
    return `${location.origin}/${currentRoomCode}`;
}

function loadQrLibrary() {
    if (!qrLibrary) {
        qrLibrary = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'vendor/qrcode.js';
            script.onload = () => resolve(window.qrcode);
            script.onerror = () => { qrLibrary = null; reject(new Error('Nie udało się wczytać kodu QR')); };
            document.head.append(script);
        });
    }
    return qrLibrary;
}

async function renderInviteQr(link) {
    const box = byId('invite-qr');
    box.replaceChildren();
    box.classList.add('skeleton');
    try {
        const qrcode = await loadQrLibrary();
        const qr = qrcode(0, 'M');
        qr.addData(link);
        qr.make();
        box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) {
        box.textContent = 'Brak kodu QR - skopiuj link';
    }
    box.classList.remove('skeleton');
}

function openInvite() {
    if (!currentRoomCode) return;
    const link = inviteLink();
    byId('invite-code').textContent = currentRoomCode;
    byId('invite-link').textContent = link.replace(/^https?:\/\//, '');
    byId('invite-copy').textContent = 'Kopiuj link';
    byId('invite-share').classList.toggle('hidden', !navigator.share);
    byId('invite').classList.remove('hidden', 'closing');
    renderInviteQr(link);
}

function closeInvite() {
    const invite = byId('invite');
    if (invite.classList.contains('hidden') || invite.classList.contains('closing')) return;
    invite.classList.add('closing');
    setTimeout(() => {
        if (!invite.classList.contains('closing')) return;
        invite.classList.add('hidden');
        invite.classList.remove('closing');
    }, INVITE_CLOSE_MS);
}

// Kopiowanie linku jednym kliknięciem (ze starszym sposobem na przeglądarki bez dostępu do schowka)
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        const copied = document.execCommand('copy');
        area.remove();
        return copied;
    }
}

async function copyInviteLink() {
    const button = byId('invite-copy');
    if (await copyText(inviteLink())) {
        button.textContent = 'Skopiowano!';
        button.classList.add('copied');
        setTimeout(() => {
            button.textContent = 'Kopiuj link';
            button.classList.remove('copied');
        }, COPIED_LABEL_MS);
    } else {
        showError('Nie udało się skopiować - przepisz kod');
    }
}

// Sam link, jak przy kopiowaniu: Messenger i inne komunikatory robią podgląd (plakietkę) tylko z gołego linku -
// z dopisanym tekstem dostawały zwykłą wiadomość bez podglądu. Tytuł i opis i tak są w plakietce.
async function shareInvite() {
    try {
        await navigator.share({ url: inviteLink() });
    } catch (e) {
        // gracz zamknął okno udostępniania - nic się nie dzieje
    }
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeInvite();
});

// Wejście z linku zaproszenia: kod wpisany w menu, przycisk "Dołącz" podświetlony
(function fillInviteCode() {
    const code = new URLSearchParams(location.search).get('kod');
    if (!/^\d{4}$/.test(code || '')) return;

    byId('input-code').value = code;
    const joinButton = document.querySelector('#screen-login .btn-join');
    joinButton.classList.add('invite-highlight');
    byId('input-code').addEventListener('input', () => joinButton.classList.remove('invite-highlight'), { once: true });
    history.replaceState(null, '', '/');        // czysty adres - odświeżenie nie wpisze kodu drugi raz
})();
