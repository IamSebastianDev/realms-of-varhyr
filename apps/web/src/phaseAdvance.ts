export const phaseAdvanceTiming = { transitionMs: 500 } as const;
export type PhaseAdvanceContext = { phaseKey: string; enabled: boolean };

/** Single presses advance immediately; the next phase has a brief input lock with no queued actions. */
export class PhaseAdvanceInput {
  private context: PhaseAdvanceContext | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lockedUntil = 0;
  private down = false;
  constructor(private advance: () => void, private transitionChanged: (startedAt: number | null) => void,
    private now: () => number = () => performance.now()) {}
  get spaceDown() { return this.down; }
  update(next: PhaseAdvanceContext) {
    const previous=this.context;this.context=next;
    if(previous && previous.phaseKey!==next.phaseKey)this.beginTransition();
  }
  pressSpace(): boolean {
    if(this.down)return true;
    if(!this.context?.enabled)return false;
    this.down=true;
    this.commit();
    return true;
  }
  releaseSpace(): boolean {
    const handled=this.down;this.down=false;return handled;
  }
  click(): boolean { return this.commit(); }
  private commit(): boolean {
    if(!this.context?.enabled || this.now()<this.lockedUntil)return false;
    // Lock before dispatch: local sessions can synchronously publish their next phase.
    this.beginTransition();this.advance();return true;
  }
  private beginTransition() {
    if(this.timer!==undefined)clearTimeout(this.timer);
    const startedAt=this.now();this.lockedUntil=startedAt+phaseAdvanceTiming.transitionMs;
    this.transitionChanged(startedAt);
    this.timer=setTimeout(()=>{this.timer=undefined;this.transitionChanged(null);},phaseAdvanceTiming.transitionMs);
  }
  dispose() {
    if(this.timer!==undefined)clearTimeout(this.timer);
    this.timer=undefined;this.lockedUntil=0;this.releaseSpace();this.transitionChanged(null);
  }
}
