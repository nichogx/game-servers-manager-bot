import { ServerManager, IServerConfig } from "./ServerManager";
import { MinecraftServerManager } from "./MinecraftServerManager";
import { Logger } from "winston";

export class UnsupportedServerError extends Error {
	constructor(...args: any[]) {
        super(...args);
        Error.captureStackTrace(this, UnsupportedServerError);
    }
}

export default class ServerManagerFactory {

	/**
	 * Creates a server manager of the specified type inside the configs parameter.
	 * 
	 * Throws an error if the type is not supported.
	 * 
	 * @param logger the logger the server manager will use
	 * @param minutesCheck the interval in minutes to check if it should be closed
	 * @param configs the configuration for the server manager
	 */
	public static createServerManager(logger: Logger, minutesCheck: number, configs: IServerConfig): ServerManager {
		const type = configs.type;
		
		if (type === "minecraft") {
			return new MinecraftServerManager(logger, minutesCheck, configs);
		} else {
			throw new UnsupportedServerError("unknown/unsupported server type: " + type);
		}
	}
}