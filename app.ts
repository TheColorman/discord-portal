import { Client, Events, GatewayIntentBits, ComponentType, ButtonStyle, Interaction, TextInputStyle, MessageReaction, User, TextChannel, Embed, MessageReference, PermissionFlagsBits, Message, MessagePayload, WebhookEditMessageOptions, Webhook, Collection, ChannelType } from 'discord.js';
import sqlite3 from 'better-sqlite3';
import dotenv from 'dotenv';
import { prefix } from './config.json';
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
type PortalId = string;
type ChannelId = string;
type MessageId = string;
type UserId = string;

// Config
const portalIntro = {
    portal: "**Welcome to the setup!** Select which Portal you want this channel to be connected to.",
    confirm: `**Do you want to join this Portal?** You can always leave using \`${prefix}leave\`.`
}

// Database
const db = sqlite3('./db.sqlite');
process.on('exit', () => {
    db.close();
});
// Prevent crashes
process.on('uncaughtException', (err) => {
    console.error(err);
});

// Create tables
console.log('Creating tables...');
// db.prepare('DROP TABLE portalMessages').run()
db.prepare('CREATE TABLE IF NOT EXISTS portals (id TEXT PRIMARY KEY, name TEXT, emoji TEXT, customEmoji INTEGER DEFAULT 0)').run()
db.prepare('CREATE TABLE IF NOT EXISTS portalConnections (portalId TEXT, guildId TEXT, guildName TEXT, channelId TEXT, channelName TEXT, webhookId TEXT, webhookToken TEXT, FOREIGN KEY(portalId) REFERENCES portals(id))').run()
db.prepare('CREATE TABLE IF NOT EXISTS portalMessages (id TEXT, portalId TEXT, messageId TEXT, linkedChannelId TEXT, linkedMessageId TEXT, FOREIGN KEY(portalId) REFERENCES portals(id))').run()
// Create default portal if none exists
if (!db.prepare('SELECT COUNT(1) FROM portals').get()) {
    db.prepare('INSERT INTO portals (id, name, emoji, customEmoji) VALUES (?, ?, ?, ?)')
        .run(['123456', 'Genesis', '🎆', false]);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions] })

