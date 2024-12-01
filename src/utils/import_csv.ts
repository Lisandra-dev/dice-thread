import type { StatisticalTemplate } from "@dicelette/core";
import type { UserData } from "@interfaces/database";
import { ln } from "@localization/index";
import { logger } from "@logger";
import { InvalidCsvContent, InvalidURL, reply } from "@utils/index";
import * as Djs from "discord.js";
import Papa from "papaparse";

export type CSVRow = {
	user: string;
	charName: string | undefined | null;
	avatar: string | undefined | null;
	isPrivate: boolean | undefined;
	channel: string | undefined;
	dice: string | undefined;
	[key: string]: string | number | undefined | boolean | null;
};

/**
 * Export a function to parse a CSV file and return the data, using PapaParse
 * @param url {string} The URL of the CSV file, or the content of the file as string
 * @param guildTemplate {StatisticalTemplate} The template of the guild
 * @param interaction {Djs.CommandInteraction | undefined} The interaction to reply to, if any (undefined if used in test)
 * @param allowPrivate
 * @param lang
 */
export async function parseCSV(
	url: string,
	guildTemplate: StatisticalTemplate,
	interaction?: Djs.CommandInteraction,
	allowPrivate?: boolean,
	lang: Djs.Locale = Djs.Locale.EnglishGB
) {
	let header = ["user", "charName", "avatar", "channel"];
	if (guildTemplate.statistics) {
		header = header.concat(Object.keys(guildTemplate.statistics));
	}
	if (allowPrivate) header.push("isPrivate");

	const ul = ln(lang);
	header.push("dice");
	header = header.map((key) => key.unidecode());
	//papaparse can't be used in Node, we need first to create a readable stream

	const csvText = url.startsWith("https://") ? await readCSV(url) : url;
	if (!csvText || csvText.length === 0) {
		throw new InvalidCsvContent("url");
	}
	let error: string | undefined = undefined;
	let csvData: CSVRow[] = [];
	Papa.parse(csvText.replaceAll(/\s+;\s*/gi, ";"), {
		header: true,
		dynamicTyping: true,
		skipEmptyLines: true,
		//in case the file was wrongly parsed, we need to trim the space before and after the key

		async complete(results) {
			if (!results.data) {
				console.error("Error while parsing CSV", results.errors);
				error = "Error while parsing CSV";
				return;
			}
			//throw error if missing header (it shouldn't not throw if a header is added)
			const dataHeader = results.meta.fields?.map((key) => key.unidecode());
			if (!dataHeader) {
				console.error("Error while parsing CSV, missing header");
				if (interaction)
					await reply(interaction, { content: ul("import.errors.missing_header") });
				error = "Missing header";
				return;
			}
			//throw error only if missing values for the header
			const missingHeader = header
				.filter((key) => !dataHeader.includes(key))
				.filter((key) => key !== "dice" && key !== "avatar" && key !== "channel");
			if (missingHeader.length > 0) {
				console.error("Error while parsing CSV, missing header values", missingHeader);
				if (interaction)
					await reply(interaction, {
						content: ul("import.errors.headers", { name: missingHeader.join("\n- ") }),
					});
				error = "Missing header values";
				return;
			}
			csvData = results.data as CSVRow[];
		},
	});
	if (error) {
		throw new Error(error);
	}
	if (csvData.length === 0) {
		throw new InvalidCsvContent("url");
	}
	return await step(csvData, guildTemplate, interaction, allowPrivate, lang);
}

/**
 * Read the distant CSV file
 * @param url {string} The URL of the CSV file
 * @returns {Promise<string>}
 */
async function readCSV(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new InvalidURL(url);
	}
	return response.text();
}

/**
 * Parse the csv file and return the data in the correct format
 * @param csv {CSVRow[]} The data parsed from the CSV file
 * @param guildTemplate {StatisticalTemplate} The template of the guild
 * @param interaction {Djs.CommandInteraction | undefined} The interaction to reply to, if any (undefined if used in test)
 * @param allowPrivate
 * @param lang
 */
