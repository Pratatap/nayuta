const Discord = require("discord.js");
const newUsers = new Discord.Collection();
// Maps User IDs to the Guild IDs that they are trying to register on
const activeRegistrations = new Discord.Collection();
const client = new Discord.Client();
const config = require("./config.json");
const applicationLink = "https://cdn.discordapp.com/attachments/372939068453027842/373264182486892545/SIGNUP_SHEET.jpg"
const fs = require("fs")
const https = require("https")
// A list of saved info for servers this bot is on
// Maps GuildID -> { applicationLink: String, applicationPostChannel: ChannelID, lurkerRole: RoleID, servantRole: RoleID }
const serverInfoList = fs.existsSync("./serverInfo.json") ? require("./serverInfo.json") : {};
// A list of commands
const commands = {};

// Writes updated server info to the serverInfo.json file
// Call after updating serverInfo
function writeServerInfo() {
	fs.writeFile("./serverInfo.json", JSON.stringify(serverInfoList), console.error);
}

/// Register a command
/// - parameter name: The name of the command
/// - parameter permissions: The permissions required to use the command, options are "botOwner", "admin", and "anyone"
/// - parameter func: The function to run if the command is triggered, will be run with (message, args)
function registerCommand(name, permissions, func) {
	const allowedPermissionTypes = {"botOwner": true, "admin": true, "anyone": true}
	if (typeof func !== "function") {
		throw `Failed to register command, ${func} is not a function`
	}
	if (allowedPermissionTypes[permissions] !== true) {
		throw `Failed to register command, ${permissions} is not a valid permission type`
	}
	commands[name.toLowerCase()] = { "permissions": permissions, "func": func }
}

/// Get the info for a server if it's properly configured or null if not
/// - parameter id: The id of the server
/// - returns: Either a serverInfo entry or null if the server isn't fully configured
function getConfiguredServer(id) {
	let server = serverInfoList[id];
	if (!server) { return null; }
	if (server.applicationPostChannel && server.lurkerRole && server.servantRole) {
		return {
			"applicationLink": server.applicationLink || applicationLink,
			"applicationPostChannel": server.applicationPostChannel,
			"lurkerRole": server.lurkerRole,
			"servantRole": server.servantRole
		}
	}
	return null
}

/// Verifies that an application image is similar to the base image (and isn't some completely unrelated image)
/// Currently unimplemented and always returns true
/// - parameter server: The serverInfo object this image is for (in case their image isn't the default)
/// - parameter image: The image to verify
/// - returns: Whether or not the image is similar enough to the base image
function verifyApplicationImage(server, image) {
	return true;
}

function getID(string) {
	let result = /(\d+)/.exec(string);
	if (!result) {
		return null;
	}
	// Filters out most names that start with a number while only
	// filtering out the first month of snowflakes
	// Since Discord wasn't launched until March of the year,
	// you'd have to have a user made before its release to be filtered
	// 1000 ms/s * 60 s/m * 60 m/h * 24 h/d * 30 d/M * 2 ** 22 snowflake date offset
	if (result[1] > (1000 * 60 * 60 * 24 * 30 * 2 ** 22)) {
		return result[1]
	}
}

function findInCollection(collection, string) {
	let id = getID(string);
	if (id) {
		let channel = collection.get(id);
		return channel;
	}
	let found = collection.find((channel) => channel.name.toLowerCase() === string.toLowerCase());
	if (found) {
		return found;
	}
	let allFound = collection.filter((channel) => channel.name.toLowerCase().indexOf(string.toLowerCase()) !== -1 );
	if (allFound.size === 1) {
		return allFound.first();
	}
	return null;
}

client.on("ready", () => {
	console.log(`Bot has started, with ${client.users.size} users, in ${client.channels.size} channels of ${client.guilds.size} guilds.`); 
client.user.setGame(`with ${client.users.size} users in ${client.guilds.size} servers! | ${config.prefix}help`);
});

client.on("guildCreate", guild => {
	// This event triggers when the bot joins a guild.
	console.log(`New guild joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members!`);
	client.user.setGame(`on ${client.guilds.size} servers`);
});

client.on("guildDelete", guild => {
	// this event triggers when the bot is removed from a guild.
	console.log(`I have been removed from: ${guild.name} (id: ${guild.id})`);
	client.user.setGame(`on ${client.guilds.size} servers`);
});

//This is to detect and greet new members
client.on("guildMemberAdd", (member) => {
	if (getConfiguredServer(member.guild.id)) {
		member.send(`Welcome to **${guild.name}**, ${member.user.username}! Please type **${config.prefix}register** to begin with the verification process.`);
		activeRegistrations.set(member.id, member.guild.id);
	}
});

//To prevent the bot from greeting a non-existant user when they leave
client.on("guildMemberRemove", (member) => {
	const guild = member.guild;
	if (newUsers.get(guild.id) && newUsers.get(guild.id).has(member.id)) { newUsers.delete(member.id); }
});

