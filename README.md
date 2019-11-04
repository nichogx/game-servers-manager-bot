# Minecraft Server Manager Bot for Discord

## What is this?
This is a Discord bot that can start your AWS EC2 instance, wait for your Minecraft server to finish starting and then send a Discord message with the IP.
It also checks the number of players every 15 minutes, and if the server is empty, stops it and shuts down the EC2 instance.

## Features
- can start your EC2 instance + minecraft server
- supports changing IPs (no need to assign a static IP to your instance)
- auto-closes the minecraft server if no one is online
- stats command to check IP and online players without opening minecraft
- stop server and shutdown instance via Discord
- modpack command which will reply with the modpack download link

## Commands
All commands are used like: @bot /command/
#### modpack
Bot will reply with the modpack download link

Aliases: pack, link
#### open
Will start your EC2 instance, wait for the Minecraft server to start and then send the IP to chat.

If the instance is already started, it will wait for the Minecraft server to start and then send the IP to chat. If the Minecraft server is already open it will only send the IP.

Aliases: start
#### stop
Will stop your Minecraft server and shutdown your EC2 instance, *but only if the server is empty*
#### stats
Will reply with the number of online players, the maximum players, the names of all online players and the server IP.


## How to use?
1 - Create your AWS EC2 instance

2 - Install your Minecraft/Forge/Bukkit server or equivalent

3 - Add enable-query=true to your server.properties file

4 - Add an entry to your @reboot crontab to open the server in a screen or tmux session on reboot

5 - Configure the bot and host it somewhere else

## Can you do X?
I can certainly consider it. 

Open a (GitHub Issue)[https://github.com/nichogx/minecraft-server-manager-bot/issues] with your suggestion or bug report :)

## Planned features
- use RCON instead of SSH to send /stop command to server

## Known bugs
None ATM.