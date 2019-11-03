// config environment
const dotenv = require('dotenv');
dotenv.config();

const winston = require('winston');
const Discord = require('discord.js');
const mc = require('minecraft-protocol');
const AWS = require("aws-sdk");
const ssh = require('ssh-exec');
const cfgs = require('./config.json');
const pjson = require('./package.json');
const strings = require('./languages/' + cfgs.language + '.json');

// configures logger
const logger = winston.createLogger({
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
const token = process.env.TOKEN;
if (!token) {
	logger.error(strings.log.token_error);
	process.exit(1);
}

// configures AWS
AWS.config.update({ region: "us-east-1" });
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });;

const bot = new Discord.Client();
bot.commands = new Discord.Collection();

bot.on("ready", () => {
	logger.info(strings.log.connected);
	logger.info(strings.log.loggedin
		.replace('<user>', bot.user.tag)
	);

	bot.user.setActivity(pjson.description + " v" + pjson.version);

	// reset activity once every half hour (sometimes it weirds out)
	setInterval(() => bot.user.setActivity(pjson.description + " v" + pjson.version), 1800000);

	// once every 15 minutes, check if server is empty
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
	const fullcmd = message.content.split(' ').filter(el => el !== '');
	let cmd = fullcmd[1];
	const args = fullcmd.slice(2);

	let hasPermission = false;

	for (let role of cfgs.permitted_roles) {
		let permRole = message.guild.roles.find(val => val.name === role);
		if (permRole && message.member.roles.has(permRole.id)) {
			hasPermission = true;
			break;
		}
	}

	if (!hasPermission) return;

	if (cmd === "open" || cmd === "start") {
		const instanceIDparam = { InstanceIds: [process.env.AWS_INSTANCEID] };

		ec2.describeInstances(instanceIDparam, (err, data) => {
			if (err || !data.Reservations.length > 0 || !data.Reservations[0].Instances.length > 0) {
				logger.error(err ? err : "reservation length or instances length is zero");
				message.channel.send(strings.messages.error_describing);
			} else {
				const instance = data.Reservations[0].Instances[0];
				if (instance.State.Code === 16) { // code 16: running
					// instance is running
					message.channel.send(strings.messages.instance_started_waiting_server).then(msg => {
						notifyMinecraftStarting(msg, instance.PublicIpAddress);
					});
				} else if (instance.State.Code === 80) { // code 80: stopped
					ec2.startInstances(instanceIDparam, (err, data) => {
						if (err) {
							logger.error(err);
							message.channel.send(strings.messages.error_starting);
						} else {
							message.channel.send(strings.messages.instance_starting).then(msg => {
								notifyInstanceStarting(msg);
							});
						}
					});
				} else {
					// other state
					message.channel.send(strings.messages.please_wait_instance_state);
				}
			}

		});
	} else if (cmd === "stop") {
		const playerCount = 0;

		if (playerCount !== 0) {
			// TODO send msg people in the server
		} else {
			// TODO stop minecraft server
			// TODO shutdown aws server
		}
	} else if (cmd === "stats") {
		// TODO get stats from minecraft & send msg
	}
});

bot.on("messageReactionAdd", async (reaction, user) => {
	if (reaction.message == contestMsg && contestState === "setup" && reaction.emoji.name === "🔫") {
		let member = bot.guilds.first().member(user);
		let hasPermission = false;

		for (let role of cfgs.permitted_roles) {
			let permRole = reaction.message.guild.roles.find(val => val.name === role);
			if (permRole && member.roles.has(permRole.id)) {
				hasPermission = true;
				break;
			}
		}

		if (hasPermission) {
			let srchRole = reaction.message.guild.roles.find(val => val.name === cfgs.role_contestant);
			member.addRole(srchRole).then(() => {
				reaction.message.edit(strings.messages.new_br.replace("<playercount>", srchRole.members.size).replace('<channel>', `<#${cfgs.channel_battle}>`));
			});
		}
	}
});

function notifyInstanceStarting(statusMessage) {
	const instanceIDparam = { InstanceIds: [process.env.AWS_INSTANCEID] };
	ec2.describeInstances(instanceIDparam, (err, data) => {
		if (err || !data.Reservations.length > 0 || !data.Reservations[0].Instances.length > 0) {
			logger.error(err ? err : "reservation length or instances length is zero in notifyInstanceStarting");
			message.channel.send(strings.messages.error_describing);
		} else {
			const instance = data.Reservations[0].Instances[0];
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
				message.channel.send(strings.messages.please_wait_instance_state + " in notifyInstanceStarting");
			}
		}
	});
}

function notifyMinecraftStarting(statusMessage, ip) {
	mc.ping({ host: ip, port: cfgs.gameport }, (err, result) => {
		if (err) {
			logger.verbose("server still opening, checking again in 20 seconds: " + err.code);
			notifyMinecraftStarting(statusMessage, ip);
		} else {
			logger.verbose("server opened!");
			statusMessage.edit(strings.messages.server_opened + " " + ip + ":" + cfgs.gameport);
		}
	});
}

function checkShouldClose() {
	logger.verbose("checking if server should be closed");
	const instanceIDparam = { InstanceIds: [process.env.AWS_INSTANCEID] };
	ec2.describeInstances(instanceIDparam, (err, data) => {
		if (err || !data.Reservations.length > 0 || !data.Reservations[0].Instances.length > 0) {
			logger.error(err ? err : "reservation length or instances length is zero in checkShouldClose");
		} else {
			const instance = data.Reservations[0].Instances[0];
			if (instance.State.Code === 16) { // code 16: running
				// instance is running
				mc.ping({ host: instance.PublicIpAddress, port: cfgs.gameport }, (err, result) => {
					if (!err) {
						if (result.players.online === 0) {
							logger.info("server should be closed");
							closeServer(instance.PublicIpAddress);
						} else {
							logger.verbose("server should not be closed");
						}
					}
				});
			}
		}
	});
}

function closeServer(ip) {
	logger.info("sending stop command");
	ssh("/home/ubuntu/closegalerepack.sh", {
		user: process.env.SSH_USER,
		host: ip,
		key: process.env.SSH_KEY_PATH
	}, () => {
		logger.info("shutting down server in 10 seconds");
		setTimeout(() => {
			// TODO shut down server
		}, 10000);
	});
}

// bot login, keep at the end!
bot.login(token)
	.catch((errmsg) => {
		logger.error("Error logging in.\n" + errmsg);
		process.exit(1);
	});
