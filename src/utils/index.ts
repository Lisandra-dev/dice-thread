import { BaseInteraction, CommandInteraction, Embed, EmbedBuilder, ForumChannel, GuildForumTagData, TextBasedChannel, TextChannel, ThreadChannel, userMention } from "discord.js";
import { TFunction } from "i18next";
import { evaluate } from "mathjs";
import moment from "moment";
import removeAccents from "remove-accents";

import { deleteAfter } from "../commands/base";
import { parseResult,roll } from "../dice";
import { DETECT_DICE_MESSAGE } from "../events/message_create";
import {UserData} from "../interface";
import { ln } from "../localizations";
import { editUserButtons } from "./buttons";
import { registerUser } from "./db";
import { findForumChannel,findThread } from "./find";
import { parseEmbedFields } from "./parse";

export async function rollWithInteraction(interaction: CommandInteraction, dice: string, channel: TextBasedChannel, critical?: {failure?: number, success?: number}) {
	if (!channel || channel.isDMBased() || !channel.isTextBased()) return;
	const ul = ln(interaction.locale);
	const rollWithMessage = dice.match(DETECT_DICE_MESSAGE)?.[3];
	if (rollWithMessage) {
		dice = dice.replace(DETECT_DICE_MESSAGE, "$1 /* $3 */");
	}
	const rollDice = roll(dice);
	if (!rollDice) {
		console.error("no valid dice :", dice);
		await interaction.reply({ content: ul("error.invalidDice.withDice", {dice}), ephemeral: true });
		return;
	}
	const parser = parseResult(rollDice, ul, critical);
	if (channel.name.startsWith("🎲")) {
		await interaction.reply({ content: parser });
		return;
	}
	//sort threads by date by most recent
	const parentChannel = channel instanceof ThreadChannel ? channel.parent : channel;
	const thread = parentChannel instanceof TextChannel ? 
		await findThread(parentChannel, ul("roll.reason")) : 
		await findForumChannel(channel.parent as ForumChannel, ul("roll.reason"), channel as ThreadChannel);
	const msg = `${userMention(interaction.user.id)} ${timestamp()}\n${parser}`;
	const msgToEdit = await thread.send("_ _");
	await msgToEdit.edit(msg);
	const idMessage = `↪ ${msgToEdit.url}`;
	const inter = await interaction.reply({ content: `${parser}\n\n${idMessage}`});
	deleteAfter(inter, 180000);
	return;
	
}


export async function setTagsForRoll(forum: ForumChannel) {
	//check if the tags `🪡 roll logs` exists
	const allTags = forum.availableTags;
	const diceRollTag = allTags.find(tag => tag.name === "Dice Roll" && tag.emoji?.name === "🪡");
	if (diceRollTag) {
		return diceRollTag;
	}
	const availableTags: GuildForumTagData[] = allTags.map(tag => {
		return {
			id: tag.id,
			moderated: tag.moderated,
			name: tag.name,
			emoji: tag.emoji,
		};
	});
	availableTags.push({
		name: "Dice Roll",
		emoji: {id: null, name: "🪡"},
	});
	await forum.setAvailableTags(availableTags);
	return availableTags.find(tag => tag.name === "Dice Roll" && tag.emoji?.name === "🪡") as GuildForumTagData;
}

export function title(str?: string) {
	if (!str) return "";
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function repostInThread(embed: EmbedBuilder[], interaction: BaseInteraction, userTemplate: UserData, userId: string, ul: TFunction<"translation", undefined>, which:{stats?: boolean, dice?: boolean, template?: boolean}) {
	const channel = interaction.channel;
	if (!channel ||!(channel instanceof TextChannel)) return;
	let thread = (await channel.threads.fetch()).threads.find(thread => thread.name === "📝 • [STATS]") as ThreadChannel | undefined;
	if (!thread) {
		thread = await channel.threads.create({
			name: "📝 • [STATS]",
			autoArchiveDuration: 10080,
		});
	}
	userTemplate.userName = userTemplate.userName ? userTemplate.userName.toLowerCase() : undefined;
	const msg = await thread.send({ 
		embeds: embed,
		components: [editUserButtons(ul, which.stats, which.dice)]},);
	const damageName = userTemplate.damage ? Object.keys(userTemplate.damage) : undefined;	
	registerUser(userId, interaction, msg.id, thread, userTemplate.userName, damageName);
}

export function cleanSkillName(dice: string) {
	return removeAccents(dice).toLowerCase().replaceAll("🔪", "").trim();
}

export function cleanStatsName(dice: string) {
	return removeAccents(dice).toLowerCase().replaceAll("✏️", "").trim();
}


export function timestamp() {
	return `• <t:${moment().unix()}:d>-<t:${moment().unix()}:t>`;
}

export function isArrayEqual(array1: string[]|undefined, array2: string[]|undefined) {
	if (!array1 || !array2) return false;
	return array1.length === array2.length && array1.every((value, index) => value === array2[index]);
}


export function replaceFormulaInDice(dice: string) {
	const formula = /(?<formula>\{{2}(.+?)\}{2})/gmi;
	const formulaMatch = formula.exec(dice);
	if (formulaMatch?.groups?.formula) {
		const formula = formulaMatch.groups.formula.replaceAll("{{", "").replaceAll("}}", "");
		try {
			const result = evaluate(formula);
			return cleanedDice(dice.replace(formulaMatch.groups.formula, result.toString()));
		} catch (error) {
			throw new Error(`[error.invalidFormula, common.space]: ${formulaMatch.groups.formula}`);
		}
	}
	return cleanedDice(dice);
}

export function generateStatsDice(originalDice: string, stats?: {[name: string]: number}) {
	let dice = originalDice;
	if (stats && Object.keys(stats).length > 0) {
		//damage field support adding statistic, like : 1d6 + strength
		//check if the value contains a statistic & calculate if it's okay
		//the dice will be converted before roll 
		const allStats = Object.keys(stats);
		for (const stat of allStats) {
			const regex = new RegExp(escapeRegex(removeAccents(stat)), "gi");
			if (dice.match(regex)) {
				const statValue = stats[stat];
				dice = dice.replace(regex, statValue.toString());
			}
		}
	}
	return replaceFormulaInDice(dice);
	
}

export function escapeRegex(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanedDice(dice: string) {
	console.log(dice);
	return dice.replaceAll("+-", "-").replaceAll("--", "+").replaceAll("++", "+");
}



export function filterChoices(choices: string[], focused: string) {
	return choices.filter(choice => removeAccents(choice).toLowerCase().includes(removeAccents(focused).toLowerCase()));

}

export function parseStatsString(statsEmbed: EmbedBuilder) {
	const stats = parseEmbedFields(statsEmbed.toJSON() as Embed);
	const parsedStats: {[name: string]: number} = {};
	for (const [name, value] of Object.entries(stats)) {
		let number = parseInt(value, 10);
		if (isNaN(number)) {
			const stat = value.split("`").filter(x => x.trim().length > 0)[1].replace("=", "").trim();
			number = parseInt(stat, 10);
		}
		parsedStats[name] = number;
	}
	return parsedStats;
}