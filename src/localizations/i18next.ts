import i18next from "i18next";

import EnglishUS from "./locales/en.json";
import French from "./locales/fr.json";

export const TRANSLATIONS = {
	French,
	EnglishUS,
};


export const resources = {
	en: {
		translation: EnglishUS,
	},
	fr: {
		translation: French,
	},
};

i18next.init({
	lng: "en",
	fallbackLng: "en",
	returnNull: false,
	resources,
});

export default i18next;