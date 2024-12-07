import type { StatisticalTemplate } from "@dicelette/core";
import { findln } from "@dicelette/localization";
import type { Translation } from "@dicelette/types";
import { NoEmbed } from "@dicelette/utils";
import * as Djs from "discord.js";
export function ensureEmbed(message?: Djs.Message) {
	const oldEmbeds = message?.embeds[0];
	if (!oldEmbeds || !oldEmbeds?.fields) throw new NoEmbed();
	return oldEmbeds;
}

export const embedError = (error: string, ul: Translation, cause?: string) => {
	const embed = new Djs.EmbedBuilder()
		.setDescription(error)
		.setColor("Red")
		.setAuthor({ name: ul("common.error"), iconURL: "https://i.imgur.com/2ulUJCc.png" })
		.setTimestamp();
	if (cause) embed.setFooter({ text: cause });
	return embed;
};

/**
 * Create a list of embeds
 */
export function createEmbedsList(
	userDataEmbed: Djs.EmbedBuilder,
	statsEmbed?: Djs.EmbedBuilder,
	diceEmbed?: Djs.EmbedBuilder,
	templateEmbed?: Djs.EmbedBuilder
) {
	const allEmbeds = [userDataEmbed];
	if (statsEmbed) allEmbeds.push(statsEmbed);
	if (diceEmbed) allEmbeds.push(diceEmbed);
	if (templateEmbed) allEmbeds.push(templateEmbed);
	return allEmbeds;
}

/**
 * Get the embeds from the message and replace based on the embed to replace
 * Also it returns if the embeds exists or not (useful for the buttons)
 */
export function getEmbedsList(
	ul: Translation,
	embedToReplace: {
		which: "user" | "stats" | "damage" | "template";
		embed: Djs.EmbedBuilder;
	},
	message?: Djs.Message
) {
	const userDataEmbed =
		embedToReplace.which === "user"
			? embedToReplace.embed
			: getEmbeds(ul, message, "user");
	if (!userDataEmbed) throw new NoEmbed();
	const statsEmbed =
		embedToReplace.which === "stats"
			? embedToReplace.embed
			: getEmbeds(ul, message, "stats");
	const diceEmbed =
		embedToReplace.which === "damage"
			? embedToReplace.embed
			: getEmbeds(ul, message, "damage");
	const templateEmbed =
		embedToReplace.which === "template"
			? embedToReplace.embed
			: getEmbeds(ul, message, "template");
	return {
		list: createEmbedsList(userDataEmbed, statsEmbed, diceEmbed, templateEmbed),
		exists: {
			user: !!userDataEmbed,
			stats: !!statsEmbed,
			damage: !!diceEmbed,
			template: !!templateEmbed,
		},
	};
}

/**
 * Get the embeds from the message and recreate it as EmbedBuilder
 */
export function getEmbeds(
	ul: Translation,
	message?: Djs.Message,
	which?: "user" | "stats" | "damage" | "template"
) {
	const allEmbeds = message?.embeds;
	if (!allEmbeds) throw new Error(ul("error.noEmbed"));
	for (const embed of allEmbeds) {
		const embedJSON = embed.toJSON();
		const titleKey = findln(embed.title ?? "");
		const userKeys = ["embed.user", "embed.add", "embed.old"];
		const statsKeys = ["common.statistic", "common.statistics"];
		if (userKeys.includes(titleKey) && which === "user")
			return new Djs.EmbedBuilder(embedJSON);
		if (statsKeys.includes(titleKey) && which === "stats")
			return new Djs.EmbedBuilder(embedJSON);
		if (titleKey === "embed.dice" && which === "damage")
			return new Djs.EmbedBuilder(embedJSON);
		if (titleKey === "embed.template" && which === "template")
			return new Djs.EmbedBuilder(embedJSON);
	}
}

/**
 * Parse the embed fields and remove the backtick if any
 */
