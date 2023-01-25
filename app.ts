import {
    Client,
    Events,
    GatewayIntentBits,
    ComponentType,
    ButtonStyle,
    Interaction,
    TextInputStyle,
    MessageReaction,
    User,
    TextChannel,
    Embed,
    PermissionFlagsBits,
    Message,
    MessagePayload,
    WebhookEditMessageOptions,
    Webhook,
    Collection,
    ChannelType,
    Invite,
} from "discord.js";
import sqlite3 from "better-sqlite3";
import dotenv from "dotenv";
import { prefix } from "./config.json";
dotenv.config();

const token = process.env.TOKEN;

//? Hardcoded for dev purposes
const nameSuggestions = {
    beginning: [
        "Cool",
        "Hot",
        "Steamy",
        "Awesome",
        "Dank",
        "Dark",
        "Deep",
        "Shiny",
        "Haunted",
        "Intense",
    ],
    middle: [
        "discussion",
        "chill",
        "grill",
        "study",
        "programming",
        "gaming",
        "text",
        "bot",
        "wrestling",
    ],
    end: [
        "zone",
        "place",
        "room",
        "space",
        "world",
        "realm",
        "dimension",
        "area",
        "portal",
        "hangout",
    ],
};
const emojiSuggestions = [
    "🌌",
    "😂",
    "👽",
    "🎅",
    "👑",
    "🥋",
    "🎮",
    "🎲",
    "🎨",
    "🎬",
    "🎤",
    "🎸",
    "🎹",
    "🎻",
    "🎺",
    "🎼",
    "🎵",
    "🎶",
    "🎧",
    "🎙️",
    "🎚️",
    "🎛️",
    "🎞️",
    "📽️",
    "📺",
    "📷",
    "📸",
    "📹",
    "📼",
    "🔍",
    "🔎",
    "🔬",
    "🔭",
    "📡",
    "🕯️",
    "💡",
    "🔦",
    "🏮",
    "📔",
    "📕",
    "📖",
    "📗",
    "📘",
    "📙",
    "📚",
    "📓",
    "📒",
    "📃",
    "📜",
    "📄",
    "📰",
    "🗞️",
    "📑",
    "🔖",
    "🏷️",
    "💰",
    "💴",
    "💵",
    "💶",
    "💷",
    "💸",
    "💳",
    "🧾",
    "💹",
    "💱",
    "💲",
    "✉️",
    "📧",
    "📨",
    "📩",
    "📤",
    "📥",
    "📦",
    "📫",
    "📪",
    "📬",
    "📭",
    "📮",
    "🗳️",
    "✏️",
    "✒️",
    "🖋️",
    "🖊️",
    "🖌️",
    "🖍️",
    "📝",
    "💼",
    "📁",
    "📂",
    "🗂️",
    "📅",
    "📆",
    "🗒️",
    "🗓️",
    "📇",
    "📈",
    "📉",
    "📊",
    "📋",
    "📌",
    "📍",
    "📎",
    "🖇️",
    "📏",
    "📐",
];
//? END

// Types
type Portal = {
    id: string;
    name: string;
    emoji: string;
    customEmoji: boolean;
    nsfw: boolean;
    exclusive: boolean;
    password: string;
};
type PortalConnection = {
    portalId: string;
    guildId: string;
    guildName: string;
    channelId: string;
    channelName: string;
    guildInvite?: string;
    webhookId: string;
    webhookToken: string;
};
type PortalConnectionOptions = {
    guildName?: string;
    channelName?: string;
    guildInvite?: string;
    webhookId?: string;
    webhookToken?: string;
};
type PortalMessage = {
    id: string;
    portalId: string;
    messageId: string;
    channelId: string;
    messageType: MessageType;
};
type PortalId = string;
type ChannelId = string;
type MessageId = string;
type UserId = string;
type PortalMessageId = string;
type MessageType = "original" | "linked" | "linkedAttachment";

// Config
const portalIntro = {
    portal: "**Welcome to the setup!** Select which Portal you want this channel to be connected to.",
    askInvite:
        "**Do you want to share an invite link to your server** with the Portal? You can always remove it by re-joining the Portal.",
    confirm: `**Do you want to join this Portal?** You can also choose to share an invite to this server with the Portal. You can always leave using \`${prefix}leave\`.`,
};
const webhookAvatars = [
    "https://cdn.discordapp.com/avatars/1066196719173386261/e9b57e69088a7f5eff063317335bcb0f.webp",
    "https://cdn.discordapp.com/avatars/1057901464435044403/54ea7de9372438c6272614c510e4aa74.webp",
    "https://i.imgur.com/AJDWIxq.png",
    "https://i.imgur.com/UHEJ41P.png",
];

// Database
const db = sqlite3("./db.sqlite");
process.on("exit", () => {
    db.close();
});
// Prevent crashes
process.on("uncaughtException", (err) => {
    console.log("Uncaught exception!");
    console.error(err);
});

