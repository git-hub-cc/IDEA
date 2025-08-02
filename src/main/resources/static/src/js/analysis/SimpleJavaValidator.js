// src/js/analysis/SimpleJavaValidator.js - 一个轻量级的Java语法校验器

const SimpleJavaValidator = {
    /**
     * @description 验证Java代码并返回一个错误数组。
     * @param {string} code - 要验证的Java源代码。
     * @returns {Array<object>} - 错误对象数组。
     */
    validate: function(code) {
        const errors = [];
        const lines = code.split('\n');
        const bracketStack = []; // 用于检查括号、花括号、方括号
        let inBlockComment = false;

        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            let inString = false;
            let inChar = false;
            let lastChar = '';

            // 预处理，移除行尾的块注释结束符
            const blockCommentEndIndex = line.indexOf('*/');
            if (inBlockComment && blockCommentEndIndex !== -1) {
                line = line.substring(blockCommentEndIndex + 2);
                inBlockComment = false;
            }

            if (inBlockComment) {
                return; // 如果整行都在块注释中，则跳过
            }

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1] || '';

                // 检查字符串
                if (char === '"' && lastChar !== '\\') {
                    inString = !inString;
                }
                // 检查字符
                if (char === "'" && lastChar !== '\\') {
                    inChar = !inChar;
                }

                // 检查注释
                if (!inString && !inChar) {
                    if (char === '/' && nextChar === '/') {
                        break; // 行注释，跳过该行剩余部分
                    }
                    if (char === '/' && nextChar === '*') {
                        inBlockComment = true;
                    }
                }

                if (inBlockComment) {
                    // 再次检查行内闭合的块注释
                    if (char === '*' && nextChar === '/') {
                        inBlockComment = false;
                        i++; // 跳过'/'
                    }
                    continue;
                }

                if (inString || inChar) {
                    lastChar = char;
                    continue;
                }

                // 检查括号匹配
                if ('({['.includes(char)) {
                    bracketStack.push({ char, lineNumber, column: i + 1 });
                } else if (')}]'.includes(char)) {
                    if (bracketStack.length === 0) {
                        errors.push(this.createError(`多余的闭合符号 '${char}'`, lineNumber, i + 1));
                    } else {
                        const lastOpen = bracketStack.pop();
                        if (!this.isMatchingPair(lastOpen.char, char)) {
                            errors.push(this.createError(`符号不匹配: 期望 '${this.getMatchingPair(lastOpen.char)}' 但得到了 '${char}'`, lineNumber, i + 1, `(在 ${lastOpen.lineNumber}:${lastOpen.column} 处打开)`));
                        }
                    }
                }
                lastChar = char;
            }

            // 检查行尾分号 (这是一个启发式规则，并不完美)
            const trimmedLine = line.trim();
            if (this.isStatementNeedingSemicolon(trimmedLine)) {
                errors.push(this.createError('语句应以分号结尾', lineNumber, line.length));
            }
        });

        // 检查未闭合的括号
        bracketStack.forEach(unclosed => {
            errors.push(this.createError(`未闭合的符号 '${unclosed.char}'`, unclosed.lineNumber, unclosed.column));
        });

        return errors;
    },

    /**
     * @description 创建标准格式的错误对象。
     * @param {string} message - 错误信息。
     * @param {number} line - 行号。
     * @param {number} column - 列号。
     * @param {string} [extra=''] - 附加信息。
     * @returns {object}
     */
    createError: function(message, line, column, extra = '') {
        const fullMessage = extra ? `${message} ${extra}` : message;
        return {
            message: fullMessage,
            startLineNumber: line,
            startColumn: column,
            endLineNumber: line,
            endColumn: column + 1,
            severity: 'error'
        };
    },

    /**
     * @description 检查括号是否匹配。
     * @param {string} open - 左括号。
     * @param {string} close - 右括号。
     * @returns {boolean}
     */
    isMatchingPair: function(open, close) {
        return (open === '(' && close === ')') ||
            (open === '{' && close === '}') ||
            (open === '[' && close === ']');
    },

    getMatchingPair: function(open) {
        if (open === '(') return ')';
        if (open === '{') return '}';
        if (open === '[') return ']';
        return '';
    },

    /**
     * @description 一个启发式函数，判断一行代码是否是需要分号结尾的语句。
     * @param {string} line - trim() 过的代码行。
     * @returns {boolean}
     */
    isStatementNeedingSemicolon: function(line) {
        if (line.length === 0) return false;
        if (line.endsWith(';') || line.endsWith('{') || line.endsWith('}') || line.endsWith('(')) return false;

        const controlKeywords = /^(if|for|while|switch|try|catch|finally|synchronized|@|class|interface|enum|public|private|protected|static|void|int|String|boolean|double|long|float|char|byte|short)\s*\(?.*\)?\s*\{?$/;
        if (controlKeywords.test(line) || line.startsWith('//') || line.startsWith('/*') || line.endsWith('*/')) {
            return false;
        }

        // 包含赋值、方法调用等常见语句模式
        const statementPatterns = /(\w+\s*=\s*.+)|(\w+\(.*\))|(\w+\.\w+\(.*\))/;
        if (statementPatterns.test(line)) {
            return true;
        }

        return false;
    }
};

export default SimpleJavaValidator;