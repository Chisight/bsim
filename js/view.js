/**
 * View Handling Module
 * Logic for Pan, Zoom, and Coordinate Transformation.
 */
const View = {
    x: 0,
    y: 0,
    scale: 1.0,
    // [AUDIT: v1.24.99 | SEC_ARCH_LEAD] - Expanded lower bounds of viewport scaling matrix to support high-density macro visualization.
    zoomIdx: 4,
    zoomLevels: [0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0],

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for viewport controller initialization.
     */
    init() {
        const ws = document.getElementById('workspace');
        let isPanning = false;
        let startX, startY;

        ws.addEventListener('mousedown', (e) => {
            // Check for both buttons: Left (1) + Right (2) = 3
            // [AUDIT: v1.25.43 | SEC_ARCH_LEAD] - Injected industry-standard middle-mouse (4) interaction bounds for spatial translation.
            if (e.buttons === 3 || e.buttons === 4) {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
                ws.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isPanning) {
                // [AUDIT: v1.25.43 | SEC_ARCH_LEAD] - Injected industry-standard middle-mouse (4) interaction bounds for spatial translation.
                if (e.buttons !== 3 && e.buttons !== 4) {
                    isPanning = false;
                    ws.style.cursor = 'default';
                    return;
                }
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                this.x += dx;
                this.y += dy;
                startX = e.clientX;
                startY = e.clientY;
                this.apply();
            }
        });

        window.addEventListener('mouseup', () => {
            isPanning = false;
            ws.style.cursor = 'default';
        });

        ws.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            const oldScale = this.scale;
            this.zoomIdx = Math.max(0, Math.min(this.zoomLevels.length - 1, this.zoomIdx + delta));
            this.scale = this.zoomLevels[this.zoomIdx];
            
            const r = ws.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            
            this.x = mx - (mx - this.x) * (this.scale / oldScale);
            this.y = my - (my - this.y) * (this.scale / oldScale);
            
            this.apply();
        }, { passive: false });
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for viewport matrix synchronization.
     */
    apply() {
        document.getElementById('scene').style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
        document.getElementById('svg-layer').style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
        const gs = 20 * this.scale;
        document.getElementById('grid-layer').style.backgroundPosition = `${this.x}px ${this.y}px`;
        document.getElementById('grid-layer').style.backgroundSize = `${gs}px ${gs}px`;
        // Force wire recalculation on view matrix change
        if (window.Sim) Sim.updateWireVisuals();
    }
};

window.View = View;
