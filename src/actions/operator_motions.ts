import * as vscode from 'vscode';

import { createOperatorMotionExactKeys, createOperatorMotionRegex } from '../parse_keys';
import { OperatorMotion } from '../parse_keys_types';
import { searchForward, searchBackward, searchBackwardBracket, searchForwardBracket } from '../search_utils';
import * as positionUtils from '../position_utils';
import { wordRanges, whitespaceWordRanges } from '../word_utils';
import { paragraphForward, paragraphBackward } from '../paragraph_utils';
import { VimRange } from '../vim_range_types';
import { VimState } from '../vim_state_types';
import { quoteRanges, findQuoteRange } from '../quote_utils';
import { indentLevelRange } from '../indent_utils';
import { SimpleRange } from '../simple_range_types';
import { getTags } from '../tag_utils';
import { arrayFindLast } from '../array_utils';

export const operatorMotions: OperatorMotion[] = [
    createOperatorMotionExactKeys(['l'], (vimState, document, position) => {
        const right = positionUtils.right(document, position);

        if (right.isEqual(position)) {
            return undefined;
        } else {
            return { range: new vscode.Range(position, right), linewise: false };
        }
    }),
    createOperatorMotionExactKeys(['h'], (vimState, document, position) => {
        const left = positionUtils.left(position);

        if (left.isEqual(position)) {
            return undefined;
        } else {
            return { range: new vscode.Range(position, left), linewise: false };
        }
    }),
    createOperatorMotionExactKeys(['k'], (vimState, document, position) => {
        if (position.line === 0) {
            return {
                range: new vscode.Range(
                    new vscode.Position(0, 0),
                    positionUtils.lineEnd(document, position),
                ),
                linewise: true,
            };
        } else {
            return {
                range: new vscode.Range(
                    new vscode.Position(position.line - 1, 0),
                    positionUtils.lineEnd(document, position),
                ),
                linewise: true,
            };
        }
    }),

    createOperatorMotionExactKeys(['j'], (vimState, document, position) => {
        if (position.line === document.lineCount - 1) {
            return {
                range: new vscode.Range(
                    new vscode.Position(position.line, 0),
                    positionUtils.lineEnd(document, position),
                ),
                linewise: true,
            };
        } else {
            return {
                range: new vscode.Range(
                    new vscode.Position(position.line, 0),
                    positionUtils.lineEnd(document, position.with({ line: position.line + 1 })),
                ),
                linewise: true,
            };
        }
    }),

    createOperatorMotionExactKeys(['w'], createWordForwardHandler(wordRanges)),
    createOperatorMotionExactKeys(['W'], createWordForwardHandler(whitespaceWordRanges)),

    createOperatorMotionExactKeys(['b'], createWordBackwardHandler(wordRanges)),
    createOperatorMotionExactKeys(['B'], createWordBackwardHandler(whitespaceWordRanges)),

    createOperatorMotionExactKeys(['e'], createWordEndHandler(wordRanges)),
    createOperatorMotionExactKeys(['E'], createWordEndHandler(whitespaceWordRanges)),

    createOperatorMotionRegex(/^f(..)$/, /^(f|f.)$/, (vimState, document, position, match) => {
        const fromPosition = position.with({ character: position.character + 1 });
        const result = searchForward(document, match[1], fromPosition);

        if (result) {
            return {
                range: new vscode.Range(position, result),
                linewise: false,
            };
        } else {
            return undefined;
        }
    }),

    createOperatorMotionRegex(/^F(..)$/, /^(F|F.)$/, (vimState, document, position, match) => {
        const fromPosition = position.with({ character: position.character - 1 });
        const result = searchBackward(document, match[1], fromPosition);

        if (result) {
            return {
                range: new vscode.Range(position, result),
                linewise: false,
            };
        } else {
            return undefined;
        }
    }),

    createOperatorMotionRegex(/^t(.)$/, /^t$/, (vimState, document, position, match) => {
        const lineText = document.lineAt(position.line).text;
        const result = lineText.indexOf(match[1], position.character + 1);

        if (result >= 0) {
            return {
                range: new vscode.Range(position, position.with({ character: result })),
                linewise: false,
            };
        } else {
            return undefined;
        }
    }),

    createOperatorMotionRegex(/^T(.)$/, /^T$/, (vimState, document, position, match) => {
        const lineText = document.lineAt(position.line).text;
        const result = lineText.lastIndexOf(match[1], position.character - 1);

        if (result >= 0) {
            const newPosition = positionUtils.right(document, position.with({ character: result }));
            return {
                range: new vscode.Range(newPosition, position),
                linewise: false,
            };
        } else {
            return undefined;
        }
    }),

    createOperatorMotionExactKeys(['g', 'g'], (vimState, document, position) => {
        const lineLength = document.lineAt(position.line).text.length;

        return {
            range: new vscode.Range(
                new vscode.Position(0, 0),
                position.with({ character: lineLength }),
            ),
            linewise: true,
        };
    }),

    createOperatorMotionExactKeys(['G'], (vimState, document, position) => {
        const lineLength = document.lineAt(document.lineCount - 1).text.length;

        return {
            range: new vscode.Range(
                position.with({ character: 0 }),
                new vscode.Position(document.lineCount - 1, lineLength),
            ),
            linewise: true,
        };
    }),

    // TODO: return undefined?
    createOperatorMotionExactKeys(['}'], (vimState, document, position) => {
        return {
            range: new vscode.Range(
                position.with({ character: 0 }),
                new vscode.Position(paragraphForward(document, position.line), 0),
            ),
            linewise: true,
        };
    }),

    // TODO: return undefined?
    createOperatorMotionExactKeys(['{'], (vimState, document, position) => {
        return {
            range: new vscode.Range(
                new vscode.Position(paragraphBackward(document, position.line), 0),
                position.with({ character: 0 }),
            ),
            linewise: true,
        };
    }),

    createOperatorMotionExactKeys(['i', "'"], createInnerQuoteHandler("'")),
    createOperatorMotionExactKeys(['a', "'"], createOuterQuoteHandler("'")),

    createOperatorMotionExactKeys(['i', '"'], createInnerQuoteHandler('"')),
    createOperatorMotionExactKeys(['a', '"'], createOuterQuoteHandler('"')),

    createOperatorMotionExactKeys(['i', '('], createInnerBracketHandler('(', ')')),
    createOperatorMotionExactKeys(['a', '('], createOuterBracketHandler('(', ')')),

    createOperatorMotionExactKeys(['i', '{'], createInnerBracketHandler('{', '}')),
    createOperatorMotionExactKeys(['a', '{'], createOuterBracketHandler('{', '}')),

    createOperatorMotionExactKeys(['i', '['], createInnerBracketHandler('[', ']')),
    createOperatorMotionExactKeys(['a', '['], createOuterBracketHandler('[', ']')),

    createOperatorMotionExactKeys(['i', '<'], createInnerBracketHandler('<', '>')),
    createOperatorMotionExactKeys(['a', '<'], createOuterBracketHandler('<', '>')),

    createOperatorMotionExactKeys(['i', 't'], (vimState, document, position) => {
        const tags = getTags(document);

        const closestTag = arrayFindLast(tags, tag => {
            if (tag.closing) {
                return (
                    position.isAfterOrEqual(tag.opening.start) &&
                    position.isBeforeOrEqual(tag.closing.end)
                );
            } else {
                // Self-closing tags have no inside
                return false;
            }
        });

        if (closestTag) {
            if (closestTag.closing) {
                return {
                    range: new vscode.Range(
                        closestTag.opening.end.with({ character: closestTag.opening.end.character + 1 }),
                        closestTag.closing.start,
                    ),
                    linewise: false,
                };
            } else {
                throw new Error('We should have already filtered out self-closing tags above');
            }
        } else {
            return undefined;
        }
    }),

    createOperatorMotionExactKeys(['a', 't'], (vimState, document, position) => {
        const tags = getTags(document);

        const closestTag = arrayFindLast(tags, tag => {
            const afterStart = position.isAfterOrEqual(tag.opening.start);

            if (tag.closing) {
                return afterStart && position.isBeforeOrEqual(tag.closing.end);
            } else {
                return afterStart && position.isBeforeOrEqual(tag.opening.end);
            }
        });

        if (closestTag) {
            if (closestTag.closing) {
                return {
                    range: new vscode.Range(
                        closestTag.opening.start,
                        closestTag.closing.end.with({ character: closestTag.closing.end.character + 1 }),
                    ),
                    linewise: false,
                };
            } else {
                return {
                    range: new vscode.Range(
                        closestTag.opening.start,
                        closestTag.opening.end.with({ character: closestTag.opening.end.character + 1 }),
                    ),
                    linewise: false,
                };
            }
        } else {
            return undefined;
        }
    }),

    // TODO: return undefined?
    createOperatorMotionExactKeys(['i', 'i'], (vimState, document, position) => {
        const simpleRange = indentLevelRange(document, position.line);

        return {
            range: new vscode.Range(
                new vscode.Position(simpleRange.start, 0),
                new vscode.Position(simpleRange.end, document.lineAt(simpleRange.end).text.length),
            ),
            linewise: true,
        };
    }),
];

