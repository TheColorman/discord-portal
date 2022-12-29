import { Client, Events, GatewayIntentBits, ComponentType, ChannelType, ButtonStyle, Interaction, TextInputStyle, MessageReaction, User, TextChannel, WebhookClient, Webhook } from 'discord.js';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import { prefix } from './config.json';
sqlite3.verbose();
dotenv.config();

const token = process.env.TOKEN;

//? Hardcoded for dev purposes
const nameSuggestions = {
    beginning: ['Cool', 'Hot', 'Steamy', 'Awesome', 'Dank', 'Dark', 'Deep', 'Shiny', 'Haunted', 'Intense'],
    middle: ['discussion', 'chill', 'grill', 'study', 'programming', 'gaming', 'text', 'bot', 'wrestling'],
    end: ['zone', 'place', 'room', 'space', 'world', 'realm', 'dimension', 'area', 'portal', 'hangout']
}
const emojiSuggestions = ['🌌', '😂', '👽', '🎅', '👑', '🥋', '🎮', '🎲', '🎨', '🎬', '🎤', '🎸', '🎹', '🎻', '🎺', '🎼', '🎵', '🎶', '🎧', '🎙️', '🎚️', '🎛️', '🎞️', '📽️', '📺', '📷', '📸', '📹', '📼', '🔍', '🔎', '🔬', '🔭', '📡', '🕯️', '💡', '🔦', '🏮', '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📓', '📒', '📃', '📜', '📄', '📰', '🗞️', '📑', '🔖', '🏷️', '💰', '💴', '💵', '💶', '💷', '💸', '💳', '🧾', '💹', '💱', '💲', '✉️', '📧', '📨', '📩', '📤', '📥', '📦', '📫', '📪', '📬', '📭', '📮', '🗳️', '✏️', '✒️', '🖋️', '🖊️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '📅', '📆', '🗒️', '🗓️', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '🖇️', '📏', '📐'];
//? END

// Types
type Portal = {
    id: string,
    name: string,
    emoji: string,
    customEmoji: boolean
}
type PortalConnection = {
    portalId: string,
    guildId: string,
    guildName: string,
    channelId: string,
    channelName: string,
    webhookId: string,
    webhookToken: string
}

// Config
const portalIntro = {
    portal: "**Welcome to the setup!** Select which Portal you want this channel to be connected to.",
    confirm: `**Do you want to join this Portal?** You can always leave using \`${prefix}leave\`.`
}

// Database
const db = new sqlite3.Database('./db.sqlite', err => {
    if (err) console.error(err);
    else console.log('Connected to database.');
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
    if (err) console.error(err);
    else if (!row) {
        db.run('INSERT INTO portals (id, name, emoji, customEmoji) VALUES (?, ?, ?, ?)', ['123456', 'Genesis', '🎆', false], err => {
            if (err) console.error(err);
            else console.log('Created default Portal.');
        });
    }
});

// Helpers
const sendExpired = (interaction: Interaction) => { if (interaction.isRepliable()) interaction.reply({ content: 'Expired.', ephemeral: true }) };
const generateName = () => `${nameSuggestions.beginning[Math.floor(Math.random() * nameSuggestions.beginning.length)]} ${nameSuggestions.middle[Math.floor(Math.random() * nameSuggestions.middle.length)]} ${nameSuggestions.end[Math.floor(Math.random() * nameSuggestions.end.length)]}`
const generateEmoji = () => emojiSuggestions[Math.floor(Math.random() * emojiSuggestions.length)]
const generatePortalId = async () => {
    let id = Math.floor(Math.random() * 1000000).toString();
    const portals = await getPortals()
    while (portals[id as keyof typeof portals]) id = Math.floor(Math.random() * 1000000).toString();
    return id;
}
const createWebhook = async (channel: TextChannel) => {
    const webhook = await channel.createWebhook({ name: 'Portal connection', reason: 'New Portal connection established' }); //TODO: Add avatar
    return webhook;
}
const createPortal = async (name: string, emoji: string, customEmoji: boolean): Promise<Portal> => {
    const portalId = await generatePortalId();
    db.run('INSERT INTO portals (id, name, emoji, customEmoji) VALUES (?, ?, ?, ?)', [portalId, name, emoji, customEmoji]);
    return { id: portalId, name, emoji, customEmoji };
}
const deletePortal = async (portalId: string) => {
    return new Promise<Portal | null>((resolve, reject) => {
        db.serialize(async () => {
            const portal = await getPortal(portalId);
            if (portal) {
                db.run('DELETE FROM portals WHERE id = ?', [portalId]);
                db.run('DELETE FROM portalConnections WHERE portalId = ?', [portalId]);
                resolve(portal);
            } else resolve(null);
        });
    });
}
const getPortal = async (portalId: string) => {
    return new Promise<Portal | null>((resolve, reject) => {
        db.get('SELECT * FROM portals WHERE id = ?', [portalId], (err, row) => {
            if (err) reject(err);
            else {
                if (row) resolve({ id: row.id, name: row.name, emoji: row.emoji, customEmoji: row.customEmoji });
                else resolve(null);
            }
        });
    });
}
const getPortals = async () => {
    return new Promise<Map<string, Portal>>((resolve, reject) => {
        db.all('SELECT * FROM portals', (err, rows) => {
            if (err) reject(err);
            else {
                const portals = new Map<string, Portal>();
                rows.forEach(row => {
                    portals.set(row.id, { id: row.id, name: row.name, emoji: row.emoji, customEmoji: row.customEmoji });
                });
                resolve(portals);
            }
        });
    });
}
const createPortalConnection = async (portalId: string, channelId: string) => {
    const channel = await client.channels.fetch(channelId) as TextChannel;
    const webhook = await createWebhook(channel);
    return new Promise<PortalConnection>((resolve, reject) => {
        db.serialize(async () => {
            db.run('INSERT INTO portalConnections (portalId, guildId, guildName, channelId, channelName, webhookId, webhookToken) VALUES (?, ?, ?, ?, ?, ?, ?)', [portalId, channel.guildId, channel.guild.name, channelId, channel.name, webhook.id, webhook.token]);
            const portalConnection = await getChannelPortalConnection(channelId);
            if (portalConnection) resolve(portalConnection);
            else reject('Could not find connection in database.');
        });
    });
}
const deletePortalConnection = async (channelId: string) => {
    return new Promise<PortalConnection | null>((resolve, reject) => {
        db.serialize(async () => {
            db.get('SELECT * FROM portalConnections WHERE channelId = ?', [channelId], async (err, row) => {
                if (err) reject(err);
                else {
                    if (row) {
                        const portalConnection = { portalId: row.portalId, guildId: row.guildId, guildName: row.guildName, channelId: row.channelId, channelName: row.channelName, webhookId: row.webhookId, webhookToken: row.webhookToken };
                        const channel = await client.channels.fetch(channelId) as TextChannel;
                        const webhook = (await channel.fetchWebhooks()).find(webhook => webhook.id === row.webhookId);
                        if (webhook) await webhook.delete();
                        db.run('DELETE FROM portalConnections WHERE channelId = ?', [channelId]);
                        resolve(portalConnection);
                    } else resolve(null);
                }
            });
        });
    });
}
const getGuildPortalConnections = async (guildId: string): Promise<Array<PortalConnection>> => {
    return new Promise<Array<PortalConnection>>((resolve, reject) => {
        db.all('SELECT * FROM portalConnections WHERE guildId = ?', [guildId], (err, rows) => {
            if (err) reject(err);
            else {
                const portalConnections = new Array<PortalConnection>();
                rows.forEach(row => {
                    portalConnections.push({ portalId: row.portalId, guildId: row.guildId, guildName: row.guildName, channelId: row.channelId, channelName: row.channelName, webhookId: row.webhookId, webhookToken: row.webhookToken });
                });
                resolve(portalConnections);
            }
        });
    });
}
const getChannelPortalConnection = async (channelId: string): Promise<PortalConnection | null> => {
    return new Promise<{ portalId: string, guildId: string, guildName: string, channelId: string, channelName: string, webhookId: string, webhookToken: string } | null>((resolve, reject) => {
        db.get('SELECT * FROM portalConnections WHERE channelId = ?', [channelId], (err, row) => {
            if (err) reject(err);
            else {
                if (row) resolve({ portalId: row.portalId, guildId: row.guildId, guildName: row.guildName, channelId: row.channelId, channelName: row.channelName, webhookId: row.webhookId, webhookToken: row.webhookToken });
                else resolve(null);
            }
        });
    });
}
const getPortalConnections = async (portalId: string): Promise<Array<PortalConnection>> => {
    return new Promise<PortalConnection[]>((resolve, reject) => {
        db.all('SELECT * FROM portalConnections WHERE portalId = ?', [portalId], (err, rows) => {
            if (err) reject(err);
            else {
                const connections: PortalConnection[] = [];
                rows.forEach(row => {
                    connections.push({ portalId: row.portalId, guildId: row.guildId, guildName: row.guildName, channelId: row.channelId, channelName: row.channelName, webhookId: row.webhookId, webhookToken: row.webhookToken });
                });
                resolve(connections);
            }
        });
    });
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions]})

