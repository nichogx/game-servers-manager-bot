export default class IntervalManager {


	private seconds: number = 0;
	private callback: CallableFunction = null;

	private interval: NodeJS.Timeout = null;

	/**
	 * constructor
	 * does NOT start the timeout
	 * 
	 * @param seconds the time in seconds
	 */
	public constructor(callback: CallableFunction, seconds: number) {
		this.seconds = seconds;
		this.callback = callback;
	}

	/**
	 * start the timeout
	 * 
	 * @returns the state of the timeout (active or inactive)
	 */
	public start(): boolean {
		if (this.interval === null && this.seconds !== 0) {
			this.interval = setInterval(() => {
				this.callback();
			}, this.seconds * 1000);
		}

		return this.active();
	}

	/**
	 * stops the timeout
	 * 
	 * @returns the state of the timeout (active or inactive)
	 */
	public stop(): boolean {
		if (this.interval !== null) {
			clearInterval(this.interval);
			this.interval = null;
		}

		return this.active();
	}

	/**
	 * resets the timer (stops and restarts)
	 * 
	 * @param newTime optional, the new interval to use (in seconds)
	 * 
	 * @returns the state of the timeout (active or inactive)
	 */
	public reset(newTime: number = this.seconds): boolean {
		this.stop();
		this.seconds = newTime;
		this.start();

		return this.active();
	}

	/**
	 * check the state of the interval
	 * 
	 * @returns true if active, false if inactive
	 */
	public active(): boolean {
		return this.interval !== null;
	}

}