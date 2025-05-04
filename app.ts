import { Client, Events, GatewayIntentBits } from "discord.js";
import sqlite3 from "better-sqlite3";
import dotenv from "dotenv";
import DiscordHelpersCore from "./lib/helpers/discordHelpers.core";
import { MessageId, UserId } from "./lib/types";
import {
  handlePortal,
  handleCommands,
  handleDeleteMessage,
  handleReact,
  handleInteraction,
  handleMessageUpdate,
} from "./lib/handlers";
import fullSetup from "./lib/setup";
import { MessageEvent, Queue } from "./lib/messageEventClasses";
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
          ")",
      )
      .join(" -> ")
  );
};

const token = process.env.TOKEN;

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

fullSetup(db);

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

// Enqueue message operations to make sure we don't edit before the webhook has sent
const messageEventQueueMap = new Map<MessageId, Queue<MessageEvent>>();

client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user?.tag}`);
});

// Receive messages
client.on(Events.MessageCreate, async (message) => {
  // Ignore if webhook
  if (message.webhookId) return;
  // Ignore if DM
  if (!helpers.isGuildMessage(message)) return;
  // Ignore if not ValidMessage (implies ValidChannel)
  if (!helpers.isValidMessage(message)) return;
  // Ignore if self
  if (message.author.id === client.user?.id) return;

  // Portal functionality
  helpers.enqueueMessageEvent(
    new MessageEvent(message.id, messageEventQueueMap, async () => {
      await handlePortal(message, helpers);
    }),
  );

  // Commands
  helpers.enqueueMessageEvent(
    new MessageEvent(message.id, messageEventQueueMap, async () => {
      await handleCommands(message, helpers, connectionSetups);
    }),
  );
});

// Delete messages
client.on(Events.MessageDelete, async (message) => {
  // Ignore webhook deletions
  if (message.webhookId) return;

  helpers.enqueueMessageEvent(
    new MessageEvent(message.id, messageEventQueueMap, async () => {
      await handleDeleteMessage(message, helpers);
    }),
  );
});

// Edit messages
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  // Ignore webhook edits
  if (newMessage.webhookId) return;
  // Fetch message if partial
  const sourceMessage = newMessage.partial
    ? await newMessage.fetch()
    : newMessage;
  // Ignore if not valid message
  if (!helpers.isValidMessage(sourceMessage)) return;

  helpers.enqueueMessageEvent(
    new MessageEvent(sourceMessage.id, messageEventQueueMap, async () => {
      await handleMessageUpdate(sourceMessage, helpers);
    }),
  );
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

// Guild updates
client.on(Events.GuildUpdate, (oldGuild, newGuild) => {
  // Check if guild has any portal connections
  const portalConnections = helpers.getGuildPortalConnections(newGuild.id);
  if (!portalConnections) return;
  // Update portal connections
  portalConnections.forEach((portalConnection) => {
    helpers.updatePortalConnection(portalConnection.channelId, {
      guildName: newGuild.name,
    });
  });
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
      portalSetups,
    );
  } catch (err) {
    // Probably timed out
    console.log("Error in interaction");
    console.error(err);
  }
});

client.login(token);
