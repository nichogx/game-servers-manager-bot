import dotenv from "dotenv";

import { expect } from "chai";
import ServerManagerFactory, { UnsupportedServerError } from "../../src/ServerManagers/ServerManagerFactory";
import { IServerConfig } from "../../src/ServerManagers/ServerManager";
import { MinecraftServerManager } from "../../src/ServerManagers/MinecraftServerManager";
import { LoggerFactory } from "../../src/LoggerFactory";

describe("Tests for ServerManagerFactory", () => {

	let serverConfigs: IServerConfig = null;
	const logger = LoggerFactory.configureLogger();

	before(() => {
		dotenv.config();
	});

	beforeEach(() => {
		serverConfigs = {
			name: "test",
			type: "testasdasd",
			instanceId: "test",
			port: 0,
			awsRegion: "test",
			sshUser: "test",
			sshKeyPath: "test",
			modpackLink: "test",
			closeScriptPath: "test",
			permittedRoles: ["test"]
		};
	});

	it("should throw when unknown server type passed", () => {
		try {
			const result = ServerManagerFactory.createServerManager(logger, 10, serverConfigs);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).to.be.instanceOf(UnsupportedServerError);
		}
	});

	it("should return a minecraft server manager instance", () => {
		serverConfigs.type = "minecraft";
		const result = ServerManagerFactory.createServerManager(logger, 10, serverConfigs);
		expect(result).to.be.instanceOf(MinecraftServerManager);
	});
});