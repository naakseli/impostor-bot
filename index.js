"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const redis_js_1 = require("./redis.js");
const discord_js_1 = __importDefault(require("discord.js"));
const client = new discord_js_1.default.Client({ partials: ['CHANNEL', 'MESSAGE', 'REACTION'] });
const game = {
    setUserStatus: async function (status, user, sendConfirmation) {
        const clearStatus = () => {
            return new Promise(async (resolve, reject) => {
                //Remove member from all arrays
                await Promise.all([
                    redis_js_1.removeFromArray('registeredUsers', user),
                    redis_js_1.removeFromArray('unableUsers', user),
                    redis_js_1.removeFromArray('pendingUsers', user)
                ]);
                resolve();
            });
        };
        const refreshMessages = async () => {
            const messageList = await redis_js_1.getArray('gameMessages');
            messageList.forEach(async (msg) => {
                const channel = await client.channels.cache.get(msg.channelId);
                if (!channel)
                    console.log("D:");
                const message = await channel.messages.fetch(msg.messageId);
                let embed;
                if (msg.channelType === 'dm')
                    embed = await game.messages.build(message.channel.recipient.username);
                embed = await game.messages.build();
                message.edit(embed);
            });
        };
        let confirmationMessage;
        await clearStatus();
        switch (status) {
            case 'in':
                console.log(`Registering ${user.username}!`);
                await redis_js_1.addToArray('registeredUsers', user);
                confirmationMessage = 'Ilmoittauduit onnistuneesti! Kiva kun tulet pelaamaan! :heart:';
                break;
            case 'out':
                console.log(`Unregistering ${user.username}!`);
                await redis_js_1.addToArray('unableUsers', user);
                confirmationMessage = 'Harmi ettet pääse tällä kertaa! :(';
                break;
            case 'pending':
                console.log(`Setting ${user.username} pending!`);
                await redis_js_1.addToArray('pendingUsers', user);
                confirmationMessage = 'Sinut siirrettiin vastausta odottavien listalle! :thinking:';
                break;
            default:
                break;
        }
        //Confirmation message
        if (sendConfirmation)
            await user.send(confirmationMessage);
        //Refresh messages
        refreshMessages();
    },
    messages: {
        build: function (forUser) {
            return new Promise(async (resolve, reject) => {
                const buildUserStringList = (userList) => {
                    if (userList.length < 1)
                        return '-';
                    let stringList = '';
                    userList.map(user => stringList = `${stringList}\n${user.username}`);
                    return stringList;
                };
                let registeredUsers = await redis_js_1.getArray('registeredUsers');
                let unableUserss = await redis_js_1.getArray('unableUsers');
                let pendingUserss = await redis_js_1.getArray('pendingUsers');
                const playerList = buildUserStringList(registeredUsers);
                const unRegisteredList = buildUserStringList(unableUserss);
                const pendingList = buildUserStringList(pendingUserss);
                //Create base
                let newEmbed = new discord_js_1.default.MessageEmbed()
                    .setColor('#32a852')
                    .setTitle('Seuraava Among us kierros!')
                    .setURL('https://dnddoneright.netlify.app/')
                    .setDescription(await redis_js_1.getArray('timeString'))
                    .addFields({ name: '\u200B', value: '\u200B' }, {
                    name: `Ilmoittautuneet: ${registeredUsers.length}/10`,
                    value: playerList,
                }, {
                    name: `Ei pääse:`,
                    value: unRegisteredList,
                }, {
                    name: `Odotetaan: ${pendingUserss.length}`,
                    value: pendingList,
                }, { name: '\u200B', value: '\u200B' })
                    .setFooter('Ilmoittaudu clikkaamalla reaktioita:');
                //Add individual msg
                if (registeredUsers.find(user => user.username === forUser))
                    newEmbed.addField(`Sinä olet ${'ilmoittautunut!'}`, '\u200B');
                if (forUser)
                    resolve(`Seuraava Among us kierros ${this.timeString}! Ilmoittaudu reaktioilla:`);
                if (registeredUsers.length >= 10)
                    newEmbed.addField(`PELI TÄYNNÄ!`, '\u200B');
                resolve(newEmbed);
            });
        }
    }
};
client.on('message', async (msg) => {
    if (msg.author.bot || !msg.member.hasPermission('ADMINISTRATOR') || !msg.guild)
        return;
    // msg.member.roles.cache.has(roleID)
    const scheduleNewGame = async (commandMsg) => {
        await redis_js_1.clearAll();
        redis_js_1.setArray('timeString', commandMsg.content.substr(5));
        //Build invited and pending arr
        const invitedUsers = [];
        commandMsg.channel.members.map(async (member) => {
            if (member.user.bot)
                return;
            else
                invitedUsers.push(member.user);
        });
        redis_js_1.setArray('pendingUsers', invitedUsers);
        redis_js_1.setArray('invitedUsers', invitedUsers);
        //For each user is channel
        commandMsg.channel.members.forEach(async (member) => {
            if (!member.user.bot) {
                const pmMessage = await game.messages.build(member.user.username);
                //Send private message
                // const infoMessage = await member.send('Tehtiin botti helpottamaan ilmoittautumisten seuraamista Among us peleille: \n\n Peukku ylös = ilmoittautuminen peleille \n\n Peukku alas = ilmoitus ettei pääse \n\n Kysymysmerkki = Ei tietoa vielä \n\nJos on kysyttävää, niin pistä pm naakselille.')
                const newMessage = await member.send(pmMessage);
                newMessage.react('👍');
                newMessage.react('👎');
                newMessage.react('❓');
                // Delete other bot messages
                newMessage.channel.messages.fetch().then(messages => {
                    messages.forEach(msg => {
                        if (msg.author.bot && msg.id !== newMessage.id)
                            msg.delete();
                    });
                });
            }
        });
        //Delete old bot messages and command message
        const channelMessages = await commandMsg.channel.messages.fetch();
        channelMessages.forEach(channelMessage => {
            if (channelMessage.author.bot)
                channelMessage.delete();
        });
        //Create channel message
        const channelMessage = await commandMsg.reply(await game.messages.build());
        redis_js_1.addToArray('gameMessages', {
            channelType: 'text',
            channelId: channelMessage.channel.id,
            messageId: channelMessage.id
        });
        channelMessage.react('👍');
        channelMessage.react('👎');
        channelMessage.react('❓');
    };
    const registerPlayer = () => {
        //Get name
        const nameToRegister = msg.content.substr(10);
        //Create mock user
        const newUser = new discord_js_1.default.User(client, { username: nameToRegister, id: '0', bot: true });
        //Send to clear function
        // console.log(JSON.stringify(newUser))
        game.setUserStatus('in', newUser, false);
    };
    const unRegisterPlayer = () => {
        //Get name
        const nameToUnregister = msg.content.substr(12);
        //Create mock user
        const userToDelete = new discord_js_1.default.User(client, { username: nameToUnregister, id: '0', bot: true });
        //Send to clear function
        game.setUserStatus('out', userToDelete, false);
    };
    const sendMessageToRegistered = async () => {
        const messageToSend = msg.content.substr(16);
        const userList = await redis_js_1.getArray('registeredUsers');
        userList.forEach(user => {
            if (user.bot)
                return;
            let guildUser;
            let sent = false;
            client.guilds.cache.forEach(async (guild) => {
                guild = await guild.fetch();
                guildUser = await guild.members.fetch(user.id);
                if (guildUser && !sent) {
                    sent = true;
                    guildUser.send(messageToSend);
                }
            });
        });
    };
    const sendMessageToInvited = async () => {
        const messageToSend = msg.content.substr(13);
        const userList = await redis_js_1.getArray('invitedUsers');
        userList.forEach(user => {
            if (user.bot)
                return;
            let guildUser;
            let sent = false;
            client.guilds.cache.forEach(async (guild) => {
                guild = await guild.fetch();
                guildUser = await guild.members.fetch(user.id);
                if (guildUser && !sent) {
                    sent = true;
                    guildUser.send(messageToSend);
                }
            });
        });
    };
    const sendCommands = () => {
        let newEmbed = new discord_js_1.default.MessageEmbed()
            .setColor('#32a852')
            .setTitle('COMMANDS')
            .setURL('https://dnddoneright.netlify.app/')
            .addFields({
            name: `!set <insert time>`,
            value: 'Schedule new game',
        }, {
            name: `!register <insert name>`,
            value: 'Manually add name to registered players',
        }, {
            name: `!unregister <insert name>`,
            value: 'Manually remove registered player',
        }, {
            name: `!msg-registered <insert message>`,
            value: 'Send message to all registered players',
        }, {
            name: `!msg-invited <insert message>`,
            value: 'Send message to all invited players',
        }, {
            name: `!commands`,
            value: 'Print all commands',
        });
        msg.member.send(newEmbed);
    };
    if (msg.content.startsWith('!set '))
        scheduleNewGame(msg);
    else if (msg.content.startsWith('!register '))
        registerPlayer();
    else if (msg.content.startsWith('!unregister '))
        unRegisterPlayer();
    else if (msg.content.startsWith('!msg-registered '))
        sendMessageToRegistered();
    else if (msg.content.startsWith('!msg-invited '))
        sendMessageToInvited();
    else if (msg.content.startsWith('!commands'))
        sendCommands();
    if (msg.content.startsWith('!'))
        msg.delete();
});
const reactionHandler = async (reaction, user) => {
    const message = await reaction.message.fetch();
    //Check for bots own reactions
    if (user.bot || !reaction.message.author.bot)
        return;
    switch (reaction.emoji.name) {
        case '👍':
            game.setUserStatus('in', user, true);
            break;
        case '👎':
            game.setUserStatus('out', user, true);
            break;
        case '❓':
            game.setUserStatus('pending', user, true);
            break;
    }
};
//Reactions
client.on('messageReactionAdd', reactionHandler);
client.on('messageReactionRemove', reactionHandler);
client.on('ready', () => console.log(`Logged in as ${client.user.tag}!`));
client.login(process.env.BOT_TOKEN);