function createInnerBracketHandler(
    openingChar: string,
    closingChar: string,
): (vimState: VimState, document: vscode.TextDocument, position: vscode.Position) => VimRange | undefined {
    return (vimState, document, position) => {
        const bracketRange = getBracketRange(document, position, openingChar, closingChar);

        if (bracketRange) {
            return {
                range: new vscode.Range(
                    bracketRange.start.with({ character: bracketRange.start.character + 1 }),
                    bracketRange.end,
                ),
                linewise: false,
            };
        } else {
            return undefined;
        }
    };
}

function createOuterBracketHandler(
    openingChar: string,
    closingChar: string,
): (vimState: VimState, document: vscode.TextDocument, position: vscode.Position) => VimRange | undefined {
    return (vimState, document, position) => {
        const bracketRange = getBracketRange(document, position, openingChar, closingChar);

        if (bracketRange) {
            return {
                range: new vscode.Range(
                    bracketRange.start,
                    bracketRange.end.with({ character: bracketRange.end.character + 1 }),
                ),
                linewise: false,
            };
        } else {
            return undefined;
        }
    };
}

function getBracketRange(
    document: vscode.TextDocument,
    position: vscode.Position,
    openingChar: string,
    closingChar: string,
): vscode.Range | undefined {
    const lineText = document.lineAt(position.line).text;
    const currentChar = lineText[position.character];

    let start;
    let end;
    if (currentChar === openingChar) {
        start = position;
        end = searchForwardBracket(
            document,
            openingChar,
            closingChar,
            positionUtils.rightWrap(document, position),
        );
    } else if (currentChar === closingChar) {
        start = searchBackwardBracket(
            document,
            openingChar,
            closingChar,
            positionUtils.leftWrap(document, position),
        );
        end = position;
    } else {
        start = searchBackwardBracket(document, openingChar, closingChar, position);
        end = searchForwardBracket(document, openingChar, closingChar, position);
    }

    if (start && end) {
        return new vscode.Range(start, end);
    } else {
        return undefined;
    }
}

