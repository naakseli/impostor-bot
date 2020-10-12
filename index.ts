require('dotenv').config()

import { addToArray, getArray, setArray, removeFromArray, clearAll } from './redis.js'
import Discord from 'discord.js'
const client = new Discord.Client({ partials: ['CHANNEL', 'MESSAGE', 'REACTION'] })

const game = {
	setUserStatus: async function (
		status: 'in' | 'out' | 'pending',
		user: Discord.User,
		sendConfirmation: boolean
	) {
		const clearStatus = () => {
			return new Promise(async (resolve, reject) => {
				//Remove member from all arrays
				await Promise.all([
					removeFromArray('registeredUsers', user),
					removeFromArray('unableUsers', user),
					removeFromArray('pendingUsers', user),
				])
				resolve()
			})
		}
		const refreshMessages = async () => {
			const messageList = await getArray('gameMessages')

			messageList.forEach(async msg => {
				const channel = await client.channels.cache.get(msg.channelId)
				if (!channel) console.log('D:')
				const message = await (channel as any).messages.fetch(msg.messageId)

				let embed
				if (msg.channelType === 'dm')
					embed = await game.messages.build(message.channel.recipient.username)
				embed = await game.messages.build()

				message.edit(embed)
			})
		}

		let confirmationMessage
		await clearStatus()

		switch (status) {
			case 'in':
				console.log(`Registering ${user.username}!`)
				await addToArray('registeredUsers', user)
				confirmationMessage = 'Ilmoittauduit onnistuneesti! Kiva kun tulet pelaamaan! :heart:'
				break

			case 'out':
				console.log(`Unregistering ${user.username}!`)
				await addToArray('unableUsers', user)
				confirmationMessage = 'Harmi ettet pääse tällä kertaa! :('
				break

			case 'pending':
				console.log(`Setting ${user.username} pending!`)
				await addToArray('pendingUsers', user)
				confirmationMessage = 'Sinut siirrettiin vastausta odottavien listalle! :thinking:'
				break

			default:
				break
		}

		//Confirmation message
		if (sendConfirmation) {
			const sentConfirmation = await user.send(confirmationMessage)
			const messages = await sentConfirmation.channel.messages.fetch()

			messages.forEach(async message => {
				if (message.embeds[0] && message.embeds[0].title === 'Seuraava Among us kierros!') {
					const pmEmbed = await game.messages.build(user.username)
					message.edit(pmEmbed)
				} else if (message.id !== sentConfirmation.id && message.deletable) message.delete()
			})
		}
		//Refresh messages
		refreshMessages()
	},

	messages: {
		build: function (forUser?) {
			return new Promise(async (resolve, reject) => {
				const buildUserStringList = (userList: Discord.User[]) => {
					if (userList.length < 1) return '-'

					let stringList = ''
					userList.map(user => (stringList = `${stringList}\n${user.username}`))

					return stringList
				}

				let registeredUsers: Discord.User[] = await getArray('registeredUsers')
				let unableUserss: Discord.User[] = await getArray('unableUsers')
				let pendingUserss: Discord.User[] = await getArray('pendingUsers')

				const playerList = buildUserStringList(registeredUsers)
				const unRegisteredList = buildUserStringList(unableUserss)
				const pendingList = buildUserStringList(pendingUserss)
				const timeString = await getArray('timeString')

				//Create base
				let newEmbed = new Discord.MessageEmbed()
					.setColor('#32a852')
					.setTitle('Seuraava Among us kierros!')
					.setURL('https://dnddoneright.netlify.app/')
					.setDescription(timeString)
					.addField('\u200B', '\u200B')

				if (!forUser)
					newEmbed.addFields(
						{
							name: `Ilmoittautuneet: ${registeredUsers.length}/10`,
							value: playerList,
						},
						{
							name: `Ei pääse:`,
							value: unRegisteredList,
						},
						{
							name: `Odotetaan: ${pendingUserss.length}`,
							value: pendingList,
						},
						{ name: '\u200B', value: '\u200B' }
					)

				if (registeredUsers.find(arrUser => arrUser.username === forUser))
					newEmbed.addField('Sinä olet ilmoittautunut!', '\u200B')
				if (unableUserss.find(arrUser => arrUser.username === forUser))
					newEmbed.addField('Ilmoitit ettet pääse!', '\u200B')
				if (pendingUserss.find(arrUser => arrUser.username === forUser))
					newEmbed.addField('Sinulta odotetaan vastausta!', '\u200B')

				if (registeredUsers.length >= 10) newEmbed.addField(`PELI TÄYNNÄ!`, '\u200B')

				newEmbed.setFooter('Ilmoittaudu clikkaamalla reaktioita:')

				resolve(newEmbed)
			})
		},
	},
}

