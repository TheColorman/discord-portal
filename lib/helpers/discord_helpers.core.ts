import {
    ChannelType,
    Client,
    GuildEmoji,
    Invite,
    Message,
    MessagePayload,
    PermissionFlagsBits,
    ReactionEmoji,
    Webhook,
    WebhookEditMessageOptions,
} from "discord.js";
import DatabaseHelpersCore from "./database_helpers.core";
import { Database } from "better-sqlite3";
import { DiscordChannel, PortalConnection, ValidChannel } from "../types";
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
        this.run(
            "DELETE FROM portalConnections WHERE channelId = ?",
            channelId
        );
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
        options: string | MessagePayload | WebhookEditMessageOptions
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
     * @param messageId Id of the message to delete
     * @returns The deleted message if successful, an Error object otherwise
     */
    public async deleteMessage(
        channel: ValidChannel,
        messageId: string
    ): Promise<Error | Message<true> | null> {
        // Fetch message
        const message = await this.safeFetchMessage(channel, messageId);
        if (!message) return null;
        try {
            // Attempt deletion using webhook
            const portalConnection = this.getPortalConnection(channel.id);
            const webhook = await this.getWebhook({
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

    /**
     * Attempt to fetch a Discord channel without throwing an error.
     * @param channelId Id of the channel to fetch
     * @returns A Discord TextChannel if it was found, null otherwise
     */
    public async safeFetchChannel(
        channelId: string
    ): Promise<ValidChannel | null> {
        try {
            return (await this.client.channels.fetch(channelId)) as ValidChannel;
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

        if (!webhookId) return this.createWebhook(channel);
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
        channel: string | ValidChannel ;
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
}
