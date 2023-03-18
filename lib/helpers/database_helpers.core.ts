import type { Database } from "better-sqlite3";
import BaseHelpersCore from "./helpers.core";
import {
    ChannelId,
    MessageId,
    MessageType,
    Portal,
    PortalConnection,
    PortalConnectionOptions,
    PortalId,
    PortalMessage,
    PortalMessageId,
    UserId,
    LimitedAccount,
} from "../types";
import { Collection } from "discord.js";

export default class DatabaseHelpersCore extends BaseHelpersCore {
    private db: Database;
    constructor(db: Database) {
        super();
        this.db = db;
    }

    /**
     * Run an SQL query on the database.
     * @param query An SQL query
     * @param params Parameters for the SQL query
     */
    public run(query: string, ...params: any[]): void {
        this.db.prepare(query).run(params);
    }

    /**
     * Generates a unique portal ID.
     * @returns Unique portal ID
     */
    public generatePortalId(): PortalId {
        let id = Math.floor(Math.random() * 1000000).toString();
        const portals = this.getPortals();
        while (portals[id as keyof typeof portals])
            id = Math.floor(Math.random() * 1000000).toString();
        return id;
    }

    /**
     * Generates a unique portal message ID.
     * @returns Unique portal message ID
     */
    public generatePortalMessageId(): PortalMessageId {
        const id = Math.floor(Math.random() * 1000000).toString();
        const portalMessages = this.getPortalMessages(id);
        if (portalMessages[id as keyof typeof portalMessages])
            return this.generatePortalMessageId();
        return id;
    }