// Helpers
const sendExpired = (interaction: Interaction) => { if (interaction.isRepliable()) interaction.reply({ content: 'Expired.', ephemeral: true }) };
const generateName = (): string => `${nameSuggestions.beginning[Math.floor(Math.random() * nameSuggestions.beginning.length)]} ${nameSuggestions.middle[Math.floor(Math.random() * nameSuggestions.middle.length)]} ${nameSuggestions.end[Math.floor(Math.random() * nameSuggestions.end.length)]}`
const generateEmoji = (): string => emojiSuggestions[Math.floor(Math.random() * emojiSuggestions.length)]
const generatePortalId = (): PortalId => {
    let id = Math.floor(Math.random() * 1000000).toString();
    const portals = getPortals()
    while (portals[id as keyof typeof portals]) id = Math.floor(Math.random() * 1000000).toString();
    return id;
}
const generatePortalMessageId = (): PortalMessageId => {
    const id = Math.floor(Math.random() * 1000000).toString();
    const portalMessages = getPortalMessages(id);
    if (portalMessages[id as keyof typeof portalMessages]) return generatePortalMessageId();
    return id;
}
async function safeFetchMessage(channel: TextChannel, messageId: string): Promise<Message<true> | null> {
    try {
        return await channel.messages.fetch(messageId);
    } catch (err) {
        return null;
    }
}
async function editMessage(channel: TextChannel, messageId: string, options: string | MessagePayload | WebhookEditMessageOptions): Promise<Error | Message<boolean> | null> {
    const portalConnection = await getPortalConnection(channel.id);
    if (!portalConnection)
        return Error('No Portal connection found.');

    try {
        // Edit message using webhook
        const webhook = await getWebhook({ channel, webhookId: portalConnection.webhookId });
        return await webhook.editMessage(messageId, options);
    } catch (err) {
        console.error(err);
        return null;
    }
}
async function deleteMessage(channel: TextChannel, messageId: string): Promise<Error | Message<true> | null> {
    // Fetch message
    const message = await safeFetchMessage(channel, messageId);
    if (!message)
        return null;
    try {
        // Attempt deletion using webhook
        const portalConnection = getPortalConnection(channel.id);
        const webhook = await getWebhook({ channel, webhookId: portalConnection?.webhookId });
        await webhook.deleteMessage(messageId);

        return message;
    } catch (err) {
        // If webhook fails, attempt deletion using bot account
        try {
            await message.delete();
            return message;
        } catch (err) {
            // We don't have permission to delete the message
            return Error('No permission to delete message.');
        }
    }
}
async function createWebhook(channel: TextChannel): Promise<Webhook> {
    const webhook = await channel.createWebhook({ name: 'Portal connection', reason: 'New Portal connection established' }); //TODO: Add avatar
    return webhook;
}
async function getWebhook({ channel, webhookId }: { channel: string | TextChannel; webhookId?: string; }): Promise<Webhook> {
    if (typeof channel === 'string')
        channel = await client.channels.fetch(channel) as TextChannel;
    if (!webhookId)
        return createWebhook(channel);
    const webhook = (await channel.fetchWebhooks())
        .get(webhookId);
    if (!webhook) {
        const webhook = await createWebhook(channel);
        updatePortalConnection(channel.id, { webhookId: webhook.id, webhookToken: webhook.token! });
        return webhook;
    }
    else
        return webhook;
}
function checkPermissions(message: Message): boolean {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        message.reply('You need the `Manage Channels` permission to use this command.');
        return false;
    }
    return true;
}
// Database helpers
function createPortal({ name, emoji, customEmoji }: { name: string; emoji: string; customEmoji: boolean; }): Portal {
    const portalId = generatePortalId();
    db.prepare('INSERT INTO portals (id, name, emoji, customEmoji) VALUES (?, ?, ?, ?)')
        .run([portalId, name, emoji, Number(customEmoji)]);
    return { id: portalId, name, emoji, customEmoji };
}
function deletePortal(portalId: string): Portal | null {
    const portal = getPortal(portalId);
    if (!portal)
        return null;
    db.prepare('DELETE FROM portalConnections WHERE portalId = ?')
        .run(portalId);
    db.prepare('DELETE FROM portals WHERE id = ?')
        .run(portalId);
    return portal;
}
function getPortal(portalId: string): Portal | null {
    const portal = db.prepare('SELECT * FROM portals WHERE id = ?')
        .get(portalId);
    if (!portal)
        return null;
    return { id: portal.id, name: portal.name, emoji: portal.emoji, customEmoji: Boolean(portal.customEmoji) };
}
function getPortals(): Collection<PortalId, Portal> {
    const portals = db.prepare('SELECT * FROM portals')
        .all();
    return new Collection<PortalId, Portal>(portals.map(portal => [portal.id, { id: portal.id, name: portal.name, emoji: portal.emoji, customEmoji: Boolean(portal.customEmoji) }]));
}
async function createPortalConnection({ portalId, channelId }: { portalId: string; channelId: string; }): Promise<PortalConnection | Error> {
    const channel = await client.channels.fetch(channelId) as TextChannel;
    if (!channel)
        return Error('Channel not found.');
    const webhook = await getWebhook({ channel });
    db.prepare('INSERT INTO portalConnections (portalId, guildId, guildName, channelId, channelName, webhookId, webhookToken) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run([portalId, channel.guildId, channel.guild.name, channelId, channel.name, webhook.id, webhook.token]);
    return { portalId, guildId: channel.guildId, guildName: channel.guild.name, channelId, channelName: channel.name, webhookId: webhook.id, webhookToken: webhook.token! };
}
function deletePortalConnection(channelId: string): PortalConnection | null {
    const portalConnection = getPortalConnection(channelId);
    if (!portalConnection)
        return null;
    db.prepare('DELETE FROM portalConnections WHERE channelId = ?')
        .run(channelId);
    return portalConnection;
}
function getGuildPortalConnections(guildId: string): Collection<ChannelId, PortalConnection> {
    const portalConnections = db.prepare('SELECT * FROM portalConnections WHERE guildId = ?')
        .all(guildId);
    return new Collection<ChannelId, PortalConnection>(portalConnections.map(portalConnection => ([portalConnection.channelId, {
        portalId: portalConnection.portalId,
        guildId: portalConnection.guildId,
        guildName: portalConnection.guildName, 
        channelId: portalConnection.channelId, 
        channelName: portalConnection.channelName, 
        webhookId: portalConnection.webhookId, 
        webhookToken: portalConnection.webhookToken
    }])));
}
function getPortalConnection(channelId: string): PortalConnection | null {
    const portalConnection = db.prepare('SELECT * FROM portalConnections WHERE channelId = ?')
        .get(channelId);
    if (!portalConnection)
        return null;
    return {
        portalId: portalConnection.portalId,
        guildId: portalConnection.guildId,
        guildName: portalConnection.guildName,
        channelId: portalConnection.channelId,
        channelName: portalConnection.channelName,
        webhookId: portalConnection.webhookId,
        webhookToken: portalConnection.webhookToken
    };
}
function getPortalConnections(portalId: string): Collection<ChannelId, PortalConnection> {
    const portalConnections = db.prepare('SELECT * FROM portalConnections WHERE portalId = ?')
        .all(portalId);
    return new Collection<ChannelId, PortalConnection>(portalConnections.map(portalConnection => ([portalConnection.channelId, {
        portalId: portalConnection.portalId,
        guildId: portalConnection.guildId,
        guildName: portalConnection.guildName,
        channelId: portalConnection.channelId,
        channelName: portalConnection.channelName,
        webhookId: portalConnection.webhookId,
        webhookToken: portalConnection.webhookToken
    }])));
}
function updatePortalConnection(channelId: string, portalConnectionOptions: PortalConnectionOptions): PortalConnection | null {
    const portalConnection = getPortalConnection(channelId);
    if (!portalConnection)
        return null;
    // Update only the options in portalConnectionOptions that are not null
    const { guildName, channelName, webhookId, webhookToken } = portalConnectionOptions;
    db.prepare('UPDATE portalConnections SET guildName = ?, channelName = ?, webhookId = ?, webhookToken = ? WHERE channelId = ?')
        .run([
            guildName ?? portalConnection.guildName, 
            channelName ?? portalConnection.channelName, 
            webhookId ?? portalConnection.webhookId, 
            webhookToken ?? portalConnection.webhookToken, 
            channelId
        ]);
    return {
        portalId: portalConnection.portalId,
        guildId: portalConnection.guildId,
        guildName: guildName ?? portalConnection.guildName,
        channelId: portalConnection.channelId,
        channelName: channelName ?? portalConnection.channelName,
        webhookId: webhookId ?? portalConnection.webhookId,
        webhookToken: webhookToken ?? portalConnection.webhookToken
    };
}
function createPortalMessage({
    id,
    portalId, 
    messageId, 
    linkedChannelId, 
    linkedMessageId 
}: {
    id: PortalMessageId;
    portalId: PortalId;
    messageId: MessageId;
    linkedChannelId: ChannelId; 
    linkedMessageId: MessageId;
}): PortalMessage {
    // Note: Make sure id is the same for all linked messages
    db.prepare('INSERT INTO portalMessages (id, portalId, messageId, linkedChannelId, linkedMessageId) VALUES (?, ?, ?, ?, ?)')
        .run([id, portalId, messageId, linkedChannelId, linkedMessageId]);
    return {
        id,
        portalId: portalId,
        messageId: messageId,
        linkedChannelId: linkedChannelId,
        linkedMessageId: linkedMessageId
    };
}
function deletePortalMessages(id: PortalMessageId): Map<MessageId, PortalMessage> | null {
    const portalMessages = getPortalMessages(id);
    if (!portalMessages.size)
        return null;
    db.prepare('DELETE FROM portalMessages WHERE id = ?')
        .run(id);
    return portalMessages;
}
function getPortalMessages(id: PortalMessageId): Collection<MessageId, PortalMessage> {
    const portalMessages = db.prepare('SELECT * FROM portalMessages WHERE id = ?')
        .all(id);
    return new Collection<MessageId, PortalMessage>(portalMessages.map(portalMessage => ([portalMessage.linkedMessageId, {
        id: portalMessage.id,
        portalId: portalMessage.portalId,
        messageId: portalMessage.messageId,
        linkedChannelId: portalMessage.linkedChannelId,
        linkedMessageId: portalMessage.linkedMessageId
    }])));
}
function getPortalMessageId(messageId: MessageId, linkedMessage?: boolean): PortalMessageId | null {
    const idType = linkedMessage ? 'linkedMessageId' : 'messageId';
    const portalMessageId = db.prepare('SELECT id FROM portalMessages WHERE ' + idType + ' = ?')
        .get(messageId)?.id;
    if (!portalMessageId)
        return null;
    return portalMessageId;
}

// Keep track of setups
const connectionSetups = new Map<UserId, { channelId: string, portalId: string, expires: number }>();
const portalSetups = new Map<UserId, { name: string, emoji: string, customEmoji: boolean, portalId: string, channelId: string, expires: number }>();

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user?.tag}`)
});

client.on(Events.MessageCreate, async message => {
    // Ignore if webhook
    if (message.webhookId) return;
    // Ignore if DM
    if (!message.guildId) return;
    // Ignore if not TextChannel
    if (message.channel.type !== ChannelType.GuildText) return;

    if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/g);
        const command = args.shift()?.toLowerCase();

        switch (command) {
            case 'portal':
            case 'portals': {

                const portalConnection = getPortalConnection(message.channel.id);
                if (!portalConnection) {
                    message.reply({
                        content: 'This channel is not connected to any Portals.',
                    });
                    break;
                }
                const portal = getPortal(portalConnection.portalId);
                if (!portal) {
                    message.reply({
                        content: 'This channel is connected to a Portal that no longer exists.',
                    });
                    break;
                }
                const portalConnections = getPortalConnections(portalConnection.portalId);
                message.reply({
                    content: `Connected to Portal \`#${portal.id}\` - ${portal.emoji}${portal.name}.\nConnection shared with\n${portalConnections.map(c => `• **${c.guildName}** - ${c.channelName}`).join('\n')}`,
                });
                break;
            }
            case 'invite':
            case 'link': {
                message.reply('Invite me to your server: https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=537263168&scope=bot')
                break;
            }
            case 'help':
            case 'commands': {
                message.reply('`?portal` - Get information about the Portal connection of the current channel.\n`?join` - Join a Portal.\n`?leave` - Leave a Portal.\n`?delete` - Delete a Portal.\n`?invite` - Get an invite link for the bot.\n`?help` - Get a list of commands.');
                break;
            }
            case 'setup':
            case 'join': {
                // Check permissions
                if (!checkPermissions(message)) break;

                const portalGuildConnections = getGuildPortalConnections(message.guildId);
                if (portalGuildConnections.size > 0) {
                    message.reply('A server can currently only have one Portal connection. Please remove the current connection before setting up a new one.');
                    break;
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
                const portals = getPortals();
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
                                    options: portals.map(p => ({
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

                const portalConnection = deletePortalConnection(message.channel.id);
                if (!portalConnection) {
                    message.reply({
                        content: 'This channel is not connected to any Portals.',
                    });
                    break;
                }
                const portal = getPortal(portalConnection.portalId);
                if (!portal) {
                    message.reply({
                        content: 'This channel is connected to a Portal that no longer exists.',
                    });
                    break;
                }
                message.reply({
                    content: `Left Portal \`#${portalConnection.portalId}\` - ${portal.emoji}${portal.name}.`,
                });
                break;
            }
            case 'delete': {
                // Check permissions
                if (!checkPermissions(message)) break;

                const portalConnection = getPortalConnection(message.channel.id);
                if (!portalConnection) {
                    message.reply({
                        content: 'This channel is not connected to any Portals.',
                    });
                    break;
                }

                const portals = getPortals();
                const portalConnections = getPortalConnections(portalConnection.portalId);
                if (portalConnections.size > 1) {
                    message.reply('Cannot delete Portal with multiple connections.');
                    break;
                }
                if (portals.size <= 1) {
                    message.reply('Cannot delete last Portal.');
                    break;
                }
                const portal = deletePortal(portalConnection.portalId);
                message.reply(`Deleted Portal \`#${portalConnection.portalId}\` - ${portal?.emoji}${portal?.name}.`);
                break;
            }
        }
    }

    // Portal functionality
    const portalConnection = getPortalConnection(message.channel.id);
    if (!portalConnection) return;
    const portalConnections = getPortalConnections(portalConnection.portalId);

    // Send message to other channels
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
        return `https://cdn.discordapp.com/emojis/${id}.webp?size=48&quality=lossless\n`;
    });
    if (emojis && replacement) {
        // Replace message content matches
        for (let i = 0; i < emojis.length; i++) {
            message.content = message.content.replace(emojis[i], replacement[i]);
        }
    }
    // Stickers
    message.content += '\n' + message.stickers.map(s => s.url).join('\n');
    // Replies
    const originalReference = message.reference?.messageId ? await safeFetchMessage(message.channel, message.reference.messageId) : null;
    let content = message.content;

    const portalMessageId = generatePortalMessageId();

    for (const [channelId, portalConnection] of portalConnections) {
        // Don't send to same channel
        if (portalConnection.channelId === message.channel.id) continue;

        // Get channel
        const channel = await client.channels.fetch(portalConnection.channelId) as TextChannel | null;
        if (!channel) { // Remove connection if channel is not found
            deletePortalConnection(portalConnection.channelId);
            continue;
        }

        // Add replies
        if (originalReference) {
            const createReply = () => {
                const failed = '`[Reply failed]`\n';
                
                const refContent = originalReference.content.replace(/<@!?([0-9]+)>/g, (_, id) => { // Replace <@id> with @username
                    const user = client.users.cache.get(id);
                    if (!user) return `@Unknown`;
                    return `@${user.username}`;
                }).replace(/\n/g, ' ') // Remove newlines
                const refAuthorTag = originalReference.author.tag.split("@")[0].trim();
                const refPreview = refContent.length + refAuthorTag.length > 50 ? refContent.substring(0, 50 - refAuthorTag.length) + '...' : refContent;
                
                const referencePortalMessageId = originalReference.webhookId ?
                    getPortalMessageId(originalReference.id, true) : 
                    getPortalMessageId(originalReference.id);

                if (!referencePortalMessageId) return failed;
                const linkedPortalMessages = getPortalMessages(referencePortalMessageId);

                const localReferenceId = linkedPortalMessages.find(m => m.linkedChannelId === channel.id)?.linkedMessageId ?? // If we can find a message in this channel, use that
                    (originalReference.webhookId ? // Else, if the reply is to a webhook
                            linkedPortalMessages.first()?.messageId : // Use the messageId, since it means the source is in this channel (we are the source)
                            linkedPortalMessages.find(m => m.linkedChannelId === channel.id)?.linkedMessageId); // If it's not a webhook, it must be a linkedMessage from this channel

                if (!localReferenceId) return failed;
                return '[[Reply to `' + refAuthorTag + '` - `' + refPreview + '`]](https://discord.com/channels/' + channel.guildId + '/' + channel.id + '/' + localReferenceId + ')\n';
            }
            content = createReply() + message.content;
        }

        // Get webhook
        const webhook = await getWebhook({ channel, webhookId: portalConnection.webhookId });
        // Send webhook message
        const webhookMessage = await webhook.send({
            content: content,
            username: `${message.author.tag} ${message.guild?.name ? ` @ ${message.guild.name}` : ''}`,
            avatarURL: message.author.avatarURL() || undefined,
            files: message.attachments.map(a => ({
                attachment: a.url,
                name: a.name || undefined
            })),
            embeds: embeds,
            tts: message.tts,
            allowedMentions: {
                parse: ['users']
            }
        });

        createPortalMessage({ id: portalMessageId, portalId: portalConnection.portalId, messageId: message.id, linkedChannelId: portalConnection.channelId, linkedMessageId: webhookMessage.id });
    }
});

