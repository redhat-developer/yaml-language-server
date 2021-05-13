/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface FoldingRangesContext {
  /**
   * The maximal number of ranges returned.
   */
  rangeLimit?: number;
  /**
   * Called when the result was cropped.
   */
  onRangeLimitExceeded?: (uri: string) => void;
  /**
   * If set, the client signals that it only supports folding complete lines. If set, client will
   * ignore specified `startCharacter` and `endCharacter` properties in a FoldingRange.
   */
  lineFoldingOnly?: boolean;
}
