/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '../activity'
import { Entity } from './entity'

/**
 * Supported icon names for client citations. These icons are displayed in Teams to help users
 * identify the type of content being referenced in AI-generated responses.
 *
 * The set of allowed values is defined by the
 * [Add citations](https://learn.microsoft.com/microsoftteams/platform/bots/how-to/bot-messages-ai-generated-content?tabs=desktop%2Cjs%2Cbotmessage#add-citations)
 * section of the Microsoft Teams documentation (property `citation.appearance.image.name`).
 *
 * `ClientCitationIconName` is both a value (a frozen object with named members, e.g.
 * `ClientCitationIconName.MicrosoftWord`) and a type alias (the string-literal union of all
 * supported icon names). Either form may be assigned to `citation.appearance.image.name`.
 *
 * @example
 * ```typescript
 * const citation: ClientCitation = {
 *   '@type': 'Claim',
 *   position: 1,
 *   appearance: {
 *     '@type': 'DigitalDocument',
 *     name: 'Quarterly report',
 *     abstract: 'Q1 results',
 *     image: { '@type': 'ImageObject', name: ClientCitationIconName.MicrosoftWord }
 *   }
 * }
 * ```
 */
export const ClientCitationIconName = {
  /** Microsoft Word document icon */
  MicrosoftWord: 'Microsoft Word',
  /** Microsoft Excel spreadsheet icon */
  MicrosoftExcel: 'Microsoft Excel',
  /** Microsoft PowerPoint presentation icon */
  MicrosoftPowerPoint: 'Microsoft PowerPoint',
  /** Microsoft OneNote notebook icon */
  MicrosoftOneNote: 'Microsoft OneNote',
  /** Microsoft SharePoint site or document icon */
  MicrosoftSharePoint: 'Microsoft SharePoint',
  /** Microsoft Visio diagram icon */
  MicrosoftVisio: 'Microsoft Visio',
  /** Microsoft Loop component icon */
  MicrosoftLoop: 'Microsoft Loop',
  /** Microsoft Whiteboard icon */
  MicrosoftWhiteboard: 'Microsoft Whiteboard',
  /** Adobe Illustrator vector graphics icon */
  AdobeIllustrator: 'Adobe Illustrator',
  /** Adobe Photoshop image editing icon */
  AdobePhotoshop: 'Adobe Photoshop',
  /** Adobe InDesign layout design icon */
  AdobeInDesign: 'Adobe InDesign',
  /** Adobe Flash multimedia icon */
  AdobeFlash: 'Adobe Flash',
  /** Sketch design tool icon */
  Sketch: 'Sketch',
  /** Source code file icon */
  SourceCode: 'Source Code',
  /** Generic image file icon */
  Image: 'Image',
  /** Animated GIF image icon */
  GIF: 'GIF',
  /** Video file icon */
  Video: 'Video',
  /** Audio/sound file icon */
  Sound: 'Sound',
  /** ZIP archive file icon */
  ZIP: 'ZIP',
  /** Plain text file icon */
  Text: 'Text',
  /** PDF document icon */
  PDF: 'PDF'
} as const

/**
 * String-literal union of all supported {@link ClientCitationIconName} values.
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ClientCitationIconName = typeof ClientCitationIconName[keyof typeof ClientCitationIconName]

/**
 *  Represents a Teams client citation to be included in a message.
 *
 * @remarks
 * [Learn more about Bot messages with AI-generated content](https://learn.microsoft.com/microsoftteams/platform/bots/how-to/bot-messages-ai-generated-content?tabs=before%2Cbotmessage)
 */
export interface ClientCitation {
  /**
   * Required; must be "Claim"
   */
  '@type': 'Claim';

  /**
   * Required. Number and position of the citation.
   */
  position: number;
  /**
   * Optional; if provided, the citation will be displayed in the message.
   */
  appearance: {
    /**
     * Required; Must be 'DigitalDocument'
     */
    '@type': 'DigitalDocument';

    /**
     * Name of the document. (max length 80)
     */
    name: string;

    /**
     * Stringified adaptive card with additional information about the citation.
     * It is rendered within the modal.
     */
    text?: string;

    /**
     * URL of the document. This will make the name of the citation clickable and direct the user to the specified URL.
     */
    url?: string;

    /**
     * Extract of the referenced content. (max length 160)
     */
    abstract: string;

    /**
     * Encoding format of the `citation.appearance.text` field.
     */
    encodingFormat?: 'application/vnd.microsoft.card.adaptive';

    /**
     * Information about the citation’s icon.
     */
    image?: {
      '@type': 'ImageObject';

      /**
       * The image/icon name
       */
      name: ClientCitationIconName;
    };

    /**
     * Optional; set by developer. (max length 3) (max keyword length 28)
     */
    keywords?: string[];

    /**
     * Optional sensitivity content information.
     */
    usageInfo?: SensitivityUsageInfo;
  };
}

