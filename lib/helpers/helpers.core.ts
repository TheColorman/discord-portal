import { Interaction } from "discord.js";
import { emojiSuggestions, nameSuggestions } from "../const";

export default class BaseHelpersCore {
    /**
     * Send an ephemeral message to the user that the interaction has expired.
     * @param interaction Discord interaction
     */
    public sendExpired(interaction: Interaction) {
        if (interaction.isRepliable())
            interaction.reply({ content: "Expired.", ephemeral: true });
    };

    /**
     * Generate a random name suggestion for a portal.
     * @returns A random name suggestion
     */
    public generateName(): string {
        return `${
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
    }

    /**
     * Generate a random emoji suggestion for a portal.
     * @returns A random emoji suggestion for a portal.
     */
    public generateEmoji(): string {
        return emojiSuggestions[Math.floor(Math.random() * emojiSuggestions.length)];
    }
}