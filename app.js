"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const sqlite3_1 = __importDefault(require("sqlite3"));
const dotenv_1 = __importDefault(require("dotenv"));
const config_json_1 = require("./config.json");
sqlite3_1.default.verbose();
dotenv_1.default.config();
const token = process.env.TOKEN;
//? Hardcoded for dev purposes
const nameSuggestions = {
    beginning: ['Cool', 'Hot', 'Steamy', 'Awesome', 'Dank', 'Dark', 'Deep', 'Shiny', 'Haunted', 'Intense'],
    middle: ['discussion', 'chill', 'grill', 'study', 'programming', 'gaming', 'text', 'bot', 'wrestling'],
    end: ['zone', 'place', 'room', 'space', 'world', 'realm', 'dimension', 'area', 'portal', 'hangout']
};
const emojiSuggestions = ['🌌', '😂', '👽', '🎅', '👑', '🥋', '🎮', '🎲', '🎨', '🎬', '🎤', '🎸', '🎹', '🎻', '🎺', '🎼', '🎵', '🎶', '🎧', '🎙️', '🎚️', '🎛️', '🎞️', '📽️', '📺', '📷', '📸', '📹', '📼', '🔍', '🔎', '🔬', '🔭', '📡', '🕯️', '💡', '🔦', '🏮', '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📓', '📒', '📃', '📜', '📄', '📰', '🗞️', '📑', '🔖', '🏷️', '💰', '💴', '💵', '💶', '💷', '💸', '💳', '🧾', '💹', '💱', '💲', '✉️', '📧', '📨', '📩', '📤', '📥', '📦', '📫', '📪', '📬', '📭', '📮', '🗳️', '✏️', '✒️', '🖋️', '🖊️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '📅', '📆', '🗒️', '🗓️', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '🖇️', '📏', '📐'];
// Config
const portalIntro = {
    portal: "**Welcome to the setup!** Select which Portal you want this channel to be connected to.",
    confirm: `**Do you want to join this Portal?** You can always leave using \`${config_json_1.prefix}leave\`.`
};
// Database
const db = new sqlite3_1.default.Database('./db.sqlite', err => {
    if (err)
        console.error(err);
    else
        console.log('Connected to database.');
});
process.on('exit', () => {
    db.close();
});
// Create tables
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS portals (id TEXT PRIMARY KEY, name TEXT, emoji TEXT, customEmoji INTEGER DEFAULT 0)');
    db.run('CREATE TABLE IF NOT EXISTS portalConnections (portalId TEXT, guildId TEXT, guildName TEXT, channelId TEXT, channelName TEXT, webhookId TEXT, webhookToken TEXT, FOREIGN KEY(portalId) REFERENCES portals(id))');
});
// Create default portal if none exists
db.get('SELECT * FROM portals', (err, row) => {
    if (err)
        console.error(err);
    else if (!row) {
        db.run('INSERT INTO portals (id, name, emoji, customEmoji) VALUES (?, ?, ?, ?)', ['123456', 'Genesis', '🎆', false], err => {
            if (err)
                console.error(err);
            else
                console.log('Created default Portal.');
        });
    }
});
// Helpers
const sendExpired = (interaction) => { if (interaction.isRepliable())
    interaction.reply({ content: 'Expired.', ephemeral: true }); };
