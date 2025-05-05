import { Culture } from '@microsoft/recognizers-text-suite'

export interface PromptCultureModel {
  /**
     * Culture Model's Locale.
     *
     * @example
     * "en-US"
     */
  locale: string;
  /**
     * Culture Model's InlineSeparator.
     *
     * @example
     * ", "
     */
  separator: string;
  /**
     * Culture Model's InlineOr.
     *
     * @example
     * " or "
     */
  inlineOr: string;
  /**
     * Culture Model's InlineOrMore.
     *
     * @example
     * ", or "
     */
  inlineOrMore: string;
  /**
     * Equivalent of "Yes" in Culture Model's Language.
     *
     * @example
     * "Yes"
     */
  yesInLanguage: string;
  /**
     * Equivalent of "No" in Culture Model's Language.
     *
     * @example
     * "No"
     */
  noInLanguage: string;
}

/**
 * Class container for currently-supported Culture Models in Confirm and Choice Prompt.
 */
export class PromptCultureModels {
  /**
   * Represents the Chinese culture model with locale and language-specific settings.
   */
  static Chinese: PromptCultureModel = {
    locale: Culture.Chinese,
    separator: ', ',
    inlineOr: ' 要么 ',
    inlineOrMore: '， 要么 ',
    yesInLanguage: '是的',
    noInLanguage: '不',
  }

  /**
   * Represents the Dutch culture model with locale and language-specific settings.
   */
  static Dutch: PromptCultureModel = {
    locale: Culture.Dutch,
    separator: ', ',
    inlineOr: ' of ',
    inlineOrMore: ', of ',
    yesInLanguage: 'Ja',
    noInLanguage: 'Nee',
  }

  /**
   * Represents the English culture model with locale and language-specific settings.
   */
  static English: PromptCultureModel = {
    locale: Culture.English,
    separator: ', ',
    inlineOr: ' or ',
    inlineOrMore: ', or ',
    yesInLanguage: 'Yes',
    noInLanguage: 'No',
  }

  /**
   * Represents the French culture model with locale and language-specific settings.
   */
  static French: PromptCultureModel = {
    locale: Culture.French,
    separator: ', ',
    inlineOr: ' ou ',
    inlineOrMore: ', ou ',
    yesInLanguage: 'Oui',
    noInLanguage: 'Non',
  }

  /**
   * Represents the German culture model with locale and language-specific settings.
   */
  static German: PromptCultureModel = {
    locale: Culture.German,
    separator: ', ',
    inlineOr: ' oder ',
    inlineOrMore: ', oder ',
    yesInLanguage: 'Ja',
    noInLanguage: 'Nein',
  }

  /**
   * Represents the Italian culture model with locale and language-specific settings.
   */
  static Italian: PromptCultureModel = {
    locale: Culture.Italian,
    separator: ', ',
    inlineOr: ' o ',
    inlineOrMore: ' o ',
    yesInLanguage: 'Si',
    noInLanguage: 'No',
  }

  /**
   * Represents the Japanese culture model with locale and language-specific settings.
   */
  static Japanese: PromptCultureModel = {
    locale: Culture.Japanese,
    separator: '、 ',
    inlineOr: ' または ',
    inlineOrMore: '、 または ',
    yesInLanguage: 'はい',
    noInLanguage: 'いいえ',
  }

  /**
   * Represents the Portuguese culture model with locale and language-specific settings.
   */
  static Portuguese: PromptCultureModel = {
    locale: Culture.Portuguese,
    separator: ', ',
    inlineOr: ' ou ',
    inlineOrMore: ', ou ',
    yesInLanguage: 'Sim',
    noInLanguage: 'Não',
  }

  /**
   * Represents the Spanish culture model with locale and language-specific settings.
   */
  static Spanish: PromptCultureModel = {
    locale: Culture.Spanish,
    separator: ', ',
    inlineOr: ' o ',
    inlineOrMore: ', o ',
    yesInLanguage: 'Sí',
    noInLanguage: 'No',
  }

  /**
     * Retrieves a list of supported culture codes.
     *
     * @returns An array of supported locale strings.
     * @private
     */
  private static getSupportedCultureCodes (): string[] {
    return this.getSupportedCultures().map((c): string => c.locale)
  }

  /**
     * Normalizes a given locale string to the nearest supported language.
     *
     * @param cultureCode The locale string to normalize (e.g., "en-US").
     * @returns The normalized locale string.
     * @remarks This is mostly a copy/paste from https://github.com/microsoft/Recognizers-Text/blob/master/JavaScript/packages/recognizers-text/src/culture.ts#L39
     *          This doesn't directly use Recognizers-Text's MapToNearestLanguage because if they add language support before we do, it will break our prompts.
     */
  static mapToNearestLanguage (cultureCode: string): string {
    if (cultureCode) {
      cultureCode = cultureCode.toLowerCase()
      const supportedCultureCodes = this.getSupportedCultureCodes()

      if (supportedCultureCodes.indexOf(cultureCode) < 0) {
        const culturePrefix = cultureCode.split('-')[0].trim()

        supportedCultureCodes.forEach(function (supportedCultureCode): void {
          if (supportedCultureCode.startsWith(culturePrefix)) {
            cultureCode = supportedCultureCode
          }
        })
      }
    }

    return cultureCode
  }

  /**
     * Retrieves a list of supported culture models.
     *
     * @returns An array of `PromptCultureModel` objects representing supported cultures.
     */
  static getSupportedCultures = (): PromptCultureModel[] => [
    PromptCultureModels.Chinese,
    PromptCultureModels.Dutch,
    PromptCultureModels.English,
    PromptCultureModels.French,
    PromptCultureModels.German,
    PromptCultureModels.Italian,
    PromptCultureModels.Japanese,
    PromptCultureModels.Portuguese,
    PromptCultureModels.Spanish,
  ]
}
