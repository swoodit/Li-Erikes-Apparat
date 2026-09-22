export async function runWorker(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }
}
