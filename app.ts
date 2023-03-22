import {
    Client,
    Events,
    GatewayIntentBits,
    ComponentType,
    ButtonStyle,
    TextInputStyle,
    MessageReaction,
    User,
    Embed,
    ChannelType,
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    Routes,
    REST,
    AttachmentBuilder,
} from "discord.js";
import sqlite3 from "better-sqlite3";
import dotenv from "dotenv";
import { PREFIX, ADMINS } from "./config.json";
import DiscordHelpersCore from "./lib/helpers/discord_helpers.core";
import { UserId } from "./lib/types";
import * as fs from "fs";
import {
    handlePortal,
    handleCommands,
    handleDeleteMessage,
    handleReact,
    handleInteraction,
} from "./lib/handlers";
import fullSetup from "./lib/setup";
dotenv.config();

Error.stackTraceLimit = Infinity; //! Remove in production
Error.prepareStackTrace = (err, stack) => {
    // Only keep the trace that is part of this file
    const trace = stack.filter((call) => call.getFileName() === __filename);
    return (
        err.name +
        ": " +
        err.message +
        " at " +
        trace
            .map(
                (call) =>
                    call.getFunctionName() +
                    " (" +
                    call.getFileName() +
                    ":" +
                    call.getLineNumber() +
                    ")"
            )
            .join(" -> ")
    );
};

const token = process.env.TOKEN;

// Config
const portalIntro = {
    portal: "**Welcome to the setup!** Select which Portal you want this channel to be connected to.",
    askInvite:
        "**Do you want to share an invite link to your server** with the Portal? You can always remove it by re-joining the Portal.",
    confirm: `**Do you want to join this Portal?** You can also choose to share an invite to this server with the Portal. You can always leave using \`${PREFIX}leave\`.`,
};

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
// db.prepare(`DROP TABLE IF EXISTS limitedAccounts`).run();
db.prepare(
    // For Portals
    `CREATE TABLE IF NOT EXISTS portals (id TEXT PRIMARY KEY, name TEXT, emoji TEXT, customEmoji INTEGER DEFAULT 0, nsfw INTEGER DEFAULT 0, private INTEGER DEFAULT 0, password TEXT)`
).run();
db.prepare(
    // For Portal connections. Each connection is a channel that is linked to a Portal
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
    // For Portal messages. Each message is a message that is sent to a Portal. ID is shared by all linked messages.
    `CREATE TABLE IF NOT EXISTS portalMessages (
        id TEXT, 
        portalId TEXT, 
        messageId TEXT, 
        channelId TEXT,
        messageType TEXT,
        FOREIGN KEY(portalId) REFERENCES portals(id)
    )` // messageType is one of "original" | "linked" | "linkedAttachment"
).run();
db.prepare(
    // For limited accounts. An account may be blocked if it is spamming.
    `CREATE TABLE IF NOT EXISTS limitedAccounts (
        userId TEXT,
        portalId TEXT,
        channelId TEXT,
        reason TEXT,
        banned INTEGER DEFAULT 0,
        bot INTEGER DEFAULT 0,
        FOREIGN KEY(portalId) REFERENCES portals(id)
    )`
).run();

// Dirs
if (!fs.existsSync("./stickers/")) fs.mkdirSync("./stickers/");

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
const helpers = new DiscordHelpersCore(client, db);

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

// Receive messages
client.on(Events.MessageCreate, async (message) => {
    // Ignore if webhook
    if (message.webhookId) return;
    // Ignore if DM
    if (!helpers.isGuildMessage(message)) return;
    // Ignore if not ValidChannel
    if (!helpers.isValidChannel(message.channel)) return;

    // Portal functionality
    await handlePortal(message, helpers);

    // Commands
    await handleCommands(message, helpers, connectionSetups);
});

// Delete messages
client.on(Events.MessageDelete, async (message) => {
    // Ignore webhook deletions
    if (message.webhookId) return;
});

// Edit messages
client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    // Ignore webhook edits
    if (newMessage.webhookId) return;

    await handleDeleteMessage(newMessage, helpers);
});

// Channel updates
client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
    // Return if not a valid channel
    if (!helpers.isValidChannel(newChannel)) return;

    // Check if channel is a portal channel
    const portalConnection = helpers.getPortalConnection(newChannel.id);
    if (!portalConnection) return;

    // Update portal connection
    helpers.updatePortalConnection(newChannel.id, {
        channelName: newChannel.name,
        guildName: newChannel.guild.name,
    });

    // Check of nsfw change
    const portal = helpers.getPortal(portalConnection.portalId);
    if (!portal) return;
    // Suspend portal if nsfw changed
    if (portal.nsfw !== newChannel.nsfw) {
        //TODO: Not implemented
    }
});

// Reactions
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // Ignore self
    if (user.id === client.user?.id) return;

    await handleReact(reaction, helpers);
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        await handleInteraction(
            interaction,
            helpers,
            connectionSetups,
            portalSetups
        );
    } catch (err) {
        // Probably timed out
        console.log("Error in interaction");
        console.error(err);
    }
});

client.login(token);
