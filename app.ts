import { Client, Events, GatewayIntentBits, ComponentType, ChannelType, ButtonStyle, Interaction, TextInputStyle, MessageReaction, User, TextChannel, Embed, MessageReference, PermissionFlagsBits, Message } from 'discord.js';
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
type PortalConnectionOptions = {
    guildName?: string,
    channelName?: string,
    webhookId?: string,
    webhookToken?: string
}
type PortalMessage = {
    portalId: string,
    messageId: string,
    linkedChannelId: string,
    linkedMessageId: string
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
    db.run('CREATE TABLE IF NOT EXISTS portalMessages (portalId TEXT, messageId TEXT, linkedChannelId TEXT, linkedMessageId TEXT, FOREIGN KEY(portalId) REFERENCES portals(id))')
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

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions]})

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
const getWebhook = async ({ channel, webhookId }: { channel: string | TextChannel, webhookId?: string }) => {
    if (typeof channel === 'string') channel = await client.channels.fetch(channel) as TextChannel;
    if (!webhookId) return createWebhook(channel);
    const webhooks = await channel.fetchWebhooks();
    const webhook = webhooks.get(webhookId);
    if (!webhook) {
        const webhook = await createWebhook(channel);
        await updatePortalConnection(channel.id, { webhookId: webhook.id, webhookToken: webhook.token! });
        return webhook;
    }
    else return webhook;
}
const checkPermissions = async (message: Message) => {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        message.reply('You need the `Manage Channels` permission to use this command.');
        return false;
    }
    return true;
}
// Database helpers
const createPortal = async ({ name, emoji, customEmoji }: { name: string, emoji: string, customEmoji: boolean }): Promise<Portal> => {
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
const createPortalConnection = async ({ portalId, channelId }: { portalId: string, channelId: string }) => {
    const channel = await client.channels.fetch(channelId) as TextChannel;
    const webhook = await getWebhook({ channel });
    return new Promise<PortalConnection>((resolve, reject) => {
        db.serialize(async () => {
            db.run('INSERT INTO portalConnections (portalId, guildId, guildName, channelId, channelName, webhookId, webhookToken) VALUES (?, ?, ?, ?, ?, ?, ?)', [portalId, channel.guildId, channel.guild.name, channelId, channel.name, webhook.id, webhook.token]);
            const portalConnection = await getPortalConnection(channelId);
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
                        const webhook = await getWebhook({ channel, webhookId: portalConnection.webhookId });
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
const getPortalConnection = async (channelId: string): Promise<PortalConnection | null> => {
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
const updatePortalConnection = async (channelId: string, portalConnectionOptions: PortalConnectionOptions) => {
    return new Promise<PortalConnection | null>((resolve, reject) => {
        db.serialize(async () => {
            const portalConnection = await getPortalConnection(channelId);
            if (portalConnection) {
                // Update only the options in portalConnectionOptions that are not null
                const { guildName, channelName, webhookId, webhookToken } = portalConnectionOptions;
                db.run('UPDATE portalConnections SET guildName = ?, channelName = ?, webhookId = ?, webhookToken = ? WHERE channelId = ?', [guildName ?? portalConnection.guildName, channelName ?? portalConnection.channelName, webhookId ?? portalConnection.webhookId, webhookToken ?? portalConnection.webhookToken, channelId]);
                resolve({ portalId: portalConnection.portalId, guildId: portalConnection.guildId, guildName: guildName ?? portalConnection.guildName, channelId: portalConnection.channelId, channelName: channelName ?? portalConnection.channelName, webhookId: webhookId ?? portalConnection.webhookId, webhookToken: webhookToken ?? portalConnection.webhookToken });
            } else reject('Could not find connection in database.');
        });
    });
}
const createPortalMessage = async ({ portalId, messageId, linkedChannelId, linkedMessageId }: { portalId: string, messageId: string, linkedChannelId: string, linkedMessageId: string }): Promise<PortalMessage> => {
    db.run('INSERT INTO portalMessages (portalId, messageId, linkedChannelId, linkedMessageId) VALUES (?, ?, ?, ?)', [portalId, messageId, linkedChannelId, linkedMessageId]);
    return { portalId, messageId, linkedChannelId, linkedMessageId };
}
const deletePortalMessages = async (messageId: string) => {
    db.run('DELETE FROM portalMessages WHERE messageId = ?', [messageId]);
}
const getPortalMessageByLinkedMessage = async ({ linkedChannelId, linkedMessageId }: { linkedChannelId: string, linkedMessageId: string }): Promise<PortalMessage | null> => {
    return new Promise<PortalMessage | null>((resolve, reject) => {
        db.get('SELECT * FROM portalMessages WHERE linkedChannelId = ? AND linkedMessageId = ?', [linkedChannelId, linkedMessageId], (err, row) => {
            if (err) reject(err);
            else {
                if (row) resolve({ portalId: row.portalId, messageId: row.messageId, linkedChannelId: row.linkedChannelId, linkedMessageId: row.linkedMessageId });
                else resolve(null);
            }
        });
    });
}
const getPortalMessages = async (messageId: string): Promise<PortalMessage[] | null> => {
    return new Promise<PortalMessage[] | null>((resolve, reject) => {
        db.all('SELECT * FROM portalMessages WHERE messageId = ?', [messageId], (err, rows) => {
            if (err) reject(err);
            else {
                if (rows.length > 0) {
                    const portalMessages = rows.map(row => {
                        return { portalId: row.portalId, messageId: row.messageId, linkedChannelId: row.linkedChannelId, linkedMessageId: row.linkedMessageId };
                    });
                    resolve(portalMessages);
                } else resolve(null);
            }
        });
    });
}

// Keep track of setups
const connectionSetups = new Map<string, { channelId: string, portalId: string, expires: number }>();
const portalSetups = new Map<string, { name: string, emoji: string, customEmoji: boolean, portalId: string, channelId: string, expires: number }>();

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user?.tag}`)
});

client.on(Events.MessageCreate, async message => {
    // Ignore if webhook
    if (message.webhookId) return;
    // Ignore if DM
    if (!message.guildId) return;

    if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/g);
        const command = args.shift()?.toLowerCase();

        switch (command) {
            case 'portal':
            case 'portals': {

                const portalConnection = await getPortalConnection(message.channel.id);
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
                break;
            }
            case 'invite':
            case 'link': {
                message.reply('Invite me to your server: https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=537263168&scope=bot')
                break;
            }    
            case 'setup':
            case 'join': {
                // Check permissions
                if (!checkPermissions(message)) break;

                const portalGuildConnections = await getGuildPortalConnections(message.guildId);
                if (portalGuildConnections.length > 0) {
                    message.reply('A server can currently only have one Portal connection. Please remove the current connection before setting up a new one.');
                    break;
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
                break;
            }
            case 'leave': {
                // Check permissions
                if (!checkPermissions(message)) break;

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
                break;
            }
            case 'delete': {
                // Check permissions
                if (!checkPermissions(message)) break;

                const portalConnection = await getPortalConnection(message.channel.id);
                if (portalConnection) {
                    const portals = await getPortals();
                    const portalConnections = await getPortalConnections(portalConnection.portalId);
                    if (portalConnections.length > 1) {
                        message.reply('Cannot delete Portal with multiple connections.');
                        break;
                    }
                    if (portals.size <= 1) {
                        message.reply('Cannot delete last Portal.');
                        break;
                    }
                    const portal = await deletePortal(portalConnection.portalId);
                    message.reply(`Deleted Portal \`#${portalConnection.portalId}\` - ${portal?.emoji}${portal?.name}.`);
                } else {
                    message.reply({
                        content: 'This channel is not connected to any Portals.',
                    });
                    break;
                }
                break;
            }
        }
    }

    // Portal functionality
    const portalConnection = await getPortalConnection(message.channel.id);
    if (!portalConnection) return;
    const portalConnections = await getPortalConnections(portalConnection.portalId);
    // Get other connections
    const otherConnections = portalConnections.filter(c => c.channelId !== message.channel.id);

    // Send message to other channels
    let webhookMessages = [];

    // -- Preprocess message --
    // Replace image embeds with links
    const embeds = message.embeds.map(e => {
        if (!e.data.url) return e;
        if (!message.content.includes(e.data.url)) message.content += `\n${e.data.url}`;
        return null;
    }).filter(e => e !== null) as Embed[];    

    // Convert unknown emojis
    const emojis = message.content.match(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g);
    const replacement = emojis?.map(e => {
        const id = e.match(/[0-9]+/g)?.[0];
        if (!id) return e;
        const emoji = client.emojis.cache.get(id);
        if (emoji) return emoji.toString();
        return `https://cdn.discordapp.com/emojis/${id}.webp?size=48&quality=lossless`;
    });
    if (emojis && replacement) {
        // Replace message content matches
        for (let i = 0; i < emojis.length; i++) {
            message.content = message.content.replace(emojis[i], replacement[i]);
        }
    }
    // Replies
    const portalMessages = message.reference?.messageId ? await getPortalMessages(message.reference.messageId) : [];
    // Stickers
    message.content += '\n' + message.stickers.map(s => s.url).join('\n');

    for (const connection of otherConnections) {
        // Get channel
        const channel = await client.channels.fetch(connection.channelId) as TextChannel | null;
        if (!channel) { // Remove connection if channel is not found
            await deletePortalConnection(connection.channelId);
            continue;
        }

        // Add replies
        let content = message.content;
        const createReply = async (messageReference: MessageReference) => {
            const failMsg = `\`[Reply failed]\``
            if (!messageReference.messageId) return `${failMsg}\n`;
            // Find reference in Portal
            let portalMessage = portalMessages?.find(m => m.linkedChannelId === channel.id) as PortalMessage | undefined | null;
            const link = `https://discord.com/channels/${channel.guildId}/${channel.id}/`;
            let linkedMessageId = portalMessage?.linkedMessageId;
            if (!linkedMessageId) {
                // If reference wasn't found it's because the message is probably a webhook message
                // In this case, we need to fetch the PortalMessage by the linked message id
                portalMessage = await getPortalMessageByLinkedMessage({ linkedChannelId: messageReference.channelId, linkedMessageId: messageReference.messageId });
                linkedMessageId = portalMessage?.messageId;
            }
            if (!linkedMessageId) return `${failMsg}\n`;

            const reference = await channel.messages.fetch(linkedMessageId);
            // Remove first line if it's a reply
            const msgContent = reference.content.startsWith('[[Reply to ') ? reference.content.split('\n').slice(1).join('\n') : reference.content;
            const authorTag = reference.author.tag.split('@')[0];
            const preview = msgContent.length + authorTag.length > 50 ? msgContent.substring(0, 50 - authorTag.length) + '...' : msgContent;
                
            return `[[Reply to \`${authorTag}\` - \`${preview}\`]](<${link}${linkedMessageId}>)\n`;
        }
        if (message.reference) content = await createReply(message.reference) + content || content;

        // Get webhook
        const webhook = await getWebhook({ channel, webhookId: connection.webhookId });
        // Send webhook message
        const webhookMessage = await webhook.send({
            content: content,
            username: `${message.author.username}#${message.author.discriminator} @ ${portalConnection.guildName}`,
            avatarURL: message.author.avatarURL() || undefined,
            files: message.attachments.map(a => ({
                attachment: a.url,
                name: a.name || undefined
            })),
            embeds: embeds,
            tts: message.tts,
            allowedMentions: {
                parse: [ 'users' ]
            }
        });
        if (webhookMessage) {
            webhookMessages.push({ id: webhookMessage.id, channelId: channel.id});
        }
    }
    // Save webhook messages to database
    await Promise.all(webhookMessages.map(async linkedMessage => await createPortalMessage({ portalId: portalConnection.portalId, messageId: message.id, linkedChannelId: linkedMessage.channelId, linkedMessageId: linkedMessage.id })));
});

