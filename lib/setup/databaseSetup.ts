import BetterSqlite3 from "better-sqlite3";

function setupDatabase(db: BetterSqlite3.Database) {
    // Create tables
    console.log("Creating tables...");
    // Run this once for previous installations
    // Update portalMessages table to add attachmentId column
    // db.prepare(`ALTER TABLE portalMessages ADD COLUMN attachmentId TEXT DEFAULT ''`).run();

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
        attachmentId TEXT DEFAULT '',
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

    // Create default portal if none exists
    if (
        (
            db.prepare("SELECT COUNT(1) FROM portals").get() as {
                "COUNT(1)": number;
            }
        )["COUNT(1)"] === 0
    ) {
        db.prepare(
            "INSERT INTO portals (id, name, emoji, customEmoji, nsfw, private, password) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(["123456", "Genesis", "🎆", 0, 0, 0, ""]);
    }
}

export default setupDatabase;
