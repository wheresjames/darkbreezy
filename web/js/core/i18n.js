// Interface text (DARKBREEZY.md §4: English at launch, strings in one
// place so translations can be added). Text is looked up by its English
// form, gettext style: t('Feels like {temp}', { temp }) works untranslated,
// and a translation is a table of English → other language.

const TABLES = {};
let table = null;

/** Add translations for [lang] ({ 'Feels like': '…' }). */
export function addTranslations(lang, entries) {
  TABLES[lang] = { ...(TABLES[lang] || {}), ...entries };
}

/** Use [lang]'s table when there is one (English otherwise). */
export function setLanguage(lang) {
  table = TABLES[String(lang || '').slice(0, 2)] || null;
}

/** [text] in the current language, with {name} replaced from [vars]. */
export function t(text, vars) {
  const s = table?.[text] ?? text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