function createInnerQuoteHandler(
    quoteChar: string,
): (vimState: VimState, document: vscode.TextDocument, position: vscode.Position) => VimRange | undefined {
    return (vimState, document, position) => {
        const lineText = document.lineAt(position.line).text;
        const ranges = quoteRanges(quoteChar, lineText);
        const result = findQuoteRange(ranges, position);

        if (result) {
            return {
                range: new vscode.Range(
                    position.with({ character: result.start + 1 }),
                    position.with({ character: result.end }),
                ),
                linewise: false,
            };
        } else {
            return undefined;
        }
    };
}

function createOuterQuoteHandler(
    quoteChar: string,
): (vimState: VimState, document: vscode.TextDocument, position: vscode.Position) => VimRange | undefined {
    return (vimState, document, position) => {
        const lineText = document.lineAt(position.line).text;
        const ranges = quoteRanges(quoteChar, lineText);
        const result = findQuoteRange(ranges, position);

        if (result) {
            return {
                range: new vscode.Range(
                    position.with({ character: result.start }),
                    position.with({ character: result.end + 1 }),
                ),
                linewise: false,
            };
        } else {
            return undefined;
        }
    };
}

function createWordForwardHandler(
    wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: VimState, document: vscode.TextDocument, position: vscode.Position) => VimRange {
    return (vimState, document, position) => {
        const lineText = document.lineAt(position.line).text;
        const ranges = wordRangesFunction(lineText);

        const result = ranges.find(x => x.start > position.character);

        if (result) {
            return {
                range: new vscode.Range(position, position.with({ character: result.start })),
                linewise: false,
            };
        } else {
            return {
                range: new vscode.Range(position, position.with({ character: lineText.length })),
                linewise: false,
            };
        }
    };
}

function createWordBackwardHandler(
    wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: VimState, document: vscode.TextDocument, position: vscode.Position) => VimRange | undefined {
    return (vimState, document, position) => {
        const lineText = document.lineAt(position.line).text;
        const ranges = wordRangesFunction(lineText);

        const result = ranges.reverse().find(x => x.start < position.character);

        if (result) {
            return {
                range: new vscode.Range(position.with({ character: result.start }), position),
                linewise: false,
            };
        } else {
            return undefined;
        }
    };
}

function createWordEndHandler(
    wordRangesFunction: (text: string) => { start: number; end: number }[],
): (vimState: VimState, document: vscode.TextDocument, position: vscode.Position) => VimRange | undefined {
    return (vimState, document, position) => {
        const lineText = document.lineAt(position.line).text;
        const ranges = wordRangesFunction(lineText);

        const result = ranges.find(x => x.end > position.character);

        if (result) {
            return {
                range: new vscode.Range(
                    position,
                    positionUtils.right(document, position.with({ character: result.end })),
                ),
                linewise: false,
            };
        } else {
            return undefined;
        }
    };
}
