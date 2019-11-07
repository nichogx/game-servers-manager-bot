# Multiplayer Game Servers Manager Bot for Discord

## What is this?
This is a Discord bot that can start your AWS EC2 instance, wait for your game server to finish starting and then send a Discord message with the IP.
It also checks the number of players every 15 minutes (configurable), and if the server is empty, stops it and shuts down the EC2 instance.

## Features
- can start your EC2 instance + game server (if configured via crontab)
- supports changing IPs (no need to assign a static IP to your instance)
- auto-closes the game server if no one is online
- stats command to check IP and online players without opening the game
- stop server and shutdown instance via Discord
- modpack command which will reply with the modpack download link (optional)
- manage *multiple servers*! Multiple instances, multiple games, and multiple servers of the same game! You can even setup which members of your server can manage each server!

## Commands
All commands are used like: `@bot <command> [servername]`
#### help
Bot will reply with a list of commands and servers configured

#### modpack
Bot will reply with the modpack download link

Aliases: pack, link
#### open
Will start your EC2 instance, wait for the game server to start and then send the IP to chat.

If the instance is already started, it will wait for the game server to start and then send the IP to chat. If the server is already open it will only send the IP.

Aliases: start
#### stop
Will stop your game server and shutdown your EC2 instance, *but only if the server is empty*
#### stats
Will reply with the number of online players, the maximum players (if the game supports it), the names of all online players and the server IP.


## How to use?
1 - Create your AWS EC2 instance

2 - Install your supported server (see [supported games](#supported-games))

3 - Add an entry to your @reboot crontab to open the server in a screen or tmux session on reboot

4 - Configure the bot and host it somewhere else. To configure, you have to edit config.json and set the required environmental variables. You can either copy .env.example to .env and set them there or use your hosting service's service. The list of environmental variables you have to set are in the .env.example file:
- `TOKEN` - your Discord bot token
- `AWS_ACCESS_KEY_ID` - your iam (recommended) or root user (not recommended) access key
- `AWS_SECRET_ACCESS_KEY` - your iam (recommended) or root user (not recommended) secret access key

## Supported Games
This bot started out as a Minecraft-only server management bot. It was refactored to permit easy additions of new games. See [Contributing and Translating](#contributing-and-translating) or open a [GitHub Issue](https://github.com/nichogx/game-servers-manager-bot/issues) if you are interested in having your favorite game supported by the manager! 

For the moment, the only supported game is Minecraft.

See [planned features](#planned-features) for a list of planned games.

## Can you do/fix X?
I can certainly try my best.

Open a [GitHub Issue](https://github.com/nichogx/game-servers-manager-bot/issues) with your suggestion or bug report :)

## Contributing and Translating
Yay for open source development!
To contribute, just open a pull request and I will review!

The files for translating are in the languages folder. Just copy the english.json file and change it into your language. Thank you! :D

## Planned features
- maybe use RCON instead of SSH to send /stop command to minecraft server
- add support for ARK: Survival Evolved

## Known bugs and issues
- the help command does not send the command list. This is a TODO because it will require refactoring the way commands are handled in order to do properly.