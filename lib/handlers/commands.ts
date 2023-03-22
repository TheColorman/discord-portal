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
import DiscordHelpersCore from "../helpers/discord_helpers.core";
import { UserId } from "../types";
import { portalIntro } from "../const";
import dotenv from "dotenv";

dotenv.config();
const token = process.env.TOKEN;

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
                        // console.error(e);
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
}

export default handleCommands;
