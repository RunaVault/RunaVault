const initBackgroundAnimation = () => {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    const setCanvasSize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    const config = {
        particleCount: 140,
        connectionDistance: 170,
        particleRadius: 1.5,
        speed: 0.3,
        lineWidth: 1,
        primaryColor: [180, 180, 180],
        secondaryColor: [160, 160, 160], 
        lockedNodes: Math.floor(Math.random() * 8) + 6,
        nodeSize: 3,
        pulseSpeed: 0.02
    };

    class Particle {
        constructor(isLockedNode = false) {
            this.isLockedNode = isLockedNode;
            this.pulsePhase = Math.random() * Math.PI * 2;
            this.connections = 0;
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.speedX = (Math.random() - 0.5) * config.speed;
            this.speedY = (Math.random() - 0.5) * config.speed;
            this.life = Math.random() * 100;
            
            if (this.isLockedNode) {
                this.size = config.nodeSize;
                this.speedX *= 0.5;
                this.speedY *= 0.5;
            } else {
                this.size = Math.random() * 1 + 0.3;
            }
        }

        update() {
            if (this.isLockedNode) {
                this.pulsePhase += config.pulseSpeed;
                if (this.pulsePhase > Math.PI * 2) this.pulsePhase = 0;
            }
            
            this.x += this.speedX;
            this.y += this.speedY;
            this.life += 0.1;

            if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;

            if (!this.isLockedNode && this.life > 100) this.reset();
            
            this.connections = 0;
        }

        draw() {
            ctx.beginPath();
            
            if (this.isLockedNode) {
                const pulseSize = this.size + Math.sin(this.pulsePhase) * 1;
                ctx.arc(this.x, this.y, pulseSize, 0, Math.PI * 2);
                
                ctx.fillStyle = 'rgba(180, 180, 180, 0.8)';
                
                ctx.strokeStyle = 'rgba(180, 180, 180, 0.7)';
                ctx.lineWidth = 0.8;
                ctx.stroke();
            } else {
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(160, 160, 160, 0.6)';
            }
            
            ctx.closePath();
            ctx.fill();
        }
    }

    let particles = [];
    function createParticles() {
        particles = [];
        
        for (let i = 0; i < config.lockedNodes; i++) {
            particles.push(new Particle(true));
        }
        
        for (let i = 0; i < config.particleCount - config.lockedNodes; i++) {
            particles.push(new Particle(false));
        }
    }

    createParticles();

    function animate() {
        requestAnimationFrame(animate);
        
        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        connectParticles();
        
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });
    }

    function connectParticles() {
        for (let i = 0; i < config.lockedNodes; i++) {
            for (let j = i + 1; j < config.lockedNodes; j++) {
                const p1 = particles[i];
                const p2 = particles[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < config.connectionDistance * 1.5) {
                    const opacity = 1 - (distance / (config.connectionDistance * 1.5));
                    ctx.strokeStyle = `rgba(180, 180, 180, ${opacity * 0.7})`;
                    ctx.lineWidth = config.lineWidth * 1.2;
                    
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                    
                    p1.connections++;
                    p2.connections++;
                }
            }
        }
        
        for (let i = 0; i < particles.length; i++) {
            if (particles[i].connections > 5) continue;
            
            for (let j = i + 1; j < particles.length; j++) {

                if (particles[j].connections > 5) continue;
                
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < config.connectionDistance) {
                    const opacity = 1 - (distance / config.connectionDistance);
                    
                    if (particles[i].isLockedNode || particles[j].isLockedNode) {
                        ctx.strokeStyle = `rgba(180, 180, 180, ${opacity * 0.5})`;
                        ctx.lineWidth = config.lineWidth;
                    } else {
                        ctx.strokeStyle = `rgba(160, 160, 160, ${opacity * 0.2})`;
                        ctx.lineWidth = config.lineWidth * 0.7;
                    }
                    
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    
                    if (Math.random() > 0.7 && !(particles[i].isLockedNode && particles[j].isLockedNode)) {
                        const segments = Math.floor(Math.random() * 2) + 1;
                        let lastX = particles[i].x;
                        let lastY = particles[i].y;
                        
                        for (let s = 0; s < segments; s++) {
                            const ratio = (s + 1) / (segments + 1);
                            const midX = particles[i].x + (particles[j].x - particles[i].x) * ratio;
                            const midY = particles[i].y + (particles[j].y - particles[i].y) * ratio;
                            const offset = (Math.random() - 0.5) * 15;
                            
                            ctx.lineTo(midX + offset, midY + offset);
                        }
                        
                        ctx.lineTo(particles[j].x, particles[j].y);
                    } else {
                        ctx.lineTo(particles[j].x, particles[j].y);
                    }
                    
                    ctx.stroke();
                    
                    particles[i].connections++;
                    particles[j].connections++;
                }
            }
        }
        
        for (let i = 0; i < 3; i++) {
            const idx1 = Math.floor(Math.random() * config.lockedNodes);
            if (idx1 >= 0 && idx1 < particles.length && particles[idx1].isLockedNode) {
                const p1 = particles[idx1];
                
                let closest = -1;
                let minDist = Infinity;
                
                for (let j = 0; j < config.lockedNodes; j++) {
                    if (j !== idx1) {
                        const p2 = particles[j];
                        const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
                        if (dist < minDist && dist < config.connectionDistance * 1.5) {
                            minDist = dist;
                            closest = j;
                        }
                    }
                }
                
                if (closest >= 0) {
                    const p2 = particles[closest];
                    
                    const time = Date.now() * 0.001;
                    const pos = ((time * 2) % 1);
                    
                    const x = p1.x + (p2.x - p1.x) * pos;
                    const y = p1.y + (p2.y - p1.y) * pos;
                    
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
                    ctx.fill();
                }
            }
        }
    }

    animate();
};

export default initBackgroundAnimation; 