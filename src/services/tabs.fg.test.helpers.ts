export type EventArgs = unknown[]
export type EventListener<Args extends EventArgs> = (...args: Args) => unknown

export class EventTargetMock<Args extends EventArgs = never[]> {
  private listener: EventListener<Args> | undefined

  addListener(listener: EventListener<Args>, ..._options: unknown[]): void {
    this.listener = listener
  }

  removeListener(listener: EventListener<Args>): void {
    if (this.listener === listener) this.listener = undefined
  }

  hasListener(listener: EventListener<Args>): boolean {
    return this.listener === listener
  }

  getListener(): EventListener<Args> | undefined {
    return this.listener
  }

  emit(...args: Args): void {
    void this.listener?.(...args)
  }
}