async function step(
	csv: CSVRow[],
	guildTemplate: StatisticalTemplate,
	interaction?: Djs.CommandInteraction,
	allowPrivate?: boolean,
	lang: Djs.Locale = Djs.Locale.EnglishGB
) {
	const members: {
		[id: string]: UserData[];
	} = {};
	const ul = ln(lang);
	const errors: string[] = [];
	//get the user id from the guild
	for (const data of csv) {
		const user = data.user.toString().replaceAll("'", "").trim();
		const channel = data.channel ? data.channel.replaceAll("'", "").trim() : undefined;
		const charName = data.charName;

		//get user from the guild
		let guildMember: undefined | Djs.GuildMember;
		let userID: string | undefined = user;

		//get the user from the guild
		if (interaction) {
			const allMembers = await interaction?.guild?.members.fetch();
			if (!allMembers) {
				const msg = ul("import.errors.no_user");
				errors.push(msg);
				continue;
			}
			guildMember = allMembers.find(
				(member) =>
					member.user.id === user ||
					member.user.username === user ||
					member.user.tag === user
			);
			if (!guildMember || !guildMember.user) {
				const msg = ul("import.errors.user_not_found", { user });
				await reply(interaction, { content: msg });
				errors.push(msg);
				continue;
			}
			userID = guildMember.id;
		}
		const isPrivate = data.isPrivate;

		if (!members[userID]) members[userID] = [];
		if (guildTemplate.charName && !charName) {
			if (interaction) {
				const msg = ul("import.errors.missing_charName", {
					user: Djs.userMention(userID),
				});
				await reply(interaction, { content: msg });
				errors.push(msg);
			}
			console.warn(`Missing character name for ${user}`);
			continue;
		}
		//prevent duplicate with verify the charName
		if (
			members[userID].find((char) => {
				if (char.userName && charName)
					return char.userName.unidecode() === charName.unidecode();
				return !char.userName && !charName;
			})
		) {
			if (interaction) {
				const msg = ul("import.errors.duplicate_charName", {
					user: Djs.userMention(userID),
					charName: charName ?? ul("common.default"),
				});
				await reply(interaction, { content: msg });
				errors.push(msg);
			}
			console.warn(`Duplicate character name for ${user}`);
			continue;
		}
		const stats: { [name: string]: number } = {};
		//get the stats
		if (guildTemplate.statistics) {
			const emptyStats = Object.keys(guildTemplate.statistics).filter(
				(key) => !data[key]
			);
			if (emptyStats.length > 0) {
				if (interaction) {
					const msg = ul("import.errors.missing_stats", {
						user: Djs.userMention(userID),
						stats: emptyStats.join("\n- "),
					});
					await reply(interaction, { content: msg });
					errors.push(msg);
				}
				console.warn(`Missing stats for ${user}. Missing: ${emptyStats.join("\n- ")}`);
				continue;
			}

			for (const key of Object.keys(guildTemplate.statistics)) {
				stats[key] = data[key] as number;
			}
		}
		const dice: { [name: string]: string } | undefined = data.dice?.replaceAll("'", "")
			? data.dice.split(/\r?\n/).reduce(
					(acc, line) => {
						const match = line.match(/-\s*([^:]+)\s*:\s*(.+)/);
						if (match) {
							const key = match[1].trim();
							acc[key] = match[2].trim();
						}
						return acc;
					},
					{} as { [name: string]: string }
				)
			: undefined;
		const newChar: UserData = {
			userName: charName,
			stats,
			template: {
				diceType: guildTemplate.diceType,
				critical: guildTemplate.critical,
			},
			private: allowPrivate ? isPrivate : undefined,
			damage: dice,
			avatar: data.avatar ?? undefined,
			channel,
		};
		logger.trace("Adding character", newChar);
		// biome-ignore lint/performance/noDelete: I need this because the file will be rewritten and the undefined value can broke object
		if (!newChar.private) delete newChar.private;
		// biome-ignore lint/performance/noDelete: I need this because the file will be rewritten and the undefined value can broke object
		if (!newChar.avatar) delete newChar.avatar;
		members[userID].push(newChar);
	}
	return { members, errors };
}