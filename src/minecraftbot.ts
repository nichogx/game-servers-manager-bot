// config environment
import dotenv from "dotenv";
dotenv.config();

import { Logger } from "winston";
import { Client, Role, Message } from "discord.js";
import Ajv from "ajv";
import { ServerManager } from "./ServerManager";
import cfgs from "../config.json";
import pjson from "../package.json";
import { MCServer } from "./MCServer";
import { LoggerFactory } from "./LoggerFactory";

// configures logger
const logger: Logger = LoggerFactory.configureLogger();

// validate configuration
const ajv = new Ajv();
const validConfig = ajv.validate(require("./schemas/minecraftbotConfig.schema.json"), cfgs);
if (!validConfig) {
	logger.error("minecraftbot: invalid config.json");
	logger.error(ajv.errorsText(null, { dataVar: "config" }));
	process.exit(1);
}

// set language
const strings: any = require("../languages/" + cfgs.language + ".json");

// validates environmental variables
if (!process.env.TOKEN) {
	logger.error("minecraftbot: invalid environmental variables");
}

// configures the token
const token: string = process.env.TOKEN;

// creates the bot
const bot: Client = new Client();

// creates the server manager
let manager: ServerManager = null;
try {
	manager = new ServerManager(logger, cfgs.check_every_x_minutes);
} catch (e) {
	logger.error(e);
	process.exit(1);
}

/**
 * Handles bot on ready
 */
bot.on("ready", () => {
	logger.info(strings.log.connected);
	logger.info(strings.log.loggedin
		.replace("<user>", bot.user.tag)
	);

	bot.user.setActivity(pjson.description + " v" + pjson.version);

	// reset activity once every half hour (sometimes it weirds out)
	setInterval(() => bot.user.setActivity(pjson.description + " v" + pjson.version), 1800000);
});

/**
 * Handles error events
 */
bot.on("error", error => {
	logger.error(strings.log.unhandled_error);
	if (error.message) {
		logger.error(error.message);
	}
});

/**
 * Handles reconnecting events
 */
bot.on("reconnecting", () => {
	logger.info(strings.log.reconnecting);
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

	// command format is "[prfx]command arg1 arg2 arg3..."
	// on commands that need to have spaces in a single argument, the arguments can be joined in a single one.
	// that is done inside the command treatment (if cmd ===...)
	const fullcmd: string[] = message.content.split(" ").filter(el => el !== "");
	let cmd: string = fullcmd[1];
	const args: string[] = fullcmd.slice(2);

	let hasPermission: boolean = false;

	for (let role of cfgs.permitted_roles) {
		let permRole: Role = message.guild.roles.find(val => val.name === role);
		if (permRole && message.member.roles.has(permRole.id)) {
			hasPermission = true;
			break;
		}
	}

	if (!hasPermission) return;

	logger.verbose(`received command '${cmd}' from ${message.author.username}`);
	// commands that don't need the instance
	if (cmd === "pack" || cmd === "modpack" || cmd === "link") {
		logger.verbose("sending modpack link to user");
		message.channel.send(strings.messages.modpack_link + cfgs.modpack_link);

		return;
	}

	// commands that need the instance
	manager.getInstance().then(instance => {
		if (cmd === "open" || cmd === "start") {
			logger.verbose("opening server");
			if (instance.State.Code === 16) { // code 16: running
				// instance is running
				logger.verbose("instance already open, sending message");
				message.channel.send(strings.messages.instance_started_waiting_server).then(msg => {
					notifyMinecraftStarting(msg as Message, instance.PublicIpAddress);
				});
			} else if (instance.State.Code === 80) { // code 80: stopped
				manager.startInstance().then((data) => {
					logger.verbose("instance starting, sending message");
					message.channel.send(strings.messages.instance_starting).then(msg => {
						notifyInstanceStarting(msg as Message);
					});
				}).catch(err => {
					logger.error(err);
					logger.error("location: open command");
					message.channel.send(strings.messages.error_starting);
				});
			} else {
				// other state
				logger.verbose("unknown state, sending message");
				message.channel.send(strings.messages.please_wait_instance_state);
			}

			return;
		} else if (cmd === "stop") {
			if (instance.State.Code === 16) { // code 16: running
				MCServer.getInfo(instance.PublicIpAddress, cfgs.minecraft_port).then(result => {
					if (result.players.online === 0) {
						manager.closeServer(instance.PublicIpAddress);
					} else {
						logger.verbose("server not empty");
						message.channel.send(strings.messages.server_not_empty + " " + result.players.online);
					}
				});
			} else {
				logger.verbose("instance not running");
				message.channel.send(strings.messages.instance_not_running);
			}

			return;
		} else if (cmd === "stats") {
			if (instance.State.Code === 16) { // code 16: running
				MCServer.getInfo(instance.PublicIpAddress, cfgs.minecraft_port).then(result => {
					let playernames: string = "";

					if (result.players.list instanceof Array) {
						for (const player of result.players.list) {
							playernames += player.name + "\n";
						}
					}

					message.channel.send({
						embed: {
							color: 0x03DFFC,
							author: {
								name: "Players: " + result.players.online + "/" + result.players.max,
							},
							description: playernames,
							footer: {
								text: "IP: " + instance.PublicIpAddress
							}
						}
					});
				});

				return;
			} else {
				message.channel.send(strings.messages.instance_not_running);

				return;
			}
		} else {
			logger.verbose(`unknown command '${cmd}'`);

			return;
		}
	}).catch(err => {
		logger.error(err);
		logger.error("location: before commands");
		message.channel.send(strings.messages.error_describing);
	});
});

