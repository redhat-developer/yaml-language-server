export function createExpectedError(message: string, startLine: number, startCharacter: number, endLine: number, endCharacter: number, severity: number = 2) {
    return {
        message,
        range: {
            start: {
                line: startLine,
                character: startCharacter
            },
            end: {
                line: endLine,
                character: endCharacter
            }
        },
        severity
    }
}
