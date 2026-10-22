// ===== FALE W TLE =====

const canvas = document.getElementById('rippleCanvas');
const ctx = canvas.getContext('2d');
let ripples = [];

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

class Ripple {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 200;
        this.opacity = 0.5; // Maksymalna przezroczystość fali
        this.speed = 1.2;    // Znacznie wolniejsza animacja
        this.thickness = 70; // Szerokość gradientu "pierścienia" fali
    }

    draw() {
        if (this.radius <= 0) return;

        ctx.save();

        const gradient = ctx.createRadialGradient(
            this.x, this.y, Math.max(0, this.radius - this.thickness),
            this.x, this.y, this.radius
        );
        const alpha = this.opacity * (1 - this.radius / this.maxRadius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.lineWidth = this.thickness;
        ctx.strokeStyle = gradient;
        ctx.stroke();
        ctx.closePath();

        ctx.restore();
    }

    update() {
        this.radius += this.speed;
        this.opacity = 0.5 * (1 - this.radius / this.maxRadius);
    }
}

// Pętla działa tylko, dopóki jakaś fala jest widoczna - bez fal płótno stoi i nie zużywa baterii
let rippleLoop = null;

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ripples = ripples.filter(r => r.opacity > 0.01 && r.radius < r.maxRadius);

    ripples.forEach(r => {
        r.update();
        r.draw();
    });

    rippleLoop = ripples.length > 0 ? requestAnimationFrame(animate) : null;
}

window.addEventListener('mousedown', (e) => {
    const card = document.getElementById('card');
    if (card && card.contains(e.target)) return;
    ripples.push(new Ripple(e.clientX, e.clientY));
    if (rippleLoop === null) rippleLoop = requestAnimationFrame(animate);
});
