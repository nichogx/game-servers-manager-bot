// config environment
import dotenv from 'dotenv';
dotenv.config();

import winston, { Logger } from 'winston';
import { Client, Role, Message } from 'discord.js';
import mc from 'minecraft-protocol';
import AWS from "aws-sdk";
import EC2, { Instance } from 'aws-sdk/clients/ec2';
const ssh: any = require('ssh-exec');
const cfgs: any = require('./config.json');
const pjson: any = require('./package.json');
const strings: any = require('./languages/' + cfgs.language + '.json');

// configures logger
const logger: Logger = winston.createLogger({
	format: winston.format.combine(
		winston.format.timestamp({
			format: 'YYYY-MM-DD HH:mm:ss'
		}),
		winston.format.errors({ stack: true }),
		winston.format.colorize(),
		winston.format.printf(info => `${info.timestamp} - ${info.level}: ${info.message}`)
	),
	transports: [
		new winston.transports.Console({ level: 'debug' }),
		new winston.transports.File({ filename: './logs/log-error.log', level: 'error' }),
		new winston.transports.File({ filename: './logs/log-combined.log' })
	]
});

// configures the token
const token: string = process.env.TOKEN;
if (!token) {
	logger.error(strings.log.token_error);
	process.exit(1);
}

// configures AWS
AWS.config.update({ region: "us-east-1" });
const ec2: EC2 = new EC2({ apiVersion: '2016-11-15' });;

const bot: Client = new Client();
const instanceIDparam: { InstanceIds: string[] } = { InstanceIds: [process.env.AWS_INSTANCEID] };

bot.on("ready", () => {
	logger.info(strings.log.connected);
	logger.info(strings.log.loggedin
		.replace('<user>', bot.user.tag)
	);

	bot.user.setActivity(pjson.description + " v" + pjson.version);

	// reset activity once every half hour (sometimes it weirds out)
	setInterval(() => bot.user.setActivity(pjson.description + " v" + pjson.version), 1800000);

	// once every 15 minutes, check if server is empty and should be closed
	setInterval(checkShouldClose, 900000);
});

bot.on("error", error => {
	logger.error(strings.log.unhandled_error);
	if (error.message) {
		logger.error(error.message);
	}
});

bot.on("reconnecting", () => {
	logger.info(strings.log.reconnecting);
});

bot.on("warn", info => {
	logger.warn(info);
});