const generateName = () => `${nameSuggestions.beginning[Math.floor(Math.random() * nameSuggestions.beginning.length)]} ${nameSuggestions.middle[Math.floor(Math.random() * nameSuggestions.middle.length)]} ${nameSuggestions.end[Math.floor(Math.random() * nameSuggestions.end.length)]}`;
const generateEmoji = () => emojiSuggestions[Math.floor(Math.random() * emojiSuggestions.length)];
const generatePortalId = () => __awaiter(void 0, void 0, void 0, function* () {
    let id = Math.floor(Math.random() * 1000000).toString();
    const portals = yield getPortals();
    while (portals[id])
        id = Math.floor(Math.random() * 1000000).toString();
    return id;
});
const createWebhook = (channel) => __awaiter(void 0, void 0, void 0, function* () {
    const webhook = yield channel.createWebhook({ name: 'Portal connection', reason: 'New Portal connection established' }); //TODO: Add avatar
    return webhook;
});
const createPortal = (name, emoji, customEmoji) => __awaiter(void 0, void 0, void 0, function* () {
    const portalId = yield generatePortalId();
    db.run('INSERT INTO portals (id, name, emoji, customEmoji) VALUES (?, ?, ?, ?)', [portalId, name, emoji, customEmoji]);
    return { id: portalId, name, emoji, customEmoji };
});
const deletePortal = (portalId) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        db.serialize(() => __awaiter(void 0, void 0, void 0, function* () {
            const portal = yield getPortal(portalId);
            if (portal) {
                db.run('DELETE FROM portals WHERE id = ?', [portalId]);
                db.run('DELETE FROM portalConnections WHERE portalId = ?', [portalId]);
                resolve(portal);
            }
            else
                resolve(null);
        }));
    });
});
const getPortal = (portalId) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM portals WHERE id = ?', [portalId], (err, row) => {
            if (err)
                reject(err);
            else {
                if (row)
                    resolve({ id: row.id, name: row.name, emoji: row.emoji, customEmoji: row.customEmoji });
                else
                    resolve(null);
            }
        });
    });
});
const getPortals = () => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM portals', (err, rows) => {
            if (err)
                reject(err);
            else {
                const portals = new Map();
                rows.forEach(row => {
                    portals.set(row.id, { id: row.id, name: row.name, emoji: row.emoji, customEmoji: row.customEmoji });
                });
                resolve(portals);
            }
        });
    });
});
const createPortalConnection = (portalId, channelId) => __awaiter(void 0, void 0, void 0, function* () {
    const channel = yield client.channels.fetch(channelId);
    const webhook = yield createWebhook(channel);
    return new Promise((resolve, reject) => {
        db.serialize(() => __awaiter(void 0, void 0, void 0, function* () {
            db.run('INSERT INTO portalConnections (portalId, guildId, guildName, channelId, channelName, webhookId, webhookToken) VALUES (?, ?, ?, ?, ?, ?, ?)', [portalId, channel.guildId, channel.guild.name, channelId, channel.name, webhook.id, webhook.token]);
            const portalConnection = yield getChannelPortalConnection(channelId);
            if (portalConnection)
                resolve(portalConnection);
            else
                reject('Could not find connection in database.');
        }));
    });
});
const deletePortalConnection = (channelId) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        db.serialize(() => __awaiter(void 0, void 0, void 0, function* () {
            db.get('SELECT * FROM portalConnections WHERE channelId = ?', [channelId], (err, row) => __awaiter(void 0, void 0, void 0, function* () {
                if (err)
                    reject(err);
                else {
                    if (row) {
                        const portalConnection = { portalId: row.portalId, guildId: row.guildId, guildName: row.guildName, channelId: row.channelId, channelName: row.channelName, webhookId: row.webhookId, webhookToken: row.webhookToken };
                        const channel = yield client.channels.fetch(channelId);
                        const webhook = (yield channel.fetchWebhooks()).find(webhook => webhook.id === row.webhookId);
                        if (webhook)
                            yield webhook.delete();
                        db.run('DELETE FROM portalConnections WHERE channelId = ?', [channelId]);
                        resolve(portalConnection);
                    }
                    else
                        resolve(null);
                }
            }));
        }));
    });
});
const getGuildPortalConnections = (guildId) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM portalConnections WHERE guildId = ?', [guildId], (err, rows) => {
            if (err)
                reject(err);
            else {
                const portalConnections = new Array();
                rows.forEach(row => {
                    portalConnections.push({ portalId: row.portalId, guildId: row.guildId, guildName: row.guildName, channelId: row.channelId, channelName: row.channelName, webhookId: row.webhookId, webhookToken: row.webhookToken });
                });
                resolve(portalConnections);
            }
        });
    });
});
const getChannelPortalConnection = (channelId) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM portalConnections WHERE channelId = ?', [channelId], (err, row) => {
            if (err)
                reject(err);
            else {
                if (row)
                    resolve({ portalId: row.portalId, guildId: row.guildId, guildName: row.guildName, channelId: row.channelId, channelName: row.channelName, webhookId: row.webhookId, webhookToken: row.webhookToken });
                else
                    resolve(null);
            }
        });
    });
});
const getPortalConnections = (portalId) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM portalConnections WHERE portalId = ?', [portalId], (err, rows) => {
            if (err)
                reject(err);
            else {
                const connections = [];
                rows.forEach(row => {
                    connections.push({ portalId: row.portalId, guildId: row.guildId, guildName: row.guildName, channelId: row.channelId, channelName: row.channelName, webhookId: row.webhookId, webhookToken: row.webhookToken });
                });
                resolve(connections);
            }
        });
    });
});
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMessages, discord_js_1.GatewayIntentBits.MessageContent, discord_js_1.GatewayIntentBits.GuildMessageReactions] });
// Keep track of setups
const connectionSetups = new Map();
const portalSetups = new Map();
client.once(discord_js_1.Events.ClientReady, c => {
    var _a;
    console.log(`Ready! Logged in as ${(_a = c.user) === null || _a === void 0 ? void 0 : _a.tag}`);
});
client.on(discord_js_1.Events.MessageCreate, (message) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Ignore if webhook or self
    if (message.webhookId || message.author.equals(message.client.user))
        return;
    // Ignore if DM
    if (!message.guildId)
        return;
    if (message.content.startsWith(config_json_1.prefix)) {
        const args = message.content.slice(config_json_1.prefix.length).trim().split(/ +/g);
        const command = (_a = args.shift()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (command === 'setup' || command === 'join') {
            const portalGuildConnections = yield getGuildPortalConnections(message.guildId);
            if (portalGuildConnections.length > 0) {
                message.reply('A server can currently only have one Portal connection. Please remove the current connection before setting up a new one.');
                return;
            }
            // Create new connectionSetup
            if (connectionSetups.has(message.author.id))
                connectionSetups.delete(message.author.id);
            connectionSetups.set(message.author.id, {
                channelId: message.channel.id,
                portalId: '',
                expires: Date.now() + 60000
            });
            setTimeout(() => {
                // Remove setup if not completed
                if (connectionSetups.has(message.author.id))
                    connectionSetups.delete(message.author.id);
            }, 60000);
            // Send message
            const portals = yield getPortals();
            message.reply({
                content: `__Selected channel:__ <#${message.channel.id}>.\n${portalIntro.portal}.`,
                components: [
                    {
                        type: discord_js_1.ComponentType.ActionRow,
                        components: [
                            {
                                type: discord_js_1.ComponentType.StringSelect,
                                customId: 'portalSelect',
                                maxValues: 1,
                                minValues: 1,
                                options: Array.from(portals.values()).map(p => ({
                                    label: `${p.customEmoji ? '' : p.emoji}${p.name}`,
                                    value: p.id
                                })),
                                placeholder: 'Select a Portal'
                            }
                        ]
                    }, {
                        type: discord_js_1.ComponentType.ActionRow,
                        components: [
                            {
                                type: discord_js_1.ComponentType.Button,
                                customId: 'portalCreate',
                                label: 'Create new Portal',
                                style: discord_js_1.ButtonStyle.Primary
                            }, {
                                type: discord_js_1.ComponentType.Button,
                                customId: 'portalSelectCancel',
                                label: 'Cancel',
                                style: discord_js_1.ButtonStyle.Danger
                            }
                        ]
                    }
                ]
            });
        }
        if (command === 'portal' || command === 'portals') {
            const portalConnection = yield getChannelPortalConnection(message.channel.id);
            if (portalConnection) {
                const portal = yield getPortal(portalConnection.portalId);
                const portalConnections = yield getPortalConnections(portalConnection.portalId);
                message.reply({
                    content: `Connected to Portal \`#${portal === null || portal === void 0 ? void 0 : portal.id}\` - ${portal === null || portal === void 0 ? void 0 : portal.emoji}${portal.name}.\nConnection shared with\n${portalConnections.map(c => `• **${c.guildName}** - ${c.channelName}`).join('\n')}`,
                });
            }
            else {
                message.reply({
                    content: 'This channel is not connected to any Portals.',
                });
            }
        }
        if (command === 'leave') {
            const portalConnection = yield deletePortalConnection(message.channel.id);
            if (portalConnection) {
                const portal = yield getPortal(portalConnection.portalId);
                message.reply({
                    content: `Left Portal \`#${portalConnection.portalId}\` - ${portal === null || portal === void 0 ? void 0 : portal.emoji}${portal === null || portal === void 0 ? void 0 : portal.name}.`,
                });
            }
            else {
                message.reply({
                    content: 'This channel is not connected to any Portals.',
                });
            }
        }
        if (command === 'delete') {
            const portalConnection = yield getChannelPortalConnection(message.channel.id);
            if (portalConnection) {
                const portals = yield getPortals();
                const portalConnections = yield getPortalConnections(portalConnection.portalId);
                if (portalConnections.length > 1) {
                    message.reply('Cannot delete Portal with multiple connections.');
                    return;
                }
                if (portals.size <= 1) {
                    message.reply('Cannot delete last Portal.');
                    return;
                }
                const portal = yield deletePortal(portalConnection.portalId);
                message.reply(`Deleted Portal \`#${portalConnection.portalId}\` - ${portal === null || portal === void 0 ? void 0 : portal.emoji}${portal === null || portal === void 0 ? void 0 : portal.name}.`);
            }
            else {
                message.reply({
                    content: 'This channel is not connected to any Portals.',
                });
                return;
            }
        }
        if (command === 'invite' || command === 'link') {
            message.reply('Invite me to your server: https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=537263168&scope=bot');
        }
    }
    // Portal functionality
    const portalConnection = yield getChannelPortalConnection(message.channel.id);
    if (!portalConnection)
        return;
    const portalConnections = yield getPortalConnections(portalConnection.portalId);
    // Get other connections
    const otherConnections = portalConnections.filter(c => c.channelId !== message.channel.id);
    // Send message to other channels
    for (const connection of otherConnections) {
        const channel = yield client.channels.fetch(connection.channelId);
        if (!channel) { // Remove connection if channel is not found
            yield deletePortalConnection(connection.channelId);
            continue;
        }
        let webhook = new discord_js_1.WebhookClient({ id: connection.webhookId, token: connection.webhookToken });
        if (!webhook) {
            webhook = yield createWebhook(channel);
        }
        if (!webhook)
            continue;
        yield webhook.send({
            content: message.content,
            username: `${message.author.username}#${message.author.discriminator} @ ${portalConnection.guildName}`,
            avatarURL: message.author.avatarURL() || undefined,
            files: message.attachments.map(a => ({
                attachment: a.url,
                name: a.name || undefined
            })),
            embeds: message.embeds,
            tts: message.tts,
            allowedMentions: {
                parse: ['users']
            }
        });
    }
}));
client.on(discord_js_1.Events.InteractionCreate, (interaction) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Join portal
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId !== 'portalSelect')
                return;
            const portalId = interaction.values[0];
            const portal = yield getPortal(portalId);
            // Add portal to setup
            const setup = connectionSetups.get(interaction.user.id);
            if (!setup)
                return sendExpired(interaction);
            setup.portalId = portalId;
            setup.expires = Date.now() + 60000;
            // Edit original message
            interaction.update({
                content: `__Selected channel:__ <#${setup.channelId}>.\n__Selected Portal:__ ${portal === null || portal === void 0 ? void 0 : portal.emoji}${portal === null || portal === void 0 ? void 0 : portal.name}.\n${portalIntro.confirm}`,
                components: [
                    {
                        type: discord_js_1.ComponentType.ActionRow,
                        components: [
                            {
                                type: discord_js_1.ComponentType.Button,
                                customId: 'portalJoin',
                                label: 'Join Portal',
                                style: discord_js_1.ButtonStyle.Success
                            }, {
                                type: discord_js_1.ComponentType.Button,
                                customId: 'portalSelectCancel',
                                label: 'Cancel',
                                style: discord_js_1.ButtonStyle.Danger
                            }
                        ]
                    }
                ]
            });
        }
        // Buttons
        if (interaction.isButton()) {
            switch (interaction.customId) {
                case 'portalJoin': { // Join portal
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup)
                        return sendExpired(interaction);
                    // Join portal
                    const portalConnection = yield createPortalConnection(setup.portalId, setup.channelId);
                    const portal = yield getPortal(portalConnection.portalId);
                    interaction.update({
                        content: `Joined \`$${portal === null || portal === void 0 ? void 0 : portal.id}\` - ${portal === null || portal === void 0 ? void 0 : portal.emoji}${portal === null || portal === void 0 ? void 0 : portal.name}!`,
                        components: []
                    });
                    break;
                }
                case 'portalCreate': { // Create new portal
                    yield interaction.showModal({
                        title: 'Create new Portal',
                        customId: 'portalCreateModal',
                        components: [
                            {
                                type: discord_js_1.ComponentType.ActionRow,
                                components: [
                                    {
                                        type: discord_js_1.ComponentType.TextInput,
                                        customId: 'portalName',
                                        label: 'Portal name',
                                        placeholder: generateName(),
                                        maxLength: 64,
                                        minLength: 1,
                                        style: discord_js_1.TextInputStyle.Short,
                                    }
                                ]
                            }
                        ]
                    });
                    break;
                }
                case 'portalCreateConfirm': { // Confirm creation of new portal
                    const portalSetup = portalSetups.get(interaction.user.id);
                    if (!portalSetup)
                        return sendExpired(interaction);
                    const portal = yield createPortal(portalSetup.name, portalSetup.emoji, portalSetup.customEmoji);
                    portalSetups.delete(interaction.user.id);
                    const portalConnection = yield createPortalConnection(portal.id, portalSetup.channelId);
                    interaction.update({
                        content: `Created and joined Portal \`#${portalConnection.portalId}\` - ${portal.emoji}${portal.name}.`,
                        components: []
                    });
                    break;
                }
                case 'portalSelectCancel': { // Cancel portal selection
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup)
                        return sendExpired(interaction);
                    connectionSetups.delete(interaction.user.id);
                    interaction.update({
                        content: 'Cancelled Portal setup.',
                        components: []
                    });
                    break;
                }
                case 'portalCreateCancel': { // Cancel portal creation
                    const portalSetup = portalSetups.get(interaction.user.id);
                    if (!portalSetup)
                        return sendExpired(interaction);
                    portalSetups.delete(interaction.user.id);
                    interaction.update({
                        content: 'Cancelled Portal creation.',
                        components: []
                    });
                    break;
                }
            }
        }
        // Create new portal
        if (interaction.isModalSubmit() && interaction.isFromMessage()) {
            if (interaction.customId !== 'portalCreateModal')
                return;
            const setup = connectionSetups.get(interaction.user.id);
            if (!setup)
                return sendExpired(interaction);
            const portalName = interaction.fields.getTextInputValue('portalName');
            // Add portal to portalCreations
            portalSetups.set(interaction.user.id, {
                name: portalName,
                emoji: '',
                customEmoji: false,
                portalId: '',
                channelId: setup.channelId,
                expires: Date.now() + 60000
            });
            setTimeout(() => {
                // Remove portalCreation if not completed
                if (portalSetups.has(interaction.user.id))
                    portalSetups.delete(interaction.user.id);
            }, 60000);
            // Edit original message
            interaction.update({
                content: `__Selected channel:__ <#${setup.channelId}>.\n__Portal name:__ ${portalName}.\nReact to this message with the emoji you want to use for your Portal.`,
                components: []
            });
            // Wait for emoji
            const filter = (_reaction, user) => user.id === interaction.user.id;
            interaction.message.awaitReactions({ filter, max: 1, time: 60000, errors: ['time'] })
                .then((collected) => __awaiter(void 0, void 0, void 0, function* () {
                var _b;
                // Add to portalCreations
                const reaction = collected.first();
                if (!reaction) {
                    (_b = interaction.channel) === null || _b === void 0 ? void 0 : _b.send('You did not react with an emoji in time.');
                    return;
                }
                const portalCreation = portalSetups.get(interaction.user.id);
                if (!portalCreation)
                    return sendExpired(interaction);
                portalCreation.emoji = reaction.emoji.toString() || '';
                portalCreation.customEmoji = reaction.emoji.id ? true : false;
                portalCreation.portalId = yield generatePortalId();
                portalSetups.set(interaction.user.id, portalCreation);
                reaction.remove();
                // Edit original message
                interaction.message.edit({
                    content: `__Selected channel:__ <#${setup.channelId}>.\n**Do you want to create a new Portal?**\n${portalCreation.emoji}${portalCreation.name}.`,
                    components: [
                        {
                            type: discord_js_1.ComponentType.ActionRow,
                            components: [
                                {
                                    type: discord_js_1.ComponentType.Button,
                                    customId: 'portalCreateConfirm',
                                    label: 'Create and join Portal',
                                    style: discord_js_1.ButtonStyle.Success
                                }, {
                                    type: discord_js_1.ComponentType.Button,
                                    customId: 'portalCreateCancel',
                                    label: 'Cancel',
                                    style: discord_js_1.ButtonStyle.Danger
                                }
                            ]
                        }
                    ]
                });
            })).catch(() => {
                var _a;
                (_a = interaction.channel) === null || _a === void 0 ? void 0 : _a.send('You did not react with an emoji in time.');
            });
        }
    }
    catch (err) {
        // Probably timed out
        console.error(err);
    }
}));
client.login(token);