// Delete messages
client.on(Events.MessageDelete, async message => {
    // Ignore webhook deletions
    if (message.webhookId) return;

    // Check if message is a portal message
    const portalMessages = getPortalMessages(message.id);
    if (!portalMessages.size) return;

    // Delete linked messages
    for (const [messageId, portalMessage] of portalMessages) {
        // Find channel and message objects
        const channel = await client.channels.fetch(portalMessage.linkedChannelId) as TextChannel | null;
        if (!channel) continue;
        const message = await safeFetchMessage(channel, portalMessage.linkedMessageId);
        if (!message) continue;

        // Attempt to delete message
        const result = await deleteMessage(channel, portalMessage.linkedMessageId);
        // If result is an Error we couldn't delete the message
        if (result instanceof Error) {
            channel.send('Note: I need the `Manage Messages` permission to function properly.');
        }
    }
    // Delete portal message
    deletePortalMessages(message.id);
});

// Edit messages
client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    // Ignore webhook edits
    if (newMessage.webhookId) return;

    // Check if message is a portal message
    const portalMessages = getPortalMessages(newMessage.id);
    if (!portalMessages.size) return;

    // Edit linked messages
    for (const [messageId, portalMessage] of portalMessages) {
        // Find channel and message objects
        const channel = await client.channels.fetch(portalMessage.linkedChannelId) as TextChannel | null;
        if (!channel) continue;
        const message = await safeFetchMessage(channel, portalMessage.linkedMessageId);
        if (!message) continue;

        // Attempt to edit message
        await editMessage(channel, portalMessage.linkedMessageId, {
            content: newMessage.content,
            files: newMessage.attachments.map(a => ({
                attachment: a.url,
                name: a.name || undefined
            })),
            embeds: newMessage.embeds,
            allowedMentions: {
                parse: ['users']
            }
        });
    }
});

