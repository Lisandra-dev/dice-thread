import type { Critical, CustomCritical } from "@dicelette/core";
import { parseCustomCritical } from "./roll";

export function parseEmbedToCritical(embed: { [name: string]: string }): {
	[name: string]: CustomCritical;
} {
	const customCritical: { [name: string]: CustomCritical } = {};
	//remove the 3 first field from the embed
	embed["roll.critical.success"] = "";
	embed["roll.critical.failure"] = "";
	embed["common.dice"] = "";
	for (const [name, value] of Object.entries(embed)) {
		if (!value.length === 0) continue;
		const custom = parseCustomCritical(value);
		if (custom) {
			Object.assign(customCritical, custom);
		}
	}
	return customCritical;
}

export function parseEmbedToDamage(embed?: { [name: string]: string }) {
	let templateDamage: { [name: string]: string } | undefined = undefined;
	if (embed) {
		templateDamage = {};
		for (const damage of embed) {
			templateDamage[damage.name.unidecode()] = damage.value.removeBacktick();
		}
	}
	return templateDamage;
}

export function parseEmbedToStats(
	embed?: { [name: string]: string },
	integrateCombinaison = true
) {
	let stats: { [name: string]: number } | undefined = undefined;
	if (embed) {
		stats = {};
		for (const stat of embed) {
			const value = Number.parseInt(stat.value.removeBacktick(), 10);
			if (Number.isNaN(value)) {
				//it's a combinaison
				//remove the `x` = text;
				const combinaison = stat.value.split("=")[1].trim();
				if (integrateCombinaison)
					stats[stat.name.unidecode()] = Number.parseInt(combinaison, 10);
			} else stats[stat.name.unidecode()] = value;
		}
	}
	return stats;
}

export function parseTemplateField(embed: { [name: string]: string }): {
	diceType?: string;
	critical?: Critical;
	customCritical?: {
		[name: string]: CustomCritical;
	};
} {
	return {
		diceType: embed?.["common.dice"] || undefined,
		critical: {
			success: Number.parseInt(embed?.["roll.critical.success"], 10),
			failure: Number.parseInt(embed?.["roll.critical.failure"], 10),
		},
		customCritical: parseEmbedToCritical(embed),
	};
}
