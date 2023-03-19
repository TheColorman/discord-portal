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
import ffmpeg from "fluent-ffmpeg";
import { PREFIX, ADMINS, MAX_STICKERS_ON_DISK } from "./config.json";
import DiscordHelpersCore from "./lib/helpers/discord_helpers.core";
import { UserId } from "./lib/types";
import * as fs from "fs";
import fetch from "node-fetch";
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
if (!fs.existsSync("./stickers")) fs.mkdirSync("./stickers");

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
    if (!message.guildId) return;
    // Ignore if not TextChannel
    if (message.channel.type !== ChannelType.GuildText) return;

    // Portal functionality
    (async () => {
        // why do I have to check this type again? ask typescript...
        if (message.channel.type !== ChannelType.GuildText) return;

        const portalConnection = helpers.getPortalConnection(
            message.channel.id
        );
        if (!portalConnection) return;

        // Check for spam
        const limitedAccount = helpers.getLimitedAccount({
            userId: message.author.id,
            portalId: portalConnection.portalId,
        });
        // We want to ignore the account if it is banned
        // or if the channel is not this one
        if (
            limitedAccount &&
            (limitedAccount.banned ||
                limitedAccount.channelId !== message.channel.id)
        ) {
            // Remove send permissions from user
            if (!message.member) return;
            try {
                message.channel.permissionOverwrites.create(message.member, {
                    SendMessages: false,
                });
            } catch (err) {
                console.error(err);
            }
            return;
        }

        const portalConnections = helpers.getPortalConnections(
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
        const stickers: string[] = [];
        for (const [stickerId, sticker] of message.stickers) {
            // Check if we already have the sticker ID in the ./stickers/ folder
            const stickerFile = fs
                .readdirSync("./stickers/")
                .find((f) => f === `${stickerId}.gif`);
            if (!stickerFile) {
                // Create file
                const res = await fetch(sticker.url);
                if (!res.body) continue;
                const PNGstream = fs.createWriteStream(
                    `./stickers/${stickerId}.png`
                );
                res.body.pipe(PNGstream);
                // Output as .gif
                ffmpeg(`./stickers/${stickerId}.png`).saveToFile(
                    `./stickers/${stickerId}.gif`
                );
                // Delete old .png file
                fs.unlinkSync(`./stickers/${stickerId}.png`);
            }
            // Update "last modified" time
            try {
                fs.utimesSync(
                    `./stickers/${stickerId}.gif`,
                    new Date(),
                    new Date()
                );
            } catch (err) {
                console.error(err);
            }
            stickers.push(`./stickers/${stickerId}.gif`);
        }
        // If there are more than 20 .gif files, delete the oldest ones
        const stickerFiles = fs.readdirSync("./stickers/");
        if (stickerFiles.length > MAX_STICKERS_ON_DISK) {
            stickerFiles.sort((a, b) => {
                return (
                    fs.statSync(`./stickers/${a}`).mtime.getTime() -
                    fs.statSync(`./stickers/${b}`).mtime.getTime()
                );
            });
            for (
                let i = 0;
                i < stickerFiles.length - MAX_STICKERS_ON_DISK;
                i++
            ) {
                try {
                    fs.unlinkSync(`./stickers/${stickerFiles[i]}`);
                } catch (err) {
                    console.error(err);
                }
            }
        }

        // Replies
        const originalReference = message.reference?.messageId
            ? await helpers.safeFetchMessage(
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

            let referencePortalMessageId = helpers.getPortalMessageId(
                originalReference.id
            );

            if (!referencePortalMessageId) {
                // Try again after 1s
                await new Promise((resolve) => setTimeout(resolve, 1000));
                referencePortalMessageId = helpers.getPortalMessageId(
                    originalReference.id
                );
            }

            if (!referencePortalMessageId) return failed;
            const linkedPortalMessages = helpers.getPortalMessages(
                referencePortalMessageId
            );

            return { refAuthorTag, refPreview, linkedPortalMessages };
        };
        const reply = await getLinked();

        const portalMessageId = helpers.generatePortalMessageId();

        // Send to other channels and add to database
        // Use a promise so we can wait for them all to finish
        // When all messages have been sent, add the original to the database
        const sendPromises = portalConnections.map(async (portalConnection) => {
            // Don't send to same channel
            if (portalConnection.channelId === message.channel.id) return;

            // Get channel
            const channel = await helpers.safeFetchChannel(
                portalConnection.channelId
            );
            if (!channel) {
                // Remove connection if channel is not found
                helpers.deletePortalConnection(portalConnection.channelId);
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
            const webhook = await helpers.getWebhook({
                channel,
                webhookId: portalConnection.webhookId,
            });
            // If no webhook was found, the channel doesn't exist and we should delete the connection
            if (!webhook) {
                helpers.deletePortalConnection(portalConnection.channelId);
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
                files: stickers.map((s) => new AttachmentBuilder(s)),
            });

            helpers.createPortalMessage({
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

                helpers.createPortalMessage({
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
        helpers.createPortalMessage({
            id: portalMessageId,
            portalId: portalConnection.portalId,
            messageId: message.id,
            channelId: message.channel.id,
            messageType: "original",
        });
    })();

    if (message.content.startsWith(PREFIX)) {
        const args = message.content.slice(PREFIX.length).trim().split(/\s+/g);
        const command = args.shift()?.toLowerCase();

        switch (command) {
            case "portal":
            case "portals": {
                const portalConnection = helpers.getPortalConnection(
                    message.channel.id
                );
                if (!portalConnection) {
                    message.reply({
                        content:
                            "This channel is not connected to any Portals.",
                    });
                    break;
                }
                const portal = helpers.getPortal(portalConnection.portalId);
                if (!portal) {
                    message.reply({
                        content:
                            "This channel is connected to a Portal that no longer exists.",
                    });
                    break;
                }
                const portalConnections = helpers.getPortalConnections(
                    portalConnection.portalId
                );

                portalConnections.forEach(async (portalConnection) => {
                    const channel = await helpers.safeFetchChannel(
                        portalConnection.channelId
                    );
                    // If no channel was found, the channel doesn't exist and we should delete the connection
                    if (!channel) {
                        helpers.deletePortalConnection(
                            portalConnection.channelId
                        );
                        return;
                    }
                    const webhook = await helpers.getWebhook({
                        channel: channel,
                        webhookId: portalConnection.webhookId,
                    });
                    // If no webhook was found, the channel doesn't exist and we should delete the connection
                    if (!webhook) {
                        helpers.deletePortalConnection(
                            portalConnection.channelId
                        );
                        return;
                    }

                    let portalMessageId = helpers.getPortalMessageId(
                        message.id
                    );
                    if (!portalMessageId) {
                        // Wait 1s and try again
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000)
                        );
                        portalMessageId = helpers.getPortalMessageId(
                            message.id
                        );
                    }

                    const replyId =
                        portalConnection.channelId === message.channel.id
                            ? message.id
                            : portalMessageId
                            ? helpers
                                  .getPortalMessages(portalMessageId)
                                  .find(
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
                            "\n[Invite me](https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=275683605585&scope=bot)",
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
                    "Invite me to your server: https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=275683605585&scope=bot"
                );
                break;
            }
            case "help":
            case "commands": {
                message.reply(
                    `\`${PREFIX}portal\` - Get information about the Portal connection of the current channel.\n\`${PREFIX}join\` - Join a Portal.\n\`${PREFIX}leave\` - Leave a Portal.\n\`${PREFIX}delete\` - Delete a Portal.\n\`${PREFIX}invite\` - Get an invite link for the bot.\n\`${PREFIX}help\` - Get a list of commands.`
                );
                break;
            }
            case "setup":
            case "join": {
                // Check permissions
                if (!helpers.checkPermissions(message)) break;

                const portalGuildConnections =
                    helpers.getGuildPortalConnections(message.guildId);
                if (portalGuildConnections.size > 0) {
                    message.reply(
                        `A server can currently only have one Portal connection. Please remove the current connection before setting up a new one. (\`${PREFIX}leave\`)`
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
                const portals = helpers.getPortals();
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
                if (!helpers.checkPermissions(message)) break;

                const portalConnection = await helpers.deletePortalConnection(
                    message.channel.id
                );
                if (!portalConnection) {
                    message.reply({
                        content:
                            "This channel is not connected to any Portals.",
                    });
                    break;
                }
                const portal = helpers.getPortal(portalConnection.portalId);
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
                if (!helpers.checkPermissions(message)) break;

                const portalConnection = helpers.getPortalConnection(
                    message.channel.id
                );
                if (!portalConnection) {
                    message.reply({
                        content:
                            "This channel is not connected to any Portals.",
                    });
                    break;
                }

                const portals = helpers.getPortals();
                const portalConnections = helpers.getPortalConnections(
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
                const portal = helpers.deletePortal(portalConnection.portalId);
                message.reply(
                    `Deleted Portal \`#${portalConnection.portalId}\` - ${portal?.emoji}${portal?.name}.`
                );
                break;
            }
            case "dev": {
                if (!ADMINS.includes(message.author.id)) break;

                const subcommand = args.shift();
                switch (subcommand) {
                    case "clearWebhooks": {
                        const oauthGuilds = await client.guilds.fetch();
                        const progress = await message.channel.send(
                            `Deleting webhooks... (${oauthGuilds.size} guilds)`
                        );

                        let webhookCount = 0;
                        for (const oathGuild of oauthGuilds.values()) {
                            const guild = await oathGuild.fetch();
                            const webhooks = await guild.fetchWebhooks();

                            for (const webhook of webhooks.values()) {
                                if (webhook.applicationId !== client.user?.id) {
                                    continue;
                                }
                                try {
                                    await webhook.delete(
                                        "Developer command: clearWebhooks"
                                    );
                                    webhookCount++;
                                } catch (e) {
                                    message.channel.send(
                                        `Failed to delete webhook \`${webhook.name}\` in guild \`${guild.name}\` (${guild.id})\n${e}`
                                    );
                                }
                            }
                        }
                        progress.edit(`Deleted ${webhookCount} webhooks.`);
                        break;
                    }
                    case "registerCommands": {
                        const commands = [
                            new ContextMenuCommandBuilder()
                                .setName("Limit to this channel")
                                .setDMPermission(false)
                                .setType(ApplicationCommandType.User),
                            new ContextMenuCommandBuilder()
                                .setName("Ban")
                                .setDMPermission(false)
                                .setType(ApplicationCommandType.User),
                            new ContextMenuCommandBuilder()
                                .setName("Unban")
                                .setDMPermission(false)
                                .setType(ApplicationCommandType.User),
                        ];

                        if (!client.user || !token) return;
                        await new REST({ version: "10" })
                            .setToken(token)
                            .put(Routes.applicationCommands(client.user.id), {
                                body: commands.map((c) => c.toJSON()),
                            });
                        message.channel.send("Registered commands.");
                        break;
                    }
                    case "execute": {
                        // JS Execution
                        // Find code block. Starts with ``` and ends with ```. Sometimes, a language is specified after the first three backticks.
                        const code = message.content
                            .split(/```\w*/g)
                            .slice(1)
                            .join("```")
                            .split("```")[0];

                        try {
                            let result = eval(code);
                            // Stringify if object
                            if (typeof result === "object") {
                                result = JSON.stringify(result, null, 2);
                            }
                            message.channel.send({
                                content: "```js\n" + result + "\n```",
                            });
                        } catch (err) {
                            message.channel.send({
                                content: "```js\n" + err + "\n```",
                            });
                        }
                        break;
                    }
                }
                break;
            }
            case "limit": {
                // Check if user is allowed to use this command
                if (!ADMINS.includes(message.author.id)) break;

                const member = message.mentions.members?.first();
                if (!member) {
                    message.reply({
                        content: "Please mention a user to limit.",
                    });
                    break;
                }
                const portalId = helpers.getPortalConnection(
                    message.channel.id
                )?.portalId;
                if (!portalId) return;
                helpers.setLimitedAccount(member.id, {
                    portalId,
                    channelId: message.channel.id,
                    banned: false,
                    bot: member.user.bot,
                    reason: "Manual limit",
                });
                message.reply({
                    content: `${message.author} limited ${member.user.tag} in this channel. They can still send messages to the Portal, but only in this channel.`,
                });
                break;
            }
            case "unban": {
                // Check if user is allowed to use this command
                if (!ADMINS.includes(message.author.id)) break;

                const member = message.mentions.members?.first();
                if (!member) {
                    message.reply({
                        content: "Please mention a user to limit.",
                    });
                    break;
                }
                const portalId = helpers.getPortalConnection(
                    message.channel.id
                )?.portalId;
                if (!portalId) return;
                helpers.deleteLimitedAccount(member.id, portalId);

                // Remove permissions in all channels
                const portalConnections =
                    helpers.getPortalConnections(portalId);
                for (const [channelId, portalConnection] of portalConnections) {
                    const channel = await helpers.safeFetchChannel(channelId);
                    if (!channel) continue;
                    try {
                        await channel.permissionOverwrites.delete(member);
                    } catch (e) {
                        console.error(e);
                    }
                }
                message.reply({
                    content: `${message.author} unbanned ${member.user.tag} in this channel.`,
                });
                break;
            }
            case "ban": {
                // Check if user is allowed to use this command
                if (!ADMINS.includes(message.author.id)) break;

                const member = message.mentions.members?.first();
                if (!member) {
                    message.reply({
                        content: "Please mention a user to limit.",
                    });
                    break;
                }
                const portalId = helpers.getPortalConnection(
                    message.channel.id
                )?.portalId;
                if (!portalId) return;
                helpers.setLimitedAccount(member.id, {
                    portalId,
                    channelId: message.channel.id,
                    banned: true,
                    bot: member.user.bot,
                    reason: "Manual block",
                });
                message.reply({
                    content: `${message.author} banned ${member.user.tag} in this channel.`,
                });
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
    const portalMessageId = helpers.getPortalMessageId(message.id);
    if (!portalMessageId) return;
    const portalMessages = helpers.getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    // Delete linked messages
    for (const [messageId, portalMessage] of portalMessages) {
        // Find channel and message objects
        const channel = await helpers.safeFetchChannel(portalMessage.channelId);
        if (!channel) continue;
        const message = await helpers.safeFetchMessage(
            channel,
            portalMessage.messageId
        );
        if (!message) continue;

        // Attempt to delete message
        const result = await helpers.deleteMessage(
            channel,
            portalMessage.messageId
        );
        // If result is an Error we couldn't delete the message
        if (result instanceof Error) {
            channel.send(
                "Note: I need the `Manage Messages` permission to function properly."
            );
        }
    }
    // Delete portal message
    helpers.deletePortalMessages(message.id);
});

// Edit messages
client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    // Ignore webhook edits
    if (newMessage.webhookId) return;

    // Check if message is a portal message
    const portalMessageId = helpers.getPortalMessageId(newMessage.id);
    if (!portalMessageId) return;
    const portalMessages = helpers.getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    // Edit linked messages
    for (const [messageId, portalMessage] of portalMessages) {
        // Find channel and message objects
        const channel = await helpers.safeFetchChannel(portalMessage.channelId);
        if (!channel) continue;
        const message = await helpers.safeFetchMessage(
            channel,
            portalMessage.messageId
        );
        if (!message) continue;

        // Attempt to edit message
        await helpers.editMessage(channel, portalMessage.messageId, {
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

    // Check if message is a portal message
    const portalMessageId = helpers.getPortalMessageId(reaction.message.id);
    if (!portalMessageId) return;
    const portalMessages = helpers.getPortalMessages(portalMessageId);
    if (!portalMessages.size) return;

    console.log(
        `Reacting with ${reaction.emoji} to ${portalMessages.size} messages.`
    );

    // Add reaction to linked messages if we have access to it
    for (const [messageId, portalMessage] of portalMessages) {
        // Ignore original message
        //// if (messageId === reaction.message.id) continue;
        // ? For now we'll also react to the original message, so you can see that the bot has reacted to it

        // Find channel and message objects
        const channel = await helpers.safeFetchChannel(portalMessage.channelId);
        if (!channel) continue;
        const message = await helpers.safeFetchMessage(
            channel,
            portalMessage.messageId
        );
        if (!message) continue;

        // Attempt to add reaction
        await helpers.addReaction(message, reaction.emoji); // TODO: 1. Check if we have access to the emoji. 2. Remove reaction if it disappears from the original message
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    //TODO: Clean up this fucking mess.
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
                    const portal = helpers.getPortal(portalId);

                    // Add portal to setup
                    const setup = connectionSetups.get(interaction.user.id);
                    if (!setup) return helpers.sendExpired(interaction);
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
                        return helpers.sendExpired(interaction);

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
                    if (!setup) return helpers.sendExpired(interaction);

                    // Join portal
                    const portalConnection =
                        await helpers.createPortalConnection({
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
                    const portal = helpers.getPortal(portalConnection.portalId);
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
                    if (!setup) return helpers.sendExpired(interaction);

                    // Create invite
                    const invite = await helpers.createInvite(
                        interaction.channel
                    );

                    // Join portal
                    const portalConnection =
                        await helpers.createPortalConnection({
                            portalId: setup.portalId,
                            channelId: setup.channelId,
                            guildInvite:
                                invite instanceof Error ? "" : invite.code,
                        });
                    if (portalConnection instanceof Error) {
                        interaction.reply({
                            content:
                                "A weird error ocurred. Apparently this channel doesn't exist!",
                            ephemeral: true,
                        });
                        return;
                    }
                    const portal = helpers.getPortal(portalConnection.portalId);
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
                                        placeholder: helpers.generateName(),
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
                    if (!portalSetup) return helpers.sendExpired(interaction);

                    const portal = helpers.createPortal({
                        name: portalSetup.name,
                        emoji: portalSetup.emoji,
                        customEmoji: portalSetup.customEmoji,
                        nsfw: portalSetup.nsfw,
                        exclusive: portalSetup.exclusive,
                        password: portalSetup.password,
                    });
                    portalSetups.delete(interaction.user.id);

                    const portalConnection =
                        await helpers.createPortalConnection({
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
                    if (!setup) return helpers.sendExpired(interaction);

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
                    if (!portalSetup) return helpers.sendExpired(interaction);

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
                    if (!setup) return helpers.sendExpired(interaction);
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
                                return helpers.sendExpired(interaction);

                            portalCreation.emoji =
                                reaction.emoji.toString() || "";
                            portalCreation.customEmoji = reaction.emoji.id
                                ? true
                                : false;
                            portalCreation.portalId =
                                helpers.generatePortalId();

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
                    if (!portalCreation)
                        return helpers.sendExpired(interaction);
                    if (!setup) return helpers.sendExpired(interaction);

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
                    if (!setup) return helpers.sendExpired(interaction);

                    const password =
                        interaction.fields.getTextInputValue("portalPassword");
                    if (!password) return helpers.sendExpired(interaction);

                    const portal = helpers.getPortal(setup.portalId);
                    if (!portal) return helpers.sendExpired(interaction);

                    if (portal.password !== password) {
                        interaction.reply({
                            content: "Incorrect password.",
                            ephemeral: true,
                        });
                        const portals = helpers.getPortals();
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

        // Context menus
        if (interaction.isUserContextMenuCommand()) {
            switch (interaction.commandName) {
                case "Limit to this channel": {
                    // Check if user is allowed to use this command
                    if (!ADMINS.includes(interaction.user.id)) {
                        interaction.reply({
                            content: "You are not allowed to use this command.",
                            ephemeral: true,
                        });
                        return;
                    }

                    const user = interaction.targetUser;
                    const portalId = helpers.getPortalConnection(
                        interaction.channel.id
                    )?.portalId;
                    if (!portalId) return;
                    helpers.setLimitedAccount(user.id, {
                        portalId,
                        channelId: interaction.channel.id,
                        banned: false,
                        bot: user.bot,
                        reason: "Manual limit",
                    });
                    interaction.reply({
                        content: `${interaction.user} limited ${user.tag} in this channel. They can still send messages to the Portal, but only in this channel.`,
                    });
                    break;
                }
                case "Unban": {
                    // Check if user is allowed to use this command
                    if (!ADMINS.includes(interaction.user.id)) {
                        interaction.reply({
                            content: "You are not allowed to use this command.",
                            ephemeral: true,
                        });
                        return;
                    }

                    const user = interaction.targetUser;
                    const portalId = helpers.getPortalConnection(
                        interaction.channel.id
                    )?.portalId;
                    if (!portalId) return;
                    helpers.deleteLimitedAccount(user.id, portalId);

                    // Remove permissions in all channels
                    const portalConnections =
                        helpers.getPortalConnections(portalId);
                    for (const [
                        channelId,
                        portalConnection,
                    ] of portalConnections) {
                        const channel = await helpers.safeFetchChannel(
                            channelId
                        );
                        if (!channel) continue;
                        try {
                            const member = await channel.guild.members.fetch(
                                user
                            );
                            await channel.permissionOverwrites.delete(member);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                    interaction.reply({
                        content: `${interaction.user} unbanned ${user.tag} in this channel.`,
                    });
                    break;
                }
                case "Ban": {
                    // Check if user is allowed to use this command
                    if (!ADMINS.includes(interaction.user.id)) {
                        interaction.reply({
                            content: "You are not allowed to use this command.",
                            ephemeral: true,
                        });
                        return;
                    }

                    const user = interaction.targetUser;
                    const portalId = helpers.getPortalConnection(
                        interaction.channel.id
                    )?.portalId;
                    if (!portalId) return;
                    helpers.setLimitedAccount(user.id, {
                        portalId,
                        channelId: interaction.channel.id,
                        banned: true,
                        bot: user.bot,
                        reason: "Manual block",
                    });
                    interaction.reply({
                        content: `${interaction.user} banned ${user.tag} in this channel.`,
                    });
                    break;
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