// Keep track of setups
const connectionSetups = new Map<string, { channelId: string, portalId: string, expires: number }>();
const portalSetups = new Map<string, { name: string, emoji: string, customEmoji: boolean, portalId: string, channelId: string, expires: number }>();

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user?.tag}`)
});

client.on(Events.MessageCreate, async message => {
    // Ignore if webhook or self
    if (message.webhookId || message.author.equals(message.client.user)) return;
    // Ignore if DM
    if (!message.guildId) return;

    if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/g);
        const command = args.shift()?.toLowerCase();

        if (command === 'setup' || command === 'join') {
            const portalGuildConnections = await getGuildPortalConnections(message.guildId);
            if (portalGuildConnections.length > 0) {
                message.reply('A server can currently only have one Portal connection. Please remove the current connection before setting up a new one.');
                return;
            }
            // Create new connectionSetup
            if (connectionSetups.has(message.author.id)) connectionSetups.delete(message.author.id);
            connectionSetups.set(message.author.id, {
                channelId: message.channel.id,
                portalId: '',
                expires: Date.now() + 60000
            });
            setTimeout(() => {
                // Remove setup if not completed
                if (connectionSetups.has(message.author.id)) connectionSetups.delete(message.author.id);
            }, 60000);
            
            // Send message
            const portals = await getPortals();
            message.reply({
                content: `__Selected channel:__ <#${message.channel.id}>.\n${portalIntro.portal}.`,
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.StringSelect,
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
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.Button,
                                customId: 'portalCreate',
                                label: 'Create new Portal',
                                style: ButtonStyle.Primary
                            }, {
                                type: ComponentType.Button,
                                customId: 'portalSelectCancel',
                                label: 'Cancel',
                                style: ButtonStyle.Danger
                            }
                        ]
                    }
                ]
            });    
        }
        if (command === 'portal' || command === 'portals') {
            const portalConnection = await getChannelPortalConnection(message.channel.id);
            if (portalConnection) {
                const portal = await getPortal(portalConnection.portalId);
                const portalConnections = await getPortalConnections(portalConnection.portalId);
                message.reply({
                    content: `Connected to Portal \`#${portal?.id}\` - ${portal?.emoji}${portal!.name}.\nConnection shared with\n${portalConnections.map(c => `• **${c.guildName}** - ${c.channelName}`).join('\n')}`,
                });
            } else {
                message.reply({
                    content: 'This channel is not connected to any Portals.',
                });
            }
        }
        if (command === 'leave') {
            const portalConnection = await deletePortalConnection(message.channel.id);
            if (portalConnection) {
                const portal = await getPortal(portalConnection.portalId);
                message.reply({
                    content: `Left Portal \`#${portalConnection.portalId}\` - ${portal?.emoji}${portal?.name}.`,
                });
            } else {
                message.reply({
                    content: 'This channel is not connected to any Portals.',
                });
            }
        }
        if (command === 'delete') {
            const portalConnection = await getChannelPortalConnection(message.channel.id);
            if (portalConnection) {
                const portals = await getPortals();
                const portalConnections = await getPortalConnections(portalConnection.portalId);
                if (portalConnections.length > 1) {
                    message.reply('Cannot delete Portal with multiple connections.');
                    return;
                }
                if (portals.size <= 1) {
                    message.reply('Cannot delete last Portal.');
                    return;
                }
                const portal = await deletePortal(portalConnection.portalId);
                message.reply(`Deleted Portal \`#${portalConnection.portalId}\` - ${portal?.emoji}${portal?.name}.`);
            } else {
                message.reply({
                    content: 'This channel is not connected to any Portals.',
                });
                return;
            }
        }
        if (command === 'invite' || command === 'link') {
            message.reply('Invite me to your server: https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=537263168&scope=bot')
        }
    }

    // Portal functionality
    const portalConnection = await getChannelPortalConnection(message.channel.id);
    if (!portalConnection) return;
    const portalConnections = await getPortalConnections(portalConnection.portalId);
    // Get other connections
    const otherConnections = portalConnections.filter(c => c.channelId !== message.channel.id);
    // Send message to other channels
    for (const connection of otherConnections) {
        const channel = await client.channels.fetch(connection.channelId) as TextChannel | null;
        if (!channel) { // Remove connection if channel is not found
            await deletePortalConnection(connection.channelId);
            continue;
        }
        let webhook = new WebhookClient({ id: connection.webhookId, token: connection.webhookToken }) as WebhookClient | Webhook | null;
        if (!webhook) {
            webhook = await createWebhook(channel);
        }
        if (!webhook) continue;
        await webhook.send({
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
                parse: [ 'users' ]
            }
        });
    }
});

