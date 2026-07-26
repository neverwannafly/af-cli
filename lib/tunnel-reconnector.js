const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000, 20_000, 30_000];

class TunnelReconnector {
  constructor({ createAgent, onStatus, retryDelays = RETRY_DELAYS_MS, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
    this.createAgent = createAgent;
    this.onStatus = onStatus;
    this.retryDelays = retryDelays;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.agent = null;
    this.running = false;
    this.connecting = false;
    this.retryTimer = null;
    this.retryAttempt = 0;
    this.readyPromise = null;
    this.resolveReady = null;
  }

  start() {
    if (this.readyPromise) return this.readyPromise;

    this.running = true;
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    void this.connect();
    return this.readyPromise;
  }

  stop() {
    this.running = false;
    if (this.retryTimer) this.clearTimeoutFn(this.retryTimer);
    this.retryTimer = null;
    this.agent?.close();
    this.agent = null;
  }

  async connect() {
    if (!this.running || this.connecting) return;

    this.connecting = true;
    let agent;
    try {
      agent = this.createAgent({ onClose: (error) => this.handleDisconnect(agent, error) });
      this.agent = agent;
      await agent.start();

      if (!this.running || this.agent !== agent) return;

      const reconnected = this.retryAttempt > 0;
      this.retryAttempt = 0;
      this.onStatus?.({ state: reconnected ? 'reconnected' : 'connected' });
      this.resolveReady?.();
      this.resolveReady = null;
    } catch (error) {
      if (this.agent === agent) this.agent = null;
      agent?.close();
      this.scheduleRetry(error);
    } finally {
      this.connecting = false;
    }
  }

  handleDisconnect(agent, error) {
    if (!this.running || this.agent !== agent) return;

    this.agent = null;
    this.scheduleRetry(error);
  }

  scheduleRetry(error) {
    if (!this.running || this.retryTimer) return;

    this.retryAttempt += 1;
    const delayMs = this.retryDelays[Math.min(this.retryAttempt - 1, this.retryDelays.length - 1)];
    this.onStatus?.({ state: 'reconnecting', attempt: this.retryAttempt, delayMs, error });
    this.retryTimer = this.setTimeoutFn(() => {
      this.retryTimer = null;
      void this.connect();
    }, delayMs);
  }
}

module.exports = {
  RETRY_DELAYS_MS,
  TunnelReconnector,
};