// Create tables
console.log("Creating tables...");
// Run this once for previous installations
// db.prepare(`DROP TABLE IF EXISTS portalMessages`).run();
db.prepare(
    `CREATE TABLE IF NOT EXISTS portals (id TEXT PRIMARY KEY, name TEXT, emoji TEXT, customEmoji INTEGER DEFAULT 0, nsfw INTEGER DEFAULT 0, private INTEGER DEFAULT 0, password TEXT)`
).run();
db.prepare(
    `CREATE TABLE IF NOT EXISTS portalConnections (
    portalId TEXT, 
    guildId TEXT, 
    guildName TEXT, 
    channelId TEXT, 
    channelName TEXT, 
    guildInvite TEXT DEFAULT '', 
    webhookId TEXT, 
    webhookToken TEXT, 
    FOREIGN KEY(portalId) REFERENCES portals(id)
)`
).run();
db.prepare(
    `CREATE TABLE IF NOT EXISTS portalMessages (
        id TEXT, 
        portalId TEXT, 
        messageId TEXT, 
        channelId TEXT,
        messageType TEXT,
        FOREIGN KEY(portalId) REFERENCES portals(id)
    )` // messageType is one of "original" | "linked" | "linkedAttachment"
).run();
// Create default portal if none exists
if (!db.prepare("SELECT COUNT(1) FROM portals").get()) {
    db.prepare(
        "INSERT INTO portals (id, name, emoji, customEmoji, nsfw, private, password) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(["123456", "Genesis", "🎆", false, false, false, ""]);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

// Helpers
const sendExpired = (interaction: Interaction) => {
    if (interaction.isRepliable())
        interaction.reply({ content: "Expired.", ephemeral: true });
};
const generateName = (): string =>
    `${
        nameSuggestions.beginning[
            Math.floor(Math.random() * nameSuggestions.beginning.length)
        ]
    } ${
        nameSuggestions.middle[
            Math.floor(Math.random() * nameSuggestions.middle.length)
        ]
    } ${
        nameSuggestions.end[
            Math.floor(Math.random() * nameSuggestions.end.length)
        ]
    }`;
const generateEmoji = (): string =>
    emojiSuggestions[Math.floor(Math.random() * emojiSuggestions.length)];
const generatePortalId = (): PortalId => {
    let id = Math.floor(Math.random() * 1000000).toString();
    const portals = getPortals();
    while (portals[id as keyof typeof portals])
        id = Math.floor(Math.random() * 1000000).toString();
    return id;
};
const generatePortalMessageId = (): PortalMessageId => {
    const id = Math.floor(Math.random() * 1000000).toString();
    const portalMessages = getPortalMessages(id);
    if (portalMessages[id as keyof typeof portalMessages])
        return generatePortalMessageId();
    return id;
};
async function safeFetchMessage(
    channel: TextChannel,
    messageId: string
): Promise<Message<true> | null> {
    try {
        return await channel.messages.fetch(messageId);
    } catch (err) {
        return null;
    }
}
async function editMessage(
    channel: TextChannel,
    messageId: string,
    options: string | MessagePayload | WebhookEditMessageOptions
): Promise<Error | Message<boolean> | null> {
    const portalConnection = getPortalConnection(channel.id);
    if (!portalConnection) return Error("No Portal connection found.");

    try {
        // Edit message using webhook
        const webhook = await getWebhook({
            channel,
            webhookId: portalConnection.webhookId,
        });
        if (!webhook) return Error("No webhook found.");
        return await webhook.editMessage(messageId, options);
    } catch (err) {
        console.log("Failed to edit message using webhook.");
        console.error(err);
        return null;
    }
}
async function deleteMessage(
    channel: TextChannel,
    messageId: string
): Promise<Error | Message<true> | null> {
    // Fetch message
    const message = await safeFetchMessage(channel, messageId);
    if (!message) return null;
    try {
        // Attempt deletion using webhook
        const portalConnection = getPortalConnection(channel.id);
        const webhook = await getWebhook({
            channel,
            webhookId: portalConnection?.webhookId,
        });
        if (!webhook) throw Error("No webhook found.");
        await webhook.deleteMessage(messageId);

        return message;
    } catch (err) {
        // If webhook fails, attempt deletion using bot account
        try {
            await message.delete();
            return message;
        } catch (err) {
            // We don't have permission to delete the message
            return Error("No permission to delete message.");
        }
    }
}
async function safeFetchChannel(
    channelId: string
): Promise<TextChannel | null> {
    try {
        return (await client.channels.fetch(channelId)) as TextChannel;
    } catch (err) {
        console.log("Failed to fetch channel.");
        // console.error(err);
        return null;
    }
}
async function createWebhook(channel: TextChannel): Promise<Webhook> {
    const webhook = await channel.createWebhook({
        name: "Portal connection",
        avatar: webhookAvatars[
            Math.floor(Math.random() * webhookAvatars.length)
        ],
        reason: "New Portal connection established",
    });
    return webhook;
}
async function getWebhook({
    channel,
    webhookId,
}: {
    channel: string | TextChannel;
    webhookId?: string;
}): Promise<Webhook | null> {
    if (typeof channel === "string") {
        const fetchedChannel = await safeFetchChannel(channel);
        if (!fetchedChannel) return null;
        channel = fetchedChannel;
    }

    if (!webhookId) return createWebhook(channel);
    const webhook = (await channel.fetchWebhooks()).get(webhookId);
    if (!webhook) {
        const webhook = await createWebhook(channel);
        updatePortalConnection(channel.id, {
            webhookId: webhook.id,
            webhookToken: webhook.token!,
        });
        return webhook;
    } else return webhook;
}
async function deleteWebhook({
    channel,
    webhookId,
}: {
    channel: string | TextChannel;
    webhookId?: string;
}): Promise<Webhook | null> {
    const webhook = await getWebhook({ channel, webhookId });
    if (!webhook) return null;
    webhook.delete();
    return webhook;
}
function checkPermissions(message: Message): boolean {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        message.reply(
            "You need the `Manage Channels` permission to use this command."
        );
        return false;
    }
    return true;
}
async function createInvite(channel: TextChannel): Promise<Invite | Error> {
    try {
        return await channel.createInvite({
            temporary: false,
            maxAge: 0,
            maxUses: 0,
            unique: true,
            reason: "Portal invite",
        });
    } catch (error) {
        console.log("Failed to create invite.");
        console.error(error);
        return Error("Failed to create invite.");
    }
}
// Database helpers
function createPortal({
    name,
    emoji,
    customEmoji,
    nsfw,
    exclusive,
    password,
}: {
    name: string;
    emoji: string;
    customEmoji: boolean;
    nsfw: boolean;
    exclusive: boolean;
    password: string;
}): Portal {
    const portalId = generatePortalId();
    db.prepare(
        "INSERT INTO portals (id, name, emoji, customEmoji, nsfw, private, password) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run([
        portalId,
        name,
        emoji,
        Number(customEmoji),
        Number(nsfw),
        Number(exclusive),
        password,
    ]);
    return {
        id: portalId,
        name,
        emoji,
        customEmoji,
        nsfw,
        exclusive,
        password,
    };
}
function deletePortal(portalId: string): Portal | null {
    const portal = getPortal(portalId);
    if (!portal) return null;
    db.prepare("DELETE FROM portalConnections WHERE portalId = ?").run(
        portalId
    );
    db.prepare("DELETE FROM portalMessages WHERE portalId = ?").run(portalId);
    db.prepare("DELETE FROM portals WHERE id = ?").run(portalId);
    return portal;
}
function getPortal(portalId: string): Portal | null {
    const portal = db
        .prepare("SELECT * FROM portals WHERE id = ?")
        .get(portalId);
    if (!portal) return null;
    return {
        id: portal.id,
        name: portal.name,
        emoji: portal.emoji,
        customEmoji: Boolean(portal.customEmoji),
        nsfw: Boolean(portal.nsfw),
        exclusive: Boolean(portal.private),
        password: portal.password,
    };
}
function getPortals(): Collection<PortalId, Portal> {
    const portals = db.prepare("SELECT * FROM portals").all();
    return new Collection<PortalId, Portal>(
        portals.map((portal) => [
            portal.id,
            {
                id: portal.id,
                name: portal.name,
                emoji: portal.emoji,
                customEmoji: Boolean(portal.customEmoji),
                nsfw: Boolean(portal.nsfw),
                exclusive: Boolean(portal.private),
                password: portal.password,
            },
        ])
    );
}
async function createPortalConnection({
    portalId,
    channelId,
    guildInvite,
}: {
    portalId: string;
    channelId: string;
    guildInvite?: string;
}): Promise<PortalConnection | Error> {
    const channel = await safeFetchChannel(channelId);
    if (!channel) return Error("Channel not found.");
    const webhook = await getWebhook({ channel });
    if (!webhook) return Error("Failed to create webhook.");
    db.prepare(
        "INSERT INTO portalConnections (portalId, guildId, guildName, channelId, channelName, guildInvite, webhookId, webhookToken) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run([
        portalId,
        channel.guildId,
        channel.guild.name,
        channelId,
        channel.name,
        guildInvite || "",
        webhook.id,
        webhook.token,
    ]);
    return {
        portalId,
        guildId: channel.guildId,
        guildName: channel.guild.name,
        channelId,
        channelName: channel.name,
        guildInvite: guildInvite || "",
        webhookId: webhook.id,
        webhookToken: webhook.token!,
    };
}
async function deletePortalConnection(
    channelId: string
): Promise<PortalConnection | null> {
    const portalConnection = getPortalConnection(channelId);
    if (!portalConnection) return null;
    // Delete webhook
    await deleteWebhook({ channel: channelId });

    // Delete portal connection
    db.prepare("DELETE FROM portalConnections WHERE channelId = ?").run(
        channelId
    );
    return portalConnection;
}
function getGuildPortalConnections(
    guildId: string
): Collection<ChannelId, PortalConnection> {
    const portalConnections = db
        .prepare("SELECT * FROM portalConnections WHERE guildId = ?")
        .all(guildId);
    return new Collection<ChannelId, PortalConnection>(
        portalConnections.map((portalConnection) => [
            portalConnection.channelId,
            {
                portalId: portalConnection.portalId,
                guildId: portalConnection.guildId,
                guildName: portalConnection.guildName,
                channelId: portalConnection.channelId,
                channelName: portalConnection.channelName,
                guildInvite: portalConnection.guildInvite,
                webhookId: portalConnection.webhookId,
                webhookToken: portalConnection.webhookToken,
            },
        ])
    );
}
function getPortalConnection(channelId: string): PortalConnection | null {
    const portalConnection = db
        .prepare("SELECT * FROM portalConnections WHERE channelId = ?")
        .get(channelId);
    if (!portalConnection) return null;
    return {
        portalId: portalConnection.portalId,
        guildId: portalConnection.guildId,
        guildName: portalConnection.guildName,
        channelId: portalConnection.channelId,
        channelName: portalConnection.channelName,
        guildInvite: portalConnection.guildInvite,
        webhookId: portalConnection.webhookId,
        webhookToken: portalConnection.webhookToken,
    };
}
function getPortalConnections(
    portalId: string
): Collection<ChannelId, PortalConnection> {
    const portalConnections = db
        .prepare("SELECT * FROM portalConnections WHERE portalId = ?")
        .all(portalId);
    return new Collection<ChannelId, PortalConnection>(
        portalConnections.map((portalConnection) => [
            portalConnection.channelId,
            {
                portalId: portalConnection.portalId,
                guildId: portalConnection.guildId,
                guildName: portalConnection.guildName,
                channelId: portalConnection.channelId,
                channelName: portalConnection.channelName,
                guildInvite: portalConnection.guildInvite,
                webhookId: portalConnection.webhookId,
                webhookToken: portalConnection.webhookToken,
            },
        ])
    );
}
function updatePortalConnection(
    channelId: string,
    portalConnectionOptions: PortalConnectionOptions
): PortalConnection | null {
    const portalConnection = getPortalConnection(channelId);
    if (!portalConnection) return null;
    // Update only the options in portalConnectionOptions that are not null
    const { guildName, channelName, guildInvite, webhookId, webhookToken } =
        portalConnectionOptions;
    db.prepare(
        "UPDATE portalConnections SET guildName = ?, channelName = ?, webhookId = ?, webhookToken = ? WHERE channelId = ?"
    ).run([
        guildName ?? portalConnection.guildName,
        channelName ?? portalConnection.channelName,
        guildInvite ?? portalConnection.guildInvite,
        webhookId ?? portalConnection.webhookId,
        webhookToken ?? portalConnection.webhookToken,
        channelId,
    ]);
    return {
        portalId: portalConnection.portalId,
        guildId: portalConnection.guildId,
        guildName: guildName ?? portalConnection.guildName,
        channelId: portalConnection.channelId,
        channelName: channelName ?? portalConnection.channelName,
        guildInvite: guildInvite ?? portalConnection.guildInvite,
        webhookId: webhookId ?? portalConnection.webhookId,
        webhookToken: webhookToken ?? portalConnection.webhookToken,
    };
}
function createPortalMessage({
    id,
    portalId,
    messageId,
    channelId,
    messageType,
}: {
    id: PortalMessageId;
    portalId: PortalId;
    messageId: MessageId;
    channelId: ChannelId;
    messageType: MessageType;
}): PortalMessage {
    // Note: Make sure id is the same for all linked messages
    db.prepare(
        "INSERT INTO portalMessages (id, portalId, messageId, channelId, messageType) VALUES (?, ?, ?, ?, ?)"
    ).run([id, portalId, messageId, channelId, messageType]);
    return {
        id,
        portalId,
        messageId,
        channelId,
        messageType,
    };
}
function deletePortalMessages(
    id: PortalMessageId
): Map<MessageId, PortalMessage> | null {
    const portalMessages = getPortalMessages(id);
    if (!portalMessages.size) return null;
    db.prepare("DELETE FROM portalMessages WHERE id = ?").run(id);
    return portalMessages;
}
function getPortalMessages(
    id: PortalMessageId
): Collection<MessageId, PortalMessage> {
    const portalMessages = db
        .prepare("SELECT * FROM portalMessages WHERE id = ?")
        .all(id);
    return new Collection<MessageId, PortalMessage>(
        portalMessages.map((portalMessage) => [
            portalMessage.messageId,
            {
                id: portalMessage.id,
                portalId: portalMessage.portalId,
                messageId: portalMessage.messageId,
                channelId: portalMessage.channelId,
                messageType: portalMessage.messageType,
            },
        ])
    );
}
function getPortalMessageId(messageId: MessageId): PortalMessageId | null {
    const portalMessageId = db
        .prepare("SELECT id FROM portalMessages WHERE messageId = ?")
        .get(messageId)?.id;
    if (!portalMessageId) return null;
    return portalMessageId;
}