    /**
     * Create a new Portal.
     * @param param0 Portal options
     * @returns Created Portal
     */
    public createPortal({
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
        const portalId = this.generatePortalId();
        this.db
            .prepare(
                "INSERT INTO portals (id, name, emoji, customEmoji, nsfw, private, password) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
            .run([
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

    /**
     * Delete a Portal.
     * @param portalId Id of the Portal to delete
     * @returns Deleted portal
     */
    public deletePortal(portalId: string): Portal | null {
        const portal = this.getPortal(portalId);
        if (!portal) return null;
        this.db
            .prepare("DELETE FROM portalConnections WHERE portalId = ?")
            .run(portalId);
        this.db
            .prepare("DELETE FROM portalMessages WHERE portalId = ?")
            .run(portalId);
        this.db.prepare("DELETE FROM portals WHERE id = ?").run(portalId);
        return portal;
    }

    /**
     * Get a Portal.
     * @param portalId Id of the Portal to get
     * @returns Portal
     */
    public getPortal(portalId: string): Portal | null {
        const portal = this.db
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

    /**
     * Get all portals in the database.
     * @returns Collection of Portals mapped by Portal ID
     */
    public getPortals(): Collection<PortalId, Portal> {
        const portals = this.db.prepare("SELECT * FROM portals").all();
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

    /**
     * Get all Portal Connections in a guild.
     * @param guildId Id of the guild to get portal connections for
     * @returns Collection of Portal Connections in that guild mapped by Channel ID
     */
    public getGuildPortalConnections(
        guildId: string
    ): Collection<ChannelId, PortalConnection> {
        const portalConnections = this.db
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

    /**
     * Get a Portal Connection in a channel.
     * @param channelId Id of the channel to get the portal connection for
     * @returns A Portal Connection
     */
    public getPortalConnection(channelId: string): PortalConnection | null {
        const portalConnection = this.db
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

    /**
     * Get all Portal Connections in a portal.
     * @param portalId Id of the portals to get portal connections for
     * @returns Collection of Portal Connections in that portal mapped by Channel ID
     */
    public getPortalConnections(
        portalId: string
    ): Collection<ChannelId, PortalConnection> {
        const portalConnections = this.db
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

    /**
     * Update a Portal Connection for a channel.
     * @param channelId Id of the channel to update the portal connection for
     * @param portalConnectionOptions New options for the portal connection
     * @returns Updated Portal Connection
     */
    public updatePortalConnection(
        channelId: string,
        portalConnectionOptions: PortalConnectionOptions
    ): PortalConnection | null {
        const portalConnection = this.getPortalConnection(channelId);
        if (!portalConnection) return null;

        // Update only the options in portalConnectionOptions that are not null
        const { guildName, channelName, guildInvite, webhookId, webhookToken } =
            portalConnectionOptions;
        this.db
            .prepare(
                "UPDATE portalConnections SET guildName = ?, channelName = ?, guildInvite = ?, webhookId = ?, webhookToken = ? WHERE channelId = ?"
            )
            .run([
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

    /**
     * Create a Portal Message.
     * @param param0 Portal Message options
     * @returns A Portal Message
     */
    public createPortalMessage({
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
        this.db
            .prepare(
                "INSERT INTO portalMessages (id, portalId, messageId, channelId, messageType) VALUES (?, ?, ?, ?, ?)"
            )
            .run([id, portalId, messageId, channelId, messageType]);
        return {
            id,
            portalId,
            messageId,
            channelId,
            messageType,
        };
    }

    /**
     * Delete a Portal Message by its id.
     * @param id Id of the Portal Message
     * @returns Deleted Portal Message
     */
    public deletePortalMessages(
        id: PortalMessageId
    ): Map<MessageId, PortalMessage> | null {
        const portalMessages = this.getPortalMessages(id);
        if (!portalMessages.size) return null;
        this.db.prepare("DELETE FROM portalMessages WHERE id = ?").run(id);
        return portalMessages;
    }

    /**
     * Get a group of Portal Messages by its id.
     * @param id Id of the group of Portal Messages
     * @returns Collection of Portal Messages in that group mapped by Message ID
     */
    public getPortalMessages(
        id: PortalMessageId
    ): Collection<MessageId, PortalMessage> {
        const portalMessages = this.db
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

    /**
     * Get a Portal Message by its Discord Message id.
     * @param messageId Id of the Discord message whose Portal Message id is to be found
     * @returns Id of the Portal Message
     */
    public getPortalMessageId(messageId: MessageId): PortalMessageId | null {
        const portalMessageId = this.db
            .prepare("SELECT id FROM portalMessages WHERE messageId = ?")
            .get(messageId)?.id;
        if (!portalMessageId) return null;
        return portalMessageId;
    }

    /**
     * Check if a user id is a limited account.
     * @param userId Id of the user to check
     * @returns Limited account status
     */
    public getLimitedAccounts(userId: UserId): LimitedAccount[] {
        const limitedAccounts = this.db
            .prepare("SELECT * FROM limitedAccounts WHERE id = ?")
            .all(userId);
        return limitedAccounts.map((limitedAccount) => ({
            userId: limitedAccount.userId,
            portalId: limitedAccount.portalId,
            channelId: limitedAccount.channelId,
            reason: limitedAccount.reason,
            banned: Boolean(limitedAccount.banned),
            bot: Boolean(limitedAccount.bot),
        }));
    }

    /**
     * Check if there is a limited account for a user id and portal id.
     * @param param0 userId and portalId of the limited account to get
     * @returns Limited account status
     */
    public getLimitedAccount({ userId, portalId }: { userId: UserId, portalId: PortalId }): LimitedAccount | null {
        const limitedAccount = this.db
            .prepare(
                "SELECT * FROM limitedAccounts WHERE userId = ? AND portalId = ?"
            )
            .get(userId, portalId);
        if (!limitedAccount) return null;
        return {
            userId: limitedAccount.userId,
            portalId: limitedAccount.portalId,
            channelId: limitedAccount.channelId,
            reason: limitedAccount.reason,
            banned: Boolean(limitedAccount.banned),
            bot: Boolean(limitedAccount.bot),
        };
    }

    /**
     * Mark a user id as a limited account.
     * @param userId Id of the user to mark
     * @param options Options for the limited account
     * @returns Limited account status
     */
    public setLimitedAccount(
        userId: UserId,
        options: {
            portalId: PortalId;
            channelId: ChannelId;
            reason: string;
            banned: boolean;
            bot: boolean;
        }
    ): LimitedAccount {
        this.db
            .prepare(
                "INSERT INTO limitedAccounts (userId, portalId, channelId, reason, banned, bot) VALUES (?, ?, ?, ?, ?, ?)"
            )
            .run([
                userId,
                options.portalId,
                options.channelId,
                options.reason,
                Number(options.banned),
                Number(options.bot),
            ]);
        return {
            userId,
            portalId: options.portalId,
            channelId: options.channelId,
            reason: options.reason,
            banned: options.banned,
            bot: options.bot,
        };
    }

    /**
     * Update a limited account.
     * @param userId Id of the user to update
     * @param options Options for the limited account
     * @returns Limited account status
     */
    public updateLimitedAccount(
        userId: UserId,
        options: {
            portalId: PortalId;
            channelId: ChannelId;
            reason: string;
            banned: boolean;
            bot: boolean;
        }
    ): LimitedAccount {
        const limitedAccount = this.getLimitedAccount({ userId, portalId: options.portalId});
        if (!limitedAccount) {
            return this.setLimitedAccount(userId, options);
        }
        this.db
            .prepare(
                "UPDATE limitedAccounts SET reason = ?, banned = ?, channelId = ? WHERE userId = ? and portalId = ?"
            )
            .run([
                options.reason,
                Number(options.banned),
                options.channelId,
                userId,
                options.portalId,
            ]);
        return {
            userId,
            portalId: options.portalId,
            channelId: options.channelId,
            reason: options.reason,
            banned: options.banned,
            bot: options.bot,
        };
    }

    /**
     * Delete a limited account.
     * @param userId userId of the limited account to delete
     * @param portalId portalId of the limited account to delete
     * @returns Deleted limited account
     */
    public deleteLimitedAccount(userId: UserId, portalId: PortalId): LimitedAccount | null {
        const limitedAccount = this.getLimitedAccount({ userId, portalId });
        if (!limitedAccount) return null;
        this.db
            .prepare(
                "DELETE FROM limitedAccounts WHERE userId = ? AND portalId = ?"
            )
            .run(userId, portalId);
        return limitedAccount;
    }
}