/**
 * Handles the message that notifies the Discord user that the ec2 instance is starting
 * 
 * @param statusMessage the message to update
 */
function notifyInstanceStarting(statusMessage: Message): void {
	logger.verbose("checking if instance has started");
	manager.getInstance().then(instance => {
		if (instance.State.Code === 16) { // code 16: running
			// instance is running
			logger.verbose("instance now running, editing message and waiting for minecraft");
			statusMessage.edit(strings.messages.instance_started_waiting_server).then(msg => {
				notifyMinecraftStarting(msg, instance.PublicIpAddress);
			});
		} else if (instance.State.Code === 0) { // code 0: starting
			logger.verbose("instance not running, checking again in 8 seconds.");
			setTimeout(() => { notifyInstanceStarting(statusMessage) }, 8000); // 8 seconds
		} else {
			// other state
			logger.verbose("unknown state in notifyInstanceStarting, sending message");
			statusMessage.channel.send(strings.messages.please_wait_instance_state + " in notifyInstanceStarting");
		}
	}).catch(err => {
		logger.error(err);
		logger.error("location: notifyInstanceStarting");
		statusMessage.channel.send(strings.messages.error_describing);
	});
}

/**
 * Handles the message that notifies the Discord user that Minecraft is starting
 * 
 * @param statusMessage the message to update
 * @param ip the ip of the ec2 instance
 */
function notifyMinecraftStarting(statusMessage: Message, ip: string): void {
	logger.verbose("checking if minecraft has opened");
	MCServer.getInfo(ip, cfgs.minecraft_port).then(result => {
		logger.verbose("server opened!");
		statusMessage.edit(strings.messages.server_opened + " " + ip);
	}).catch(err => {
		if (err.code === "ETIMEDOUT") {
			logger.verbose("server still opening, checking again in 20 seconds: " + err.code);
			notifyMinecraftStarting(statusMessage, ip);
		} else {
			logger.verbose("error, checking again in 20 seconds: " + err.code);
			setTimeout(() => { notifyMinecraftStarting(statusMessage, ip) }, 20000); // 20 seconds
		}
	});
}

// bot login, keep at the end!
bot.login(token)
	.catch((errmsg) => {
		logger.error("Error logging in.\n" + errmsg);
		process.exit(1);
	});