client.on(Events.InteractionCreate, async interaction => {
    try {
            // Join portal
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId !== 'portalSelect') return;
            const portalId = interaction.values[0];
            const portal = await getPortal(portalId);
            
            // Add portal to setup
            const setup = connectionSetups.get(interaction.user.id);
            if (!setup) return sendExpired(interaction);
            setup.portalId = portalId;
            setup.expires = Date.now() + 60000;
            
            // Edit original message
            interaction.update({
                content: `__Selected channel:__ <#${setup.channelId}>.\n__Selected Portal:__ ${portal?.emoji}${portal?.name}.\n${portalIntro.confirm}`,
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.Button,
                                customId: 'portalJoin',
                                label: 'Join Portal',
                                style: ButtonStyle.Success
                            }, {
                                type: ComponentType.Button,
                                customId: 'portalSelectCancel',
                                label: 'Cancel',
                                style: ButtonStyle.Danger
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
                    if (!setup) return sendExpired(interaction);
                    
                    // Join portal
                    const portalConnection = await createPortalConnection(setup.portalId, setup.channelId);
                    const portal = await getPortal(portalConnection.portalId);
                    interaction.update({
                        content: `Joined \`$${portal?.id}\` - ${portal?.emoji}${portal?.name}!`,
                        components: []
                    });
                    break;
                }
                case 'portalCreate': { // Create new portal
                    await interaction.showModal({
                        title: 'Create new Portal',
                        customId: 'portalCreateModal',
                        components: [
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.TextInput,
                                        customId: 'portalName',
                                        label: 'Portal name',
                                        placeholder: generateName(),
                                        maxLength: 64,
                                        minLength: 1,
                                        style: TextInputStyle.Short,
                                    }
                                ]
                            }
                        ]
                    })
                    break;
                }
                case 'portalCreateConfirm': { // Confirm creation of new portal
                    const portalSetup = portalSetups.get(interaction.user.id);
                    if (!portalSetup) return sendExpired(interaction);
                    const portal = await createPortal(portalSetup.name, portalSetup.emoji, portalSetup.customEmoji);
                    portalSetups.delete(interaction.user.id);
                    const portalConnection = await createPortalConnection(portal.id, portalSetup.channelId);
                    interaction.update({
                        content: `Created and joined Portal \`#${portalConnection.portalId}\` - ${portal.emoji}${portal.name}.`,
                        components: []
                    });
                    break;
                }
                case 'portalSelectCancel': { // Cancel portal selection
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup) return sendExpired(interaction);
                    connectionSetups.delete(interaction.user.id);
                    interaction.update({
                        content: 'Cancelled Portal setup.',
                        components: []
                    });
                    break;
                }
                case 'portalCreateCancel': { // Cancel portal creation
                    const portalSetup = portalSetups.get(interaction.user.id);
                    if (!portalSetup) return sendExpired(interaction);
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
            if (interaction.customId !== 'portalCreateModal') return;
            const setup = connectionSetups.get(interaction.user.id);
            if (!setup) return sendExpired(interaction);
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
                if (portalSetups.has(interaction.user.id)) portalSetups.delete(interaction.user.id);
            }, 60000);
            
            // Edit original message
            interaction.update({
                content: `__Selected channel:__ <#${setup.channelId}>.\n__Portal name:__ ${portalName}.\nReact to this message with the emoji you want to use for your Portal.`,
                components: []
            });
            
            // Wait for emoji
            const filter = (_reaction: MessageReaction, user: User) => user.id === interaction.user.id;
            
            interaction.message.awaitReactions({filter, max: 1, time: 60000, errors: ['time'] })
            .then(async collected => {
                // Add to portalCreations
                const reaction = collected.first();
                if (!reaction) {
                    interaction.channel?.send('You did not react with an emoji in time.');
                    return;
                }
                const portalCreation = portalSetups.get(interaction.user.id);
                if (!portalCreation) return sendExpired(interaction);
                portalCreation.emoji = reaction.emoji.toString() || '';
                portalCreation.customEmoji = reaction.emoji.id ? true : false;
                portalCreation.portalId = await generatePortalId();
                portalSetups.set(interaction.user.id, portalCreation);
                
                reaction.remove();
                
                // Edit original message
                interaction.message.edit({
                    content: `__Selected channel:__ <#${setup.channelId}>.\n**Do you want to create a new Portal?**\n${portalCreation.emoji}${portalCreation.name}.`,
                    components: [
                        {
                            type: ComponentType.ActionRow,
                            components: [
                                {
                                    type: ComponentType.Button,
                                    customId: 'portalCreateConfirm',
                                    label: 'Create and join Portal',
                                    style: ButtonStyle.Success
                                }, {
                                    type: ComponentType.Button,
                                    customId: 'portalCreateCancel',
                                    label: 'Cancel',
                                    style: ButtonStyle.Danger
                                }
                            ]
                        }
                    ]
                });
            }).catch(() => {
                interaction.channel?.send('You did not react with an emoji in time.');
            });
        }
    } catch (err) {
        // Probably timed out
        console.error(err);
    }
});

client.login(token);