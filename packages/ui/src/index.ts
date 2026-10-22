/** Shared presentation for Varhyr apps: the card face, card detail, translations and display preferences. */
export * from "./CardPresentation";
export { CardDetail, CardHoverDetail } from "./CardDetail";
export {
  ApplicationPreferences,
  formatNumber,
  localizedAbility,
  localizedCard,
  subtypeLabel,
  t,
  translate,
  useLanguage,
} from "./i18n";
export {
  getPreferences,
  parsePreferences,
  preferencesKey,
  updatePreferences,
  usePreferences,
  type Language,
  type Motion,
  type Preferences,
} from "./preferences";
