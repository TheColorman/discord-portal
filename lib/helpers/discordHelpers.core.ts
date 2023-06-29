import {
    Attachment,
    ChannelType,
    Client,
    Collection,
    FetchMemberOptions,
    FetchMembersOptions,
    Guild,
    GuildEmoji,
    Invite,
    Message,
    MessageCreateOptions,
    MessageEditOptions,
    MessagePayload,
    PermissionFlagsBits,
    ReactionEmoji,
    UserResolvable,
    Webhook,
    WebhookMessageCreateOptions,
    WebhookMessageEditOptions,
} from "discord.js";
import DatabaseHelpersCore from "./databaseHelpers.core";
import { Database } from "better-sqlite3";
import {
    AttachmentId,
    ChannelId,
    DiscordChannel,
    PortalConnection,
    PortalId,
    PortalMessage,
    PortalMessageId,
    PortalSourceMessage,
    PortalWebhookMessage,
    ValidChannel,
    ValidMessage,
} from "../types";
import { webhookAvatars } from "../const";

export default class DiscordHelpersCore extends DatabaseHelpersCore {
    private client: Client;
    constructor(client: Client, db: Database) {
        super(db);
        this.client = client;
    }

    /**
     * Create a new Portal Connection
     * @param param0 Portal Connection options
     * @returns New Portal Connection
     */
    public async createPortalConnection({
        portalId,
        channelId,
        guildInvite,
    }: {
        portalId: string;
        channelId: string;
        guildInvite?: string;
    }): Promise<PortalConnection | Error> {
        const channel = await this.safeFetchChannel(channelId);
        if (!channel) return Error("Channel not found.");
        const webhook = await this.getWebhook({ channel });
        if (!webhook) return Error("Failed to create webhook.");
        this.run(
            "INSERT INTO portalConnections (portalId, guildId, guildName, channelId, channelName, guildInvite, webhookId, webhookToken) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                portalId,
                channel.guildId,
                channel.guild.name,
                channelId,
                channel.name,
                guildInvite || "",
                webhook.id,
                webhook.token,
            ]
        );
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

    /**
     * Delete a Portal Connection by its channel id
     * @param channelId Id of the channel to remove the portal connection from
     * @returns The deleted portal connection
     */
    public async deletePortalConnection(
        channelId: string
    ): Promise<PortalConnection | null> {
        const portalConnection = this.getPortalConnection(channelId);
        if (!portalConnection) return null;
        // Delete webhook
        await this.deleteWebhook({ channel: channelId });

        // Delete portal connection
        this.run("DELETE FROM portalConnections WHERE channelId = ?", [
            channelId,
        ]);
        return portalConnection;
    }

    /**
     * Attempt to fetch a Discord message without throwing an error.
     * @param channel Discord channel
     * @param messageId Id of the message to fetch
     * @returns A Discord Message if it was found, null otherwise
     */
    public async safeFetchMessage(
        channel: ValidChannel,
        messageId: string
    ): Promise<Message<true> | null> {
        try {
            return await channel.messages.fetch(messageId);
        } catch (err) {
            return null;
        }
    }

    /**
     * Attempt to edit a Discord message without throwing an error.
     * @param channel Discord channel
     * @param messageId Id of the message to edit
     * @param options New message options
     * @returns The edited message if successful, null otherwise
     */
    public async editMessage(
        channel: ValidChannel,
        messageId: string,
        options: string | MessagePayload | WebhookMessageEditOptions
    ): Promise<Error | Message<boolean> | null> {
        const portalConnection = this.getPortalConnection(channel.id);
        if (!portalConnection) return Error("No Portal connection found.");

        try {
            // Edit message using webhook
            const webhook = await this.getWebhook({
                channel,
                webhookId: portalConnection.webhookId,
            });
            if (!webhook) return Error("No webhook found.");
            return await webhook.editMessage(messageId, options);
        } catch (err) {
            // We probably failed because the channel has multiple webhooks
            this.deleteWebhooks(channel);
            return null;
        }
    }