// This loop reads the /events/ folder and attaches each event file to the appropriate event.
fs.readdir("./events/", (err, files) => {
	if (err) return console.error(err);
	files.forEach(file => {
		let eventFunction = require(`./events/${file}`);
		let eventName = file.split(".")[0];

		client.on(eventName, (...args) => eventFunction.run(client, ...args));
	});
});

client.on("message", message => {
	if (message.author.bot) return;

	// For responding to submissions of the cult application
	if (message.channel instanceof Discord.DMChannel && message.attachments.size > 0) {
		console.log("Got cult application!");
		cultApplicationCommand(message);
		return;
	}

	if (message.content.indexOf(config.prefix) !== 0) return;

	// Defining Args
	const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
	const command = args.shift().toLowerCase();
	
	if (commands[command]) {
		if (commands[command].permissions === "botOwner" && message.author.id !== config.ownerID) {
			console.log(`Rejected permission for ${message.author.id} ${message.author.username} to use ${command}`)
			return;
		}
		else if (commands[command].permissions === "admin") {
			let guild = message.guild;
			if (!guild || !guild.members.get(message.author.id)) {
				console.log(`Rejected permission for ${message.author.id} ${message.author.username} to use ${command}`);
				return;
			}
			let member = guild.members.get(message.author.id)
			if (!member.hasPermission("MANAGE_GUILD")) {
				console.log(`Rejected permission for ${message.author.id} ${message.author.username} to use ${command}`);
				return;
			}
		}
		commands[command].func(message, args)
	}
});

function cultApplicationCommand(message) {
	let attachment = message.attachments.first();
	https.get(attachment.url, (response) => {
		let data = [];
		response.on("data", (buffer) => data.push(buffer))
		.on("end", () => {
			let buffer = Buffer.concat(data);
			let guildID = activeRegistrations.get(message.author.id);
			if (!guildID) {
				message.channel.send(`Please use ${config.prefix}register in a server first.`);
				return;
			}
			let guild = client.guilds.get(guildID);
			if (!guild) {
				console.error(`Failed to get guild for id ${guildID}`);
				return;
			}
			let serverInfo = getConfiguredServer(guildID);
			if (!serverInfo || !client.channels.get(serverInfo.applicationPostChannel)) {
				message.channel.send(`The server configuration for ${guild.name} appears to be messed up.  Please contact ${guild.owner.name}.`);
				return;
			}
			let member = guild.members.get(message.author.id);
			if (!member) {
				message.channel.send(`You appear to have left ${guild.name}.  You must rejoin before using this command.`);
				return;
			}
			if (!verifyApplicationImage(serverInfo, buffer)) {
				message.channel.send(`Your image doesn't appear to be a registration form.`)
				return;
			}
			client.channels.get(serverInfo.applicationPostChannel).send(`<@${message.author.id}>'s Application`, new Discord.Attachment(buffer, attachment.filename))
			.then(() => {
				member.addRole(serverInfo.lurkerRole)
				.then(() => {
					member.addRole(serverInfo.servantRole)
					.then(() => {
						activeRegistrations.delete(message.author.id);
						message.channel.send(`You have successfully been successfully registered at ${guild.name}`);
					});
				});
			});
		});
	});
}

registerCommand("test", "anyone", (message, args) => {
	message.channel.send("Working as intended");
});

registerCommand("prefix", "botOwner", (message, args) => {
	let newPrefix = message.content.split(" ").slice(1, 2)[0];

	config.prefix = newPrefix;

	fs.writeFile("./config.json", JSON.stringify(config), (err) => console.error);
});

registerCommand("say", "anyone", (message, args) => {
	let text = args.slice(0).join(" ");
	message.delete();
	message.channel.send(text);
});

registerCommand("ping", "anyone", (message, args) => {
	message.channel.send("Pong!")
		.then(newMessage => {
			newMessage.edit(`Pong!  Took **${newMessage.createdTimestamp - message.createdTimestamp}ms**.  API Latency is **${Math.round(client.ping)}ms**`);
		});
});

registerCommand("register", "anyone", (message, args) => {
	let server = message.guild;
	if (message.channel instanceof Discord.DMChannel) {
		server = client.guilds.get(activeRegistrations.get(message.author.id));
	}
	if (!server || !serverInfoList[server.id] ) { return; }
	let serverInfo = getConfiguredServer(server.id);
	if (!serverInfo) { return; }
	let member = server.members.get(message.author.id);
	// Do nothing if they already have the lurker and servant roles
	if (member && member.roles.get(serverInfo.lurkerRole) && member.roles.get(serverInfo.servantRole)) { return; }

	activeRegistrations.set(message.author.id, server.id)

	if (!(message.channel instanceof Discord.DMChannel)) {
		message.channel.send("Please check your DMs to complete the verification process.");
	}

	let embed = new Discord.RichEmbed()
		.setDescription(`Verification process for ${server.name} initiated!  Please either respond with \`${config.prefix}lurker\` or with a filled out copy of the following form.`)
		.setImage(serverInfo.applicationLink)

	message.author.send("", embed);
});

