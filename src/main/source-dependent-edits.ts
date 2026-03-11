export interface SourceDependentEditHandler {
  id: string
  handleSourceChanged(mediaId: string): Promise<void>
}

export class SourceDependentEditCoordinator {
  private handlers: SourceDependentEditHandler[] = []

  registerHandler(handler: SourceDependentEditHandler): void {
    this.handlers.push(handler)
  }

  async handleSourceChanged(mediaId: string): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler.handleSourceChanged(mediaId)
      } catch (error) {
        console.warn(
          `[SourceDependentEditCoordinator] Handler ${handler.id} failed for media ${mediaId}:`,
          error
        )
      }
    }
  }
}