bot.on("message", async message => {
	if (message.author.bot) {
		return; // skip message if the author is a bot
	}

	if (!message.isMentioned(bot.user)) return; // ignore if the message doesn't mention the bot

	// command format is '[prfx]command arg1 arg2 arg3...'
	// on commands that need to have spaces in a single argument, the arguments can be joined in a single one.
	// that is done inside the command treatment (if cmd ===...)
	const fullcmd: string[] = message.content.split(' ').filter(el => el !== '');
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

	// commands that don't need the instance
	if (cmd === "pack" || cmd === "modpack" || cmd === "link") {
		message.channel.send(strings.messages.modpack_link + cfgs.modpack_link);

		return;
	}
	
	// commands that need the instance
	getInstance().then(instance => {
		if (cmd === "open" || cmd === "start") {
			if (instance.State.Code === 16) { // code 16: running
				// instance is running
				message.channel.send(strings.messages.instance_started_waiting_server).then(msg => {
					notifyMinecraftStarting(msg as Message, instance.PublicIpAddress);
				});
			} else if (instance.State.Code === 80) { // code 80: stopped
				ec2.startInstances(instanceIDparam, (err, data) => {
					if (err) {
						logger.error(err);
						message.channel.send(strings.messages.error_starting);
					} else {
						message.channel.send(strings.messages.instance_starting).then(msg => {
							notifyInstanceStarting(msg as Message);
						});
					}
				});
			} else {
				// other state
				message.channel.send(strings.messages.please_wait_instance_state);
			}

			return;
		} else if (cmd === "stop") {
			if (instance.State.Code === 16) { // code 16: running
				getMCServerInfo(instance.PublicIpAddress).then(result => {
					if (result.players.online === 0) {
						closeServer(instance.PublicIpAddress);
					} else {
						message.channel.send(strings.messages.server_not_empty + " " + result.players.online);
					}
				});
			} else {
				message.channel.send(strings.messages.instance_not_running);
			}

			return;
		} else if (cmd === "stats") {
			if (instance.State.Code === 16) { // code 16: running
				getMCServerInfo(instance.PublicIpAddress).then(result => {
					let playernames: string = "";
					for (const player of result.players.sample) {
						playernames += player.name + "\n";
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
		}
	}).catch(err => {
		logger.error(err);
		logger.error("location: before commands");
		message.channel.send(strings.messages.error_describing);
	});
});

function notifyInstanceStarting(statusMessage: Message): void {
	getInstance().then(instance => {
		if (instance.State.Code === 16) { // code 16: running
			// instance is running
			statusMessage.edit(strings.messages.instance_started_waiting_server).then(msg => {
				notifyMinecraftStarting(msg, instance.PublicIpAddress);
			});
		} else if (instance.State.Code === 0) { // code 0: starting
			logger.verbose("instance not running, checking again in 8 seconds.");
			setTimeout(() => { notifyInstanceStarting(statusMessage) }, 8000); // 8 seconds
		} else {
			// other state
			statusMessage.channel.send(strings.messages.please_wait_instance_state + " in notifyInstanceStarting");
		}
	}).catch(err => {
		logger.error(err);
		logger.error("location: notifyInstanceStarting");
		statusMessage.channel.send(strings.messages.error_describing);
	});
}

function notifyMinecraftStarting(statusMessage: Message, ip: string): void {
	getMCServerInfo(ip).then(result => {
		logger.verbose("server opened!");
		statusMessage.edit(strings.messages.server_opened + " " + ip);
	}).catch(err => {
		if (err.code === "ETIMEDOUT") {
			logger.verbose("server still opening, checking again in 20 seconds: " + err.code);
			notifyMinecraftStarting(statusMessage, ip);
		} else {
			logger.verbose("connection refused, checking again in 20 seconds: " + err.code);
			setTimeout(() => { notifyMinecraftStarting(statusMessage, ip) }, 20000); // 20 seconds
		}
	});
}

function checkShouldClose(): void {
	logger.verbose("checking if server should be closed");
	getInstance().then(instance => {
		if (instance.State.Code === 16) { // code 16: running
			// instance is running
			getMCServerInfo(instance.PublicIpAddress).then(result => {
				if (result.players.online === 0) {
					logger.info("server should be closed");
					closeServer(instance.PublicIpAddress);
				} else {
					logger.verbose("server should not be closed");
				}
			}).catch(err => {
				logger.error(err);
			});
		}
	}).catch(err => {
		logger.error(err);
		logger.error("location: checkShouldClose");
	});
}

function getMCServerInfo(ip: string): Promise<mc.NewPingResult> {
	return new Promise((resolve, reject) => {
		mc.ping({ host: ip, port: cfgs.gameport }, (err, result: mc.NewPingResult) => {
			if (err) {
				reject(err);
			} else {
				resolve(result);
			}
		});
	});
}

function getInstance(): Promise<Instance> {
	return new Promise((resolve, reject) => {
		ec2.describeInstances(instanceIDparam, (err, data) => {
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

function closeServer(ip: string) {
	logger.info("sending stop command");
	ssh("/home/ubuntu/closegalerepack.sh", {
		user: process.env.SSH_USER,
		host: ip,
		key: process.env.SSH_KEY_PATH
	}, () => {
		logger.info("shutting down server in 10 seconds");
		setTimeout(() => {
			ec2.stopInstances(instanceIDparam, (err, data) => {
				if (err) {
					logger.error(err);
				}
			});
		}, 10000);
	});
}

// bot login, keep at the end!
bot.login(token)
	.catch((errmsg) => {
		logger.error("Error logging in.\n" + errmsg);
		process.exit(1);
	});
