import { ServerManager, IServerConfig, IServerInfo } from "./ServerManager";
import { MCServer } from "./MCServer";
import { Logger } from "winston";

import mc, { NewPingResult } from 'minecraft-protocol';
const ssh: any = require('ssh-exec');

export class MinecraftServerManager extends ServerManager {

	public constructor(logger: Logger, checkIntervalMinutes: number = 0, configs: IServerConfig) {
		super(logger, checkIntervalMinutes, configs);
	}

	public closeServer(ip: string): void {
		super.logger.info(this.serverName + ": sending stop command");
		ssh(this.configs.closeScriptPath, {
			user: this.configs.sshUser,
			host: ip,
			key: this.configs.sshKeyPath
		}, () => {
			super.logger.info(this.serverName + ": shutting down server in 10 seconds");
			setTimeout(() => {
				super.stopInstance().then(() => {
					super.logger.info(this.serverName + ": shutdown signal sent");
				}).catch(err => {
					super.logger.error(err);
				});
			}, 10000);
		});
	}

	protected checkShouldClose(): void {
		this.logger.verbose(this.serverName + ": checking if server should be closed");
		this.getInstance().then(instance => {
			if (instance.State.Code === 16) { // code 16: running
				// instance is running
				MCServer.getInfo(instance.PublicIpAddress, this.configs.port).then(result => {
					if (result.players.online === 0) {
						this.logger.info(this.serverName + ": server should be closed");
						this.closeServer(instance.PublicIpAddress);
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
					return reject("NOTRUNNING");
				}

				// this timeout is a hack to makeup for the fact that the library 
				// sometimes doesn't call the callback
				const timeout = setTimeout(() => {
					reject("CUSTOMTIMEOUT");
				}, 20000); // 20 seconds

				mc.ping({ host: instance.PublicIpAddress, port: this.configs.port }, (err: any, result: NewPingResult) => {
					if (err) {
						clearTimeout(timeout);
						return reject(err.code);
					} else {
						clearTimeout(timeout);
						return resolve({
							players: {
								online: result.players.online,
								max: result.players.max,
								list: result.players.sample.map(x => x.name)
							},
							ip: instance.PublicIpAddress,
							port: this.configs.port
						});
					}
				});
			});
		});
	}

}