// Delete messages
client.on(Events.MessageDelete, async message => {
    // Ignore webhook deletions
    if (message.webhookId) return;

    // Check if message is a portal message
    const portalMessage = await getPortalMessages(message.id);
    if (!portalMessage) return;
    // Delete linked messages
    for (const linkedMessage of portalMessage) {
        // Find channel and message objects
        const channel = await client.channels.fetch(linkedMessage.linkedChannelId) as TextChannel | null;
        if (!channel) continue;
        const message = await channel.messages.fetch(linkedMessage.linkedMessageId);
        if (!message) continue;

        // Attempt to delete message
        try { // Webhook deletion (cleanest)
            const portalConnection = await getPortalConnection(channel.id);
            if (!portalConnection) throw 'No portal connection found.'

            const webhook = await getWebhook({ channel, webhookId: portalConnection.webhookId });
            await webhook.deleteMessage(linkedMessage.linkedMessageId);
        } catch (webhookError) { // Webhook failed, try to delete with bot
            console.log(webhookError)
            try {
                message.delete();
            } catch (deleteError) { // Bot failed, send note
                console.log(deleteError)
                channel.send('Note: I need the `Manage Messages` permission to function properly.');
            }
        }
    }
    // Delete portal message
    await deletePortalMessages(message.id);
});