client.on(Events.InteractionCreate, async interaction => {
    try { // Try because discord.js is shit and throws errors for no reason
        // Join portal
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId !== 'portalSelect') return;
            const portalId = interaction.values[0];
            const portal = getPortal(portalId);

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
                    if (portalConnection instanceof Error) {
                        interaction.reply({ content: 'A weird error ocurred. Apparently this channel doesn\'t exist!', ephemeral: true });
                        return;
                    }
                    const portal = getPortal(portalConnection.portalId);
                    if (!portal) {
                        interaction.reply({ content: 'A weird error ocurred. Apparently this portal doesn\'t exist!', ephemeral: true });
                        return;
                    }
                    interaction.update({
                        content: `Joined \`$${portal.id}\` - ${portal.emoji}${portal.name}!`,
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

                    const portal = createPortal({ name: portalSetup.name, emoji: portalSetup.emoji, customEmoji: portalSetup.customEmoji });
                    portalSetups.delete(interaction.user.id);

                    const portalConnection = await createPortalConnection({ portalId: portal.id, channelId: portalSetup.channelId });
                    if (portalConnection instanceof Error) {
                        interaction.reply({ content: 'A weird error ocurred. Apparently this channel doesn\'t exist!', ephemeral: true });
                        return;
                    }
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

            interaction.message.awaitReactions({ filter, max: 1, time: 60000, errors: ['time'] })
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
                    portalCreation.portalId = generatePortalId();

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