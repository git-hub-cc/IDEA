/**
 * AnalysisResult.java
 *
 * 该文件定义了一个数据传输对象 (DTO)，用于封装后端对Java源代码的静态分析结果。
 * 它是一个不可变的记录(record)，聚合了成功解析出的类名列表和解析过程中发现的编译错误列表。
 * 主要由 JavaStructureService 生成并由 JavaController 返回给前端。
 */
package club.ppmc.idea.model;

import java.util.List;

/**
 * 封装后端代码分析结果的DTO。
 *
 * @param classNames 成功解析出的完全限定类名列表 (e.g., "com.example.MyClass")。
 * @param errors 解析过程中发现的语法或语义错误列表。
 */
public record AnalysisResult(List<String> classNames, List<CompilationResult> errors) {}