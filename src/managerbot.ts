// config environment
import dotenv from "dotenv";
dotenv.config();

import { Logger } from "winston";
import { Client, Role, Message } from "discord.js";
import Ajv from "ajv";
import cfgs from "../config.json";
import pjson from "../package.json";
import { LoggerFactory } from "./LoggerFactory";

import { ServerManager, IServerConfig, NotRunningError, TimeoutError, IServerInfo } from "./ServerManagers/ServerManager";
import ServerManagerFactory from "./ServerManagers/ServerManagerFactory.js";

// configures logger
const logger: Logger = LoggerFactory.configureLogger();
logger.info("Starting bot");

const ajv = new Ajv();
if (!ajv.validate(require("./schemas/managerbotConfig.schema.json"), cfgs)) {
	logger.error("invalid config file");
	logger.error(ajv.errorsText(null, { dataVar: "configs" }));
	process.exit(1);
}

// set language
let strings: any;
try {
	strings = require("../languages/" + cfgs.language + ".json");
} catch (e) {
	logger.error("file ../languages/" + cfgs.language + ".json cannot be opened");
	process.exit(1);
}

// validates environmental variables
if (!process.env.TOKEN) {
	logger.error("minecraftbot: invalid environmental variables");
}

// configures the token
const token: string = process.env.TOKEN;

// creates the bot
const bot: Client = new Client();

// creates the server managers
let servers: { [name: string]: ServerManager } = {};
for (const server of cfgs.servers) {
	let manager: ServerManager = null;
	try {
		manager = ServerManagerFactory.createServerManager(logger, cfgs.check_every_x_minutes, server);
	} catch (e) {
		logger.error(e);
		process.exit(1);
	}

	servers[server.name] = manager;
}

/**
 * Handles bot on ready
 */
bot.on("ready", () => {
	logger.info("Connected!");
	logger.info("Logged in as " + bot.user.tag);

	bot.user.setActivity(pjson.description + " v" + pjson.version);

	// reset activity once every half hour (sometimes it weirds out)
	setInterval(() => bot.user.setActivity(pjson.description + " v" + pjson.version), 1800000);

	// for each server, check if it is open. If it is, start close check timer
	for (const server of Object.keys(servers)) {
		servers[server].getInstance().then((instance) => {
			if (instance.State.Code === 16) { // running
				logger.verbose(server + ": instance running, manually starting interval");
				servers[server].startInterval();
			} else {
				logger.verbose(server + ": instance not running");
			}
		});
	}
});

/**
 * Handles error events
 */
bot.on("error", error => {
	logger.error("unhandled bot error");
	if (error.message) {
		logger.error(error.message);
	}
});

/**
 * Handles reconnecting events
 */
bot.on("reconnecting", () => {
	logger.info("reconnecting...");
});

/**
 * Handles warning events
 */
bot.on("warn", info => {
	logger.warn(info);
});

/**
 * Handles messages events
 */
bot.on("message", async message => {
	if (message.author.bot) {
		return; // skip message if the author is a bot
	}

	if (!message.isMentioned(bot.user)) return; // ignore if the message doesn't mention the bot

	const fullcmd: string[] = message.content.split(" ").filter(el => el !== "");
	if (!fullcmd[0].match(`^<@${bot.user.id}>$`)) return; // ignore if the mention isn't the first thing

	if (fullcmd.length === 1 || fullcmd[1] === "help") {
		let sendText = strings.command_format;
		sendText += "\n" + strings.command_list;
		// TODO send command list
		sendText += "\n" + strings.server_list;
		for (const server of Object.keys(servers)) {
			sendText += "\n\t" + server;
		}
		message.channel.send(sendText);
		return;
	} else if (fullcmd.length !== 3) {
		let sendText = strings.invalid_command;
		sendText += "\n" + strings.command_format;
		sendText += "\n" + strings.for_help;
		message.channel.send(sendText);
		return;
	}

	const cmd: string = fullcmd[1];
	const serverName: string = fullcmd[2];

	if (!servers[serverName]) {
		message.channel.send(strings.unknown_server.replace("<sname>", serverName));
		return;
	}

	const server: ServerManager = servers[serverName];
	const serverConfig: IServerConfig = server.getConfig();

	let hasPermission = false;
	for (let role of serverConfig.permittedRoles) {
		let permRole: Role = message.guild.roles.find(val => val.name === role);
		if (permRole && message.member.roles.has(permRole.id)) {
			hasPermission = true;
			break;
		}
	}

	if (!hasPermission) {
		message.channel.send(strings.no_permission);
		return;
	}

	logger.verbose(`received command '${cmd}' from ${message.author.username}`);
	if (cmd === "pack" || cmd === "modpack" || cmd === "link") {
		logger.verbose(serverName + ": sending modpack link to user");
		message.channel.send(strings.modpack_link + serverConfig.modpackLink);

		return;
	} else if (cmd === "stats") {
		server.getInfo().then(result => {

			message.channel.send(generateStatsEmbed(result));
		}).catch(err => {
			if (err instanceof NotRunningError) {
				message.channel.send(strings.instance_not_running);
			} else {
				logger.error(err);
			}
		});

		return;
	} else if (cmd === "stop") {
		server.getInfo().then(result => {
			if (result.players.online === 0) {
				message.channel.send(strings.server_closing).then((sentMsg: Message) => {
					server.closeServer().then(() => {
						sentMsg.edit(strings.shutdown_signal_sent);
					});
				});
			} else {
				logger.verbose("server not empty");
				message.channel.send(strings.server_not_empty + " " + result.players.online);
			}
		}).catch(err => {
			if (err instanceof NotRunningError) {
				logger.verbose("instance not running");
				message.channel.send(strings.instance_not_running);
			} else {
				logger.error(err);
			}
		});

		return;
	} else if (cmd === "open" || cmd === "start") {
		server.getInstance().then(instance => {
			logger.verbose("opening server");
			if (instance.State.Code === 16) { // code 16: running
				// instance is running
				logger.verbose("instance already open, sending message");
				message.channel.send(strings.instance_started_waiting_server).then(msg => {
					notifyServerStarting(msg as Message, server);
				});
			} else if (instance.State.Code === 80) { // code 80: stopped
				server.startInstance().then((data) => {
					logger.verbose("instance starting, sending message");
					message.channel.send(strings.instance_starting).then(msg => {
						notifyInstanceStarting(msg as Message, server);
					});
				}).catch(err => {
					logger.error(err);
					logger.error("location: open command");
					message.channel.send(strings.error_starting);
				});
			} else if (instance.State.Code === 64) { // code 64: stopping
				logger.verbose("instance stopping, sending message");
				message.channel.send(strings.please_wait_instance_stopping);
			} else {
				// other state
				logger.verbose("unknown state, sending message");
				message.channel.send(strings.please_wait_instance_state);
			}


		}).catch(err => {
			logger.error(err);
			logger.error("location: before commands");
			message.channel.send(strings.error_describing);
		});
		return;
	} else {
		logger.verbose(`unknown command '${cmd}'`);

		return;
	}

});

