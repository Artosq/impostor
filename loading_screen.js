
    function screenLoad(screen){
        showScreen('screen-load');
        document.getElementById('loading-info').innerText = "Pobieranie wirusów...";
        progress = 0;
        currentWidth = 0;
        drawProgressBar(screen);
    }

const pCanvas = document.getElementById('progressCanvas');
const pCtx = pCanvas.getContext('2d');

// Parametry paska
let progress = 0; // Aktualny stan (0 do 100)
let targetProgress = 100; // Do ilu ma dobić
let currentWidth = 0; // Pomocnicza do płynnej animacji

// Kolory z Twoich zmiennych CSS
const colorSecondary = '#2ecc71';
const colorDark = '#363636'; 

function drawProgressBar() {
    // Dopasowanie rozdzielczości wewnętrznej canvasu
    pCanvas.width = pCanvas.clientWidth;
    pCanvas.height = pCanvas.clientHeight;

    const w = pCanvas.width;
    const h = pCanvas.height;
    const padding = 4; // Grubość obramowania

    // Czyścimy tło pod paskiem
    pCtx.clearRect(0, 0, w, h);

    // 1. Rysujemy obramowanie (Stroke)
    pCtx.strokeStyle = 'white';
    pCtx.lineWidth = padding;
    pCtx.strokeRect(padding/2, padding/2, w - padding, h - padding);

    // 2. Obliczamy płynne przejście szerokości (Linear Interpolation)
    // Zmienna 0.05 odpowiada za "gładkość" - im mniejsza, tym wolniej dobija
    let targetWidth = (w - (padding * 2)) * (progress / 100);
    currentWidth += (targetWidth - currentWidth) * 0.05;

    // 3. Rysujemy wypełnienie (Secondary)
    pCtx.fillStyle = colorSecondary;
    // Wypełnienie zaczyna się po wewnętrznej stronie ramki
    pCtx.fillRect(padding, padding, currentWidth, h - (padding * 2));

    // 4. Animacja pętli
    if (progress < targetProgress) {
        progress += 0.5; // Prędkość ładowania
        document.getElementById('loading-progress').innerText = "(" + Math.round(progress) + "%)"
    }else{
        setTimeout(() => {
            showScreen('screen-game'); 
        }, 500);
    }
    
    setTimeout(drawProgressBar, 20);
}