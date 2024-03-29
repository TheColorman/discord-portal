import {
    ApplicationCommandType,
    ButtonStyle,
    ComponentType,
    ContextMenuCommandBuilder,
    Message,
    REST,
    Routes,
} from "discord.js";
import { PREFIX, ADMINS } from "../../config.json";
import DiscordHelpersCore from "../helpers/discordHelpers.core";
import { PortalConnection, UserId } from "../types";
import { portalIntro } from "../const";
import dotenv from "dotenv";

dotenv.config();
const token = process.env.TOKEN;

async function announcePortalLeave(
    portalConnection: PortalConnection,
    helpers: DiscordHelpersCore
) {
    // Send leave message
    await helpers.sendMessageToPortalAsBot({
        portalId: portalConnection.portalId,
        sourceChannelId: portalConnection.channelId,
        options: `📢 **${portalConnection.guildName.replace(
            "**",
            "\\*\\*"
        )}** left the Portal 👋.`,
    });
}

async function handleCommands(
    message: Message<true>,
    helpers: DiscordHelpersCore,
    connectionSetups: Map<
        UserId,
        { channelId: string; portalId: string; expires: number }
    >
) {
    if (message.content.startsWith(PREFIX) && !message.author.bot) {
        const args = message.content.slice(PREFIX.length).trim().split(/\s+/g);
        const command = args.shift()?.toLowerCase();

        const portalConnection = helpers.getPortalConnection(message.channelId);
        switch (command) {
            case "portal":
            case "portals": {
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

                const portalString = portalConnections
                    .map(
                        (c) =>
                            `• **${
                                c.guildInvite
                                    ? `[${c.guildName.replace(
                                          "**",
                                          "\\*\\*"
                                      )}](<https://discord.gg/${
                                          c.guildInvite
                                      }>)`
                                    : // Sanitize the guild name
                                      c.guildName.replace("**", "\\*\\*")
                            }** - #${c.channelName}`
                    )
                    .join("\n");

                const portalMessageId = helpers.getPortalMessageId(message.id);

                helpers.sendMessageToPortalAsWebhook({
                    options: {
                        content:
                            `Connected to Portal \`#` +
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
                            portalString +
                            "\n[Invite me](https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=275683605585&scope=bot)",
                    },
                    portalId: portal.id,
                    sourceChannelId: message.channel.id,
                    portalReferenceId: portalMessageId || "0",
                });

                break;
            }
            case "invite":
            case "link": {
                const reply =
                    "Invite me to your server: https://discord.com/api/oauth2/authorize?client_id=1057817052917805208&permissions=275683605585&scope=bot";
                portalConnection
                    ? helpers.sendMessageToPortalAsBot({
                          options: {
                              content: reply,
                          },
                          portalId: portalConnection.portalId,
                          sourceChannelId: message.channelId,
                          replyToPortalMessageId:
                              helpers.getPortalMessageId(message.id) ||
                              undefined,
                      })
                    : message.reply(reply);
                break;
            }
            case "help":
            case "commands": {
                const reply = `\`${PREFIX}portal\` - Get information about the Portal connection of the current channel.\n\`${PREFIX}join\` - Join a Portal.\n\`${PREFIX}leave\` - Leave a Portal.\n\`${PREFIX}delete\` - Delete a Portal.\n\`${PREFIX}invite\` - Get an invite link for the bot.\n\`${PREFIX}help\` - Get a list of commands.`;
                portalConnection
                    ? helpers.sendMessageToPortalAsBot({
                          options: {
                              content: reply,
                          },
                          portalId: portalConnection.portalId,
                          sourceChannelId: message.channelId,
                          replyToPortalMessageId:
                              helpers.getPortalMessageId(message.id) ||
                              undefined,
                      })
                    : message.reply(reply);
                break;
            }
            case "setup":
            case "join": {
                // Check permissions
                if (!helpers.checkPermissions(message)) break;

                if (portalConnection) {
                    helpers.sendMessageToPortalAsBot({
                        options: {
                            content: "You're already connected to a Portal!",
                        },
                        portalId: portalConnection.portalId,
                        sourceChannelId: message.channelId,
                        replyToPortalMessageId:
                            helpers.getPortalMessageId(message.id) || undefined,
                    });
                }

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
                await announcePortalLeave(portalConnection, helpers);
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
                switch (subcommand?.toLowerCase()) {
                    case "reloadwebhooks":
                    case "resetwebhooks":
                    case "deletewebhooks":
                    case "clearwebhooks": {
                        const oauthGuilds = await message.client.guilds.fetch();
                        const progress = await message.channel.send(
                            `Deleting webhooks... (${oauthGuilds.size} guilds)`
                        );

                        let webhookCount = 0;
                        for (const oathGuild of oauthGuilds.values()) {
                            const guild = await oathGuild.fetch();
                            const webhooks = await guild.fetchWebhooks();

                            for (const webhook of webhooks.values()) {
                                if (
                                    webhook.applicationId !==
                                    message.client.user?.id
                                ) {
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
                    case "registercommands": {
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

                        if (!message.client.user || !token) return;
                        await new REST({ version: "10" })
                            .setToken(token)
                            .put(
                                Routes.applicationCommands(
                                    message.client.user.id
                                ),
                                {
                                    body: commands.map((c) => c.toJSON()),
                                }
                            );
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
                    case "limit": {
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
                        for (const [
                            channelId,
                            portalConnection,
                        ] of portalConnections) {
                            const channel = await helpers.safeFetchChannel(
                                channelId
                            );
                            if (!channel) continue;
                            try {
                                await channel.permissionOverwrites.delete(
                                    member
                                );
                            } catch (e) {
                                // console.error(e);
                            }
                        }
                        message.reply({
                            content: `${message.author} unbanned ${member.user.tag} in this channel.`,
                        });
                        break;
                    }
                    case "ban": {
                        const userText =
                            message.content.match(/<@!?(\d+)>/)?.[1];
                        if (!userText) {
                            message.reply({
                                content: "Please mention a user to limit.",
                            });
                            break;
                        }
                        const user = await message.client.users.fetch(userText);
                        if (!user) {
                            message.reply({
                                content: "Please mention a user to limit.",
                            });
                            break;
                        }
                        const portalId = helpers.getPortalConnection(
                            message.channel.id
                        )?.portalId;
                        if (!portalId) return;
                        helpers.setLimitedAccount(user.id, {
                            portalId,
                            channelId: message.channel.id,
                            banned: true,
                            bot: user.bot,
                            reason: "Manual block",
                        });
                        message.reply({
                            content: `${message.author} banned ${user.tag} in this channel.`,
                        });
                        break;
                    }
                    case "del": {
                        const messageId = message.content.match(/(\d+)/)?.[1];
                        if (!messageId) {
                            message.reply({
                                content: "Please provide a message id.",
                            });
                            break;
                        }
                        const portalMessageId =
                            helpers.getPortalMessageId(messageId);
                        if (!portalMessageId) {
                            message.reply({
                                content: "Message not found.",
                            });
                            break;
                        }
                        const portalMessages =
                            helpers.getPortalMessages(portalMessageId);
                        for (const [
                            messageId,
                            portalMessage,
                        ] of portalMessages) {
                            const channel = await helpers.safeFetchChannel(
                                portalMessage.channelId
                            );
                            if (!channel) continue;
                            const message = await helpers.safeFetchMessage({
                                messageId: portalMessage.messageId,
                                channel
                            });
                            if (!message) continue;
                            try {
                                await message.delete();
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }
                }
                break;
            }
        }
    }
}

export default handleCommands;
