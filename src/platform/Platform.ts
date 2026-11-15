/**
 * Platform abstraction (Phase 4.1). Portal SDKs (Poki / CrazyGames) plug
 * in here; gameplay code only ever calls this interface. Selected by
 * ?platform=poki|crazygames or the VITE_PLATFORM build env var.
 * Default: NullPlatform — everything resolves instantly, no SDK loaded.
 */
export interface Platform {
  name: string;
  init(): Promise<void>;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(): Promise<void>;
  rewardedBreak(): Promise<boolean>;
  happyTime?(): void;
}

export class NullPlatform implements Platform {
  name = 'null';
  async init(): Promise<void> { /* nothing to load */ }
  gameplayStart(): void { /* noop */ }
  gameplayStop(): void { /* noop */ }
  async commercialBreak(): Promise<void> { /* noop */ }
  /** Local/dev: grant instantly (after a beat) so Continue can be tested. */
  async rewardedBreak(): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 600));
    return true;
  }
  happyTime(): void { /* noop */ }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

interface PokiSDKLike {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(): Promise<void>;
  rewardedBreak(): Promise<{ success: boolean } | boolean>;
  happyTime(): void;
}

export class PokiPlatform implements Platform {
  name = 'poki';
  private sdk: PokiSDKLike | null = null;
  async init(): Promise<void> {
    try {
      await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
      this.sdk = (window as unknown as { PokiSDK: PokiSDKLike }).PokiSDK;
      await this.sdk.init();
      this.sdk.gameLoadingFinished();
    } catch {
      this.sdk = null; // fall back to no-ops; the game must never break
    }
  }
  gameplayStart(): void { this.sdk?.gameplayStart(); }
  gameplayStop(): void { this.sdk?.gameplayStop(); }
  async commercialBreak(): Promise<void> { try { await this.sdk?.commercialBreak(); } catch { /* ignore */ } }
  async rewardedBreak(): Promise<boolean> {
    if (!this.sdk) return false;
    try {
      const r = await this.sdk.rewardedBreak();
      return typeof r === 'boolean' ? r : r.success;
    } catch {
      return false;
    }
  }
  happyTime(): void { this.sdk?.happyTime(); }
}

interface CrazySDKLike {
  game: { gameplayStart(): void; gameplayStop(): void; happytime(): void };
  ad: {
    requestAd(adType: string, callbacks: { adFinished?: () => void; adError?: () => void }): void;
  };
}

export class CrazyGamesPlatform implements Platform {
  name = 'crazygames';
  private sdk: CrazySDKLike | null = null;
  async init(): Promise<void> {
    try {
      await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
      const cg = (window as unknown as { CrazyGames: { SDK: CrazySDKLike & { init(): Promise<void> } } }).CrazyGames;
      await cg.SDK.init();
      this.sdk = cg.SDK;
    } catch {
      this.sdk = null;
    }
  }
  gameplayStart(): void { this.sdk?.game.gameplayStart(); }
  gameplayStop(): void { this.sdk?.game.gameplayStop(); }
  async commercialBreak(): Promise<void> {
    if (!this.sdk) return;
    await new Promise<void>((resolve) => {
      this.sdk!.ad.requestAd('midgame', { adFinished: resolve, adError: () => resolve() });
    });
  }
  async rewardedBreak(): Promise<boolean> {
    if (!this.sdk) return false;
    return new Promise<boolean>((resolve) => {
      this.sdk!.ad.requestAd('rewarded', {
        adFinished: () => resolve(true),
        adError: () => resolve(false),
      });
    });
  }
  happyTime(): void { this.sdk?.game.happytime(); }
}

let instance: Platform | null = null;

export function getPlatform(): Platform {
  if (instance) return instance;
  const param = new URLSearchParams(location.search).get('platform');
  const env = (import.meta.env.VITE_PLATFORM as string | undefined) ?? '';
  const choice = (param ?? env).toLowerCase();
  instance =
    choice === 'poki' ? new PokiPlatform() : choice === 'crazygames' ? new CrazyGamesPlatform() : new NullPlatform();
  void instance.init();
  return instance;
}

/** Commercial breaks: at most once every 2.5 minutes, between runs. */
let lastBreakAt = 0;
export async function maybeCommercialBreak(): Promise<void> {
  const now = Date.now();
  if (now - lastBreakAt < 150_000) return;
  lastBreakAt = now;
  await getPlatform().commercialBreak();
}