// Keep track of setups
const connectionSetups = new Map<
    UserId,
    { channelId: string; portalId: string; expires: number }
>();
const portalSetups = new Map<
    UserId,
    {
        name: string;
        emoji: string;
        customEmoji: boolean;
        portalId: string;
        channelId: string;
        nsfw: boolean;
        exclusive: boolean;
        password: string;
        expires: number;
    }
>();

client.once(Events.ClientReady, (c) => {
    console.log(`Ready! Logged in as ${c.user?.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
    // Ignore if webhook
    if (message.webhookId) return;
    // Ignore if DM
    if (!message.guildId) return;
    // Ignore if not TextChannel
    if (message.channel.type !== ChannelType.GuildText) return;

    // Portal functionality
    (async () => {
        // why do I have to check this type again? ask typescript...
        if (message.channel.type !== ChannelType.GuildText) return;

        const portalConnection = getPortalConnection(message.channel.id);
        if (!portalConnection) return;
        const portalConnections = getPortalConnections(
            portalConnection.portalId
        );

        // Send message to other channels
        // -- Preprocess message --
        // Replace image embeds with links
        const embeds = message.embeds
            .map((e) => {
                if (!e.data.url) return e;
                if (!message.content.includes(e.data.url))
                    message.content += `\n${e.data.url}`;
                return null;
            })
            .filter((e) => e !== null) as Embed[];

        // Convert unknown emojis
        const emojis = message.content.match(/<a?:[a-zA-Z0-9_]+:[0-9]+>/g);
        const replacement = emojis?.map((e) => {
            const animated = e.startsWith("<a:");
            // Match all numbers after :
            const id = e.match(/:[0-9]+>/)?.[0].slice(1, -1);
            if (!id) return e;
            const emoji = client.emojis.cache.get(id);
            if (emoji) return emoji.toString();
            return `https://cdn.discordapp.com/emojis/${id}.${
                animated ? "gif" : "webp"
            }?size=48&quality=lossless\n`;
        });
        if (emojis && replacement) {
            // Replace message content matches
            for (let i = 0; i < emojis.length; i++) {
                message.content = message.content.replace(
                    emojis[i],
                    replacement[i]
                );
            }
        }
        // Stickers
        message.content += "\n" + message.stickers.map((s) => s.url).join("\n");
        // Replies
        const originalReference = message.reference?.messageId
            ? await safeFetchMessage(
                  message.channel,
                  message.reference.messageId
              )
            : null;
        let content = message.content;
        const getLinked = async () => {
            const failed = "`[Reply failed]`\n";

            if (!originalReference) return failed;

            // Remove first line if it starts with "`[Reply failed]`" or "[[Reply to `"
            const refContent =
                // check if content is a link to cdn.discordapp.com/attachments or media.discordapp.net/attachments
                (
                    originalReference.content === "" ||
                    originalReference.content
                        .trim()
                        .match(
                            /https?:\/\/(cdn|media)\.discordapp\.com\/attachments/
                        )
                        ? "(Click to see attachment 🖾)"
                        : originalReference.content.startsWith(
                              "`[Reply failed]`"
                          ) ||
                          originalReference.content.startsWith("[[Reply to `")
                        ? originalReference.content
                              .split("\n")
                              .slice(1)
                              .join("\n")
                        : originalReference.content
                )
                    .replace(/<@!?([0-9]+)>/g, (_, id) => {
                        // Replace <@id> with @username
                        const user = client.users.cache.get(id);
                        if (!user) return `@Unknown`;
                        return `@${user.username}`;
                    })
                    .replace(/\n/g, " "); // Remove newlines

            const refAuthorTag = originalReference.author.tag
                .split("@")[0]
                .trim();
            const refPreview =
                refContent.length + refAuthorTag.length > 50
                    ? refContent.substring(0, 50 - refAuthorTag.length) + "..."
                    : refContent;

            let referencePortalMessageId = getPortalMessageId(
                originalReference.id
            );

            if (!referencePortalMessageId) {
                // Try again after 1s
                await new Promise((resolve) => setTimeout(resolve, 1000));
                referencePortalMessageId = getPortalMessageId(
                    originalReference.id
                );
            }

            if (!referencePortalMessageId) return failed;
            const linkedPortalMessages = getPortalMessages(
                referencePortalMessageId
            );

            return { refAuthorTag, refPreview, linkedPortalMessages };
        };
        const reply = await getLinked();

        const portalMessageId = generatePortalMessageId();

        // Send to other channels and add to database
        // Use a promise so we can wait for them all to finish
        // When all messages have been sent, add the original to the database
        const sendPromises = portalConnections.map(async (portalConnection) => {
            // Don't send to same channel
            if (portalConnection.channelId === message.channel.id) return;

            // Get channel
            const channel = await safeFetchChannel(portalConnection.channelId);
            if (!channel) {
                // Remove connection if channel is not found
                deletePortalConnection(portalConnection.channelId);
                return;
            }

            let newContent = content.slice();

            // Add replies
            if (originalReference) {
                const buildReply = () => {
                    if (typeof reply === "string") return reply;
                    const { refAuthorTag, refPreview, linkedPortalMessages } =
                        reply;

                    // Fetch the message id of the reply in the portalConnection channel
                    const localReferenceId = linkedPortalMessages.find(
                        (linkedPortalMessage) =>
                            linkedPortalMessage.channelId ===
                            portalConnection.channelId
                    )?.messageId;

                    if (!localReferenceId) return "`[Reply failed]`\n";
                    return (
                        "[[Reply to `" +
                        refAuthorTag +
                        "` - `" +
                        refPreview +
                        "`]](https://discord.com/channels/" +
                        channel.guildId +
                        "/" +
                        channel.id +
                        "/" +
                        localReferenceId +
                        ")\n"
                    );
                };
                newContent = buildReply() + message.content;
            }

            // Get webhook
            const webhook = await getWebhook({
                channel,
                webhookId: portalConnection.webhookId,
            });
            // If no webhook was found, the channel doesn't exist and we should delete the connection
            if (!webhook) {
                deletePortalConnection(portalConnection.channelId);
                return;
            }
            // Send webhook message
            // Send a separate message for each attachment to prevent uploading them all again
            const attachments = message.attachments.toJSON();

            const firstMessage = await webhook.send({
                content: newContent.trim()
                    ? newContent
                    : attachments.shift()?.url,
                username: `${message.author.tag} ${
                    message.guild?.name ? ` @ ${message.guild.name}` : ""
                }`,
                avatarURL: message.author.avatarURL() || undefined,
                embeds: embeds,
                tts: message.tts,
                allowedMentions: {
                    parse: ["users"],
                },
            });

            createPortalMessage({
                id: portalMessageId,
                portalId: portalConnection.portalId,
                messageId: firstMessage.id,
                channelId: firstMessage.channel.id,
                messageType: "linked",
            });
            // Send remaining attachments
            for (const attachment of attachments) {
                const webhookMessage = await webhook.send({
                    content: attachment.url,
                    username: `${message.author.tag} ${
                        message.guild?.name ? ` @ ${message.guild.name}` : ""
                    }`,
                    avatarURL: message.author.avatarURL() || undefined,
                    tts: message.tts,
                    allowedMentions: {
                        parse: ["users"],
                    },
                });

                createPortalMessage({
                    id: portalMessageId,
                    portalId: portalConnection.portalId,
                    messageId: webhookMessage.id,
                    channelId: webhookMessage.channel.id,
                    messageType: "linkedAttachment",
                });
            }
        });
        await Promise.all(sendPromises);
        // Add original to database
        createPortalMessage({
            id: portalMessageId,
            portalId: portalConnection.portalId,
            messageId: message.id,
            channelId: message.channel.id,
            messageType: "original",
        });
    })();

    if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/g);
        const command = args.shift()?.toLowerCase();

        switch (command) {
            case "portal":
            case "portals": {
                const portalConnection = getPortalConnection(
                    message.channel.id
                );
                if (!portalConnection) {
                    message.reply({
                        content:
                            "This channel is not connected to any Portals.",
                    });
                    break;
                }
                const portal = getPortal(portalConnection.portalId);
                if (!portal) {
                    message.reply({
                        content:
                            "This channel is connected to a Portal that no longer exists.",
                    });
                    break;
                }
                const portalConnections = getPortalConnections(
                    portalConnection.portalId
                );

                portalConnections.forEach(async (portalConnection) => {
                    const channel = await safeFetchChannel(
                        portalConnection.channelId
                    );
                    // If no channel was found, the channel doesn't exist and we should delete the connection
                    if (!channel) {
                        deletePortalConnection(portalConnection.channelId);
                        return;
                    }
                    const webhook = await getWebhook({
                        channel: channel,
                        webhookId: portalConnection.webhookId,
                    });
                    // If no webhook was found, the channel doesn't exist and we should delete the connection
                    if (!webhook) {
                        deletePortalConnection(portalConnection.channelId);
                        return;
                    }

                    let portalMessageId = getPortalMessageId(message.id);
                    if (!portalMessageId) {
                        // Wait 1s and try again
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000)
                        );
                        portalMessageId = getPortalMessageId(message.id);
                    }
                    console.log(getPortalMessages(portalMessageId ?? "asd"));

                    const replyId =
                        portalConnection.channelId === message.channel.id
                            ? message.id
                            : portalMessageId
                            ? getPortalMessages(portalMessageId).find(
                                  (linkedPortalMessage) =>
                                      linkedPortalMessage.channelId ===
                                      portalConnection.channelId
                              )?.messageId
                            : undefined;

                    webhook.send({
                        content:
                            `${
                                replyId
                                    ? `[[Reply to \`${
                                          message.author.tag
                                      }\` - \`${message.content
                                          .split("\n")[0]
                                          .slice(
                                              0,
                                              40
                                          )}\`]](<https://discord.com/channels/${
                                          channel.guildId
                                      }/${channel.id}/${replyId}>)`
                                    : `\`[Reply failed]\``
                            }\nConnected to Portal \`#` +
                            portal.id +
                            "` - " +
                            portal.emoji +
                            portal.name +
                            (portal.nsfw ? "🔞" : "") +
                            (portal.exclusive ? "🔒" : "") +
                            (portal.password
                                ? "\nPassword: ||" + portal.password + "||"
                                : "") +
                            ".\nConnection shared with\n" +
                            portalConnections
                                .map(
                                    (c) =>
                                        `• **${
                                            c.guildInvite
                                                ? `[${c.guildName}](<https://discord.gg/${c.guildInvite}>)`
                                                : c.guildName
                                        }** - #${c.channelName}`
                                )
                                .join("\n") +
                                "\n[Invite me](https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=275415170113&scope=bot)",
                        avatarURL: message.client.user.avatarURL() || "",
                        username:
                            portalConnection.guildId === message.guildId
                                ? message.client.user.username
                                : `${message.client.user.username} @ ${message.guild?.name}`,
                    });
                });
                break;
            }
            case "invite":
            case "link": {
                message.reply(
                    "Invite me to your server: https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=275415170113&scope=bot"
                );
                break;
            }
            case "help":
            case "commands": {
                message.reply(
                    `\`${prefix}portal\` - Get information about the Portal connection of the current channel.\n\`${prefix}join\` - Join a Portal.\n\`${prefix}leave\` - Leave a Portal.\n\`${prefix}delete\` - Delete a Portal.\n\`${prefix}invite\` - Get an invite link for the bot.\n\`${prefix}help\` - Get a list of commands.`
                );
                break;
            }
            case "setup":
            case "join": {
                // Check permissions
                if (!checkPermissions(message)) break;

                const portalGuildConnections = getGuildPortalConnections(
                    message.guildId
                );
                if (portalGuildConnections.size > 0) {
                    message.reply(
                        "A server can currently only have one Portal connection. Please remove the current connection before setting up a new one."
                    );
                    break;
                }
                // Create new connectionSetup
                if (connectionSetups.has(message.author.id))
                    connectionSetups.delete(message.author.id);

                connectionSetups.set(message.author.id, {
                    channelId: message.channel.id,
                    portalId: "",
                    expires: Date.now() + 60000,
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
                                    customId: "portalSelect",
                                    maxValues: 1,
                                    minValues: 1,
                                    options: portals.map((p) => ({
                                        label: `${
                                            p.customEmoji ? "" : p.emoji
                                        }${p.name}${p.nsfw ? "🔞" : ""}${
                                            p.exclusive ? "🔒" : ""
                                        }`,
                                        value: p.id,
                                    })),
                                    placeholder: "Select a Portal",
                                },
                            ],
                        },
                        {
                            type: ComponentType.ActionRow,
                            components: [
                                {
                                    type: ComponentType.Button,
                                    customId: "portalCreate",
                                    label: "Create new Portal",
                                    style: ButtonStyle.Primary,
                                },
                                {
                                    type: ComponentType.Button,
                                    customId: "portalSelectCancel",
                                    label: "Cancel",
                                    style: ButtonStyle.Danger,
                                },
                            ],
                        },
                    ],
                });
                break;
            }
            case "leave": {
                // Check permissions
                if (!checkPermissions(message)) break;

                const portalConnection = await deletePortalConnection(
                    message.channel.id
                );
                if (!portalConnection) {
                    message.reply({
                        content:
                            "This channel is not connected to any Portals.",
                    });
                    break;
                }
                const portal = getPortal(portalConnection.portalId);
                if (!portal) {
                    message.reply({
                        content:
                            "This channel is connected to a Portal that no longer exists.",
                    });
                    break;
                }
                message.reply({
                    content: `Left Portal \`#${portalConnection.portalId}\` - ${portal.emoji}${portal.name}.`,
                });
                break;
            }
            case "delete": {
                // Check permissions
                if (!checkPermissions(message)) break;

                const portalConnection = getPortalConnection(
                    message.channel.id
                );
                if (!portalConnection) {
                    message.reply({
                        content:
                            "This channel is not connected to any Portals.",
                    });
                    break;
                }

                const portals = getPortals();
                const portalConnections = getPortalConnections(
                    portalConnection.portalId
                );
                if (portalConnections.size > 1) {
                    message.reply(
                        "Cannot delete Portal with multiple connections."
                    );
                    break;
                }
                if (portals.size <= 1) {
                    message.reply("Cannot delete last Portal.");
                    break;
                }
                const portal = deletePortal(portalConnection.portalId);
                message.reply(
                    `Deleted Portal \`#${portalConnection.portalId}\` - ${portal?.emoji}${portal?.name}.`
                );
                break;
            }
        }
    }
});

