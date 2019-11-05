import mc, { NewPingResult } from 'minecraft-protocol';

export class MCServer {

	/**
	 * Gets information from the given Minecraft server
	 * 
	 * @param ip the IP of the MC server
	 * @param port the port of the MC server
	 * 
	 * @returns the ping result
	 */
	public static getInfo(ip: string, port: number): Promise<MCPingResult> {
		return new Promise((resolve, reject) => {

			// this timeout is a hack to makeup for the fact that the library 
			// sometimes doesn't call the callback
			const timeout = setTimeout(() => {
				reject({ code: "CUSTOMTIMEOUT" });
			}, 20000); // 20 seconds

			mc.ping({ host: ip, port: port }, (err, result: NewPingResult) => {
				if (err) {
					clearTimeout(timeout);
					return reject(err);
				} else {
					clearTimeout(timeout);
					return resolve({
						players: {
							online: result.players.online,
							max: result.players.max,
							list: result.players.sample
						}
					});
				}
			});
		});
	}
}

export interface MCPingResult {
	players: {
		online: number,
		max: number,
		list?: Array<{ name: string }>
	}
}