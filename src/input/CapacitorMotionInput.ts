import type { FlipSettings } from '../config';
import type { FlipHandler, IInputController } from './InputController';

/**
 * Capacitor Motion stub (Phase 4.4). When the game is wrapped with
 * Capacitor, implement this with the @capacitor/motion plugin (or a
 * community DeviceMotion plugin) and swap it in wherever InputController
 * is constructed — the interface is identical, gameplay doesn't change.
 *
 * TODO(capacitor): listen to Motion.addListener('accel', ...) and map:
 *  - power  = spike peak of |accel| above gravity, normalised like INPUT.MOTION_*
 *  - spin   = peak |rotationRate| during the spike window
 *  - tilt   = accelerationIncludingGravity.x for getTilt()
 */
export class CapacitorMotionInput implements IInputController {
  private handler: FlipHandler;
  private enabled = false;

  constructor(handler: FlipHandler) {
    this.handler = handler;
    void this.handler;
  }

  enable(): void {
    this.enabled = true;
  }
  disable(): void {
    this.enabled = false;
  }
  destroy(): void { /* remove plugin listeners */ }
  setSettings(_s: FlipSettings): void { /* store sensitivity */ }
  getCharge(): number {
    return 0;
  }
  getTilt(): number {
    return 0;
  }
  markLaunch(): void { /* record launch time for steering gating */ }
  get isEnabled(): boolean {
    return this.enabled;
  }
}
