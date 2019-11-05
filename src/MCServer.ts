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
			mc.ping({ host: ip, port: port }, (err, result: NewPingResult) => {
				if (err) {
					reject(err);
				} else {
					resolve({
						players: {
							online: result.players.online,
							max: result.players.max,
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