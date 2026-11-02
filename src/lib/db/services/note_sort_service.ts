import type { Note } from '../models';

/**
 * Service providing natural, playlist-aware sequencing and sorting for study notes.
 */
export class NoteSortService {
  private static readonly _REGEX_LECTURE_NUM =
    /(?:lecture|lec|session|part|episode|chapter|class|#)\s*([0-9]+)/i;
  private static readonly _REGEX_LEADING_NUM = /^([0-9]+)[._\- ]/;
  private static readonly _RADIX_DECIMAL = 10;
  private static readonly _LOCALE_OPTIONS: Intl.CollatorOptions = {
    numeric: true,
    sensitivity: 'base',
  };

  /**
   * Sorts an array of notes in playlist and natural lecture sequence order.
   */
  public static sortNotes(notes: Note[]): Note[] {
    return [...notes].sort(NoteSortService.compareNotes);
  }

  /**
   * Comparison function ordering notes by explicit order, lecture sequence number, or natural title.
   */
  public static compareNotes(a: Note, b: Note): number {
    const orderDiff = NoteSortService._compareExplicitOrder(a.order, b.order);
    if (orderDiff !== null) {
      return orderDiff;
    }

    const numA = NoteSortService._extractSequenceNumber(a.title);
    const numB = NoteSortService._extractSequenceNumber(b.title);
    const numDiff = NoteSortService._compareSequenceNumbers(numA, numB);
    if (numDiff !== null) {
      return numDiff;
    }

    const titleCmp = a.title.localeCompare(b.title, undefined, NoteSortService._LOCALE_OPTIONS);
    if (titleCmp !== 0) {
      return titleCmp;
    }
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  }

  private static _compareExplicitOrder(
    orderA: number | undefined,
    orderB: number | undefined
  ): number | null {
    if (orderA !== undefined && orderB !== undefined && orderA !== orderB) {
      return orderA - orderB;
    }
    if (orderA !== undefined && orderB === undefined) {
      return -1;
    }
    if (orderA === undefined && orderB !== undefined) {
      return 1;
    }
    return null;
  }

  private static _compareSequenceNumbers(
    numA: number | null,
    numB: number | null
  ): number | null {
    if (numA !== null && numB !== null && numA !== numB) {
      return numA - numB;
    }
    if (numA !== null && numB === null) {
      return -1;
    }
    if (numA === null && numB !== null) {
      return 1;
    }
    return null;
  }

  private static _extractSequenceNumber(title: string): number | null {
    if (!title) {
      return null;
    }
    const lectureMatch = NoteSortService._REGEX_LECTURE_NUM.exec(title);
    if (lectureMatch?.[1]) {
      return parseInt(lectureMatch[1], NoteSortService._RADIX_DECIMAL);
    }
    const leadingMatch = NoteSortService._REGEX_LEADING_NUM.exec(title);
    if (leadingMatch?.[1]) {
      return parseInt(leadingMatch[1], NoteSortService._RADIX_DECIMAL);
    }
    return null;
  }
}