client.on('message', async (msg: Discord.Message) => {
	if (msg.author.bot || !msg.member.hasPermission('ADMINISTRATOR') || !msg.guild) return
	// msg.member.roles.cache.has(roleID)

	const scheduleNewGame = async commandMsg => {
		await clearAll()
		setArray('timeString', commandMsg.content.substr(5))

		//Build invited and pending arr
		const invitedUsers = []
		commandMsg.channel.members.map(async member => {
			if (member.user.bot) return
			else invitedUsers.push(member.user)
		})
		setArray('pendingUsers', invitedUsers)
		setArray('invitedUsers', invitedUsers)

		//For each user is channel
		commandMsg.channel.members.forEach(async member => {
			if (!member.user.bot) {
				const pmMessage = await game.messages.build(member.user.username)
				//Send private message
				const newMessage = await member.send(pmMessage)
				newMessage.edit(
					'Botti helpottamaan ilmoittautumisten seuraamista Among us peleille: \n\n Peukku ylös = ilmoittautuminen peleille \n\n Peukku alas = ilmoitus ettei pääse \n\n Kysymysmerkki = ei tietoa vielä \n\nJos on kysyttävää, niin pistä pm naakselille.'
				)

				newMessage.react('👍')!
				newMessage.react('👎')
				newMessage.react('❓')

				// Delete other bot messages
				newMessage.channel.messages.fetch().then(messages => {
					messages.forEach(msg => {
						if (msg.author.bot && msg.id !== newMessage.id) msg.delete()
					})
				})
			}
		})

		//Delete old bot messages and command message
		const channelMessages = await commandMsg.channel.messages.fetch()
		channelMessages.forEach(channelMessage => {
			if (channelMessage.author.bot) channelMessage.delete()
		})

		//Create channel message
		const channelMessage = await commandMsg.reply(await game.messages.build())
		addToArray('gameMessages', {
			channelType: 'text',
			channelId: channelMessage.channel.id,
			messageId: channelMessage.id,
		})

		channelMessage.react('👍')
		channelMessage.react('👎')
		channelMessage.react('❓')
	}

	const registerPlayer = () => {
		//Get name
		const nameToRegister = msg.content.substr(10)
		//Create mock user
		const newUser = new Discord.User(client, { username: nameToRegister, id: '0', bot: true })
		//Send to clear function
		// console.log(JSON.stringify(newUser))
		game.setUserStatus('in', newUser, false)
	}

	const unRegisterPlayer = () => {
		//Get name
		const nameToUnregister = msg.content.substr(12)
		//Create mock user
		const userToDelete = new Discord.User(client, {
			username: nameToUnregister,
			id: '0',
			bot: true,
		})
		//Send to clear function
		game.setUserStatus('out', userToDelete, false)
	}

	const sendMessageToRegistered = async () => {
		const messageToSend = msg.content.substr(16)

		const userList = await getArray('registeredUsers')
		userList.forEach(user => {
			if (user.bot) return
			let guildUser
			let sent = false

			client.guilds.cache.forEach(async guild => {
				guild = await guild.fetch()
				guildUser = await guild.members.fetch(user.id)
				if (guildUser && !sent) {
					sent = true
					guildUser.send(messageToSend)
				}
			})
		})
	}

	const sendMessageToInvited = async () => {
		const messageToSend = msg.content.substr(13)
		const userList = await getArray('invitedUsers')

		userList.forEach(user => {
			if (user.bot) return
			let guildUser
			let sent = false

			client.guilds.cache.forEach(async guild => {
				guild = await guild.fetch()
				guildUser = await guild.members.fetch(user.id)
				if (guildUser && !sent) {
					sent = true
					guildUser.send(messageToSend)
				}
			})
		})
	}

	const sendCommands = () => {
		let newEmbed = new Discord.MessageEmbed()
			.setColor('#32a852')
			.setTitle('COMMANDS')
			.setURL('https://dnddoneright.netlify.app/')
			.addFields(
				{
					name: `!set <insert time>`,
					value: 'Schedule new game',
				},
				{
					name: `!register <insert name>`,
					value: 'Manually add name to registered players',
				},
				{
					name: `!unregister <insert name>`,
					value: 'Manually remove registered player',
				},
				{
					name: `!msg-registered <insert message>`,
					value: 'Send message to all registered players',
				},
				{
					name: `!msg-invited <insert message>`,
					value: 'Send message to all invited players',
				},
				{
					name: `!commands`,
					value: 'Print all commands',
				}
			)

		msg.member.send(newEmbed)
	}

	if (msg.content.startsWith('!set ')) scheduleNewGame(msg)
	else if (msg.content.startsWith('!register ')) registerPlayer()
	else if (msg.content.startsWith('!unregister ')) unRegisterPlayer()
	else if (msg.content.startsWith('!msg-registered ')) sendMessageToRegistered()
	else if (msg.content.startsWith('!msg-invited ')) sendMessageToInvited()
	else if (msg.content.startsWith('!commands')) sendCommands()

	if (msg.content.startsWith('!')) msg.delete()
})

const reactionHandler = async (reaction: Discord.MessageReaction, user: Discord.User) => {
	const message = await reaction.message.fetch()
	//Check for bots own reactions
	if (user.bot || !reaction.message.author.bot) return

	switch (reaction.emoji.name) {
		case '👍':
			game.setUserStatus('in', user, true)
			break

		case '👎':
			game.setUserStatus('out', user, true)
			break

		case '❓':
			game.setUserStatus('pending', user, true)
			break
	}
}

//Reactions
client.on('messageReactionAdd', reactionHandler)
client.on('messageReactionRemove', reactionHandler)

client.on('ready', () => console.log(`Logged in as ${client.user.tag}!`))

client.login(process.env.BOT_TOKEN)
