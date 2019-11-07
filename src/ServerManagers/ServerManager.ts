import { Logger } from "winston";
import { Instance } from "aws-sdk/clients/ec2";

import AWS from "aws-sdk";
import EC2 from 'aws-sdk/clients/ec2';
import IntervalManager from "../IntervalManager";

export class NotRunningError extends Error {
	constructor(...args: any[]) {
		super(...args);
		Error.captureStackTrace(this, NotRunningError);
	}
}

export class TimeoutError extends Error {
	constructor(...args: any[]) {
		super(...args);
		Error.captureStackTrace(this, TimeoutError);
	}
}

export interface IServerConfig {
	name: string,
	type: string,
	instanceId: string,
	port: number,
	awsRegion: string,
	sshUser: string,
	sshKeyPath: string,
	modpackLink: string,
	closeScriptPath: string,
	permittedRoles: string[]
}

export interface IServerInfo {
	players: {
		online: number,
		max?: number,
		list?: Array<string>
	},
	ip: string,
	port: number
}

export abstract class ServerManager {

	protected logger: Logger = null;
	protected interval: IntervalManager = null;

	protected ec2: EC2 = null;
	protected instanceIDparam: { InstanceIds: string[] } = null;

	protected configs: IServerConfig = null;
	protected serverName: string = null;

	/**
	 * Checks if the server should be closed (no players), 
	 * and closes it/shuts down the ec2 instance if it should
	 */
	protected abstract checkShouldClose(): void;

	/**
	 * Closes the Minecraft server and shuts down the ec2 instance.
	 * 
	 * @param ip the IP of the ec2 instance
	 */
	public abstract closeServer(): Promise<void>;

	/**
	 * Gets information from the server
	 * 
	 * Can reject with NotRunningError or TimeoutError
	 */
	public abstract getInfo(): Promise<IServerInfo>;

	/**
	 * Gets the IServerConfig for this server
	 */
	public getConfig(): IServerConfig {
		return this.configs;
	}

	/**
	 * constructor
	 * 
	 * @param logger the winston Logger to use
	 * @param checkIntervalMinutes the interval to check if server should be closed (0 players),
	 * if this is 0, won't check.
	 * @param configs the IServerConfig for this server
	 */
	public constructor(logger: Logger, checkIntervalMinutes: number = 0, configs: IServerConfig) {
		if (!logger || checkIntervalMinutes < 0 || !configs) {
			throw new Error("invalid parameters for ServerManager constructor");
		}

		this.logger = logger;

		this.configs = configs;
		this.serverName = configs.name;

		const requiredEnvs = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];
		for (const env of requiredEnvs) {
			if (!process.env[env]) {
				logger.error(this.serverName + ": ServerManager: invalid environmental variables");
				throw new Error(this.serverName + ": ServerManager: invalid environmental variables");
			}
		}

		// configures AWS
		AWS.config.update({ region: configs.awsRegion });
		this.ec2 = new EC2({ apiVersion: '2016-11-15' });

		this.instanceIDparam = { InstanceIds: [configs.instanceId] };

		this.interval = new IntervalManager(() => {
			this.checkShouldClose();
		}, checkIntervalMinutes * 60);
	}

	/**
	 * Starts the configured instance
	 * 
	 * @returns a promise that resolves when the command was sent
	 */
	public startInstance(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.logger.verbose(this.serverName + ": starting instance");
			this.ec2.startInstances(this.instanceIDparam, (err, data) => {
				this.logger.info(this.serverName + ": starting server check interval");
				this.interval.start();
				if (err) {
					return reject(err);
				} else {
					return resolve();
				}
			});
		});
	}

	/**
	 * Gets the instance with the configured ID.
	 * 
	 * @returns Promise that resolves to the Instance
	 */
	public getInstance(): Promise<Instance> {
		return new Promise((resolve, reject) => {
			this.ec2.describeInstances(this.instanceIDparam, (err, data) => {
				if (err || data.Reservations.length === 0 || data.Reservations[0].Instances.length === 0) {
					if (!err) reject(this.serverName + ": reservation length or instances length is zero");
					else reject(err);
				} else {
					const instance = data.Reservations[0].Instances[0];
					resolve(instance);
				}
			});
		});
	}

	/**
	 * Stops the configured instance
	 * 
	 * @returns a promise that resolves when the command was sent
	 */
	protected stopInstance(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.ec2.stopInstances(this.instanceIDparam, (err, data) => {
				if (err) {
					this.logger.error(err);
					this.logger.error(this.serverName + ": location: ServerManager stopInstance stopInstances");
					reject(err);
				} else {
					this.logger.info(this.serverName + ": stopping server check interval");
					this.interval.stop();
					this.logger.info(this.serverName + ": shutdown signal sent");
					resolve();
				}
			});
		});
	}

	/**
	 * Starts the interval
	 */
	public startInterval() {
		this.interval.start();
	}
}