/**
 * Handles the message that notifies the Discord user that the ec2 instance is starting
 *
 * @param statusMessage the message to update
 */
function notifyInstanceStarting(statusMessage: Message, server: ServerManager): void {
	logger.verbose("checking if instance has started");
	server.getInstance().then(instance => {
		if (instance.State.Code === 16) { // code 16: running
			// instance is running
			logger.verbose("instance now running, editing message and waiting for minecraft");
			statusMessage.edit(strings.instance_started_waiting_server).then(msg => {
				notifyServerStarting(msg, server);
			});
		} else if (instance.State.Code === 0 || instance.State.Code === 80) { // code 0: starting, 80: stopped
			logger.verbose("instance not running, checking again in 8 seconds.");
			setTimeout(() => { notifyInstanceStarting(statusMessage, server) }, 8000); // 8 seconds
		} else {
			// other state
			logger.verbose("unknown state " + instance.State.Code + " in notifyInstanceStarting, sending message");
			statusMessage.channel.send(strings.please_wait_instance_state + " in notifyInstanceStarting");
		}
	}).catch(err => {
		logger.error(err);
		logger.error("location: notifyInstanceStarting");
		statusMessage.channel.send(strings.error_describing);
	});
}

/**
 * Handles the message that notifies the Discord user that Minecraft is starting
 *
 * @param statusMessage the message to update
 * @param ip the ip of the ec2 instance
 */
function notifyServerStarting(statusMessage: Message, server: ServerManager): void {
	logger.verbose("checking if minecraft has opened");
	server.getInfo().then(result => {
		logger.verbose("server opened!");
		statusMessage.edit(strings.server_opened, generateStatsEmbed(result));
	}).catch(err => {
		logger.verbose("getInfo rejected.");
		if (err instanceof TimeoutError) {
			logger.verbose("server still opening, checking again in 20 seconds: " + err.message);
			notifyServerStarting(statusMessage, server);
		} else {
			logger.verbose("error, checking again in 20 seconds: " + err.message);
			setTimeout(() => { notifyServerStarting(statusMessage, server) }, 20000); // 20 seconds
		}
	});
}

function generateStatsEmbed(serverInfo: IServerInfo) {
	let playernames: string = "";

	if (serverInfo.players.list instanceof Array) {
		for (const player of serverInfo.players.list) {
			playernames += player + "\n";
		}
	}

	let onlinePlayersString = "Players: " + serverInfo.players.online;
	if (serverInfo.players.max) {
		onlinePlayersString += "/" + serverInfo.players.max;
	}

	return {
		embed: {
			color: 0x03DFFC,
			author: {
				name: onlinePlayersString
			},
			description: playernames,
			footer: {
				text: `IP: ${serverInfo.ip}\nPORT: ${serverInfo.port}`
			}
		}
	}
}

// bot login, keep at the end!
logger.info("Connecting...");
bot.login(token)
	.catch((errmsg) => {
		logger.error("Error logging in.\n" + errmsg);
		process.exit(1);
	});