export function parseEmbedFields(embed: Djs.Embed): { [name: string]: string } {
	const fields = embed.fields;
	if (!fields) return {};
	const parsedFields: { [name: string]: string } = {};
	for (const field of fields) {
		parsedFields[findln(field.name.removeBacktick())] = findln(
			field.value.removeBacktick()
		);
	}
	return parsedFields;
}

/**
 * Create the userEmbed and embedding the avatar user in the thumbnail
 * @param ul {Translation}
 * @param thumbnail {string} The avatar of the user in the server (use server profile first, after global avatar)
 * @param user
 * @param charName
 */
export function createUserEmbed(
	ul: Translation,
	thumbnail: string | null,
	user: string,
	charName?: string
) {
	const userEmbed = new Djs.EmbedBuilder()
		.setTitle(ul("embed.user"))
		.setColor("Random")
		.setThumbnail(thumbnail)
		.addFields({
			name: ul("common.user").capitalize(),
			value: `<@${user}>`,
			inline: true,
		});
	if (charName)
		userEmbed.addFields({
			name: ul("common.character").capitalize(),
			value: charName.capitalize(),
			inline: true,
		});
	else
		userEmbed.addFields({
			name: ul("common.character").capitalize(),
			value: ul("common.noSet").capitalize(),
			inline: true,
		});
	return userEmbed;
}

/**
 * Create the statistic embed
 * @param ul {Translation}
 */
export function createStatsEmbed(ul: Translation) {
	return new Djs.EmbedBuilder()
		.setTitle(ul("common.statistics").capitalize())
		.setColor("Aqua");
}

/**
 * Create the template embed for user
 * @param ul {Translation}
 */
export function createTemplateEmbed(ul: Translation) {
	return new Djs.EmbedBuilder().setTitle(ul("embed.template")).setColor("DarkGrey");
}

/**
 * Create the dice skill embed
 * @param ul {Translation}
 */
export function createDiceEmbed(ul: Translation) {
	return new Djs.EmbedBuilder().setTitle(ul("embed.dice")).setColor("Green");
}

/**
 * Get the statistiques fields from the modals and verify if all value are correct and if the total is not exceeded
 */
export function getStatistiqueFields(
	interaction: Djs.ModalSubmitInteraction,
	templateData: StatisticalTemplate,
	ul: Translation
) {
	const combinaisonFields: { [name: string]: string } = {};
	const stats: { [name: string]: number } = {};
	let total = templateData.total;
	if (!templateData.statistics) return { combinaisonFields, stats };
	for (const [key, value] of Object.entries(templateData.statistics)) {
		const name = key.standardize();
		if (!interaction.fields.fields.has(name) && !value.combinaison) continue;
		if (value.combinaison) {
			combinaisonFields[key] = value.combinaison;
			continue;
		}
		const statValue = interaction.fields.getTextInputValue(name);
		if (!statValue) continue;
		const num = Number.parseInt(statValue, 10);
		if (value.min && num < value.min)
			throw new Error(ul("error.mustBeGreater", { value: name, min: value.min }));
		if (value.max && num > value.max)
			throw new Error(ul("error.mustBeLower", { value: name, max: value.max }));
		if (total) {
			total -= num;
			if (total < 0) {
				const exceeded = total * -1;
				throw new Error(ul("error.totalExceededBy", { value: name, max: exceeded }));
			}
			stats[key] = num;
		} else stats[key] = num;
	}
	return { combinaisonFields, stats };
}

/**
 * Remove the embeds from the list
 */
export function removeEmbedsFromList(
	embeds: Djs.EmbedBuilder[],
	which: "user" | "stats" | "damage" | "template"
) {
	return embeds.filter((embed) => {
		const embedTitle = embed.toJSON().title;
		if (!embedTitle) return false;
		const title = findln(embedTitle);
		if (which === "user")
			return title !== "embed.user" && title !== "embed.add" && title !== "embed.old";
		if (which === "stats")
			return title !== "common.statistic" && title !== "common.statistics";
		if (which === "damage") return title !== "embed.dice";
		if (which === "template") return title !== "embed.template";
	});
}