    /**
     * Attempt to delete a Discord message without throwing an error.
     * @param channel Discord channel
     * @param message Id of the message to delete
     * @returns The deleted message if successful, an Error object otherwise
     */
    public async deleteMessage(
        channel: ValidChannel,
        message: string | Message
    ): Promise<Error | Message | null> {
        // Fetch message
        if (typeof message === "string") {
            const fetchedMessage = await this.safeFetchMessage(
                channel,
                message
            );
            if (!fetchedMessage) return null;
            message = fetchedMessage;
        }
        try {
            // Attempt deletion using webhook
            const portalConnection = this.getPortalConnection(channel.id);
            const webhook = await this.getWebhook({
                channel,
                webhookId: portalConnection?.webhookId,
            });
            if (!webhook) throw Error("No webhook found.");
            await webhook.deleteMessage(message);

            return message;
        } catch (err) {
            // If webhook fails, attempt deletion using bot account
            try {
                await message.delete();
                return message;
            } catch (err) {
                // We don't have permission to delete the message
                console.log(err);
                return Error("No permission to delete message.");
            }
        }
    }

    /**
     * Attempt to fetch a Discord channel without throwing an error.
     * @param channelId Id of the channel to fetch
     * @returns A Discord TextChannel if it was found, null otherwise
     */
    public async safeFetchChannel(
        channelId: string
    ): Promise<ValidChannel | null> {
        try {
            return (await this.client.channels.fetch(
                channelId
            )) as ValidChannel;
        } catch (err) {
            console.log("Failed to fetch channel.");
            // console.error(err);
            return null;
        }
    }

    /**
     * Create a webhook for a Discord channel.
     * @param channel Discord channel where the webhook should be created
     * @returns Discord Webhook
     */
    public async createWebhook(channel: ValidChannel): Promise<Webhook> {
        const webhook = await channel.createWebhook({
            name: "Portal connection",
            avatar: webhookAvatars[
                Math.floor(Math.random() * webhookAvatars.length)
            ],
            reason: "New Portal connection established",
        });
        return webhook;
    }

    /**
     * Get a Discord webhook for a channel. Creates a new webhook if none is found.
     * @param param0 Discord channel and optional webhook id. Always pass webhook id if possible.
     * @returns A Discord Webhook
     */
    public async getWebhook({
        channel,
        webhookId,
    }: {
        channel: string | ValidChannel;
        webhookId?: string;
    }): Promise<Webhook | null> {
        if (typeof channel === "string") {
            const fetchedChannel = await this.safeFetchChannel(channel);
            if (!fetchedChannel) return null;
            channel = fetchedChannel;
        }

        if (!webhookId) {
            // Check if we already have a webhook for this channel
            const portalWebhokook = (await channel.fetchWebhooks()).find(
                (wh) => wh.applicationId === this.client.user?.id
            );
            return portalWebhokook || this.createWebhook(channel);
        }
        const webhook = (await channel.fetchWebhooks()).get(webhookId);
        if (!webhook) {
            const webhook = await this.createWebhook(channel);
            this.updatePortalConnection(channel.id, {
                webhookId: webhook.id,
                webhookToken: webhook.token!,
            });
            return webhook;
        } else return webhook;
    }

    /**
     * Delete a Discord webhook.
     * @param param0 Discord channel and optional webhook id. Always pass webhook id if possible.
     * @returns The deleted webhook if successful, null otherwise
     */
    public async deleteWebhook({
        channel,
        webhookId,
    }: {
        channel: string | ValidChannel;
        webhookId?: string;
    }): Promise<Webhook | null> {
        const webhook = await this.getWebhook({ channel, webhookId });
        if (!webhook) return null;
        webhook.delete();
        return webhook;
    }