// Delete messages
client.on(Events.MessageDelete, async (message) => {
    // Ignore webhook deletions
    if (message.webhookId) return;

    // Check if message is a portal message
    const portalMessageId = getPortalMessageId(message.id);
    if (!portalMessageId) return;
    const portalMessages = getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    // Delete linked messages
    for (const [messageId, portalMessage] of portalMessages) {
        // Find channel and message objects
        const channel = await safeFetchChannel(portalMessage.channelId);
        if (!channel) continue;
        const message = await safeFetchMessage(
            channel,
            portalMessage.messageId
        );
        if (!message) continue;

        // Attempt to delete message
        const result = await deleteMessage(channel, portalMessage.messageId);
        // If result is an Error we couldn't delete the message
        if (result instanceof Error) {
            channel.send(
                "Note: I need the `Manage Messages` permission to function properly."
            );
        }
    }
    // Delete portal message
    deletePortalMessages(message.id);
});

// Edit messages
client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    // Ignore webhook edits
    if (newMessage.webhookId) return;
    console.log(_oldMessage, newMessage);
    // Check if message is a portal message
    const portalMessageId = getPortalMessageId(newMessage.id);
    if (!portalMessageId) return;
    const portalMessages = getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    // Edit linked messages
    for (const [messageId, portalMessage] of portalMessages) {
        // Find channel and message objects
        const channel = await safeFetchChannel(portalMessage.messageId);
        if (!channel) continue;
        const message = await safeFetchMessage(
            channel,
            portalMessage.messageId
        );
        if (!message) continue;

        // Attempt to edit message
        await editMessage(channel, portalMessage.messageId, {
            content: newMessage.content,
            // files: newMessage.attachments.map((a) => ({
            //     attachment: a.url,
            //     name: a.name || undefined,
            // })),
            embeds: newMessage.embeds,
            allowedMentions: {
                parse: ["users"],
            },
        });
    }
});