registerCommand("lurker", "anyone", (message, args) => {
	// This command is only available in DMs
	if (!(message.channel instanceof Discord.DMChannel)) { return; }
	let guildID = activeRegistrations.get(message.author.id);
	if (!guildID) {
		message.channel.send(`Please use ${config.prefix}register in a server first.`);
		return;
	}
	let guild = client.guilds.get(guildID);
	if (!guild) {
		console.error(`Failed to get guild for id ${guildID}`);
		return;
	}
	let serverInfo = getConfiguredServer(guildID);
	if (!serverInfo) {
		message.channel.send(`The server configuration for ${guild.name} appears to be messed up.  Please contact ${guild.owner.name}.`);
		return;
	}
	let member = guild.members.get(message.author.id);
	if (!member) {
		message.channel.send(`You appear to have left ${guild.name}.  You must rejoin before using this command.`);
		return;
	}
	member.addRole(serverInfo.lurkerRole)
		.then((member) => {
			message.channel.send(`You have successfully been successfully registered at ${guild.name}`);
			activeRegistrations.delete(message.author.id);
		})
		.catch((error) => {
			message.channel.send(`Something went wrong registering you at ${guild.name}`);
			console.error(error);
		});
});

registerCommand("setapplicationchannel", "admin", (message, args) => {
	let guild = message.guild;
	if (!guild) {
		console.error("Wasn't in a guild to perform SetApplicationChannel!")
		return;
	}
	let channel = findInCollection(guild.channels, args[0]);
	if (!channel) {
		message.channel.send(`❎ | Failed to find channel ${args[0]}`)
		return;
	}
	if (!serverInfoList[guild.id]) {
		serverInfoList[guild.id] = {};
	}
	serverInfoList[guild.id].applicationPostChannel = channel.id;
	message.channel.send(`✅ | Successfully bound <#${channel.id}> as the application post channel!`);
	writeServerInfo();
});

registerCommand("setlurkerrole", "admin", (message, args) => {
	let guild = message.guild;
	if (!guild) {
		console.error("Wasn't in a guild to perform SetApplicationChannel!")
		return;
	}
	let role = findInCollection(guild.roles, args[0]);
	if (!role) {
		message.channel.send(`❎ | Failed to find role ${args[0]}`)
		return;
	}
	if (!serverInfoList[guild.id]) {
		serverInfoList[guild.id] = {};
	}
	serverInfoList[guild.id].lurkerRole = role.id;
	message.channel.send(`✅ | Successfully set ${role.name} as the lurker role!`);
	writeServerInfo();
});

registerCommand("setservantrole", "admin", (message, args) => {
	let guild = message.guild;
	if (!guild) {
		console.error("Wasn't in a guild to perform SetApplicationChannel!")
		return;
	}
	let role = findInCollection(guild.roles, args[0]);
	if (!role) {
		message.channel.send(`❎ | Failed to find role ${args[0]}`)
		return;
	}
	if (!serverInfoList[guild.id]) {
		serverInfoList[guild.id] = {};
	}
	serverInfoList[guild.id].servantRole = role.id;
	message.channel.send(`✅ | Successfully set ${role.name} as the servant role!`);
	writeServerInfo();
});

registerCommand("help", "anyone", (message, args) => {
	message.channel.send([
		`**${client.user.username} Help** (prefix: **${config.prefix}**)`,
		"",
		"**__Basic Commands__**",
		"",
		"**say:** Have me say something, I'll also remove your command",
		"**ping:** Check my ping",
		"**register:** Start registration process, only works if the server owner has set up the application channel and associated roles",
		"",
		"**__Server Admins Only__**",
		"",
		"**SetApplicationChannel:** Set the channel submitted applications go in",
		"**SetLurkerRole:** Set the role to give to everyone who registers",
		"**SetServantRole:** Set the role to give to people who fill out the application"
	].join("\n"))
});

registerCommand("eval", "botOwner", (message, args) => {
	function clean(text) {
		if (typeof(text) === "string") {
			return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203));
		}
		else {
			return text;
		}
	}
	try {
		const code = args.join(" ");
		let evaled = eval(code);

		if (typeof evaled !== "string") {
			evaled = require("util").inspect(evaled);
		}

		message.channel.send(clean(evaled), {code:"xl"});
	} catch (err) {
		message.channel.send(`\`ERROR\` \`\`\`xl\n${clean(err)}\n\`\`\``);
	}
});

client.login(config.token);
