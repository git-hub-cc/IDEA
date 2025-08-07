/**
 * CompilationResult.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于封装单条编译结果（如错误、警告或信息）。
 * 它是一个不可变的记录(record)，设计用于在编译服务和前端之间传递结构化的诊断信息，
 * 以便在UI中清晰地展示问题所在的文件、行号和具体信息。
 */
package club.ppmc.idea.model;

/**
 * 代表一条编译或静态分析的诊断信息。
 *
 * @param type 结果类型 ("ERROR", "WARNING", "INFO")。
 * @param message 具体的诊断信息文本。
 * @param filePath 产生问题的源文件的相对路径。
 * @param lineNumber 问题所在的行号 (基于1)。
 * @param columnNumber 问题所在的列号 (基于1)。
 */
public record CompilationResult(
        String type, String message, String filePath, Integer lineNumber, Integer columnNumber) {}