import { ServerManager, IServerConfig, IServerInfo, NotRunningError, TimeoutError } from "./ServerManager";
import { Logger } from "winston";

import mc, { NewPingResult } from 'minecraft-protocol';
const ssh: any = require('ssh-exec');

export class MinecraftServerManager extends ServerManager {

	public constructor(logger: Logger, checkIntervalMinutes: number = 0, configs: IServerConfig) {
		super(logger, checkIntervalMinutes, configs);
	}

	public closeServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.logger.info(this.serverName + ": attempting to close server");
			this.getInstance().then(instance => {
				if (instance.State.Code === 16) { // code 16: running
					this.logger.info(this.serverName + ": sending stop command");
					ssh(this.configs.closeScriptPath, {
						user: this.configs.sshUser,
						host: instance.PublicIpAddress,
						key: this.configs.sshKeyPath
					}, () => {
						this.logger.info(this.serverName + ": shutting down server in 10 seconds");
						setTimeout(() => {
							this.stopInstance().then(() => {
								resolve();
							}).catch(err => {
								reject(err);
							});
						}, 10000);
					});
				} else {
					reject(new NotRunningError("server is not running, can't be closed"));
				}
			});
		});
	}

	protected checkShouldClose(): void {
		this.logger.verbose(this.serverName + ": checking if server should be closed");
		this.getInstance().then(instance => {
			if (instance.State.Code === 16) { // code 16: running
				// instance is running
				this.getInfo().then(result => {
					if (result.players.online === 0) {
						this.logger.info(this.serverName + ": server should be closed");
						this.closeServer();
					} else {
						this.logger.verbose(this.serverName + ": server should not be closed");
					}
				}).catch(err => {
					this.logger.error(err);
					this.logger.error(this.serverName + ": location: checkShouldClose getMCServerInfo");
				});
			}
		}).catch(err => {
			this.logger.error(err);
			this.logger.error(this.serverName + ": location: checkShouldClose");
		});
	}

	public getInfo(): Promise<IServerInfo> {
		return new Promise((resolve, reject) => {

			this.getInstance().then(instance => {
				if (instance.State.Code !== 16) {
					// not running
					return reject(new NotRunningError("server is not running, can't get info"));
				}

				// this timeout is a hack to makeup for the fact that the library 
				// sometimes doesn't call the callback
				const timeout = setTimeout(() => {
					reject(new TimeoutError("getInfo timed out"));
				}, 20000); // 20 seconds

				mc.ping({ host: instance.PublicIpAddress, port: this.configs.port }, (err: any, result: NewPingResult) => {
					clearTimeout(timeout); // we received a response so we don't need the timeout anymore

					if (err) {
						return reject(new Error(err.code));
					} else if (!result || !result.players) {
						return reject(new Error("RESULT OR PLAYERS UNDEFINED"));
					}

					const serverInfo: IServerInfo = {
						players: {
							online: result.players.online,
							max: result.players.max
						},
						ip: instance.PublicIpAddress,
						port: this.configs.port
					};

					if (result.players.sample instanceof Array) {
						serverInfo.players.list = result.players.sample.map(x => x.name);
					}

					return resolve(serverInfo);
				});
			});
		});
	}

}