// Channel updates
client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
    // Return if not a text channel
    if (newChannel.type !== ChannelType.GuildText) return;

    // Check if channel is a portal channel
    const portalConnection = getPortalConnection(newChannel.id);
    if (!portalConnection) return;

    // Update portal connection
    updatePortalConnection(newChannel.id, {
        channelName: newChannel.name,
        guildName: newChannel.guild.name,
    });

    // Check of nsfw change
    const portal = getPortal(portalConnection.portalId);
    if (!portal) return;
    // Suspend portal if nsfw changed
    if (portal.nsfw !== newChannel.nsfw) {
        //TODO: Not implemented
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    //TODO: Clean up this fucking mess. ANONYMOUS FUNCTIONS PLEASE
    // Return if not a text channel
    if (
        !interaction.channel ||
        interaction.channel.type !== ChannelType.GuildText
    )
        return;
    try {
        // Try because discord.js is shit and throws errors for no reason
        // Join portal
        if (interaction.isStringSelectMenu()) {
            switch (interaction.customId) {
                case "portalSelect": {
                    const portalId = interaction.values[0];
                    const portal = getPortal(portalId);

                    // Add portal to setup
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup) return sendExpired(interaction);
                    setup.portalId = portalId;
                    setup.expires = Date.now() + 60000;

                    if (portal?.nsfw && !interaction.channel.nsfw) {
                        interaction.reply({
                            content:
                                "You can only join NSFW Portals from NSFW channels.",
                            ephemeral: true,
                        });
                        return;
                    }
                    if (!portal?.exclusive) {
                        // Edit original message
                        interaction.update({
                            content: `__Selected channel:__ <#${setup.channelId}>.\n__Selected Portal:__ ${portal?.emoji}${portal?.name}.\n${portalIntro.confirm}`,
                            components: [
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalJoinInvite",
                                            label: "Join Portal + share invite",
                                            style: ButtonStyle.Success,
                                        },
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalJoin",
                                            label: "Join Portal",
                                            style: ButtonStyle.Success,
                                        },
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalSelectCancel",
                                            label: "Cancel",
                                            style: ButtonStyle.Danger,
                                        },
                                    ],
                                },
                            ],
                        });
                        return;
                    }
                    // Modal for exclusive portals
                    await interaction.showModal({
                        title: `Join ${portal?.emoji}${portal?.name}`,
                        customId: "portalPasswordPrompt",
                        components: [
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.TextInput,
                                        customId: "portalPassword",
                                        label: `Enter Password for ${portal?.emoji}${portal?.name}`,
                                        placeholder: "Password",
                                        maxLength: 64,
                                        minLength: 1,
                                        style: TextInputStyle.Short,
                                    },
                                ],
                            },
                        ],
                    });
                    break;
                }
                case "portalCreateNsfw": {
                    const portalCreation = portalSetups.get(
                        interaction.user.id
                    );
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!portalCreation || !setup)
                        return sendExpired(interaction);

                    const nsfw = interaction.values[0] === "nsfw";

                    portalCreation.expires = Date.now() + 60000;

                    if (!interaction.channel.nsfw) {
                        await interaction.reply({
                            content:
                                "NSFW portals can only be created in NSFW channels.",
                            ephemeral: true,
                        });
                        interaction.message.edit({
                            content: `__Selected channel:__ <#${
                                portalCreation.channelId
                            }>.\n**Do you want to create a new Portal?**\n${
                                portalCreation.emoji
                            }${portalCreation.name}${
                                portalCreation.nsfw ? "🔞" : ""
                            }${
                                portalCreation.exclusive
                                    ? `🔒\nPassword: \`${portalCreation.password}\``
                                    : ""
                            }`,
                            components: [
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.StringSelect,
                                            customId: "portalCreateNsfw",
                                            maxValues: 1,
                                            minValues: 1,
                                            options: [
                                                {
                                                    label: "SFW",
                                                    value: "sfw",
                                                    default: true,
                                                },
                                                {
                                                    label: "🔞NSFW",
                                                    value: "nsfw",
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.StringSelect,
                                            customId: "portalCreateExclusive",
                                            maxValues: 1,
                                            minValues: 1,
                                            options: [
                                                {
                                                    label: "🔒Private",
                                                    value: "exclusive",
                                                    default:
                                                        portalCreation.exclusive,
                                                },
                                                {
                                                    label: "Public",
                                                    value: "public",
                                                    default:
                                                        !portalCreation.exclusive,
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalCreateConfirm",
                                            label: "Create and join Portal",
                                            style: ButtonStyle.Success,
                                        },
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalCreateCancel",
                                            label: "Cancel",
                                            style: ButtonStyle.Danger,
                                        },
                                    ],
                                },
                            ],
                        });
                        break;
                    }

                    portalCreation.nsfw = nsfw;

                    // Acknowledge interaction but don't send a response
                    await interaction.update({
                        content: `__Selected channel:__ <#${
                            portalCreation.channelId
                        }>.\n**Do you want to create a new Portal?**\n${
                            portalCreation.emoji
                        }${portalCreation.name}${
                            portalCreation.nsfw ? "🔞" : ""
                        }${
                            portalCreation.exclusive
                                ? `🔒\nPassword: \`${portalCreation.password}\``
                                : ""
                        }`,
                        components: [
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.StringSelect,
                                        customId: "portalCreateNsfw",
                                        maxValues: 1,
                                        minValues: 1,
                                        options: [
                                            {
                                                label: "🔞NSFW",
                                                value: "nsfw",
                                                default: portalCreation.nsfw,
                                            },
                                            {
                                                label: "SFW",
                                                value: "sfw",
                                                default: !portalCreation.nsfw,
                                            },
                                        ],
                                    },
                                ],
                            },
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.StringSelect,
                                        customId: "portalCreateExclusive",
                                        maxValues: 1,
                                        minValues: 1,
                                        options: [
                                            {
                                                label: "🔒Private",
                                                value: "exclusive",
                                                default:
                                                    portalCreation.exclusive,
                                            },
                                            {
                                                label: "Public",
                                                value: "public",
                                                default:
                                                    !portalCreation.exclusive,
                                            },
                                        ],
                                    },
                                ],
                            },
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.Button,
                                        customId: "portalCreateConfirm",
                                        label: "Create and join Portal",
                                        style: ButtonStyle.Success,
                                    },
                                    {
                                        type: ComponentType.Button,
                                        customId: "portalCreateCancel",
                                        label: "Cancel",
                                        style: ButtonStyle.Danger,
                                    },
                                ],
                            },
                        ],
                    });
                    break;
                }
                case "portalCreateExclusive": {
                    const portalCreation = portalSetups.get(
                        interaction.user.id
                    );
                    if (!portalCreation) break;

                    const exclusive = interaction.values[0] === "exclusive";

                    portalCreation.expires = Date.now() + 60000;
                    portalCreation.exclusive = false;

                    if (!exclusive) {
                        // Public, no need to request password
                        await interaction.update({
                            content: `__Selected channel:__ <#${
                                portalCreation.channelId
                            }>.\n**Do you want to create a new Portal?**\n${
                                portalCreation.emoji
                            }${portalCreation.name}${
                                portalCreation.nsfw ? "🔞" : ""
                            }${
                                portalCreation.exclusive
                                    ? `🔒\nPassword: \`${portalCreation.password}\``
                                    : ""
                            }`,
                            components: [
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.StringSelect,
                                            customId: "portalCreateNsfw",
                                            maxValues: 1,
                                            minValues: 1,
                                            options: [
                                                {
                                                    label: "🔞NSFW",
                                                    value: "nsfw",
                                                    default:
                                                        portalCreation.nsfw,
                                                },
                                                {
                                                    label: "SFW",
                                                    value: "sfw",
                                                    default:
                                                        !portalCreation.nsfw,
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.StringSelect,
                                            customId: "portalCreateExclusive",
                                            maxValues: 1,
                                            minValues: 1,
                                            options: [
                                                {
                                                    label: "🔒Private",
                                                    value: "exclusive",
                                                    default:
                                                        portalCreation.exclusive,
                                                },
                                                {
                                                    label: "Public",
                                                    value: "public",
                                                    default:
                                                        !portalCreation.exclusive,
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalCreateConfirm",
                                            label: "Create and join Portal",
                                            style: ButtonStyle.Success,
                                        },
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalCreateCancel",
                                            label: "Cancel",
                                            style: ButtonStyle.Danger,
                                        },
                                    ],
                                },
                            ],
                        });
                        break;
                    }
                    // Request password
                    await interaction.showModal({
                        title: "Choose a password for your Private Portal",
                        customId: "portalPasswordCreate",
                        components: [
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.TextInput,
                                        customId: "portalPassword",
                                        label: "Enter Portal password",
                                        placeholder:
                                            "Anyone with access to the portal will be able to see the password.",
                                        maxLength: 64,
                                        minLength: 1,
                                        style: TextInputStyle.Short,
                                    },
                                ],
                            },
                        ],
                    });
                }
            }
        }

        // Buttons
        if (interaction.isButton()) {
            switch (interaction.customId) {
                case "portalJoin": {
                    // Join portal
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup) return sendExpired(interaction);

                    // Join portal
                    const portalConnection = await createPortalConnection({
                        portalId: setup.portalId,
                        channelId: setup.channelId,
                    });
                    if (portalConnection instanceof Error) {
                        interaction.reply({
                            content:
                                "A weird error ocurred. Apparently this channel doesn't exist!",
                            ephemeral: true,
                        });
                        return;
                    }
                    const portal = getPortal(portalConnection.portalId);
                    if (!portal) {
                        interaction.reply({
                            content:
                                "A weird error ocurred. Apparently this portal doesn't exist!",
                            ephemeral: true,
                        });
                        return;
                    }
                    interaction.update({
                        content: `Joined \`#${portal.id}\` - ${portal.emoji}${
                            portal.name
                        }${portal.nsfw ? "🔞" : ""}${
                            portal.exclusive ? "🔒" : ""
                        }!`,
                        components: [],
                    });
                    break;
                }
                case "portalJoinInvite": {
                    // Get setup
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup) return sendExpired(interaction);

                    // Create invite
                    const invite = await createInvite(interaction.channel);

                    // Join portal
                    const portalConnection = await createPortalConnection({
                        portalId: setup.portalId,
                        channelId: setup.channelId,
                        guildInvite: invite instanceof Error ? "" : invite.code,
                    });
                    if (portalConnection instanceof Error) {
                        interaction.reply({
                            content:
                                "A weird error ocurred. Apparently this channel doesn't exist!",
                            ephemeral: true,
                        });
                        return;
                    }
                    const portal = getPortal(portalConnection.portalId);
                    if (!portal) {
                        interaction.reply({
                            content:
                                "A weird error ocurred. Apparently this portal doesn't exist!",
                            ephemeral: true,
                        });
                        return;
                    }
                    interaction.update({
                        content: `Joined \`#${portal.id}\` - ${portal.emoji}${
                            portal.name
                        }!${
                            invite instanceof Error
                                ? "\n**Error:** Failed to create invite. Do I have the `Create Invite` permission?"
                                : `\nCreated invite: ${invite.url}`
                        }`,
                        components: [],
                    });
                    break;
                }
                case "portalCreate": {
                    // Create new portal
                    await interaction.showModal({
                        title: "Create new Portal",
                        customId: "portalCreateModal",
                        components: [
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.TextInput,
                                        customId: "portalName",
                                        label: "Portal name",
                                        placeholder: generateName(),
                                        maxLength: 64,
                                        minLength: 1,
                                        style: TextInputStyle.Short,
                                    },
                                ],
                            },
                        ],
                    });
                    break;
                }
                case "portalCreateConfirm": {
                    // Confirm creation of new portal
                    const portalSetup = portalSetups.get(interaction.user.id);
                    if (!portalSetup) return sendExpired(interaction);

                    const portal = createPortal({
                        name: portalSetup.name,
                        emoji: portalSetup.emoji,
                        customEmoji: portalSetup.customEmoji,
                        nsfw: portalSetup.nsfw,
                        exclusive: portalSetup.exclusive,
                        password: portalSetup.password,
                    });
                    portalSetups.delete(interaction.user.id);

                    const portalConnection = await createPortalConnection({
                        portalId: portal.id,
                        channelId: portalSetup.channelId,
                    });
                    if (portalConnection instanceof Error) {
                        interaction.reply({
                            content:
                                "A weird error ocurred. Apparently this channel doesn't exist!",
                            ephemeral: true,
                        });
                        return;
                    }
                    interaction.update({
                        content: `Created and joined Portal \`#${
                            portalConnection.portalId
                        }\` - ${portal.emoji}${portal.name}${
                            portal.nsfw ? "🔞" : ""
                        }${portal.exclusive ? "🔒" : ""}.`,
                        components: [],
                    });
                    break;
                }
                case "portalSelectCancel": {
                    // Cancel portal selection
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup) return sendExpired(interaction);

                    connectionSetups.delete(interaction.user.id);
                    interaction.update({
                        content: "Cancelled Portal setup.",
                        components: [],
                    });
                    break;
                }
                case "portalCreateCancel": {
                    // Cancel portal creation
                    const portalSetup = portalSetups.get(interaction.user.id);
                    if (!portalSetup) return sendExpired(interaction);

                    portalSetups.delete(interaction.user.id);
                    interaction.update({
                        content: "Cancelled Portal creation.",
                        components: [],
                    });
                    break;
                }
            }
        }

        // Create new portal
        if (interaction.isModalSubmit() && interaction.isFromMessage()) {
            switch (interaction.customId) {
                case "portalCreateModal": {
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup) return sendExpired(interaction);
                    const portalName =
                        interaction.fields.getTextInputValue("portalName");

                    // Add portal to portalCreations
                    portalSetups.set(interaction.user.id, {
                        name: portalName,
                        emoji: "",
                        customEmoji: false,
                        portalId: "",
                        channelId: setup.channelId,
                        nsfw: false,
                        exclusive: false,
                        password: "",
                        expires: Date.now() + 60000,
                    });
                    setTimeout(() => {
                        // Remove portalCreation if not completed
                        if (portalSetups.has(interaction.user.id))
                            portalSetups.delete(interaction.user.id);
                    }, 60000);

                    // Edit original message
                    interaction.update({
                        content: `__Selected channel:__ <#${setup.channelId}>.\n__Portal name:__ ${portalName}.\nReact to this message with the emoji you want to use for your Portal.`,
                        components: [],
                    });

                    // Wait for emoji
                    const filter = (_reaction: MessageReaction, user: User) =>
                        user.id === interaction.user.id;

                    interaction.message
                        .awaitReactions({
                            filter,
                            max: 1,
                            time: 60000,
                            errors: ["time"],
                        })
                        .then(async (collected) => {
                            // Add to portalCreations
                            const reaction = collected.first();
                            if (!reaction) {
                                interaction.channel?.send(
                                    "You did not react with an emoji in time."
                                );
                                return;
                            }
                            const portalCreation = portalSetups.get(
                                interaction.user.id
                            );
                            if (!portalCreation)
                                return sendExpired(interaction);

                            portalCreation.emoji =
                                reaction.emoji.toString() || "";
                            portalCreation.customEmoji = reaction.emoji.id
                                ? true
                                : false;
                            portalCreation.portalId = generatePortalId();

                            portalSetups.set(
                                interaction.user.id,
                                portalCreation
                            );

                            reaction.remove();

                            // Edit original message
                            interaction.message.edit({
                                content: `__Selected channel:__ <#${
                                    portalCreation.channelId
                                }>.\n**Do you want to create a new Portal?**\n${
                                    portalCreation.emoji
                                }${portalCreation.name}${
                                    portalCreation.nsfw ? "🔞" : ""
                                }${
                                    portalCreation.exclusive
                                        ? `🔒\nPassword: \`${portalCreation.password}\``
                                        : ""
                                }`,
                                components: [
                                    {
                                        type: ComponentType.ActionRow,
                                        components: [
                                            {
                                                type: ComponentType.StringSelect,
                                                customId: "portalCreateNsfw",
                                                maxValues: 1,
                                                minValues: 1,
                                                options: [
                                                    {
                                                        label: "🔞NSFW",
                                                        value: "nsfw",
                                                        default:
                                                            portalCreation.nsfw,
                                                    },
                                                    {
                                                        label: "SFW",
                                                        value: "sfw",
                                                        default:
                                                            !portalCreation.nsfw,
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                    {
                                        type: ComponentType.ActionRow,
                                        components: [
                                            {
                                                type: ComponentType.StringSelect,
                                                customId:
                                                    "portalCreateExclusive",
                                                maxValues: 1,
                                                minValues: 1,
                                                options: [
                                                    {
                                                        label: "🔒Private",
                                                        value: "exclusive",
                                                    },
                                                    {
                                                        label: "Public",
                                                        value: "public",
                                                        default: true,
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                    {
                                        type: ComponentType.ActionRow,
                                        components: [
                                            {
                                                type: ComponentType.Button,
                                                customId: "portalCreateConfirm",
                                                label: "Create and join Portal",
                                                style: ButtonStyle.Success,
                                            },
                                            {
                                                type: ComponentType.Button,
                                                customId: "portalCreateCancel",
                                                label: "Cancel",
                                                style: ButtonStyle.Danger,
                                            },
                                        ],
                                    },
                                ],
                            });
                        })
                        .catch(() => {
                            interaction.channel?.send(
                                "You did not react with an emoji in time."
                            );
                        });
                    break;
                }
                case "portalPasswordCreate": {
                    const portalCreation = portalSetups.get(
                        interaction.user.id
                    );
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!portalCreation) return sendExpired(interaction);
                    if (!setup) return sendExpired(interaction);

                    const password =
                        interaction.fields.getTextInputValue("portalPassword");
                    portalCreation.password = password;
                    portalCreation.exclusive = true;
                    portalSetups.set(interaction.user.id, portalCreation);

                    interaction.update({
                        content: `__Selected channel:__ <#${
                            portalCreation.channelId
                        }>.\n**Do you want to create a new Portal?**\n${
                            portalCreation.emoji
                        }${portalCreation.name}${
                            portalCreation.nsfw ? "🔞" : ""
                        }${
                            portalCreation.exclusive
                                ? `🔒\nPassword: \`${portalCreation.password}\``
                                : ""
                        }`,
                        components: [
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.StringSelect,
                                        customId: "portalCreateNsfw",
                                        maxValues: 1,
                                        minValues: 1,
                                        options: [
                                            {
                                                label: "🔞NSFW",
                                                value: "nsfw",
                                                default: portalCreation.nsfw,
                                            },
                                            {
                                                label: "SFW",
                                                value: "sfw",
                                                default: !portalCreation.nsfw,
                                            },
                                        ],
                                    },
                                ],
                            },
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.StringSelect,
                                        customId: "portalCreateExclusive",
                                        maxValues: 1,
                                        minValues: 1,
                                        options: [
                                            {
                                                label: "🔒Private",
                                                value: "exclusive",
                                                default: true,
                                            },
                                            {
                                                label: "Public",
                                                value: "public",
                                            },
                                        ],
                                    },
                                ],
                            },
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.Button,
                                        customId: "portalCreateConfirm",
                                        label: "Create and join Portal",
                                        style: ButtonStyle.Success,
                                    },
                                    {
                                        type: ComponentType.Button,
                                        customId: "portalCreateCancel",
                                        label: "Cancel",
                                        style: ButtonStyle.Danger,
                                    },
                                ],
                            },
                        ],
                    });
                    break;
                }
                case "portalPasswordPrompt": {
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup) return sendExpired(interaction);

                    const password =
                        interaction.fields.getTextInputValue("portalPassword");
                    if (!password) return sendExpired(interaction);

                    const portal = getPortal(setup.portalId);
                    if (!portal) return sendExpired(interaction);

                    if (portal.password !== password) {
                        interaction.reply({
                            content: "Incorrect password.",
                            ephemeral: true,
                        });
                        const portals = getPortals();
                        interaction.message.edit({
                            content: `__Selected channel:__ <#${interaction.channel.id}>.\n${portalIntro.portal}.`,
                            components: [
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.StringSelect,
                                            customId: "portalSelect",
                                            maxValues: 1,
                                            minValues: 1,
                                            options: portals.map((p) => ({
                                                label: `${
                                                    p.customEmoji ? "" : p.emoji
                                                }${p.name}${
                                                    p.nsfw ? "🔞" : ""
                                                }${p.exclusive ? "🔒" : ""}`,
                                                value: p.id,
                                            })),
                                            placeholder: "Select a Portal",
                                        },
                                    ],
                                },
                                {
                                    type: ComponentType.ActionRow,
                                    components: [
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalCreate",
                                            label: "Create new Portal",
                                            style: ButtonStyle.Primary,
                                        },
                                        {
                                            type: ComponentType.Button,
                                            customId: "portalSelectCancel",
                                            label: "Cancel",
                                            style: ButtonStyle.Danger,
                                        },
                                    ],
                                },
                            ],
                        });
                        return;
                    }
                    // Edit original message
                    interaction.update({
                        content: `__Selected channel:__ <#${
                            setup.channelId
                        }>.\n__Selected Portal:__ ${portal.emoji}${
                            portal.name
                        }${portal.nsfw ? "🔞" : ""}🔒.\n${portalIntro.confirm}`,
                        components: [
                            {
                                type: ComponentType.ActionRow,
                                components: [
                                    {
                                        type: ComponentType.Button,
                                        customId: "portalJoinInvite",
                                        label: "Join Portal + share invite",
                                        style: ButtonStyle.Success,
                                    },
                                    {
                                        type: ComponentType.Button,
                                        customId: "portalJoin",
                                        label: "Join Portal",
                                        style: ButtonStyle.Success,
                                    },
                                    {
                                        type: ComponentType.Button,
                                        customId: "portalSelectCancel",
                                        label: "Cancel",
                                        style: ButtonStyle.Danger,
                                    },
                                ],
                            },
                        ],
                    });
                }
            }
        }
    } catch (err) {
        // Probably timed out
        console.log("Error in interaction");
        console.error(err);
    }
});

client.login(token);
