export default class IntervalManager {


	private seconds: number = 0;
	private callback: CallableFunction = null;

	private interval: NodeJS.Timeout = null;

	/**
	 * constructor
	 * starts the timeout
	 * 
	 * @param seconds the time in seconds
	 */
	public constructor(callback: CallableFunction, seconds: number) {
		this.seconds = seconds;
		this.callback = callback;

		this.start();
	}

	/**
	 * start the timeout
	 */
	public start(): void {
		if (this.interval === null && this.seconds !== 0) {
			this.interval = setInterval(() => {
				this.callback();
			}, this.seconds * 1000);
		}
	}

	/**
	 * stops the timeout
	 */
	public stop(): void {
		if (this.interval !== null) {
			clearInterval(this.interval);
		}
	}

	/**
	 * resets the timer (stops and restarts)
	 * 
	 * @param newTime optional, the new interval to use (in seconds)
	 */
	public reset(newTime: number = this.seconds): void {
		this.stop();
		this.seconds = newTime;
		this.start();
	}

}