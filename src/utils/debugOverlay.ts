import { loadTuning, saveTuning, tuningAsConfigSnippet, type TuningValues } from './tuning';

export interface DebugState {
  lastFlip: string;
  lastLanding: string;
  lean: number;
  swayAmp: number;
  windForce: number;
  fps: number;
  stepsThisFrame: number;
  height: number;
  simTime: number;
}

const SLIDERS: { key: keyof TuningValues; label: string; min: number; max: number; step: number }[] = [
  { key: 'LAUNCH_VY_MIN', label: 'Launch VY min', min: -14, max: -8, step: 0.1 },
  { key: 'LAUNCH_VY_MAX', label: 'Launch VY max', min: -26, max: -16, step: 0.1 },
  { key: 'SPIN_FLIPS_MIN', label: 'Spin flips min', min: 0, max: 1.5, step: 0.05 },
  { key: 'SPIN_FLIPS_MAX', label: 'Spin flips max', min: 2, max: 5, step: 0.05 },
  { key: 'STEER_ACCEL', label: 'Steer accel', min: 0, max: 0.05, step: 0.001 },
  { key: 'ASSIST_ANGULAR_DAMP', label: 'Assist angular damp', min: 0.5, max: 1, step: 0.01 },
  { key: 'PERFECT_ANGLE_DEG', label: 'Perfect angle °', min: 2, max: 15, step: 0.5 },
  { key: 'GOOD_ANGLE_DEG', label: 'Good angle °', min: 8, max: 40, step: 1 },
  { key: 'WIND_MAX_FORCE', label: 'Wind max force', min: 0, max: 0.0015, step: 0.00005 },
  { key: 'GRAVITY_Y', label: 'Gravity Y', min: 0.6, max: 1.5, step: 0.02 },
];

/** Dev tuning overlay (Phase 1.6). Toggle: backtick key or 3-finger tap. */
export class DebugOverlay {
  private root: HTMLDivElement;
  private info: HTMLDivElement;
  private visible = false;
  onDeterminismTest: (() => string) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:9999;background:rgba(20,16,8,0.88);color:#ffe9b0;font:12px/1.5 monospace;padding:10px;border-radius:10px;width:270px;display:none;max-height:92vh;overflow:auto;';
    this.info = document.createElement('div');
    this.root.appendChild(this.info);

    const tuning = loadTuning();
    for (const s of SLIDERS) {
      const row = document.createElement('label');
      row.style.display = 'block';
      row.style.marginTop = '6px';
      const val = document.createElement('span');
      val.textContent = ` ${tuning[s.key]}`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(tuning[s.key]);
      input.style.width = '120px';
      input.addEventListener('input', () => {
        const t = loadTuning();
        t[s.key] = Number(input.value);
        saveTuning(t);
        val.textContent = ` ${t[s.key]}`;
      });
      row.append(`${s.label}`, input, val);
      this.root.appendChild(row);
    }

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy as config';
    copyBtn.style.marginTop = '8px';
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(tuningAsConfigSnippet());
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy as config'), 1200);
    });
    this.root.appendChild(copyBtn);

    const testBtn = document.createElement('button');
    testBtn.textContent = 'Determinism test';
    testBtn.style.marginTop = '8px';
    testBtn.style.marginLeft = '6px';
    testBtn.addEventListener('click', () => {
      if (this.onDeterminismTest) alert(this.onDeterminismTest());
    });
    this.root.appendChild(testBtn);

    document.body.appendChild(this.root);

    window.addEventListener('keydown', (e) => {
      if (e.key === '`') this.toggle();
    });
    let touches = 0;
    window.addEventListener('touchstart', (e) => {
      touches = e.touches.length;
      if (touches >= 3) this.toggle();
    }, { passive: true });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
  }

  update(state: DebugState): void {
    if (!this.visible) return;
    this.info.innerHTML =
      `flip: ${state.lastFlip}<br>landing: ${state.lastLanding}<br>` +
      `lean: ${state.lean.toFixed(0)}px · sway: ${state.swayAmp.toFixed(1)}px<br>` +
      `wind: ${state.windForce.toFixed(5)} · height: ${state.height}<br>` +
      `fps: ${state.fps} · steps/frame: ${state.stepsThisFrame} · sim: ${(state.simTime / 1000).toFixed(1)}s`;
  }

  destroy(): void {
    this.root.remove();
  }
}