// Edit messages
client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    // Ignore webhook edits
    if (newMessage.webhookId) return;

    // Check if message is a portal message
    const portalMessage = await getPortalMessages(newMessage.id);
    if (!portalMessage) return;

    // Edit linked messages
    for (const linkedMessage of portalMessage) {
        // Find channel and message objects
        const channel = await client.channels.fetch(linkedMessage.linkedChannelId) as TextChannel | null;
        if (!channel) continue;
        const message = await channel.messages.fetch(linkedMessage.linkedMessageId);
        if (!message) continue;

        // Attempt to edit message
        try { // Webhook edit (cleanest)
            const portalConnection = await getPortalConnection(channel.id);
            if (!portalConnection) throw 'No portal connection found.'

            const webhook = await getWebhook({ channel, webhookId: portalConnection.webhookId });
            await webhook.editMessage(linkedMessage.linkedMessageId, {
                content: newMessage.content,
                files: newMessage.attachments.map(a => ({
                    attachment: a.url,
                    name: a.name || undefined
                })),
                embeds: newMessage.embeds,
                allowedMentions: {
                    parse: [ 'users' ]
                }
            });
        } catch (webhookError) { // Webhook failed
            console.error(webhookError)
        }
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
                    const portalConnection = await createPortalConnection({ portalId: setup.portalId, channelId: setup.channelId });
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
                    const portal = await createPortal({ name: portalSetup.name, emoji: portalSetup.emoji, customEmoji: portalSetup.customEmoji });
                    portalSetups.delete(interaction.user.id);
                    const portalConnection = await createPortalConnection({ portalId: portal.id, channelId: portalSetup.channelId });
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