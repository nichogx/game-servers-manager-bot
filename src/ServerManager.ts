import { Logger } from "winston";
import mc from 'minecraft-protocol';
import { Instance } from "aws-sdk/clients/ec2";
const ssh: any = require('ssh-exec');

import AWS from "aws-sdk";
import EC2 from 'aws-sdk/clients/ec2';
import IntervalManager from "./IntervalManager";

export class ServerManager {

	private logger: Logger = null;
	private interval: IntervalManager = null;

	private ec2: EC2 = null;
	private instanceIDparam: { InstanceIds: string[] } = null;

	private mcport: number = 25565;

	/**
	 * constructor
	 * 
	 * @param logger the winston Logger to use
	 * @param checkIntervalMinutes the interval to check if server should be closed (0 players),
	 * if this is 0, won't check.
	 */
	public constructor(logger: Logger, checkIntervalMinutes: number = 0) {
		this.logger = logger;

		this.mcport = Number.parseInt(process.env.MINECRAFT_PORT);

		// configures AWS
		AWS.config.update({ region: "us-east-1" });
		this.ec2 = new EC2({ apiVersion: '2016-11-15' });

		this.instanceIDparam = { InstanceIds: [process.env.AWS_INSTANCEID] };

		this.interval = new IntervalManager(() => {
			this.checkShouldClose();
		}, checkIntervalMinutes * 60);
	}

	/**
	 * Checks if the server should be closed (no players), 
	 * and closes it/shuts down the ec2 instance if it should
	 */
	private checkShouldClose(): void {
		this.logger.verbose("checking if server should be closed");
		this.getInstance().then(instance => {
			if (instance.State.Code === 16) { // code 16: running
				// instance is running
				this.getMCServerInfo(instance.PublicIpAddress).then(result => {
					if (result.players.online === 0) {
						this.logger.info("server should be closed");
						this.closeServer(instance.PublicIpAddress);
					} else {
						this.logger.verbose("server should not be closed");
					}
				}).catch(err => {
					this.logger.error(err);
					this.logger.error("location: checkShouldClose getMCServerInfo");
				});
			}
		}).catch(err => {
			this.logger.error(err);
			this.logger.error("location: checkShouldClose");
		});
	}

	/**
	 * Gets information from the given Minecraft server
	 * 
	 * @param ip the IP of the MC server
	 * 
	 * @returns the ping result as defined in minecraft-protocol
	 */
	public getMCServerInfo(ip: string): Promise<mc.NewPingResult> {
		return new Promise((resolve, reject) => {
			mc.ping({ host: ip, port: this.mcport }, (err, result: mc.NewPingResult) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		});
	}

	/**
	 * Starts the configured instance
	 * 
	 * @returns a promise that resolves when the command was sent
	 */
	public startInstance(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.ec2.startInstances(this.instanceIDparam, (err, data) => {
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
					if (!err) reject("reservation length or instances length is zero");
					else reject(err);
				} else {
					const instance = data.Reservations[0].Instances[0];
					resolve(instance);
				}
			});
		});
	}

	/**
	 * Closes the Minecraft server and shuts down the ec2 instance.
	 * 
	 * @param ip the IP of the ec2 instance
	 */
	public closeServer(ip: string) {
		this.logger.info("sending stop command");
		ssh("/home/ubuntu/closegalerepack.sh", {
			user: process.env.SSH_USER,
			host: ip,
			key: process.env.SSH_KEY_PATH
		}, () => {
			this.logger.info("shutting down server in 10 seconds");
			setTimeout(() => {
				this.ec2.stopInstances(this.instanceIDparam, (err, data) => {
					if (err) {
						this.logger.error(err);
						this.logger.error("location: closeServer stopInstances");
					} else {
						this.interval.stop();
						this.logger.info("shutdown signal sent");
					}
				});
			}, 10000);
		});
	}
}