    /**
     * Delete all webhooks for a Discord channel.
     * @param channel Discord channel or id
     */
    public async deleteWebhooks(channel: string | ValidChannel) {
        if (typeof channel === "string") {
            const fetchedChannel = await this.safeFetchChannel(channel);
            if (!fetchedChannel) return;
            channel = fetchedChannel;
        }
        const webhooks = await channel.fetchWebhooks();
        for (const [id, webhook] of webhooks) {
            if (!webhook.token) continue;
            webhook.delete();
        }
    }

    /**
     * Check if a message author has the "Manage Channels" permission.
     * @param message Discord message
     * @returns Boolean indicating whether the user has the required permissions
     */
    public checkPermissions(message: Message): boolean {
        // TODO: Generalize this
        if (
            !message.member?.permissions.has(PermissionFlagsBits.ManageChannels)
        ) {
            message.reply(
                "You need the `Manage Channels` permission to use this command."
            );
            return false;
        }
        return true;
    }

    /**
     * Attempt to create a Discord Invite in a channel.
     * @param channel Discord channel to create the invite in
     * @returns A Discord Invite if successful, an Error object otherwise
     */
    public async createInvite(channel: ValidChannel): Promise<Invite | Error> {
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

    /**
     * React to a message with a given emoji.
     * @param message Discord Message to react to
     * @param emoji Discord Emoji to react with
     */
    public async addReaction(
        message: Message,
        emoji: GuildEmoji | ReactionEmoji
    ) {
        try {
            await message.react(emoji);
        } catch (err) {
            // We don't have access to the emoji
            // console.error(err);
            // TODO: Check whether we have access to the emoji before trying to react
        }
    }

    /**
     * Check if a Discord channel is a valid channel for a portal.
     * @param channel A Discord channel
     * @returns Whether the channel is a valid channel for a portal
     */
    public isValidChannel(channel: DiscordChannel): channel is ValidChannel {
        return (
            channel.type === ChannelType.GuildText ||
            channel.type === ChannelType.GuildAnnouncement ||
            channel.type === ChannelType.AnnouncementThread ||
            channel.type === ChannelType.PublicThread ||
            channel.type === ChannelType.PrivateThread
        );
    }

    public isValidMessage(message: Message): message is ValidMessage {
        return this.isValidChannel(message.channel) && !message.partial;
    }

    /**
     * Check if a Discord message is a guild message.
     * @param message A Discord message
     * @returns Whether the message is a guild message
     */
    public isGuildMessage(message: Message): message is Message<true> {
        return !!message.guildId;
    }

    /**
     * Check if a Discord message is a portal source message.
     * @param message A Discord message
     * @returns Whether the message is a portal source message
     */
    public isPortalSourceMessage(
        message: Message
    ): message is PortalSourceMessage {
        const portalMessage = this.getPortalMessage(message.id);
        return portalMessage?.messageType === "original";
    }

    public isPortalWebhookMessage(
        message: Message
    ): message is PortalWebhookMessage {
        const portalMessage = this.getPortalMessage(message.id);
        return (
            portalMessage?.messageType === "linked" ||
            portalMessage?.messageType === "linkedAttachment"
        );
    }
    public async sendMessageToPortalAsBot({
        portalId,
        sourceChannelId,
        options,
        replyToPortalMessageId,
    }: {
        portalId: PortalId;
        sourceChannelId: ChannelId;
        options:
            | string
            | MessagePayload
            | MessageCreateOptions
            | (({
                  portalConnection,
                  channel,
              }: {
                  portalConnection: PortalConnection;
                  channel: ValidChannel;
              }) =>
                  | Promise<string | MessagePayload | MessageCreateOptions>
                  | string
                  | MessagePayload
                  | MessageCreateOptions);
        replyToPortalMessageId?: PortalMessageId;
    }) {
        const portalConnections = this.getPortalConnections(portalId);
        if (!portalConnections.size)
            return new Error("No Portal connections found");

        // Generate a unique portal message id
        const portalMessageId = this.generatePortalMessageId();

        // Send all messages
        const promises = portalConnections.map(async (portalConnection) => {
            const channel = await this.safeFetchChannel(
                portalConnection.channelId
            );
            if (!channel) {
                this.deletePortalConnection(portalConnection.channelId);
                return;
            }

            // Get message content
            const content =
                typeof options === "function"
                    ? await options({
                          portalConnection,
                          channel,
                      })
                    : options;

            // Get replyTo message
            const replyToMessage = await (() => {
                if (!replyToPortalMessageId) return undefined;
                const replyToPortalMessages = this.getPortalMessages(
                    replyToPortalMessageId
                );
                if (!replyToPortalMessages) return undefined;
                const replyToPortalMessage = replyToPortalMessages.find(
                    (pm) =>
                        pm.channelId === portalConnection.channelId &&
                        pm.messageType !== "linkedAttachment"
                );
                if (!replyToPortalMessage) return undefined;
                return this.safeFetchMessage(
                    channel,
                    replyToPortalMessage.messageId
                );
            })();

            // Send message
            const sent = replyToMessage
                ? await replyToMessage.reply(content)
                : await channel.send(content);
            // Add portal message
            this.createPortalMessage({
                id: portalMessageId,
                portalId,
                messageId: sent.id,
                channelId: portalConnection.channelId,
                messageType:
                    portalConnection.channelId === sourceChannelId
                        ? "original"
                        : "linked",
            });
        });

        // Wait for all messages to be sent
        await Promise.all(promises);

        return portalMessageId;
    }

    /**
     * Sends a single message as Webhook to a channel.
     * @param param0
     * @returns
     */
    public async sendMessageAsWebhook({
        channel,
        options,
        portalConnection,
    }: {
        channel: string | ValidChannel;
        options: WebhookMessageCreateOptions;
        portalConnection?: PortalConnection;
    }) {
        const webhook = await this.getWebhook({
            channel,
            webhookId: portalConnection?.webhookId,
        });
        if (!webhook) return new Error("Failed to get webhook");

        const sent = await webhook.send(options);
        if (!sent) return new Error("Failed to send message");

        return sent;
    }

    /**
     * Sends a message as Webhook to all channels connected to a Portal.
     * @param portalId ID of the Portal
     * @param source Channel where this message originates
     * @param options Either message options, or a function that returns message options.
     * The function is passed an object containing the PortalConnection and channel of the given portal connection.
     * @param portalReferenceId ID of the PortalMessage to reply to, if any
     * @returns An Error object if an error occurs, the generated PortalMessage id otherwise
     */
    public async sendMessageToPortalAsWebhook({
        portalId,
        sourceChannelId,
        options,
        portalReferenceId,
    }: {
        portalId: PortalId;
        sourceChannelId: ChannelId;
        options:
            | WebhookMessageCreateOptions
            | ((
                  portalConnection: PortalConnection
              ) =>
                  | Promise<WebhookMessageCreateOptions>
                  | WebhookMessageCreateOptions);
        portalReferenceId?: PortalMessageId;
    }) {
        const portalConnections = this.getPortalConnections(portalId);
        if (!portalConnections.size)
            return new Error("No Portal connections found");

        const sourcePortalConnection = portalConnections.find(
            (pc) => pc.channelId === sourceChannelId
        );

        // Generate a unique portal message id
        const portalMessageId = this.generatePortalMessageId();

        // Send all messages
        const promises = portalConnections.map(async (portalConnection) => {
            // Get reference
            const localPortalReference = (() => {
                if (!portalReferenceId) return undefined;
                // Get all portal messages with the given id
                const portalReferences =
                    this.getPortalMessages(portalReferenceId);
                if (!portalReferences) return undefined;
                // Get local portal reference in this channel
                const localPortalReference = portalReferences.find(
                    (pm) =>
                        pm.channelId === portalConnection.channelId &&
                        pm.messageType !== "linkedAttachment"
                );
                if (!localPortalReference) return undefined;
                return localPortalReference;
            })();

            // Get message content
            const content =
                typeof options === "function"
                    ? await options(portalConnection)
                    : options;
            const formatted = localPortalReference
                ? await this.formatWebhookReply({
                      options: content,
                      portalMessage: localPortalReference,
                  })
                : content;

            // Add avatar and username, if not already set in options
            const webhookOptions: WebhookMessageCreateOptions = Object.assign(
                {
                    avatarURL: this.client.user?.avatarURL() || "",
                    username:
                        portalConnection.channelId === sourceChannelId
                            ? this.client.user?.username || "Portal"
                            : `${this.client.user?.username || "Portal"} @ ${
                                  sourcePortalConnection?.guildName || ""
                              }`,
                },
                formatted
            );

            // Send message
            const sent = await this.sendMessageAsWebhook({
                channel: portalConnection.channelId,
                options: webhookOptions,
                portalConnection,
            });
            if (sent instanceof Error) return sent;

            // Add portal message
            this.createPortalMessage({
                id: portalMessageId as PortalMessageId,
                portalId,
                messageId: sent.id,
                channelId: portalConnection.channelId,
                messageType:
                    portalConnection.channelId === sourceChannelId
                        ? "original"
                        : "linked",
            });
        });

        await Promise.all(promises);

        return portalMessageId;
    }

    /**
     * Propegates a message from to the entire Portal
     * @param param0 Options
     * @returns An Error object if an error occurs, the generated PortalMessage id otherwise
     */
    public async propegatePortalMessage({
        portalId,
        message,
        options,
        attachments,
    }: {
        portalId: PortalId;
        message: ValidMessage;
        options: WebhookMessageCreateOptions;
        attachments?: Collection<AttachmentId, Attachment>;
    }) {
        const portalConnections = this.getPortalConnections(portalId);
        if (!portalConnections.size)
            return new Error("No Portal connections found");

        // Generate a unique portal message id
        const portalMessageId = this.generatePortalMessageId();

        // Add original message to database
        this.createPortalMessage({
            id: portalMessageId,
            portalId,
            messageId: message.id,
            channelId: message.channelId,
            messageType: "original",
        });

        // Generate messages
        const promises = portalConnections.map(async (portalConnection) => {
            // Skip if portal connection is the source
            if (portalConnection.channelId === message.channelId) return;

            // Get channel
            const channel = await this.safeFetchChannel(
                portalConnection.channelId
            );
            if (!channel) return;

            // Get reference
            const localPortalReference = (() => {
                if (!(message.reference && message.reference.messageId))
                    return undefined;
                // Get portal message with reference id
                const sourcePortalReference = this.getPortalMessage(
                    message.reference.messageId
                );
                if (!sourcePortalReference) return undefined;
                // Get all portal messages with the same portal message id
                const portalReferences = this.getPortalMessages(
                    sourcePortalReference.id
                );
                // Get local portal reference in this channel
                const localPortalReference = portalReferences.find(
                    (pm) =>
                        pm.channelId === portalConnection.channelId &&
                        pm.messageType !== "linkedAttachment"
                );
                if (!localPortalReference) return undefined;
                return localPortalReference;
            })();

            // Format any cross-server features
            let content = await this.processMessageContent({
                options,
                targetChannel: channel,
                originalMessage: message,
            });

            // Get reply message content
            content = localPortalReference
                ? await this.formatWebhookReply({
                      options: content,
                      portalMessage: localPortalReference,
                  })
                : content;

            // Send message
            const sent = await this.sendMessageAsWebhook({
                channel,
                options: content,
                portalConnection: portalConnection,
            });
            if (sent instanceof Error) return sent;

            // Add linked message to database
            this.createPortalMessage({
                channelId: portalConnection.channelId,
                id: portalMessageId,
                messageId: sent.id,
                messageType: "linked",
                portalId,
            });

            // Send attachments
            for (const [attachmentId, attachment] of attachments || []) {
                const sentAttachment = await this.sendMessageAsWebhook({
                    channel,
                    options: {
                        content: attachment.url,
                        username: options.username,
                        avatarURL: options.avatarURL,
                        allowedMentions: options.allowedMentions,
                    },
                    portalConnection,
                });
                if (sentAttachment instanceof Error) return sentAttachment;

                // Add linked attachment to database
                this.createPortalMessage({
                    channelId: portalConnection.channelId,
                    id: portalMessageId,
                    messageId: sentAttachment.id,
                    messageType: "linkedAttachment",
                    portalId,
                    attachmentId: attachmentId,
                });
            }
        });

        // Wait for all messages to be sent
        await Promise.all(promises);

        return portalMessageId;
    }

    /**
     * Formats the content of a message sent as Webhook reply by adding "reply" line.
     * @param param0 Message options and PortalMessage to reply to
     * @returns Formatted message options
     */
    public async formatWebhookReply({
        options,
        portalMessage,
    }: {
        options: WebhookMessageCreateOptions;
        portalMessage: PortalMessage;
    }): Promise<WebhookMessageCreateOptions> {
        const prepend =
            (await (async () => {
                // Fetch necessary data
                const channel = await this.safeFetchChannel(
                    portalMessage.channelId
                );
                if (!channel) return undefined;

                const message = await this.safeFetchMessage(
                    channel,
                    portalMessage.messageId
                );
                if (!message) return undefined;
                const originalPortalMessage = this.getPortalMessages(
                    portalMessage.id
                ).find((pm) => pm.messageType === "original");
                if (!originalPortalMessage) return undefined;
                const originalMessageChannel = await this.safeFetchChannel(
                    originalPortalMessage.channelId
                );
                if (!originalMessageChannel) return undefined;
                const originalMessage = await this.safeFetchMessage(
                    originalMessageChannel,
                    originalPortalMessage.messageId
                );

                // Format reply
                const authorName = originalMessage?.author?.username
                    ? originalMessage.author.discriminator == "0"
                        ? originalMessage.author.username
                        : `${originalMessage.author.username}#${originalMessage.author.discriminator}`
                    : "Unknown";
                // Remove first line from message content if it contains reply text
                const firstline = message.content.split("\n")[0];
                if (
                    firstline.includes("Reply to") ||
                    firstline.includes("`Reply failed`") ||
                    firstline.includes("Click to see attachment 🖾")
                ) {
                    message.content = message.content
                        .split("\n")
                        .slice(1)
                        .join("\n");
                }
                let referenceContent =
                    // Check if message is attachment
                    message.content.length === 0
                        ? "(Click to see attachment 🖾)"
                        : message.content
                              .replace(/\n/g, " ")
                              // Replace <@id> with @username
                              .replace(/<@!?([0-9]+)>/g, (_, id) => {
                                  const user =
                                      message.client.users.cache.get(id);
                                  if (!user) return "@Unknown";
                                  return `@${user.username}`;
                              });
                // Escape backticks
                referenceContent = referenceContent.replace(/`/g, "´");
                // Escape square brackets
                referenceContent = referenceContent.replace(/\[/g, "［");
                referenceContent = referenceContent.replace(/\]/g, "］");
                // Limit reference content length
                if (referenceContent.length > 50 - authorName.length)
                    referenceContent =
                        referenceContent.substring(0, 50 - authorName.length) +
                        "...";
                const guildId = message.guildId;
                const channelId = message.channelId;
                const messageId = message.id;

                const url = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

                const sameChannel = originalMessage?.channelId === channelId;
                const authorString = sameChannel
                    ? originalMessage?.author?.toString()
                    : "`@" + authorName + "`";
                const brackets = "⦗⦘";

                return sameChannel
                    ? "[" +
                          brackets[0] +
                          "Reply to" +
                          "](<" +
                          url +
                          ">) " +
                          authorString +
                          " [- `" +
                          referenceContent +
                          "`" +
                          brackets[1] +
                          "](<" +
                          url +
                          ">)"
                    : "[" +
                          brackets[0] +
                          "Reply to " +
                          authorString +
                          " - `" +
                          referenceContent +
                          "`" +
                          brackets[1] +
                          "](<" +
                          url +
                          ">)";
            })()) || "`⦗Reply failed⦘`";

        return {
            ...options,
            content: prepend + "\n" + (options.content || ""),
        };
    }

    /**
     * Edits a message sent to a Portal as Bot.
     * @param param0 PortalMessageId and message options
     */
    public async editMessageAsBot({
        portalMessageId,
        options,
    }: {
        portalMessageId: PortalMessageId;
        options:
            | string
            | MessagePayload
            | MessageEditOptions
            | ((
                  message: Message
              ) =>
                  | Promise<string | MessagePayload | MessageEditOptions>
                  | string
                  | MessagePayload
                  | MessageEditOptions);
    }) {
        const portalMessages = this.getPortalMessages(portalMessageId);
        if (!portalMessages) return;

        const promises = portalMessages.map(async (portalMessage) => {
            const channel = await this.safeFetchChannel(
                portalMessage.channelId
            );
            if (!channel) return;

            const message = await this.safeFetchMessage(
                channel,
                portalMessage.messageId
            );
            if (!message) return;

            const messageEditOptions =
                typeof options === "function"
                    ? await options(message)
                    : options;

            await message.edit(messageEditOptions);
        });

        await Promise.all(promises);
    }

    public async updatePortalMessageAsWebhook({
        portalMessageId,
        options,
    }: {
        portalMessageId: PortalMessageId;
        options:
            | WebhookMessageEditOptions
            | ((
                  message: Message
              ) =>
                  | Promise<WebhookMessageEditOptions>
                  | WebhookMessageEditOptions);
    }) {
        const portalMessages = this.getPortalMessages(portalMessageId)?.filter(
            (pm) => pm.messageType === "linked"
        );
        if (!portalMessages) return;

        const promises = portalMessages.map(async (portalMessage) => {
            const webhook = await this.getWebhook({
                channel: portalMessage.channelId,
            });
            if (!webhook) return;

            const message = await webhook.fetchMessage(portalMessage.messageId);

            const localOptions = JSON.parse(
                JSON.stringify(
                    typeof options === "function"
                        ? await options(message)
                        : options
                )
            );

            // We want to keep the first line of the original message content, if it is a reply to another message
            const firstline = message.content.split("\n")[0];
            if (
                firstline.includes("Reply to") ||
                firstline.includes("`Reply failed`")
            ) {
                localOptions.content = firstline + "\n" + localOptions.content;
            }

            await webhook.editMessage(portalMessage.messageId, localOptions);
        });

        await Promise.all(promises);
    }

    public async updatePortalMessage({
        sourceMessage,
        options,
    }: {
        sourceMessage: ValidMessage;
        options: WebhookMessageEditOptions;
    }) {
        // Get portal message id
        const portalMessageId = this.getPortalMessageId(sourceMessage.id);
        if (!portalMessageId) return new Error("No portal message found");

        // Update portal messages
        await this.updatePortalMessageAsWebhook({
            portalMessageId,
            options,
        });

        // Update attachments
        // /i\ The only update an attachment can receive is a removal.
        // So the only thing we need to do is remove any attachments that aren't in the new list.
        const portalMessages = this.getPortalMessages(portalMessageId);
        const oldAttachments = portalMessages.filter(
            (pm) => pm.messageType === "linkedAttachment"
        );
        const newAttachments = sourceMessage.attachments.map((a) => a.id);

        const promises = oldAttachments.map(async (pm) => {
            if (!pm.attachmentId || newAttachments.includes(pm.attachmentId))
                return;

            // Fetch message
            const channel = await this.safeFetchChannel(pm.channelId);
            if (!channel) return;
            const message = await this.safeFetchMessage(channel, pm.messageId);
            if (!message) return;

            // Delete message
            await this.deleteMessage(channel, message);
        });

        await Promise.all(promises);
    }

    /**
     * Prepares a message to be sent to a Portal.
     * @param message Discord message
     * @returns Object including content, embeds and files
     */
    public async preparePortalMessage(message: ValidMessage) {
        // -- Preprocess message --
        // Replace image embeds with links
        const embeds = this.cleanEmbeds(message.embeds);

        // Convert unknown emojis
        let content = this.convertEmojis(message);

        // Convert stickers
        const stickerAttachments = await this.convertStickers(message.stickers);

        // Convert attachments
        const { linkified, remaining } = await this.convertAttachments(message);

        // Replace content with first attachment link if there is no content, no embeds and no files.
        if (
            content.length === 0 &&
            embeds.length === 0 &&
            remaining.size === 0 &&
            stickerAttachments.length === 0
        ) {
            content = linkified.first()?.url || "";
            linkified.delete(linkified.firstKey() || "");
            message.attachments.delete(message.attachments.firstKey() || "");
        }

        return {
            content,
            embeds,
            files: [...stickerAttachments, ...remaining.toJSON()],
            attachments: linkified,
        };
    }

    /**
     * Preprocesses a message to be sent to a Portal as a webhook.
     * @param param0 The message options to modify and the channel the message will me sent to
     */
    public async processMessageContent({
        options,
        targetChannel,
        originalMessage,
    }: {
        options: WebhookMessageCreateOptions;
        targetChannel: ValidChannel;
        originalMessage: ValidMessage;
    }): Promise<WebhookMessageCreateOptions> {
        // Cross-server mentions
        let newOptions = await (async () => {
            if (!options.content) return options;

            const mentionFinder = /@\S+/gm;
            const mentions = [...options.content.matchAll(mentionFinder)];

            if (mentions.length == 0) {
                return options; // We don't have any other features right now so this is fine
            }

            const promises = mentions.map(async (mention) => {
                const match = mention[0].slice(1);
                const [username, discriminator] = match.split("#");

                const members = await targetChannel.guild.members.fetch({
                    query: username,
                });
                const member = members.find((m) =>
                    m.user.username === username && discriminator
                        ? m.user.discriminator === discriminator
                        : true
                );
                if (!member) return;

                // Replace mention with user id
                options.content = options.content!.replace(
                    `@${match}`,
                    `<@${member.id}>`
                );
            });

            await Promise.all(promises);
            return options;
        })();

        // Format mentions as normal text on servers that dont have the mentioned user
        newOptions = await (async () => {
            if (!originalMessage.mentions.users.size) return newOptions;

            const promises = originalMessage.mentions.users.map(
                async (mentionedUser) => {
                    const member = await this.safeFetchMember(
                        targetChannel.guild,
                        mentionedUser
                    );
                    if (member) return;

                    // Replace mention with username and discriminator
                    newOptions.content = newOptions.content!.replace(
                        `<@${mentionedUser.id}>`,
                        `@${mentionedUser.username}${
                            mentionedUser.discriminator == "0"
                                ? ""
                                : "#" + mentionedUser.discriminator
                        }`
                    );
                }
            );

            await Promise.all(promises);
            return newOptions;
        })();

        return options;
    }

    /**
     * Attempts to fetch a member from a guild. Returns null if not found.
     * @param guild Guild to fetch member from
     * @param options Options to pass to members.fetch
     * @returns Member or null if not found
     */
    public async safeFetchMember(
        guild: Guild,
        options:
            | UserResolvable
            | FetchMemberOptions
            | (FetchMembersOptions & {
                  user: UserResolvable;
              })
    ) {
        try {
            return await guild.members.fetch(options);
        } catch (e) {
            return null;
        }
    }
}
