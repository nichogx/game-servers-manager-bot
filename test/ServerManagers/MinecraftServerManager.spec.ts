import { MinecraftServerManager } from "../../src/ServerManagers/MinecraftServerManager";
import { expect } from "chai";
import { IServerConfig } from "../../src/ServerManagers/ServerManager";
import { LoggerFactory } from "../../src/LoggerFactory";

describe("Tests for MinecraftServerManager", () => {

	let serverConfigs: IServerConfig = null;
	const logger = LoggerFactory.configureLogger();

	beforeEach(() => {
		process.env.AWS_ACCESS_KEY_ID = "123";
		process.env.AWS_SECRET_ACCESS_KEY = "123";
	});

	beforeEach(() => {
		serverConfigs = {
			name: "test",
			type: "minecraft",
			instanceId: "i-0test",
			port: 0,
			awsRegion: "test",
			sshUser: "test",
			sshKeyPath: "test",
			modpackLink: "test",
			closeScriptPath: "test",
			permittedRoles: ["test"]
		};
	});

	it("should throw when null logger passed", () => {
		const func = () => {
			new MinecraftServerManager(null, 10, serverConfigs);
		};

		expect(func).to.throw();
	});

	it("should throw when time < 0 passed", () => {
		const func = () => {
			new MinecraftServerManager(logger, -1, serverConfigs);
		};

		expect(func).to.throw();
	});

	it("should throw when no serverConfigs passed", () => {
		const func = () => {
			new MinecraftServerManager(logger, 10, null);
		};

		expect(func).to.throw();
	});

	it("should throw when an environment variable is not present", () => {
		delete process.env.AWS_ACCESS_KEY_ID;
		const func = () => {
			new MinecraftServerManager(logger, 10, serverConfigs);
		};

		expect(func).to.throw();
	});

	it("should be able to correctly create a servermanager", () => {
		const actual = new MinecraftServerManager(logger, 10, serverConfigs);

		expect(actual).to.be.instanceOf(MinecraftServerManager);
	});
});