/**
 * Sensitivity usage info for content sent to the user.
 *
 * @remarks
 * This is used to provide information about the content to the user. See {@link ClientCitation} for more information.
 */
export interface SensitivityUsageInfo {
  /**
   * Must be "https://schema.org/Message"
   */
  type: 'https://schema.org/Message';

  /**
   * Required; Set to CreativeWork;
   */
  '@type': 'CreativeWork';

  /**
   * Sensitivity description of the content
   */
  description?: string;

  /**
   * Sensitivity title of the content
   */
  name: string;

  /**
   * Optional; ignored in Teams.
   */
  position?: number;

  /**
    * Optional; if provided, the content is considered sensitive and should be handled accordingly.
    */
  pattern?: {
    /**
     * Set to DefinedTerm
     */
    '@type': 'DefinedTerm';

    inDefinedTermSet: string;

    /**
     * Color
     */
    name: string;

    /**
     * e.g. #454545
     */
    termCode: string;
  };
}

export interface AIEntity extends Entity {
  /**
   * Required as 'https://schema.org/Message'
   */
  type: 'https://schema.org/Message';

  /**
   * Required as 'Message
   */
  '@type': 'Message';

  /**
   * Required as 'https://schema.org
   */
  '@context': 'https://schema.org';

  /**
   * Must be left blank. This is for Bot Framework schema.
   */
  '@id': '';

  /**
   * Indicate that the content was generated by AI.
   */
  additionalType: ['AIGeneratedContent'];

  /**
   * Optional; if citations object is included, the  sent activity will include the citations, referenced in the activity text.
   */
  citation?: ClientCitation[];

  /**
   * Optional; if usage_info object is included, the sent activity will include the sensitivity usage information.
   */
  usageInfo?: SensitivityUsageInfo;
}

/**
 * Adds an AI entity to an activity to indicate that the content was generated by AI.
 *
 * @param activity - The activity to which the AI entity will be added. The activity's entities array will be initialized if it doesn't exist.
 * @param citations - Optional array of client citations to include with the AI-generated content.
 *                   Citations provide references to sources used in generating the content and are displayed in Teams.
 * @param usageInfo - Optional sensitivity usage information that provides context about the content's sensitivity level.
 *                   This helps users understand any special handling requirements for the content.
 *
 * @remarks
 * This function enhances the activity with metadata that helps clients (like Microsoft Teams)
 * understand that the content is AI-generated and optionally includes citations and sensitivity information.
 *
 * @example
 * ```typescript
 * import { Activity } from '../activity';
 * import { addAIToActivity, ClientCitation } from './AIEntity';
 *
 * const activity: Activity = {
 *   type: 'message',
 *   text: 'Based on the documents, here are the key findings...'
 * };
 *
 * const citations: ClientCitation[] = [{
 *   '@type': 'Claim',
 *   position: 1,
 *   appearance: {
 *     '@type': 'DigitalDocument',
 *     name: 'Research Report 2024',
 *     abstract: 'Key findings from the annual research report',
 *     url: 'https://example.com/report.pdf',
 *     image: {
 *       '@type': 'ImageObject',
 *       name: 'PDF'
 *     }
 *   }
 * }];
 *
 * // Add AI entity with citations
 * addAIToActivity(activity, citations);
 * ```
 */
export const addAIToActivity = (
  activity: Activity,
  citations?: ClientCitation[],
  usageInfo?: SensitivityUsageInfo
): void => {
  const aiEntity: AIEntity = {
    type: 'https://schema.org/Message',
    '@type': 'Message',
    '@context': 'https://schema.org',
    '@id': '',
    additionalType: ['AIGeneratedContent'],
    citation: citations,
    usageInfo
  }
  activity.entities ??= []
  activity.entities.push(aiEntity)
}
